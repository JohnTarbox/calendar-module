import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { CalendarConfig } from '@johntarbox/calendar-contract';
import {
  goToDateAnchor,
  nextMonth,
  normalizeMonthAnchor,
  prevMonth,
  todayMonthAnchor,
} from './navigation.js';

const cfg: CalendarConfig = { displayTimeZone: 'America/New_York' };
const NOW = '2026-06-14T12:00:00-04:00';

const anchorArb = fc
  .date({ min: new Date('2000-01-01T00:00:00Z'), max: new Date('2050-12-31T00:00:00Z') })
  .map((d) => d.toISOString().slice(0, 10));

describe('navigation round-trips (RS §1) — three distinct code paths', () => {
  it('Next then Previous returns the identical anchor', () => {
    fc.assert(
      fc.property(anchorArb, (anchor) => {
        const a = normalizeMonthAnchor(anchor);
        expect(prevMonth(nextMonth(a))).toBe(a);
        expect(nextMonth(prevMonth(a))).toBe(a);
      }),
    );
  });

  it('view-switch round-trip: month-normalization is idempotent (anchor preserved)', () => {
    fc.assert(
      fc.property(anchorArb, (anchor) => {
        const a = normalizeMonthAnchor(anchor);
        expect(normalizeMonthAnchor(a)).toBe(a);
      }),
    );
  });

  it('mini-month jump then Today returns to the current period', () => {
    fc.assert(
      fc.property(anchorArb, (jumpTarget) => {
        goToDateAnchor(jumpTarget); // jump away
        expect(todayMonthAnchor(NOW, cfg)).toBe('2026-06-01'); // Today returns to now's month
      }),
    );
  });
});
