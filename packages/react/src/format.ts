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
