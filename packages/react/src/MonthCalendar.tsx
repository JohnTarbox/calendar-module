import type { ReactNode } from 'react';
import type { CalendarEvent, Occurrence } from '@jonnyboats/calendar-contract';
import { validateConfig } from '@jonnyboats/calendar-contract';
import { addDays, type DayKey, type LayoutCaps } from '@jonnyboats/calendar-core';
import {
  MonthSkin,
  type DayPopoverSlotCtx,
  type EventPopoverSlotCtx,
  type LegendSlotCtx,
} from './CalendarMonth.js';
import { themeToVars, type CalendarTheme, type CalendarWindow } from './theme.js';

/**
 * `MonthCalendar` — the stable, host-facing mount API (the seam a host app codes against).
 *
 * It exposes flat, host-friendly props (`displayTimeZone`, `theme`, `caps`, `window`) and builds
 * the internal `CalendarConfig` via the contract's `validateConfig`, then renders `MonthSkin`.
 * An invalid `displayTimeZone` falls into the existing render guard (the error state) — never a
 * throw or blank page. `now` is host-pinned (SSR-stable); the engine never reads a clock.
 *
 * This is a client component (see the `"use client"` directive injected into the package entry).
 */

export type { CalendarWindow, CalendarTheme } from './theme.js';

export interface MonthCalendarProps {
  events: CalendarEvent[];
  /** IANA. Invalid → the render guard (error state), never a throw/blank. */
  displayTimeZone: string;
  /** Host-pinned ISO at request time — SSR-stable "now". */
  now: string;
  /**
   * The data window the host loaded. When `initialAnchor` is omitted, the displayed month is
   * derived from this window (the grid leads by ≤6 days, so `start + 7d` lands in the month).
   * The component reports the active grid window back via `onNavigate` so the host can refetch.
   */
  window?: CalendarWindow;
  theme?: CalendarTheme;
  caps?: LayoutCaps;
  locale?: string;
  weekStartsOn?: 0 | 1;
  defaultDurationMinutes?: number;
  showWeekNumbers?: boolean;
  initialAnchor?: DayKey;
  status?: 'loading' | 'loaded' | 'error';
  onRetry?: () => void;

  // callbacks
  onNavigate?: (next: { anchor: DayKey; window: { start: DayKey; end: DayKey } }) => void;
  onLegendFilterChange?: (hidden: ReadonlySet<string>) => void;
  onNavigateToDay?: (date: DayKey) => void;
  onExportIcs?: (ics: string, filename: string) => void;

  // render slots (each falls back to the built-in when omitted)
  renderEventPopover?: (ctx: EventPopoverSlotCtx) => ReactNode;
  renderDayPopover?: (ctx: DayPopoverSlotCtx) => ReactNode;
  renderLegend?: (ctx: LegendSlotCtx) => ReactNode;
  renderEventActions?: (event: CalendarEvent, occ: Occurrence) => ReactNode;
}

export function MonthCalendar(props: MonthCalendarProps): ReactNode {
  const result = validateConfig({
    displayTimeZone: props.displayTimeZone,
    locale: props.locale,
    weekStartsOn: props.weekStartsOn,
    defaultDurationMinutes: props.defaultDurationMinutes,
    showWeekNumbers: props.showWeekNumbers,
    categoryColors: props.theme?.categoryColors,
  });

  // Invalid displayTimeZone → error state via the existing guard; substitute a valid UTC config
  // so the grid math (which still runs) never throws.
  const config = result.success && result.data ? result.data : { displayTimeZone: 'UTC' };
  const status = result.success ? (props.status ?? 'loaded') : 'error';
  const initialAnchor = props.initialAnchor ?? (props.window ? addDays(props.window.start, 7) : undefined);

  return (
    <MonthSkin
      events={props.events}
      config={config}
      now={props.now}
      status={status}
      initialAnchor={initialAnchor}
      caps={props.caps}
      themeVars={themeToVars(props.theme)}
      onRetry={props.onRetry}
      onNavigate={props.onNavigate}
      onLegendFilterChange={props.onLegendFilterChange}
      onNavigateToDay={props.onNavigateToDay}
      onExportIcs={props.onExportIcs}
      renderEventActions={props.renderEventActions}
      renderEventPopover={props.renderEventPopover}
      renderDayPopover={props.renderDayPopover}
      renderLegend={props.renderLegend}
    />
  );
}
