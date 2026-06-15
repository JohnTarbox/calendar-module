import { describe, it, expect } from 'vitest';
import type { CalendarConfig, CalendarEvent } from '@jonnyboats/calendar-contract';
import { buildMonthGrid } from '../view/month-grid.js';
import { packMonth } from './pack-month.js';
import type { LayoutCaps } from './types.js';

const cfg: CalendarConfig = { displayTimeZone: 'America/New_York' };
const NOW = '2026-06-14T12:00:00-04:00';
const grid = buildMonthGrid('2026-06-14', cfg, NOW);

describe('packMonth — specific scenarios', () => {
  it('a 20+-day occurrence renders as exactly 1 Ongoing strip and 0 ribbon segments (S1-2)', () => {
    const events: CalendarEvent[] = [
      { id: 'long', title: 'Summer Exhibit', occurrences: [{ id: 'long-o', start: '2026-06-01', end: '2026-06-25', allDay: true }] },
    ];
    const layout = packMonth(events, grid, cfg, { cellHeight: 120, headerHeight: 24, rowHeight: 24 });
    expect(layout.ongoingStrips).toHaveLength(1);
    expect(layout.ongoingStrips[0]!.occurrenceId).toBe('long-o');
    expect(layout.ongoingStrips[0]!.throughDate).toBe('2026-06-24'); // DTEND exclusive
    const ribbonCount = layout.rows.reduce((n, r) => n + r.ribbons.length, 0);
    expect(ribbonCount).toBe(0);
  });

  it('a single-day all-day event renders as a one-cell bar', () => {
    const events: CalendarEvent[] = [
      { id: 'a', title: 'Craft Fair', occurrences: [{ id: 'a-o', start: '2026-06-10', allDay: true }] },
    ];
    const layout = packMonth(events, grid, cfg, { cellHeight: 120, headerHeight: 24, rowHeight: 24 });
    const ribbons = layout.rows.flatMap((r) => r.ribbons);
    expect(ribbons).toHaveLength(1);
    expect(ribbons[0]!.startColumn).toBe(ribbons[0]!.endColumn);
    expect(ribbons[0]!.allDay).toBe(true);
  });

  it('a timed single-day event renders as a timed row (not a ribbon)', () => {
    const events: CalendarEvent[] = [
      { id: 't', title: 'Concert', occurrences: [{ id: 't-o', start: '2026-06-10T19:00:00-04:00', allDay: false }] },
    ];
    const layout = packMonth(events, grid, cfg, { cellHeight: 120, headerHeight: 24, rowHeight: 24 });
    expect(layout.rows.flatMap((r) => r.ribbons)).toHaveLength(0);
    const timed = layout.rows.flatMap((r) => r.timed);
    expect(timed).toHaveLength(1);
    expect(timed[0]!.timeLabel).toBe('19:00');
  });

  it('a hidden (clipped) ribbon is counted in "+N more" in EVERY cell of its span (S2-4)', () => {
    // cap = floor((72-24)/24) = 2. Three overlapping 5-day ribbons → only 1 visible, 2 hidden.
    const caps: LayoutCaps = { cellHeight: 72, headerHeight: 24, rowHeight: 24 };
    const span = { start: '2026-06-01', end: '2026-06-06', allDay: true as const }; // Jun 1–5
    const events: CalendarEvent[] = ['a', 'b', 'c'].map((id) => ({
      id,
      title: `Ribbon ${id}`,
      occurrences: [{ id: `${id}-o`, ...span }],
    }));
    const layout = packMonth(events, grid, cfg, caps);
    const week = layout.rows.find((r) => r.ribbons.length === 3)!;
    const visible = week.ribbons.filter((r) => r.visible);
    expect(visible).toHaveLength(1); // contentCap collapses to 1 visible bar lane
    // Every cell Jun 1–5 counts the 2 hidden ribbons.
    for (const date of ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05']) {
      const cell = week.cells.find((c) => c.date === date)!;
      expect(cell.overflowCount).toBe(2);
    }
  });
});
