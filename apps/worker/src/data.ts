import type { CalendarEvent } from '@calendar-module/contract';
import { validateWindow } from '@calendar-module/contract';
import { toCalendarEvents, type DayRow, type EventRow } from './adapter.js';

export interface Env {
  DB: D1Database;
  DISPLAY_TZ?: string;
}

/**
 * Windowed read: fetch only the event_days intersecting [from, to] (incl. multi-day spans via
 * `end_day`), then their parent events, then map → contract. The edge cache (production) keys on
 * window + tenant + cache-epoch only — NEVER category filters, which are applied client-side
 * (ES §8, S2-2). Production reads go through the D1 Sessions API for read-replica routing; the
 * v0 local path uses plain prepared statements.
 */
export async function fetchWindow(
  env: Env,
  from: string,
  to: string,
  displayTimeZone: string,
): Promise<CalendarEvent[]> {
  const dayRows = await env.DB.prepare(
    `SELECT id, event_id, day, end_day, all_day, start_time, end_time, open_time, close_time
       FROM event_days
      WHERE day <= ?2 AND COALESCE(end_day, day) >= ?1`,
  )
    .bind(from, to)
    .all<DayRow>();

  const days = dayRows.results ?? [];
  if (days.length === 0) return [];

  const ids = [...new Set(days.map((d) => d.event_id))];
  const placeholders = ids.map(() => '?').join(',');
  const eventRows = await env.DB.prepare(
    `SELECT id, title, category, url, venue_name, town, lat, lng FROM events WHERE id IN (${placeholders})`,
  )
    .bind(...ids)
    .all<EventRow>();

  const events = toCalendarEvents(eventRows.results ?? [], days, displayTimeZone);

  // Defense in depth: the adapter must emit a contract-valid window (sorted, unique).
  const check = validateWindow(events);
  if (!check.success) {
    throw new Error(`adapter produced an invalid window: ${check.errors.join('; ')}`);
  }
  return events;
}
