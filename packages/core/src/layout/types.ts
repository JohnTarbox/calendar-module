import type { DayKey } from '../time/day.js';

/**
 * Intermediate layout shapes produced by `packMonth`. A skin (React, web component) consumes
 * these and only draws — all the hard decisions (lanes, ribbon continuity, per-cell overflow)
 * are already made here, in framework-agnostic data.
 */

/** A multi-day / all-day bar within one week row, drawn once at its `startColumn`. */
export interface RibbonSegment {
  occurrenceId: string;
  eventId: string;
  title: string;
  lane: number; // reserved row-wide; same vertical offset in every cell of its span
  startColumn: number; // 0–6 within this week row (clipped)
  endColumn: number; // 0–6 within this week row (clipped)
  continuesLeft: boolean; // span entered from the previous week row
  continuesRight: boolean; // span exits into the next week row
  allDay: boolean;
  /** Row-wide all-cells-or-none visibility (RS §10a-bis): a ribbon is shown in every cell of
   * its span or in none — never partially. */
  visible: boolean;
}

/** A timed single-day event row within a specific cell (dot + time + title). */
export interface TimedEntry {
  occurrenceId: string;
  eventId: string;
  title: string;
  column: number; // 0–6
  date: DayKey;
  timeLabel: string | undefined;
  visible: boolean;
}

/** Per-cell overflow accounting (RS §10c, S2-4): N is per-cell, NOT row-summable. */
export interface CellLayout {
  date: DayKey;
  column: number;
  inMonth: boolean;
  isToday: boolean;
  /** Items intersecting THIS cell that are hidden — a multi-day ribbon counts as 1 per cell. */
  overflowCount: number;
}

export interface PackedWeekRow {
  weekIndex: number;
  weekNumber?: number;
  /** Min visible-lane cap across the row's cells (RS §10a-bis); also the ribbon visibility cut. */
  rowWideVisibleCap: number;
  reservedBarLanes: number; // rows reserved for bars (row-wide, including gaps)
  ribbons: RibbonSegment[];
  timed: TimedEntry[];
  cells: CellLayout[];
}

/** "Ongoing through {date}" strip (RS §11) — excluded from ribbon lane-packing (S1-2). */
export interface OngoingStrip {
  occurrenceId: string;
  eventId: string;
  title: string;
  startDay: DayKey;
  throughDate: DayKey;
}

export interface MonthLayout {
  monthStart: DayKey;
  year: number;
  month: number;
  weekStartsOn: 0 | 1;
  today: DayKey | null;
  weekdayOrder: number[]; // 0–6 in display column order (for weekday header)
  rows: PackedWeekRow[];
  ongoingStrips: OngoingStrip[];
}

/**
 * Cell geometry the skin measures and passes in. The overflow threshold (RS §10c) is
 * `floor((cellHeight − headerHeight) / rowHeight)` — bars and timed rows share one row-height
 * unit so the floor math is valid (§10a "unit consistency").
 */
export interface LayoutCaps {
  cellHeight: number;
  headerHeight: number;
  rowHeight: number;
}

export function cellRowCap(caps: LayoutCaps): number {
  if (caps.rowHeight <= 0) return 0;
  return Math.max(0, Math.floor((caps.cellHeight - caps.headerHeight) / caps.rowHeight));
}
