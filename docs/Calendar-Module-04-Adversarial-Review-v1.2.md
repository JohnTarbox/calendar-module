# Calendar Module — Adversarial Pre-Build Review (v1.2 specs)

**Reviewer:** Claude (independent adversarial pass) · **Date:** 2026-06-14
**Docs under review:** `Calendar-Module-01-Google-Display-Reference-Spec.md` (**RS**, v1.2) · `Calendar-Module-02-Engineering-Spec-Dev-Handoff.md` (**ES**, v1.2)
**Method:** Full read of both docs. Live-verified the Google keyboard-shortcut grounding against `support.google.com/calendar/answer/37034` (2026-06-14). Other Cloudflare/license claims flagged "verify before build" where a check wasn't cheap.

---

## Verdict

**Strong specs, not yet build-clean.** These are unusually disciplined for a pre-build pair — the contract is well-shaped, the hardest algorithm (ribbon×overflow) is correctly identified and pinned, and the v0 fence is realistic. But a handful of load-bearing items are still wrong, underspecified, or self-contradictory enough to stall or mislead an implementer. **The most dangerous are not the obvious algorithm gaps — they are (1) a contract that cannot represent the "+N more"/day-popover data the RS repeatedly promises, (2) an `ongoing` predicate that contradicts the multi-day ribbon model, and (3) a keyboard-shortcut grounding claim that the live Google docs do not support.** Fix the S1s before step 2 (contract lock), since several touch the contract and a contract change after lock is a SemVer-major event by the docs' own rule.

**Findings:** 6 × S1 · 9 × S2 · 7 × S3.

---

## S1 — wrong behavior / blocks a clean build

### S1-1 · The contract can't support the day-popover / "+N more" / Agenda "location" the RS promises (ES §5, RS §5b/§4)
**Problem.** RS §5b day popover `[AC]` requires listing **every event for a date** with "dot + time/All-day + **title**", RS §4 Agenda rows require "color dot + time + title + **location**", and RS §5a detail popover renders **Location: venue + town (+ Get directions if host supplies coords/map URL)** and **Hours: open–close**. But the `CalendarEvent`/`Occurrence` contract has **no location field, no venue/town, no coords/map-URL field.** `Occurrence` has `openTime`/`closeTime` (good) and `note`, but nothing that carries location. RS §5a hand-waves this as "host-provided fallback via the adapter," yet the **engine** renders Agenda rows and day-popover lists — it needs the data in the contract, not a side channel. As written, an implementer building the Agenda view from the contract literally cannot put a location on the row.
**Fix.** Add to `Occurrence` (or `CalendarEvent`): `location?: string` (display label, e.g. "venue + town") and `mapUrl?: string` (or `geo?: {lat,lng}`) — with the same Zod protocol allowlist applied to `mapUrl` as to `url`. Decide whether location is per-event or per-occurrence (a series can move venues → per-occurrence is safer). State explicitly which RS-rendered fields are engine-rendered (must be in contract) vs. host-slot-rendered (may be out-of-band). This is a contract change → do it **before** the §12-step-2 lock.

### S1-2 · `ongoing` predicate contradicts the multi-day ribbon and double-defines "long event" (ES §5, RS §2/§10a vs §11)
**Problem.** ES §5 derives `ongoing = TRUE iff ANY single occurrence has (end−start) > 14 days (strict)`. But the contract also says recurrence is **pre-expanded to concrete instances** and the Month renderer (RS §2, §10a) draws a **multi-day ribbon** for any occurrence spanning multiple days. So a single 20-day occurrence is simultaneously (a) a multi-day ribbon to be lane-packed across ~3 week rows, and (b) flagged `ongoing` for the "Ongoing through {date}" strip (RS §11). **Nothing in either doc says how these two renderings interact** — does a 20-day event draw a ribbon *and* a strip? Does `ongoing` suppress the ribbon? Lane-packing a 20-day ribbon across 3 week-rows is exactly the pathological wide-span case the fuzz corpus calls out ("98-day flat ranges") — and the ribbon×overflow rule (§10a-bis) was never analyzed for spans longer than a single month/window.
**Fix.** Define the interaction explicitly: e.g. "an occurrence with `ongoing===true` (or span > 14d) renders as the Ongoing strip and is **excluded from ribbon lane-packing**" — or the reverse. Whichever you pick, add an `[AC]` and a property-test ("a 20-day occurrence renders as exactly one strip and zero ribbon segments," or vice versa). Also clarify that the 14-day predicate is per-*occurrence*, not per-event, in the RS (RS §11 says "occurrence whose span > 14 days" but ES §5 says "any single occurrence" — align the wording and confirm a multi-occurrence series with one long instance doesn't flag the whole series).

### S1-3 · Keyboard "Previous date range" shortcut is asserted, not grounded — and the doc claims it was verified (RS §8a)
**Problem.** RS §8a lists `Previous date range | p or k` with a parenthetical: *"conventional pair; the current help table lists only 'next' — include both for parity."* The section header says the map was **"verified against support.google.com/calendar/answer/37034, 2026-06-14."** I fetched that exact page today: the live "Move around the calendar" table lists **j or n for next and has no previous-range row at all.** So `p`/`k` is **invented from convention, not verified** — yet it sits in a table whose header asserts verification, and an `[AC]` ("Each listed shortcut performs the stated action") will demand a behavior Google doesn't ship. (For the record: `r` refresh, `g` go-to-date, `t` today, `/` search, and all the view shortcuts `1/d 2/w 3/m 4/x 5/a` **do** match the live docs exactly — those are clean.) Net: the table mixes verified and unverified bindings under a blanket "verified" header, which is exactly the grounding overstatement this review is meant to catch.
**Fix.** Move `p`/`k` to a clearly-labeled **"module convention (not in Google's table)"** sub-row, drop the "current help table lists only next" claim (it implies the table has a previous row — it has none), and either (a) keep p/k as an intentional module addition with its own non-parity `[AC]`, or (b) drop them. Either way the verified/unverified split must be visible so the `[AC]` doesn't assert Google parity for a binding Google lacks.

### S1-4 · Year view click target is undefined by the presence-only data window (ES §4a, RS §4)
**Problem.** RS §4 Year view: "Days with events are marked (dot under the number). Click a day → day popover." ES §4a Year window is **"presence-only — a cheap has_events(month) / dot map, NOT full payloads."** A **monthly** presence map (`has_events(month)`) cannot render a **per-day** dot — you can't know *which days* have events from a month-level boolean. RS §4 needs per-day presence; ES §4a specifies per-month presence and then says "hydrate a day's payload on click." There's a granularity mismatch: either the presence endpoint is per-day (contradicting "has_events(month)") or the Year view can't dot individual days (contradicting RS §4).
**Fix.** Change the Year presence endpoint to return a **per-day** presence bitmap/set for the 12 months (still cheap — dates only, no payloads), and reword ES §4a from `has_events(month)` to `has_events(day)` / a day-level dot map. Then "hydrate on click" still applies for the popover payload. Add an `[AC]`: "Year view dots exactly the days the presence map marks; clicking a dotted day fetches and opens its day popover."

### S1-5 · "Click empty cell → day popover" has no defined behavior for a day with zero events (RS §2 interactions, §5b)
**Problem.** RS §2 `[MMATF adaptation]`: "Click empty area of a day cell → open the day popover in place." RS §5b day popover `[AC]`: "Lists **every event** for the date." For an empty future day (very common in a sparse events directory) the popover would open with an empty list — but the States section (RS §9) defines an **empty-state element** only for an empty *window*, not an empty *day popover*. So clicking an empty day yields an undefined/empty popover. Worse, "empty area of a cell" is ambiguous in Month: the whole cell is clickable for navigation (date number → Day view, events → detail). What counts as "empty area" vs. the date-number hit target vs. an event hit target is unspecified, and will produce inconsistent click routing.
**Fix.** (a) Define the empty-day popover content (e.g., "No events on {date}" + "View full day →"), or suppress the popover on truly-empty days and fall through to Day-view navigation. (b) Specify the cell click-target precedence explicitly: event chip > "+N more" > date number > empty-area gesture, and what region constitutes "empty area." Add `[AC]`s for both.

### S1-6 · `recurrenceSummary` is per-event but the "Next upcoming" / past-occurrence logic is per-occurrence — and neither can be computed without occurrence ordering the contract doesn't guarantee (RS §5a, ES §5)
**Problem.** RS §5a: the detail popover shows a **"Next upcoming"** line "relative to real now, in displayTimeZone" that appears **only when the clicked occurrence is in the past**. To compute "next upcoming" the engine must scan `occurrences[]` for the first occurrence with `start >= now`. But (a) the contract **does not require `occurrences[]` to be sorted**, (b) windowed loading means the popover may be opened on a clicked occurrence while the *next upcoming* occurrence lies **outside the currently-loaded window** (a future month not yet fetched), so "next upcoming" may be uncomputable from in-memory data, and (c) RS §5a elsewhere says the engine "never computes [recurrence] from occurrences[]" — but "Next upcoming" *is* computing a recurrence-derived fact from occurrences. These three points conflict.
**Fix.** Either (a) require `occurrences[]` sorted ascending in the contract (cheap, add to Zod + a property test) **and** specify that "Next upcoming" is best-effort over loaded windows with a defined fallback when the next instance isn't loaded (e.g., fall back to `recurrenceSummary` or show nothing) — or (b) make "Next upcoming" an adapter-supplied string like `recurrenceSummary`, keeping the engine out of occurrence math entirely. Pick one and reconcile the "never computes from occurrences" sentence with whatever the engine *does* compute (today-bucketing, ongoing predicate, and possibly next-upcoming all read occurrences — the blanket "never computes" is already false).

---

## S2 — gaps needing a decision before their phase

### S2-1 · Two sources of truth for the today-disc / now math: `Occurrence.timezone` vs `CalendarConfig.displayTimeZone` interaction is underspecified (ES §5, §8)
**Problem.** ES §8 says day-bucketing uses `displayTimeZone` for *timed* occurrences and floats all-day ones. But `Occurrence.timezone` (per-occurrence IANA) also exists "for timed multi-tz correctness." If a timed occurrence has `start` "2026-07-04T20:00:00-05:00", `timezone:"America/Chicago"`, and the instance `displayTimeZone` is `America/New_York`, **which day does it bucket into** — the day in Chicago time or the day in New York display time? ES §8 implies `displayTimeZone` wins for bucketing, but then `Occurrence.timezone` is only for rendering the displayed clock time, which isn't stated. The two-tz model is correct in principle but the precedence rule ("bucket in displayTimeZone, render wall-clock in occurrence.timezone, fall back to displayTimeZone") is never written down.
**Fix.** Add an explicit precedence paragraph + a property test covering a cross-tz timed occurrence near midnight (the case that bites).

### S2-2 · Edge cache invalidation keyed by "window+filters" will have an unbounded/low-hit key space (ES §8)
**Problem.** ES §8 edge caching is "keyed by window+filters." Filters = the category-visibility set (RS §6), which is **client-side core state** and view-spanning. If category filters are part of the cache key, the key space is the power set of categories × every window — cache hit rate collapses and the syndication-invalidation epoch has to purge a combinatorial key set. More likely the intent is: **cache the full unfiltered window server-side; apply category filtering client-side** (filtering is core state in the browser anyway). If so, "keyed by window+filters" is wrong.
**Fix.** Clarify that the server/edge caches **unfiltered** windows (key = window + tenant + cache-epoch) and category filtering is applied client-side from core state. Remove "filters" from the cache key. If any server-side filtering is intended (e.g., tenant scoping), name exactly which dimensions key the cache.

### S2-3 · Agenda pagination cursor "= last loaded date" breaks on multiple events per date (ES §4a)
**Problem.** "cursor = last loaded date" — but a single date routinely has many events, and a page boundary can fall **mid-date**. A date-only cursor either re-fetches the whole last date (duplicates) or skips its remaining events (drops). This is a classic keyset-pagination off-by-one.
**Fix.** Make the cursor a composite `(date, occurrenceId)` or `(start, occurrenceId)` tuple with a strict `>` comparison, and define page boundaries to never split a date's events ambiguously. Add a test: a date with > pageSize events paginates without dup/drop.

### S2-4 · "+N more" overflow count is specified per-cell, but ribbon×overflow makes the count cross-cell — the N is ambiguous (RS §10a-bis vs §10c)
**Problem.** §10c: N = hidden count **in that cell**. §10a-bis: a multi-day event that doesn't fit is counted in "+N more" **in ALL cells of its week-row span**. So a clipped 5-day ribbon increments the "+N more" of 5 cells. But §10c's `[AC]` "Visible + N = total" — total *of what*? Per cell, a hidden ribbon counts as +1 in each of 5 cells, so summing N across the row double-counts that one event 5×. The invariant "Visible + N = total" is only coherent per-cell if "total" is "items touching that cell," which for a ribbon is 1 per cell — workable, but **never stated**, and it makes a row-level "total events this week" reconciliation impossible from the per-cell Ns.
**Fix.** State that N is **per-cell over items intersecting that cell** (a multi-day event counts as 1 in each cell it touches), and that the `[AC]` "visible+N=total" is **per-cell**, not row-summable. Add a property test for the clipped-ribbon case.

### S2-5 · `defaultDurationMinutes` default (60) vs `allDay` and vs missing-`end` timed events is underspecified at boundaries (ES §5)
**Problem.** `end?` optional; "Timed events with no end default to defaultDurationMinutes." But: (a) what if `allDay:true` and `end` omitted — §5 says single-day all-day = end next-day-or-omit, so an omitted-end all-day is single-day; an omitted-end *timed* is +60min. The disambiguator is `allDay`, which is fine, but the two rules live in different sentences and an implementer can conflate them. (b) A 60-min default that crosses midnight (timed event starting 23:30 with no end) — which day(s) does it occupy / does it ribbon? Undefined.
**Fix.** One table: `(allDay, end present?)` → resulting span. Add the midnight-crossing-default case to the fuzz corpus.

### S2-6 · `validate_event` asserts "uniqueness within a window," but the contract is a single `CalendarEvent` — the validator's unit of work is mismatched (ES §5, §9b)
**Problem.** ES §5: "The Zod validator asserts uniqueness [of ids] within a window." ES §9b exposes `validate_event` as "contract conformance only." A single-event validator **cannot** assert cross-event id uniqueness — that's a window-level (array) invariant. So either `validate_event` validates one event (can't check uniqueness) or there's an implied `validateWindow(events[])` that isn't named. The "validator is the single home of the URL allowlist + uniqueness" claim spans two different scopes.
**Fix.** Split explicitly: `validateEvent(e)` (shape + URL allowlist, per-event) vs `validateWindow(events[])` (adds id-uniqueness + sorted-occurrences). Name both; say which is the MCP tool.

### S2-7 · Web component "its own a11y binding" contradicts "hand-roll a11y in the core" (ES §2, §4)
**Problem.** ES §4: a11y is hand-rolled **in the core** (grid roving-focus, focus-trap, keyboard map) precisely so it's reusable by the web component. ES §2: the web component has **"its own a11y binding."** These are in tension — if the focus/keyboard *state model* is in the core (good), the web component only needs DOM event wiring, not "its own a11y binding." If "its own a11y binding" means it re-implements focus management, that defeats the stated reason for not using React Aria. v2 risk: a11y logic forks.
**Fix.** Reword to: core owns the a11y **state model + key handling logic**; each skin (React, web component) provides only the thin **DOM binding** (attaching listeners, applying `tabindex`/ARIA attributes the core computes). Make the core expose an explicit imperative a11y API so both skins bind identically.

### S2-8 · MCP "authoritative calendar-write path" migration is hand-waved and is a live-data hazard (ES §9b)
**Problem.** The decision says MMATF's existing calendar-write tools "become thin wrappers over (or are replaced by) the module's, sharing the same core." But MMATF's current tools encode hard-won disciplines documented in memory: wrong-echo-under-concurrency (`update_event_status`/`create_vendor`), idempotent composite `event_days` ids, citations-required, midnight-UTC anchor handling (`suggest_event` T12:00:00Z), merge preview-not-wired. If the module's generic write tools don't reproduce **every** one of these, the migration is a regression. "Thin wrapper over the same core" assumes the module core already encodes MMATF's behavioral quirks — but the whole point of the module is to carry **no MMATF-isms** (ES §5). These two goals collide directly at the write path.
**Fix.** Before v2 write phase, enumerate MMATF's write-path invariants and decide per-invariant: lives in module core (generic enough) vs. stays in MMATF's adapter/wrapper (MMATF-specific, e.g. citations, midnight-anchor). Don't designate the module authoritative until that table exists. This is a v2 concern but the decision is being locked now — flag it before lock.

### S2-9 · No spec for behavior when `displayTimeZone` is invalid / unresolvable at SSR (ES §5, §8)
**Problem.** `displayTimeZone` is REQUIRED and "MUST be resolvable at SSR render time." But there's no defined behavior if it's absent, malformed, or an unknown IANA zone at render — a Worker render with a bad config would either throw (500, blank page — violating the "never blank grid" state ethos) or silently fall back to UTC (silent wrong-day bug, the exact failure the whole tz model exists to prevent).
**Fix.** Define: invalid/missing `displayTimeZone` is a **hard config error at build/deploy boundary** (fail the deploy, not the request) AND a render-time guard that renders the fetch-error/empty state rather than throwing. Add to Zod (IANA validity) + a Worker test.

---

## S3 — polish / hygiene

### S3-1 · Cross-reference drift: ES §0 cites "ribbon×overflow rule §5/§10a-bis" — §5 is the contract, the ribbon rule is RS §10a-bis (ES §0)
ES §0 says "ribbon×overflow rule §5/§10a-bis." In the ES, §5 is the contract; the ribbon rule lives in **RS** §10a-bis (and §2). The bare "§5" reads as ES §5. Qualify cross-doc refs as "RS §10a-bis." (The docs are otherwise good about RS/ES prefixes — this one slipped.)

### S3-2 · §12 table row ordering is confusing (ES §12)
Rows are numbered 1,2,3,4,**7**,5,6,4b,8 with a footnote explaining the non-monotonic order. The footnote helps, but renumbering linearly (or adding an explicit "v0 order: 1→2→3→4→7" column) would remove the double-take. Minor, but an implementer skims this table.

### S3-3 · "axe is necessary but not sufficient" is correctly stated — credit where due, but name the WCAG version consistently (RS §8b)
RS §8b says "WCAG 2.2 AA" in the body; the design-skills/most-of-doc context and ES don't pin a version. Confirm 2.2 (not 2.1) is intended and state it once in a shared glossary. (The a11y section is genuinely strong — day-granular focus + named focus ACs is the right call and well beyond typical specs. No concern with the substance.)

### S3-4 · `showWeekNumbers` for Month is specified but week-number computation rule (ISO vs US) is not (ES §5, RS §7)
Week numbers differ by locale/standard (ISO-8601 week-of-year vs US). With `weekStartsOn` and `locale` both in config, the week-number basis is ambiguous. State "ISO week numbers when weekStartsOn=1, US when 0" or just "ISO via Luxon" and test one case. Low priority (v1 optional, default false).

### S3-5 · "Print" appears in both RS §7 (house Print in the density menu) and §1/§7 with no print-layout spec (RS §7, ES)
Print is "kept" and "respect the print stylesheet," but neither doc specifies what a printed Month/Agenda looks like (ribbons across page breaks? "+N more" in print?). MMATF memory shows print-sheet is a live, contentious feature. Either descope print from v0/v1 explicitly or add a one-line print-layout AC. Right now it's a half-promise.

### S3-6 · rrule.js / python-dateutil license claim — verify the bundling assertion before relying on it in NOTICE (ES §10)
ES §10 asserts rrule.js = BSD-3-Clause and "bundles python-dateutil (BSD-3-Clause)." The license *family* is plausible and the attribution discipline is correct, but I did not independently verify that the *current* rrule.js version bundles python-dateutil vs. lists it as a dependency (affects whether you must carry its notice). Cheap to confirm at lock time from the actual `node_modules` LICENSE files; flagged "verify before build," not asserted wrong.

### S3-7 · Loading-state AC ("no rendered frame has 0 children and no skeleton") is hard to test as literally written (RS §9)
The observable loading AC asserts "no rendered frame has 0 children *and* no skeleton" — asserting a property over *every rendered frame* is not something RTL/unit tests observe (they see committed DOM, not frames). The intent (no blank flash) is right; the wording promises frame-level observation tests can't do. Reword to a testable form: "at all times between loading→loaded, the events region contains ≥1 skeleton or ≥1 event (never zero children)" — assertable at each render via a state-machine test.

---

## Items I checked and CLEARED (no concern)

- **View keyboard shortcuts** (1/d, 2/w, 3/m, 4/x, 5/a; t, g, /, r) — match live Google docs exactly (verified 2026-06-14). Only the *previous-range* p/k binding (S1-3) is ungrounded.
- **Custom-view v1 inert-ing** (RS §2a, §8a) — correctly handled; the inert-in-v1 `[AC]` properly prevents a v1 test from demanding a v2 view. Good catch by the prior pass.
- **All-day floating / DTEND-exclusive** model (ES §5, §8) — iCalendar-correct, property-tested, off-by-one test specified. Solid.
- **Now-line DST math** (RS §10d, ES §8) — the 1380/1500-minute-day correction via Luxon is right and correctly scoped to v2. No concern.
- **SSR-stable "now" requires server-resolvable displayTimeZone** (ES §8) — the constraint that viewer-derived tz is incompatible with SSR-stable now is correct and well-articulated; MMATF-fixed-`America/New_York` escape hatch is valid.
- **v0 walking-skeleton fence** (ES §0) — realistic, single vertical slice, ships on real runtime. This is the right shape and the riskiest-item callout (step 3) is honest.
- **Security threat model** (ES §7) — appropriately calibrated to read-only; ICS-injection fuzz, URL allowlist in Zod, prototype-pollution-defeats-DOMPurify note are all correct and not over-stated.

---

## Do these first (prioritized)

| # | Severity | Item | Why first |
|---|---|---|---|
| 1 | S1-1 | Contract has no location/map field the RS renders | Contract change → must land before §12-step-2 lock (SemVer-major after) |
| 2 | S1-2 | `ongoing` predicate vs multi-day ribbon undefined | Touches core algorithm (step 3, the riskiest); resolve before TDD starts |
| 3 | S1-6 | "Next upcoming" needs sorted/loaded occurrences the contract doesn't guarantee | Contract + popover behavior; decide engine-computes vs adapter-supplied before lock |
| 4 | S1-3 | p/k keyboard binding ungrounded under a "verified" header | Cheap doc fix; removes a false-parity `[AC]` |
| 5 | S1-4 | Year per-day dot vs per-month presence endpoint mismatch | Defines the Year data API before its phase |
| 6 | S1-5 | Empty-day popover + cell click-target precedence undefined | Month interaction completeness before Month skin (step 4) |
| 7 | S2-2 | Cache key includes client-side filters → hit-rate collapse | Cheap to fix in spec; wrong key design is expensive later |
| 8 | S2-3 | Agenda date-only cursor dup/drop | Before Agenda phase (step 4b) |
| 9 | S2-8 | MCP authoritative-write migration vs MMATF write invariants | Decision being locked now; needs the invariant table before lock |
