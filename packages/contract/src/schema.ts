import { z } from 'zod';
import { isAllowedUrl } from './url.js';
import { isValidTimeZone } from './zone.js';

/**
 * Zod schemas are the runtime source of truth for the `CalendarEvent` contract (ES §5).
 * The public TypeScript types in `./types.ts` are inferred from these, so the static and
 * runtime shapes can never drift. This module is also a published entry point
 * (`@jonnyboats/calendar-contract/schema`) for consumers that want the raw schemas.
 *
 * Forward-compatibility rule (ES §5): unknown keys are **not** an error here — schemas use
 * `.passthrough()` so additive contract changes stay minor-version. The validators in
 * `./validators.ts` surface unknown keys as *warnings*.
 */

const isoDateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date-only ISO string (YYYY-MM-DD)');

// ISO 8601 datetime with a required offset or Z. All-day occurrences use `isoDateOnly`
// instead; timed occurrences must pin an instant so day-bucketing is unambiguous (ES §8).
const isoDateTime = z
  .string()
  .regex(
    // eslint-disable-next-line security/detect-unsafe-regex -- anchored, no nested quantifiers (linear)
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
    'must be an ISO 8601 datetime with offset or Z',
  );

/** A start value is either a timed instant (with offset) or a floating all-day date. */
const startString = z.union([isoDateTime, isoDateOnly]);

const ianaZone = z.string().refine(isValidTimeZone, {
  message: 'must be a valid IANA time zone',
});

const safeUrl = z.string().refine(isAllowedUrl, {
  message: 'url protocol not allowed (block javascript:/data:; allow http/https/mailto/tel/geo or relative)',
});

const wallClock = z
  .string()
  // eslint-disable-next-line security/detect-unsafe-regex -- anchored, no nested quantifiers (linear)
  .regex(/^\d{2}:\d{2}(:\d{2})?$/, 'must be a wall-clock time (HH:mm)');

/** A single concrete instance of an event (recurrence is pre-expanded; ES §4/§5). */
export const OccurrenceSchema = z
  .object({
    id: z.string().min(1).describe('Stable + unique per occurrence across windowed loads (lane-packing determinism, §10a).'),
    start: startString.describe('ISO 8601 instant (timed) or date-only (all-day, floating).'),
    end: z
      .union([isoDateTime, isoDateOnly])
      .optional()
      .describe('Optional. All-day end is EXCLUSIVE (DTEND). Timed end is inclusive of the instant.'),
    allDay: z.boolean().describe('Date-only/all-day occurrences are FLOATING — never shift day under a different displayTimeZone.'),
    timezone: ianaZone.optional().describe('IANA; required for timed multi-tz correctness (render wall-clock; §8 precedence).'),
    location: z.string().optional().describe('Display label, e.g. "Venue Name, Town". Engine-rendered (Agenda rows, popovers). Per-occurrence.'),
    mapUrl: safeUrl.optional().describe('"Get directions" target; same protocol allowlist as `url`.'),
    openTime: wallClock.optional().describe('Local wall-clock display hint.'),
    closeTime: wallClock.optional().describe('Local wall-clock display hint.'),
    note: z.string().optional(),
  })
  .passthrough();

/** The versioned public unit of data — everything codes against this (ES §5). */
export const CalendarEventSchema = z
  .object({
    id: z.string().min(1).describe('Stable + unique across windowed loads.'),
    title: z.string().describe('Rendered as text — never as HTML.'),
    category: z.string().optional().describe('Drives color via the theme category map.'),
    url: safeUrl.optional().describe('"View event page"; the Zod validator IS the protocol allowlist.'),
    recurrenceSummary: z
      .string()
      .optional()
      .describe('Adapter-supplied human string. The engine DISPLAYS it verbatim; it NEVER computes it from occurrences.'),
    occurrences: z
      .array(OccurrenceSchema)
      .min(1)
      .describe('Recurrence pre-expanded to concrete instances; MUST be sorted ascending by start (validateWindow-enforced).'),
    ongoing: z
      .boolean()
      .optional()
      .describe('Explicit override. If absent, derived TRUE iff ANY single occurrence span > 14 days (strict). Excluded from ribbon packing.'),
  })
  .passthrough();

/** Per-tenant/deployment instance config, resolved server-side (ES §5). */
export const CalendarConfigSchema = z
  .object({
    displayTimeZone: ianaZone.describe('IANA, REQUIRED. The single tz for day-bucketing, today-disc, now-line. Never inferred from runtime.'),
    defaultDurationMinutes: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Default 60; applied to timed occurrences lacking `end`.'),
    categoryColors: z.record(z.string()).optional(),
    weekStartsOn: z
      .union([z.literal(0), z.literal(1)])
      .optional()
      .describe('0 = Sunday (US default), 1 = Monday. Drives the Month grid + weekday header.'),
    locale: z.string().optional().describe('BCP-47 (default "en-US").'),
    showWeekNumbers: z.boolean().optional().describe('ISO-8601 week-of-year via Luxon; default false.'),
  })
  .passthrough();

/**
 * Minimal JSON-schema projection of the contract for non-TS consumers and the MCP docs
 * surface (ES §9a). Hand-authored (not auto-generated) to keep the published shape stable
 * and dependency-free; the Zod schemas above remain the runtime source of truth.
 */
export const calendarEventJsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://calendar-module.dev/schema/calendar-event.json',
  title: 'CalendarEvent',
  type: 'object',
  required: ['id', 'title', 'occurrences'],
  additionalProperties: true,
  properties: {
    id: { type: 'string', minLength: 1 },
    title: { type: 'string' },
    category: { type: 'string' },
    url: { type: 'string' },
    recurrenceSummary: { type: 'string' },
    ongoing: { type: 'boolean' },
    occurrences: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['id', 'start', 'allDay'],
        additionalProperties: true,
        properties: {
          id: { type: 'string', minLength: 1 },
          start: { type: 'string' },
          end: { type: 'string' },
          allDay: { type: 'boolean' },
          timezone: { type: 'string' },
          location: { type: 'string' },
          mapUrl: { type: 'string' },
          openTime: { type: 'string' },
          closeTime: { type: 'string' },
          note: { type: 'string' },
        },
      },
    },
  },
} as const;
