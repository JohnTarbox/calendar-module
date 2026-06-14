/**
 * Keyboard map → intent resolution (RS §8a). The core maps keys to view-agnostic intents; the
 * engine/skin decides whether the target action exists in the current phase.
 *
 * Grounding (S1-3): the view shortcuts (1/d 2/w 3/m 4/x 5/a), t, g, /, r, e, Esc, ? are verified
 * against Google's live help table. The **previous-range `p`/`k`** binding is a deliberate
 * MODULE CONVENTION — Google's table has no previous-range shortcut — so its behavior is a
 * module addition, not Google parity. Authoring keys (c, z, Delete, ⌘S) are intentionally inert.
 */
export type CalendarView = 'day' | 'week' | 'month' | 'year' | 'agenda' | 'custom';

export type KeyIntent =
  | { kind: 'nav'; dir: 'next' | 'prev' | 'today' }
  | { kind: 'goToDate' }
  | { kind: 'focusSearch' }
  | { kind: 'switchView'; view: CalendarView }
  | { kind: 'openDetails' }
  | { kind: 'closePopover' }
  | { kind: 'showShortcuts' }
  | { kind: 'inert' };

export type Phase = 'v0' | 'v1' | 'v2';

/** Views that actually exist in each phase (RS §3 phasing). v0 = Month only. */
export const AVAILABLE_VIEWS: Record<Phase, CalendarView[]> = {
  v0: ['month'],
  v1: ['month', 'agenda', 'year'],
  v2: ['month', 'agenda', 'year', 'week', 'day', 'custom'],
};

const VIEW_KEYS: Record<string, CalendarView> = {
  '1': 'day',
  d: 'day',
  '2': 'week',
  w: 'week',
  '3': 'month',
  m: 'month',
  '4': 'custom',
  x: 'custom',
  '5': 'agenda',
  a: 'agenda',
};

export function resolveKey(key: string, phase: Phase): KeyIntent {
  switch (key) {
    case 'j':
    case 'n':
      return { kind: 'nav', dir: 'next' };
    case 'p':
    case 'k':
      return { kind: 'nav', dir: 'prev' }; // ⚑ module convention, not Google parity
    case 't':
      return { kind: 'nav', dir: 'today' };
    case 'g':
      return { kind: 'goToDate' };
    case '/':
      return { kind: 'focusSearch' };
    case 'e':
      return { kind: 'openDetails' };
    case 'Escape':
      return { kind: 'closePopover' };
    case '?':
      return { kind: 'showShortcuts' };
    default: {
      const view = VIEW_KEYS[key];
      if (view) {
        // A shortcut for a view that doesn't exist yet (e.g. x/4 Custom in v0/v1) is inert.
        return AVAILABLE_VIEWS[phase].includes(view)
          ? { kind: 'switchView', view }
          : { kind: 'inert' };
      }
      return { kind: 'inert' }; // authoring keys (c, z, …) and everything else
    }
  }
}
