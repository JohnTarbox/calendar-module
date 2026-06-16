import type { CalendarConfig, CalendarEvent } from '@jonnyboats/calendar-contract';
import { compareDay, dayRange, type DayKey } from '../time/day.js';
import { resolveSpan } from '../time/span.js';

/**
 * Year presence model (AVS §3.2 / review S1-2). The Year window is a **per-day, per-category**
 * presence set — dates + category labels, **no event payloads** — so it stays cheap (a year is a
 * map of a few hundred day keys) AND the client-side legend filter (RS §6) still recomputes dots:
 * a day keeps its dot iff ≥1 *unfiltered* category survives.
 *
 * A multi-day/ongoing occurrence dots **every day it spans** (§1.5) — the presence map is per-day
 * truth, and an ongoing event is genuinely present every day.
 *
 * `buildPresence` runs server-side (the `/events/presence?year=` endpoint); `presentDays` runs
 * client-side from core legend state. The wire token `""` (empty string) marks a day that has an
 * **uncategorized** event — always-visible (RS §6 never hides uncategorized), so the legend can't
 * remove it.
 */
export type PresenceMap = Record<DayKey, string[]>;

/** Wire token for an uncategorized event's presence — always-visible (RS §6). */
export const UNCATEGORIZED = '';

/** Build the per-day per-category presence map for `year` (no payloads). */
export function buildPresence(
  events: readonly CalendarEvent[],
  cfg: CalendarConfig,
  year: number,
): PresenceMap {
  const yearStart: DayKey = `${year}-01-01`;
  const yearEnd: DayKey = `${year}-12-31`;
  const map = new Map<DayKey, Set<string>>();

  for (const event of events) {
    const token = event.category ?? UNCATEGORIZED;
    for (const occ of event.occurrences) {
      const span = resolveSpan(occ, cfg, event.id);
      // Clamp the span to the year (a span may straddle Jan 1 / Dec 31).
      const start = compareDay(span.startDay, yearStart) < 0 ? yearStart : span.startDay;
      const end = compareDay(span.endDayInclusive, yearEnd) > 0 ? yearEnd : span.endDayInclusive;
      if (compareDay(end, start) < 0) continue; // entirely outside the year
      for (const day of dayRange(start, end)) {
        let set = map.get(day);
        if (!set) {
          set = new Set<string>();
          map.set(day, set);
        }
        set.add(token);
      }
    }
  }

  const out: PresenceMap = {};
  for (const [day, set] of map) out[day] = [...set].sort();
  return out;
}

/**
 * The set of days that should show a dot given the current hidden-category set (RS §6 client-side
 * filter). A day is dotted iff it has an uncategorized event OR ≥1 category not in `hidden`.
 */
export function presentDays(map: PresenceMap, hidden: ReadonlySet<string> = new Set()): Set<DayKey> {
  const out = new Set<DayKey>();
  for (const day of Object.keys(map)) {
    const tokens = map[day]!;
    if (tokens.some((t) => t === UNCATEGORIZED || !hidden.has(t))) out.add(day);
  }
  return out;
}

/** The distinct real categories present across the year (drives the Year legend). */
export function presenceCategories(map: PresenceMap): string[] {
  const set = new Set<string>();
  for (const day of Object.keys(map)) {
    for (const t of map[day]!) if (t !== UNCATEGORIZED) set.add(t);
  }
  return [...set].sort();
}
