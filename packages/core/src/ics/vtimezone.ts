import { DateTime } from 'luxon';
import { escapeIcsText } from './escape.js';

/**
 * Minimal VTIMEZONE synthesis (ES §9c). TZID alone is insufficient for many importers, so each
 * distinct zone referenced by a timed occurrence gets a VTIMEZONE component.
 *
 * v0 scope: one STANDARD subcomponent per distinct UTC offset observed for the zone (derived
 * from the actual occurrence instants via Luxon). This is correct for events that do not
 * straddle a DST transition — the common case. Full RRULE-based STANDARD/DAYLIGHT transition
 * fidelity is a follow-on hardening item (the Apple/Outlook round-trip AC is itself deferred to
 * a connected environment in the v0 plan).
 */
function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${sign}${hh}${mm}`;
}

/** Build a VTIMEZONE for `tzid`, given the ISO start instants that reference it. */
export function buildVTimezone(tzid: string, startInstants: string[]): string[] {
  const byOffset = new Map<number, { date: string; name: string }>();
  for (const iso of startInstants) {
    const dt = DateTime.fromISO(iso, { setZone: true }).setZone(tzid);
    if (!dt.isValid) continue;
    if (!byOffset.has(dt.offset)) {
      byOffset.set(dt.offset, {
        date: dt.toFormat("yyyyMMdd'T'HHmmss"),
        name: dt.offsetNameShort ?? tzid,
      });
    }
  }
  if (byOffset.size === 0) {
    // Fall back to the zone's January offset so the component is always present + valid.
    const jan = DateTime.fromObject({ year: 2026, month: 1, day: 1 }, { zone: tzid });
    byOffset.set(jan.isValid ? jan.offset : 0, {
      date: '20260101T000000',
      name: jan.isValid ? (jan.offsetNameShort ?? tzid) : 'UTC',
    });
  }

  const lines: string[] = ['BEGIN:VTIMEZONE', `TZID:${escapeIcsText(tzid)}`];
  for (const [offset, info] of [...byOffset.entries()].sort((a, b) => a[0] - b[0])) {
    const off = formatOffset(offset);
    lines.push(
      'BEGIN:STANDARD',
      `DTSTART:${info.date}`,
      `TZOFFSETFROM:${off}`,
      `TZOFFSETTO:${off}`,
      `TZNAME:${escapeIcsText(info.name)}`,
      'END:STANDARD',
    );
  }
  lines.push('END:VTIMEZONE');
  return lines;
}
