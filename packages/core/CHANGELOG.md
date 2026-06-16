# @jonnyboats/calendar-core

## 1.1.0

### Minor Changes

- a343d80: Schedule / Agenda view (CAL2 v1-a, AVS §2) — the mobile-default, forward-from-now
  chronological list. First of the additional views; contract seam unchanged (additive only).

  - **core:** headless `buildAgenda` flattens a fetched window into a pinned "Happening now /
    Ongoing" list (§2.1a — multi-day/ongoing started before the window), the in-window keyset
    stream, and a past list. `pageForward`/`pageEarlier` paginate by a composite keyset cursor
    `(start, occurrenceId)` (§2.3) with property-tested no-dup/no-drop across fat-date
    boundaries; `groupByDay` buckets in `displayTimeZone` (§1.3). `AgendaItem.ongoing` flags
    the "Ongoing through {date}" rows.
  - **react:** `ScheduleCalendar` (flat-prop mount API) + `ScheduleSkin`. Date-group headers,
    rows (dot · time · title · location), pinned section, "Today — no events" anchor (S2-6),
    reveal-by-page + "Load earlier events" (`includePast`), responsive row-click (popover
    desktop / navigate mobile, §2.2), reused detail popover + `.ics`, client-side legend
    filter, loading/empty/error states, and list a11y (role=list, Tab/Arrow rows, Esc returns
    focus, axe-clean).
  - **contract:** additive optional `CalendarConfig` fields `agendaPageSize` (default 25) and
    `scheduleRowAction` (`"responsive" | "popover" | "navigate"`, default `"responsive"`).

- 3be448e: Year view (CAL2 v1-b, AVS §3) — 12 mini-months over a cheap per-day per-category presence
  map. Reuses Month's day-cell grid + day popover. Contract unchanged.

  - **core:** `buildPresence(events, cfg, year)` → `{ "2026-03-14": ["craft-fair","music"] }`
    (dates + category labels, NO payloads); `presentDays(map, hidden)` recomputes dotted days
    client-side so the legend filter honors RS §6 "every view" (review S1-2). A multi-day /
    ongoing occurrence dots every day it spans (§1.5). `presenceCategories` for the legend.
  - **react:** `YearCalendar` (flat-prop mount API) + `YearSkin`. 12 mini-months, one presence
    dot per dotted day (deliberate divergence from Google's multi-dot, §3.1), today-disc,
    hydrate-on-click → day popover (§3.2), undotted-day → "No events on {date}" popover,
    month-title → Month, prev/next year + Today, grid-of-grids a11y (per-month title + roving
    grid, 24 tab stops, §7.2), axe-clean. Shared `occurrencesOnDay` extracted for reuse.

### Patch Changes

- Updated dependencies [a343d80]
  - @jonnyboats/calendar-contract@1.1.0

## 1.0.0

### Major Changes

- 1.0.0 — frozen seam + host-embeddable Month.

  The `CalendarEvent` contract is declared stable: any future change is a major bump (enforced by
  `guard:changeset`). `@jonnyboats/calendar-react` adds the host-facing **`MonthCalendar`** mount API
  (flat props, theme tokens, render slots, navigation/filter callbacks), ships as a proper client
  component (`"use client"` baked into the package entry) for host Next.js App Router / OpenNext
  embedding, and re-exports the contract validators. `CalendarMonth` is kept as a deprecated alias.

### Minor Changes

- 448b817: v0 walking skeleton: the SemVer-frozen `CalendarEvent` contract + Zod validators, the headless
  Month engine (span resolution, ongoing rule, lane-packing + ribbon×overflow, a11y state model,
  `.ics`), and the React Month skin. See `docs/` for the full scope; Week/Day/Year/Schedule, the
  web component, and the MCP server are committed but fenced off until after v0.

### Patch Changes

- Updated dependencies
- Updated dependencies [448b817]
  - @jonnyboats/calendar-contract@1.0.0
