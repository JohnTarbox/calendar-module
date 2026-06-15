# Calendar Module — Integration Handoff (Month, v1.0.0)

**Audience:** the MMATF developer wiring the Month calendar into meetmeatthefair.com.
**The seam is the frozen `CalendarEvent` contract.** You produce contract-valid data; the module
renders it. You never fork module internals; the module never learns MMATF-isms. This document is
what you build against.

> **Pin `@jonnyboats/calendar-react@^1.0.0`** (or the `v1.0.0` git tag). **Any `CalendarEvent` change
> is a major bump** — treat a major as a coordinated migration.

---

## 1. The mount API

```tsx
import { MonthCalendar, validateWindow } from '@jonnyboats/calendar-react';
import '@jonnyboats/calendar-react/styles'; // once, in your root layout
```

`MonthCalendar` is a **client component** (the `"use client"` directive is baked into the package
entry), so you can import it directly into a Next.js App Router **Server Component**. Props:

| Prop | Type | Notes |
|---|---|---|
| `events` | `CalendarEvent[]` | Validate with `validateWindow` before passing. |
| `displayTimeZone` | `string` (IANA) | Invalid → the error guard, never a throw/blank. |
| `now` | ISO `string` | **Host-pinned per request.** The engine never reads a clock (SSR stability). |
| `window?` | `{ start, end }` | The data window you loaded. Selects the month when `initialAnchor` is omitted. |
| `theme?` | tokens | See §6. |
| `caps?` | `{ cellHeight, headerHeight, rowHeight }` | Drives the §10c lane cap. |
| `locale?` `weekStartsOn?` `defaultDurationMinutes?` `showWeekNumbers?` `initialAnchor?` `status?` | | Surfaced into the internal config. |
| `onNavigate({anchor,window})` | callback | Refetch the reported `window` on navigation. |
| `onLegendFilterChange(hidden)` · `onNavigateToDay(date)` · `onExportIcs(ics,filename)` | callbacks | |
| `renderEventPopover` · `renderDayPopover` · `renderLegend` · `renderEventActions` | render slots | Each falls back to the built-in when omitted. |

Full recipe: [`examples/next-app-router/RECIPE.md`](../examples/next-app-router/RECIPE.md).

---

## 2. The `CalendarEvent` contract (the frozen JSON shape)

```ts
interface CalendarEvent {
  id: string;                 // stable + unique across windowed loads
  title: string;              // rendered as TEXT (never HTML)
  category?: string;          // drives color via the theme category map
  url?: string;               // "view event page"; protocol-allowlisted (block javascript:/data:)
  recurrenceSummary?: string; // displayed verbatim; never computed from occurrences
  occurrences: Occurrence[];  // pre-expanded concrete instances; MUST be sorted ascending by start
  ongoing?: boolean;          // explicit override; else derived (any occurrence span > 14d strict)
}
interface Occurrence {
  id: string;                 // stable + unique per occurrence across loads
  start: string;              // ISO 8601 w/ offset (timed) OR date-only (all-day, floating)
  end?: string;               // all-day end is EXCLUSIVE (DTEND); timed end is inclusive
  allDay: boolean;            // date-only occurrences are FLOATING — never shift day under any tz
  timezone?: string;          // IANA; render wall-clock in this zone (bucket in displayTimeZone)
  location?: string;          // "Venue, Town" — engine-rendered
  mapUrl?: string;            // "Get directions"; same protocol allowlist as url
  openTime?: string; closeTime?: string; note?: string;
}
```

- The published **JSON Schema** is committed at
  [`docs/schema/calendar-event.schema.json`](./schema/calendar-event.schema.json) (generated from
  the package, so it can't drift) and is also exported as `calendarEventJsonSchema` from
  `@jonnyboats/calendar-react` (and `@jonnyboats/calendar-contract`).
- **Validators** (re-exported from the package): `validateEvent(e)` (shape + URL allowlist),
  `validateWindow(events[])` (id-uniqueness + occurrences sorted ascending), `validateConfig(cfg)`
  (IANA `displayTimeZone`). Run `validateWindow` on every window you fetch.
- The contract carries **no MMATF-isms** — no `event_days`, D1 ids, price, or hero concepts.

---

## 3. The `events` / `event_days` shape the reference adapter assumes

The reference adapter (yours to own — [`examples/mmatf-adapter/`](../examples/mmatf-adapter/))
maps these to `CalendarEvent[]`. Reconcile against your real columns:

```sql
events(      id INTEGER PK, title TEXT, category TEXT, url TEXT,
             venue_name TEXT, town TEXT, lat REAL, lng REAL )
event_days(  id TEXT PK, event_id INTEGER, day TEXT /* yyyy-MM-dd */,
             end_day TEXT /* inclusive; NULL = single day */, all_day INTEGER,
             start_time TEXT, end_time TEXT, open_time TEXT, close_time TEXT )
```

Mapping rules the adapter applies: occurrence id = composite `event_days.id` (stable/idempotent);
all-day `end` = stored inclusive `end_day` **+ 1 day** (DTEND is exclusive); timed `start` pinned
to `displayTimeZone` with an explicit offset; output sorted ascending (passes `validateWindow`).

---

## 4. Time + windowing semantics (load-bearing)

- **`now` is host-pinned** at request time and passed in; the engine never reads a clock. This is
  what makes the today-disc SSR-stable. The display timezone must be resolvable server-side
  (tenant-fixed / cookie-pinned). MMATF is fixed `America/New_York`.
- **Two-tz rule:** a timed occurrence **buckets into the day in `displayTimeZone`** but renders its
  **wall-clock in `Occurrence.timezone`** (falling back to `displayTimeZone`).
- **All-day = floating:** a date-only occurrence renders on the same calendar day under any
  `displayTimeZone`.
- **Windowing:** fetch the **grid window** for the month (it leads/trails into adjacent months by
  up to 6 days). On `onNavigate`, refetch the reported `window`.

### The `(allDay, end)` span table

| allDay | end | resulting span |
|---|---|---|
| true | present | start … (end − 1 day) inclusive (DTEND exclusive) |
| true | omitted | single day (start) |
| false | present | start → end (inclusive instant), bucketed in `displayTimeZone` |
| false | omitted | start → start + `defaultDurationMinutes` (default 60) |

### The "ongoing" rule

An occurrence whose span **> 14 days (strict)** renders as the **"Ongoing through {date}" strip**
(a separate band) and is **excluded from ribbon lane-packing** — never a ribbon. Exactly 14 days is
**not** ongoing. This is per-occurrence (one long instance doesn't flag a whole series).

---

## 5. Confirmed overflow defaults — module-wide, NOT per-site config

These live in `packages/core` and are **the same for every host** (they are not theming knobs).
Full record + rationale: [`docs/DECISIONS-v0-overflow.md`](./DECISIONS-v0-overflow.md).

- **#1 — Lane cap:** visible rows per cell = `floor((cellHeight − headerHeight) / rowHeight)`,
  driven by the `caps` you pass. **There is no fixed 3-lane cap.** Bars reserve top-down; timed
  fill the remainder.
- **#4 — Ongoing strip:** rendered in a **separate band outside** the per-cell cap math; it never
  consumes a cell's row budget.

The "+N more" indicator consumes one row when a cell overflows (#2), and a hidden multi-day ribbon
is counted in "+N more" in **every** cell it spans (all-cells-or-none).

### `LayoutCaps` geometry (the exact numbers)

The engine computes the per-cell overflow cap from cell geometry you pass as `caps`. **Pass the
geometry that matches your rendered CSS** so the "+N more" math agrees with what's actually drawn.

```ts
interface LayoutCaps {
  cellHeight: number;   // px — total height of a day cell box
  headerHeight: number; // px — height reserved for the date-number row at the top of the cell
  rowHeight: number;    // px — height of ONE event row (ribbon / timed / "+N more")
}
```

- **Default** (used when `caps` is omitted): `{ cellHeight: 120, headerHeight: 24, rowHeight: 24 }`.
- **Cap formula:** `visibleRows = floor((cellHeight − headerHeight) / rowHeight)`.
  Default → `floor((120 − 24) / 24) = floor(96 / 24) = 4` rows per cell.
- **Worked example:** if your CSS makes cells 160px tall with a 28px date header and 22px event
  rows, pass `{ cellHeight: 160, headerHeight: 28, rowHeight: 22 }` → `floor((160−28)/22) = 6` rows.
- All three are **CSS pixels** and must match your stylesheet's cell box, or the engine will hide
  too many or too few rows relative to what fits. Bars (ribbons/all-day) reserve rows top-down;
  timed events fill the remainder; the last visible row becomes "+N more" when a cell overflows.

---

## 6. Theming tokens

Pass `theme` to set CSS custom properties on the calendar root (or set the vars yourself in CSS):

| Token | CSS var | Drives |
|---|---|---|
| `fg` | `--cm-fg` | text |
| `muted` | `--cm-muted` | adjacent-month days, secondary text |
| `border` | `--cm-border` | cell borders |
| `today` | `--cm-today` | today disc |
| `accent` | `--cm-accent` | default dot/ribbon color |
| `bg` | `--cm-bg` | background |
| `fontFamily` | (font) | typeface |
| `categoryColors` | per-category | legend swatch, dots, ribbons (by `category`) |

The module follows light/dark via `prefers-color-scheme`; override tokens to match your brand.

---

## 7. Coordination

Before you wire the adapter, **freeze the seam together** (John): the `CalendarEvent` shape, adapter
ownership, the theme tokens, and the version you pin (`1.0.0`). After that, the two codebases evolve
independently behind `validateWindow`. Out of scope for now: Week/Day/Year/Schedule, the web
component, and the MCP **write** surface (gated on the MCP write-authority invariant table, tracked
MMATF-side as **K25**) — do not design against a write path yet.
