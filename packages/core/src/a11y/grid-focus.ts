import type { CalendarGrid } from '../view/month-grid.js';
import type { DayKey } from '../time/day.js';

/**
 * Day-granular roving grid focus (RS §8b). Focus moves cell-to-cell (NOT event-to-event);
 * event-level interaction happens inside the day popover, which is also how a keyboard user
 * reaches events hidden behind "+N more". The core owns this state machine; a skin only applies
 * the `tabindex`/`aria` values it computes and calls `move`/`activate` on key events.
 *
 * Left/right wrap at row ends (moving right off the last cell lands on the next row's first
 * cell, wrapping around the grid); up/down move by a week and clamp at the grid edges.
 */
export interface GridCellAria {
  role: 'gridcell';
  tabIndex: 0 | -1;
  'aria-current'?: 'date';
}

export interface GridFocusApi {
  focusedDate(): DayKey;
  setFocus(date: DayKey): void;
  move(dir: 'up' | 'down' | 'left' | 'right'): DayKey;
  /** Enter/Space on a focused cell opens that day's popover (RS §8b). */
  activate(): { kind: 'openDayPopover'; date: DayKey };
  ariaForCell(date: DayKey): GridCellAria;
}

export function createGridFocus(grid: CalendarGrid, initial?: DayKey): GridFocusApi {
  const flat: DayKey[] = grid.weeks.flatMap((w) => w.cells.map((c) => c.date));
  const total = flat.length;
  const indexOf = (date: DayKey): number => {
    const i = flat.indexOf(date);
    return i === -1 ? 0 : i;
  };
  let focused: DayKey = initial && flat.includes(initial) ? initial : (flat[0] ?? grid.monthStart);

  return {
    focusedDate: () => focused,
    setFocus(date) {
      if (flat.includes(date)) focused = date;
    },
    move(dir) {
      const i = indexOf(focused);
      let next = i;
      switch (dir) {
        case 'left':
          next = (i - 1 + total) % total;
          break;
        case 'right':
          next = (i + 1) % total;
          break;
        case 'up':
          next = i - 7 >= 0 ? i - 7 : i;
          break;
        case 'down':
          next = i + 7 < total ? i + 7 : i;
          break;
      }
      focused = flat[next] ?? focused;
      return focused;
    },
    activate() {
      return { kind: 'openDayPopover', date: focused };
    },
    ariaForCell(date) {
      const aria: GridCellAria = {
        role: 'gridcell',
        tabIndex: date === focused ? 0 : -1,
      };
      if (date === grid.today) aria['aria-current'] = 'date';
      return aria;
    },
  };
}
