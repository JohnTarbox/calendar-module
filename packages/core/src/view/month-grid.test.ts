import { describe, it, expect } from 'vitest';
import type { CalendarConfig } from '@calendar-module/contract';
import { buildMonthGrid } from './month-grid.js';

const NOW = '2026-06-14T12:00:00-04:00';

describe('buildMonthGrid (RS §2)', () => {
  it('produces full 7-cell weeks aligned to weekStartsOn=0 (Sunday)', () => {
    const grid = buildMonthGrid('2026-06-14', { displayTimeZone: 'America/New_York' }, NOW);
    expect(grid.monthStart).toBe('2026-06-01');
    expect(grid.weeks.every((w) => w.cells.length === 7)).toBe(true);
    expect(grid.weeks[0]!.cells[0]!.weekday).toBe(0); // Sunday-first
    // Covers leading/trailing adjacent-month days.
    expect(grid.weeks[0]!.cells[0]!.date <= '2026-06-01').toBe(true);
    const lastWeek = grid.weeks[grid.weeks.length - 1]!;
    expect(lastWeek.cells[6]!.date >= '2026-06-30').toBe(true);
  });

  it('aligns to weekStartsOn=1 (Monday) when configured', () => {
    const grid = buildMonthGrid('2026-06-14', { displayTimeZone: 'America/New_York', weekStartsOn: 1 }, NOW);
    expect(grid.weeks[0]!.cells[0]!.weekday).toBe(1);
  });

  it('marks today and adjacent-month days', () => {
    const cfg: CalendarConfig = { displayTimeZone: 'America/New_York' };
    const grid = buildMonthGrid('2026-06-14', cfg, NOW);
    const all = grid.weeks.flatMap((w) => w.cells);
    expect(all.find((c) => c.date === '2026-06-14')!.isToday).toBe(true);
    expect(all.some((c) => !c.inMonth)).toBe(true);
    expect(all.filter((c) => c.isToday)).toHaveLength(1);
  });

  it('emits ISO week numbers when showWeekNumbers is set', () => {
    const grid = buildMonthGrid(
      '2026-06-14',
      { displayTimeZone: 'America/New_York', weekStartsOn: 1, showWeekNumbers: true },
      NOW,
    );
    expect(grid.weeks.every((w) => typeof w.weekNumber === 'number')).toBe(true);
  });
});
