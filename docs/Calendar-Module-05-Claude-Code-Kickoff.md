# Calendar Module — Claude Code Kickoff Brief (v0)

**For:** a fresh Claude Code session on the build machine (WSL2). **From:** the Cowork design/spec phase. **Date:** 2026-06-14.
**This machine is air-gapped from the design machine and from MMATF production.** Everything you need is in this brief + the attached specs. Do not assume network access to MMATF's D1 or repo.

## What you're building
A **reusable, data-agnostic, headless TypeScript/React events-calendar module**, Cloudflare-only, display-only. The two attached specs are authoritative — **build to them, do not re-derive decisions**:
- `Calendar-Module-01-Google-Display-Reference-Spec.md` (**RS**) — the display behavior.
- `Calendar-Module-02-Engineering-Spec-Dev-Handoff.md` (**ES**) — architecture, contract, testing, Cloudflare, packaging, decisions log.
- `Calendar-Module-04-Adversarial-Review-v1.2.md` — context for *why* several rules exist (optional read).

**First action:** create `docs/` in the new repo and drop these files there; treat RS+ES as the source of truth throughout.

## Mission: the v0 Walking Skeleton ONLY (ES §0)
Build **one vertical slice and stop.** Do not build the rest of the spec yet.

**v0 = ** contract + Zod validators + contract tests → headless **Month** engine → **React Month** skin → windowed data endpoint backed by a **local** D1 (Miniflare) seeded with fixtures → Month view rendering SSR-safe from that endpoint, all v0 tests green.

**Explicitly DO NOT build in this pass** (committed, but fenced off): Week/Day/Custom views, Year, Schedule/Agenda, the web component, the MCP server (read or write), the Cowork skill, the Deploy-to-Cloudflare template, the Cowork plugin, full DAST/visual-regression infra.

**Air-gap note on the finish line:** ES's true v0 finish line is "SSR on real MMATF `/events` in a Cloudflare preview deploy." That step needs MMATF D1 access + deploy creds, which this machine does not have. So on this machine, **v0 ends at:** React Month renders from a **local Miniflare D1** (seeded from the schema + fixtures) via the windowed endpoint, SSR-safe, with all v0 tests green. The real-data + preview-deploy pass is a follow-on done where MMATF access exists (or in MMATF CI). Build the MMATF adapter against the documented `events`+`event_days` shape using fixtures; don't block on live data.

## Environment (ES §11)
- **WSL2**, repo on the **Linux filesystem** (`~/…`, NOT `/mnt/c`), edited via VS Code Remote-WSL.
- Node 20+ (or current LTS), **pnpm** workspaces.
- Commit the lockfile; `pnpm install --frozen-lockfile` in CI (never plain install).

## Repo layout (standalone repo — NOT inside MMATF)
```
calendar-module/
  packages/
    contract/      @org/calendar-contract  — CalendarEvent/Occurrence/CalendarConfig types + Zod validateEvent/validateWindow
    core/          @org/calendar-core       — headless engine (pure TS: occurrence model, lane-packing, ongoing rule, .ics, Luxon view math, a11y state model). NO React/DOM/Cloudflare.
    react/         @org/calendar-react      — Month skin + theming tokens (depends on core+contract)
  apps/
    harness/       Storybook + fixture data (dev/test harness; no network)
    worker/        Cloudflare Worker: windowed data endpoint + OpenNext SSR app + MMATF adapter (Miniflare/local D1 for v0)
  docs/            the attached RS / ES / review
  .changeset/  .github/workflows/  LICENSE (Apache-2.0)  NOTICE  package.json  pnpm-workspace.yaml
```

## v0 build sequence (TDD; "[AC] → named test" per ES §6)
1. **Scaffold** the monorepo + tooling: pnpm workspaces, Vitest, `@cloudflare/vitest-pool-workers`, fast-check, ESLint (+ `eslint-plugin-security`, `eslint-plugin-no-unsanitized`), Changesets, tsup builds, Storybook, `.github/workflows` (typecheck→lint→unit/property→build; add CodeQL), **Apache-2.0 `LICENSE` + `NOTICE`** (carry rrule.js + python-dateutil BSD-3-Clause notices), DCO in `CONTRIBUTING.md`.
2. **Contract first (lock the seam):** implement `CalendarEvent`/`Occurrence`/`CalendarConfig` (ES §5) + **`validateEvent`** (per-event shape + URL/`mapUrl` protocol allowlist) and **`validateWindow`** (id-uniqueness + `occurrences[]` sorted-ascending). Write contract tests before/with the code. This is SemVer-frozen once green.
3. **Headless core, TDD** (the riskiest step — most slack here):
   - Occurrence model + Luxon view math (display in `CalendarConfig.displayTimeZone`; Workers `Date` is UTC — never infer tz).
   - **Month lane-packing + ribbon×overflow** (RS §10a + §10a-bis): `ongoing` occurrences (span > 14d) excluded from packing; per-cell "+N more" (RS §10c, per-cell not row-summable); ribbon visible in all its week-row cells or none.
   - **ongoing predicate**, all-day floating + DTEND-exclusive end (ES §5 span table).
   - a11y **state model + key-handling** as an imperative API (day-granular grid focus; popover focus-trap) — core owns logic, skins only bind DOM (ES §2/§4).
   - `.ics` generation (VTIMEZONE + `VALUE=DATE`; injection-safe).
   - **Property tests (fast-check)** for every invariant in ES §6; **targeted fuzz** on the RRULE adapter helper + `CalendarEvent` ingestion + `.ics` escaping, seeded from the real-MMATF-quirk corpus listed in ES §6.
4. **React Month skin:** themeable via tokens; renders from core; **axe (WCAG 2.2 AA)** + the named keyboard/focus ACs (RS §8b); one Storybook visual baseline. Render-safety: never `dangerouslySetInnerHTML` untrusted content; the Zod allowlist is the single URL gate.
5. **Worker + adapter (local):** windowed events endpoint over a **local Miniflare D1** seeded with fixtures (and a representative MMATF schema for `events`+`event_days`); MMATF adapter maps that → `CalendarEvent[]`; SSR-safe Month page via OpenNext. Test in `vitest-pool-workers` (workerd parity; local `TZ=UTC`).
6. **v0 done (this machine):** see Definition of Done.

## Non-negotiables (load-bearing rules — do not drift)
- The **`CalendarEvent` contract is the seam**; nothing in `core`/`react` imports Cloudflare; no MMATF-isms in the contract.
- **`displayTimeZone`** is required, resolvable at SSR render time; invalid zone = hard deploy error + render-guard (never silent UTC).
- **All-day `end` exclusive**; **occurrences sorted**; **stable ids**.
- **`ongoing` excluded from ribbons**; "+N more" per-cell.
- **Render safety**: no unsanitized HTML; URL/`mapUrl` protocol allowlist lives in Zod.
- **"now/today"** renders stable on server + first client paint, updates post-mount (no hydration mismatch).

## Out of scope for v0 — and decisions you must NOT silently make
- MCP write authority needs the **invariant table** (ES §9b S2-8) before it's built — not in v0.
- Print layout is **deferred past v1** (RS §7).
- If you hit a genuine ambiguity not covered by RS/ES, **stop and flag it** rather than inventing a decision; the specs are the result of multiple review passes.

## Definition of Done (v0, this machine)
- [ ] Monorepo builds; CI green (typecheck, lint, unit, property, build).
- [ ] Contract + both validators implemented, frozen, contract-tested.
- [ ] Headless Month engine passes all ES §6 Month property tests (lane-packing, ribbon×overflow not-partially-visible, ongoing-excluded, all-day floating, determinism).
- [ ] React Month skin renders fixtures; axe passes; named keyboard/focus ACs pass.
- [ ] Worker serves a windowed Month from local Miniflare D1 (fixtures); MMATF adapter maps `events`+`event_days`→contract; Month SSRs without hydration mismatch.
- [ ] `docs/` contains RS + ES; README states "v0 = Month slice; see docs for full scope."
- [ ] (Deferred to a connected environment: real MMATF D1 + Cloudflare preview-deploy SSR-on-`/events` pass.)

Build to the specs; when in doubt, the RS/ES text wins. Good luck.
