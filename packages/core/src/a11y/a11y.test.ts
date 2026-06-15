import { describe, it, expect } from 'vitest';
import type { CalendarConfig } from '@jonnyboats/calendar-contract';
import { buildMonthGrid } from '../view/month-grid.js';
import { createGridFocus } from './grid-focus.js';
import { createPopoverFocus } from './popover-focus.js';
import { resolveKey } from './keyboard.js';

const cfg: CalendarConfig = { displayTimeZone: 'America/New_York' };
const grid = buildMonthGrid('2026-06-14', cfg, '2026-06-14T12:00:00-04:00');

describe('grid focus — day-granular roving (RS §8b)', () => {
  it('moves cell-to-cell and wraps at row ends', () => {
    const f = createGridFocus(grid, grid.weeks[0]!.cells[6]!.date); // last cell of row 0
    const next = f.move('right'); // wraps to first cell of row 1
    expect(next).toBe(grid.weeks[1]!.cells[0]!.date);
    const back = f.move('left');
    expect(back).toBe(grid.weeks[0]!.cells[6]!.date);
  });

  it('up/down move by a week and clamp at the grid edges', () => {
    const f = createGridFocus(grid, grid.weeks[0]!.cells[3]!.date);
    expect(f.move('up')).toBe(grid.weeks[0]!.cells[3]!.date); // clamped (already top)
    expect(f.move('down')).toBe(grid.weeks[1]!.cells[3]!.date);
  });

  it('activate opens the focused day popover; aria marks today + focus', () => {
    const f = createGridFocus(grid, '2026-06-14');
    expect(f.activate()).toEqual({ kind: 'openDayPopover', date: '2026-06-14' });
    expect(f.ariaForCell('2026-06-14')).toMatchObject({ role: 'gridcell', tabIndex: 0, 'aria-current': 'date' });
    expect(f.ariaForCell('2026-06-15').tabIndex).toBe(-1);
  });
});

describe('popover focus-trap (RS §5a/§8b)', () => {
  it('Escape closes and returns focus to the trigger', () => {
    const p = createPopoverFocus();
    p.open('trigger-1', ['close-btn', 'link-a', 'fav']);
    expect(p.isOpen()).toBe(true);
    const action = p.onKey('Escape');
    expect(action.closed).toBe(true);
    expect(action.focus).toBe('trigger-1');
    expect(p.isOpen()).toBe(false);
  });

  it('Tab / Shift+Tab cycle the focusables', () => {
    const p = createPopoverFocus();
    p.open('t', ['a', 'b', 'c']);
    expect(p.onKey('Tab').focus).toBe('b');
    expect(p.onKey('Tab').focus).toBe('c');
    expect(p.onKey('Tab').focus).toBe('a'); // wraps
    expect(p.onKey('Shift+Tab').focus).toBe('c');
  });
});

describe('keyboard map (RS §8a)', () => {
  it('maps navigation + view intents; p/k is the module-convention previous', () => {
    expect(resolveKey('j', 'v0')).toEqual({ kind: 'nav', dir: 'next' });
    expect(resolveKey('p', 'v0')).toEqual({ kind: 'nav', dir: 'prev' });
    expect(resolveKey('k', 'v0')).toEqual({ kind: 'nav', dir: 'prev' });
    expect(resolveKey('t', 'v0')).toEqual({ kind: 'nav', dir: 'today' });
    expect(resolveKey('m', 'v0')).toEqual({ kind: 'switchView', view: 'month' });
  });

  it('x/4 Custom and other non-existent views are inert in v0; available in v2', () => {
    expect(resolveKey('x', 'v0')).toEqual({ kind: 'inert' });
    expect(resolveKey('4', 'v0')).toEqual({ kind: 'inert' });
    expect(resolveKey('w', 'v0')).toEqual({ kind: 'inert' }); // Week not in v0
    expect(resolveKey('x', 'v2')).toEqual({ kind: 'switchView', view: 'custom' });
  });

  it('authoring keys are inert', () => {
    expect(resolveKey('c', 'v2')).toEqual({ kind: 'inert' });
    expect(resolveKey('z', 'v2')).toEqual({ kind: 'inert' });
  });
});
