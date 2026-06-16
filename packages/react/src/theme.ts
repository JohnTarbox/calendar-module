import type { CSSProperties } from 'react';
import type { DayKey } from '@jonnyboats/calendar-core';

/**
 * Shared host-facing theming + window types for every view skin (Month, Schedule, …). Kept in
 * one place so each mount API maps the same flat `theme` tokens to the calendar's CSS custom
 * properties on the root, and reports/loads the same `{ start, end }` window shape.
 */

/** The data window the host loaded (inclusive). Views report the active window back to refetch. */
export interface CalendarWindow {
  start: DayKey; // inclusive
  end: DayKey; // inclusive
}

/** Flat theme tokens, mapped to the calendar's CSS custom properties on the root. */
export interface CalendarTheme {
  fg?: string;
  muted?: string;
  border?: string;
  today?: string;
  accent?: string;
  bg?: string;
  fontFamily?: string;
  /** category → color; drives the legend swatch, dots, and ribbons. */
  categoryColors?: Record<string, string>;
}

export function themeToVars(theme: CalendarTheme | undefined): CSSProperties | undefined {
  if (!theme) return undefined;
  const vars: Record<string, string> = {};
  if (theme.fg) vars['--cm-fg'] = theme.fg;
  if (theme.muted) vars['--cm-muted'] = theme.muted;
  if (theme.border) vars['--cm-border'] = theme.border;
  if (theme.today) vars['--cm-today'] = theme.today;
  if (theme.accent) vars['--cm-accent'] = theme.accent;
  if (theme.bg) vars['--cm-bg'] = theme.bg;
  if (theme.fontFamily) vars['fontFamily'] = theme.fontFamily;
  return Object.keys(vars).length ? (vars as CSSProperties) : undefined;
}
