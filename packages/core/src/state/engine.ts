import type { CalendarConfig, CalendarEvent } from '@johntarbox/calendar-contract';
import type { DayKey } from '../time/day.js';
import { buildMonthGrid, type CalendarGrid } from '../view/month-grid.js';
import {
  goToDateAnchor,
  isTodayInView,
  nextMonth,
  normalizeMonthAnchor,
  prevMonth,
  todayMonthAnchor,
} from '../view/navigation.js';
import { packMonth } from '../layout/pack-month.js';
import type { LayoutCaps, MonthLayout } from '../layout/types.js';
import {
  createCategoryVisibility,
  type CategoryVisibilityApi,
} from '../filter/category-visibility.js';

/**
 * Thin facade composing the Month view's state: anchor navigation + category-visibility filter,
 * plus pure derivations of the grid and packed layout. SSR-safe: "now" is injected once (an ISO
 * string the host pins at request time) and never re-read from a clock (ES §8).
 *
 * The a11y APIs (grid focus, popover focus) are created per-render by the skin from the grid,
 * since their lifecycle is DOM-bound; this facade owns only view-spanning state.
 */
export interface CalendarEngine {
  readonly config: CalendarConfig;
  readonly now: string;
  readonly filter: CategoryVisibilityApi;
  anchor(): DayKey;
  grid(): CalendarGrid;
  layout(events: CalendarEvent[], caps: LayoutCaps): MonthLayout;
  next(): DayKey;
  prev(): DayKey;
  today(): DayKey;
  goToDate(date: DayKey): DayKey;
  isTodayDisabled(): boolean;
}

export function createCalendarEngine(cfg: CalendarConfig, now: string): CalendarEngine {
  const filter = createCategoryVisibility();
  let anchor = todayMonthAnchor(now, cfg);

  return {
    config: cfg,
    now,
    filter,
    anchor: () => anchor,
    grid: () => buildMonthGrid(anchor, cfg, now),
    layout(events, caps) {
      const visible = filter.apply(events);
      return packMonth(visible, buildMonthGrid(anchor, cfg, now), cfg, caps);
    },
    next() {
      anchor = nextMonth(anchor);
      return anchor;
    },
    prev() {
      anchor = prevMonth(anchor);
      return anchor;
    },
    today() {
      anchor = todayMonthAnchor(now, cfg);
      return anchor;
    },
    goToDate(date) {
      anchor = goToDateAnchor(date);
      return anchor;
    },
    isTodayDisabled: () => isTodayInView(normalizeMonthAnchor(anchor), now, cfg),
  };
}
