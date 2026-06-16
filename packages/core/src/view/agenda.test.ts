import { describe, it, expect } from 'vitest';
import type { CalendarConfig, CalendarEvent } from '@jonnyboats/calendar-contract';
import {
  buildAgenda,
  pageForward,
  pageEarlier,
  groupByDay,
  hasEventsOn,
  compareCursor,
} from './agenda.js';

const cfg: CalendarConfig = { displayTimeZone: 'America/New_York' };
// 2026-06-16T12:00 in New York (EDT, -04:00). todayKey = 2026-06-16.
const NOW = '2026-06-16T12:00:00-04:00';

function timed(eventId: string, occId: string, start: string, end?: string, category?: string): CalendarEvent {
  return { id: eventId, title: eventId, category, occurrences: [{ id: occId, start, end, allDay: false }] } as CalendarEvent;
}
function allDay(eventId: string, occId: string, start: string, end?: string): CalendarEvent {
  return { id: eventId, title: eventId, occurrences: [{ id: occId, start, end, allDay: true }] } as CalendarEvent;
}

describe('buildAgenda — classification (AVS §2.1/§2.1a)', () => {
  it('[AC §2.1a] a multi-day event spanning [yesterday, tomorrow] is pinned, not in the stream', () => {
    const e = allDay('fair', 'fair#1', '2026-06-15', '2026-06-18'); // Jun 15–17 inclusive, today=16
    const m = buildAgenda([e], cfg, NOW);
    expect(m.pinned.map((i) => i.occurrenceId)).toEqual(['fair#1']);
    expect(m.stream).toHaveLength(0);
    // the keyset stream contains no occurrence whose start precedes the window
    expect(m.stream.every((i) => i.span.startDay >= m.todayKey)).toBe(true);
  });

  it('[AC §2.1a] an ongoing (>14d) event started weeks ago is pinned', () => {
    const e = allDay('expo', 'expo#1', '2026-06-01', '2026-07-15'); // ~44 days, started before today
    const m = buildAgenda([e], cfg, NOW);
    expect(m.pinned.map((i) => i.occurrenceId)).toEqual(['expo#1']);
    expect(m.stream).toHaveLength(0);
  });

  it('a multi-day event whose START is in the window stays inline in the stream (not pinned)', () => {
    const e = allDay('fest', 'fest#1', '2026-06-18', '2026-06-21'); // starts after today
    const m = buildAgenda([e], cfg, NOW);
    expect(m.pinned).toHaveLength(0);
    expect(m.stream.map((i) => i.occurrenceId)).toEqual(['fest#1']);
  });

  it('a single-day past event goes to past (Load-earlier source), not pinned or stream', () => {
    const e = timed('old', 'old#1', '2026-06-10T09:00:00-04:00');
    const m = buildAgenda([e], cfg, NOW);
    expect(m.pinned).toHaveLength(0);
    expect(m.stream).toHaveLength(0);
    expect(m.past.map((i) => i.occurrenceId)).toEqual(['old#1']);
  });

  it('a fully-past multi-day event (ended before today) goes to past, not pinned', () => {
    const e = allDay('done', 'done#1', '2026-06-01', '2026-06-05'); // ended Jun 4, before today
    const m = buildAgenda([e], cfg, NOW);
    expect(m.pinned).toHaveLength(0);
    expect(m.past.map((i) => i.occurrenceId)).toEqual(['done#1']);
  });

  it('[AC/property §1.5] a 20-day occurrence is exactly one agenda row', () => {
    const e = allDay('long', 'long#1', '2026-06-10', '2026-07-01'); // 21 days, ongoing, live
    const m = buildAgenda([e], cfg, NOW);
    const total = m.pinned.length + m.stream.length + m.past.length;
    expect(total).toBe(1);
    expect(m.pinned).toHaveLength(1);
  });

  it('pinned rows are sorted end-soonest-first (§2.1a)', () => {
    const soon = allDay('soon', 'soon#1', '2026-06-14', '2026-06-18'); // ends Jun 17
    const later = allDay('later', 'later#1', '2026-06-10', '2026-06-25'); // ends Jun 24
    const m = buildAgenda([later, soon], cfg, NOW);
    expect(m.pinned.map((i) => i.occurrenceId)).toEqual(['soon#1', 'later#1']);
  });
});

describe('buildAgenda — multi-occurrence events (a weekly market is many rows)', () => {
  it('each occurrence of a recurring event is its own row on its real day (§1.5 rationale)', () => {
    const market: CalendarEvent = {
      id: 'market',
      title: 'Market',
      occurrences: [
        { id: 'm#1', start: '2026-06-13', allDay: true }, // past
        { id: 'm#2', start: '2026-06-20', allDay: true }, // future
        { id: 'm#3', start: '2026-06-27', allDay: true }, // future
      ],
    } as CalendarEvent;
    const m = buildAgenda([market], cfg, NOW);
    expect(m.stream.map((i) => i.occurrenceId)).toEqual(['m#2', 'm#3']);
    expect(m.past.map((i) => i.occurrenceId)).toEqual(['m#1']);
    expect(m.pinned).toHaveLength(0);
  });
});

describe('groupByDay (§2.1)', () => {
  it('skips empty dates, orders all-day before timed within a day', () => {
    const items = buildAgenda(
      [
        timed('t', 't#1', '2026-06-20T15:00:00-04:00'),
        timed('t2', 't2#1', '2026-06-20T09:00:00-04:00'),
        allDay('a', 'a#1', '2026-06-20'),
        timed('next', 'next#1', '2026-06-22T10:00:00-04:00'),
      ],
      cfg,
      NOW,
    ).stream;
    const groups = groupByDay(items);
    expect(groups.map((g) => g.day)).toEqual(['2026-06-20', '2026-06-22']); // no empty 06-21
    expect(groups[0]!.items.map((i) => i.occurrenceId)).toEqual(['a#1', 't2#1', 't#1']);
  });

  it('[AC §1.3] a near-midnight timed occurrence groups under its displayTimeZone day', () => {
    // 2026-06-21T03:30Z = 2026-06-20T23:30 EDT → must group under 06-20, not 06-21.
    const e = timed('late', 'late#1', '2026-06-21T03:30:00Z');
    const groups = groupByDay(buildAgenda([e], cfg, NOW).stream);
    expect(groups[0]!.day).toBe('2026-06-20');
  });

  it('hasEventsOn drives the Today-anchor decision (S2-6)', () => {
    const withToday = groupByDay(buildAgenda([allDay('x', 'x#1', '2026-06-16')], cfg, NOW).stream);
    const withoutToday = groupByDay(buildAgenda([allDay('y', 'y#1', '2026-06-19')], cfg, NOW).stream);
    expect(hasEventsOn(withToday, '2026-06-16')).toBe(true);
    expect(hasEventsOn(withoutToday, '2026-06-16')).toBe(false);
  });
});

describe('pagination (§2.3)', () => {
  function fatStream(): CalendarEvent[] {
    // 5 timed events all on the SAME future day — the fat-date boundary case.
    return Array.from({ length: 5 }, (_, i) =>
      timed(`f${i}`, `f#${i}`, `2026-06-20T1${i}:00:00-04:00`),
    );
  }

  it('[AC] a fat date paginates with no dup and no drop across a page boundary', () => {
    const stream = buildAgenda(fatStream(), cfg, NOW).stream;
    const seen: string[] = [];
    let cursor = null as ReturnType<typeof pageForward>['nextCursor'];
    let page = pageForward(stream, cursor, 2);
    for (;;) {
      seen.push(...page.items.map((i) => i.occurrenceId));
      if (!page.hasMore) break;
      cursor = page.nextCursor;
      page = pageForward(stream, cursor, 2);
    }
    expect(seen).toEqual(['f#0', 'f#1', 'f#2', 'f#3', 'f#4']);
    expect(new Set(seen).size).toBe(seen.length); // no dup
  });

  it('[AC] empty tail → hasMore false (sentinel)', () => {
    const stream = buildAgenda(fatStream(), cfg, NOW).stream;
    const last = pageForward(stream, null, 10);
    expect(last.hasMore).toBe(false);
    expect(last.nextCursor).toBeNull();
  });

  it('[AC] the Load-earlier (past) page never overlaps the forward window', () => {
    const events = [
      ...fatStream(),
      timed('p0', 'p#0', '2026-06-10T09:00:00-04:00'),
      timed('p1', 'p#1', '2026-06-05T09:00:00-04:00'),
    ];
    const m = buildAgenda(events, cfg, NOW);
    const earlier = pageEarlier(m.past, null, 10);
    const forwardIds = new Set(m.stream.map((i) => i.occurrenceId));
    expect(earlier.items.every((i) => !forwardIds.has(i.occurrenceId))).toBe(true);
    // descending: nearest past first
    expect(earlier.items.map((i) => i.occurrenceId)).toEqual(['p#0', 'p#1']);
  });
});

describe('compareCursor — total order', () => {
  it('orders by start then by unique occurrenceId', () => {
    expect(compareCursor({ startMs: 1, occurrenceId: 'a' }, { startMs: 2, occurrenceId: 'a' })).toBeLessThan(0);
    expect(compareCursor({ startMs: 5, occurrenceId: 'a' }, { startMs: 5, occurrenceId: 'b' })).toBeLessThan(0);
    expect(compareCursor({ startMs: 5, occurrenceId: 'a' }, { startMs: 5, occurrenceId: 'a' })).toBe(0);
  });
});
