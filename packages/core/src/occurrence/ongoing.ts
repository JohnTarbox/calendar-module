import type { CalendarConfig, CalendarEvent, Occurrence } from '@calendar-module/contract';
import { resolveSpan } from '../time/span.js';
import { parseInstant } from '../time/instant.js';

/**
 * The `ongoing` predicate (ES §5, S1-2). An occurrence spanning more than 14 days (strict)
 * renders as the "Ongoing through {date}" strip (RS §11) and is EXCLUDED from ribbon
 * lane-packing — it never produces a ribbon segment.
 *
 * - **Per-occurrence, not per-series:** a multi-occurrence event flags ongoing only if one of
 *   its *own* occurrences exceeds 14 days.
 * - **Explicit override wins:** `CalendarEvent.ongoing` (when present) forces the event's
 *   occurrences to be treated as ongoing regardless of derived span.
 * - **Boundary is strict:** exactly 14 days is NOT ongoing (property-tested).
 *
 * All-day uses covered-day count (`spanDays`, which equals the DTEND-exclusive difference);
 * timed uses the real instant duration so a 14.0-day timed span is correctly not-ongoing.
 */
const ONGOING_THRESHOLD_DAYS = 14;

export function occurrenceSpanExceeds14d(occ: Occurrence, cfg: CalendarConfig): boolean {
  if (occ.allDay) {
    const span = resolveSpan(occ, cfg, '');
    return span.spanDays > ONGOING_THRESHOLD_DAYS;
  }
  const start = parseInstant(occ.start);
  if (!start.isValid) return false;
  const durationMin = cfg.defaultDurationMinutes ?? 60;
  const endRaw = occ.end ? parseInstant(occ.end) : start.plus({ minutes: durationMin });
  const end = endRaw.isValid && endRaw >= start ? endRaw : start;
  return end.diff(start, 'days').days > ONGOING_THRESHOLD_DAYS;
}

/**
 * Whether a specific occurrence should render as the ongoing strip (respecting the event-level
 * explicit override). This is the classification the Month lane-packing pre-filter uses.
 */
export function isOccurrenceOngoing(
  event: CalendarEvent,
  occ: Occurrence,
  cfg: CalendarConfig,
): boolean {
  if (typeof event.ongoing === 'boolean') return event.ongoing;
  return occurrenceSpanExceeds14d(occ, cfg);
}

/** Whether the event flags ongoing at all (any of its occurrences renders as a strip). */
export function isEventOngoing(event: CalendarEvent, cfg: CalendarConfig): boolean {
  if (typeof event.ongoing === 'boolean') return event.ongoing;
  return event.occurrences.some((o) => occurrenceSpanExceeds14d(o, cfg));
}
