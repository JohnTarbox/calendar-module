import { DateTime } from 'luxon';
import type { DayKey } from './day.js';

/**
 * Timed-instant helpers. A timed occurrence pins an instant (ISO 8601 with offset); these
 * functions convert it to a display day and a wall-clock label under the engine's two-tz rule
 * (ES §8, S2-1):
 *
 * - **Buckets into the day in `displayTimeZone`** — which calendar cell it lands in.
 * - **Renders wall-clock in `Occurrence.timezone`** (falling back to `displayTimeZone`).
 *
 * So a `2026-07-04T20:00-05:00` (America/Chicago) occurrence under an America/New_York display
 * buckets by the NY day but shows the Chicago clock time.
 */

/** Parse an ISO instant, preserving its declared offset. */
export function parseInstant(iso: string): DateTime {
  return DateTime.fromISO(iso, { setZone: true });
}

/** The calendar day a timed instant falls on, in the display zone (the bucketing rule). */
export function bucketDay(iso: string, displayTimeZone: string): DayKey {
  return parseInstant(iso).setZone(displayTimeZone).toFormat('yyyy-MM-dd');
}

/** Wall-clock `HH:mm` label, rendered in the occurrence's own zone when present. */
export function wallClockLabel(
  iso: string,
  renderZone: string,
  locale: string | undefined,
): string {
  const dt = parseInstant(iso).setZone(renderZone);
  return locale
    ? dt.setLocale(locale).toLocaleString(DateTime.TIME_SIMPLE)
    : dt.toFormat('HH:mm');
}

/** True iff the parsed instant is valid (used to degrade gracefully on garbage, ES §6). */
export function isValidInstant(iso: string): boolean {
  return parseInstant(iso).isValid;
}
