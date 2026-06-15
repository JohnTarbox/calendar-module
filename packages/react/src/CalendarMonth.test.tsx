import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { axe } from 'vitest-axe';
import type { CalendarConfig, CalendarEvent } from '@jonnyboats/calendar-contract';
import { CalendarMonth } from './CalendarMonth.js';

const config: CalendarConfig = { displayTimeZone: 'America/New_York', locale: 'en-US' };
const NOW = '2026-06-14T12:00:00-04:00';

const baseEvents: CalendarEvent[] = [
  {
    id: 'fair',
    title: 'Craft Fair',
    category: 'Fair',
    occurrences: [{ id: 'fair-1', start: '2026-06-10', allDay: true, location: 'Town Green' }],
  },
  {
    id: 'series',
    title: 'Farmers Market',
    category: 'Market',
    recurrenceSummary: 'Every Saturday',
    occurrences: [
      { id: 'm-past', start: '2026-06-06', allDay: true },
      { id: 'm-future', start: '2026-06-20', allDay: true },
    ],
  },
];

function renderMonth(props: Partial<React.ComponentProps<typeof CalendarMonth>> = {}) {
  return render(<CalendarMonth events={baseEvents} config={config} now={NOW} {...props} />);
}

describe('CalendarMonth — chrome + rendering (RS §1/§2)', () => {
  it('renders the range title and weekday headers', () => {
    renderMonth();
    expect(screen.getByTestId('cm-range-title').textContent).toBe('June 2026');
    expect(screen.getAllByRole('columnheader')).toHaveLength(7);
  });

  it('marks today with aria-current and disables Today when in view', () => {
    renderMonth();
    expect(screen.getByTestId('cm-cell-2026-06-14').getAttribute('aria-current')).toBe('date');
    expect((screen.getByTestId('cm-today') as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders an all-day event as a ribbon with its title', () => {
    renderMonth();
    const cell = screen.getByTestId('cm-cell-2026-06-10');
    expect(within(cell).getByTestId('cm-ribbon').textContent).toContain('Craft Fair');
  });
});

describe('CalendarMonth — interactions (RS §2/§5)', () => {
  it('click an event chip opens the detail popover (precedence over the cell empty-area)', () => {
    renderMonth();
    const cell = screen.getByTestId('cm-cell-2026-06-10');
    fireEvent.click(within(cell).getByTestId('cm-ribbon'));
    const pop = screen.getByTestId('cm-event-popover');
    expect(within(pop).getByText('Craft Fair')).toBeTruthy();
    // it opened the EVENT popover, not the day popover
    expect(screen.queryByTestId('cm-day-popover')).toBeNull();
  });

  it('click empty cell area opens the day popover listing the day’s events', () => {
    renderMonth();
    fireEvent.click(screen.getByTestId('cm-cell-2026-06-10'));
    const pop = screen.getByTestId('cm-day-popover');
    expect(within(pop).getByText('Craft Fair')).toBeTruthy();
  });

  it('a past clicked occurrence shows "Next upcoming"; a future one does not', () => {
    renderMonth();
    // past occurrence (Jun 6)
    fireEvent.click(within(screen.getByTestId('cm-cell-2026-06-06')).getByTestId('cm-ribbon'));
    expect(screen.getByTestId('cm-next-upcoming').textContent).toContain('June 20, 2026');
    fireEvent.click(screen.getByTestId('cm-popover-close'));
    // future occurrence (Jun 20)
    fireEvent.click(within(screen.getByTestId('cm-cell-2026-06-20')).getByTestId('cm-ribbon'));
    expect(screen.queryByTestId('cm-next-upcoming')).toBeNull();
  });

  it('empty day popover shows "No events on {date}"', () => {
    renderMonth();
    fireEvent.click(screen.getByTestId('cm-cell-2026-06-15'));
    expect(screen.getByTestId('cm-empty-day').textContent).toContain('No events on');
  });

  it('Add to calendar yields a valid .ics for the clicked occurrence', () => {
    const onExportIcs = vi.fn();
    renderMonth({ onExportIcs });
    fireEvent.click(within(screen.getByTestId('cm-cell-2026-06-10')).getByTestId('cm-ribbon'));
    fireEvent.click(screen.getByTestId('cm-add-to-calendar'));
    expect(onExportIcs).toHaveBeenCalledOnce();
    const ics = onExportIcs.mock.calls[0]![0] as string;
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('SUMMARY:Craft Fair');
    expect(ics).toContain('DTSTART;VALUE=DATE:20260610');
  });
});

describe('CalendarMonth — overflow + legend filter', () => {
  const many: CalendarEvent[] = Array.from({ length: 6 }, (_, i) => ({
    id: `t${i}`,
    title: `Concert ${i}`,
    category: 'Music',
    occurrences: [{ id: `t${i}-o`, start: `2026-06-10T1${i}:00:00-04:00`, allDay: false }],
  }));

  it('shows "+N more" and the day popover lists all events behind it', () => {
    render(<CalendarMonth events={many} config={config} now={NOW} />);
    const more = screen.getByTestId('cm-more-2026-06-10');
    expect(more.textContent).toMatch(/\+\d+ more/);
    fireEvent.click(more);
    const list = within(screen.getByTestId('cm-day-popover')).getByTestId('cm-day-list');
    expect(within(list).getAllByRole('button')).toHaveLength(6); // full set behind +N
  });

  it('unchecking a category removes its events from the grid', () => {
    renderMonth();
    expect(within(screen.getByTestId('cm-cell-2026-06-10')).queryByTestId('cm-ribbon')).not.toBeNull();
    fireEvent.click(screen.getByTestId('cm-legend-Fair'));
    expect(within(screen.getByTestId('cm-cell-2026-06-10')).queryByTestId('cm-ribbon')).toBeNull();
  });
});

describe('CalendarMonth — states (RS §9)', () => {
  it('renders loading, error, and empty states with known test ids', () => {
    const { rerender } = render(<CalendarMonth events={[]} config={config} now={NOW} status="loading" />);
    expect(screen.getByTestId('cm-loading')).toBeTruthy();
    rerender(<CalendarMonth events={[]} config={config} now={NOW} status="error" onRetry={() => {}} />);
    expect(screen.getByTestId('cm-error')).toBeTruthy();
    expect(screen.getByTestId('cm-retry')).toBeTruthy();
    rerender(<CalendarMonth events={[]} config={config} now={NOW} status="loaded" />);
    expect(screen.getByTestId('cm-empty')).toBeTruthy();
  });
});

describe('CalendarMonth — accessibility (RS §8b, WCAG 2.2 AA)', () => {
  it('has no axe violations', async () => {
    const { container } = renderMonth();
    // color-contrast needs a canvas (unavailable in jsdom); it is covered by visual baselines.
    const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results).toHaveNoViolations();
  });
});
