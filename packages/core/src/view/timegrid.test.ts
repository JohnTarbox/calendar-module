import { describe, it, expect } from 'vitest';
import type { CalendarConfig, CalendarEvent } from '@jonnyboats/calendar-contract';
import { dayColumnSegments, packStrip, alignWeekStart, rangeDays } from './timegrid.js';

const cfg: CalendarConfig = { displayTimeZone: 'America/New_York', weekStartsOn: 0 };

function timed(id: string, start: string, end?: string): CalendarEvent {
  return { id, title: id, occurrences: [{ id: `${id}#1`, start, end, allDay: false }] } as CalendarEvent;
}
function allDay(id: string, start: string, end?: string): CalendarEvent {
  return { id, title: id, occurrences: [{ id: `${id}#1`, start, end, allDay: true }] } as CalendarEvent;
}

describe('dayColumnSegments (AVS §4.2/§4.3)', () => {
  it('a single-day timed event is one segment on its day', () => {
    const segs = dayColumnSegments([timed('a', '2026-06-16T09:00:00-04:00', '2026-06-16T10:30:00-04:00')], '2026-06-16', cfg);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ startMin: 540, endMin: 630, occurrenceId: 'a#1' });
  });

  it('[property] a cross-midnight occurrence occupies BOTH days, clamped, no overflow', () => {
    const ev = timed('night', '2026-06-16T23:30:00-04:00', '2026-06-17T00:30:00-04:00');
    const d1 = dayColumnSegments([ev], '2026-06-16', cfg);
    const d2 = dayColumnSegments([ev], '2026-06-17', cfg);
    expect(d1[0]).toMatchObject({ startMin: 1410, endMin: 1440, continuesToNextDay: true });
    expect(d2[0]).toMatchObject({ startMin: 0, endMin: 30, continuesFromPrevDay: true });
    // no negative / overflow heights
    for (const s of [...d1, ...d2]) {
      expect(s.endMin).toBeGreaterThanOrEqual(s.startMin);
      expect(s.endMin).toBeLessThanOrEqual(1440);
    }
  });

  it('a multi-day timed event (>24h) is NOT in the hour grid (→ strip)', () => {
    const ev = timed('long', '2026-06-16T09:00:00-04:00', '2026-06-18T17:00:00-04:00'); // 56h
    expect(dayColumnSegments([ev], '2026-06-16', cfg)).toHaveLength(0);
    expect(dayColumnSegments([ev], '2026-06-17', cfg)).toHaveLength(0);
  });

  it('all-day and ongoing events are excluded from the hour grid', () => {
    const ad = allDay('ad', '2026-06-16');
    const ongoing = allDay('og', '2026-06-01', '2026-07-01'); // >14d
    expect(dayColumnSegments([ad, ongoing], '2026-06-16', cfg)).toHaveLength(0);
  });

  it('[AC §1.3] a near-midnight timed instant buckets into its displayTimeZone day', () => {
    // 2026-06-17T03:30Z = 2026-06-16T23:30 EDT; end 03:45Z = 23:45 EDT → stays on 06-16.
    const ev = timed('late', '2026-06-17T03:30:00Z', '2026-06-17T03:45:00Z');
    expect(dayColumnSegments([ev], '2026-06-16', cfg)).toHaveLength(1);
    expect(dayColumnSegments([ev], '2026-06-17', cfg)).toHaveLength(0);
  });
});

describe('packStrip (AVS §4.1)', () => {
  const week = rangeDays('2026-06-14', 7); // Sun Jun 14 … Sat Jun 20

  it('[AC] a 3-day all-day event Fri–Sun is ONE ribbon across 3 columns (DTEND exclusive)', () => {
    const ev = allDay('fest', '2026-06-19', '2026-06-22'); // Fri Jun 19 – Sun Jun 21
    const { ribbons } = packStrip([ev], week, cfg);
    expect(ribbons).toHaveLength(1);
    expect(ribbons[0]).toMatchObject({ startCol: 5, endCol: 6, allDay: true }); // Fri=5, range clipped at Sat=6
  });

  it('a span entering/exiting the visible range sets continuation flags', () => {
    const ev = allDay('span', '2026-06-12', '2026-06-23'); // 11 days (≤14, not ongoing); Jun 12–22
    const { ribbons } = packStrip([ev], week, cfg);
    expect(ribbons[0]).toMatchObject({ startCol: 0, endCol: 6, continuesLeft: true, continuesRight: true });
  });

  it('a multi-day TIMED event (>24h) is a strip ribbon (allDay:false), not an hour block', () => {
    const ev = timed('t', '2026-06-15T09:00:00-04:00', '2026-06-17T17:00:00-04:00');
    const { ribbons } = packStrip([ev], week, cfg);
    expect(ribbons).toHaveLength(1);
    expect(ribbons[0]!.allDay).toBe(false);
  });

  it('an ongoing (>14d) event goes to the band, not the strip lanes', () => {
    const ev = allDay('og', '2026-06-01', '2026-07-01');
    const { ribbons, ongoing } = packStrip([ev], week, cfg);
    expect(ribbons).toHaveLength(0);
    expect(ongoing).toHaveLength(1);
    expect(ongoing[0]).toMatchObject({ throughDate: '2026-06-30' });
  });

  it('beyond maxLanes, ribbons are hidden and counted per-column (+N more, S2-4)', () => {
    const overlapping = [
      allDay('a', '2026-06-14', '2026-06-21'),
      allDay('b', '2026-06-14', '2026-06-21'),
      allDay('c', '2026-06-14', '2026-06-21'),
    ];
    const { ribbons, overflow } = packStrip(overlapping, week, cfg, 2);
    expect(ribbons.filter((r) => r.visible)).toHaveLength(2);
    expect(ribbons.filter((r) => !r.visible)).toHaveLength(1);
    // the hidden full-week ribbon contributes +1 to each of the 7 columns
    expect(overflow).toHaveLength(7);
    expect(overflow.every((o) => o.count === 1)).toBe(true);
  });

  it('[AC/property §1.5] a 20-day ongoing event = 1 band, 0 ribbons, 0 hour-grid blocks', () => {
    const ev = allDay('long', '2026-06-10', '2026-07-01'); // 21 days
    const { ribbons, ongoing } = packStrip([ev], week, cfg);
    expect(ongoing).toHaveLength(1);
    expect(ribbons).toHaveLength(0);
    expect(dayColumnSegments([ev], '2026-06-16', cfg)).toHaveLength(0);
  });
});

describe('range helpers (AVS §1.1)', () => {
  it('alignWeekStart snaps back to Sunday (weekStartsOn 0)', () => {
    expect(alignWeekStart('2026-06-16', cfg)).toBe('2026-06-14'); // Tue → preceding Sun
  });
  it('alignWeekStart honors weekStartsOn 1 (Monday)', () => {
    expect(alignWeekStart('2026-06-16', { ...cfg, weekStartsOn: 1 })).toBe('2026-06-15');
  });
  it('rangeDays yields N contiguous days', () => {
    expect(rangeDays('2026-06-16', 4)).toEqual(['2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19']);
  });
});
