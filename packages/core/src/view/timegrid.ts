import type { CalendarConfig, CalendarEvent, Occurrence } from '@jonnyboats/calendar-contract';
import { addDays, compareDay, diffDays, weekdayOf, type DayKey } from '../time/day.js';
import { bucketDay, parseInstant, wallClockLabel } from '../time/instant.js';
import { resolveSpan, type ResolvedSpan } from '../time/span.js';
import { dayLengthMinutes, minutesSinceMidnight } from '../time/grid.js';
import { isOccurrenceOngoing } from '../occurrence/ongoing.js';
import { compareBarSpans } from '../layout/sort.js';
import type { TimedSegment } from '../layout/collision.js';

/**
 * Week/Day/Custom derivations (AVS §4): which timed segments land in a day's hour grid, what goes
 * in the all-day strip, the ongoing band above it, and the visible-range helpers. All TZ math is
 * in `displayTimeZone`. The §1.5 cross-view rule is enforced here:
 *
 * - **single-day timed** → an hour-grid segment.
 * - **cross-midnight timed (≤24h)** → a clamped segment in EACH day it touches (§4.3).
 * - **multi-day timed (>24h)** → an all-day-strip ribbon, NOT a tall block (§4.3 / §1.5).
 * - **all-day (≤14d)** → a strip bar/ribbon.
 * - **ongoing (>14d)** → the band above the grid, excluded from strip packing (§1.5).
 */

const DEFAULT_DURATION_MINUTES = 60;
const DAY_MINUTES_24H = 1440;

function endInstantOf(occ: Occurrence, cfg: CalendarConfig, start: ReturnType<typeof parseInstant>) {
  const durationMin = cfg.defaultDurationMinutes ?? DEFAULT_DURATION_MINUTES;
  let end = occ.end ? parseInstant(occ.end) : start.plus({ minutes: durationMin });
  if (!end.isValid || end < start) end = start;
  return end;
}

/**
 * The single-day timed segments to lay out in `day`'s hour grid (§4.2/§4.3). Excludes all-day,
 * ongoing (>14d band), and multi-day timed (>24h strip). A cross-midnight occurrence contributes a
 * clamped segment to each day it touches.
 */
export function dayColumnSegments(
  events: readonly CalendarEvent[],
  day: DayKey,
  cfg: CalendarConfig,
): TimedSegment[] {
  const dtz = cfg.displayTimeZone;
  const out: TimedSegment[] = [];

  for (const event of events) {
    for (const occ of event.occurrences) {
      if (occ.allDay) continue;
      if (isOccurrenceOngoing(event, occ, cfg)) continue;
      const start = parseInstant(occ.start);
      if (!start.isValid) continue;
      const end = endInstantOf(occ, cfg, start);
      const durationMin = end.diff(start, 'minutes').minutes;
      if (durationMin > DAY_MINUTES_24H) continue; // multi-day timed → strip ribbon

      const startDay = bucketDay(occ.start, dtz);
      const endIso = (occ.end ? parseInstant(occ.end) : end).toISO() ?? occ.start;
      const endDay = end.setZone(dtz).toFormat('yyyy-MM-dd');
      const timeLabel = wallClockLabel(occ.start, occ.timezone ?? dtz, cfg.locale);

      if (startDay === endDay) {
        if (startDay !== day) continue;
        out.push({
          key: `${occ.id}@${day}`,
          occurrenceId: occ.id,
          eventId: event.id,
          startMin: minutesSinceMidnight(occ.start, dtz),
          endMin: minutesSinceMidnight(endIso, dtz),
          title: event.title,
          timeLabel,
        });
      } else if (day === startDay) {
        // Head: from start to end-of-day (clamped).
        out.push({
          key: `${occ.id}@${day}`,
          occurrenceId: occ.id,
          eventId: event.id,
          startMin: minutesSinceMidnight(occ.start, dtz),
          endMin: dayLengthMinutes(day, dtz),
          title: event.title,
          timeLabel,
          continuesToNextDay: true,
        });
      } else if (day === endDay) {
        // Tail: from midnight to end (clamped).
        out.push({
          key: `${occ.id}@${day}`,
          occurrenceId: occ.id,
          eventId: event.id,
          startMin: 0,
          endMin: minutesSinceMidnight(endIso, dtz),
          title: event.title,
          timeLabel,
          continuesFromPrevDay: true,
        });
      }
    }
  }
  return out;
}

/* ── All-day strip + ongoing band (AVS §4.1) ──────────────────────────────────────────────── */

export interface StripRibbon {
  occurrenceId: string;
  eventId: string;
  title: string;
  lane: number;
  startCol: number; // index into the visible days[]
  endCol: number;
  continuesLeft: boolean; // span enters from before the visible range
  continuesRight: boolean; // span exits after the visible range
  allDay: boolean; // false for a >24h timed ribbon
  visible: boolean; // false when beyond the lane cap → counted in overflow
}

export interface StripOverflowCol {
  col: number;
  day: DayKey;
  count: number;
}

export interface OngoingBand {
  occurrenceId: string;
  eventId: string;
  title: string;
  throughDate: DayKey;
}

export interface StripLayout {
  ribbons: StripRibbon[];
  overflow: StripOverflowCol[];
  ongoing: OngoingBand[];
  laneCount: number; // visible lanes used
}

interface Eligible {
  occ: Occurrence;
  event: CalendarEvent;
  span: ResolvedSpan;
  allDay: boolean;
}

/**
 * Pack the all-day strip across the visible `days` (AVS §4.1): single-day all-day bars + multi-day
 * (≤14d) ribbons + multi-day-timed (>24h) ribbons, lane-packed left→right; ongoing (>14d) events
 * go to the band (not packed). Beyond `maxLanes`, a ribbon is hidden and counted in per-column
 * "+N more" (per-column, not row-summable — S2-4).
 */
export function packStrip(
  events: readonly CalendarEvent[],
  days: readonly DayKey[],
  cfg: CalendarConfig,
  maxLanes = Infinity,
): StripLayout {
  if (days.length === 0) return { ribbons: [], overflow: [], ongoing: [], laneCount: 0 };
  const first = days[0]!;
  const last = days[days.length - 1]!;

  const eligible: Eligible[] = [];
  const ongoing: OngoingBand[] = [];

  for (const event of events) {
    for (const occ of event.occurrences) {
      const span = resolveSpan(occ, cfg, event.id);
      // Intersect the visible range.
      if (compareDay(span.endDayInclusive, first) < 0 || compareDay(span.startDay, last) > 0) continue;

      if (isOccurrenceOngoing(event, occ, cfg)) {
        ongoing.push({
          occurrenceId: occ.id,
          eventId: event.id,
          title: event.title,
          throughDate: span.endDayInclusive,
        });
        continue;
      }
      const isMultiDayTimed = !occ.allDay && span.spanDays > 1;
      if (occ.allDay || isMultiDayTimed) {
        eligible.push({ occ, event, span, allDay: occ.allDay });
      }
      // single-day / cross-midnight timed → hour grid (dayColumnSegments), not the strip.
    }
  }

  eligible.sort((a, b) => compareBarSpans(a.span, b.span));

  const laneRanges: Array<Array<[number, number]>> = []; // laneRanges[lane] = occupied [startCol,endCol]
  const ribbons: StripRibbon[] = [];
  const overflowByCol = new Map<number, number>();

  for (const e of eligible) {
    const startCol = Math.max(0, diffDays(e.span.startDay, first));
    const endCol = Math.min(days.length - 1, diffDays(e.span.endDayInclusive, first));
    const continuesLeft = compareDay(e.span.startDay, first) < 0;
    const continuesRight = compareDay(e.span.endDayInclusive, last) > 0;

    // Lowest lane with no column overlap.
    let lane = 0;
    for (;;) {
      const ranges = laneRanges[lane];
      if (!ranges) {
        laneRanges[lane] = [[startCol, endCol]];
        break;
      }
      const clash = ranges.some(([s, en]) => startCol <= en && s <= endCol);
      if (!clash) {
        ranges.push([startCol, endCol]);
        break;
      }
      lane++;
    }

    const visible = lane < maxLanes;
    if (!visible) {
      for (let c = startCol; c <= endCol; c++) overflowByCol.set(c, (overflowByCol.get(c) ?? 0) + 1);
    }
    ribbons.push({
      occurrenceId: e.occ.id,
      eventId: e.event.id,
      title: e.event.title,
      lane,
      startCol,
      endCol,
      continuesLeft,
      continuesRight,
      allDay: e.allDay,
      visible,
    });
  }

  const overflow: StripOverflowCol[] = [...overflowByCol.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([col, count]) => ({ col, day: days[col]!, count }));
  const visibleLanes = ribbons.filter((r) => r.visible).map((r) => r.lane);
  const laneCount = visibleLanes.length ? Math.max(...visibleLanes) + 1 : 0;

  return { ribbons, overflow, ongoing, laneCount };
}

/* ── Range / navigation helpers (AVS §1.1) ────────────────────────────────────────────────── */

/** Align `anchor` back to the configured week start (for the Week view). */
export function alignWeekStart(anchor: DayKey, cfg: CalendarConfig): DayKey {
  const weekStartsOn = cfg.weekStartsOn ?? 0;
  const offset = (weekdayOf(anchor) - weekStartsOn + 7) % 7;
  return addDays(anchor, -offset);
}

/** `count` consecutive day keys starting at `start` (Week=7, Day=1, Custom=N). */
export function rangeDays(start: DayKey, count: number): DayKey[] {
  const n = Math.max(1, Math.floor(count));
  return Array.from({ length: n }, (_, i) => addDays(start, i));
}
