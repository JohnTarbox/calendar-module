import type { CalendarConfig, Occurrence } from '@calendar-module/contract';
import { addDays, compareDay, diffDays, type DayKey } from './day.js';
import { bucketDay, parseInstant, wallClockLabel } from './instant.js';

/**
 * A single occurrence resolved to the calendar days it occupies, implementing the ES §5
 * `(allDay, end)` span table:
 *
 * | allDay | end     | resulting span                                             |
 * |--------|---------|------------------------------------------------------------|
 * | true   | present | start day … (end − 1 day) inclusive (DTEND exclusive)      |
 * | true   | omitted | single day (start)                                         |
 * | false  | present | start → end (inclusive instant), bucketed in displayTimeZone |
 * | false  | omitted | start → start + defaultDurationMinutes (default 60)        |
 *
 * Garbage input (end < start, NaN) degrades to a clamped single-day span rather than throwing
 * or producing a negative range (ES §6 robustness).
 */
export type SpanKind = 'allDayMulti' | 'allDaySingle' | 'timed';

export interface ResolvedSpan {
  occurrenceId: string;
  eventId: string;
  kind: SpanKind;
  allDay: boolean;
  startDay: DayKey;
  endDayInclusive: DayKey;
  spanDays: number; // always >= 1
  crossesMidnight: boolean; // a timed span occupying more than one display day
  /** Wall-clock label for timed occurrences (in `Occurrence.timezone ?? displayTimeZone`). */
  timeLabel?: string;
}

const DEFAULT_DURATION_MINUTES = 60;

function datePart(s: string): DayKey {
  return s.slice(0, 10);
}

export function resolveSpan(
  occ: Occurrence,
  cfg: CalendarConfig,
  eventId: string,
): ResolvedSpan {
  const base = { occurrenceId: occ.id, eventId, allDay: occ.allDay };

  if (occ.allDay) {
    const startDay = datePart(occ.start);
    let endDayInclusive = startDay;
    if (occ.end) {
      // DTEND is exclusive: a Fri–Mon end means the event covers Fri, Sat, Sun (3 days).
      const exclusive = datePart(occ.end);
      const candidate = addDays(exclusive, -1);
      endDayInclusive = compareDay(candidate, startDay) < 0 ? startDay : candidate;
    }
    const spanDays = diffDays(endDayInclusive, startDay) + 1;
    return {
      ...base,
      kind: spanDays > 1 ? 'allDayMulti' : 'allDaySingle',
      startDay,
      endDayInclusive,
      spanDays,
      crossesMidnight: false,
    };
  }

  // Timed: bucket into the display zone; render wall-clock in the occurrence's own zone.
  const dz = cfg.displayTimeZone;
  const startInstant = parseInstant(occ.start);
  if (!startInstant.isValid) {
    const startDay = datePart(occ.start);
    return {
      ...base,
      kind: 'timed',
      startDay,
      endDayInclusive: startDay,
      spanDays: 1,
      crossesMidnight: false,
    };
  }

  const startDay = bucketDay(occ.start, dz);
  const durationMin = cfg.defaultDurationMinutes ?? DEFAULT_DURATION_MINUTES;
  let endInstant = occ.end ? parseInstant(occ.end) : startInstant.plus({ minutes: durationMin });
  if (!endInstant.isValid || endInstant < startInstant) {
    endInstant = startInstant; // clamp on garbage / end<start
  }
  const rawEndDay = endInstant.setZone(dz).toFormat('yyyy-MM-dd');
  const endDayInclusive = compareDay(rawEndDay, startDay) < 0 ? startDay : rawEndDay;
  const spanDays = diffDays(endDayInclusive, startDay) + 1;

  return {
    ...base,
    kind: 'timed',
    startDay,
    endDayInclusive,
    spanDays,
    crossesMidnight: endDayInclusive !== startDay,
    timeLabel: wallClockLabel(occ.start, occ.timezone ?? dz, cfg.locale),
  };
}
