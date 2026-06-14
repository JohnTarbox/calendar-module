import type { ResolvedSpan } from '../time/span.js';
import { diffDays } from '../time/day.js';

/**
 * Canonical bar/ribbon ordering (RS §10a) — the determinism guarantee. Sort by:
 *  1. start day ascending (true start, not clipped),
 *  2. longer total effective span first (stable lane intent across week rows — ambiguity #3
 *     default: total span, not in-row-clipped length),
 *  3. stable occurrence id.
 *
 * Because every tiebreak ultimately resolves on the stable occurrence id, identical input
 * yields byte-identical lane assignment regardless of source ordering.
 */
export function compareBarSpans(a: ResolvedSpan, b: ResolvedSpan): number {
  const byStart = diffDays(a.startDay, b.startDay);
  if (byStart !== 0) return byStart;
  const byLen = b.spanDays - a.spanDays; // longer first
  if (byLen !== 0) return byLen;
  return a.occurrenceId < b.occurrenceId ? -1 : a.occurrenceId > b.occurrenceId ? 1 : 0;
}
