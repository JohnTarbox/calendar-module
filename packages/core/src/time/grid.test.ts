import { describe, it, expect } from 'vitest';
import { dayLengthMinutes, minutesSinceMidnight, nowLineFraction } from './grid.js';

const TZ = 'America/New_York';

describe('dayLengthMinutes — DST (AVS §4.5)', () => {
  it('is 1440 on a normal day', () => {
    expect(dayLengthMinutes('2026-06-16', TZ)).toBe(1440);
  });
  it('is 1380 on spring-forward (Mar 8, 2026 — lose an hour)', () => {
    expect(dayLengthMinutes('2026-03-08', TZ)).toBe(1380);
  });
  it('is 1500 on fall-back (Nov 1, 2026 — gain an hour)', () => {
    expect(dayLengthMinutes('2026-11-01', TZ)).toBe(1500);
  });
});

describe('minutesSinceMidnight (displayTimeZone)', () => {
  it('computes local minutes for a timed instant', () => {
    expect(minutesSinceMidnight('2026-06-16T09:30:00-04:00', TZ)).toBe(570); // 9:30
  });
  it('buckets a UTC instant into the local clock', () => {
    // 2026-06-16T13:30Z = 09:30 EDT
    expect(minutesSinceMidnight('2026-06-16T13:30:00Z', TZ)).toBe(570);
  });
});

describe('nowLineFraction (AVS §4.4)', () => {
  it('is null when now is not on the given day', () => {
    expect(nowLineFraction('2026-06-16T12:00:00-04:00', '2026-06-17', TZ)).toBeNull();
  });
  it('positions by minutes / real day length', () => {
    const f = nowLineFraction('2026-06-16T12:00:00-04:00', '2026-06-16', TZ);
    expect(f).toBeCloseTo(720 / 1440); // noon
  });
  it('uses the real (1380-min) length on a spring-forward day', () => {
    // 03:00 local AFTER spring-forward (the 2 AM hour is skipped); minutes-since-midnight = 120.
    const f = nowLineFraction('2026-03-08T03:00:00-04:00', '2026-03-08', TZ);
    expect(f).toBeCloseTo(120 / 1380);
  });
});
