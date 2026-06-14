import type { z } from 'zod';
import type { CalendarEventSchema, OccurrenceSchema, CalendarConfigSchema } from './schema.js';

/**
 * A single concrete instance of an event. Recurrence is pre-expanded to occurrences (ES §4):
 * the engine only ever renders concrete instances.
 *
 * - **All-day occurrences are floating:** a date-only `start` carries no tz and must render on
 *   the same calendar day regardless of `displayTimeZone` (iCalendar rule).
 * - **All-day `end` is EXCLUSIVE** (DTEND): a 3-day all-day event Fri–Sun has `end` = Mon.
 * - **Timed `end` is inclusive** of the instant; a missing timed `end` defaults to
 *   `CalendarConfig.defaultDurationMinutes`.
 */
export type Occurrence = z.infer<typeof OccurrenceSchema>;

/**
 * The versioned public unit of data — the seam every face of the module codes against (ES §5).
 * Treated as SemVer (a breaking change is a major version). Carries no MMATF-isms.
 *
 * `occurrences[]` MUST be sorted ascending by `start` (enforced by {@link validateWindow}),
 * which enables deterministic lane-packing and "next upcoming" selection.
 */
export type CalendarEvent = z.infer<typeof CalendarEventSchema>;

/**
 * Per-tenant/deployment instance config, resolved server-side (ES §5). `displayTimeZone` is
 * REQUIRED and must be resolvable at SSR render time — it is the single tz for day-bucketing,
 * the today-disc, and (v2) the now-line. It is NEVER inferred from the runtime, because a
 * Cloudflare Worker's `Date` is always UTC.
 */
export type CalendarConfig = z.infer<typeof CalendarConfigSchema>;
