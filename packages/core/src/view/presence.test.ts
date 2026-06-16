import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { CalendarConfig, CalendarEvent } from '@jonnyboats/calendar-contract';
import { buildPresence, presentDays, presenceCategories } from './presence.js';

const cfg: CalendarConfig = { displayTimeZone: 'America/New_York' };

function allDay(id: string, cat: string | undefined, start: string, end?: string): CalendarEvent {
  return { id, title: id, category: cat, occurrences: [{ id: `${id}#1`, start, end, allDay: true }] } as CalendarEvent;
}

describe('buildPresence (AVS §3.2)', () => {
  it('dots a single day with its category', () => {
    const map = buildPresence([allDay('a', 'craft-fair', '2026-03-14')], cfg, 2026);
    expect(map['2026-03-14']).toEqual(['craft-fair']);
    expect(Object.keys(map)).toEqual(['2026-03-14']);
  });

  it('[AC §1.5] a multi-day event dots EVERY day it spans (DTEND exclusive)', () => {
    const map = buildPresence([allDay('fair', 'fair', '2026-06-01', '2026-06-04')], cfg, 2026);
    expect(Object.keys(map).sort()).toEqual(['2026-06-01', '2026-06-02', '2026-06-03']); // Jun 1–3
  });

  it('[AC §1.5] a 20-day occurrence dots each of its days', () => {
    const map = buildPresence([allDay('long', 'x', '2026-06-10', '2026-07-01')], cfg, 2026);
    expect(Object.keys(map).length).toBe(21);
  });

  it('clamps a span that straddles the year boundary', () => {
    const map = buildPresence([allDay('ny', 'x', '2025-12-30', '2026-01-03')], cfg, 2026);
    // only the in-2026 days: Jan 1, Jan 2 (DTEND 2026-01-03 exclusive → through Jan 2)
    expect(Object.keys(map).sort()).toEqual(['2026-01-01', '2026-01-02']);
  });

  it('merges multiple categories on the same day, sorted + deduped', () => {
    const map = buildPresence(
      [allDay('a', 'music', '2026-05-01'), allDay('b', 'craft', '2026-05-01'), allDay('c', 'music', '2026-05-01')],
      cfg,
      2026,
    );
    expect(map['2026-05-01']).toEqual(['craft', 'music']);
  });

  it('carries NO event payloads — only dates + category labels (guards the cheap contract)', () => {
    const map = buildPresence([allDay('a', 'craft-fair', '2026-03-14')], cfg, 2026);
    const json = JSON.stringify(map);
    expect(json).not.toMatch(/title|occurrences|location|url/);
  });
});

describe('presentDays — client-side legend filter (RS §6 / review S1-2)', () => {
  const map = buildPresence(
    [
      allDay('craftOnly', 'craft-fair', '2026-03-14'),
      allDay('music1', 'music', '2026-03-20'),
      allDay('craft2', 'craft-fair', '2026-03-20'), // 03-20 has BOTH music + craft-fair
    ],
    cfg,
    2026,
  );

  it('[AC §3.4] all days dotted when nothing is hidden', () => {
    expect(presentDays(map)).toEqual(new Set(['2026-03-14', '2026-03-20']));
  });

  it('[AC §3.4] hiding a category removes days whose ONLY category was that one', () => {
    const dotted = presentDays(map, new Set(['craft-fair']));
    expect(dotted.has('2026-03-14')).toBe(false); // craft-only day loses its dot
    expect(dotted.has('2026-03-20')).toBe(true); // still has music
  });

  it('an uncategorized event is always-visible (never filtered off)', () => {
    const m = buildPresence([allDay('u', undefined, '2026-04-01')], cfg, 2026);
    expect(presentDays(m, new Set(['anything']))).toEqual(new Set(['2026-04-01']));
  });
});

describe('presenceCategories', () => {
  it('lists distinct real categories (omits the uncategorized token)', () => {
    const map = buildPresence(
      [allDay('a', 'music', '2026-01-01'), allDay('b', undefined, '2026-01-02'), allDay('c', 'craft', '2026-01-03')],
      cfg,
      2026,
    );
    expect(presenceCategories(map)).toEqual(['craft', 'music']);
  });
});

describe('presence — property (AVS §3.4/§8)', () => {
  const eventArb = fc.record({
    id: fc.uuid(),
    cat: fc.option(fc.constantFrom('craft', 'music', 'food'), { nil: undefined }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }),
    len: fc.integer({ min: 0, max: 20 }),
  });

  it('dotted(∅) === every key in the map, and dotted ⊆ keys for any hidden set', () => {
    fc.assert(
      fc.property(fc.array(eventArb, { maxLength: 30 }), fc.array(fc.constantFrom('craft', 'music', 'food')), (evts, hiddenArr) => {
        const events = evts.map((e): CalendarEvent => {
          const mm = String(e.month).padStart(2, '0');
          const dd = String(e.day).padStart(2, '0');
          const start = `2026-${mm}-${dd}`;
          const endDate = new Date(Date.UTC(2026, e.month - 1, e.day + e.len + 1));
          const end = endDate.toISOString().slice(0, 10);
          return { id: e.id, title: e.id, category: e.cat, occurrences: [{ id: `${e.id}#1`, start, end, allDay: true }] } as CalendarEvent;
        });
        const map = buildPresence(events, cfg, 2026);
        const keys = new Set(Object.keys(map));
        expect(presentDays(map)).toEqual(keys);
        const dotted = presentDays(map, new Set(hiddenArr));
        for (const d of dotted) expect(keys.has(d)).toBe(true);
      }),
    );
  });
});
