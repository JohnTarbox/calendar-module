import type { CalendarConfig, CalendarEvent, Occurrence } from '@johntarbox/calendar-contract';
import { isAllowedUrl } from '@johntarbox/calendar-contract';
import { DateTime } from 'luxon';
import { parseInstant } from '../time/instant.js';
import { escapeIcsText, serializeLines } from './escape.js';
import { buildVTimezone } from './vtimezone.js';

/**
 * `.ics` export (RS §5a "Add to calendar", ES §9c). Scope selects a single event (default),
 * a single day, or the visible window. Correctness rules: all-day uses `VALUE=DATE` (floating,
 * DTEND exclusive); timed emits a VTIMEZONE + `TZID`; one VEVENT per occurrence (never one
 * VEVENT spanning the whole range). All user fields pass through {@link escapeIcsText}.
 */
export interface IcsOptions {
  scope?: 'event' | 'day' | 'window';
  /** Required when scope === 'day': the day to export (yyyy-MM-dd, in displayTimeZone). */
  day?: string;
  /** Restrict scope==='event' to a single event id. */
  eventId?: string;
  /** DTSTAMP value (ISO); defaults per-occurrence to the start instant in UTC (deterministic). */
  dtstamp?: string;
}

const PRODID = '-//calendar-module//EN';

interface Selected {
  event: CalendarEvent;
  occ: Occurrence;
}

function durationEnd(occ: Occurrence, cfg: CalendarConfig): DateTime {
  const start = parseInstant(occ.start);
  const dur = cfg.defaultDurationMinutes ?? 60;
  const end = occ.end ? parseInstant(occ.end) : start.plus({ minutes: dur });
  return end.isValid && end >= start ? end : start;
}

function utcStamp(iso: string): string {
  const dt = parseInstant(iso);
  const u = dt.isValid ? dt.toUTC() : DateTime.fromISO(iso.slice(0, 10), { zone: 'utc' });
  return (u.isValid ? u : DateTime.fromMillis(0, { zone: 'utc' })).toFormat("yyyyMMdd'T'HHmmss'Z'");
}

function dateBasic(dayKey: string): string {
  return dayKey.slice(0, 10).replace(/-/g, '');
}

export function generateIcs(
  events: CalendarEvent[],
  cfg: CalendarConfig,
  opts: IcsOptions = {},
): string {
  const scope = opts.scope ?? 'event';

  const selected: Selected[] = [];
  for (const event of events) {
    if (scope === 'event' && opts.eventId && event.id !== opts.eventId) continue;
    for (const occ of event.occurrences) {
      if (scope === 'day' && opts.day) {
        const occDay = occ.allDay
          ? occ.start.slice(0, 10)
          : parseInstant(occ.start).setZone(cfg.displayTimeZone).toFormat('yyyy-MM-dd');
        if (occDay !== opts.day) continue;
      }
      selected.push({ event, occ });
    }
  }

  // Collect VTIMEZONE components for every zone referenced by a timed occurrence.
  const zoneStarts = new Map<string, string[]>();
  for (const { occ } of selected) {
    if (occ.allDay) continue;
    const zone = occ.timezone ?? cfg.displayTimeZone;
    const arr = zoneStarts.get(zone) ?? [];
    arr.push(occ.start);
    zoneStarts.set(zone, arr);
  }

  const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:${PRODID}`, 'CALSCALE:GREGORIAN'];
  for (const [zone, starts] of zoneStarts) lines.push(...buildVTimezone(zone, starts));

  for (const { event, occ } of selected) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${escapeIcsText(occ.id)}@calendar-module`);
    lines.push(`DTSTAMP:${utcStamp(opts.dtstamp ?? occ.start)}`);
    lines.push(`SUMMARY:${escapeIcsText(event.title)}`);

    if (occ.allDay) {
      const startDay = dateBasic(occ.start);
      const endDay = occ.end
        ? dateBasic(occ.end)
        : dateBasic(DateTime.fromISO(occ.start.slice(0, 10), { zone: 'utc' }).plus({ days: 1 }).toFormat('yyyy-MM-dd'));
      lines.push(`DTSTART;VALUE=DATE:${startDay}`);
      lines.push(`DTEND;VALUE=DATE:${endDay}`); // DTEND exclusive
    } else {
      const zone = occ.timezone ?? cfg.displayTimeZone;
      const start = parseInstant(occ.start).setZone(zone);
      const end = durationEnd(occ, cfg).setZone(zone);
      lines.push(`DTSTART;TZID=${zone}:${start.toFormat("yyyyMMdd'T'HHmmss")}`);
      lines.push(`DTEND;TZID=${zone}:${end.toFormat("yyyyMMdd'T'HHmmss")}`);
    }

    if (occ.location) lines.push(`LOCATION:${escapeIcsText(occ.location)}`);
    if (event.url && isAllowedUrl(event.url)) lines.push(`URL:${escapeIcsText(event.url)}`);
    if (occ.note) lines.push(`DESCRIPTION:${escapeIcsText(occ.note)}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return serializeLines(lines);
}
