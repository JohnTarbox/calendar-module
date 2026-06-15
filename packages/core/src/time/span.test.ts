import { describe, it, expect } from 'vitest';
import type { CalendarConfig, Occurrence } from '@johntarbox/calendar-contract';
import { resolveSpan } from './span.js';

const NY: CalendarConfig = { displayTimeZone: 'America/New_York' };

function occ(o: Partial<Occurrence> & Pick<Occurrence, 'start' | 'allDay'>): Occurrence {
  return { id: 'o', ...o } as Occurrence;
}

describe('resolveSpan — the (allDay, end) span table (ES §5)', () => {
  it('all-day, omitted end → single day', () => {
    const s = resolveSpan(occ({ start: '2026-05-02', allDay: true }), NY, 'e');
    expect(s.startDay).toBe('2026-05-02');
    expect(s.endDayInclusive).toBe('2026-05-02');
    expect(s.spanDays).toBe(1);
    expect(s.kind).toBe('allDaySingle');
  });

  it('all-day, DTEND exclusive → 3-day event covers exactly 3 cells (off-by-one)', () => {
    // Fri 2026-05-01 .. DTEND Mon 2026-05-04 (exclusive) => Fri, Sat, Sun = 3 days.
    const s = resolveSpan(occ({ start: '2026-05-01', end: '2026-05-04', allDay: true }), NY, 'e');
    expect(s.startDay).toBe('2026-05-01');
    expect(s.endDayInclusive).toBe('2026-05-03');
    expect(s.spanDays).toBe(3);
    expect(s.kind).toBe('allDayMulti');
  });

  it('timed with end → bucketed in displayTimeZone', () => {
    const s = resolveSpan(
      occ({ start: '2026-07-04T20:00:00-05:00', end: '2026-07-04T22:00:00-05:00', allDay: false, timezone: 'America/Chicago' }),
      NY,
      'e',
    );
    // 20:00 Chicago = 21:00 NY, still Jul 4
    expect(s.startDay).toBe('2026-07-04');
    expect(s.kind).toBe('timed');
  });

  it('timed, omitted end → start + defaultDurationMinutes (crossing midnight occupies 2 days)', () => {
    const s = resolveSpan(occ({ start: '2026-07-04T23:30:00-04:00', allDay: false }), NY, 'e');
    expect(s.startDay).toBe('2026-07-04');
    expect(s.endDayInclusive).toBe('2026-07-05'); // 23:30 + 60m = 00:30 next day
    expect(s.spanDays).toBe(2);
    expect(s.crossesMidnight).toBe(true);
  });

  it('two-tz: buckets on the displayTimeZone day, labels in the occurrence zone (S2-1)', () => {
    // 23:30 Chicago = 00:30 NY next day → buckets Jul 5 in NY display, label shows Chicago 23:30.
    const s = resolveSpan(
      occ({ start: '2026-07-04T23:30:00-05:00', allDay: false, timezone: 'America/Chicago' }),
      NY,
      'e',
    );
    expect(s.startDay).toBe('2026-07-05');
    expect(s.timeLabel).toBe('23:30');
  });

  it('degrades gracefully on end < start (clamps to single day, never negative)', () => {
    const s = resolveSpan(occ({ start: '2026-05-10', end: '2026-05-05', allDay: true }), NY, 'e');
    expect(s.spanDays).toBe(1);
    expect(s.endDayInclusive).toBe('2026-05-10');
  });
});
