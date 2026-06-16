import { isAllowedUrl } from '@jonnyboats/calendar-contract';

/**
 * Display formatting helpers. Uses the built-in `Intl` (no Luxon in the skin) and treats day
 * keys as UTC-noon dates so labels never shift across the date boundary.
 *
 * `safeHref` is the render-safety gate at the DOM edge: it re-checks the Zod URL allowlist so a
 * link protocol can never reach an `href`, even if a caller bypassed validation. We never use
 * `dangerouslySetInnerHTML` — React escapes all text by default (ES §7).
 */
export function safeHref(url: string | undefined): string | undefined {
  return url && isAllowedUrl(url) ? url : undefined;
}

function dayDate(dayKey: string): Date {
  return new Date(`${dayKey.slice(0, 10)}T12:00:00Z`);
}

export function monthTitle(year: number, month: number, locale = 'en-US'): string {
  const d = new Date(Date.UTC(year, month - 1, 1, 12));
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
}

/** Month name only, e.g. "January" — used as a Year mini-month title (the year is in the toolbar). */
export function monthName(year: number, month: number, locale = 'en-US'): string {
  const d = new Date(Date.UTC(year, month - 1, 1, 12));
  return new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(d);
}

export function weekdayShort(weekday: number, locale = 'en-US'): string {
  // weekday 0=Sun … 6=Sat. 2023-01-01 was a Sunday → use it as a reference week.
  const d = new Date(Date.UTC(2023, 0, 1 + weekday, 12));
  return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(d);
}

export function dayNumber(dayKey: string): number {
  return dayDate(dayKey).getUTCDate();
}

export function formatDayLong(dayKey: string, locale = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(dayDate(dayKey));
}

/** Compact human date, e.g. "Dec 19, 2026" — used in the ongoing strip. */
export function formatDayMedium(dayKey: string, locale = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(dayDate(dayKey));
}

/** Schedule date-group header, e.g. "Tue · June 16" (AVS §2.1). */
export function formatScheduleHeader(dayKey: string, locale = 'en-US'): string {
  const d = dayDate(dayKey);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(d);
  const monthDay = new Intl.DateTimeFormat(locale, {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(d);
  return `${weekday} · ${monthDay}`;
}

/** Compact day-range label, e.g. "Jun 1 – 5" / "Jun 28 – Jul 2" (AVS §1.5 multi-day rows). */
export function formatDayRange(startKey: string, endKey: string, locale = 'en-US'): string {
  const start = dayDate(startKey);
  const end = dayDate(endKey);
  const sameMonth = startKey.slice(0, 7) === endKey.slice(0, 7);
  const startLabel = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(start);
  const endLabel = sameMonth
    ? new Intl.DateTimeFormat(locale, { day: 'numeric', timeZone: 'UTC' }).format(end)
    : new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(end);
  return `${startLabel} – ${endLabel}`;
}
