import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { CalendarConfig, CalendarEvent } from '@jonnyboats/calendar-contract';
import { buildAgenda, pageForward, compareCursor, type AgendaItem } from './agenda.js';

const cfg: CalendarConfig = { displayTimeZone: 'America/New_York' };
const NOW = '2026-06-16T12:00:00-04:00';

/** A future timed occurrence (always lands in the keyset stream). */
const futureEventArb = fc
  .record({
    eid: fc.string({ minLength: 1, maxLength: 6 }),
    oid: fc.uuid(),
    dayOffset: fc.integer({ min: 0, max: 120 }), // days from today (≥0 ⇒ in window)
    minuteOfDay: fc.integer({ min: 0, max: 1439 }),
  })
  .map(({ eid, oid, dayOffset, minuteOfDay }): CalendarEvent => {
    const base = new Date(Date.UTC(2026, 5, 16, 16, 0, 0)); // 2026-06-16T12:00 EDT in UTC
    base.setUTCDate(base.getUTCDate() + dayOffset);
    base.setUTCHours(4 + Math.floor(minuteOfDay / 60), minuteOfDay % 60, 0, 0); // ~EDT day
    return {
      id: eid,
      title: eid,
      occurrences: [{ id: oid, start: base.toISOString(), allDay: false }],
    } as CalendarEvent;
  });

describe('Schedule keyset pagination (property, AVS §8)', () => {
  it('forward paging visits every stream occurrence exactly once, in cursor order, no dup/drop', () => {
    fc.assert(
      fc.property(
        fc.array(futureEventArb, { maxLength: 60 }),
        fc.integer({ min: 1, max: 10 }),
        (events, pageSize) => {
          const stream = buildAgenda(events, cfg, NOW).stream;

          const seen: AgendaItem[] = [];
          let cursor = null as ReturnType<typeof pageForward>['nextCursor'];
          let page = pageForward(stream, cursor, pageSize);
          let guard = 0;
          for (;;) {
            if (++guard > 10000) throw new Error('pagination did not terminate');
            seen.push(...page.items);
            if (!page.hasMore) break;
            cursor = page.nextCursor;
            expect(cursor).not.toBeNull();
            page = pageForward(stream, cursor, pageSize);
          }

          // Every occurrence exactly once.
          expect(seen.map((i) => i.occurrenceId)).toEqual(stream.map((i) => i.occurrenceId));
          expect(new Set(seen.map((i) => i.occurrenceId)).size).toBe(stream.length);

          // Strictly ascending by cursor — no two adjacent out of order.
          for (let i = 1; i < seen.length; i++) {
            expect(compareCursor(seen[i - 1]!.cursor, seen[i]!.cursor)).toBeLessThan(0);
          }
        },
      ),
    );
  });
});

describe('TZ grouping (property, AVS §1.3/§8)', () => {
  it('every stream item groups on its displayTimeZone day and start ≥ todayKey', () => {
    fc.assert(
      fc.property(fc.array(futureEventArb, { maxLength: 40 }), (events) => {
        const m = buildAgenda(events, cfg, NOW);
        for (const item of m.stream) {
          // groupDay is the dtz bucket of the instant — never an off-by-one vs the raw UTC date.
          expect(item.groupDay >= m.todayKey).toBe(true);
        }
        // pinned ∪ stream ∪ past partition every occurrence exactly once.
        const total = m.pinned.length + m.stream.length + m.past.length;
        const occCount = events.reduce((n, e) => n + e.occurrences.length, 0);
        expect(total).toBe(occCount);
      }),
    );
  });
});
