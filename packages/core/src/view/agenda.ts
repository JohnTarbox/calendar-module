import type { CalendarConfig, CalendarEvent, Occurrence } from '@jonnyboats/calendar-contract';
import { DateTime } from 'luxon';
import { compareDay, type DayKey } from '../time/day.js';
import { bucketDay, parseInstant } from '../time/instant.js';
import { resolveSpan, type ResolvedSpan } from '../time/span.js';
import { isOccurrenceOngoing } from '../occurrence/ongoing.js';

/**
 * Schedule / Agenda engine (AVS §2). The headless half of the mobile-default view: it flattens a
 * fetched window of events into occurrences, classifies them, day-groups them in
 * `displayTimeZone`, and paginates them by a composite keyset cursor. NO React, DOM, or fetching
 * lives here — the skin renders these structures and the Worker mirrors {@link pageForward}'s
 * cursor compare as a SQL `WHERE (start, id) > (?, ?)` query.
 *
 * Three load-bearing rules from the spec + adversarial review live here:
 *
 * - **Keyset cursor `(startMs, occurrenceId)` (§2.3, review S1-3).** Paginate by event *count*,
 *   not a day-window. `occurrenceId` is the unique tiebreaker (contract guarantee), so the order
 *   is total and stable → a fat-date boundary never dups or drops an occurrence.
 * - **Pinned "Happening now / Ongoing" (§2.1a, review S1-1).** A multi-day/ongoing occurrence
 *   that *started before* the forward window but still intersects it would otherwise vanish (its
 *   only anchor day is past) — or, if hoisted inline, would corrupt the cursor. So it is
 *   partitioned OUT of the keyset stream into a separate pinned list. The stream then carries
 *   only occurrences whose **start is in the window**, keeping the cursor monotonic.
 * - **One TZ rule (§1.3).** Timed occurrences bucket/sort in `displayTimeZone`; all-day floats on
 *   its literal date. Sorting by the raw instant (epoch ms) is identical to sorting by
 *   (dtz-day, time-of-day) for a single fixed zone, so the cursor and the day-grouping agree.
 */

/** A keyset position. `startMs` is the occurrence's start as epoch ms (all-day → local midnight). */
export interface AgendaCursor {
  readonly startMs: number;
  readonly occurrenceId: string;
}

/** One occurrence resolved for the agenda list. Carries enough for the skin to render a row. */
export interface AgendaItem {
  readonly eventId: string;
  readonly occurrenceId: string;
  readonly event: CalendarEvent;
  readonly occurrence: Occurrence;
  readonly span: ResolvedSpan;
  /** The `displayTimeZone` day this row groups under (literal date for all-day). */
  readonly groupDay: DayKey;
  readonly allDay: boolean;
  readonly sortStartMs: number;
  readonly cursor: AgendaCursor;
}

/** A day-bucket of rows: all-day first, then timed ascending by start (mirrors Month, §2.1). */
export interface AgendaDayGroup {
  readonly day: DayKey;
  readonly items: AgendaItem[];
}

/** The full classified agenda for a fetched window, before pagination is applied. */
export interface AgendaModel {
  /** The `displayTimeZone` day of "now" — the forward window's lower bound. */
  readonly todayKey: DayKey;
  /** Multi-day/ongoing rows that started before the window but still intersect it (§2.1a). */
  readonly pinned: AgendaItem[];
  /** In-window stream (start ≥ today), ascending by cursor — the keyset-paginated list (§2.3). */
  readonly stream: AgendaItem[];
  /** Past rows (start < today), descending by cursor — the `includePast` "Load earlier" source. */
  readonly past: AgendaItem[];
}

/** One page of the keyset list. `hasMore === false` ⇒ render the sentinel and stop paging. */
export interface AgendaPage {
  readonly items: AgendaItem[];
  readonly nextCursor: AgendaCursor | null;
  readonly hasMore: boolean;
}

/** Total order over keyset cursors: by start, then by the unique occurrence id (§2.3). */
export function compareCursor(a: AgendaCursor, b: AgendaCursor): number {
  if (a.startMs !== b.startMs) return a.startMs - b.startMs;
  if (a.occurrenceId < b.occurrenceId) return -1;
  if (a.occurrenceId > b.occurrenceId) return 1;
  return 0;
}

function localMidnightMs(day: DayKey, dtz: string): number {
  const dt = DateTime.fromISO(day, { zone: dtz }).startOf('day');
  return dt.isValid ? dt.toMillis() : Date.parse(`${day}T00:00:00Z`);
}

function sortStartMsOf(occ: Occurrence, span: ResolvedSpan, dtz: string): number {
  if (occ.allDay) return localMidnightMs(span.startDay, dtz);
  const dt = parseInstant(occ.start);
  return dt.isValid ? dt.toMillis() : localMidnightMs(span.startDay, dtz);
}

function toItem(event: CalendarEvent, occ: Occurrence, cfg: CalendarConfig): AgendaItem {
  const span = resolveSpan(occ, cfg, event.id);
  const sortStartMs = sortStartMsOf(occ, span, cfg.displayTimeZone);
  return {
    eventId: event.id,
    occurrenceId: occ.id,
    event,
    occurrence: occ,
    span,
    groupDay: span.startDay,
    allDay: occ.allDay,
    sortStartMs,
    cursor: { startMs: sortStartMs, occurrenceId: occ.id },
  };
}

/**
 * Flatten + classify a fetched window of events into the agenda model (§2.1/§2.1a/§2.3).
 *
 * Classification per occurrence, relative to `todayKey` = the `displayTimeZone` day of `now`:
 * - **pinned** — multi-day (>1 day) or ongoing (>14d), started before today, still ends ≥ today.
 * - **stream** — start ≥ today (appears inline under its start day, §1.5). Multi-day/ongoing whose
 *   start is in the window stays here, NOT pinned (§2.1a).
 * - **past** — start < today and not pinned (single-day past, or a fully-past multi-day event).
 */
export function buildAgenda(
  events: readonly CalendarEvent[],
  cfg: CalendarConfig,
  now: string,
): AgendaModel {
  const todayKey = bucketDay(now, cfg.displayTimeZone);
  const pinned: AgendaItem[] = [];
  const stream: AgendaItem[] = [];
  const past: AgendaItem[] = [];

  for (const event of events) {
    for (const occ of event.occurrences) {
      const item = toItem(event, occ, cfg);
      const startsBeforeToday = compareDay(item.span.startDay, todayKey) < 0;

      if (!startsBeforeToday) {
        stream.push(item);
        continue;
      }

      const isMultiOrOngoing =
        item.span.spanDays > 1 || isOccurrenceOngoing(event, occ, cfg);
      const stillLive = compareDay(item.span.endDayInclusive, todayKey) >= 0;

      if (isMultiOrOngoing && stillLive) pinned.push(item);
      else past.push(item);
    }
  }

  stream.sort((a, b) => compareCursor(a.cursor, b.cursor));
  past.sort((a, b) => compareCursor(b.cursor, a.cursor)); // descending: nearest-past first
  // Pinned: end-soonest-first so the row about to disappear sits at the top (§2.1a).
  pinned.sort((a, b) => {
    const byEnd = compareDay(a.span.endDayInclusive, b.span.endDayInclusive);
    if (byEnd !== 0) return byEnd;
    return compareCursor(a.cursor, b.cursor);
  });

  return { todayKey, pinned, stream, past };
}

function clampPageSize(pageSize: number): number {
  return Math.max(1, Math.floor(pageSize));
}

/**
 * Forward keyset page (§2.3). Returns the first `pageSize` items with cursor strictly greater than
 * `cursor` (or from the head when `cursor` is null). `hasMore === false` ⇒ this is the tail; the
 * skin renders "No more upcoming events" and stops. Iterating with `nextCursor` visits every
 * stream item exactly once, in order (property-tested, §8).
 */
export function pageForward(
  stream: readonly AgendaItem[],
  cursor: AgendaCursor | null,
  pageSize: number,
): AgendaPage {
  const ps = clampPageSize(pageSize);
  const after = cursor == null ? stream : stream.filter((i) => compareCursor(i.cursor, cursor) > 0);
  const items = after.slice(0, ps);
  const hasMore = after.length > ps;
  return { items, nextCursor: hasMore && items.length > 0 ? items[items.length - 1]!.cursor : null, hasMore };
}

/**
 * Backward keyset page for `includePast` (§2.3) — the "Load earlier events" button. `past` is
 * descending, so this returns the `pageSize` items immediately *earlier* than `cursor`. Disjoint
 * from the forward stream by construction (past start < today ≤ stream start).
 */
export function pageEarlier(
  past: readonly AgendaItem[],
  cursor: AgendaCursor | null,
  pageSize: number,
): AgendaPage {
  const ps = clampPageSize(pageSize);
  const before = cursor == null ? past : past.filter((i) => compareCursor(i.cursor, cursor) < 0);
  const items = before.slice(0, ps);
  const hasMore = before.length > ps;
  return { items, nextCursor: hasMore && items.length > 0 ? items[items.length - 1]!.cursor : null, hasMore };
}

/**
 * Group a (sorted) item list into day buckets in `displayTimeZone` (§2.1). Empty days produce no
 * group. Within a day: all-day first, then timed ascending by start, then stable by id.
 */
export function groupByDay(items: readonly AgendaItem[]): AgendaDayGroup[] {
  const byDay = new Map<DayKey, AgendaItem[]>();
  for (const item of items) {
    const bucket = byDay.get(item.groupDay);
    if (bucket) bucket.push(item);
    else byDay.set(item.groupDay, [item]);
  }
  const groups: AgendaDayGroup[] = [];
  for (const [day, dayItems] of byDay) {
    dayItems.sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1; // all-day first
      if (a.sortStartMs !== b.sortStartMs) return a.sortStartMs - b.sortStartMs;
      return a.occurrenceId < b.occurrenceId ? -1 : a.occurrenceId > b.occurrenceId ? 1 : 0;
    });
    groups.push({ day, items: dayItems });
  }
  groups.sort((a, b) => compareDay(a.day, b.day));
  return groups;
}

/** Whether the loaded groups contain `day` — drives the "Today — no events" anchor (§2.1, S2-6). */
export function hasEventsOn(groups: readonly AgendaDayGroup[], day: DayKey): boolean {
  return groups.some((g) => g.day === day && g.items.length > 0);
}
