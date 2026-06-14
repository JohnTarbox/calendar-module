/**
 * `@calendar-module/react` — the React Month skin. Renders from the headless core's
 * `MonthLayout` and binds the core a11y API to the DOM (the core owns the logic; the skin only
 * binds, S2-7). Render-safe: all text is React-escaped; links pass the Zod URL allowlist via
 * `safeHref`; never `dangerouslySetInnerHTML`. Import the default styles from
 * `@calendar-module/react/styles`.
 */
export { CalendarMonth, type CalendarMonthProps } from './CalendarMonth.js';
export {
  EventDetailPopover,
  DayPopover,
  type DayEntry,
} from './popovers.js';
export { MonthSkeleton, EmptyWindow, FetchError } from './states.js';
export { safeHref } from './format.js';
