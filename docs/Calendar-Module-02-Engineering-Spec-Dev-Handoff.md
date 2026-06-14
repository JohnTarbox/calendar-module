# Calendar Module — Engineering Spec & Developer Handoff

**Status:** Draft v1.3 · **Filed:** 2026-06-14 · **Owner:** John · **Author:** Claude
**Companion:** `Calendar-Module-01-Google-Display-Reference-Spec.md` (the display behavior this engine implements).
**Related:** `MMATF-UIUX-Calendar-Spec.md` (original greenlit /events rebuild) · `Cadence-Expander-Log-2026-06-13.md` (the recurrence data prerequisite, now done).

This document is the buildable spec for a reusable, Cloudflare-native, agent-ready events-calendar module. It is the product of a full design review; every section reflects a locked decision.

> **Revision note (v1.1, 2026-06-14):** incorporates the Spec Review & Punch-List (`Calendar-Module-03-…`). Key changes: added §0 walking skeleton + build fence; contract gained `recurrenceSummary`, `defaultDurationMinutes`, `displayTimeZone`, stable-occurrence-id and ongoing-predicate rules; category-visibility moved into core state; MCP write surface retained as the **authoritative** calendar-write path (boundary defined); `lint_calendar` moved to MMATF, module exposes generic `validate_event`; Custom view scoped to v2; tz/SSR, a11y, data-window, and `.ics`/VTIMEZONE sections sharpened.
>
> **Revision note (v1.2, 2026-06-14):** self-review hardening pass — fixed §9 subsection numbering (was 9a,9b,9f,9c…); added `weekStartsOn`/`locale`/`showWeekNumbers` to `CalendarConfig`; pinned **all-day `end` = exclusive** (DTEND) + off-by-one property test; added contract forward-compat (ignore-unknown) rule; added effort/T-shirt sizing to §12; added category-visibility to the architecture diagram. Companion RS gained a fetch-error state, Add-to-calendar action, and week-start controls.
>
> **Revision note (v1.3, 2026-06-14):** applied the independent adversarial review (`Calendar-Module-04`, 6×S1/9×S2/7×S3). Contract: added `location`/`mapUrl` (S1-1), `occurrences[]` sorted-ascending requirement (S1-6), the `(allDay,end)` span table (S2-5), split `validateEvent`/`validateWindow` (S2-6), engine-vs-host field list (S1-1), ISO week-number basis (S3-4). Engine/arch: `ongoing` excluded from ribbon packing (S1-2); "+N more" per-cell semantics (S2-4); two-tz precedence rule (S2-1); invalid-`displayTimeZone` = hard deploy error + render guard (S2-9); cache keys exclude client-side filters (S2-2); Agenda composite cursor (S2-3); core-owns-a11y / skins-bind-only (S2-7); MCP write-authority gated on an invariant table (S2-8); Year per-day presence endpoint (S1-4). Plus hygiene: WCAG 2.2 named, rrule/python-dateutil bundling confirmed from the LICENCE file, cross-ref fixes. RS corrected the keyboard grounding (S1-3) + added empty-day/click-precedence/print-defer/loading-AC.

---

## 0. v0 Walking Skeleton — BUILD THIS FIRST

The sections below are *locked decisions*, not a single work order. Do **not** attempt to build all of them at once — that yields a sprawling, half-finished monorepo. The first Claude Code session builds **one vertical slice, shipped on real runtime**, then stops:

**v0 slice:** `CalendarEvent` contract + Zod validator + contract tests → headless **Month** engine (occurrence model + lane-packing + ribbon×overflow rule **RS §10a-bis** + ongoing predicate) → **React Month skin** (themed) → **MMATF adapter** (`events`+`event_days` → contract) → **windowed D1 endpoint** (Sessions API) → **SSR on the real `/events` data** in a Cloudflare preview deploy.

That is the v0 finish line (= §12 step 7). It proves the contract, the engine's hardest algorithm, the adapter seam, and the Cloudflare runtime in one shippable increment.

**Do NOT build in the first pass** (committed direction, fenced off until after v0):
- Web component (v2)
- Schedule + Year views (v1 but after Month proves out)
- Week/Day time-grid + Custom view (v2)
- MCP server — read **or** write (post-v0)
- Companion Cowork skill (post-v0)
- Deploy-to-Cloudflare template + Cowork plugin (post-v0)
- Full DAST / visual-regression infra (wire CI gates early, but don't gate v0 on them)

Everything past v0 follows the §12 sequence.

---

## 1. Goal & strategy

Build a **reusable, data-agnostic events-calendar module** (not an MMATF-only component). MMATF is the **first consumer and reference implementation** that dogfoods it.

- **Primary (B):** other sites run the calendar on **their own** events via a thin adapter to a shared data contract.
- **Secondary (A), kept cheap:** syndicating *MMATF's* events into other sites — falls out almost free because the data source is a pluggable strategy; A is just one more adapter over the existing SYN1/SYN2 syndication feed.
- **Runtime:** **Cloudflare only.** We drop multi-host hedging in the data/serving layer and lean into edge primitives. The npm UI package stays free of Cloudflare imports (the contract is the seam), so it remains portable; the backend/MCP are Cloudflare-native.

### Non-goals
- No authoring/editing (display-only browse calendar). No drag-to-create, no invitations.
- No cross-instance/cross-window interaction (impossible on the web anyway); data crosses instances only via `.ics` export and (path A) the syndication feed.

---

## 2. Architecture — one core, three faces

```
                ┌──────────────────────────────┐
                │  Headless core (framework-    │
                │  agnostic TypeScript)         │
                │  • occurrence model           │
                │  • lane-packing / collision   │
                │  • ongoing-strip rule         │
                │  • .ics generation            │
                │  • view math (Luxon)          │
                │  • a11y/keyboard state model  │
                │  • category-visibility/filter │
                └──────────────┬───────────────┘
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
 React skin (v1)        Web component (v2)      MCP server
 + default styles       (wraps core)            (docs + ops)
        │                      │                      │
        └─────── all consume the same CalendarEvent contract ───────┘
                               │
                   Per-site DATA ADAPTER → contract
                   (MMATF adapter = reference)
```

- **Headless core:** pure TS, **no React, no DOM, no Cloudflare**. All the hard, testable logic lives here so it's portable to the web component and the MCP server.
- **Core state model (lives in the core, not the skin):** current view, focused date/cell, popover state, and — importantly — **category visibility / active filter set**. The legend-filter behavior (RS §6: "unchecking a category removes its events from every view; persists across view switches") is **view-spanning state**; it must live in the headless core so it's reusable and survives the web-component path. The skin/host binds UI (sidebar, legend) to this core state; it does not own it.
- **React skin (v1 target):** default styled component built on the core; themeable via tokens.
- **Web component (v2):** thin wrapper over the core for non-React hosts. **It does NOT re-implement a11y** (that would fork it, S2-7) — the core owns the a11y state model + key-handling logic and exposes an imperative a11y API; the web component, like the React skin, supplies only the thin **DOM binding** (attach listeners, apply the `tabindex`/ARIA attributes the core computes). React Aria was evaluated and rejected — see §4.
- **MCP server:** a third consumer of the same core (§9).
- **The seam is the `CalendarEvent` contract** (§5) — versioned, the public API everything codes against.

---

## 3. View & feature phasing

- **v1:** Month + Schedule(Agenda) + Year. (Month = desktop default, Schedule = mobile default; remember last-used.) These are the cheap, high-value views. (Within v1, Month ships first per §0.)
- **v2:** Week + Day time-grid (the expensive part — collision layout — and least useful for all-day events); **Custom view** (configurable N-day range, default 4 days — see RS §2a); the now-line (Week/Day only); and the web-component delivery target.
- Engine designed from day one to accept the time-grid + Custom views without refactor.
- **Now-line is a v2 concern** (Week/Day only); the v1 Month build renders no now-line.

---

## 4. Build-vs-library & a11y decisions (locked)

- **Own the engine** — no FullCalendar / react-big-calendar. Rationale: clean SSR (those are client-only), no theming/license/shadow-DOM lock-in, full control of the contract. Cost we accept: we build view layouts and a11y ourselves.
- **No React Aria.** Evaluated; rejected because it is React-only and would push a11y/keyboard logic into the React layer, undermining the framework-agnostic core and the v2 web-component reuse. Instead **hand-roll a small, focused a11y layer in the core** (grid roving-focus, popover focus-trap, keyboard map) and de-risk it with axe + thorough keyboard tests. The read-only surface is contained enough to make this viable. **Boundary (S2-7):** the core owns the a11y **state model + key-handling logic** and exposes an **imperative a11y API** (the attributes/focus targets to apply); each skin (React, web component) provides only the **DOM binding** over that API — so both skins bind identically and a11y never forks.
- **Date/time:** **Luxon** (best timezone support; B will be multi-tz).
- **Recurrence input:** **explicit occurrences are canonical**; the engine only ever renders concrete instances. **RRULE support is an optional adapter-side utility** (`expandRRULE(rule, window)`) shipped alongside the engine, never inside it. MMATF passes explicit `event_days`, so no RRULE machinery is involved for the first consumer.
- **Windowed data loading is mandatory** — the engine/adapter fetch only the visible range as the user pages; open-ended recurrences have no finite list.

### 4a. Data window per view (decide before each view's phase)

| View | Window fetched | Payload |
|---|---|---|
| Month | the covering weeks (incl. leading/trailing adjacent-month days) | full event payloads |
| Week / Day (v2) | the visible day(s) | full payloads |
| Custom (v2) | the N-day range | full payloads |
| **Year (v1)** | 12 months | **per-DAY presence map** (S1-4) — a cheap **`has_events(day)`** date-set/bitmap, **not** full payloads (RS §4 dots *individual days*, so month-level booleans are insufficient); hydrate a day's payload on click → day popover |
| **Schedule/Agenda** | rolling window from "now" | **scroll-to-load pagination** |

- **Agenda pagination contract (S2-3):** initial window = N days from today; on scroll-near-end, fetch the next page with a **composite keyset cursor `(start, occurrenceId)`** compared strictly (`>`), so a date with more events than a page never dup/drops at a page boundary; empty-tail = "no more upcoming events" sentinel, stop paging. Define page size + cursor in the data API. **[test]** a date with > pageSize events paginates with no duplicate and no dropped occurrence.
- Year's presence endpoint and Agenda's paginated endpoint are distinct Worker routes from the Month window endpoint; spec all three before their phases.

---

## 5. The `CalendarEvent` contract (versioned public API)

Stabilize early; treat as SemVer (breaking change = major). Sketch (to be finalized in code with Zod for runtime validation + contract tests):

```ts
interface CalendarEvent {
  id: string;                 // stable + unique across windowed loads
  title: string;
  category?: string;          // drives color via the theme's category map
  url?: string;               // "view event page"; Zod validator IS the protocol allowlist (block javascript:/data:)
  recurrenceSummary?: string; // adapter-supplied human string ("Every Saturday through Oct 31").
                              // The engine DISPLAYS this; it NEVER computes it from occurrences.
  occurrences: Occurrence[];  // recurrence pre-expanded to concrete instances; MUST be sorted ascending by start
                              // (validator-enforced — §6 property test). Enables "next upcoming" selection (S1-6).
  ongoing?: boolean;          // explicit override. If absent, derived: TRUE iff ANY single occurrence has
                              // (end - start) > 14 days (strict >). Independent of occurrence count.
                              // ongoing===true ⇒ renders as the "Ongoing" strip and is EXCLUDED from ribbon
                              // lane-packing (see RS §10a/§11; property-tested: 1 strip, 0 ribbon segments).
}
interface Occurrence {
  id: string;                 // stable + unique per occurrence across loads (lane-packing determinism, §10a)
  start: string;              // ISO 8601 with offset OR date-only for all-day
  end?: string;               // ISO 8601; optional. Timed events with no end default to defaultDurationMinutes (config).
  allDay: boolean;            // date-only/all-day occurrences are FLOATING: never shift day under a different displayTimeZone
  timezone?: string;          // IANA; required for timed multi-tz correctness (render wall-clock; see §8 precedence)
  location?: string;          // display label, e.g. "Venue Name, Town" — ENGINE-rendered (Agenda rows, popovers). Per-occurrence (a series can move venues).
  mapUrl?: string;            // "Get directions" target; same Zod protocol allowlist as `url`
  openTime?: string; closeTime?: string; // local wall-clock display hints
  note?: string;
}
// Instance config (per tenant/deployment, resolved server-side):
interface CalendarConfig {
  displayTimeZone: string;    // IANA, REQUIRED. The single tz for day-bucketing, today-disc, now-line.
                              // Resolved per tenant/instance; NEVER inferred from runtime (Workers Date is UTC).
                              // MUST be resolvable at SSR render time (see §8 SSR constraint).
  defaultDurationMinutes?: number; // default 60; applied to timed occurrences lacking `end`
  categoryColors?: Record<string,string>;
  weekStartsOn?: 0 | 1;       // 0 = Sunday (US default), 1 = Monday. Drives the Month grid + weekday header. (i18n)
  locale?: string;            // BCP-47 (default "en-US"); date/number formatting via Luxon
  showWeekNumbers?: boolean;  // optional Month/Week affordance (Google parity); default false.
                              // Basis: ISO-8601 week-of-year via Luxon (aligns with weekStartsOn=1); document the one case in a test.
}
```

Notes:
- **Timezone:** per-occurrence `timezone` handles *timed-event correctness*; the instance-level `displayTimeZone` handles *which day an event buckets into*, the today-disc, and the now-line. The engine never infers tz from the runtime — critical on Cloudflare Workers, where `Date` is always UTC. See §8 for the SSR-stability constraint.
- **All-day events are floating:** date-only occurrences carry no tz and must render on the same calendar day regardless of `displayTimeZone` (iCalendar rule). Property-tested.
- **Stable ids + two validators (S2-6):** both `CalendarEvent.id` and `Occurrence.id` must be stable + unique across windowed loads, or lane-packing (§10a) isn't deterministic. **Two validators, two scopes:** **`validateEvent(e)`** = per-event shape + URL/`mapUrl` protocol allowlist (this *is* the MCP `validate_event` tool, §9b); **`validateWindow(events[])`** = array-level — id-uniqueness within the window **and** `occurrences[]` sorted-ascending. `validateWindow` runs in the data/adapter layer + tests; the per-event tool can't assert cross-event uniqueness.
- **`recurrenceSummary` is display-only** — adapter-supplied; the engine renders it verbatim and **never reconstructs the recurrence *rule/summary*** from `occurrences[]`. (Reconciliation, S1-6: the engine *does* read `occurrences[]` for display selection — day-bucketing, the `ongoing` predicate, "next upcoming" — so the blanket "never computes from occurrences" means only "never regenerates the human recurrence summary," not "never reads occurrences.")
- **"Next upcoming" (S1-6):** when the clicked occurrence is in the past, the popover shows the first occurrence with `start >= now` (relies on the sorted `occurrences[]`). **Best-effort over loaded windows:** if the next instance isn't loaded, fall back to `recurrenceSummary` if present, else omit the line — **never** fire a synchronous fetch from the popover.
- **All-day `end` is EXCLUSIVE** (iCalendar DTEND convention): a single-day all-day event has `end` = next day (or omit `end`); a 3-day all-day event Fri–Sun has `end` = Mon. Lane-packing and `.ics` (`VALUE=DATE`) both depend on this — state it once, and **property-test the off-by-one** (a 3-day event covers exactly 3 cells, not 2 or 4). Timed `end` is inclusive of the instant.
- **Span resolution table (S2-5)** — `(allDay, end present?)` → span:

  | allDay | end | resulting span |
  |---|---|---|
  | true | present | start day … (end − 1 day) inclusive (DTEND exclusive) |
  | true | omitted | single day (start) |
  | false | present | start → end (inclusive instant) |
  | false | omitted | start → start + `defaultDurationMinutes` (default 60) |

  A timed default-duration span that **crosses midnight** (e.g., 23:30 + 60m) occupies **both** days and ribbons accordingly — add this case to the fuzz corpus.
- **Engine-rendered vs host-slot fields (S1-1):** fields the **engine** renders (must be in the contract): `title`, `category`, `occurrences[]` (with `start/end/allDay/timezone/location/openTime/closeTime`), `recurrenceSummary`, `url`, `mapUrl`. Host-**slot** content (may be out-of-band, supplied by the skin/host): the favorite/action slot, and any custom fallback copy. Location/hours are **engine-rendered → in the contract**, not a side channel.
- **Forward-compatible:** consumers ignore unknown fields; the validator **warns (not errors)** on unknown keys, so additive contract changes stay minor-version.
- The contract carries **no MMATF-isms** (no `event_days`, no D1 ids, no price/hero concepts). MMATF's adapter maps `events` + `event_days` → this shape.
- Provide a published **JSON schema** + **Zod validator**, and make the validator the single home of the **URL protocol allowlist** (§7) so the contract and render-safety rule are enforced in one place. The module exposes a generic **`validate_event`** (contract conformance) as both a test-fixture gate and an MCP tool; opinionated content lints live in MMATF (§9).

---

## 6. Testing strategy (TDD + property + fuzz)

The spec is written first; **each Reference-Spec rule and `[AC]` becomes a named test** — the spec is the test backlog.

- **Core logic: full TDD.** Vitest, red-green-refactor from the spec. **Property-based tests (fast-check)** for algorithm invariants:
  - lane-packing: "no overlap in a lane; all placed or counted in +N more; deterministic given stable ids"
  - **ribbon × overflow (RS §10a-bis): "no multi-day event is partially visible across a week-row"** (visible in all its cells or none)
  - occurrence expansion: "within bounds + window; idempotent"
  - collision layout (v2)
  - **ongoing predicate: TRUE iff any single occurrence span > 14d (strict); assert exact-14d boundary = not ongoing**
  - **all-day floating: an all-day occurrence renders on the same day under any `displayTimeZone`**
  - **determinism: identical input + window ⇒ identical layout, across repeated/windowed loads (relies on stable occurrence ids)**
  - **navigation round-trips: Next→Previous, view-switch→switch-back, and mini-month-jump→Today each return to the identical anchor period/range** (three distinct code paths, per RS §1)
- **Targeted fuzzing at untrusted boundaries** (B = hostile input; library renders third-party data on a host page → robustness/DoS safeguard):
  - **RRULE expander** — malformed/adversarial/unbounded rules; enforce a hard occurrence cap (DoS guard).
  - **`CalendarEvent` ingestion** — garbage objects (end<start, NaN, century-spans, 10k overlaps) must degrade gracefully, never hang.
  - **Timezone/DST** — random date×zone through Luxon (spring-forward gaps, boundaries).
  - **`.ics` generation** — fuzz field contents for **ICS injection** (newline/`;`/`,` breakout); output must always be valid + non-injectable.
  - **Corpus seeded from real MMATF quirks** — stale-year, end<start, midnight-UTC anchor, "Farmington shape," 98-day flat ranges. (See the cadence-expander log.)
- **React skin:** behavioral tests (React Testing Library) written test-first from the spec; **axe** (vitest-axe) for **WCAG 2.2 AA** a11y (the target version, stated once here + RS §8b); **visual regression** (Chromatic/Playwright) for pixel parity (not TDD).
- **Worker/data layer:** **`@cloudflare/vitest-pool-workers`** runs tests inside the real **workerd** runtime (runtime parity; resolves the "test in real runtime" requirement). Local `TZ=UTC` makes tz tests deterministic.
- **CI gates:** typecheck → lint → unit/property → a11y → visual → bundle-size budget → build. Property/fuzz run **fixed-seed on PRs** + **nightly random-seed**; persist any failing seed as a permanent regression.

---

## 7. Security

**Threat model (calibrated to a read-only calendar):** #1 risk is **rendering untrusted third-party event data** (XSS via titles/descriptions/links); then ReDoS, prototype pollution, DoS-by-pathological-data, supply chain.

**Hard requirement (render safety):** React escapes text by default → **never `dangerouslySetInnerHTML` on untrusted content; allowlist link protocols** (block `javascript:`/`data:`); if HTML must render, **DOMPurify**. Guard config/JSON merges (prototype pollution can defeat DOMPurify).

**Tooling — library (mostly free, CI-gated):**
- SAST: **CodeQL** (free on public repo, TS taint tracking) + **Semgrep** (custom rules).
- Lint: `eslint-plugin-security` + **`eslint-plugin-no-unsanitized`**.
- SCA/supply-chain: **Socket** (malicious-package/behavioral) + **OSV-Scanner**/OWASP Dependency-Check + **Dependabot** + `npm audit`; commit lockfile, **`npm ci` only** in CI.
- Secrets: **Gitleaks**/TruffleHog + push protection.
- ReDoS: **`recheck`** against RRULE/parse regexes.
- Security unit/fuzz tests: URL-protocol allowlist, `.ics` escaping, prototype-pollution, adversarial-data robustness.
- Publish with **provenance / OIDC Trusted Publishing** (no long-lived npm tokens); emit **SBOM** (SPDX/CycloneDX); **license scanning** in CI.

**Tooling — MMATF/serving layer:** **OWASP ZAP** DAST against `/events` + the public API; **CORS scoping, tenant-keying, rate-limiting** on the public read endpoint; **Cloudflare WAF + Rate Limiting + Access** (§8).

---

## 8. Cloudflare-native architecture (optimize + showcase)

- **SSR:** `@opennextjs/cloudflare` (already in use) → edge SSR, indexable HTML. Engine must be **SSR-safe**: no `window`/`document` at import or render; the **"now/today" value must render stable on server + first client paint, then update post-mount** (Workers `Date` is always UTC — the display tz is always passed in explicitly, never inferred).
- **`displayTimeZone` + SSR-stability constraint (load-bearing for B):** the today-disc, the Today-button disabled state, and the now-line all depend on a single instance `displayTimeZone` (§5). SSR-stable "now" **only holds if `displayTimeZone` is resolvable server-side** (tenant-fixed or cookie-pinned). A **viewer-derived/browser tz is incompatible with SSR-stable now** — it would hydrate-mismatch the today-disc and Today-button state. Documented as a hard constraint: instances that need per-viewer tz must accept a client-only "now" (no SSR claim) for those elements. MMATF is fixed `America/New_York`, so it's moot for the first consumer.
- **All-day day-bucketing** uses `displayTimeZone` only for *timed* occurrences; date-only/all-day occurrences are floating and bucket by their literal date (never shifted). Property-tested.
- **Two-tz precedence rule (S2-1):** a timed occurrence **buckets into the day in `displayTimeZone`**, and its **wall-clock time is rendered in `Occurrence.timezone`** (falling back to `displayTimeZone` when absent). So a `2026-07-04T20:00-05:00` (`America/Chicago`) occurrence under a `America/New_York` display buckets by NY day but shows Chicago clock time. **[property test]** a cross-tz timed occurrence near midnight buckets on the `displayTimeZone` day.
- **Invalid/unresolvable `displayTimeZone` (S2-9):** it is a **hard config error at the build/deploy boundary** (Zod IANA-validity check fails the deploy, not the request) **and** a render-time guard renders the fetch-error/empty state rather than throwing a 500/blank page. Never silently fall back to UTC (that's the silent wrong-day bug the tz model exists to prevent). **[worker test]** a bad zone fails deploy; a guard path renders the error state.
- **DST (v2):** the now-line formula (`minutesSinceMidnight/1440`) drifts ~1h on DST-transition days (1380/1500-minute days). Compute against the actual day length in `displayTimeZone` via Luxon, not a fixed 1440. Tagged to the Week/Day phase; the fuzz corpus already includes spring-forward.
- **Data API (Worker):** windowed events endpoint reading **D1 via the Sessions API / read replication** (lower global read latency at no extra cost, sequential consistency via bookmarks). Consider **Smart Placement** if D1-bound.
- **Edge caching (S2-2):** the edge caches **unfiltered windows** — key = **window + tenant + cache-epoch** (NOT category filters: filtering is client-side core state per RS §6, so keying on it collapses the hit rate into the power-set of categories). Category visibility is applied **client-side** from core state. **Cache API + Tiered Cache**, `s-maxage` + `stale-while-revalidate`; **invalidate via the existing syndication change signal** (outbox→Queue consumer bumps the KV cache-epoch). "Cache-on-read, invalidate-on-change" reusing infra you already operate. (If any *server-side* filtering is ever added, e.g. tenant scoping, name exactly which dimensions key the cache.)
- **Images:** Cloudflare Images / R2 + Image Resizing (`/cdn-cgi/image`) — responsive `srcset`, AVIF/WebP, driven by the **stored focal points** (`image_focal_x/y`). Reuses `cdn.meetmeatthefair.com`.
- **KV:** per-tenant theme/category config + feature flags. **`.ics`** as a cached Worker route.
- **Security:** WAF, Rate Limiting (existing `RATE_LIMIT_KV`), CORS at the Worker, Turnstile if any interactive endpoint, **Access** for admin/MCP-write (§9).
- **Testing:** `@cloudflare/vitest-pool-workers` (workerd parity); Wrangler/Vite + Miniflare for local.
- **Lean by design:** no Durable Objects / Workers AI / Vectorize for a read-only calendar (would be showcase-for-its-own-sake) — except the MCP server's optional DO-RPC transport (§9).

---

## 9. MCP layer (agent-ready) + companion skill

The MCP server is the **third face** of the same core/contract, hosted as a Cloudflare Worker via the **Agents SDK `McpAgent`**, **Streamable HTTP** transport (Cloudflare-recommended over SSE, auto-fallback). Two surfaces matching the two goals:

### 9a. Documentation surface (read-only, safe)
- MCP **resources** + a `search_docs` tool exposing the integration docs, the `CalendarEvent` schema, adapter guide, theming, recipes — **auto-generated from TSDoc/contract types** so they never drift.

### 9b. Calendar-operations surface
- **Read (v1):** `query_events(window, filters)`, `get_event`, `list_event_days`, `export_ics`, and a **generic `validate_event`** (contract conformance only).
- **Write (v2, Access-gated):** `create_event`, `update_event`, **`expand_cadence`** ⭐, `merge_events`, `set_event_days`, `set_status`.

**Authoritative-write-path resolution (decision 2026-06-14):** the module's MCP write surface is **retained and designated the authoritative path for event / event_days writes.** To resolve the dual-source-of-truth hazard the review raised: when MMATF deploys the module, **the module's calendar-write tools ARE MMATF's calendar-write tools** — MMATF's existing broader MCP (`mcp__b3561712…`) keeps its non-calendar scope (vendors, blog, SEO, syndication) but **cedes event/event_days mutation to the module's tools.** Document this boundary in both MCP servers so two tools never write the same row. Migration: MMATF's current calendar-write tools become thin wrappers over (or are replaced by) the module's, sharing the same core.

**Prerequisite before this is locked / before the v2 write phase (S2-8):** "thin wrapper over the same core" collides with "no MMATF-isms," because MMATF's existing write tools encode hard-won invariants — **wrong-echo-under-concurrency (re-read, never trust the echoed id), idempotent composite `event_days` ids, citations-required on date/price writes, midnight-UTC anchor handling (`suggest_event` T12:00:00Z), merge preview-not-wired.** Build a **per-invariant table** deciding for each: *generic enough → lives in the module core* vs *MMATF-specific → stays in MMATF's adapter/wrapper* (citations, midnight-anchor, source-trust almost certainly stay MMATF-side). **Do not designate the module authoritative until that table exists** — otherwise the migration silently regresses these protections.

**`lint_calendar` is NOT in the module (decision 2026-06-14).** The opinionated audit (flat-range recurring, stale-year, NULL-price-shows-TBD, duplicate pairs, missing hero) is **MMATF-specific** (price/hero are MMATF concepts) → it lives in **MMATF's own MCP/skills**, alongside the existing `event-verification`/`event-discovery`. The reusable module exposes only the generic `validate_event`. An adapter may register its own extra lint rules, but the module ships none.

### 9c. `.ics` export — scope + correctness (not just non-injection)
- **Scope:** `export_ics` parameter selects one of: a **single event** (all its occurrences as VEVENTs), a **single day**, or the **visible window**. Default = single event.
- **Correctness ACs (beyond the injection fuzzing in §6):**
  - Timed occurrences emit a proper **VTIMEZONE** component (TZID alone is insufficient for importers) using the occurrence `timezone`/instance `displayTimeZone`.
  - All-day occurrences use **`VALUE=DATE`** (floating, no tz).
  - Recurring events emit one VEVENT per occurrence (or an RRULE if the adapter supplied one) — never one VEVENT spanning the whole range.
  - **Round-trip AC:** an exported file imports into Apple Calendar and Outlook with correct local times and correct days.

### 9d. Disciplines baked into tool contracts (hard-won this session)
- **Preview/dry-run on destructive ops** (merge already has it); confirm via **MCP elicitation** (Cloudflare-supported, durable-storage-backed).
- **Verify-by-read, never trust the echo** (the wrong-echo-under-concurrency bug).
- **Citations required** on date/price writes; **idempotent** writes (composite `event_days` ids); **windowed** reads; **audit-log** every mutation.

### 9e. Phasing & auth
- **v1 = read-only** (docs + query + lint): immediately useful, zero write-risk, public-readable.
- **v2 = authenticated writes** behind **Cloudflare Access** (Access runs the full OAuth flow; the server implements no auth logic). Rate-limited + WAF-fronted.
- Optional **DO-RPC transport** if MMATF's own agent connects in-runtime (no network hop).

### 9f. Companion Cowork skill (in scope)
Ship a **skill that encodes the safe-workflow playbook** (expand only discontinuous events; verify against the organizer before writing; preview before merge; lint→fix), orchestrating the MCP tools — like MMATF's existing `event-verification`/`event-discovery` skills. Turns "Claude has calendar tools" into "Claude manages a calendar safely."

---

## 10. Packaging & distribution (A+B+C, public)

One **monorepo** (Changesets, SemVer) produces three channels, each artifact in its natural form:

- **(A) npm packages** — `@yourorg/calendar-core` (headless), `@yourorg/calendar-react` (skin), shared contract types. ESM-first, statically-analyzable exports, `.d.ts`, `sideEffects` precise, `exports` map, **separate entry points** (`/core`, `/react`, `/styles`) for tree-shaking; **React as a peer dep**; bundle-size budget in CI.
- **(B) Deploy-to-Cloudflare template** — Worker (SSR app + windowed data API + MCP server) + D1 schema + `wrangler` config; depends on the npm packages. One-click adoption for Cloudflare-hosted consumers.
- **(C) Cowork plugin** — bundles the **companion skill + MCP connection** for native install; marketplace-distributable.

MMATF consumes the npm packages + deploys its own instance of the template.

### License & contribution (locked)
- **License: Apache-2.0** — permissive (max adoption) **plus explicit patent grant + trademark clarity** (fits a company-associated public product). `LICENSE` + `NOTICE`, **SPDX identifiers** in every `package.json`, **CI license scanning** to keep all deps permissive.
- **Contributions: DCO** (`Signed-off-by`), no CLA.
- **Public** repo. Standard hygiene: `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, README + license badge.
- **Dependency stack confirmed all-permissive (2026-06-14):** React, Luxon, date-fns (if used), fast-check = **MIT**; **rrule.js = BSD-3-Clause** — verified by reading its LICENCE file, **which itself contains the python-dateutil BSD-3-Clause notice** ("./rrule.js … is based on python-dateutil"), confirming incorporation (not just a dependency). All compatible with Apache-2.0 distribution. BSD-3-Clause requires retaining the copyright notice → carry **both** the rrule.js and python-dateutil notices in `NOTICE`/third-party-licenses. (Re-confirm from `node_modules` at install time as the point-in-time CI license gate, not just this manual check.)

---

## 11. Build & integration plan (build standalone → integrate into MMATF)

Build the module in its **own repo** (protects the clean boundary; MMATF assumptions can't leak). Develop/test against **fixture data conforming to the contract** — no production data needed.

**Lifecycle:** standalone repo → build + unit/property/fuzz/a11y test against fixtures → publish (npm) / deploy (template) → **MMATF integration**: write the adapter (`events` + `event_days` → `CalendarEvent[]`), theme tokens, windowed data endpoint, wire `/events` + SSR → **integration pass on real data + real runtime** (D1 schema reality + OpenNext/Cloudflare edge SSR verified in a preview deploy) → ship.

**Two caveats so isolation doesn't bite:**
1. **Lock & version the `CalendarEvent` contract early** (SemVer; contract tests first).
2. **Fixtures can't be the final test** — do a real-data + real-runtime (workerd/OpenNext) integration pass before shipping.

**Dev environment:** build under **WSL2** (CI/prod parity — case-sensitivity, line endings, file-watcher reliability), **repo on the Linux filesystem** (not `/mnt/c`), edited via **VS Code Remote-WSL**.

---

## 12. Effort & sequencing (rough)

Sizes are **rough T-shirt estimates for a from-scratch build** (S ≈ ≤1 day, M ≈ 2–4 days, L ≈ 1–2 weeks); recalibrate down once the keystone exists. The **highest-risk item is step 3** (lane-packing + ribbon×overflow + hand-rolled a11y) — budget the most slack there. **Steps 1–4 + 7 = the v0 walking skeleton (§0); steps 5–6 and 8 are post-v0.**

| # | Step | Size | Phase |
|---|---|---|---|
| 1 | **Scaffold monorepo** — Changesets, Vitest, vitest-pool-workers, ESLint-security, CodeQL/Semgrep, Apache-2.0/DCO, Storybook | S–M | v0 |
| 2 | **Contract + Zod validator + contract tests** (lock the seam) | S | v0 |
| 3 | **Headless core (TDD)** — occurrence model, Month lane-packing + ribbon×overflow, ongoing rule, `.ics`, a11y/keyboard model, Luxon view math; property + fuzz alongside | **L (riskiest)** | v0 |
| 4 | **React Month skin** — theming tokens; axe + visual tests (Schedule + Year follow after Month proves out) | M | v0 |
| 7 | **MMATF integration** — adapter + theme + windowed D1 endpoint + SSR; real-data/real-runtime pass; ship `/events` (**v0 finish line**) | M | v0 |
| 5 | **Cloudflare backend template** — windowed D1 (Sessions API) + Cache API + Images; workerd tests | M | post-v0 |
| 6 | **MCP server v1 (read-only) + docs resources**; **companion skill** | M | post-v0 |
| 4b | **Schedule + Year views** (Agenda pagination, Year presence endpoint) | M | v1 |
| 8 | **v2** — Week/Day time-grid + collision layout; Custom view; web component; MCP write tools behind Access | L | v2 |

(Sequencing rows are grouped by dependency, not strict numeric order — note v0 runs 1→2→3→4→7.)

---

## 13. Decisions log (all locked 2026-06-13/14)
Goal B-primary (A cheap) · React-first, web component later · own engine (no FullCalendar) · headless core + skin · display-only · v1 Month/Schedule/Year, v2 Week/Day · occurrences canonical, RRULE optional adapter helper · Luxon · windowed loading · TDD + property + targeted fuzz (real-data corpus) · hand-rolled a11y (no React Aria) · security threat-model + free CI tooling + render-safety rule · Cloudflare-native (D1 Sessions/replication, Cache API + syndication-invalidation, Images w/ focal points, KV, Access, vitest-pool-workers) · MCP third face (v1 read / v2 Access-gated write) with preview+elicitation+verify-by-read · companion Cowork skill · packaging A+B+C monorepo, public · Apache-2.0 + DCO · build standalone (WSL2) → integrate into MMATF with contract-locked seam + real-data/runtime pass.

**Review-driven additions (v1.1, 2026-06-14, from Calendar-Module-03 punch-list):** v0 walking skeleton + build fence (§0) · `recurrenceSummary` (display-only) + `defaultDurationMinutes` + `displayTimeZone` (required config) + stable occurrence ids + ongoing predicate pinned (>14d strict, single occurrence) · category-visibility is **core state** · ribbon×overflow rule (all-cells-or-none) · day-granular grid focus + named keyboard/focus ACs beyond axe · data-window-per-view table + Agenda pagination + Year presence-endpoint · `.ics` scope + VTIMEZONE/VALUE=DATE + round-trip AC · all-day floating + DST(v2) now-line · **MCP write surface RETAINED as authoritative calendar-write path (boundary defined vs MMATF's broader MCP)** · **`lint_calendar` → MMATF; module ships generic `validate_event`** · **Custom view scoped to v2 (configurable N-day, default 4)** · Zod validator is the single URL-allowlist · date verified actually 2026-06-14 (review's future-dated nit was inverted).
