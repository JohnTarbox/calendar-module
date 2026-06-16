# Calendar Module — Additional Views Spec (Schedule · Year · Week · Day · Custom)

**Status:** Draft v1.2 · **Filed:** 2026-06-16 · **Owner:** John · **Author:** Claude
**Builds on:** `Calendar-Module-01-Google-Display-Reference-Spec.md` (**RS**) · `Calendar-Module-02-Engineering-Spec-Dev-Handoff.md` (**ES**) — both v1.3, locked.
**Companion handoff:** `Calendar-Module-08-Additional-Views-Kickoff.md` (the build brief). **Review:** `Calendar-Module-07-Additional-Views-Adversarial-Review.md`.
**Precedent:** Month shipped as `@jonnyboats/calendar-react@1.0.1`, live on `/events?view=calendar` (CAL1). This spec promotes the remaining views from the *sketches* in RS §3/§4/§2a + ES §4a to the same buildable standard Month received.

> **Revision note (v1.2, 2026-06-16):** John resolved the §10 open product questions. **Locked:** (Q1) `includePast` governs fully-past periods + Schedule's backward window only — anchored periods always render whole; correct the Month spec wording, not the build (§1.6). (Q2) Schedule row-click is **responsive** — detail popover on desktop, direct navigation to the event page on mobile (`scheduleRowAction: "responsive"`, §2.2/§9). (Q4) Empty-day click shows the **"No events on {date}" popover** (§3.2; match Month's shipped behavior). (Q5) **Custom view is in scope** — build it in v2-b (§5, unchanged). Remaining open: none blocking; Q3/Q6 were resolved in v1.1.
>
> **Revision note (v1.1, 2026-06-16):** applied the independent adversarial review (`Calendar-Module-07`, 3×S1/6×S2/6×S3). **S1 fixes:** (S1-1) multi-day/ongoing events that intersect the window but **start before it** render in a **pinned "Happening now / Ongoing" section** above the Schedule keyset list, keeping the cursor monotonic (§2.1a/§2.3); (S1-2) the Year presence endpoint is **per-day per-category** so the legend filter honors RS §6 "every view" (§1.2/§3.2); (S1-3) Schedule paginates by **event count** (`agendaPageSize`), `agendaWindowDays` dropped, §10-Q6 closed (§2.3/§9). **S2 fixes:** scroll precedence today→now-line wins (§4.2); ongoing band is clickable + a focus stop (§1.5/§4.1/§7.3); strip-expansion tracks the now-line via grid-relative positioning (§4.1); `includePast` = "Load earlier events" button (§2.3); ‹ › hidden in Schedule, Today retained (§1.1/§2); "Today — no events" anchor when today is empty (§2.1). **S3:** collision no-expand-to-fill + Year single-dot logged as deliberate divergences (§6/§3.1); verify 1.0.1 ships sorted-`occurrences[]`+`location` before building (§9); Year tab-stop wording (§7.2).

> **What this document is.** RS and ES already made and locked the hard *decisions* for these views (own-the-engine, occurrences-canonical, Luxon, windowed loading, headless core, displayTimeZone). They did **not** specify them to the AC-as-test / Defined-Equivalent depth that let Month ship drop-in. This doc closes that gap for **Schedule, Year, Week, Day, and Custom** — and only those. It does not re-open any locked decision. Where it must extend the contract or config, it says so explicitly (§9) and flags the SemVer impact.

> **Scope guard.** Month (RS §2) is **built and live** — out of scope here except where a cross-view rule must stay consistent with it. Nothing in this doc changes Month behavior.

---

## 0. Phasing, build order & per-view Definition of Done

The locked phasing (ES §3) is unchanged and this doc **respects it** — it does not collapse all five views into one work order. Build in this order; ship each phase before starting the next.

| Phase | Views | Why this order | Risk |
|---|---|---|---|
| **v1-a** | **Schedule (Agenda)** | Mobile default (closes the mobile story); cheapest — a paginated list, no 2-D layout; reuses the Month occurrence model + popovers wholesale. | Low (pagination cursor is the only sharp edge) |
| **v1-b** | **Year** | Cheap — 12 mini-month grids over a per-day presence map; reuses Month's day-cell + day-popover. No new layout math. | Low |
| **v2-a** | **Week + Day** | The expensive part: the **hour grid + collision layout + now-line**. Day is Week with one column — build them together. | **High (collision layout + a11y of a pixel-positioned grid)** |
| **v2-b** | **Custom** | Configurable N-day range that **reuses the Week/Day time-grid** — small delta once Week/Day exists. Inert in v1 (RS §2a). | Low (rides on v2-a) |

**Within-phase rule:** Schedule before Year (Schedule unblocks mobile and is the single highest-value remaining view); Week+Day before Custom (Custom is a parameterization of them).

**Do NOT, in this work, build** (still fenced per ES §0): the web component, the MCP server (read or write), the Cowork skill, the Deploy-to-Cloudflare template, or the v2 write surface (blocked on K25). This spec is **display/read views only**.

### Definition of Done — per view

Each view is "done" when, against the contract and fixtures (then real data in a connected env):

- **Schedule:** renders a forward-from-now paginated list grouped by day in `displayTimeZone`; scroll-to-load with a composite cursor that never dups/drops at a page boundary; multi-day & ongoing events appear per the §1.5 table; empty/loading/fetch-error states present; row-click opens the detail popover (or event page, host's choice); full keyboard list semantics; axe passes; is the **mobile default**; all §2 ACs green.
- **Year:** 12 mini-months dot exactly the days the per-day presence map marks; click a dotted day hydrates + opens its day popover; click a month title → Month; today-disc present; year prev/next + "2026" title; a11y per §7.2; all §3 ACs green.
- **Week/Day:** all-day strip + hour grid; collision layout per §6 (no two blocks in a cluster visually overlap; deterministic); now-line correct incl. DST days and absent when today not visible; cross-midnight & multi-day handling per §1.5/§4; default scroll anchor per §4; a11y per §7.3; all §4 ACs green.
- **Custom:** renders the configured N-day range on the Week/Day grid; `x`/`4` shortcut + switcher entry go live; prev/next moves by exactly N days (contiguous, non-overlapping); all §5 ACs green. (And: in v1 builds it stays inert, RS §2a.)

---

## 1. Cross-cutting rules (apply to every view in this doc)

These are the threads that must stay consistent across views. Get them wrong once and every view inherits the bug.

### 1.1 View switching & navigation invariants (extends RS §1)

- **Last-used view persists** across visits (already RS §1); the default is **Month on desktop, Schedule on mobile**. Switching views **preserves the anchor date** — the date currently in focus/centre, not the period boundary.
- **Range-title format per view:**

  | View | Title format | Example |
  |---|---|---|
  | Schedule | a static label (no discrete period) | "Upcoming" |
  | Year | the year | "2026" |
  | Week | week span | "Jun 14 – 20, 2026" |
  | Day | the day | "Tuesday, June 16, 2026" |
  | Custom (N days) | the N-day span | "Jun 16 – 19, 2026" |

- **Prev/next period size per view:** Schedule = **‹ › hidden** (the model is scroll + Today; a scroll-paginated list has no discrete period — review S2-5); Year = 1 year; Week = 1 week; Day = 1 day; Custom = **N days** (the whole visible range, so consecutive ranges are contiguous and non-overlapping — §5). **Today** is retained in every view (scrolls Schedule to today's group / now).
- **Round-trip property tests (extend RS §1):** for **every** view, Next→Previous returns to the identical range; a view-switch→switch-back returns to a range still containing the original anchor date; Today returns to the period containing real-now. Three distinct code paths, each tested per view.

### 1.2 Data window per view & endpoints (finalizes ES §4a)

Each view fetches **only what it shows** (windowed loading is mandatory, ES §4). These are **distinct Worker routes** — spec and test each before its phase. Cache keys are **window + tenant + cache-epoch, never client-side category filters** (ES §8, S2-2): category visibility is applied client-side from core state in **every** view.

| View | Window fetched | Payload | Endpoint shape |
|---|---|---|---|
| Schedule | rolling window of N days from the anchor (default forward; `includePast` extends backward) | full payloads | `GET /events?from=&to=&cursor=` — keyset-paginated (§2.3) |
| Year | the 12 months of the year | **per-DAY, per-CATEGORY presence set** (dates + category labels, no payloads) (S1-4 / review S1-2) | `GET /events/presence?year=` → `{ "2026-03-14": ["craft-fair","music"], … }` (or a per-day category bitmask) |
| Week / Custom | the visible N days | full payloads | `GET /events?from=&to=` (the windowed Month endpoint generalizes) |
| Day | the visible day | full payloads | same windowed endpoint, 1-day range |

- **Day-payload hydration (Year):** the presence endpoint returns dates + category labels only; clicking a dotted day fetches **that day's** full payload (the existing windowed endpoint, 1-day range) and opens the day popover. Never ship full payloads in the Year window.
- **Filtering is client-side** in all views (RS §6 legend filter is core state). The server caches the **unfiltered** window. **Year is no exception:** because the presence set carries per-day **category labels**, unchecking a category recomputes Year dots client-side (a day keeps its dot iff ≥1 *unfiltered* category remains) — satisfying the locked RS §6 "removes from every view" AC.

### 1.3 Timezone bucketing (one rule, every view)

Day-bucketing/grouping/positioning use **`CalendarConfig.displayTimeZone`** for **timed** occurrences; **all-day/date-only occurrences float** (bucket on their literal date, never shifted). A timed occurrence **buckets into its `displayTimeZone` day** and renders its **wall-clock time in `Occurrence.timezone`** (falling back to `displayTimeZone`) — ES §8 two-tz precedence (S2-1). This governs: Schedule's date grouping, Year's dotting, Week/Day/Custom's column placement and now-line. **Workers `Date` is UTC — never infer tz.** SSR-stable "now" holds only because `displayTimeZone` is server-resolvable (MMATF = fixed `America/New_York`).

### 1.4 States (every view) (extends RS §9)

Each view implements the three observable states with known test ids:
- **Loading:** at every render in `loading → loaded`, the content region has **≥1 skeleton OR ≥1 item** (never zero children) — state-machine test, not frame observation (S3-7). Skeleton shape is view-appropriate (Schedule = list rows; Year = 12 month outlines; Week/Day = an empty hour grid).
- **Empty window:** a single empty-state element with a known test id (not an error, not a spinner).
- **Fetch error:** non-blocking error state + retry affordance (known test id) that **preserves chrome/navigation**; the previously-loaded window stays visible if present. Never a blank grid.

### 1.5 Multi-day & "Ongoing" events across views (THE cross-view consistency rule)

Month already resolved this for itself: a multi-day occurrence draws a **ribbon**; an occurrence with `ongoing===true` (span > 14d strict) is **excluded from ribbon packing** and renders as the **"Ongoing through {date}" band** (RS §10a/§11). The other views must each define the same two cases or they'll diverge. **This table is normative:**

| Occurrence kind | Schedule | Year | Week / Day / Custom |
|---|---|---|---|
| **Single-day timed** | one row under its day | dots its day | a positioned block in its day column |
| **Single-day all-day** | one row under its day, time = "All day" | dots its day | a bar in the **all-day strip** of its day column |
| **Multi-day (≤14d), all-day or timed** | **one row, once** — under its START day if the start is in the window, **else in the pinned "Happening now" section** (§2.1a) if it intersects the window — labelled with the date range ("Jun 1 – 5") — **not** repeated per day | dots **every day it spans** | a **horizontal ribbon in the all-day strip** spanning the covered day columns (clipped at week/range edges, continuation affordance) — **not** a tall timed block |
| **Ongoing (> 14d strict)** | **one row, once** — in the pinned "Ongoing" section (§2.1a) if it started before the window, else under its start day — labelled "Ongoing through {date}", never per-day | dots **every day it spans** (it is a real presence) | **one band pinned above the grid** (like Month's ongoing band), spanning the visible range; **clickable → detail popover**, a keyboard focus stop (§7.3); **excluded** from all-day-strip ribbon packing and from the hour grid |

> **Why Schedule pins instead of hoisting (review S1-1):** a forward-from-now Schedule (§2.3) would otherwise *drop* a multi-day/ongoing event whose only anchor day is in the past — i.e. the events most worth surfacing (live right now) would vanish. Hoisting them inline would break the keyset cursor. So they render in a **separate pinned section above the keyset list** (§2.1a); the paginated stream then carries only occurrences whose **start is in the window**, keeping the cursor monotonic.

- **Rationale for Schedule once-at-start:** a chronological list must not flood (the exact failure the calendar rebuild exists to fix). A weekly market is multiple *occurrences* (each its own row on its real day — correct); a single 5-day occurrence is **one** row.
- **Rationale for Week/Day "multi-day → all-day strip, not a tall block":** a timed event that spans days is semantically an all-day-strip ribbon (consistent with Month and with Google); a 48-hour-tall hour-grid block is unreadable. Only **single-day** timed events get positioned blocks in the hour grid.
- **Year dots every spanned day** because the presence map is per-day truth; an ongoing event is genuinely present every day.
- **[AC/property test]** a 20-day occurrence: Schedule = exactly 1 row; Year = a dot on each of its ≤ 365 days; Week/Day = exactly 1 ongoing band, 0 hour-grid blocks, 0 all-day-strip ribbons.

### 1.6 Past events (resolves the open CAL1 question)

The CAL1 go-live left one question: with "Include past events" unchecked, the **current** month's already-passed days still render populated. **RESOLVED (John, 2026-06-16):** `includePast=false` governs **fully-past windows and the list/cards/table**, not the past days of the *currently-anchored* period. So:
- **Month/Week/Day/Custom/Year** always render their anchored period in full, including its own already-passed days (a calendar period is shown whole — hiding past days of the current week leaves holes). `includePast` controls whether the user can *navigate to* / *page into* fully-past periods and whether past events appear in **Schedule**.
- **Schedule** is the view where `includePast` is load-bearing: default window is **forward from today**; `includePast=true` **prepends** a past window (backward pagination, §2.3).
- **Action:** adopt this and **correct the Month spec wording** ("default = past days render empty") to match the shipped build, rather than changing the build. **This closes the CAL1 verification question** — no AC gates on blanking past days of the current period.

### 1.7 Render safety & SSR (unchanged, restated because new views render new strings)

- Never `dangerouslySetInnerHTML` on untrusted content; the **Zod URL/`mapUrl` protocol allowlist** is the single gate (ES §7). New surfaces that render links — Schedule rows ("View event page", "Get directions"), Year/day popovers — go through it.
- Engine is **SSR-safe**: no `window`/`document` at import/render; "now/today" renders stable on server + first client paint, updates post-mount (no hydration mismatch). The now-line and today-disc in the new views obey this.

---

## 2. Schedule / Agenda view (v1-a — mobile default)

The chronological list. Highest-value remaining view; build first.

### 2.1 Layout
- Vertical, chronological, **grouped by date** (grouping day computed in `displayTimeZone`, §1.3). **Dates with no events are skipped** (no empty rows).
- **Date group header:** weekday + date ("Tue · June 16"); a **"Today" marker** on today's group. Sticky header optional (visual-regression baseline, not an AC).
- **Event row:** `color dot (category) · time (or "All day") · title · location`. Location is the engine-rendered `Occurrence.location` (contract field, ES §5). Time shows the occurrence wall-clock in `Occurrence.timezone` (§1.3).
- **Row order within a day:** all-day rows first, then timed rows ascending by start (mirrors Month's stacking intent).
- Multi-day / ongoing rows per the §1.5 table (once; pinned section or under start day).
- **"Today" anchor:** the top of the forward list always shows today's group; **if today has no events, render a "Today — no events" anchor row** (or a "next event in N days" hint) so the user always sees where "now" is, even though empty dates are otherwise skipped.

### 2.1a Pinned "Happening now / Ongoing" section (review S1-1)
- A **pinned section above the paginated list** holds every multi-day (≤14d) and ongoing (>14d) occurrence that **intersects the window but started before it** — the live-right-now events that a forward-only window would otherwise drop. Each renders **once**, range- or "Ongoing through {date}"-labelled, sorted by end-soonest-first.
- These rows are **not** part of the keyset stream (§2.3), so they never perturb the cursor. An occurrence whose **start is within the window** is **not** pinned — it appears inline under its start day per §1.5.
- **[AC]** a multi-day event spanning `[yesterday, tomorrow]` appears in the pinned section on a forward-only Schedule; the keyset stream contains no occurrence whose start precedes the window.

### 2.2 Interactions
- **Row click → responsive (John, 2026-06-16):** **detail popover on desktop, direct navigation to the event page on mobile.** Driven by `scheduleRowAction: "responsive"` (§9; the `"popover"` / `"navigate"` explicit values remain for other consumers). The desktop/mobile split is at the module's responsive breakpoint (the same one that picks Month-vs-Schedule as the default view). **[AC]** above the breakpoint a row-click opens the popover; below it, navigates to the event page.
- **"Next upcoming" line** (RS §5a) is **not** shown in Schedule — the list is already forward-chronological, so every visible row is its own next instance.
- Add-to-calendar (`.ics`) action available in the row's detail popover (engine-provided, ES §9c).

### 2.3 Pagination (the one sharp edge) (finalizes ES §4a, S2-3; review S1-3/S2-4)
- **Paginate by event count, not a day-window.** First render = the first **`agendaPageSize`** occurrences (§9) from the anchor (today); there is no separate `agendaWindowDays` (dropped — a keyset list has no fixed day-window). The pinned section (§2.1a) is rendered separately and is not counted against the page.
- **Scroll-to-load:** on scroll-near-end, fetch the next page with a **composite keyset cursor `(start, occurrenceId)`** compared strictly (`>`). A date with more events than a page boundary **never dups and never drops** an occurrence.
- **Empty tail = sentinel:** when a page returns empty, render "No more upcoming events" and stop paging.
- **`includePast=true`:** a **"Load earlier events" button** at the top of the list prepends one `<`-cursor page on demand (a second `(start, occurrenceId)` cursor compared `<`). This is **the** mechanism — not bidirectional infinite scroll (simpler, testable, no scroll-anchor fights). The past page is disjoint from the forward window by construction (strict `<` vs `>=` anchor).
- **[AC/test]** a date with > `agendaPageSize` events paginates with **no duplicate and no dropped occurrence** (the canonical keyset test); empty tail shows the sentinel and halts; the "Load earlier" page never overlaps the forward window.

### 2.4 Acceptance criteria (→ named tests)
- **[AC]** Empty dates produce no row; rows are ascending chronological; a multi-day occurrence appears exactly once (§1.5).
- **[AC]** Row click opens the detail popover (or navigates, per host config); the `.ics` action yields a valid file for that occurrence.
- **[AC]** Pagination: keyset no-dup/no-drop across a fat-date boundary; sentinel on empty tail; `includePast` backward window doesn't overlap forward.
- **[AC]** Date grouping is computed in `displayTimeZone` (a near-midnight timed occurrence groups under its `displayTimeZone` day — property test, ties to §1.3).
- **[AC]** Schedule is the default view on a mobile viewport; last-used persists.
- **[AC]** Loading shows ≥1 skeleton row or ≥1 event at every render; empty-window and fetch-error states have their test ids.

---

## 3. Year view (v1-b)

12 mini-months over a cheap per-day presence map.

### 3.1 Layout
- **12 mini-month grids**, responsive (e.g. 4×3 desktop, 2-wide tablet, 1-wide mobile — exact breakpoints are visual-regression baselines, not ACs). Each mini-month is the Month day-cell grid in miniature: weekday header honoring `weekStartsOn`, muted adjacent-month days, **today-disc** on the real current day.
- **Per-day dot:** a day with ≥1 *unfiltered* event shows a **single presence dot** under its number (not a count — the presence map carries category labels but no counts). **Deliberate divergence (record, don't "fix" later):** Google shows up to a few dots; we show one presence dot per day. Dot uses a neutral/accent token, **not** category color (Year has no room for a legend per cell; category color returns in the day popover).

### 3.2 Data (S1-4 — per-day; review S1-2 — per-category)
- Window = **per-DAY, per-CATEGORY presence set for the 12 months** (`GET /events/presence?year=`), dates + category labels, **no payloads**. A per-*month* boolean **cannot** dot individual days — the endpoint is per-day. Carrying category labels (a tiny set per day) lets the client-side legend filter recompute dots (RS §6, §1.2). Cheap: a date→categories map / bitmask.
- **Hydrate on click:** clicking a dotted day fetches that day's full payload (windowed endpoint, 1-day range) → **day popover** (RS §5b). The day popover lists every event for the date.
- **Empty-day click → "No events on {date}" popover (John, 2026-06-16):** clicking an undotted day opens the day popover showing **"No events on {date}"** + a "View full day →" link (RS §5b), the same as Month's empty-cell behavior — confirm parity with what Month actually shipped before building. Consistent click feedback whether or not a day has events.

### 3.3 Interactions & navigation
- **Click a dotted day → day popover** (after hydration).
- **Click a month title → Month view** anchored to that month.
- **Prev/next = previous/next year**; range title = "2026"; **Today** jumps to the current year and is disabled when the current year is in view.

### 3.4 Acceptance criteria
- **[AC]** Year dots **exactly** the days the presence map marks (property test against a known presence set); an ongoing/multi-day occurrence dots every day it spans (§1.5); unchecking a category removes dots for days whose *only* categories were filtered, and keeps dots where an unfiltered category survives (RS §6 filter, review S1-2).
- **[AC]** Clicking a dotted day fetches and opens its day popover with the full set; clicking an undotted day does the configured empty-day behavior; clicking a month title navigates to that Month.
- **[AC]** today-disc renders on the real current day in `displayTimeZone`; SSR-stable (no hydration flip).
- **[AC]** the Year window request carries **no event payloads** — dates + category labels only (asserts the cheap-presence contract — guards against a regression that ships full payloads).

---

## 4. Week & Day views (v2-a — the time-grid)

The expensive phase. Day = Week with a single column; build together. **All time math in `displayTimeZone` via Luxon.**

### 4.1 All-day strip (pinned top)
- Full-width strip **above** the hour grid. **All-day single-day** events → bars; **multi-day** events (≤14d) → horizontal **ribbons** spanning the covered day columns, clipped with continuation affordance at the visible-range edges (consistent with Month §2). **Ongoing (>14d)** → the **band above everything**, not in the strip (§1.5); the band is **clickable → detail popover** and a keyboard focus stop (§7.3).
- **Strip overflow:** if a day column's all-day stack exceeds the strip's lane cap, show a **"+N more"** in that column that expands the strip (Google parity). Same per-cell semantics as Month §10c (per-column count, not row-summable; S2-4).
- **Strip expansion vs the now-line (review S2-3):** the now-line is positioned **relative to the hour grid's top**, not the viewport — so when "+N more" expands the strip and pushes the grid down, the now-line tracks the grid correctly; expansion must **preserve the user's scroll** (no jump).
- **[AC]** a 3-day all-day event Fri–Sun renders as **one** ribbon across 3 columns (DTEND-exclusive; ties to ES §5 span table), never 3 bars.

### 4.2 Hour grid
- **Vertical axis = hours**, one label per hour; **column(s) = day(s)** (7 for Week honoring `weekStartsOn`, 1 for Day). Hour-label format from `locale` (12h/24h via Luxon).
- **Timed single-day event = a block** positioned at its start, **height ∝ duration**, with a **minimum rendered height** (`minBlockPx`, §9) so a 15-minute event stays legible/clickable (visual only — does not change collision math, which uses true times).
- **Default scroll anchor — precedence (review S2-1):** (1) if **today is in the visible range**, scroll to bring the **now-line** into view; else (2) the **earliest event** in the window; else (3) **`weekScrollAnchorHour`** (default ~7 AM). One `[AC]` per branch.
- **Concurrent events** split the column via the §6 collision Defined Equivalent.
- **Click an empty slot → no-op** (read-only; MMATF may open the day — host choice); **click a block → detail popover** (RS §5a).

### 4.3 Multi-day & cross-midnight timed events
- **Multi-day timed** events (span > 24h) render in the **all-day strip as a ribbon** (§1.5), **not** as a tall hour-grid block.
- **Cross-midnight single occurrence** (e.g. 23:30 + 60 min, or 20:00–02:00): renders a **clamped segment in each day column it touches** — a block from 23:30 to midnight in day 1 and 00:00 to 00:30 in day 2 — each segment clickable, both opening the same occurrence's popover. This is the fuzz-corpus midnight case (ES §5/§6). **[property test]** a cross-midnight occurrence occupies both days, clamped, with no negative/overflow height.

### 4.4 Now-line (Week/Day only) (finalizes RS §10d)
- A horizontal **line across today's column** at the current local time. `y = (minutesSinceMidnightLocal / dayLengthMinutes) × gridHeight`, computed in `displayTimeZone`.
- **DST:** `dayLengthMinutes` is the **actual** length of the day in `displayTimeZone` (1380 on spring-forward, 1500 on fall-back), via Luxon — **not a fixed 1440**, or the line drifts ~1h on transition days.
- Updates on a **post-mount timer**; **renders only when today is in the visible range**; **SSR-safe** (no server now-line that hydrate-mismatches).
- **[AC]** position matches current local time incl. DST-transition days; absent when today not visible; no hydration mismatch.

### 4.5 DST & the grid itself
- The hour grid renders the **real day length** in `displayTimeZone`: on spring-forward the 2 AM hour is absent (or shown collapsed); on fall-back the repeated hour is handled without duplicating events. An event whose nominal time lands in the spring-forward gap renders at the post-shift wall-clock (Luxon's resolution). **[fuzz]** random date × zone through the grid (corpus already includes spring-forward, ES §6) — no block renders with negative height, NaN offset, or outside the grid.

### 4.6 Acceptance criteria (consolidated; §6 carries the collision ACs)
- **[AC]** all-day strip: multi-day ribbon spans correct columns, DTEND-exclusive; strip "+N more" per-column.
- **[AC]** timed block height ∝ duration with `minBlockPx` floor; default scroll anchor correct (earliest event / 7 AM / now-when-today).
- **[AC]** cross-midnight occurrence clamped into both days; multi-day timed event goes to the strip, not the grid.
- **[AC]** now-line per §4.4; DST grid per §4.5.
- **[AC]** click block → popover; click empty slot → no-op/host action; Week honors `weekStartsOn`.

---

## 5. Custom view (v2-b — configurable N-day range)

A parameterization of the Week/Day time-grid. **Inert in v1** (RS §2a): the `x`/`4` shortcut and the switcher entry are hidden/no-op until v2.

- **Range:** a horizontally-laid **N-day range**, **default 4 days**; configurable `customViewDays` in **2–7** (§9). Above 7 days, recommend Month (do not extend the time-grid to multi-week — that's a different layout). Renders with the **same all-day strip + hour grid + collision layout + now-line** as Week/Day (§4, §6).
- **Navigation:** prev/next moves by **exactly N days** (the full visible range) → consecutive ranges are **contiguous and non-overlapping**; range title = the N-day span ("Jun 16 – 19, 2026"). Today brings the range to include today.
- **Activation:** in v2, `x`/`4` and the Custom switcher entry become live. **[AC]** in v1 builds `x`/`4` is a no-op and Custom is absent from the switcher; in v2 it renders the configured N-day range and prev/next steps by N days with no gap/overlap.

---

## 6. Collision layout — Defined Equivalent (the hard algorithm) (finalizes ES §10b)

The constants/rules here are **ours**, deterministic, and the spec of record for Week/Day/Custom timed-block layout. Property-tested.

**Inputs:** the set of **single-day timed occurrences** in one day column (multi-day/all-day/ongoing are handled by the strip/band, §1.5, and excluded here).

**Algorithm:**
1. **Sort** by (start asc, then end desc — longer first, then stable `occurrenceId`).
2. **Connected overlap clusters:** two occurrences are adjacent iff their `[start, end)` intervals overlap (strict; touching at an endpoint does **not** overlap — back-to-back events share no column space). Transitively close into clusters. (A "now-active set" sweep over sorted starts computes this in one pass.)
3. **Column assignment within a cluster:** greedy by start — each occurrence takes the **lowest-indexed column free at its start**; `maxConcurrent` = the cluster's peak simultaneous count = the number of columns.
4. **Geometry:** within a cluster, each block's `width = clusterWidth / maxConcurrent`; `x-offset = columnIndex × width`; `y = (startMinutes/dayLen) × gridH`; `height = max(((end−start)/dayLen) × gridH, minBlockPx)`.
5. **Non-overlapping event** (cluster of 1) spans **full column width**.

**Deliberate divergence (record, don't "fix" later — review S3-1):** Google *expands* a block to absorb free space to its right when no later-column event overlaps it. This Defined Equivalent uses **fixed equal-width** columns (`clusterWidth / maxConcurrent`) and does **not** expand-to-fill. That is intentional (the constants are ours); log it like RS §11's "no weekend shading" so it isn't filed as a bug. Visual-regression baseline, not an AC.

**Edge cases (each an explicit test):**
- **Zero-duration / end ≤ start:** clamp to `minBlockPx` height (treated as an instantaneous marker); does not create a phantom overlap with the next event.
- **Block shorter than `minBlockPx`:** the **rendered** height floors at `minBlockPx` but **collision uses the true interval** — so two 5-minute events 10 minutes apart do **not** share a column even if their painted boxes would touch (visual overlap of floored boxes is accepted; never widen a column off a render floor).
- **Determinism:** identical input + day ⇒ identical column assignment (relies on stable `occurrenceId`).

**[AC] invariants (property-tested):**
- No two blocks in a cluster occupy overlapping time **and** the same column.
- A non-overlapping event spans full width.
- `maxConcurrent` columns exactly accommodate the cluster's peak concurrency (no block exceeds the column count).
- Deterministic across repeated/windowed loads.

---

## 7. Accessibility per view (extends RS §8b — three different interaction models)

Month uses a **day-granular ARIA grid** with roving cell focus + day-popover for event access (RS §8b). The new views are **not all grids** — forcing one model on a list and a pixel-positioned time-grid would break a11y. The **core owns the a11y state model + key handling per view-type**; skins only bind DOM (ES §2/§4, S2-7).

### 7.1 Schedule — **list**, not a grid
- `role="list"`; each event row is a focusable `listitem`/button. **Tab / roving** moves row-to-row in DOM (chronological) order; **Enter/Space** opens the row's detail popover (or navigates). Date-group headers are headings (`role="heading"`) for screen-reader navigation, not focus stops.
- Popover focus-trap + Esc-returns-focus identical to Month.
- **[AC]** full keyboard operation: arrow/Tab through rows, Enter opens, Esc returns focus to the row; axe passes; new content loaded by pagination is announced (polite live region) or at minimum focus is not lost on append.

### 7.2 Year — **grid of grids**
- Each mini-month = **two tab stops**: the **month title** (a button → Month view) and the **grid** (a standard ARIA grid = one tab stop with internal **arrow roving** cell-to-cell, wrapping at row ends like Month). 12 months = 24 tab stops. **Moving between months:** Tab advances title→grid→next-title. Do **not** attempt 2-D roving *across* the 12-month layout (spatially ambiguous, a11y-hostile).
- **Enter on a dotted day** opens its day popover (after hydration); Enter on the month title → Month view.
- **[AC]** keyboard: arrows rove within a month and wrap; Tab moves month→month; Enter on a dotted day opens the popover (focus moves into it), Esc returns; axe passes on all 12.

### 7.3 Week/Day/Custom — time-grid (the hard one)
- A pixel-positioned hour grid is **not** a clean ARIA grid. Model: **day-column headers are focusable** (Enter → that Day view); **timed blocks and all-day items are focusable in chronological DOM order within the visible range** (Tab order = time order); **Enter/Space on a block → detail popover**. Arrow Left/Right at the header level moves between day columns; arrow Up/Down is **not** bound to pixel navigation (avoid spatial roving over overlapping blocks).
- This mirrors Month's principle: **never force keyboard users to spatially hunt overlapping chips** — linear focus order + popover is the reachable path, exactly as Month uses the day-popover.
- All-day-strip "+N more" is a focusable button that expands the strip (the expanded items then enter the Tab order).
- now-line and empty slots are **not** focus stops.
- **[AC]** every event (hour-grid block, all-day bar, ongoing band) is reachable and openable by keyboard via linear focus order; column headers reachable; Esc returns focus to the trigger; axe passes; **no keyboard trap** in the grid.

**Across all views:** WCAG 2.2 AA contrast in light + dark; visible focus indicators; `?` shortcuts overlay lists the **currently-available** views' shortcuts (`x`/`4` listed only in v2). axe is necessary-not-sufficient — the named keyboard ACs above are the real gate (RS §8b).

---

## 8. Testing additions (the spec is the test backlog — ES §6)

Every `[AC]` above is a named test. New property/fuzz additions beyond Month's set:

- **Schedule keyset pagination** (property): for any event set + any pageSize, forward paging visits **every** occurrence exactly once, in order, with no dup/drop across boundaries; backward (`includePast`) window is disjoint from forward.
- **Collision layout** (property, §6): no same-column time-overlap; full-width for solitary; column count = peak concurrency; deterministic; the floored-min-height case never widens a column.
- **Cross-midnight & multi-day** (property): a cross-midnight occurrence occupies both days clamped; a multi-day timed event renders in the strip with zero hour-grid blocks; a 20-day ongoing event = 1 band / 0 ribbons / 0 blocks (the §1.5 cross-view assertion, run per view).
- **Year presence** (property): dots == presence set; window carries no payloads.
- **Now-line DST** (property/example): position correct on 1380- and 1500-minute days; absent when today not visible; SSR-stable.
- **TZ grouping/bucketing** (property): near-midnight timed occurrence groups/positions on its `displayTimeZone` day (Schedule grouping, Week/Day column placement).
- **Navigation round-trips** (property, per view): Next↔Prev, view-switch↔back, Today — each returns to the identical anchor (§1.1).
- **Fuzz** (extends ES §6 corpus): the time-grid against random date × zone (spring-forward, fall-back, century spans, 10k same-day overlaps → must not hang, no NaN/negative geometry). Persist any failing seed as a permanent regression.
- **Worker/data layer:** Year presence endpoint + Schedule keyset endpoint tested in `@cloudflare/vitest-pool-workers` (workerd parity, `TZ=UTC`).

---

## 9. Contract & config additions (SemVer impact called out)

The **`CalendarEvent`/`Occurrence` contract does NOT change** for these views — Month added `location`/`mapUrl` and the sorted-`occurrences[]` guarantee that Schedule/Year/Week/Day all consume. **No contract version bump is required** — **but verify those actually shipped in the published `@jonnyboats/calendar-react@1.0.1` `.d.ts`** before building against them (review S3-3); if any is absent it's a **major** bump that must precede the new views.

**`CalendarConfig` gains optional, additive fields** (consumers ignore unknown keys → **minor** bump, ES §5 forward-compat):

| Field | Type / default | Drives |
|---|---|---|
| `agendaPageSize` | number, default 25 | Schedule keyset page size — events per page (§2.3). *(`agendaWindowDays` removed — review S1-3: a keyset list paginates by count, not a day-window.)* |
| `customViewDays` | 2–7, default 4 | Custom view range (§5) |
| `minBlockPx` | number, default e.g. 22 | Week/Day timed-block minimum rendered height (§4.2, §6) |
| `scheduleRowAction` | `"responsive" \| "popover" \| "navigate"`, default `"responsive"` | Schedule row-click behavior — `"responsive"` = popover desktop / navigate mobile (§2.2) |
| `weekScrollAnchorHour` | number, default 7 | Week/Day default scroll fallback, branch (3) (§4.2) |

All optional with defaults → **no existing consumer breaks**; MMATF can adopt defaults and override later. Validate ranges in Zod (e.g. `customViewDays` 2–7, hours 0–23).

---

## 10. Open questions — ALL RESOLVED (John, 2026-06-16)

1. ~~**Past-events default (CAL1 carryover, §1.6)**~~ — **RESOLVED:** `includePast` governs fully-past periods + Schedule's backward window only; anchored periods always render whole → correct the Month spec wording, not the build. Closes the CAL1 verification.
2. ~~**Schedule row-click default (§2.2)**~~ — **RESOLVED:** **responsive** — detail popover on desktop, direct navigation on mobile (`scheduleRowAction: "responsive"`).
3. ~~**`includePast` mechanism**~~ — **RESOLVED (review S2-4):** a "Load earlier events" button (§2.3).
4. ~~**Empty-day click in Year/Month (§3.2)**~~ — **RESOLVED:** show the "No events on {date}" popover (match Month's shipped behavior).
5. ~~**Custom view — wanted for MMATF? (§5)**~~ — **RESOLVED:** **yes, build it in v2-b** (rides on the Week/Day time-grid).
6. ~~**`agendaPageSize` axis (days vs count)**~~ — **RESOLVED (review S1-3):** event count; `agendaWindowDays` dropped (§2.3/§9).

**No open product questions remain — the spec is fully locked and ready to build.** One pre-build *verification* (not a decision) carries over from the review: confirm the published `1.0.1` `.d.ts` ships sorted-`occurrences[]` + `location`/`mapUrl` (§9, review S3-3).

---

## 11. Decisions log (this doc)
Respect locked phasing — v1 Schedule+Year, v2 Week/Day+Custom (one spec, phase-tagged) · Schedule first (mobile default, cheapest), Year second, Week+Day together, Custom rides on them · multi-day = once-at-start in Schedule / dot-every-day in Year / all-day-strip-ribbon in Week-Day · ongoing (>14d) = one row / dot-every-day / one band-above-grid · Year window = per-DAY presence (no payloads), hydrate-on-click · Schedule = composite keyset cursor `(start, occurrenceId)`, sentinel tail · Week/Day = collision Defined Equivalent §6, min-block-height visual-only, cross-midnight clamped both days, multi-day→strip · now-line Week/Day-only, DST via real day length · a11y per view-type (list / grid-of-grids / linear-focus time-grid), core owns model + skins bind DOM · contract unchanged (no bump); config gains additive optional fields (minor bump) · past-events resolution recommended (confirm) · Custom default 4 days, prev/next by N (contiguous), inert in v1.
