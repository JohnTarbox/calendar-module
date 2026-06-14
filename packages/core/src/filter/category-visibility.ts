import type { CalendarEvent } from '@calendar-module/contract';

/**
 * Category-visibility / legend-filter state (RS §6, ES §2).
 *
 * This is **view-spanning core state**: unchecking a category removes its events from every
 * view and persists across view switches. It lives in the headless core (not the skin) so it
 * survives the web-component path and so the legend and a host sidebar bind to the SAME state.
 *
 * Filtering is applied **client-side** before `packMonth` — it is never a cache-key dimension
 * (keying the edge cache on filters would collapse the hit rate into the category power set,
 * ES §8, S2-2).
 */
export interface CategoryVisibilityApi {
  /** Toggle a category's visibility. */
  toggle(category: string): void;
  setHidden(category: string, hidden: boolean): void;
  isVisible(category: string | undefined): boolean;
  /** Hidden categories, for binding a host UI. */
  hiddenCategories(): string[];
  /** Apply the current visibility set to an event list (drops fully-hidden events). */
  apply(events: CalendarEvent[]): CalendarEvent[];
}

export function createCategoryVisibility(initialHidden: string[] = []): CategoryVisibilityApi {
  const hidden = new Set(initialHidden);
  return {
    toggle(category) {
      if (hidden.has(category)) hidden.delete(category);
      else hidden.add(category);
    },
    setHidden(category, isHidden) {
      if (isHidden) hidden.add(category);
      else hidden.delete(category);
    },
    isVisible(category) {
      // Uncategorized events are always visible (no legend entry can hide them).
      return category === undefined || !hidden.has(category);
    },
    hiddenCategories() {
      return [...hidden].sort();
    },
    apply(events) {
      return events.filter((e) => e.category === undefined || !hidden.has(e.category));
    },
  };
}
