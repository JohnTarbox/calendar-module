import type { CalendarConfig } from '@calendar-module/contract';
import { dayKeyOf, dayToDateTime, type DayKey } from '../time/day.js';
import { bucketDay } from '../time/instant.js';
import { monthStartOf } from './month-grid.js';

/**
 * Month navigation (RS §1). The Month "anchor" is normalized to the first day of the month, so
 * the three round-trip invariants the spec property-tests all hold:
 *  - Next then Previous returns the identical anchor.
 *  - A view-switch round-trip lands on a range still containing the anchor (the anchor is
 *    month-normalized, so switching away and back is identity at month granularity).
 *  - A mini-month jump then Today returns to the original period (Today = the month of `now`).
 */
export function normalizeMonthAnchor(anchor: DayKey): DayKey {
  return monthStartOf(anchor);
}

export function nextMonth(anchor: DayKey): DayKey {
  return dayKeyOf(dayToDateTime(anchor).startOf('month').plus({ months: 1 }));
}

export function prevMonth(anchor: DayKey): DayKey {
  return dayKeyOf(dayToDateTime(anchor).startOf('month').minus({ months: 1 }));
}

/** The month containing "now" (in displayTimeZone) — the Today button target. */
export function todayMonthAnchor(now: string, cfg: CalendarConfig): DayKey {
  return monthStartOf(bucketDay(now, cfg.displayTimeZone));
}

/** Jump to the month containing an arbitrary date (mini-month picker). */
export function goToDateAnchor(date: DayKey): DayKey {
  return monthStartOf(date);
}

/** Whether the Today control should be disabled (already viewing today's month). */
export function isTodayInView(anchor: DayKey, now: string, cfg: CalendarConfig): boolean {
  return normalizeMonthAnchor(anchor) === todayMonthAnchor(now, cfg);
}
