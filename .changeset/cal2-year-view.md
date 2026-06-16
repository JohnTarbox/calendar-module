---
"@jonnyboats/calendar-react": minor
"@jonnyboats/calendar-core": minor
---

Year view (CAL2 v1-b, AVS §3) — 12 mini-months over a cheap per-day per-category presence
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
