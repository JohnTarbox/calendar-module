import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { CalendarConfig, CalendarEvent } from '@jonnyboats/calendar-contract';
import { escapeIcsText } from './escape.js';
import { generateIcs } from './generate.js';

const cfg: CalendarConfig = { displayTimeZone: 'America/New_York' };

describe('escapeIcsText — injection guard (ES §6/§9c)', () => {
  it('escapes the RFC 5545 special characters and newlines', () => {
    expect(escapeIcsText('a;b,c\\d')).toBe('a\\;b\\,c\\\\d');
    expect(escapeIcsText('line1\nline2')).toBe('line1\\nline2');
    expect(escapeIcsText('cr\r\nlf')).toBe('cr\\nlf');
  });
});

describe('generateIcs — correctness (ES §9c)', () => {
  it('all-day occurrences use VALUE=DATE with an exclusive DTEND', () => {
    const events: CalendarEvent[] = [
      { id: 'e', title: 'Fair', occurrences: [{ id: 'o', start: '2026-06-01', end: '2026-06-04', allDay: true }] },
    ];
    const ics = generateIcs(events, cfg);
    expect(ics).toContain('DTSTART;VALUE=DATE:20260601');
    expect(ics).toContain('DTEND;VALUE=DATE:20260604'); // exclusive
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).not.toContain('BEGIN:VTIMEZONE'); // no tz needed for floating all-day
  });

  it('timed occurrences emit a VTIMEZONE + TZID (not TZID alone)', () => {
    const events: CalendarEvent[] = [
      { id: 'e', title: 'Concert', occurrences: [{ id: 'o', start: '2026-07-04T20:00:00-04:00', allDay: false, timezone: 'America/New_York' }] },
    ];
    const ics = generateIcs(events, cfg);
    expect(ics).toContain('BEGIN:VTIMEZONE');
    expect(ics).toContain('TZID:America/New_York');
    expect(ics).toContain('DTSTART;TZID=America/New_York:20260704T200000');
  });

  it('emits one VEVENT per occurrence (never one spanning the whole series)', () => {
    const events: CalendarEvent[] = [
      {
        id: 'e',
        title: 'Weekly',
        occurrences: [
          { id: 'o1', start: '2026-06-06', allDay: true },
          { id: 'o2', start: '2026-06-13', allDay: true },
        ],
      },
    ];
    const ics = generateIcs(events, cfg);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });

  it('fuzz: hostile field content never injects a new component or property', () => {
    const hostile = fc.string({ minLength: 0, maxLength: 40 });
    fc.assert(
      fc.property(hostile, hostile, (title, location) => {
        const events: CalendarEvent[] = [
          { id: 'e', title, occurrences: [{ id: 'o', start: '2026-06-01', allDay: true, location }] },
        ];
        const ics = generateIcs(events, cfg);
        // Exactly one VEVENT and one VCALENDAR regardless of payload.
        expect(ics.match(/BEGIN:VEVENT/g) ?? []).toHaveLength(1);
        expect(ics.match(/END:VEVENT/g) ?? []).toHaveLength(1);
        expect(ics.match(/BEGIN:VCALENDAR/g) ?? []).toHaveLength(1);
        // No unescaped raw newline can introduce a SUMMARY/DTSTART forgery line.
        const summaryLines = ics.split('\r\n').filter((l) => l.startsWith('SUMMARY:'));
        expect(summaryLines).toHaveLength(1);
      }),
      { numRuns: 500 },
    );
  });
});
