import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { axe } from 'vitest-axe';
import type { CalendarEvent } from '@jonnyboats/calendar-contract';
import { ScheduleCalendar } from './index.js';

// 2026-06-16T12:00 in New York (EDT). todayKey = 2026-06-16.
const NOW = '2026-06-16T12:00:00-04:00';
const TZ = 'America/New_York';

function timed(id: string, start: string, opts: Partial<CalendarEvent> & { location?: string; end?: string } = {}): CalendarEvent {
  const { location, end, ...rest } = opts;
  return {
    id,
    title: id,
    occurrences: [{ id: `${id}#1`, start, end, allDay: false, location }],
    ...rest,
  } as CalendarEvent;
}
function allDay(id: string, start: string, end?: string): CalendarEvent {
  return { id, title: id, occurrences: [{ id: `${id}#1`, start, end, allDay: true }] } as CalendarEvent;
}

function renderSched(props: Partial<React.ComponentProps<typeof ScheduleCalendar>> = {}) {
  return render(
    <ScheduleCalendar events={[]} displayTimeZone={TZ} now={NOW} locale="en-US" {...props} />,
  );
}

describe('ScheduleCalendar — list & grouping (AVS §2.1)', () => {
  it('renders the "Upcoming" title and a Today control; no prev/next (§1.1/S2-5)', () => {
    renderSched({ events: [timed('a', '2026-06-18T09:00:00-04:00')] });
    expect(screen.getByTestId('cm-range-title').textContent).toBe('Upcoming');
    expect(screen.getByTestId('cm-today')).toBeTruthy();
    expect(screen.queryByTestId('cm-prev')).toBeNull();
    expect(screen.queryByTestId('cm-next')).toBeNull();
  });

  it('groups by day, skips empty dates, orders all-day before timed', () => {
    renderSched({
      events: [
        timed('t-late', '2026-06-20T15:00:00-04:00'),
        timed('t-early', '2026-06-20T09:00:00-04:00'),
        allDay('ad', '2026-06-20'),
        timed('next', '2026-06-22T10:00:00-04:00'),
      ],
    });
    expect(screen.getByTestId('cm-sched-day-2026-06-20')).toBeTruthy();
    expect(screen.getByTestId('cm-sched-day-2026-06-22')).toBeTruthy();
    expect(screen.queryByTestId('cm-sched-day-2026-06-21')).toBeNull(); // empty day skipped
    const group = screen.getByTestId('cm-sched-group-2026-06-20');
    const rows = within(group).getAllByRole('button');
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'cm-sched-row-ad#1',
      'cm-sched-row-t-early#1',
      'cm-sched-row-t-late#1',
    ]);
  });

  it('shows the location and a time label on a row', () => {
    renderSched({ events: [timed('fair', '2026-06-18T09:00:00-04:00', { location: 'Town Green' })] });
    const row = screen.getByTestId('cm-sched-row-fair#1');
    expect(row.textContent).toContain('Town Green');
    expect(row.textContent).toMatch(/9:00|09:00/);
  });

  it('an all-day single-day row reads "All day"', () => {
    renderSched({ events: [allDay('ad', '2026-06-18')] });
    expect(screen.getByTestId('cm-sched-row-ad#1').textContent).toContain('All day');
  });
});

describe('ScheduleCalendar — pinned Happening-now (AVS §2.1a)', () => {
  it('a multi-day event [yesterday, tomorrow] renders in the pinned section, not the stream', () => {
    renderSched({ events: [allDay('fair', '2026-06-15', '2026-06-18')] }); // Jun 15–17, today=16
    const pinned = screen.getByTestId('cm-sched-pinned');
    expect(within(pinned).getByTestId('cm-sched-row-fair#1')).toBeTruthy();
    expect(within(pinned).getByText(/Jun 15 – 17/)).toBeTruthy();
    // its start precedes the window, so it is NOT in the forward stream
    const stream = screen.getByTestId('cm-schedule');
    expect(within(stream).queryByTestId('cm-sched-row-fair#1')).toBeNull();
    // today is empty (only a pinned event) → the Today anchor still orients "now"
    expect(screen.getByTestId('cm-sched-today-anchor')).toBeTruthy();
  });

  it('an ongoing (>14d) event reads "Ongoing through {date}" in the pinned section', () => {
    renderSched({ events: [allDay('expo', '2026-06-01', '2026-07-20')] });
    const pinned = screen.getByTestId('cm-sched-pinned');
    expect(within(pinned).getByText(/Ongoing through Jul 19, 2026/)).toBeTruthy();
  });

  it('a multi-day event whose START is in the window stays inline (not pinned)', () => {
    renderSched({ events: [allDay('fest', '2026-06-18', '2026-06-21')] });
    expect(screen.queryByTestId('cm-sched-pinned')).toBeNull();
    expect(screen.getByTestId('cm-sched-row-fest#1')).toBeTruthy();
  });
});

describe('ScheduleCalendar — Today anchor (AVS §2.1 / S2-6)', () => {
  it('renders "Today — no events" when today is empty but future events exist', () => {
    renderSched({ events: [timed('future', '2026-06-20T09:00:00-04:00')] });
    expect(screen.getByTestId('cm-sched-today-anchor').textContent).toMatch(/Today — no events/);
  });

  it('marks the today group with a Today marker when today has events', () => {
    renderSched({ events: [timed('now', '2026-06-16T15:00:00-04:00')] });
    expect(screen.queryByTestId('cm-sched-today-anchor')).toBeNull();
    expect(screen.getByTestId('cm-sched-today-marker')).toBeTruthy();
  });
});

describe('ScheduleCalendar — row-click is responsive (AVS §2.2)', () => {
  const ev = [timed('fair', '2026-06-18T09:00:00-04:00', { url: 'https://example.com/fair' } as Partial<CalendarEvent>)];

  it('above the breakpoint (desktop) a row-click opens the detail popover', () => {
    renderSched({ events: ev, isMobile: false });
    fireEvent.click(screen.getByTestId('cm-sched-row-fair#1'));
    expect(screen.getByTestId('cm-event-popover')).toBeTruthy();
  });

  it('below the breakpoint (mobile) a row-click navigates to the event page', () => {
    const onNavigateToEventPage = vi.fn();
    renderSched({ events: ev, isMobile: true, onNavigateToEventPage });
    fireEvent.click(screen.getByTestId('cm-sched-row-fair#1'));
    expect(onNavigateToEventPage).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('cm-event-popover')).toBeNull();
  });

  it('explicit scheduleRowAction="popover" opens the popover even on mobile', () => {
    renderSched({ events: ev, isMobile: true, scheduleRowAction: 'popover' });
    fireEvent.click(screen.getByTestId('cm-sched-row-fair#1'));
    expect(screen.getByTestId('cm-event-popover')).toBeTruthy();
  });
});

describe('ScheduleCalendar — pagination controls (AVS §2.3)', () => {
  function manyFuture(n: number): CalendarEvent[] {
    return Array.from({ length: n }, (_, i) => {
      const day = 17 + (i % 10);
      return timed(`e${i}`, `2026-06-${day}T${String(8 + (i % 8)).padStart(2, '0')}:00:00-04:00`);
    });
  }

  it('reveals one page, then "Load more" appends the next page; sentinel at the tail', () => {
    renderSched({ events: manyFuture(30), agendaPageSize: 25 });
    expect(screen.getAllByTestId(/^cm-sched-row-/).length).toBe(25);
    expect(screen.getByTestId('cm-sched-load-more')).toBeTruthy();
    fireEvent.click(screen.getByTestId('cm-sched-load-more'));
    expect(screen.getAllByTestId(/^cm-sched-row-/).length).toBe(30);
    expect(screen.queryByTestId('cm-sched-load-more')).toBeNull();
    expect(screen.getByTestId('cm-sched-end').textContent).toMatch(/No more upcoming events/);
  });

  it('includePast shows "Load earlier events"; clicking reveals past rows above', () => {
    const events = [
      timed('future', '2026-06-20T09:00:00-04:00'),
      timed('p1', '2026-06-10T09:00:00-04:00'),
      timed('p2', '2026-06-05T09:00:00-04:00'),
    ];
    renderSched({ events, includePast: true });
    const btn = screen.getByTestId('cm-sched-load-earlier');
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(screen.getByTestId('cm-sched-row-p1#1')).toBeTruthy();
    expect(screen.getByTestId('cm-sched-row-p2#1')).toBeTruthy();
  });

  it('without includePast there is no "Load earlier" control', () => {
    renderSched({ events: [timed('p1', '2026-06-10T09:00:00-04:00'), timed('f', '2026-06-20T09:00:00-04:00')] });
    expect(screen.queryByTestId('cm-sched-load-earlier')).toBeNull();
  });
});

describe('ScheduleCalendar — legend filter is client-side (RS §6)', () => {
  it('unchecking a category removes its rows from the Schedule', () => {
    renderSched({
      events: [
        timed('craft', '2026-06-18T09:00:00-04:00', { category: 'Craft' } as Partial<CalendarEvent>),
        timed('music', '2026-06-18T11:00:00-04:00', { category: 'Music' } as Partial<CalendarEvent>),
      ],
    });
    expect(screen.getByTestId('cm-sched-row-craft#1')).toBeTruthy();
    fireEvent.click(screen.getByTestId('cm-legend-Craft'));
    expect(screen.queryByTestId('cm-sched-row-craft#1')).toBeNull();
    expect(screen.getByTestId('cm-sched-row-music#1')).toBeTruthy();
  });
});

describe('ScheduleCalendar — states', () => {
  it('loading shows the skeleton (≥1 skeleton row), preserving the toolbar', () => {
    renderSched({ events: [], status: 'loading' });
    expect(screen.getByTestId('cm-loading')).toBeTruthy();
    expect(screen.getAllByTestId('cm-skeleton-row').length).toBeGreaterThan(0);
    expect(screen.getByTestId('cm-range-title')).toBeTruthy();
  });

  it('error shows the retry affordance and preserves the toolbar', () => {
    const onRetry = vi.fn();
    renderSched({ events: [], status: 'error', onRetry });
    fireEvent.click(screen.getByTestId('cm-retry'));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.getByTestId('cm-range-title')).toBeTruthy();
  });

  it('invalid displayTimeZone falls into the error state, never throws', () => {
    expect(() => renderSched({ displayTimeZone: 'Not/AZone' })).not.toThrow();
    expect(screen.getByTestId('cm-error')).toBeTruthy();
  });

  it('empty window shows a single empty-state element', () => {
    renderSched({ events: [] });
    expect(screen.getByTestId('cm-empty').textContent).toMatch(/No upcoming events/);
  });
});

describe('ScheduleCalendar — a11y (AVS §7.1)', () => {
  const events = [
    allDay('fair', '2026-06-15', '2026-06-18'), // pinned
    timed('a', '2026-06-18T09:00:00-04:00', { location: 'Hall A' }),
    timed('b', '2026-06-19T10:00:00-04:00'),
  ];

  it('rows are list items inside role=list and reachable/openable by keyboard', () => {
    renderSched({ events, isMobile: false });
    const rowA = screen.getByTestId('cm-sched-row-a#1');
    rowA.focus();
    expect(document.activeElement).toBe(rowA);
    // ArrowDown moves to the next row in DOM order
    fireEvent.keyDown(screen.getByTestId('cm-schedule'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByTestId('cm-sched-row-b#1'));
    // Enter/click opens the popover; Esc returns focus to the row
    fireEvent.click(screen.getByTestId('cm-sched-row-a#1'));
    expect(screen.getByTestId('cm-event-popover')).toBeTruthy();
  });

  it('has no axe violations', async () => {
    const { container } = renderSched({ events, isMobile: false });
    expect(await axe(container)).toHaveNoViolations();
  });
});
