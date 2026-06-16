/**
 * `@jonnyboats/calendar-core` — the headless events-calendar engine.
 *
 * Pure TypeScript: NO React, DOM, or Cloudflare imports (enforced by lint). All the hard,
 * testable logic lives here so it is portable to the web component and the MCP server. The
 * `CalendarEvent` contract from `@jonnyboats/calendar-contract` is the only seam it depends on.
 */

// Time / span
export {
  type DayKey,
  addDays,
  diffDays,
  dayRange,
  weekdayOf,
  isDayKey,
} from './time/day.js';
export { bucketDay, wallClockLabel, parseInstant } from './time/instant.js';
export { resolveSpan, type ResolvedSpan, type SpanKind } from './time/span.js';

// Occurrence model
export {
  isEventOngoing,
  isOccurrenceOngoing,
  occurrenceSpanExceeds14d,
} from './occurrence/ongoing.js';
export {
  nextUpcomingOccurrence,
  isOccurrencePast,
} from './occurrence/select.js';

// View math
export {
  buildMonthGrid,
  monthStartOf,
  type CalendarGrid,
  type GridCell,
  type GridWeek,
} from './view/month-grid.js';
export {
  nextMonth,
  prevMonth,
  todayMonthAnchor,
  goToDateAnchor,
  isTodayInView,
  normalizeMonthAnchor,
} from './view/navigation.js';

// Schedule / Agenda (v1-a)
export {
  buildAgenda,
  pageForward,
  pageEarlier,
  groupByDay,
  hasEventsOn,
  compareCursor,
  type AgendaCursor,
  type AgendaItem,
  type AgendaDayGroup,
  type AgendaModel,
  type AgendaPage,
} from './view/agenda.js';

// Year presence (v1-b)
export {
  buildPresence,
  presentDays,
  presenceCategories,
  UNCATEGORIZED,
  type PresenceMap,
} from './view/presence.js';

// Week / Day / Custom time-grid (v2-a/v2-b)
export {
  packDayColumn,
  peakConcurrency,
  blockBox,
  type TimedSegment,
  type PositionedBlock,
} from './layout/collision.js';
export {
  dayLengthMinutes,
  minutesSinceMidnight,
  nowLineFraction,
} from './time/grid.js';
export {
  dayColumnSegments,
  packStrip,
  alignWeekStart,
  rangeDays,
  type StripRibbon,
  type StripOverflowCol,
  type OngoingBand,
  type StripLayout,
} from './view/timegrid.js';

// Layout (lane-packing + ribbon×overflow)
export { packMonth } from './layout/pack-month.js';
export {
  cellRowCap,
  type MonthLayout,
  type PackedWeekRow,
  type RibbonSegment,
  type TimedEntry,
  type CellLayout,
  type OngoingStrip,
  type LayoutCaps,
} from './layout/types.js';

// a11y imperative API
export { createGridFocus, type GridFocusApi, type GridCellAria } from './a11y/grid-focus.js';
export {
  createPopoverFocus,
  type PopoverFocusApi,
  type PopoverFocusAction,
  type PopoverKey,
} from './a11y/popover-focus.js';
export {
  resolveKey,
  AVAILABLE_VIEWS,
  type KeyIntent,
  type CalendarView,
  type Phase,
} from './a11y/keyboard.js';

// Category visibility (core state)
export {
  createCategoryVisibility,
  type CategoryVisibilityApi,
} from './filter/category-visibility.js';

// .ics
export { generateIcs, type IcsOptions } from './ics/generate.js';
export { escapeIcsText } from './ics/escape.js';

// Engine facade
export { createCalendarEngine, type CalendarEngine } from './state/engine.js';
