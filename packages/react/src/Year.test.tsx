import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import type { CalendarConfig, CalendarEvent } from '@jonnyboats/calendar-contract';
import { buildPresence } from '@jonnyboats/calendar-core';
import { YearCalendar } from './index.js';

const NOW = '2026-06-16T12:00:00-04:00'; // today = 2026-06-16
const TZ = 'America/New_York';
const cfg: CalendarConfig = { displayTimeZone: TZ };

function allDay(id: string, cat: string | undefined, start: string, end?: string): CalendarEvent {
  return { id, title: id, category: cat, occurrences: [{ id: `${id}#1`, start, end, allDay: true }] } as CalendarEvent;
}

const sampleEvents = [
  allDay('craft', 'Craft', '2026-03-14'),
  allDay('music', 'Music', '2026-03-20'),
  allDay('craft2', 'Craft', '2026-03-20'), // 03-20 has both
  allDay('expo', 'Festival', '2026-06-01', '2026-06-22'), // multi-day, spans many June days
];

function renderYear(props: Partial<React.ComponentProps<typeof YearCalendar>> = {}) {
  const presence = props.presence ?? buildPresence(sampleEvents, cfg, 2026);
  return render(
    <YearCalendar presence={presence} displayTimeZone={TZ} now={NOW} year={2026} locale="en-US" {...props} />,
  );
}

describe('YearCalendar — layout & dots (AVS §3.1/§3.4)', () => {
  it('renders 12 mini-months and the year title', () => {
    renderYear();
    expect(screen.getByTestId('cm-range-title').textContent).toBe('2026');
    for (const m of ['01', '02', '03', '12']) {
      expect(screen.getByTestId(`cm-year-month-${2026}-${m}-01`)).toBeTruthy();
    }
  });

  it('[AC §3.4] dots exactly the days the presence map marks', () => {
    renderYear();
    expect(screen.getByTestId('cm-year-dot-2026-03-14')).toBeTruthy();
    expect(screen.getByTestId('cm-year-dot-2026-03-20')).toBeTruthy();
    expect(screen.queryByTestId('cm-year-dot-2026-03-15')).toBeNull();
  });

  it('[AC §1.5] a multi-day event dots every day it spans (DTEND exclusive → Jun 1–21)', () => {
    renderYear();
    for (let d = 1; d <= 21; d++) {
      const key = `2026-06-${String(d).padStart(2, '0')}`;
      expect(screen.getByTestId(`cm-year-dot-${key}`)).toBeTruthy();
    }
    expect(screen.queryByTestId('cm-year-dot-2026-06-22')).toBeNull(); // DTEND exclusive
  });

  it('today-disc renders on the real current day in displayTimeZone', () => {
    renderYear();
    expect(screen.getByTestId('cm-year-cell-2026-06-16').className).toContain('cm-today');
  });
});

describe('YearCalendar — legend filter recomputes dots client-side (RS §6 / S1-2)', () => {
  it('[AC §3.4] unchecking a category removes dots for days whose only category was that one', () => {
    renderYear();
    expect(screen.getByTestId('cm-year-dot-2026-03-14')).toBeTruthy(); // Craft-only
    fireEvent.click(screen.getByTestId('cm-legend-Craft'));
    expect(screen.queryByTestId('cm-year-dot-2026-03-14')).toBeNull(); // gone
    expect(screen.getByTestId('cm-year-dot-2026-03-20')).toBeTruthy(); // keeps Music
  });
});

describe('YearCalendar — interactions (AVS §3.2/§3.3)', () => {
  it('[AC] clicking a dotted day hydrates and opens the day popover with the full set', async () => {
    const hydrateDay = vi.fn((date: string) =>
      date === '2026-03-20' ? [allDay('music', 'Music', '2026-03-20'), allDay('craft2', 'Craft', '2026-03-20')] : [],
    );
    renderYear({ hydrateDay });
    fireEvent.click(screen.getByTestId('cm-year-cell-2026-03-20'));
    await waitFor(() => expect(screen.getByTestId('cm-day-popover')).toBeTruthy());
    expect(hydrateDay).toHaveBeenCalledWith('2026-03-20');
    const list = screen.getByTestId('cm-day-list');
    expect(within(list).getAllByRole('button').length).toBe(2);
  });

  it('[AC §3.2] clicking an undotted day opens the "No events on {date}" popover (no hydrate)', () => {
    const hydrateDay = vi.fn(() => []);
    renderYear({ hydrateDay });
    fireEvent.click(screen.getByTestId('cm-year-cell-2026-03-15'));
    expect(screen.getByTestId('cm-empty-day').textContent).toMatch(/No events on/);
    expect(hydrateDay).not.toHaveBeenCalled();
  });

  it('[AC] clicking a month title navigates to that Month', () => {
    const onNavigateToMonth = vi.fn();
    renderYear({ onNavigateToMonth });
    fireEvent.click(screen.getByTestId('cm-year-month-title-2026-03-01'));
    expect(onNavigateToMonth).toHaveBeenCalledWith('2026-03-01');
  });

  it('prev/next move by a year; Today is disabled when the current year is in view', () => {
    const onNavigateYear = vi.fn();
    renderYear({ onNavigateYear });
    expect((screen.getByTestId('cm-today') as HTMLButtonElement).disabled).toBe(true); // 2026 is now's year
    fireEvent.click(screen.getByTestId('cm-next'));
    expect(onNavigateYear).toHaveBeenCalledWith(2027);
    fireEvent.click(screen.getByTestId('cm-prev'));
    expect(onNavigateYear).toHaveBeenCalledWith(2025);
  });

  it('Today is enabled when viewing a non-current year', () => {
    renderYear({ year: 2027, presence: buildPresence(sampleEvents, cfg, 2027) });
    expect((screen.getByTestId('cm-today') as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('YearCalendar — a11y (AVS §7.2)', () => {
  it('each mini-month is a grid; arrow keys rove within it', () => {
    renderYear();
    const marchGrid = within(screen.getByTestId('cm-year-month-2026-03-01')).getByRole('grid');
    const cell = screen.getByTestId('cm-year-cell-2026-03-14');
    cell.focus();
    fireEvent.keyDown(marchGrid, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByTestId('cm-year-cell-2026-03-15'));
  });

  it('Enter on a dotted day opens its popover', async () => {
    const hydrateDay = vi.fn(() => [allDay('craft', 'Craft', '2026-03-14')]);
    renderYear({ hydrateDay });
    const marchGrid = within(screen.getByTestId('cm-year-month-2026-03-01')).getByRole('grid');
    screen.getByTestId('cm-year-cell-2026-03-14').focus();
    fireEvent.keyDown(marchGrid, { key: 'Enter' });
    await waitFor(() => expect(screen.getByTestId('cm-day-popover')).toBeTruthy());
  });

  it('has no axe violations', async () => {
    const { container } = renderYear();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('YearCalendar — states', () => {
  it('loading renders 12 month outlines (never zero children)', () => {
    renderYear({ status: 'loading' });
    expect(screen.getAllByTestId('cm-loading').length).toBe(12);
  });

  it('invalid displayTimeZone falls into the error state, never throws', () => {
    expect(() => renderYear({ displayTimeZone: 'Not/AZone' })).not.toThrow();
    expect(screen.getByTestId('cm-error')).toBeTruthy();
  });

  it('the presence prop carries no event payloads (cheap contract)', () => {
    const presence = buildPresence(sampleEvents, cfg, 2026);
    expect(JSON.stringify(presence)).not.toMatch(/title|occurrences|location/);
  });
});
