import { DateTime } from 'luxon';
import { parseInstant, bucketDay } from './instant.js';
import type { DayKey } from './day.js';

/**
 * Time-grid math for Week/Day/Custom (AVS §4). All in `displayTimeZone` via Luxon.
 *
 * The load-bearing rule is **real day length** (§4.5): a DST-transition day is 1380 (spring
 * forward) or 1500 (fall back) minutes, NOT a fixed 1440 — otherwise the now-line and block
 * positions drift ~1h on transition days. Every fraction here divides by the actual day length.
 */

/** Actual length of `day` in `displayTimeZone`, in minutes (1380/1440/1500 across DST). */
export function dayLengthMinutes(day: DayKey, displayTimeZone: string): number {
  const start = DateTime.fromISO(day, { zone: displayTimeZone }).startOf('day');
  if (!start.isValid) return 1440;
  const next = start.plus({ days: 1 });
  return Math.round(next.diff(start, 'minutes').minutes);
}

/** Minutes from local midnight to the instant, in `displayTimeZone` (DST-correct via Luxon). */
export function minutesSinceMidnight(iso: string, displayTimeZone: string): number {
  const dt = parseInstant(iso).setZone(displayTimeZone);
  if (!dt.isValid) return 0;
  const start = dt.startOf('day');
  return Math.round(dt.diff(start, 'minutes').minutes);
}

/**
 * Now-line position as a fraction [0,1] of the grid height for `day`, or `null` when `now` is not
 * on `day` in `displayTimeZone` (the line renders only when today is visible, §4.4). DST-correct:
 * divides by the day's real length.
 */
export function nowLineFraction(now: string, day: DayKey, displayTimeZone: string): number | null {
  if (bucketDay(now, displayTimeZone) !== day) return null;
  const mins = minutesSinceMidnight(now, displayTimeZone);
  const len = dayLengthMinutes(day, displayTimeZone);
  if (len <= 0) return null;
  return Math.max(0, Math.min(1, mins / len));
}
