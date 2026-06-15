/**
 * ┌─────────────────────────────────────────────────────────────────────────────────────────┐
 * │ REFERENCE ADAPTER — owned by the MMATF developer, NOT by the calendar module.             │
 * │                                                                                           │
 * │ This is the reference mapping from MMATF's `events` + `event_days` D1 shape to the frozen │
 * │ `CalendarEvent` contract. It is intentionally OUTSIDE the published packages so it can    │
 * │ never drift into the module core. The module ships NO MMATF-isms (ES §5/§11); the         │
 * │ MMATF-specific D1 mapping is the MMATF dev's to own and evolve against their real tables.  │
 * │ The module packages (contract/core/react) MUST NOT import this file.                       │
 * └─────────────────────────────────────────────────────────────────────────────────────────┘
 */
import type { CalendarEvent, Occurrence } from '@johntarbox/calendar-contract';
import { DateTime } from 'luxon';

/** MMATF `events` row shape (representative — reconcile against your real columns). */
export interface EventRow {
  id: number;
  title: string;
  category: string | null;
  url: string | null;
  venue_name: string | null;
  town: string | null;
  lat: number | null;
  lng: number | null;
}

/** MMATF `event_days` row shape. `end_day` (inclusive) lets one row express a multi-day span. */
export interface DayRow {
  id: string;
  event_id: number;
  day: string;
  end_day: string | null;
  all_day: number;
  start_time: string | null;
  end_time: string | null;
  open_time: string | null;
  close_time: string | null;
}

function locationOf(e: EventRow): string | undefined {
  if (e.venue_name && e.town) return `${e.venue_name}, ${e.town}`;
  return e.venue_name ?? e.town ?? undefined;
}

function localIso(day: string, time: string, zone: string): string {
  const dt = DateTime.fromISO(`${day}T${time}`, { zone });
  return dt.toISO() ?? `${day}T${time}:00`;
}

function mapDay(row: DayRow, event: EventRow, zone: string): Occurrence {
  const occ: Occurrence = { id: row.id, start: '', allDay: row.all_day === 1 };
  const loc = locationOf(event);
  if (loc) occ.location = loc;
  if (event.lat != null && event.lng != null) occ.mapUrl = `geo:${event.lat},${event.lng}`;
  if (row.open_time) occ.openTime = row.open_time;
  if (row.close_time) occ.closeTime = row.close_time;

  if (row.all_day === 1) {
    occ.start = row.day;
    // end_day is inclusive in storage → DTEND is exclusive, so add one day.
    if (row.end_day) {
      occ.end = DateTime.fromISO(row.end_day, { zone: 'utc' }).plus({ days: 1 }).toFormat('yyyy-MM-dd');
    }
  } else {
    occ.start = localIso(row.day, row.start_time ?? '00:00', zone);
    occ.timezone = zone;
    if (row.end_time) occ.end = localIso(row.day, row.end_time, zone);
  }
  return occ;
}

/**
 * Map `events` + `event_days` rows → `CalendarEvent[]`. Occurrence ids reuse the composite
 * `event_days.id` so they are stable + idempotent across windowed loads. Output is sorted
 * ascending per event (so it passes the contract's `validateWindow`).
 */
export function toCalendarEvents(
  events: EventRow[],
  days: DayRow[],
  displayTimeZone: string,
): CalendarEvent[] {
  const byEvent = new Map<number, DayRow[]>();
  for (const d of days) {
    const arr = byEvent.get(d.event_id) ?? [];
    arr.push(d);
    byEvent.set(d.event_id, arr);
  }

  const out: CalendarEvent[] = [];
  for (const e of events) {
    const rows = byEvent.get(e.id);
    if (!rows || rows.length === 0) continue;
    const occurrences = rows
      .map((r) => mapDay(r, e, displayTimeZone))
      .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

    const event: CalendarEvent = { id: String(e.id), title: e.title, occurrences };
    if (e.category) event.category = e.category;
    if (e.url) event.url = e.url;
    out.push(event);
  }
  return out;
}
