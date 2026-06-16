import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { CalendarConfig, CalendarEvent, Occurrence } from '@jonnyboats/calendar-contract';
import {
  buildMonthGrid,
  packMonth,
  resolveKey,
  createGridFocus,
  isTodayInView,
  nextMonth,
  prevMonth,
  todayMonthAnchor,
  generateIcs,
  type DayKey,
  type LayoutCaps,
} from '@jonnyboats/calendar-core';
import { dayNumber, formatDayMedium, monthTitle, weekdayShort } from './format.js';
import { EmptyWindow, FetchError, MonthSkeleton } from './states.js';
import { DayPopover, EventDetailPopover, type DayEntry } from './popovers.js';
import { occurrencesOnDay } from './entries.js';

/** Render-slot contexts — each slot receives the same data its built-in default would. */
export interface EventPopoverSlotCtx {
  event: CalendarEvent;
  occ: Occurrence;
  now: string;
  close: () => void;
  addToCalendar: (event: CalendarEvent, occ: Occurrence) => void;
}
export interface DayPopoverSlotCtx {
  date: DayKey;
  entries: DayEntry[];
  locale: string | undefined;
  close: () => void;
  selectEvent: (entry: DayEntry) => void;
  viewFullDay: (date: DayKey) => void;
}
export interface LegendSlotCtx {
  categories: string[];
  hidden: ReadonlySet<string>;
  toggle: (category: string) => void;
}

/**
 * `MonthSkin` — the internal Month renderer (config-based API). The public, host-facing mount
 * API is `MonthCalendar` (see `MonthCalendar.tsx`), which builds the `CalendarConfig` from flat
 * props. `CalendarMonth` is kept as a deprecated alias of this for one major (the worker uses it).
 */
export interface MonthSkinProps {
  events: CalendarEvent[];
  config: CalendarConfig;
  /** ISO string the host pins at request time — keeps "today" stable across the SSR boundary. */
  now: string;
  initialAnchor?: DayKey;
  caps?: LayoutCaps;
  status?: 'loading' | 'loaded' | 'error';
  onRetry?: () => void;
  /** CSS custom properties (theme tokens) applied to the calendar root. */
  themeVars?: CSSProperties;
  /** Date-number click target (Day view in the full app; v0 falls through to the day popover). */
  onNavigateToDay?: (date: DayKey) => void;
  /** Host action slot (e.g. MMATF heart) rendered in the detail popover. */
  renderEventActions?: (event: CalendarEvent, occ: Occurrence) => ReactNode;
  /** Receives the generated .ics; defaults to a browser download. */
  onExportIcs?: (ics: string, filename: string) => void;
  /** Fired when the visible period changes (next/prev/today/jump). */
  onNavigate?: (next: { anchor: DayKey; window: { start: DayKey; end: DayKey } }) => void;
  /** Fired when the category-visibility set changes. */
  onLegendFilterChange?: (hidden: ReadonlySet<string>) => void;
  /** Render-slot overrides; each falls back to the built-in when omitted. */
  renderEventPopover?: (ctx: EventPopoverSlotCtx) => ReactNode;
  renderDayPopover?: (ctx: DayPopoverSlotCtx) => ReactNode;
  renderLegend?: (ctx: LegendSlotCtx) => ReactNode;
}

const DEFAULT_CAPS: LayoutCaps = { cellHeight: 120, headerHeight: 24, rowHeight: 24 };

type PopoverState =
  | { kind: 'none' }
  | { kind: 'event'; eventId: string; occId: string }
  | { kind: 'day'; date: DayKey };

export function MonthSkin(props: MonthSkinProps): ReactNode {
  const { events, config, now, status = 'loaded', onRetry, onNavigateToDay, renderEventActions } = props;
  const caps = props.caps ?? DEFAULT_CAPS;

  const [anchor, setAnchor] = useState<DayKey>(props.initialAnchor ?? todayMonthAnchor(now, config));
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [focused, setFocused] = useState<DayKey | null>(null);
  const [popover, setPopover] = useState<PopoverState>({ kind: 'none' });
  const triggerRef = useRef<HTMLElement | null>(null);

  const grid = useMemo(() => buildMonthGrid(anchor, config, now), [anchor, config, now]);
  const visibleEvents = useMemo(
    () => events.filter((e) => e.category === undefined || !hidden.has(e.category)),
    [events, hidden],
  );
  const layout = useMemo(() => packMonth(visibleEvents, grid, config, caps), [visibleEvents, grid, config, caps]);

  const focusedDate = focused ?? grid.today ?? grid.monthStart;
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const e of events) if (e.category) set.add(e.category);
    return [...set].sort();
  }, [events]);
  const categoryByEvent = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of events) if (e.category) m.set(e.id, e.category);
    return m;
  }, [events]);

  const catColor = (cat: string | undefined): string | undefined =>
    cat ? config.categoryColors?.[cat] : undefined;
  const eventColor = (eventId: string): string | undefined => catColor(categoryByEvent.get(eventId));

  function windowForAnchor(a: DayKey): { start: DayKey; end: DayKey } {
    const g = buildMonthGrid(a, config, now);
    const lastW = g.weeks[g.weeks.length - 1]!;
    return { start: g.weeks[0]!.cells[0]!.date, end: lastW.cells[lastW.cells.length - 1]!.date };
  }
  function navigate(nextAnchor: DayKey): void {
    setAnchor(nextAnchor);
    props.onNavigate?.({ anchor: nextAnchor, window: windowForAnchor(nextAnchor) });
  }
  function toggleCategory(cat: string): void {
    const nextSet = new Set(hidden);
    if (nextSet.has(cat)) nextSet.delete(cat);
    else nextSet.add(cat);
    setHidden(nextSet);
    props.onLegendFilterChange?.(nextSet);
  }

  function openTrigger(el: HTMLElement): void {
    triggerRef.current = el;
  }
  function closePopover(): void {
    setPopover({ kind: 'none' });
    triggerRef.current?.focus();
    triggerRef.current = null;
  }
  function openEvent(eventId: string, occId: string, el: HTMLElement): void {
    openTrigger(el);
    setPopover({ kind: 'event', eventId, occId });
  }
  function openDay(date: DayKey, el: HTMLElement): void {
    openTrigger(el);
    setPopover({ kind: 'day', date });
  }

  function moveFocus(dir: 'up' | 'down' | 'left' | 'right'): void {
    setFocused(createGridFocus(grid, focusedDate).move(dir));
  }

  function onGridKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        return moveFocus('up');
      case 'ArrowDown':
        e.preventDefault();
        return moveFocus('down');
      case 'ArrowLeft':
        e.preventDefault();
        return moveFocus('left');
      case 'ArrowRight':
        e.preventDefault();
        return moveFocus('right');
      case 'Enter':
      case ' ':
        e.preventDefault();
        openDay(focusedDate, e.currentTarget.querySelector<HTMLElement>(`[data-date="${focusedDate}"]`) ?? e.currentTarget);
        return;
    }
    const intent = resolveKey(e.key, 'v0');
    if (intent.kind === 'nav') {
      e.preventDefault();
      if (intent.dir === 'next') navigate(nextMonth(anchor));
      else if (intent.dir === 'prev') navigate(prevMonth(anchor));
      else navigate(todayMonthAnchor(now, config));
    }
  }

  function exportIcs(event: CalendarEvent, _occ: Occurrence): void {
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

  if (status === 'loading') {
    return (
      <div className="cm-root" data-testid="cm-root" style={props.themeVars}>
        <Toolbar {...{ layout, config, anchor, now, navigate }} />
        <MonthSkeleton />
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="cm-root" data-testid="cm-root" style={props.themeVars}>
        <Toolbar {...{ layout, config, anchor, now, navigate }} />
        <FetchError onRetry={onRetry} />
      </div>
    );
  }

  const hasAnyEvents = layout.rows.some((r) => r.ribbons.length || r.timed.length) || layout.ongoingStrips.length > 0;
  const selectedEvent =
    popover.kind === 'event' ? events.find((e) => e.id === popover.eventId) : undefined;
  const selectedOcc = selectedEvent?.occurrences.find((o) => o.id === (popover as { occId: string }).occId);
  const dayEntries = popover.kind === 'day' ? occurrencesOnDay(events, popover.date, config) : [];

  return (
    <div className="cm-root" data-testid="cm-root" style={props.themeVars}>
      <Toolbar {...{ layout, config, anchor, now, navigate }} />

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
                  style={catColor(cat) ? { background: catColor(cat) } : undefined}
                />
                {cat}
              </label>
            ))}
          </div>
        ))}

      {layout.ongoingStrips.length > 0 && (
        <ul className="cm-ongoing-band" data-testid="cm-ongoing-band">
          {layout.ongoingStrips.map((s) => (
            <li key={s.occurrenceId}>
              <button
                type="button"
                className="cm-ongoing-strip"
                tabIndex={-1}
                style={eventColor(s.eventId) ? { background: eventColor(s.eventId) } : undefined}
                onClick={(e) => openEvent(s.eventId, s.occurrenceId, e.currentTarget)}
              >
                Ongoing through {formatDayMedium(s.throughDate, config.locale)}: {s.title}
              </button>
            </li>
          ))}
        </ul>
      )}

      {!hasAnyEvents && <EmptyWindow />}

      <div
        className="cm-grid"
        role="grid"
        aria-label={monthTitle(layout.year, layout.month, config.locale)}
        data-testid="cm-grid"
        onKeyDown={onGridKeyDown}
      >
        <div className="cm-weekdays" role="row">
          {layout.weekdayOrder.map((wd) => (
            <span key={wd} role="columnheader" className="cm-weekday">
              {weekdayShort(wd, config.locale)}
            </span>
          ))}
        </div>

        {layout.rows.map((row) => (
          <div className="cm-week" role="row" key={row.weekIndex}>
            {row.cells.map((cell) => {
              const isFocused = cell.date === focusedDate;
              const cellRibbons = row.ribbons.filter((r) => r.visible && r.startColumn === cell.column);
              const cellTimed = row.timed.filter((t) => t.visible && t.column === cell.column);
              return (
                <div
                  key={cell.date}
                  role="gridcell"
                  data-date={cell.date}
                  data-testid={`cm-cell-${cell.date}`}
                  tabIndex={isFocused ? 0 : -1}
                  aria-current={cell.isToday ? 'date' : undefined}
                  className={
                    'cm-cell' + (cell.inMonth ? '' : ' cm-muted') + (cell.isToday ? ' cm-today' : '')
                  }
                  onClick={(e) => openDay(cell.date, e.currentTarget)}
                >
                  <button
                    type="button"
                    className="cm-date-number"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onNavigateToDay) onNavigateToDay(cell.date);
                      else openDay(cell.date, e.currentTarget);
                    }}
                  >
                    {dayNumber(cell.date)}
                  </button>

                  {cellRibbons.map((r) => (
                    <button
                      key={r.occurrenceId}
                      type="button"
                      className={'cm-ribbon' + (r.continuesLeft ? ' cm-clip-left' : '') + (r.continuesRight ? ' cm-clip-right' : '')}
                      data-testid="cm-ribbon"
                      tabIndex={-1}
                      style={{
                        ['--cm-span' as string]: r.endColumn - r.startColumn + 1,
                        ...(eventColor(r.eventId) ? { background: eventColor(r.eventId) } : {}),
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        openEvent(r.eventId, r.occurrenceId, e.currentTarget);
                      }}
                    >
                      {r.title}
                    </button>
                  ))}

                  {cellTimed.map((t) => (
                    <button
                      key={t.occurrenceId}
                      type="button"
                      className="cm-timed"
                      data-testid="cm-timed"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.stopPropagation();
                        openEvent(t.eventId, t.occurrenceId, e.currentTarget);
                      }}
                    >
                      <span
                        className="cm-dot"
                        aria-hidden="true"
                        style={eventColor(t.eventId) ? { background: eventColor(t.eventId) } : undefined}
                      />
                      {t.timeLabel && <span className="cm-timed-time">{t.timeLabel}</span>}
                      <span className="cm-timed-title">{t.title}</span>
                    </button>
                  ))}

                  {cell.overflowCount > 0 && (
                    <button
                      type="button"
                      className="cm-more"
                      data-testid={`cm-more-${cell.date}`}
                      tabIndex={-1}
                      onClick={(e) => {
                        e.stopPropagation();
                        openDay(cell.date, e.currentTarget);
                      }}
                    >
                      +{cell.overflowCount} more
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {popover.kind === 'event' &&
        selectedEvent &&
        selectedOcc &&
        (props.renderEventPopover ? (
          props.renderEventPopover({
            event: selectedEvent,
            occ: selectedOcc,
            now,
            close: closePopover,
            addToCalendar: exportIcs,
          })
        ) : (
          <EventDetailPopover
            event={selectedEvent}
            occ={selectedOcc}
            now={now}
            config={config}
            onClose={closePopover}
            onAddToCalendar={exportIcs}
            renderActions={renderEventActions}
          />
        ))}

      {popover.kind === 'day' &&
        (props.renderDayPopover ? (
          props.renderDayPopover({
            date: popover.date,
            entries: dayEntries,
            locale: config.locale,
            close: closePopover,
            selectEvent: (entry) => setPopover({ kind: 'event', eventId: entry.event.id, occId: entry.occ.id }),
            viewFullDay: (d) => {
              closePopover();
              onNavigateToDay?.(d);
            },
          })
        ) : (
          <DayPopover
            date={popover.date}
            entries={dayEntries}
            locale={config.locale}
            onClose={closePopover}
            onViewFullDay={(d) => {
              closePopover();
              onNavigateToDay?.(d);
            }}
            onSelectEvent={(entry) => setPopover({ kind: 'event', eventId: entry.event.id, occId: entry.occ.id })}
          />
        ))}
    </div>
  );
}

/**
 * @deprecated Use `MonthCalendar` (the flat-prop, host-facing mount API). Kept one major as a
 * config-based alias so existing consumers (the demo worker) don't break.
 */
export const CalendarMonth = MonthSkin;
/** @deprecated Alias of {@link MonthSkinProps}. */
export type CalendarMonthProps = MonthSkinProps;

function Toolbar({
  layout,
  config,
  anchor,
  now,
  navigate,
}: {
  layout: { year: number; month: number };
  config: CalendarConfig;
  anchor: DayKey;
  now: string;
  navigate: (a: DayKey) => void;
}): ReactNode {
  const todayDisabled = isTodayInView(anchor, now, config);
  return (
    <div className="cm-toolbar" role="toolbar" aria-label="Calendar navigation">
      <button
        type="button"
        className="cm-today"
        data-testid="cm-today"
        disabled={todayDisabled}
        onClick={() => navigate(todayMonthAnchor(now, config))}
      >
        Today
      </button>
      <button type="button" className="cm-prev" data-testid="cm-prev" aria-label="Previous month" onClick={() => navigate(prevMonth(anchor))}>
        ‹
      </button>
      <button type="button" className="cm-next" data-testid="cm-next" aria-label="Next month" onClick={() => navigate(nextMonth(anchor))}>
        ›
      </button>
      <h1 className="cm-range-title" data-testid="cm-range-title">
        {monthTitle(layout.year, layout.month, config.locale)}
      </h1>
    </div>
  );
}
