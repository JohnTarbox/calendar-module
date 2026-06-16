---
"@jonnyboats/calendar-core": minor
---

Add the headless Schedule/Agenda engine (CAL2 v1-a, AVS §2). Pure, SSR-safe core:
`buildAgenda` flattens a fetched window into classified occurrences — a pinned "Happening
now / Ongoing" list (§2.1a, multi-day/ongoing started before the window), the in-window
keyset stream, and a past list for `includePast`. `pageForward`/`pageEarlier` paginate by a
composite keyset cursor `(start, occurrenceId)` (§2.3) with property-tested no-dup/no-drop
across fat-date boundaries; `groupByDay` buckets in `displayTimeZone` (§1.3). Contract
unchanged — additive only.
