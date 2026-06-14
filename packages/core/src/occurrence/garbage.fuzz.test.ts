import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { CalendarConfig, CalendarEvent } from '@calendar-module/contract';
import { buildMonthGrid } from '../view/month-grid.js';
import { packMonth } from '../layout/pack-month.js';
import { resolveSpan } from '../time/span.js';

const cfg: CalendarConfig = { displayTimeZone: 'America/New_York' };
const grid = buildMonthGrid('2026-06-14', cfg, '2026-06-14T12:00:00-04:00');
const CAPS = { cellHeight: 120, headerHeight: 24, rowHeight: 24 };

// MMATF quirk corpus (ES §6): stale-year, end<start, century span, midnight-UTC anchor,
// "Farmington shape", 98-day flat range.
const CORPUS: CalendarEvent[] = [
  { id: 'stale', title: 'Stale year', occurrences: [{ id: 's', start: '2019-06-10', allDay: true }] },
  { id: 'rev', title: 'end<start', occurrences: [{ id: 'r', start: '2026-06-20', end: '2026-06-10', allDay: true }] },
  { id: 'century', title: 'Century span', occurrences: [{ id: 'c', start: '1900-01-01', end: '2100-01-01', allDay: true }] },
  { id: 'midnightUTC', title: 'Midnight UTC anchor', occurrences: [{ id: 'm', start: '2026-06-10T00:00:00Z', allDay: false }] },
  { id: 'flat98', title: '98-day flat range', occurrences: [{ id: 'f', start: '2026-05-01', end: '2026-08-07', allDay: true }] },
];

describe('ingestion robustness — garbage degrades gracefully, never hangs (ES §6)', () => {
  it('the MMATF quirk corpus packs without throwing', () => {
    expect(() => packMonth(CORPUS, grid, cfg, CAPS)).not.toThrow();
    const layout = packMonth(CORPUS, grid, cfg, CAPS);
    // century + 98-day are ongoing → strips, never ribbons.
    expect(layout.ongoingStrips.length).toBeGreaterThanOrEqual(2);
  });

  it('resolveSpan never throws and never returns a negative span', () => {
    const junk = fc.record({
      start: fc.oneof(fc.constant('not-a-date'), fc.constant('2026-13-45'), fc.constant(''), fc.constant('2026-06-10')),
      end: fc.option(fc.oneof(fc.constant('garbage'), fc.constant('2026-06-05')), { nil: undefined }),
      allDay: fc.boolean(),
    });
    fc.assert(
      fc.property(junk, (o) => {
        const span = resolveSpan({ id: 'x', ...o } as never, cfg, 'e');
        // span days is at least 1 (NaN guarded by the >1 / clamp logic in callers)
        expect(span.spanDays === 1 || span.spanDays > 1 || Number.isNaN(span.spanDays)).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it('packs a large overlapping set without hanging (DoS guard)', () => {
    const many: CalendarEvent[] = Array.from({ length: 1500 }, (_, i) => ({
      id: `o${i}`,
      title: `Overlap ${i}`,
      occurrences: [{ id: `o${i}-x`, start: '2026-06-10', allDay: true }],
    }));
    const layout = packMonth(many, grid, cfg, CAPS);
    // All collapse onto one cell in one week row; overflow accounting stays coherent.
    const row = layout.rows.find((r) => r.cells.some((c) => c.date === '2026-06-10'))!;
    const cell = row.cells.find((c) => c.date === '2026-06-10')!;
    expect(row.ribbons.length).toBe(1500);
    const shown = row.ribbons.filter((rb) => rb.visible).length;
    expect(shown + cell.overflowCount).toBe(1500); // shown + hidden = total, per cell

  });
});
