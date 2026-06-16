/**
 * `@jonnyboats/calendar-react` — the React Month skin and the host-facing `MonthCalendar` mount API.
 *
 * This package is a CLIENT component: the `"use client"` directive is injected at the top of the
 * built entry (`dist/index.js`) by the tsup post-build step, so a host Next.js App Router Server
 * Component can import `MonthCalendar` directly. Render-safe: all text is React-escaped; links
 * pass the Zod URL allowlist via `safeHref`; never `dangerouslySetInnerHTML`. Import the default
 * styles once from `@jonnyboats/calendar-react/styles`.
 */

// Public mount API
export {
  MonthCalendar,
  type MonthCalendarProps,
  type CalendarWindow,
  type CalendarTheme,
} from './MonthCalendar.js';

// Internal skin + render-slot contexts; `CalendarMonth` is a deprecated config-based alias.
export {
  MonthSkin,
  CalendarMonth,
  type MonthSkinProps,
  type CalendarMonthProps,
  type EventPopoverSlotCtx,
  type DayPopoverSlotCtx,
  type LegendSlotCtx,
} from './CalendarMonth.js';

// Schedule / Agenda view (v1-a) — host-facing mount API + internal skin
export {
  ScheduleCalendar,
  ScheduleSkin,
  type ScheduleCalendarProps,
  type ScheduleSkinProps,
} from './Schedule.js';

// Built-in pieces (so a slot override can compose with them)
export { EventDetailPopover, DayPopover, type DayEntry } from './popovers.js';
export { MonthSkeleton, ScheduleSkeleton, EmptyWindow, FetchError } from './states.js';
export { safeHref } from './format.js';

// Contract validators + types re-exported for host-side use (validate before passing in).
export {
  validateEvent,
  validateWindow,
  validateConfig,
  calendarEventJsonSchema,
  type CalendarEvent,
  type Occurrence,
  type CalendarConfig,
  type ValidationResult,
} from '@jonnyboats/calendar-contract';
