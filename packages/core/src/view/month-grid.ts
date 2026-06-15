import type { CalendarConfig } from '@johntarbox/calendar-contract';
import { DateTime } from 'luxon';
import {
  addDays,
  dayKeyOf,
  dayRange,
  dayToDateTime,
  weekdayOf,
  type DayKey,
} from '../time/day.js';
import { bucketDay } from '../time/instant.js';

/**
 * Month grid construction (RS §2). Covers the leading/trailing adjacent-month days so the grid
 * is always a full 5–6 week × 7 rectangle aligned to `weekStartsOn`. "Today" is computed from
 * an injected `now` (an ISO string the host pins at request time) in `displayTimeZone` — the
 * engine never reads a clock, which is what makes SSR "now" stable (ES §8).
 */
export interface GridCell {
  date: DayKey;
  inMonth: boolean;
  isToday: boolean;
  weekday: number; // 0=Sun … 6=Sat
}

export interface GridWeek {
  weekNumber?: number; // ISO-8601 week-of-year (S3-4) when showWeekNumbers
  cells: GridCell[];
}

export interface CalendarGrid {
  monthStart: DayKey; // first day of the anchored month
  year: number;
  month: number; // 1–12
  weekStartsOn: 0 | 1;
  today: DayKey | null;
  weeks: GridWeek[];
}

/** First day of the month containing `anchor` (a day key in that month). */
export function monthStartOf(anchor: DayKey): DayKey {
  return dayKeyOf(dayToDateTime(anchor).startOf('month'));
}

export function buildMonthGrid(
  anchor: DayKey,
  cfg: CalendarConfig,
  now: string,
): CalendarGrid {
  const weekStartsOn = cfg.weekStartsOn ?? 0;
  const showWeek = cfg.showWeekNumbers ?? false;

  const first = dayToDateTime(anchor).startOf('month');
  const monthStart = dayKeyOf(first);
  const last = dayKeyOf(first.endOf('month'));
  const year = first.year;
  const month = first.month;

  // Align the grid start to the configured week start, on/before the 1st.
  const firstWeekday = weekdayOf(monthStart);
  const leadOffset = (firstWeekday - weekStartsOn + 7) % 7;
  const gridStart = addDays(monthStart, -leadOffset);

  // Extend to complete the final week.
  const lastWeekday = weekdayOf(last);
  const trailOffset = (weekStartsOn + 6 - lastWeekday + 7) % 7;
  const gridEnd = addDays(last, trailOffset);

  const today = bucketDay(now, cfg.displayTimeZone);
  const days = dayRange(gridStart, gridEnd);
  const weeks: GridWeek[] = [];

  for (let i = 0; i < days.length; i += 7) {
    const slice = days.slice(i, i + 7);
    const cells: GridCell[] = slice.map((date) => ({
      date,
      inMonth: date >= monthStart && date <= last,
      isToday: date === today,
      weekday: weekdayOf(date),
    }));
    const week: GridWeek = { cells };
    if (showWeek && slice[0]) {
      week.weekNumber = DateTime.fromISO(slice[0], { zone: 'utc' }).weekNumber;
    }
    weeks.push(week);
  }

  return { monthStart, year, month, weekStartsOn, today, weeks };
}
