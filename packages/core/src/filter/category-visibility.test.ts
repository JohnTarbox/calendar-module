import { describe, it, expect } from 'vitest';
import type { CalendarEvent } from '@jonnyboats/calendar-contract';
import { createCategoryVisibility } from './category-visibility.js';

const events: CalendarEvent[] = [
  { id: '1', title: 'A', category: 'Fair', occurrences: [{ id: '1o', start: '2026-06-01', allDay: true }] },
  { id: '2', title: 'B', category: 'Market', occurrences: [{ id: '2o', start: '2026-06-02', allDay: true }] },
  { id: '3', title: 'C', occurrences: [{ id: '3o', start: '2026-06-03', allDay: true }] }, // uncategorized
];

describe('category visibility — view-spanning core state (RS §6, ES §2)', () => {
  it('unchecking a category removes its events; uncategorized always visible', () => {
    const v = createCategoryVisibility();
    v.toggle('Fair');
    const out = v.apply(events);
    expect(out.map((e) => e.id)).toEqual(['2', '3']);
    expect(v.isVisible('Fair')).toBe(false);
    expect(v.isVisible(undefined)).toBe(true);
  });

  it('toggling back restores; state is stable across calls (persists across views)', () => {
    const v = createCategoryVisibility(['Market']);
    expect(v.hiddenCategories()).toEqual(['Market']);
    v.toggle('Market');
    expect(v.apply(events).map((e) => e.id)).toEqual(['1', '2', '3']);
  });
});
