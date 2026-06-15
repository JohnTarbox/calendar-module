import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { CalendarConfig, CalendarEvent } from '@johntarbox/calendar-contract';
import { CalendarMonth } from './CalendarMonth.js';

const config: CalendarConfig = { displayTimeZone: 'America/New_York', locale: 'en-US' };
const NOW = '2026-06-14T12:00:00-04:00';
const events: CalendarEvent[] = [
  { id: 'fair', title: 'Craft Fair', category: 'Fair', occurrences: [{ id: 'fair-1', start: '2026-06-10', allDay: true }] },
];

const tabindexOf = (date: string) => screen.getByTestId(`cm-cell-${date}`).getAttribute('tabindex');

describe('CalendarMonth — keyboard & focus (RS §8b)', () => {
  it('roving focus starts on today and moves cell-to-cell', () => {
    render(<CalendarMonth events={events} config={config} now={NOW} />);
    expect(tabindexOf('2026-06-14')).toBe('0');
    const grid = screen.getByTestId('cm-grid');
    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    expect(tabindexOf('2026-06-15')).toBe('0');
    expect(tabindexOf('2026-06-14')).toBe('-1');
    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    expect(tabindexOf('2026-06-22')).toBe('0'); // +1 week from Jun 15
  });

  it('Enter on the focused cell opens its day popover', () => {
    render(<CalendarMonth events={events} config={config} now={NOW} />);
    fireEvent.keyDown(screen.getByTestId('cm-grid'), { key: 'Enter' });
    expect(screen.getByTestId('cm-day-popover')).toBeTruthy();
  });

  it('Escape closes a popover and returns focus to its trigger', () => {
    render(<CalendarMonth events={events} config={config} now={NOW} />);
    const ribbon = within(screen.getByTestId('cm-cell-2026-06-10')).getByTestId('cm-ribbon');
    fireEvent.click(ribbon);
    const pop = screen.getByTestId('cm-event-popover');
    fireEvent.keyDown(pop, { key: 'Escape' });
    expect(screen.queryByTestId('cm-event-popover')).toBeNull();
    expect(document.activeElement).toBe(ribbon);
  });

  it('n/p navigate months from the grid', () => {
    render(<CalendarMonth events={events} config={config} now={NOW} />);
    const grid = screen.getByTestId('cm-grid');
    fireEvent.keyDown(grid, { key: 'n' });
    expect(screen.getByTestId('cm-range-title').textContent).toBe('July 2026');
    fireEvent.keyDown(grid, { key: 'p' });
    expect(screen.getByTestId('cm-range-title').textContent).toBe('June 2026');
  });
});
