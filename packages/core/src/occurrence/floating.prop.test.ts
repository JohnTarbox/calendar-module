import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { CalendarConfig } from '@calendar-module/contract';
import { resolveSpan } from '../time/span.js';

const ZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Europe/London',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Kiritimati', // +14
  'Etc/GMT+12', // -12
  'UTC',
];

const dayArb = fc
  .date({ min: new Date('2000-01-01T00:00:00Z'), max: new Date('2050-12-31T00:00:00Z') })
  .map((d) => d.toISOString().slice(0, 10));

describe('all-day occurrences are floating (RS §11, ES §5/§8) — property', () => {
  it('an all-day occurrence renders on the SAME literal day under any displayTimeZone', () => {
    fc.assert(
      fc.property(dayArb, fc.constantFrom(...ZONES), (day, zone) => {
        const cfg: CalendarConfig = { displayTimeZone: zone };
        const s = resolveSpan({ id: 'o', start: day, allDay: true }, cfg, 'e');
        expect(s.startDay).toBe(day);
        expect(s.endDayInclusive).toBe(day);
      }),
      { numRuns: 400 },
    );
  });

  it('a 3-day all-day event covers exactly 3 cells under any zone (DTEND off-by-one)', () => {
    fc.assert(
      fc.property(dayArb, fc.constantFrom(...ZONES), (day, zone) => {
        // DTEND = start + 3 days (exclusive) → covers exactly 3 days.
        const end = new Date(Date.parse(day + 'T00:00:00Z') + 3 * 86400000)
          .toISOString()
          .slice(0, 10);
        const cfg: CalendarConfig = { displayTimeZone: zone };
        const s = resolveSpan({ id: 'o', start: day, end, allDay: true }, cfg, 'e');
        expect(s.spanDays).toBe(3);
      }),
      { numRuns: 300 },
    );
  });
});
