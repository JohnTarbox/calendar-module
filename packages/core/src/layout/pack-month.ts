import type { CalendarConfig, CalendarEvent } from '@jonnyboats/calendar-contract';
import type { CalendarGrid } from '../view/month-grid.js';
import { diffDays, type DayKey } from '../time/day.js';
import { resolveSpan, type ResolvedSpan } from '../time/span.js';
import { isOccurrenceOngoing } from '../occurrence/ongoing.js';
import { compareBarSpans } from './sort.js';
import {
  cellRowCap,
  type CellLayout,
  type LayoutCaps,
  type MonthLayout,
  type OngoingStrip,
  type PackedWeekRow,
  type RibbonSegment,
  type TimedEntry,
} from './types.js';

interface PlacedBar {
  span: ResolvedSpan;
  title: string;
  lane: number;
  startColumn: number;
  endColumn: number;
  continuesLeft: boolean;
  continuesRight: boolean;
}
interface TimedCandidate {
  span: ResolvedSpan;
  title: string;
  sortKey: number;
}

const max = (a: number, b: number): number => (a > b ? a : b);
const min = (a: number, b: number): number => (a < b ? a : b);
const colOf = (date: DayKey, rowStart: DayKey): number => min(6, max(0, diffDays(date, rowStart)));
const cmpId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function timeToMs(label: string | undefined): number {
  if (!label) return 0;
  const m = /(\d{1,2}):(\d{2})/.exec(label);
  return m ? (Number(m[1]) * 60 + Number(m[2])) * 60_000 : 0;
}

/**
 * Pack a month's events into the renderable {@link MonthLayout} (RS §2, §10a, §10a-bis, §10c).
 *
 * Pipeline: ongoing pre-filter → resolve spans → per week-row clip → canonical sort →
 * lowest-free-lane assignment across the whole span → one row-wide visible cap → per-cell
 * overflow. Determinism rests on stable occurrence ids (the sort's final tiebreak).
 *
 * `events` should already be category-visibility-filtered by the caller (filtering is
 * client-side core state, never a cache-key dimension — ES §8, S2-2).
 */
export function packMonth(
  events: CalendarEvent[],
  grid: CalendarGrid,
  cfg: CalendarConfig,
  caps: LayoutCaps,
): MonthLayout {
  const titleOf = new Map(events.map((e) => [e.id, e.title]));
  const windowStart = grid.weeks[0]?.cells[0]?.date ?? grid.monthStart;
  const lastWeek = grid.weeks[grid.weeks.length - 1];
  const windowEnd = lastWeek?.cells[lastWeek.cells.length - 1]?.date ?? grid.monthStart;

  const barSpans: ResolvedSpan[] = [];
  const timedSpans: ResolvedSpan[] = [];
  const ongoingStrips: OngoingStrip[] = [];

  for (const event of events) {
    for (const occ of event.occurrences) {
      const span = resolveSpan(occ, cfg, event.id);
      if (span.endDayInclusive < windowStart || span.startDay > windowEnd) continue; // off-window

      if (isOccurrenceOngoing(event, occ, cfg)) {
        ongoingStrips.push({
          occurrenceId: occ.id,
          eventId: event.id,
          title: event.title,
          startDay: span.startDay,
          throughDate: span.endDayInclusive,
        });
        continue; // ongoing → strip only; excluded from packing (S1-2)
      }

      // Bars: all-day (single or multi) or multi-day timed. Timed single-day → dot+time rows.
      if (span.allDay || span.spanDays > 1) barSpans.push(span);
      else timedSpans.push(span);
    }
  }

  const rows: PackedWeekRow[] = grid.weeks.map((week, weekIndex) => {
    const cells = week.cells;
    const rowStart = cells[0]!.date;
    const rowEnd = cells[cells.length - 1]!.date;
    const cap = cellRowCap(caps); // rowWideVisibleCap (min across cells; uniform in v0)

    // --- Lane-assign bars intersecting this row, clipped to columns. ---
    const rowBars = barSpans
      .filter((s) => s.startDay <= rowEnd && s.endDayInclusive >= rowStart)
      .sort(compareBarSpans);

    const laneOccupancy: boolean[][] = []; // [lane][column 0..6]
    const placed: PlacedBar[] = rowBars.map((span) => {
      const startColumn = span.startDay < rowStart ? 0 : colOf(span.startDay, rowStart);
      const endColumn = span.endDayInclusive > rowEnd ? 6 : colOf(span.endDayInclusive, rowStart);
      let lane = 0;
      for (;;) {
        const occ = laneOccupancy[lane] ?? (laneOccupancy[lane] = new Array<boolean>(7).fill(false));
        let free = true;
        for (let c = startColumn; c <= endColumn; c++) if (occ[c]) { free = false; break; }
        if (free) {
          for (let c = startColumn; c <= endColumn; c++) occ[c] = true;
          break;
        }
        lane++;
      }
      return {
        span,
        title: titleOf.get(span.eventId) ?? '',
        lane,
        startColumn,
        endColumn,
        continuesLeft: span.startDay < rowStart,
        continuesRight: span.endDayInclusive > rowEnd,
      };
    });
    const B = laneOccupancy.length;

    // --- Timed singles grouped by column, ordered by start. ---
    const timedByCol: TimedCandidate[][] = Array.from({ length: 7 }, () => []);
    for (const span of timedSpans) {
      if (span.startDay < rowStart || span.startDay > rowEnd) continue;
      timedByCol[colOf(span.startDay, rowStart)]!.push({
        span,
        title: titleOf.get(span.eventId) ?? '',
        sortKey: timeToMs(span.timeLabel),
      });
    }
    for (const col of timedByCol) {
      col.sort((a, b) => a.sortKey - b.sortKey || cmpId(a.span.occurrenceId, b.span.occurrenceId));
    }

    // --- Row-wide visibility (ambiguity #1/#2 defaults). Bars priority; reserve a "+N" row. ---
    let visibleBarLanes = min(B, cap);
    let timedCapacity = cap - visibleBarLanes;
    let rowOverflow = B - visibleBarLanes > 0;
    for (const col of timedByCol) if (col.length > timedCapacity) rowOverflow = true;
    if (rowOverflow) {
      const contentCap = max(0, cap - 1); // "+N more" consumes a row (#2)
      visibleBarLanes = min(B, contentCap);
      timedCapacity = max(0, contentCap - visibleBarLanes);
    }

    const ribbons: RibbonSegment[] = placed.map((p) => ({
      occurrenceId: p.span.occurrenceId,
      eventId: p.span.eventId,
      title: p.title,
      lane: p.lane,
      startColumn: p.startColumn,
      endColumn: p.endColumn,
      continuesLeft: p.continuesLeft,
      continuesRight: p.continuesRight,
      allDay: p.span.allDay,
      visible: p.lane < visibleBarLanes,
    }));

    const timedEntries: TimedEntry[] = [];
    const cellOut: CellLayout[] = cells.map((cell, column) => {
      const colTimed = timedByCol[column]!;
      colTimed.forEach((t, idx) => {
        timedEntries.push({
          occurrenceId: t.span.occurrenceId,
          eventId: t.span.eventId,
          title: t.title,
          column,
          date: cell.date,
          timeLabel: t.span.timeLabel,
          visible: idx < timedCapacity,
        });
      });
      const hiddenBars = ribbons.filter(
        (r) => !r.visible && r.startColumn <= column && r.endColumn >= column,
      ).length;
      const hiddenTimed = max(0, colTimed.length - timedCapacity);
      return {
        date: cell.date,
        column,
        inMonth: cell.inMonth,
        isToday: cell.isToday,
        overflowCount: hiddenBars + hiddenTimed,
      };
    });

    const row: PackedWeekRow = {
      weekIndex,
      rowWideVisibleCap: cap,
      reservedBarLanes: visibleBarLanes,
      ribbons,
      timed: timedEntries,
      cells: cellOut,
    };
    if (week.weekNumber !== undefined) row.weekNumber = week.weekNumber;
    return row;
  });

  const weekdayOrder = Array.from({ length: 7 }, (_, i) => (grid.weekStartsOn + i) % 7);

  return {
    monthStart: grid.monthStart,
    year: grid.year,
    month: grid.month,
    weekStartsOn: grid.weekStartsOn,
    today: grid.today,
    weekdayOrder,
    rows,
    ongoingStrips,
  };
}
