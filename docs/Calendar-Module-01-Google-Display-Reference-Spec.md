# Google Calendar — Display Reference Spec

**Status:** Draft v1.3 · **Filed:** 2026-06-14 · **Owner:** John · **Author:** Claude
**Revision note (v1.3):** applied the independent adversarial review (`Calendar-Module-04`) — **corrected the keyboard grounding** (`p`/`k` previous is a module convention, NOT in Google's table; the "verified" claim was wrong); `ongoing` occurrences excluded from ribbon lane-packing (§10a/§11); empty-day popover + cell click-target precedence (§2/§5b); "+N more" is per-cell, not row-summable (§10c); Year dots are per-DAY (so the presence endpoint is per-day, ES §4a); print deferred past v1; loading AC reworded testable; `location`/`mapUrl` now carried in the contract (ES §5).
**Revision note (v1.1):** incorporates the Spec Review & Punch-List (`Calendar-Module-03-…`) — added the ribbon×overflow rule (§10a-bis), Custom-view definition (§2a, v2), precise popover/next-occurrence semantics (§5a), day-granular focus + named keyboard ACs (§8b), all-day-floating + now-line(v2) tags, host-hook reframing of MMATF bindings, and observable rewrites of qualitative ACs. (Date verified: it is genuinely 2026-06-14.)
**Revision note (v1.2):** self-review hardening pass — added a **fetch-error state** (§9), **Add-to-calendar/.ics** action in the popover (§5a), **week-start/weekends/week-numbers** controls (§2/§7), Agenda row-click + tz-grouping (§4); fixed a broken cross-ref (§3 → §10b).
**Purpose:** A behavior-complete, testable specification of how Google Calendar **displays and navigates** events. This is the *reference foundation* for the MMATF Calendar Module (see companion doc `Calendar-Module-02-Engineering-Spec-Dev-Handoff.md`). Build the engine to this spec; the module's own value-adds and deltas live in the companion doc.

## Scope & method

- **In scope:** the read/browse/display half of Google Calendar — chrome, views, event rendering, popovers, navigation, keyboard, accessibility, responsive behavior.
- **Out of scope (deliberately):** all authoring/personal-calendar features — create/edit/drag-to-create, invitations, "My calendars"/"Other calendars" account lists, Tasks/Keep, settings sync, sharing. Our module is a **read-only browse calendar**, so these never apply.
- **Grounding:** the drift-prone specifics below (keyboard map, view names/shortcuts, density settings) were verified **2026-06-14 against Google's current official Help docs** (`support.google.com/calendar`), not from memory. Items that cannot be read off the product or docs — exact lane-packing, collision geometry, overflow thresholds, pixel breakpoints — are specified as **Defined Equivalents**: our own deterministic rules that produce Google-equivalent results. Constants in those sections are *ours*, not reverse-engineered.
- **Legal note:** this specifies *observable behavior* (legitimate). It does not copy Google's code, assets, or trademarks.

Each rule is written to be implementable and testable. Acceptance criteria are marked **[AC]**.

---

## 1. Global chrome (all views)

Top bar, left → right:
- **"Today"** button — jumps to the period containing the real current date; disabled/greyed when already viewing today's period. **[AC]** From any other period, clicking Today returns to the current period; the control is disabled when today is in view.
- **‹ ›** previous/next arrows — move by exactly one period of the current view (one month in Month, one week in Week, etc.). **[AC]** Next then Previous returns to the identical range.
- **Navigation round-trip invariants (property-tested):** in addition to Next↔Previous, (a) a **view-switch round-trip** — switching to another view and back returns to a range that still contains the original anchor period; and (b) a **mini-month jump round-trip** — jumping to a date via the mini-month picker and back via Today returns to the original period. These are distinct code paths from prev/next and each gets its own round-trip property test.
- **Range title** — context-dependent: "June 2026" (Month), "Jun 1 – 7, 2026" (Week), "June 1, 2026" (Day), "2026" (Year).
- Right side: **view switcher** — Day · Week · Month · Year · Custom · Schedule(Agenda). Plus a **search** affordance and a **settings/density** menu (§7).

Default landing: the period containing **today**. **[MMATF adaptation]** remember the user's last-used view across visits.

---

## 2. Month view (primary)

### Layout
- 7 columns; weekday header row. **Column order follows `weekStartsOn`** (Sunday-first default; Monday-first when configured). 5–6 week rows covering the month. Days from adjacent months shown **muted** but populated.
- Each cell: **date number at top.** Today's number sits in a **filled colored disc**. No weekend shading.
- Fixed cell height; content stacks top→down.

### Event rendering (the critical rules)
- **Timed single-day event:** one row = small **colored dot** + **start time** + **title**, single line, ellipsis-truncated. Sorted by start time.
- **All-day single-day event:** a **filled colored bar** spanning the cell width, title inside.
- **Multi-day event:** a **single continuous filled ribbon** across all covered days, **drawn once with one label**, left-aligned at its start; continues across week-row boundaries with clipped/rounded ends indicating continuation. **NOT repeated per day.** **[AC]** A 5-day event renders as exactly one ribbon segment per week row it touches, never as 5 chips.
- **Stacking order:** all-day/multi-day bars stack **above** timed rows within a cell. **Overflow drops timed rows first** — all-day/multi-day lanes are reserved before timed rows fill (matches Google).
- **Overflow:** when a cell can't fit all items, the last visible row is **"+N more."** **[AC]** Cell never overflows its fixed height; hidden items are represented by an accurate "+N more" count. **See §10a-bis for the ribbon × overflow interaction (the load-bearing rule).**
- **Color:** every dot/bar uses its category color (§6).

### Interactions
- **Click an event** → **event detail popover** (§5a) anchored to the event.
- **Click "+N more"** → **day popover** (§5b) listing that day's full set.
- **Click the date number** → navigate to **Day view** for that date.
- **[MMATF adaptation] Click the empty area of a day cell** → open the **day popover** in place (Google opens a create dialog here; we repurpose it to "show this day," since we're read-only). On a **zero-event day** the popover shows the empty-day content (§5b) — or, if configured, falls through to Day-view navigation.
- **Click-target precedence (S1-5)** — within a Month cell the hit order is: **event chip → "+N more" → date number → empty-area gesture**. "Empty area" = the cell region below the date number and outside any event row/"+N more". Each region routes to exactly one action (above); **[AC]** clicking an event opens the detail popover even when it sits over otherwise-"empty" cell space.
- **Hover** an event → pointer cursor + highlight (visual-regression baseline, not a unit AC).

---

## 2a. Custom view (v2 — configurable N-day range)

Google's "Custom view" (shortcut **4 / x**) shows a configurable rolling range of N days (Google's setting: 2–7 days / 2–4 weeks). **For this module it is a v2 feature** (built alongside Week/Day, since it reuses the time-grid). Definition: a horizontally-scrolling **N-day range** (default **4 days**), rendered with the same all-day strip + hour grid + collision layout as Week/Day (§3). Until v2, the **`x`/`4` shortcut and the Custom switcher entry are inert/hidden** so no v1 `[AC]` demands a view that doesn't exist yet. **[AC]** In v1 builds, `x`/`4` is a no-op and Custom is absent from the switcher; in v2, it renders the configured N-day range.

## 3. Week & Day views (v2 — see companion phasing)

- **All-day strip pinned at top**, full width, above the hour grid; all-day & multi-day events render here as bars, multi-day spanning horizontally across day columns.
- **Hour grid below:** vertical axis = hours (label each hour; default-scroll to ~7 AM), columns = days (7 for Week, 1 for Day). **Timed events** are blocks positioned at start, height ∝ duration.
- **Concurrent events** split the column width side-by-side (see §10b Defined Equivalent).
- **"Now" indicator:** a horizontal **red line** across today's column at the current time (Week/Day only). **[AC]** Renders only when today is in the visible range; positioned at current local time.
- Click empty slot → **[MMATF adaptation]** no-op or open day; click an event block → detail popover.

---

## 4. Year & Schedule views

### Year view
- 12 mini-month grids. Days with events are marked (dot under the number). **Click a day → day popover** (Google shows a popover of everything scheduled). Click a month title → Month view.

### Schedule / Agenda view
- Vertical chronological list **grouped by date** (grouping day computed in `displayTimeZone`); dates with no events are skipped. Each row: **color dot + time (or "All day") + title + location**. **Clicking a row opens the event detail popover** (or navigates to the event page, host's choice). **[AC]** Empty dates produce no row; rows are in ascending chronological order; a row click opens the detail popover/page.
- This is the **mobile default** (and closes MMATF mobile concerns). Loads via scroll-pagination (ES §4a).

---

## 5. Popovers

### 5a. Event detail popover
Anchored to the clicked event. Fields are rendered from the `CalendarEvent`/`Occurrence` contract; fallback text is **host-provided** (MMATF supplies its print-sheet field logic via the adapter — the engine has no MMATF field logic of its own):
- Title (full) + category color chip
- **Occurrence date semantics (precise):** the popover for a *clicked* occurrence shows **that occurrence's** date (the chip the user clicked — which may be in a paged-to month), **not** the series start. A separate **"Next upcoming"** line (relative to real now, in `displayTimeZone`) appears **only when the clicked occurrence is in the past**.
- **Recurrence summary** ("Every Saturday through Oct 31") shown when the contract supplies `recurrenceSummary` — the engine **displays it verbatim and never computes it** from `occurrences[]`.
- Hours: `open–close`, else host fallback (e.g., "Hours not listed — confirm with organizer")
- Location: venue + town (+ "Get directions" if the host supplies coords/map URL)
- **Add to calendar** — an **`.ics` export** action for this occurrence/event (engine-provided; see ES §9c for scope + VTIMEZONE/`VALUE=DATE` correctness). This is the supported "get this into my own calendar" path.
- **[host hook]** "View event page →" link + an optional favorite/action slot the host fills (MMATF: heart action)
- **[AC]** Opens anchored to the event; Escape closes and returns focus to the trigger (assert `document.activeElement`); focus is trapped while open; a past clicked occurrence shows the "Next upcoming" line, a future/current one does not; the Add-to-calendar action yields a valid `.ics` for the clicked occurrence.

### 5b. Day popover
- Header: weekday + date + **X** to close.
- Full list of that day's events (dot + time/All-day + title), each clickable → detail popover or event page.
- "View full day →" → Day view.
- **Empty-day content (S1-5):** when the date has no events, the popover shows **"No events on {date}"** + the "View full day →" link (it is *not* an error state — distinct from §9's empty-*window* and fetch-error states). **[AC]** an empty day yields the "No events" popover (or the configured fall-through to Day view), never a blank/0-row popover.
- **[AC]** Lists every event for the date (the full set behind any "+N more").

---

## 6. Color legend

- A visible **legend** mapping each color to its meaning. **Recommended dimension: event category** (Festival, Craft Fair, Farmers Market, Fair, Music…). Colors consistent across all views and the legend.
- **[adaptation]** legend is **clickable to filter** — toggling a category shows/hides its events, mirroring Google's "My calendars" checkboxes. The **active filter / category-visibility set is headless-core state** (see ES §2), so it persists across views and survives the web-component path; the host binds its own filter UI (MMATF: the events filter sidebar) to that core state via a **filter-state hook**. **[AC]** Unchecking a category removes its events from every view; state persists across view switches and is identical whether driven from the legend or the host's sidebar.

---

## 7. Global controls (verified against current Google docs, 2026-06-14)

**Adopt:**
- **Search** — a search icon in the toolbar; `/` focuses it. **[host hook]** the module exposes a search hook; the host wires it to its own event search (MMATF: the existing sidebar search). The module builds no search backend.
- **View switcher** — Day · Week · Month · Year · Custom · Schedule.
- **Week configuration** — `weekStartsOn` (Sunday default / Monday) drives the Month column order + weekday header; optional **Show weekends** and **Show week numbers** toggles (Google parity). Config lives in `CalendarConfig` (ES §5).
- **Density / settings (gear)** — current Google: **Settings → Appearance → Information density** (2026 update, ON by default, no admin control); earlier builds exposed a "Responsive to your screen" / "Compact" toggle. Our module commits only to a **Comfortable/Compact Defined Equivalent**; house Print here. (Re-confirm toolbar chrome against the June 2026 Google redesign before building it.)
- **Mini-month navigation** — a small month picker for quick jumps, today marked. On mobile, a compact date picker.
- **Print** — **deferred past v1 (S3-5):** no print-layout AC is committed yet (MMATF's print-sheet is a separate, live feature). Don't gate v0/v1 on print; when scheduled, add a Month/Agenda print-layout AC covering page-break behavior for ribbons and "+N more".

**Exclude (authoring/personal):** create-event button & quick-create, "My calendars"/"Other calendars", Tasks/Keep, "Show completed/declined," people/room search, timezone switching, "Reduce brightness of past events," notification/account settings.

---

## 8. Keyboard & accessibility

### 8a. Keyboard map
Google enables shortcuts via Settings → "Enable keyboard shortcuts"; `?` opens the in-app overlay. Match these bindings so muscle memory transfers. **Grounding (S1-3):** every row marked ✓ was **verified against `support.google.com/calendar/answer/37034` (2026-06-14)**; the one **⚑ module-convention** row is NOT in Google's table and is our deliberate addition.

| Action | Shortcut | Grounding |
|---|---|---|
| Next date range | **j** or **n** | ✓ Google |
| **Previous date range** | **p** or **k** | **⚑ module convention** — Google's table has **no previous-range shortcut at all**; we add this. Its `[AC]` is a module behavior, not Google parity. |
| Today | **t** | ✓ Google |
| Go to date | **g** | ✓ Google |
| Focus search | **/** | ✓ Google |
| Refresh | **r** | ✓ Google *(N/A for a live browse calendar — may omit)* |
| Day view | **1** or **d** | ✓ Google |
| Week view | **2** or **w** | ✓ Google |
| Month view | **3** or **m** | ✓ Google |
| Custom view (v2 — **inert in v1**, see §2a) | **4** or **x** | ✓ Google |
| Agenda/Schedule view | **5** or **a** | ✓ Google |
| See event details | **e** | ✓ Google |
| Close popover / return to grid | **Esc** | ✓ Google |
| Show shortcuts overlay | **?** | ✓ Google |

**Excluded (authoring):** **c** (create), Delete/Backspace, **z** (undo), Ctrl/⌘+S (save).
**[AC]** Each listed shortcut performs the stated action **for views that exist in the current phase** (`x`/`4` Custom is inert until v2); `?` lists the supported set; authoring keys are inert.

### 8b. Accessibility model
- **Grid focus is day-granular** (not event-granular). Month grid exposes **ARIA grid semantics**; arrow keys move a roving focus **cell-to-cell**; Enter/Space on a cell opens that **day popover**. **Event-level interaction happens inside the day popover** — a normal focus-trapped list — which is also how a keyboard user reaches events hidden behind "+N more." The grid cell itself never requires reaching an individual chip.
- Popovers (event detail, day) are **focus-trapped**, Escape-dismissible, and return focus to the trigger.
- All interactive elements reachable and operable by keyboard; visible focus indicators; WCAG 2.2 AA contrast in light and dark.
- **[AC] (axe is necessary but NOT sufficient — these named keyboard/focus ACs de-risk the hand-rolled a11y):**
  - axe passes on every view and on composed pages (catches roles/names/contrast — *not* operability).
  - Tab / Shift-Tab order is **grid → toolbar → legend** (assert sequence).
  - Roving focus moves cell-to-cell with arrows and **wraps at row ends**.
  - Enter on a focused day opens the day popover; focus moves into it.
  - **Esc from any popover returns focus to its trigger** (assert `document.activeElement`).
  - The `?` shortcuts overlay is itself **focus-trapped**.
  - Full keyboard-only operation of navigation, view switching, day opening, event opening (via day popover), and popover dismissal.

---

## 9. States

- **Today:** highlighted disc on the date number (computed in `displayTimeZone`). **Now-line: Week/Day only — v2** (not rendered in Month).
- **Past events:** Google can dim past events ("Reduce brightness") — **excluded** by default for a browse calendar.
- **Loading → observable AC (S3-7):** assert via a **state-machine test**, not "every frame": at each render in the `loading → loaded` transition, the events region contains **≥1 skeleton row OR ≥1 event** (never zero children). Testable in RTL on committed DOM; captures the "no blank flash" intent without promising frame-level observation.
- **Empty window → observable AC:** when the window genuinely has no events, render a single **empty-state element with a known test id** (not an error, not a spinner). Replaces "quiet empty state."
- **Fetch error → observable AC:** when a window's data request **fails** (network/API/timeout), render a non-blocking **error state with a retry affordance** (known test id) that preserves the chrome/navigation (the user can still page to another window); never a blank grid, never a silent failure, and the previous successfully-loaded window stays visible if present. Distinct from the empty state.
- **"Subtle highlight"/hover and other purely visual states** are validated by **visual-regression baselines (Chromatic)**, not unit ACs.
- **Adjacent-month days** (Month): muted but populated and interactive.

---

## 10. Defined Equivalents (our deterministic rules — not reverse-engineered)

These produce Google-equivalent results; the constants are ours and are the spec of record for implementation + tests.

### 10a. Month multi-day lane-packing
- **Pre-filter (S1-2):** occurrences with `ongoing===true` (span > 14 days, strict) are **excluded from lane-packing** — they render as the "Ongoing through {date}" strip (§11), never as ribbons. **[AC/property test]** a 20-day occurrence produces exactly **one** Ongoing strip and **zero** ribbon segments. Then lane-pack the remainder:
- Sort the remaining multi-day/all-day events by (start asc, then longer-duration first, then stable id).
- Assign each to the **lowest lane index** free for its entire span within the week row; events continuing across a week boundary restart packing on the next row but keep visual continuation affordances.
- Cap visible lanes per cell at **L** (default 3 timed rows + bars to fit fixed height); remainder → "+N more."
- **[AC] invariants (property-tested):** no two events overlap in the same lane on the same day; every event is placed or counted in "+N more"; output is deterministic for a given input + window (relies on stable occurrence ids).
- **Unit consistency:** all-day/multi-day **bars and timed rows share one row-height unit**, so the §10c `floor()` overflow math is valid. State and test this.

### 10a-bis. Ribbon × overflow interaction (THE load-bearing rule)

A continuous multi-day ribbon (§2, drawn once per week-row) and per-cell overflow (§10c) can **collide**: if a ribbon is clipped by overflow in one cell but rendered in its neighbor, you get a **broken span**. Resolution:

- Compute the **visible-lane cap once per week-row** = the **minimum** cap across that row's cells.
- **Reserve all-day/multi-day lanes top-down across the whole row first**, then fill each cell's remaining rows with timed events per-cell.
- A multi-day event occupying lane *k* is shown in **every** cell of its week-row span **iff** lane *k* fits the row-wide cap; **otherwise it is counted in "+N more" in ALL of those cells** — never some.
- **[AC] (property-tested):** **no multi-day event is ever partially visible across a week-row** — it is visible in all its cells or none.

### 10b. Week/Day collision layout (v2)
- For a set of timed events overlapping in time, compute connected **overlap clusters**; within a cluster, assign columns greedily by start time; width = cluster_width / max_concurrent; x-offset = column index.
- **[AC] invariants:** no two blocks in a cluster visually overlap; a non-overlapping event spans full width; deterministic.

### 10c. Overflow threshold
- A cell shows up to **floor((cellHeight − headerHeight) / rowHeight)** rows; if items exceed that, the last slot becomes "+N more" where N = hidden count. **[AC]** Visible + N = total; N ≥ 1 whenever overflow occurs.
- **N is per-cell over items *intersecting* that cell (S2-4):** a multi-day event counts as **1 in each cell it touches**, so a clipped 5-day ribbon increments "+N more" in each of its 5 cells. The "Visible + N = total" invariant is therefore **per-cell, not row-summable** — do not reconcile a week's total by summing per-cell Ns (it would multi-count spanning events). State and test the clipped-ribbon case.

### 10d. "Now" line position (v2 — Week/Day only)
- y = (minutesSinceMidnightLocal / dayLengthMinutes) × gridHeight, in the **`displayTimeZone`** (never the server/runtime zone). **DST:** `dayLengthMinutes` is the actual length of the day in `displayTimeZone` (1380/1500 on transition days), computed via Luxon — **not a fixed 1440**, or the line drifts ~1h. Updates on a timer post-mount. **[AC]** Position matches current local time (incl. DST-transition days); absent when today not visible; no SSR/hydration mismatch (see companion ES §8 SSR "now" + `displayTimeZone` rule).

---

## 11. Open adaptations carried to the module spec
- Default view: Month (desktop) / Schedule (mobile); remember last-used.
- Empty-cell click → day popover (not create).
- Legend filters as **core state** (host binds its filter UI); see ES §2.
- Theme-following (light/dark via tokens); no calendar-only dark toggle.
- **All-day events are floating** — date-only occurrences never shift day under a different `displayTimeZone` (iCalendar rule; property-tested). See ES §5/§8.
- **"Ongoing through {date}" strip** for any **occurrence** whose span **> 14 days (strict)** — a module value-add beyond Google. Such an occurrence renders **only** as the strip and is **excluded from ribbon lane-packing** (§10a, S1-2); a multi-occurrence series flags ongoing only if one of its *own occurrences* exceeds 14 days (per-occurrence, not per-series — aligns RS/ES wording). Predicate + contract field defined in **ES §5** (`ongoing`); recurrence handling in **ES §4** (occurrences canonical, RRULE optional adapter helper). *(Corrects the earlier "companion §recurrence" reference — recurrence lives in ES §4/§5, there is no §recurrence.)*
- **Deliberate divergence note:** **No weekend shading** (§2) is intentional, not a defect — record it so it isn't "fixed" later as a perceived bug.

**Sources (verified 2026-06-14):** [Google Calendar keyboard shortcuts](https://support.google.com/calendar/answer/37034?hl=en&co=GENIE.Platform%3DDesktop) · [View your day/week/month](https://support.google.com/calendar/answer/6110849) · [Event color set & density](https://support.google.com/calendar/answer/15619910?hl=en) · [Better screen scaling (2026 update)](https://workspaceupdates.googleblog.com/2026/03/better-screen-scaling-for-google-calendar-on-large-monitors.html)
