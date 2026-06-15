import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { CalendarEvent } from '@calendar-module/contract';
import { MonthCalendar, validateEvent, validateWindow, validateConfig } from './index.js';

const NOW = '2026-06-14T12:00:00-04:00';
const events: CalendarEvent[] = [
  {
    id: 'fair',
    title: 'Craft Fair',
    category: 'Fair',
    occurrences: [{ id: 'fair-1', start: '2026-06-10', allDay: true }],
  },
];

function renderCal(props: Partial<React.ComponentProps<typeof MonthCalendar>> = {}) {
  return render(
    <MonthCalendar events={events} displayTimeZone="America/New_York" now={NOW} locale="en-US" {...props} />,
  );
}

describe('MonthCalendar — flat mount API', () => {
  it('renders the month from flat props (no config object needed)', () => {
    renderCal();
    expect(screen.getByTestId('cm-range-title').textContent).toBe('June 2026');
    expect(screen.getByTestId('cm-cell-2026-06-14').getAttribute('aria-current')).toBe('date');
  });

  it('invalid displayTimeZone falls into the render guard (error state), never throws', () => {
    expect(() => renderCal({ displayTimeZone: 'Not/AZone' })).not.toThrow();
    expect(screen.getByTestId('cm-error')).toBeTruthy();
  });

  it('theme.categoryColors colors the event ribbon', () => {
    renderCal({ theme: { categoryColors: { Fair: '#d81b60' } } });
    const ribbon = within(screen.getByTestId('cm-cell-2026-06-10')).getByTestId('cm-ribbon');
    expect(ribbon.getAttribute('style')).toMatch(/background/);
  });

  it('theme tokens map to CSS custom properties on the root', () => {
    renderCal({ theme: { accent: '#123456' } });
    expect(screen.getByTestId('cm-root').getAttribute('style')).toContain('--cm-accent');
  });

  it('re-exports the contract validators for host-side use', () => {
    expect(validateEvent(events[0]).success).toBe(true);
    expect(validateWindow(events).success).toBe(true);
    expect(validateConfig({ displayTimeZone: 'America/New_York' }).success).toBe(true);
    expect(validateConfig({ displayTimeZone: 'Bad/Zone' }).success).toBe(false);
  });
});

describe('MonthCalendar — render slots + callbacks', () => {
  it('renderLegend overrides the built-in legend', () => {
    renderCal({
      renderLegend: ({ categories }) => <div data-testid="custom-legend">{categories.join(',')}</div>,
    });
    expect(screen.getByTestId('custom-legend').textContent).toBe('Fair');
    expect(screen.queryByTestId('cm-legend')).toBeNull();
  });

  it('renderEventPopover overrides the built-in detail popover', () => {
    renderCal({
      renderEventPopover: ({ event }) => <div data-testid="custom-pop">{event.title}</div>,
    });
    fireEvent.click(within(screen.getByTestId('cm-cell-2026-06-10')).getByTestId('cm-ribbon'));
    expect(screen.getByTestId('custom-pop').textContent).toBe('Craft Fair');
    expect(screen.queryByTestId('cm-event-popover')).toBeNull();
  });

  it('onNavigate fires with the new anchor + grid window', () => {
    const onNavigate = vi.fn();
    renderCal({ onNavigate });
    fireEvent.click(screen.getByTestId('cm-next'));
    expect(onNavigate).toHaveBeenCalledOnce();
    const arg = onNavigate.mock.calls[0]![0];
    expect(arg.anchor).toBe('2026-07-01');
    expect(typeof arg.window.start).toBe('string');
    expect(typeof arg.window.end).toBe('string');
  });

  it('onLegendFilterChange fires when a category is toggled', () => {
    const onLegendFilterChange = vi.fn();
    renderCal({ onLegendFilterChange });
    fireEvent.click(screen.getByTestId('cm-legend-Fair'));
    expect(onLegendFilterChange).toHaveBeenCalledOnce();
    const hidden = onLegendFilterChange.mock.calls[0]![0] as ReadonlySet<string>;
    expect(hidden.has('Fair')).toBe(true);
  });

  it('window without initialAnchor selects the month the window covers', () => {
    const onNavigate = vi.fn();
    // A July grid window (leads into late June) → should display July.
    renderCal({ window: { start: '2026-06-28', end: '2026-08-01' }, onNavigate });
    expect(screen.getByTestId('cm-range-title').textContent).toBe('July 2026');
  });
});
