# Calendar Module — Additional Views Kickoff Brief

**For:** the Calendar Module developer (jonnyboats), continuing `JohnTarbox/calendar-module`. **From:** the Cowork design/spec phase. **Date:** 2026-06-16.
**Precedent:** Month shipped clean — `@jonnyboats/calendar-react@1.0.1`, live on MMATF `/events?view=calendar` (CAL1). Same playbook here: build to the spec, don't re-derive decisions.

## What you're building
The **remaining Google-style views** on the existing headless-core + React-skin module: **Schedule (Agenda), Year, Week, Day, Custom**. Still display-only, Cloudflare-only, same `CalendarEvent` contract. Month is **done and live** — do not change it.

**Authoritative spec (build to these):**
- `Calendar-Module-06-Additional-Views-Spec.md` (**AVS**, v1.1) — the buildable spec for all five views. **Source of truth.**
- `Calendar-Module-07-Additional-Views-Adversarial-Review.md` — why several rules exist (optional, but read the S1s).
- Still in force: `Calendar-Module-01` (RS) + `02` (ES), both v1.3. AVS extends them; it re-opens nothing.

**First action:** drop AVS + the review into the repo's `docs/`; treat AVS as the source of truth throughout.

## Build order — respect the phasing (AVS §0). Ship each phase before the next.
1. **v1-a — Schedule (Agenda).** Mobile default; cheapest; a paginated list reusing the Month occurrence model + popovers. **Build first.**
2. **v1-b — Year.** 12 mini-months over a per-day-per-category presence map. Reuses Month's day-cell + day-popover.
3. **v2-a — Week + Day** (build together; Day = Week with one column). The expensive part: hour grid + collision layout + now-line.
4. **v2-b — Custom.** Configurable N-day range that **reuses** the Week/Day time-grid. Inert in v1; goes live here.

Each phase is TDD: every `[AC]` in AVS is a named test (ES §6). Property + targeted fuzz alongside, seeded from the real-MMATF-quirk corpus (ES §6).

## The S1s — get these right before the relevant endpoint locks (review S1-1/2/3)
- **Schedule (§2.1a/§2.3):** multi-day/ongoing events that are *happening now* but **started before** the forward window go in a **pinned "Happening now / Ongoing" section above** the list — NOT interleaved — so the **keyset cursor `(start, occurrenceId)` stays monotonic**. The paginated stream carries only occurrences whose start is in the window. Paginate by **event count** (`agendaPageSize`); there is no day-window. `includePast` = a **"Load earlier events" button** (`<` cursor), not infinite scroll.
- **Year (§1.2/§3.2):** the presence endpoint is **per-day, per-category** (`{ "2026-03-14": ["craft-fair","music"] }`), dates + labels, **no payloads** — so the client-side legend filter can recompute dots and honor RS §6 "removes from every view." Hydrate a day's full payload on click.
- **Verify before you build (review S3-3):** confirm the published `1.0.1` `.d.ts` actually ships sorted-`occurrences[]` + `location`/`mapUrl`. If not, that's a **major** contract bump that must land first.

## Non-negotiables (load-bearing — do not drift)
- **Contract is the seam; no MMATF-isms.** These views need **no `CalendarEvent` change** (verify per above). `CalendarConfig` gains only **optional, additive** fields (AVS §9) → minor bump, no consumer breaks.
- **One TZ rule, every view (§1.3):** timed occurrences bucket/position in `displayTimeZone`, render wall-clock in `Occurrence.timezone`; all-day floats. Workers `Date` is UTC — never infer tz. "now/today" SSR-stable, updates post-mount.
- **Multi-day/ongoing per the §1.5 cross-view table** — once-in-Schedule / dot-every-day-in-Year / all-day-strip-ribbon-or-band in Week/Day. A 20-day event ≠ a 48h-tall block and ≠ N chips.
- **Windowed loading per view (§1.2);** cache keys = window + tenant + cache-epoch, **never** client-side category filters.
- **Collision layout = the Defined Equivalent in §6** (equal-width columns, no expand-to-fill — deliberate); min-block-height is **visual only**, collision uses true intervals.
- **a11y per view-type (§7):** Schedule = list; Year = grid-of-grids; Week/Day = **linear focus order over blocks**, NOT 2-D spatial roving over a pixel grid. Core owns the a11y state model; skins bind DOM. axe + the named keyboard ACs.
- **Render safety:** never `dangerouslySetInnerHTML` untrusted content; the Zod URL/`mapUrl` allowlist is the single gate.

## Out of scope (do NOT build here)
- Web component, MCP server (read or write), Cowork skill, Deploy-to-Cloudflare template — still fenced (ES §0).
- The **v2 write surface** — blocked on the MMATF-side MCP write-authority invariant table (**K25**). Nothing to design against.
- **Print** — deferred past v1 (RS §7).
- If you hit a real ambiguity not covered by AVS/RS/ES, **stop and flag it** — the specs are the product of multiple review passes. **All product questions are resolved (AVS §10, locked 2026-06-16)** — don't re-open them.

## Decisions locked by John (AVS §10 — build to these)
- **Past events:** `includePast` governs fully-past periods + Schedule's backward window only; anchored periods always render whole. (Closes the CAL1 question — correct the Month spec wording, don't touch the build.)
- **Schedule row-click:** **responsive** — detail popover on desktop, navigate to the event page on mobile (`scheduleRowAction: "responsive"`).
- **Empty-day click:** "No events on {date}" popover (match Month's shipped behavior — confirm parity).
- **Custom view:** in scope, build it in **v2-b** (rides on Week/Day).
- **Schedule pagination:** event-count keyset; "Load earlier events" button for `includePast` (no infinite scroll).
- **Pre-build verification (not a decision):** confirm `1.0.1` `.d.ts` ships sorted-`occurrences[]` + `location`/`mapUrl` before building (else a major contract bump precedes the views).

## Per-view Definition of Done
See **AVS §0** — each view's DoD is enumerated there (Schedule, Year, Week/Day, Custom). In short: all that view's `[AC]`s green as named tests; property/fuzz for the view's invariants; axe (WCAG 2.2 AA) + named keyboard ACs; windowed endpoint tested in `@cloudflare/vitest-pool-workers` (workerd parity, `TZ=UTC`); renders SSR-safe from fixtures, then real MMATF data in a connected env.

## Versioning
MMATF consumes a pinned release. Keep `CalendarEvent` changes to a **major** bump with a heads-up so the MMATF dev can pin/migrate. Config additions are minor. Ship each view (or phase) as its own release so MMATF can adopt incrementally.

Build to the specs; when in doubt, AVS wins. Nice work on Month — same bar here.
