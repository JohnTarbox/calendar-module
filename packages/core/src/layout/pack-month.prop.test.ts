import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { CalendarConfig, CalendarEvent } from '@johntarbox/calendar-contract';
import { buildMonthGrid } from '../view/month-grid.js';
import { packMonth } from './pack-month.js';
import type { LayoutCaps, MonthLayout, PackedWeekRow } from './types.js';
import { addDays } from '../time/day.js';

const cfg: CalendarConfig = { displayTimeZone: 'America/New_York' };
const NOW = '2026-06-14T12:00:00-04:00';
const grid = () => buildMonthGrid('2026-06-14', cfg, NOW);
const CAPS: LayoutCaps = { cellHeight: 120, headerHeight: 24, rowHeight: 24 }; // cap = 4

const WINDOW_START = '2026-05-25';

// An event whose single occurrence is NON-ongoing (<= 14 days), within/around June 2026.
const eventArb = (idx: number): fc.Arbitrary<CalendarEvent> =>
  fc
    .record({
      kind: fc.constantFrom('allDaySingle', 'allDayMulti', 'timed'),
      dayOffset: fc.integer({ min: 0, max: 40 }), // from WINDOW_START
      len: fc.integer({ min: 2, max: 7 }), // multi-day length
      hour: fc.integer({ min: 8, max: 20 }),
      category: fc.constantFrom('Fair', 'Market', 'Music', undefined),
    })
    .map(({ kind, dayOffset, len, hour, category }) => {
      const start = addDays(WINDOW_START, dayOffset);
      const id = `e${idx}`;
      const occId = `${id}-o0`;
      const base: CalendarEvent = { id, title: `Event ${idx}`, occurrences: [] };
      if (category) base.category = category;
      if (kind === 'allDaySingle') {
        base.occurrences = [{ id: occId, start, allDay: true }];
      } else if (kind === 'allDayMulti') {
        base.occurrences = [{ id: occId, start, end: addDays(start, len), allDay: true }];
      } else {
        const hh = String(hour).padStart(2, '0');
        base.occurrences = [{ id: occId, start: `${start}T${hh}:00:00-04:00`, allDay: false }];
      }
      return base;
    });

const eventsArb = fc.array(fc.nat(60).chain((i) => eventArb(i)), { minLength: 0, maxLength: 25 });

function cellsOf(row: PackedWeekRow) {
  return row.cells.map((cell, col) => {
    const ribbons = row.ribbons.filter((r) => r.startColumn <= col && r.endColumn >= col);
    const timed = row.timed.filter((t) => t.column === col);
    const shown = ribbons.filter((r) => r.visible).length + timed.filter((t) => t.visible).length;
    return { cell, ribbons, timed, shown, items: ribbons.length + timed.length };
  });
}

describe('packMonth — lane-packing + ribbon×overflow invariants (RS §10a/§10a-bis/§10c)', () => {
  it('P1: no two ribbons overlap in the same lane on the same column', () => {
    fc.assert(
      fc.property(eventsArb, (events) => {
        const layout = packMonth(events, grid(), cfg, CAPS);
        for (const row of layout.rows) {
          const byLane = new Map<number, Array<[number, number]>>();
          for (const r of row.ribbons) {
            const spans = byLane.get(r.lane) ?? [];
            for (const [s, e] of spans) {
              const overlap = !(r.endColumn < s || r.startColumn > e);
              expect(overlap).toBe(false);
            }
            spans.push([r.startColumn, r.endColumn]);
            byLane.set(r.lane, spans);
          }
        }
      }),
      { numRuns: 250 },
    );
  });

  it('P11/P2: per cell, shown + overflowCount === items intersecting that cell (not row-summable)', () => {
    fc.assert(
      fc.property(eventsArb, (events) => {
        const layout = packMonth(events, grid(), cfg, CAPS);
        for (const row of layout.rows) {
          for (const c of cellsOf(row)) {
            expect(c.shown + c.cell.overflowCount).toBe(c.items);
          }
        }
      }),
      { numRuns: 250 },
    );
  });

  it('P4: a ribbon is visible in ALL its cells or NONE (one row-wide cut, never partial)', () => {
    fc.assert(
      fc.property(eventsArb, (events) => {
        const layout = packMonth(events, grid(), cfg, CAPS);
        for (const row of layout.rows) {
          for (const r of row.ribbons) {
            // The single visibility cut is lane < reservedBarLanes — identical in every cell.
            expect(r.visible).toBe(r.lane < row.reservedBarLanes);
          }
          // And no cell shows a hidden ribbon / hides a visible one.
          for (const c of cellsOf(row)) {
            for (const r of c.ribbons) {
              if (!r.visible) {
                // a hidden ribbon contributes to this cell's overflow
                expect(c.cell.overflowCount).toBeGreaterThanOrEqual(1);
              }
            }
          }
        }
      }),
      { numRuns: 250 },
    );
  });

  it('P3: deterministic — identical input (any source order) yields identical layout', () => {
    fc.assert(
      fc.property(eventsArb, (events) => {
        const a = packMonth(events, grid(), cfg, CAPS);
        const b = packMonth(events.slice().reverse(), grid(), cfg, CAPS);
        expect(stable(a)).toBe(stable(b));
      }),
      { numRuns: 200 },
    );
  });

  it('never exceeds the cap: shown rows per cell <= rowWideVisibleCap', () => {
    fc.assert(
      fc.property(eventsArb, (events) => {
        const layout = packMonth(events, grid(), cfg, CAPS);
        for (const row of layout.rows) {
          for (const c of cellsOf(row)) {
            const plusMore = c.cell.overflowCount > 0 ? 1 : 0;
            expect(c.shown + plusMore).toBeLessThanOrEqual(row.rowWideVisibleCap);
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});

function stable(layout: MonthLayout): string {
  return JSON.stringify(layout);
}
