/**
 * `@johntarbox/calendar-contract` — the versioned `CalendarEvent` seam (ES §5).
 *
 * Everything the module produces or consumes codes against these types + validators.
 * SemVer-frozen: a breaking change here is a major version.
 */
export type { CalendarEvent, Occurrence, CalendarConfig } from './types.js';
export {
  validateEvent,
  validateWindow,
  validateConfig,
  type ValidationResult,
} from './validators.js';
export { isAllowedUrl, ALLOWED_URL_PROTOCOLS } from './url.js';
export { isValidTimeZone } from './zone.js';
export {
  CalendarEventSchema,
  OccurrenceSchema,
  CalendarConfigSchema,
  calendarEventJsonSchema,
} from './schema.js';
