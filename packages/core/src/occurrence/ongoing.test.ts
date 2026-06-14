import { describe, it, expect } from 'vitest';
import type { CalendarConfig, CalendarEvent } from '@calendar-module/contract';
import { isEventOngoing, isOccurrenceOngoing, occurrenceSpanExceeds14d } from './ongoing.js';

const cfg: CalendarConfig = { displayTimeZone: 'America/New_York' };

describe('ongoing predicate — span > 14 days strict, per-occurrence (ES §5, S1-2)', () => {
  it('exactly 14 covered days is NOT ongoing (strict boundary)', () => {
    // 2026-01-01 .. DTEND 2026-01-15 (exclusive) = Jan 1..14 = 14 days.
    expect(occurrenceSpanExceeds14d({ id: 'o', start: '2026-01-01', end: '2026-01-15', allDay: true }, cfg)).toBe(false);
  });

  it('15 covered days IS ongoing', () => {
    expect(occurrenceSpanExceeds14d({ id: 'o', start: '2026-01-01', end: '2026-01-16', allDay: true }, cfg)).toBe(true);
  });

  it('a 20-day occurrence is ongoing', () => {
    expect(occurrenceSpanExceeds14d({ id: 'o', start: '2026-01-01', end: '2026-01-21', allDay: true }, cfg)).toBe(true);
  });

  it('timed: exactly 14.0 days is not ongoing; just over is', () => {
    expect(
      occurrenceSpanExceeds14d({ id: 'o', start: '2026-01-01T00:00:00Z', end: '2026-01-15T00:00:00Z', allDay: false }, cfg),
    ).toBe(false);
    expect(
      occurrenceSpanExceeds14d({ id: 'o', start: '2026-01-01T00:00:00Z', end: '2026-01-15T00:01:00Z', allDay: false }, cfg),
    ).toBe(true);
  });

  it('is per-occurrence, not per-series: only the long instance flags', () => {
    const event: CalendarEvent = {
      id: 'e',
      title: 'Series',
      occurrences: [
        { id: 'short', start: '2026-03-01', allDay: true },
        { id: 'long', start: '2026-04-01', end: '2026-04-25', allDay: true },
      ],
    };
    expect(isOccurrenceOngoing(event, event.occurrences[0]!, cfg)).toBe(false);
    expect(isOccurrenceOngoing(event, event.occurrences[1]!, cfg)).toBe(true);
    expect(isEventOngoing(event, cfg)).toBe(true);
  });

  it('explicit ongoing override forces all occurrences', () => {
    const event: CalendarEvent = {
      id: 'e',
      title: 'Pinned',
      ongoing: true,
      occurrences: [{ id: 'a', start: '2026-03-01', allDay: true }],
    };
    expect(isOccurrenceOngoing(event, event.occurrences[0]!, cfg)).toBe(true);
  });
});
