import { DateTime } from 'luxon';

/**
 * Calendar-date helpers. A "day" here is a `yyyy-MM-dd` string, NOT an instant.
 *
 * All arithmetic is anchored at UTC midnight so it is DST-proof: adding or diffing days never
 * lands on the wrong date because a transition day was 23/25 hours long. DST only matters when
 * bucketing a *timed instant* into a day — a separate, explicit step (see `instant.ts`). This
 * is also what keeps all-day occurrences floating (ES §5/§8): they are pure date strings that
 * never touch a zone.
 */
export type DayKey = string; // 'yyyy-MM-dd'

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDayKey(s: string): s is DayKey {
  return DAY_RE.test(s);
}

/** Parse a `yyyy-MM-dd` key to a UTC-midnight DateTime (for arithmetic only). */
export function dayToDateTime(key: DayKey): DateTime {
  return DateTime.fromISO(key, { zone: 'utc' }).startOf('day');
}

/** Format the date portion of a (already zone-resolved) DateTime as a day key. */
export function dayKeyOf(dt: DateTime): DayKey {
  return dt.toFormat('yyyy-MM-dd');
}

export function addDays(key: DayKey, n: number): DayKey {
  return dayKeyOf(dayToDateTime(key).plus({ days: n }));
}

/** `a - b` in whole calendar days (positive when `a` is later). */
export function diffDays(a: DayKey, b: DayKey): number {
  return Math.round(dayToDateTime(a).diff(dayToDateTime(b), 'days').days);
}

export function compareDay(a: DayKey, b: DayKey): number {
  return diffDays(a, b);
}

/** Inclusive list of day keys from `start` to `end` (empty if end < start). */
export function dayRange(start: DayKey, end: DayKey): DayKey[] {
  const n = diffDays(end, start);
  if (n < 0) return [];
  const out: DayKey[] = [];
  for (let i = 0; i <= n; i++) out.push(addDays(start, i));
  return out;
}

/** 0 = Sunday … 6 = Saturday, matching `CalendarConfig.weekStartsOn` semantics. */
export function weekdayOf(key: DayKey): number {
  // Luxon weekday: 1=Mon … 7=Sun. Convert to 0=Sun … 6=Sat.
  return dayToDateTime(key).weekday % 7;
}
