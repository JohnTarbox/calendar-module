import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { CalendarConfig, CalendarEvent, Occurrence } from '@jonnyboats/calendar-contract';
import { validateConfig } from '@jonnyboats/calendar-contract';
import {
  buildMonthGrid,
  createGridFocus,
  presentDays,
  presenceCategories,
  bucketDay,
  generateIcs,
  type CalendarGrid,
  type DayKey,
  type PresenceMap,
} from '@jonnyboats/calendar-core';
import { monthName, weekdayShort, dayNumber } from './format.js';
import { FetchError } from './states.js';
import { DayPopover, EventDetailPopover, type DayEntry } from './popovers.js';
import { occurrencesOnDay } from './entries.js';
import type { DayPopoverSlotCtx, EventPopoverSlotCtx, LegendSlotCtx } from './CalendarMonth.js';
import { themeToVars, type CalendarTheme } from './theme.js';

/**
 * Year view (AVS §3) — 12 mini-months over a cheap per-day per-category presence map.
 *
 * The skin renders 12 `buildMonthGrid` grids (Month's day-cell in miniature) and dots a day iff it
 * is in `presentDays(presence, hidden)` — so the client-side legend filter (RS §6) recomputes dots
 * with no refetch (review S1-2). Clicking a **dotted** day hydrates that day's full payload
 * (`hydrateDay`, the windowed 1-day endpoint) and opens the day popover; clicking an **undotted**
 * day opens the "No events on {date}" popover (§3.2). Year ships NO event payloads — only the
 * presence map.
 *
 * a11y is a **grid of grids** (AVS §7.2): each mini-month is a month-title button (one tab stop) +
 * an ARIA grid with internal arrow roving (a second tab stop) — 24 stops, never 2-D roving across
 * the 12-month layout.
 *
 * **Deliberate divergences (record, don't "fix"):** one presence dot per day (Google shows a few)
 * and a neutral/accent dot color, not category color — Year has no room for a per-cell legend
 * (§3.1 / review S3-2).
 */

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export interface YearSkinProps {
  presence: PresenceMap;
  config: CalendarConfig;
  /** Host-pinned ISO at request time — SSR-stable "now" (today-disc). */
  now: string;
  year: number;
  status?: 'loading' | 'loaded' | 'error';
  onRetry?: () => void;
  themeVars?: CSSProperties;
  /** Fetch a day's full events (windowed 1-day range) for the day popover on a dotted-day click. */
  hydrateDay?: (date: DayKey) => CalendarEvent[] | Promise<CalendarEvent[]>;
  onLegendFilterChange?: (hidden: ReadonlySet<string>) => void;
  /** Prev/next/Today — the host refetches the presence map for the new year. */
  onNavigateYear?: (year: number) => void;
  /** Click a month title → Month view anchored to that month. */
  onNavigateToMonth?: (monthAnchor: DayKey) => void;
  /** "View full day →" from the day popover. */
  onNavigateToDay?: (date: DayKey) => void;
  onExportIcs?: (ics: string, filename: string) => void;
  renderEventActions?: (event: CalendarEvent, occ: Occurrence) => ReactNode;
  renderEventPopover?: (ctx: EventPopoverSlotCtx) => ReactNode;
  renderDayPopover?: (ctx: DayPopoverSlotCtx) => ReactNode;
  renderLegend?: (ctx: LegendSlotCtx) => ReactNode;
}

type PopoverState =
  | { kind: 'none' }
  | { kind: 'day'; date: DayKey; entries: DayEntry[] }
  | { kind: 'event'; event: CalendarEvent; occ: Occurrence };

export function YearSkin(props: YearSkinProps): ReactNode {
  const { presence, config, now, year, status = 'loaded', onRetry } = props;

  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [popover, setPopover] = useState<PopoverState>({ kind: 'none' });
  const triggerRef = useRef<HTMLElement | null>(null);

  const categories = useMemo(() => presenceCategories(presence), [presence]);
  const dotted = useMemo(() => presentDays(presence, hidden), [presence, hidden]);
  const grids = useMemo(
    () => MONTHS.map((m) => buildMonthGrid(`${year}-${String(m).padStart(2, '0')}-01`, config, now)),
    [year, config, now],
  );
  const todayYear = Number(bucketDay(now, config.displayTimeZone).slice(0, 4));
  const todayDisabled = year === todayYear;

  function closePopover(): void {
    setPopover({ kind: 'none' });
    triggerRef.current?.focus();
    triggerRef.current = null;
  }
  function toggleCategory(cat: string): void {
    const next = new Set(hidden);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    setHidden(next);
    props.onLegendFilterChange?.(next);
  }
  async function activateDay(date: DayKey, isDotted: boolean, el: HTMLElement): Promise<void> {
    triggerRef.current = el;
    if (!isDotted || !props.hydrateDay) {
      setPopover({ kind: 'day', date, entries: [] });
      return;
    }
    const events = await props.hydrateDay(date);
    setPopover({ kind: 'day', date, entries: occurrencesOnDay(events, date, config) });
  }
  function exportIcs(event: CalendarEvent, _occ: Occurrence): void {
    // Year hydrates the full event before opening its popover, so `event` is the full payload.
    const ics = generateIcs([event], config, { scope: 'event', eventId: event.id });
    const filename = `${event.id}.ics`;
    if (props.onExportIcs) return props.onExportIcs(ics, filename);
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  if (status === 'error') {
    return (
      <div className="cm-root cm-year" data-testid="cm-root" style={props.themeVars}>
        <YearToolbar year={year} todayDisabled={todayDisabled} onNav={props.onNavigateYear} />
        <FetchError onRetry={onRetry} />
      </div>
    );
  }

  return (
    <div className="cm-root cm-year" data-testid="cm-root" style={props.themeVars}>
      <YearToolbar year={year} todayDisabled={todayDisabled} onNav={props.onNavigateYear} />

      {categories.length > 0 &&
        (props.renderLegend ? (
          props.renderLegend({ categories, hidden, toggle: toggleCategory })
        ) : (
          <div className="cm-legend" role="group" aria-label="Filter by category" data-testid="cm-legend">
            {categories.map((cat) => (
              <label key={cat} className="cm-legend-item">
                <input
                  type="checkbox"
                  checked={!hidden.has(cat)}
                  data-testid={`cm-legend-${cat}`}
                  onChange={() => toggleCategory(cat)}
                />
                <span
                  className="cm-dot"
                  data-category={cat}
                  aria-hidden="true"
                  style={config.categoryColors?.[cat] ? { background: config.categoryColors[cat] } : undefined}
                />
                {cat}
              </label>
            ))}
          </div>
        ))}

      <div className="cm-year-grids" data-testid="cm-year-grids">
        {status === 'loading'
          ? MONTHS.map((m) => (
              <div key={m} className="cm-year-month cm-year-skeleton" data-testid="cm-loading" aria-busy="true">
                <div className="cm-year-month-title cm-skeleton-row" data-testid="cm-skeleton-row" />
              </div>
            ))
          : grids.map((grid) => (
              <YearMonth
                key={grid.monthStart}
                grid={grid}
                config={config}
                dotted={dotted}
                onDayActivate={activateDay}
                onMonthTitle={(anchor) => props.onNavigateToMonth?.(anchor)}
              />
            ))}
      </div>

      {popover.kind === 'day' &&
        (props.renderDayPopover ? (
          props.renderDayPopover({
            date: popover.date,
            entries: popover.entries,
            locale: config.locale,
            close: closePopover,
            selectEvent: (entry) => setPopover({ kind: 'event', event: entry.event, occ: entry.occ }),
            viewFullDay: (d) => {
              closePopover();
              props.onNavigateToDay?.(d);
            },
          })
        ) : (
          <DayPopover
            date={popover.date}
            entries={popover.entries}
            locale={config.locale}
            onClose={closePopover}
            onViewFullDay={(d) => {
              closePopover();
              props.onNavigateToDay?.(d);
            }}
            onSelectEvent={(entry) => setPopover({ kind: 'event', event: entry.event, occ: entry.occ })}
          />
        ))}

      {popover.kind === 'event' &&
        (props.renderEventPopover ? (
          props.renderEventPopover({
            event: popover.event,
            occ: popover.occ,
            now,
            close: closePopover,
            addToCalendar: exportIcs,
          })
        ) : (
          <EventDetailPopover
            event={popover.event}
            occ={popover.occ}
            now={now}
            config={config}
            onClose={closePopover}
            onAddToCalendar={exportIcs}
            renderActions={props.renderEventActions}
          />
        ))}
    </div>
  );
}

function YearMonth({
  grid,
  config,
  dotted,
  onDayActivate,
  onMonthTitle,
}: {
  grid: CalendarGrid;
  config: CalendarConfig;
  dotted: ReadonlySet<DayKey>;
  onDayActivate: (date: DayKey, isDotted: boolean, el: HTMLElement) => void;
  onMonthTitle: (monthAnchor: DayKey) => void;
}): ReactNode {
  const title = monthName(grid.year, grid.month, config.locale);
  const headerWeekdays = grid.weeks[0]!.cells.map((c) => c.weekday);
  const initialFocus =
    grid.today && grid.today >= grid.monthStart && grid.weeks.some((w) => w.cells.some((c) => c.date === grid.today))
      ? grid.today
      : grid.monthStart;
  const [focused, setFocused] = useState<DayKey>(initialFocus);

  const cells = useMemo(() => grid.weeks.flatMap((w) => w.cells), [grid]);

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    // Source of truth is the actually-focused cell (robust to however focus arrived), falling
    // back to roving state. createGridFocus computes the next cell within THIS grid only.
    const activeDate = (document.activeElement as HTMLElement | null)?.getAttribute('data-date') ?? undefined;
    const current = activeDate && cells.some((c) => c.date === activeDate) ? activeDate : focused;
    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight': {
        e.preventDefault();
        const dir = e.key.replace('Arrow', '').toLowerCase() as 'up' | 'down' | 'left' | 'right';
        const next = createGridFocus(grid, current).move(dir);
        setFocused(next);
        e.currentTarget.querySelector<HTMLElement>(`[data-date="${next}"]`)?.focus();
        return;
      }
      case 'Enter':
      case ' ': {
        e.preventDefault();
        const cell = cells.find((c) => c.date === current);
        if (cell?.inMonth) {
          const el = e.currentTarget.querySelector<HTMLElement>(`[data-date="${current}"]`) ?? e.currentTarget;
          onDayActivate(current, dotted.has(current), el);
        }
        return;
      }
    }
  }

  return (
    <section className="cm-year-month" data-testid={`cm-year-month-${grid.monthStart}`}>
      <button
        type="button"
        className="cm-year-month-title"
        data-testid={`cm-year-month-title-${grid.monthStart}`}
        onClick={() => onMonthTitle(grid.monthStart)}
      >
        {title}
      </button>
      <div className="cm-year-grid" role="grid" aria-label={title} onKeyDown={onKeyDown}>
        <div className="cm-year-weekdays" role="row">
          {headerWeekdays.map((wd) => (
            <span key={wd} role="columnheader" className="cm-year-weekday">
              {weekdayShort(wd, config.locale)}
            </span>
          ))}
        </div>
        {grid.weeks.map((week, wi) => (
          <div className="cm-year-week" role="row" key={wi}>
            {week.cells.map((cell) => {
              const isDotted = cell.inMonth && dotted.has(cell.date);
              return (
                <div
                  key={cell.date}
                  role="gridcell"
                  data-date={cell.date}
                  data-testid={`cm-year-cell-${cell.date}`}
                  data-dotted={isDotted ? 'true' : undefined}
                  tabIndex={cell.date === focused ? 0 : -1}
                  aria-current={cell.isToday ? 'date' : undefined}
                  className={
                    'cm-year-cell' +
                    (cell.inMonth ? '' : ' cm-muted') +
                    (cell.isToday ? ' cm-today' : '')
                  }
                  onFocus={() => setFocused(cell.date)}
                  onClick={(e) => cell.inMonth && onDayActivate(cell.date, isDotted, e.currentTarget)}
                >
                  <span className="cm-year-daynum">{dayNumber(cell.date)}</span>
                  {isDotted && <span className="cm-year-dot" data-testid={`cm-year-dot-${cell.date}`} aria-hidden="true" />}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

function YearToolbar({
  year,
  todayDisabled,
  onNav,
}: {
  year: number;
  todayDisabled: boolean;
  onNav?: (year: number) => void;
}): ReactNode {
  return (
    <div className="cm-toolbar" role="toolbar" aria-label="Year navigation">
      <button
        type="button"
        className="cm-today"
        data-testid="cm-today"
        disabled={todayDisabled}
        onClick={() => onNav?.(year)}
      >
        Today
      </button>
      <button type="button" className="cm-prev" data-testid="cm-prev" aria-label="Previous year" onClick={() => onNav?.(year - 1)}>
        ‹
      </button>
      <button type="button" className="cm-next" data-testid="cm-next" aria-label="Next year" onClick={() => onNav?.(year + 1)}>
        ›
      </button>
      <h1 className="cm-range-title" data-testid="cm-range-title">
        {year}
      </h1>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Host-facing mount API (flat props), mirroring `MonthCalendar`.
 * ------------------------------------------------------------------ */

export interface YearCalendarProps {
  /** Per-day per-category presence map for the year (from GET /events/presence?year=). */
  presence: PresenceMap;
  /** IANA. Invalid → the render guard (error state), never a throw/blank. */
  displayTimeZone: string;
  /** Host-pinned ISO at request time — SSR-stable today-disc. */
  now: string;
  year: number;
  theme?: CalendarTheme;
  locale?: string;
  weekStartsOn?: 0 | 1;
  defaultDurationMinutes?: number;
  status?: 'loading' | 'loaded' | 'error';
  onRetry?: () => void;
  hydrateDay?: (date: DayKey) => CalendarEvent[] | Promise<CalendarEvent[]>;
  onLegendFilterChange?: (hidden: ReadonlySet<string>) => void;
  onNavigateYear?: (year: number) => void;
  onNavigateToMonth?: (monthAnchor: DayKey) => void;
  onNavigateToDay?: (date: DayKey) => void;
  onExportIcs?: (ics: string, filename: string) => void;
  renderEventActions?: (event: CalendarEvent, occ: Occurrence) => ReactNode;
  renderEventPopover?: (ctx: EventPopoverSlotCtx) => ReactNode;
  renderDayPopover?: (ctx: DayPopoverSlotCtx) => ReactNode;
  renderLegend?: (ctx: LegendSlotCtx) => ReactNode;
}

export function YearCalendar(props: YearCalendarProps): ReactNode {
  const result = validateConfig({
    displayTimeZone: props.displayTimeZone,
    locale: props.locale,
    weekStartsOn: props.weekStartsOn,
    defaultDurationMinutes: props.defaultDurationMinutes,
    categoryColors: props.theme?.categoryColors,
  });
  const config = result.success && result.data ? result.data : { displayTimeZone: 'UTC' };
  const status = result.success ? (props.status ?? 'loaded') : 'error';

  return (
    <YearSkin
      presence={props.presence}
      config={config}
      now={props.now}
      year={props.year}
      status={status}
      themeVars={themeToVars(props.theme)}
      onRetry={props.onRetry}
      hydrateDay={props.hydrateDay}
      onLegendFilterChange={props.onLegendFilterChange}
      onNavigateYear={props.onNavigateYear}
      onNavigateToMonth={props.onNavigateToMonth}
      onNavigateToDay={props.onNavigateToDay}
      onExportIcs={props.onExportIcs}
      renderEventActions={props.renderEventActions}
      renderEventPopover={props.renderEventPopover}
      renderDayPopover={props.renderDayPopover}
      renderLegend={props.renderLegend}
    />
  );
}
