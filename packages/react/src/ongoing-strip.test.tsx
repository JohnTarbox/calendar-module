import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { CalendarEvent } from '@jonnyboats/calendar-contract';
import { MonthCalendar } from './MonthCalendar.js';

const NOW = '2026-06-15T12:00:00-04:00';

// A months-long event → renders as an "Ongoing through {date}" strip (RS §11).
const events: CalendarEvent[] = [
  {
    id: 'trivia',
    title: 'Weekly Trivia Night',
    occurrences: [{ id: 'trivia-1', start: '2026-06-01', end: '2026-12-20', allDay: true }],
  },
];

describe('ongoing strip — human-readable through-date', () => {
  it('formats the through-date (not raw ISO)', () => {
    render(<MonthCalendar events={events} displayTimeZone="America/New_York" now={NOW} locale="en-US" />);
    const band = screen.getByTestId('cm-ongoing-band');
    // end 2026-12-20 (exclusive) → through Dec 19, 2026
    expect(within(band).getByText(/Ongoing through Dec 19, 2026: Weekly Trivia Night/)).toBeTruthy();
    expect(band.textContent).not.toContain('2026-12-19'); // no raw ISO
  });
});
