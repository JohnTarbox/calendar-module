import type { CalendarConfig, CalendarEvent, Occurrence } from '@johntarbox/calendar-contract';
import { parseInstant } from '../time/instant.js';
import { dayToDateTime } from '../time/day.js';
import { DateTime } from 'luxon';

/**
 * Occurrence selection for the detail popover (RS §5a, S1-6).
 *
 * - The popover for a *clicked* occurrence shows THAT occurrence's date — never the series
 *   start (it may be a paged-to month).
 * - A "Next upcoming" line appears ONLY when the clicked occurrence is in the past. It is
 *   **best-effort over loaded occurrences**: the first occurrence with `start >= now`. If none
 *   is loaded, the caller falls back to `recurrenceSummary` or omits the line — it MUST NOT
 *   fire a synchronous fetch from the popover.
 *
 * Relies on `occurrences[]` being sorted ascending (validateWindow-enforced).
 */
function startMs(occ: Occurrence): number {
  if (occ.allDay) return dayToDateTime(occ.start.slice(0, 10)).toMillis();
  const dt = parseInstant(occ.start);
  return dt.isValid ? dt.toMillis() : Number.NaN;
}

export function isOccurrencePast(occ: Occurrence, now: string, cfg: CalendarConfig): boolean {
  const nowMs = nowMillis(now, cfg);
  const ms = startMs(occ);
  return !Number.isNaN(ms) && ms < nowMs;
}

/** First loaded occurrence with `start >= now`, or undefined (best-effort; never fetches). */
export function nextUpcomingOccurrence(
  event: CalendarEvent,
  now: string,
  cfg: CalendarConfig,
): Occurrence | undefined {
  const nowMs = nowMillis(now, cfg);
  return event.occurrences.find((o) => {
    const ms = startMs(o);
    return !Number.isNaN(ms) && ms >= nowMs;
  });
}

function nowMillis(now: string, cfg: CalendarConfig): number {
  const dt = parseInstant(now);
  if (dt.isValid) return dt.toMillis();
  // date-only `now` → midnight in displayTimeZone
  const day = DateTime.fromISO(now.slice(0, 10), { zone: cfg.displayTimeZone });
  return day.isValid ? day.toMillis() : Date.parse(now);
}
