# Decision Record — v0 Month overflow edges (CONFIRMED)

**Status:** Confirmed · **Date:** 2026-06-14 · **Owner:** John

The RS/ES specs are authoritative, but the adversarial pre-build review surfaced **six edge
cases the specs do not resolve** — all concerning the scarce vertical space in a fixed-height
Month cell (lane reservation, "+N more", ongoing strips), plus tiebreaks and clock injection.

For the v0 walking skeleton these were resolved as documented defaults and have now been
**confirmed as the decisions of record** (not provisional). They live in
`packages/core/src/layout/pack-month.ts` (and `sort.ts`), and each is structured to be cheap to
revisit. This file is the canonical record so the choices are not re-litigated.

| # | Edge case (spec gap) | Confirmed decision | Where |
|---|---|---|---|
| 1 | Bar/ribbon reserved-lane ceiling vs the §10c floor cap (RS §10a "3" vs §10c formula) | **No fixed `3`.** Bars reserve top-down up to `cap = floor((cellH−headerH)/rowH)`; timed fill the remainder. The cap is driven by the geometry the skin passes in `LayoutCaps`. | `pack-month.ts` → `visibleBarLanes = min(B, cap)` |
| 2 | Does "+N more" consume a visible row? (RS §10c) | **Yes — but only when the row overflows.** `contentCap = cap − 1` on overflow; a non-overflowing cell shows the full `cap` with no indicator. Guarantees `shown + (overflow?1:0) ≤ cap`. | `pack-month.ts` → `contentCap = max(0, cap - 1)` |
| 3 | "Longer-duration-first" tiebreak: total span or in-row clipped length? (RS §10a) | **Total effective span** (`spanDays`, computed before clipping), so a ribbon keeps a stable lane across the week rows it crosses. | `layout/sort.ts` → `compareBarSpans` |
| 4 | Ongoing strip vs the per-cell cap (RS §11, S1-2) | **Separate band, outside the cap math.** Ongoing occurrences are excluded from lane-packing entirely (never touch `B`/`cap`/overflow); the skin renders them above the grid (`cm-ongoing-band`). | `pack-month.ts` → `ongoingStrips.push(...) ; continue` |
| 5 | Events landing only on adjacent-month (muted) days (RS §2/§9) | **Render and pack them.** The window spans the grid's first/last *cell* (incl. adjacent-month days); cells carry `inMonth:false` and the skin styles them muted but interactive. | `pack-month.ts` → window filter on `windowStart/windowEnd` |
| 6 | How "now" is supplied (ES §8 SSR-stable now) | **Host pins `now` as an ISO string at request time; the core never reads a clock.** Verified by `packages/react/src/ssr-hydration.test.tsx`. | `now` parameter threaded through `core`; worker pins it per request |

## Invariants these uphold (property-tested)

- Per cell: `shown + overflowCount === items intersecting the cell` (S2-4, not row-summable).
- Every ribbon is visible in **all** its cells or **none** — one row-wide cut (`lane < reservedBarLanes`).
- A >14-day occurrence ⇒ exactly **1** Ongoing strip and **0** ribbon segments (S1-2).
- Determinism: identical input + window ⇒ identical layout (stable-id tiebreak).

## If a decision is ever reopened

Each is localized: #1 → add `maxBarLanes` to `LayoutCaps`; #2 → `cap-1` ↔ `cap`; #3 → pass a
clipped length to the comparator; #4 → reintroduce ongoing as a special bar lane (the most
structural change); #5 → filter on `cell.inMonth` before packing; #6 → re-pin `now` post-mount
via `useEffect` for a ticking "today" (never read a clock during render). Update this file and
the property tests together.
