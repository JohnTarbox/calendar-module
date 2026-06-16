import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { axe } from 'vitest-axe';
import type { CalendarEvent } from '@jonnyboats/calendar-contract';
import { TimeGridCalendar } from './index.js';

const NOW = '2026-06-16T12:00:00-04:00'; // Tue Jun 16, noon EDT
const TZ = 'America/New_York';

function timed(id: string, start: string, end?: string, extra: Partial<CalendarEvent> = {}): CalendarEvent {
  return { id, title: id, occurrences: [{ id: `${id}#1`, start, end, allDay: false }], ...extra } as CalendarEvent;
}
function allDay(id: string, start: string, end?: string): CalendarEvent {
  return { id, title: id, occurrences: [{ id: `${id}#1`, start, end, allDay: true }] } as CalendarEvent;
}

function renderTG(props: Partial<React.ComponentProps<typeof TimeGridCalendar>> = {}) {
  return render(
    <TimeGridCalendar events={[]} displayTimeZone={TZ} now={NOW} view="week" anchor="2026-06-16" locale="en-US" {...props} />,
  );
}

describe('TimeGridCalendar — structure & range (AVS §4)', () => {
  it('Week renders 7 day-column headers + the week range title', () => {
    renderTG();
    for (const d of ['14', '15', '16', '20']) {
      expect(screen.getByTestId(`cm-tg-header-2026-06-${d}`)).toBeTruthy();
    }
    expect(screen.getByTestId('cm-range-title').textContent).toMatch(/Jun 14 – 20, 2026/);
  });

  it('Day renders a single column and the long-date title', () => {
    renderTG({ view: 'day' });
    expect(screen.getByTestId('cm-tg-header-2026-06-16')).toBeTruthy();
    expect(screen.queryByTestId('cm-tg-header-2026-06-17')).toBeNull();
    expect(screen.getByTestId('cm-range-title').textContent).toMatch(/Tuesday, June 16, 2026/);
  });
});

describe('TimeGridCalendar — timed blocks & collision (§6)', () => {
  it('a single-day timed event is a positioned block in its day column', () => {
    renderTG({ view: 'day', events: [timed('a', '2026-06-16T09:00:00-04:00', '2026-06-16T10:30:00-04:00')] });
    const block = screen.getByTestId('cm-tg-block-a#1@2026-06-16');
    expect(block).toBeTruthy();
    expect(block.getAttribute('style')).toMatch(/width:\s*100%/); // solitary → full width
  });

  it('two overlapping events split the column 50/50', () => {
    renderTG({
      view: 'day',
      events: [
        timed('a', '2026-06-16T09:00:00-04:00', '2026-06-16T11:00:00-04:00'),
        timed('b', '2026-06-16T10:00:00-04:00', '2026-06-16T12:00:00-04:00'),
      ],
    });
    const a = screen.getByTestId('cm-tg-block-a#1@2026-06-16');
    const b = screen.getByTestId('cm-tg-block-b#1@2026-06-16');
    expect(a.getAttribute('style')).toMatch(/width:\s*50%/);
    expect(b.getAttribute('style')).toMatch(/width:\s*50%/);
  });

  it('clicking a block opens the detail popover', () => {
    renderTG({ view: 'day', events: [timed('a', '2026-06-16T09:00:00-04:00')] });
    fireEvent.click(screen.getByTestId('cm-tg-block-a#1@2026-06-16'));
    expect(screen.getByTestId('cm-event-popover')).toBeTruthy();
  });
});

describe('TimeGridCalendar — cross-midnight (§4.3)', () => {
  it('a 23:30→00:30 occurrence renders a clamped block in BOTH days', () => {
    renderTG({
      view: 'week',
      events: [timed('night', '2026-06-16T23:30:00-04:00', '2026-06-17T00:30:00-04:00')],
    });
    expect(screen.getByTestId('cm-tg-block-night#1@2026-06-16')).toBeTruthy();
    expect(screen.getByTestId('cm-tg-block-night#1@2026-06-17')).toBeTruthy();
  });
});

describe('TimeGridCalendar — all-day strip & ongoing band (§4.1)', () => {
  it('a 3-day all-day event is one ribbon across columns, not 3 blocks', () => {
    renderTG({ events: [allDay('fest', '2026-06-17', '2026-06-20')] }); // Wed–Fri
    const ribbon = screen.getByTestId('cm-tg-ribbon-fest#1');
    expect(ribbon.getAttribute('style')).toMatch(/grid-column:\s*4\s*\/\s*7/); // Wed(col4)→Fri(col6) end-exclusive
  });

  it('a multi-day timed event (>24h) is a strip ribbon, not an hour block', () => {
    renderTG({ events: [timed('t', '2026-06-15T09:00:00-04:00', '2026-06-17T17:00:00-04:00')] });
    expect(screen.getByTestId('cm-tg-ribbon-t#1')).toBeTruthy();
    expect(screen.queryByTestId('cm-tg-block-t#1@2026-06-16')).toBeNull();
  });

  it('an ongoing (>14d) event is a clickable band above the grid (a focus stop)', () => {
    renderTG({ events: [allDay('og', '2026-06-01', '2026-07-01')] });
    const band = screen.getByTestId('cm-ongoing-band');
    const btn = within(band).getByTestId('cm-ongoing-og#1');
    fireEvent.click(btn);
    expect(screen.getByTestId('cm-event-popover')).toBeTruthy();
  });

  it('+N more expands the strip when lanes overflow', () => {
    const events = [
      allDay('a', '2026-06-14', '2026-06-21'),
      allDay('b', '2026-06-14', '2026-06-21'),
      allDay('c', '2026-06-14', '2026-06-21'),
      allDay('d', '2026-06-14', '2026-06-21'),
    ];
    renderTG({ events, maxStripLanes: 2 });
    expect(screen.getByTestId('cm-tg-more-2026-06-16')).toBeTruthy();
    fireEvent.click(screen.getByTestId('cm-tg-more-2026-06-16'));
    // after expand, all four ribbons are visible and the +N is gone
    expect(screen.getByTestId('cm-tg-ribbon-d#1')).toBeTruthy();
    expect(screen.queryByTestId('cm-tg-more-2026-06-16')).toBeNull();
  });
});

describe('TimeGridCalendar — now-line (§4.4)', () => {
  it('renders on today’s column when today is visible', () => {
    renderTG();
    expect(screen.getByTestId('cm-tg-nowline-2026-06-16')).toBeTruthy();
    expect(screen.queryByTestId('cm-tg-nowline-2026-06-15')).toBeNull(); // only today
  });

  it('is absent when today is not in the visible range', () => {
    renderTG({ anchor: '2026-07-15' }); // a week with no "today"
    expect(screen.queryByTestId('cm-tg-nowline-2026-06-16')).toBeNull();
    expect(screen.queryByTestId(/cm-tg-nowline-/)).toBeNull();
  });
});

describe('TimeGridCalendar — navigation', () => {
  it('next moves the week by exactly 7 days (contiguous)', () => {
    const onNavigate = vi.fn();
    renderTG({ onNavigate });
    fireEvent.click(screen.getByTestId('cm-next'));
    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ anchor: '2026-06-21' }));
  });

  it('Day next moves by 1 day', () => {
    const onNavigate = vi.fn();
    renderTG({ view: 'day', onNavigate });
    fireEvent.click(screen.getByTestId('cm-next'));
    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ anchor: '2026-06-17' }));
  });

  it('a day-column header click navigates to that Day', () => {
    const onNavigateToDay = vi.fn();
    renderTG({ onNavigateToDay });
    fireEvent.click(screen.getByTestId('cm-tg-header-2026-06-18'));
    expect(onNavigateToDay).toHaveBeenCalledWith('2026-06-18');
  });
});

describe('TimeGridCalendar — a11y (AVS §7.3)', () => {
  const events = [
    allDay('og', '2026-06-01', '2026-07-01'),
    allDay('fest', '2026-06-17', '2026-06-20'),
    timed('a', '2026-06-16T09:00:00-04:00', '2026-06-16T10:00:00-04:00'),
  ];

  it('column headers, ribbons, band, and blocks are all keyboard-focusable buttons', () => {
    renderTG({ events });
    for (const id of ['cm-tg-header-2026-06-16', 'cm-ongoing-og#1', 'cm-tg-ribbon-fest#1', 'cm-tg-block-a#1@2026-06-16']) {
      const el = screen.getByTestId(id);
      el.focus();
      expect(document.activeElement).toBe(el);
    }
  });

  it('Arrow Right moves focus between day-column headers', () => {
    renderTG({ events });
    const headerRow = screen.getByTestId('cm-tg-headers');
    screen.getByTestId('cm-tg-header-2026-06-16').focus();
    fireEvent.keyDown(headerRow, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByTestId('cm-tg-header-2026-06-17'));
  });

  it('Esc from the popover returns focus to the block that opened it', () => {
    renderTG({ view: 'day', events });
    const block = screen.getByTestId('cm-tg-block-a#1@2026-06-16');
    fireEvent.click(block);
    const popover = screen.getByTestId('cm-event-popover');
    fireEvent.keyDown(popover, { key: 'Escape' });
    expect(document.activeElement).toBe(block);
  });

  it('has no axe violations', async () => {
    const { container } = renderTG({ events });
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('TimeGridCalendar — Custom N-day view (AVS §5, v2-b)', () => {
  it('defaults to a 4-day range', () => {
    renderTG({ view: 'custom' });
    expect(screen.getByTestId('cm-tg-header-2026-06-16')).toBeTruthy();
    expect(screen.getByTestId('cm-tg-header-2026-06-19')).toBeTruthy();
    expect(screen.queryByTestId('cm-tg-header-2026-06-20')).toBeNull();
    expect(screen.getByTestId('cm-range-title').textContent).toMatch(/Jun 16 – 19, 2026/);
  });

  it('honors customViewDays (2–7)', () => {
    renderTG({ view: 'custom', customViewDays: 3 });
    expect(screen.getByTestId('cm-tg-header-2026-06-18')).toBeTruthy();
    expect(screen.queryByTestId('cm-tg-header-2026-06-19')).toBeNull();
  });

  it('[AC] prev/next move by exactly N days → contiguous, non-overlapping ranges', () => {
    const onNavigate = vi.fn();
    renderTG({ view: 'custom', customViewDays: 4, onNavigate });
    fireEvent.click(screen.getByTestId('cm-next'));
    // anchor 2026-06-16 + 4 days = 2026-06-20 (the day after the last visible day, 06-19)
    expect(onNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ anchor: '2026-06-20', days: ['2026-06-20', '2026-06-21', '2026-06-22', '2026-06-23'] }),
    );
  });

  it('reuses the time-grid: a timed block renders in a custom column', () => {
    renderTG({ view: 'custom', events: [timed('a', '2026-06-17T09:00:00-04:00')] });
    expect(screen.getByTestId('cm-tg-block-a#1@2026-06-17')).toBeTruthy();
  });
});

describe('TimeGridCalendar — states', () => {
  it('invalid displayTimeZone → error state, never throws', () => {
    expect(() => renderTG({ displayTimeZone: 'Not/AZone' })).not.toThrow();
    expect(screen.getByTestId('cm-error')).toBeTruthy();
  });
});
