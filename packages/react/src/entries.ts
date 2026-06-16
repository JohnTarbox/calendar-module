import type { CalendarConfig, CalendarEvent } from '@jonnyboats/calendar-contract';
import { resolveSpan, type DayKey } from '@jonnyboats/calendar-core';
import type { DayEntry } from './popovers.js';

/**
 * Every occurrence intersecting `date` (in `displayTimeZone`), shaped for the day popover. Shared
 * by Month (cell click / "+N more") and Year (hydrate-on-click), so both views present the same
 * day list: all-day first, then timed ascending by start (RS §5b).
 */
export function occurrencesOnDay(
  events: readonly CalendarEvent[],
  date: DayKey,
  cfg: CalendarConfig,
): DayEntry[] {
  const out: DayEntry[] = [];
  for (const event of events) {
    for (const occ of event.occurrences) {
      const span = resolveSpan(occ, cfg, event.id);
      if (span.startDay <= date && date <= span.endDayInclusive) {
        out.push({ event, occ, timeLabel: span.timeLabel, allDay: occ.allDay });
      }
    }
  }
  return out.sort((a, b) => {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1; // all-day first
    return (a.timeLabel ?? '').localeCompare(b.timeLabel ?? '');
  });
}
