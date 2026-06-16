---
"@jonnyboats/calendar-react": minor
"@jonnyboats/calendar-core": minor
"@jonnyboats/calendar-contract": minor
---

Week / Day / Custom time-grid (CAL2 v2-a + v2-b, AVS §4–§6) — the hour-grid views. Built in the
locked order (Week+Day first, Custom as the parameterization). Contract additive only.

- **core:** `packDayColumn` — the collision Defined Equivalent (§6): strict-overlap clusters,
  greedy lowest-free-column = peak concurrency, fixed equal-width (no expand-to-fill, deliberate
  divergence S3-1); min-block-height is render-only (`blockBox`), never feeds collision.
  `dayLengthMinutes`/`minutesSinceMidnight`/`nowLineFraction` — DST-correct (real 1380/1440/1500
  day length). `dayColumnSegments` (single-day + cross-midnight clamped, excludes all-day /
  ongoing / >24h-timed), `packStrip` (all-day bars + multi-day ribbons + ongoing band + per-column
  "+N more"), `alignWeekStart`/`rangeDays`. Property + fuzz: no same-column overlap, columnCount =
  peak concurrency, deterministic, no NaN/negative geometry.
- **react:** `TimeGridCalendar` (flat mount API) + `TimeGridSkin` — generic over N columns so Day =
  Week-with-one-column and Custom = N columns. All-day strip + hour grid + collision blocks +
  DST now-line (today only) + cross-midnight blocks in both days + ongoing band (clickable focus
  stop) + "+N more" strip expansion + default scroll precedence (now-line → earliest → 7 AM, §4.2).
  Linear-focus a11y (§7.3: column headers + items in DOM order, Arrow L/R between columns, NOT 2-D
  roving), axe-clean. Custom: prev/next by exactly N days (contiguous), `x`/`4` live in v2.
- **contract:** additive optional `CalendarConfig` `customViewDays` (2–7, default 4), `minBlockPx`
  (default 22), `weekScrollAnchorHour` (0–23, default 7).
