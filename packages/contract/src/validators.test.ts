import { describe, it, expect } from 'vitest';
import { validateEvent, validateWindow, validateConfig } from './validators.js';
import type { CalendarEvent } from './types.js';

function ev(overrides: Partial<CalendarEvent> = {}): unknown {
  return {
    id: 'e1',
    title: 'Spring Craft Fair',
    occurrences: [
      { id: 'e1-o1', start: '2026-05-02', allDay: true },
    ],
    ...overrides,
  };
}

describe('validateEvent — per-event shape + URL allowlist (ES §9b)', () => {
  it('accepts a minimal valid event', () => {
    const r = validateEvent(ev());
    expect(r.success).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('rejects a missing title', () => {
    const r = validateEvent(ev({ title: undefined as unknown as string }));
    expect(r.success).toBe(false);
    expect(r.errors.join(' ')).toMatch(/title/);
  });

  it('rejects an event with zero occurrences', () => {
    const r = validateEvent({ id: 'e', title: 't', occurrences: [] });
    expect(r.success).toBe(false);
  });

  it('rejects a javascript: url via the allowlist', () => {
    const r = validateEvent(ev({ url: 'javascript:alert(1)' }));
    expect(r.success).toBe(false);
    expect(r.errors.join(' ')).toMatch(/protocol not allowed/);
  });

  it('rejects a disallowed occurrence mapUrl', () => {
    const r = validateEvent(
      ev({ occurrences: [{ id: 'o', start: '2026-05-02', allDay: true, mapUrl: 'data:x' }] as never }),
    );
    expect(r.success).toBe(false);
  });

  it('warns (not errors) on unknown keys — forward-compat (ES §5)', () => {
    const r = validateEvent(ev({ futureField: 'x' } as never));
    expect(r.success).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/futureField/);
  });

  it('accepts a timed occurrence with offset + timezone', () => {
    const r = validateEvent(
      ev({
        occurrences: [
          { id: 'o', start: '2026-07-04T20:00:00-05:00', end: '2026-07-04T22:00:00-05:00', allDay: false, timezone: 'America/Chicago' },
        ] as never,
      }),
    );
    expect(r.success).toBe(true);
  });

  it('rejects a timed occurrence whose start lacks an offset', () => {
    const r = validateEvent(
      ev({ occurrences: [{ id: 'o', start: '2026-07-04T20:00:00', allDay: false }] as never }),
    );
    expect(r.success).toBe(false);
  });

  it('rejects an invalid IANA occurrence timezone', () => {
    const r = validateEvent(
      ev({ occurrences: [{ id: 'o', start: '2026-07-04T20:00:00-05:00', allDay: false, timezone: 'Mars/Phobos' }] as never }),
    );
    expect(r.success).toBe(false);
  });
});

describe('validateWindow — array-level invariants (S1-6, S2-6)', () => {
  it('accepts a sorted, unique window', () => {
    const r = validateWindow([
      ev({ id: 'a', occurrences: [{ id: 'a1', start: '2026-05-01', allDay: true }] as never }),
      ev({ id: 'b', occurrences: [{ id: 'b1', start: '2026-05-02', allDay: true }] as never }),
    ]);
    expect(r.success).toBe(true);
  });

  it('flags duplicate event ids within the window', () => {
    const r = validateWindow([ev({ id: 'dup' }), ev({ id: 'dup', occurrences: [{ id: 'x', start: '2026-05-03', allDay: true }] as never })]);
    expect(r.success).toBe(false);
    expect(r.errors.join(' ')).toMatch(/duplicate event id/);
  });

  it('flags duplicate occurrence ids across the window', () => {
    const r = validateWindow([
      ev({ id: 'a', occurrences: [{ id: 'same', start: '2026-05-01', allDay: true }] as never }),
      ev({ id: 'b', occurrences: [{ id: 'same', start: '2026-05-02', allDay: true }] as never }),
    ]);
    expect(r.success).toBe(false);
    expect(r.errors.join(' ')).toMatch(/duplicate occurrence id/);
  });

  it('flags occurrences not sorted ascending by start', () => {
    const r = validateWindow([
      ev({
        id: 'a',
        occurrences: [
          { id: 'a2', start: '2026-05-10', allDay: true },
          { id: 'a1', start: '2026-05-01', allDay: true },
        ] as never,
      }),
    ]);
    expect(r.success).toBe(false);
    expect(r.errors.join(' ')).toMatch(/not sorted ascending/);
  });

  it('rejects a non-array window input', () => {
    expect(validateWindow({ not: 'an array' }).success).toBe(false);
  });
});

describe('validateConfig — displayTimeZone IANA gate (S2-9)', () => {
  it('accepts a valid zone', () => {
    expect(validateConfig({ displayTimeZone: 'America/New_York' }).success).toBe(true);
  });

  it('rejects an invalid zone (never a silent UTC fallback)', () => {
    const r = validateConfig({ displayTimeZone: 'Not/AZone' });
    expect(r.success).toBe(false);
    expect(r.errors.join(' ')).toMatch(/IANA/);
  });

  it('rejects a missing displayTimeZone', () => {
    expect(validateConfig({}).success).toBe(false);
  });
});
