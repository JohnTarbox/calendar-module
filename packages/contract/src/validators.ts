import { z } from 'zod';
import {
  CalendarEventSchema,
  OccurrenceSchema,
  CalendarConfigSchema,
} from './schema.js';
import type { CalendarEvent, CalendarConfig } from './types.js';

/**
 * Two validators, two scopes (S2-6):
 * - {@link validateEvent} — per-event shape + URL/`mapUrl` protocol allowlist. This IS the
 *   MCP `validate_event` tool surface (ES §9b). A single-event validator structurally cannot
 *   assert cross-event uniqueness.
 * - {@link validateWindow} — array-level: id-uniqueness within the window AND each event's
 *   `occurrences[]` sorted ascending by start (S1-6). Runs in the data/adapter layer + tests.
 *
 * Both return a structured result rather than throwing, so a hostile/garbage payload degrades
 * gracefully (ES §6/§7). Unknown keys are surfaced as *warnings*, never errors — additive
 * contract changes stay minor-version (ES §5 forward-compat).
 */
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors: string[];
  warnings: string[];
}

const OCCURRENCE_KEYS = new Set(Object.keys(OccurrenceSchema.shape));
const EVENT_KEYS = new Set(Object.keys(CalendarEventSchema.shape));
const CONFIG_KEYS = new Set(Object.keys(CalendarConfigSchema.shape));

function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((i) => {
    const path = i.path.length ? i.path.join('.') : '(root)';
    return `${path}: ${i.message}`;
  });
}

function unknownKeyWarnings(raw: unknown, known: Set<string>, prefix: string): string[] {
  if (raw === null || typeof raw !== 'object') return [];
  return Object.keys(raw as Record<string, unknown>)
    .filter((k) => !known.has(k))
    .map((k) => `${prefix}${k}: unknown field (ignored; additive contract change?)`);
}

/** Stable numeric sort key for an occurrence start (date-only → UTC midnight). */
function startSortKey(start: string): number {
  const ms = Date.parse(start);
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Validate a single event's shape and link-protocol safety. Per-event scope only.
 * Use {@link validateWindow} for cross-event invariants.
 */
export function validateEvent(input: unknown): ValidationResult<CalendarEvent> {
  const parsed = CalendarEventSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, errors: formatIssues(parsed.error), warnings: [] };
  }
  const warnings = unknownKeyWarnings(input, EVENT_KEYS, '');
  const occs = (input as { occurrences?: unknown }).occurrences;
  if (Array.isArray(occs)) {
    occs.forEach((o, idx) => {
      warnings.push(...unknownKeyWarnings(o, OCCURRENCE_KEYS, `occurrences[${idx}].`));
    });
  }
  return { success: true, data: parsed.data as CalendarEvent, errors: [], warnings };
}

/**
 * Validate a whole windowed load: every event's shape, plus the array-level invariants the
 * engine relies on — event-id uniqueness, occurrence-id uniqueness across the window, and
 * `occurrences[]` sorted ascending by start within each event.
 */
export function validateWindow(input: unknown): ValidationResult<CalendarEvent[]> {
  const arrayParsed = z.array(CalendarEventSchema).safeParse(input);
  if (!arrayParsed.success) {
    return { success: false, errors: formatIssues(arrayParsed.error), warnings: [] };
  }

  const events = arrayParsed.data as CalendarEvent[];
  const errors: string[] = [];
  const warnings: string[] = [];

  const seenEventIds = new Set<string>();
  const seenOccurrenceIds = new Set<string>();

  events.forEach((event, ei) => {
    if (seenEventIds.has(event.id)) {
      errors.push(`events[${ei}].id: duplicate event id "${event.id}" within window`);
    }
    seenEventIds.add(event.id);

    let prevKey = -Infinity;
    event.occurrences.forEach((occ, oi) => {
      if (seenOccurrenceIds.has(occ.id)) {
        errors.push(
          `events[${ei}].occurrences[${oi}].id: duplicate occurrence id "${occ.id}" within window`,
        );
      }
      seenOccurrenceIds.add(occ.id);

      const key = startSortKey(occ.start);
      if (key < prevKey) {
        errors.push(
          `events[${ei}].occurrences[${oi}]: not sorted ascending by start (${occ.start} precedes an earlier-sorted neighbor)`,
        );
      }
      prevKey = key;
    });
  });

  // Per-event/occurrence unknown-key warnings (best-effort over the raw input).
  if (Array.isArray(input)) {
    input.forEach((rawEvent, ei) => {
      warnings.push(...unknownKeyWarnings(rawEvent, EVENT_KEYS, `events[${ei}].`));
      const occs = (rawEvent as { occurrences?: unknown })?.occurrences;
      if (Array.isArray(occs)) {
        occs.forEach((o, oi) => {
          warnings.push(...unknownKeyWarnings(o, OCCURRENCE_KEYS, `events[${ei}].occurrences[${oi}].`));
        });
      }
    });
  }

  return { success: errors.length === 0, data: events, errors, warnings };
}

/**
 * Validate a `CalendarConfig` — chiefly that `displayTimeZone` is a resolvable IANA zone
 * (S2-9). An invalid zone is a hard config error at the build/deploy boundary, never a silent
 * UTC fallback. The worker also keeps a render-time guard for defense in depth (ES §8).
 */
export function validateConfig(input: unknown): ValidationResult<CalendarConfig> {
  const parsed = CalendarConfigSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, errors: formatIssues(parsed.error), warnings: [] };
  }
  const warnings = unknownKeyWarnings(input, CONFIG_KEYS, '');
  return { success: true, data: parsed.data as CalendarConfig, errors: [], warnings };
}
