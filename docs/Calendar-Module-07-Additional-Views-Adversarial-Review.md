# Calendar Module — Additional Views: Adversarial Pre-Build Review

**Reviewer:** Claude (independent adversarial pass) · **Date:** 2026-06-16
**Doc under review:** `Calendar-Module-06-Additional-Views-Spec.md` (**AVS**, v1.0)
**Context:** `Calendar-Module-01` (RS) + `02` (ES), both v1.3 locked; Month live as `@jonnyboats/calendar-react@1.0.1`.
**Method:** Full read against the locked RS/ES decisions and the live Month build. Same S1/S2/S3 taxonomy as `Calendar-Module-04`. Focus: where the new views contradict a locked AC, can't be built from the stated contract/endpoints, or hide an edge case that will bite at integration.

---

## Verdict

**Solid and buildable, with three load-bearing holes to close before the relevant phase.** The phasing is right, the §1.5 cross-view multi-day/ongoing table is the correct spine, and the collision Defined Equivalent (§6) is honest about being *ours*. But two issues break a **locked** AC or make a current-moment event disappear, and one is an internal contradiction that would stall the Schedule endpoint:

1. **An actively-running multi-day/ongoing event vanishes from a forward-from-now Schedule** (anchored only to its past start day) — and the naive fix collides with the keyset cursor.
2. **Year's per-day presence map has no category dimension**, so the locked RS §6 "unchecking a category removes its events from *every* view" cannot hold in Year.
3. **Schedule's window is double-specified** (`agendaWindowDays` *and* `agendaPageSize`), an internal contradiction the spec itself flags but ships anyway.

Fix the three S1s before their phases (S1-1/S1-3 before the Schedule endpoint locks; S1-2 before the Year presence endpoint). The S2s are phase-gated decisions. Nothing here re-opens a locked RS/ES decision.

**Findings:** 3 × S1 · 6 × S2 · 6 × S3.

---

## S1 — breaks a locked AC / makes an event disappear / blocks a clean build

### S1-1 · A multi-day or ongoing event that is *happening now* disappears from a forward-from-now Schedule (AVS §1.5, §2.1, §2.3)
**Problem.** §1.5 says a multi-day/ongoing occurrence renders **once, under its START day**. §2.3 says Schedule's default window is **forward from today**. Combine them: a 5-day fair that started *yesterday* and runs through *tomorrow*, or an ongoing event that started three weeks ago, has its only row anchored to a **past** day — which is outside the forward window — so it **does not appear in Schedule at all**, even though it is happening right now. For an events directory this is the worst possible omission: the events most worth surfacing (live this minute) are exactly the ones that vanish. Worse, the obvious fix — "hoist its row to the top of the window" — **breaks the keyset cursor** (§2.3): a row whose rendered position no longer matches its true `(start, occurrenceId)` sort key will dup or drop under `>` pagination.
**Fix.** Render multi-day **and** ongoing occurrences that **intersect** the window but **start before it** in a **pinned "Happening now / Ongoing" section above the paginated list** — not interleaved into the keyset stream. The keyset list then carries only occurrences whose **start is within the window**, keeping the cursor monotonic and clean. An occurrence whose start *is* in the window stays in the list under its start day (per §1.5). Add `[AC]`: a multi-day event spanning `[yesterday, tomorrow]` appears in the pinned section on a forward-only Schedule; the keyset stream contains no out-of-order start.

### S1-2 · Year's per-day presence map cannot honor the category legend filter — breaking the locked RS §6 "every view" AC (AVS §1.2, §3.2)
**Problem.** RS §6 `[AC]` (locked): "Unchecking a category removes its events from **every view**; state persists across view switches." Category filtering is **client-side core state** (AVS §1.2). But the Year window is a **per-day presence set with no category dimension** (§3.2: `{ "2026-03-14": true }`). With no category on the presence data, the client **cannot** recompute Year dots when a category is unchecked — so a day that has *only* Craft-Fair events still shows a dot after Craft Fair is filtered off. Year would be the one view that ignores the legend, violating the locked AC.
**Fix.** Make the presence endpoint **per-day per-category**: `{ "2026-03-14": ["craft-fair","music"] }` (or a per-day category bitmask). Still cheap — a day has a handful of categories, no payloads — and now the client filters Year dots from core state like every other view. Add `[AC]`: unchecking a category removes Year dots for days whose only events were that category; a day with a surviving category keeps its dot.

### S1-3 · Schedule window is double-specified: `agendaWindowDays` vs `agendaPageSize` (AVS §2.3, §9, §10-Q6)
**Problem.** §2.3 frames the initial window as "**N days** forward." §9 config lists **both** `agendaWindowDays` (30) **and** `agendaPageSize` (25 events). §10-Q6 then asks "paginate by days or by event count?" — i.e. the spec ships an unresolved either/or as if both were active. A keyset-paginated list (§2.3) paginates by **count** (cursor + page size); a fixed day-window is a *different* mechanism. An implementer can't build the endpoint without knowing which governs the first page and which governs scroll pages.
**Fix.** Pick **event-count keyset** (predictable payloads, matches the `(start, occurrenceId)` cursor). First render = first `agendaPageSize` page; scroll = next page; **drop `agendaWindowDays`** (or demote it to only the ‹ › jump distance, and say so). Reword §2.3 to "first page = `agendaPageSize` occurrences from the anchor," remove the day-window framing. Close §10-Q6.

---

## S2 — decision needed before the phase

### S2-1 · Default-scroll precedence in Week/Day is ambiguous when today is visible AND has an earlier event (AVS §4.2)
§4.2 lists three anchors — earliest event, ~7 AM, now-line-when-today — without precedence. When today is the visible day and its first event is 9 AM, do we scroll to 9 AM or to the now-line (say 2 PM)? **Fix:** state precedence: **today visible → now-line wins**; else earliest event; else `weekScrollAnchorHour`. One `[AC]` per branch.

### S2-2 · The "Ongoing" band's interactions are undefined in Week/Day/Custom (AVS §1.5, §4.1)
Month's ongoing band is specced; here the band is reused but no §4 rule says clicking it opens the detail popover, or whether it's a focus stop. **Fix:** the ongoing band is clickable → detail popover, and is a keyboard focus stop in the §7.3 linear order. Add `[AC]`.

### S2-3 · All-day-strip "+N more" expansion shifts the hour grid — interaction with scroll/now-line unstated (AVS §4.1, §4.2)
Expanding the strip grows its height and pushes the hour grid (and the now-line's pixel origin) down. Does the now-line recompute? Does scroll position jump? **Fix:** the now-line is positioned relative to the **hour grid**, not the viewport, so it tracks the grid when the strip expands; expansion must not lose the user's scroll. State it; add a regression note.

### S2-4 · `includePast` in Schedule — inline backfill vs "Load earlier" button still open (AVS §2.3, §10-Q3)
§2.3 offers two mechanisms and §10-Q3 leaves it open. It gates the Schedule pagination build. **Fix (recommend):** a **"Load earlier events" button** at the top that prepends a `<`-cursor page on demand — testable, avoids bidirectional infinite-scroll fragility. Decide before the Schedule phase.

### S2-5 · Prev/next ‹ › semantics in Schedule are undefined (AVS §1.1, §2)
§1.1 says Schedule prev/next "may jump by the initial window," but a scroll-paginated list has no discrete period. ‹ › on an infinite list is confusing. **Fix:** either **hide ‹ › in Schedule** (scroll + Today is the model) or define them as a jump-by-window with a clear anchor. Recommend hiding; keep **Today** (scrolls to today's group / now). Add `[AC]`.

### S2-6 · Today has no events → Schedule gives no "now" anchor (AVS §2.1)
Empty dates are skipped (§2.1), so if today has no events the list opens on the next future event with no indication of "today/now." Combined with S1-1, the present moment is under-represented. **Fix:** always render a **"Today — no events"** anchor row (or a "next event in N days" hint) at the top of the forward list, even when today is empty. Add `[AC]`.

---

## S3 — polish / hygiene

### S3-1 · Collision layout does no "expand-to-fill," and that should be stated as a deliberate divergence (AVS §6)
Google widens a block to absorb free space to its right when no later-column event overlaps it; AVS §6 uses fixed equal-width `clusterWidth / maxConcurrent`. That's a legitimate Defined Equivalent, but record it as an **intentional divergence** (like RS §11's "no weekend shading") so it isn't "fixed" later as a perceived bug. One line + a visual-regression baseline.

### S3-2 · Year single-dot vs Google's multi-dot — note the divergence (AVS §3.1)
§3.1 uses one presence dot per day; Google shows up to a few. Fine (the presence map is boolean-per-category), but state it as deliberate so a reviewer doesn't flag "only one dot" as a bug.

### S3-3 · Verify `@jonnyboats/calendar-react@1.0.1` actually ships sorted-`occurrences[]` + `location`/`mapUrl` before claiming "no contract bump" (AVS §9)
§9 asserts the contract needs no change because Month "already added" `location`/`mapUrl` and the sorted-occurrences guarantee. Confirm those landed in the **published 1.0.1**, not just the spec, before building Schedule/Year against them — cheap to check the published `.d.ts`. If absent, it's a **major** bump and must precede the new views.

### S3-4 · Year a11y: clarify the mini-month is a single tab stop with internal roving (AVS §7.2)
§7.2 says "month title is a focus stop; the grid is a second stop," which reads as two stops per month plus the roving — standard ARIA-grid is **one** tab stop with arrow-roving inside. State: each mini-month = (title stop) + (grid stop, internal arrow roving); 12 months = 24 stops. Removes a double-take.

### S3-5 · Schedule range-title "From Jun 16, 2026" is awkward (AVS §1.1)
A forward-scroll list doesn't have a clean range title. Consider "Upcoming" (or the visible top date) instead of "From …". Cosmetic.

### S3-6 · `customViewDays` runtime vs deploy config (AVS §5, §9)
§9 lists `customViewDays` in `CalendarConfig` (deploy/tenant-resolved), but §5's prev/next-by-N assumes a fixed N. Confirm it's **not** a runtime user toggle (or, if it is, prev/next must read current N). State it. Low priority (Custom is the last, optional view — see §10-Q5).

---

## Items checked and CLEARED (no concern)
- **§1.5 cross-view multi-day/ongoing table** — the right spine; once S1-1 fixes the *windowing* of it, the per-view renderings are consistent with Month and Google.
- **Collision Defined Equivalent §6** — greedy-by-start over interval clusters does yield columns = peak concurrency (chromatic number of an interval graph); the min-block-height-is-visual-only rule correctly keeps collision on true intervals. Sound.
- **Cross-midnight clamp into both days** (§4.3) + DST real-day-length now-line (§4.4/§4.5) — correct and matches the ES §6 fuzz corpus.
- **a11y per view-type** (list / grid-of-grids / linear-focus time-grid) — the decision *not* to force 2-D roving over a pixel-positioned grid is the right call and consistent with Month's day-popover principle.
- **Config additions are additive/optional** (§9) — minor-bump-safe, no existing consumer breaks.
- **Phasing & DoD** (§0) — realistic; Schedule-first is the correct value call.

---

## Do these first (prioritized)
| # | Severity | Item | Why first |
|---|---|---|---|
| 1 | S1-1 | Happening-now multi-day/ongoing vanishes from forward Schedule + keyset collision | Breaks the most valuable rows; touches the Schedule endpoint + cursor design |
| 2 | S1-2 | Year presence map lacks category → breaks locked RS §6 filter AC | Defines the Year presence endpoint shape before its phase |
| 3 | S1-3 | `agendaWindowDays` vs `agendaPageSize` double-spec | Blocks the Schedule endpoint; the spec already flags it unresolved |
| 4 | S2-4 | `includePast` mechanism (button vs infinite-scroll) | Schedule pagination build needs it |
| 5 | S2-1 | Week/Day default-scroll precedence | One `[AC]` per branch before the time-grid phase |
| 6 | S2-2/3 | Ongoing-band interactions + strip-expansion vs now-line | Time-grid completeness before the Week/Day skin |
