import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { CalendarConfig, CalendarEvent, Occurrence } from '@jonnyboats/calendar-contract';
import { validateConfig } from '@jonnyboats/calendar-contract';
import {
  dayColumnSegments,
  packDayColumn,
  packStrip,
  blockBox,
  dayLengthMinutes,
  nowLineFraction,
  alignWeekStart,
  rangeDays,
  generateIcs,
  addDays,
  type DayKey,
  type PositionedBlock,
} from '@jonnyboats/calendar-core';
import { formatDayLong, formatScheduleHeader, formatDayRange } from './format.js';
import { FetchError } from './states.js';
import { EventDetailPopover } from './popovers.js';
import type { EventPopoverSlotCtx, LegendSlotCtx } from './CalendarMonth.js';
import { themeToVars, type CalendarTheme } from './theme.js';

/**
 * Week / Day / Custom time-grid (AVS §4) — the expensive view: all-day strip + hour grid +
 * collision layout (§6) + DST-correct now-line (§4.4). Generic over the visible `days[]` so Day is
 * Week-with-one-column and Custom (v2-b) is the same grid with N columns.
 *
 * Reuses the core: `dayColumnSegments` → `packDayColumn` (per column), `packStrip` (all-day strip +
 * ongoing band), `nowLineFraction`/`dayLengthMinutes`/`blockBox` (geometry). a11y is **linear focus
 * order** over blocks (AVS §7.3), NOT 2-D pixel roving: column headers + all-day items + ongoing
 * band + hour-grid blocks are focusable in DOM (≈chronological) order; Enter opens, Esc returns.
 */

const DEFAULT_HOUR_HEIGHT_PX = 48;
const DEFAULT_MIN_BLOCK_PX = 22;
const DEFAULT_MAX_STRIP_LANES = 3;
const HOURS = Array.from({ length: 24 }, (_, h) => h);

export interface TimeGridSkinProps {
  events: CalendarEvent[];
  config: CalendarConfig;
  now: string;
  /** The visible columns (Week=7, Day=1, Custom=N). */
  days: DayKey[];
  rangeTitle: string;
  status?: 'loading' | 'loaded' | 'error';
  onRetry?: () => void;
  themeVars?: CSSProperties;
  hourHeightPx?: number;
  maxStripLanes?: number;
  todayDisabled?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  onToday?: () => void;
  /** Click a day-column header → Day view for that date. */
  onNavigateToDay?: (date: DayKey) => void;
  onExportIcs?: (ics: string, filename: string) => void;
  onLegendFilterChange?: (hidden: ReadonlySet<string>) => void;
  renderEventActions?: (event: CalendarEvent, occ: Occurrence) => ReactNode;
  renderEventPopover?: (ctx: EventPopoverSlotCtx) => ReactNode;
  renderLegend?: (ctx: LegendSlotCtx) => ReactNode;
}

type PopoverState = { kind: 'none' } | { kind: 'event'; eventId: string; occId: string };

export function TimeGridSkin(props: TimeGridSkinProps): ReactNode {
  const { events, config, now, days, status = 'loaded', onRetry } = props;
  const dtz = config.displayTimeZone;
  const hourHeight = props.hourHeightPx ?? DEFAULT_HOUR_HEIGHT_PX;
  const minBlockPx = config.minBlockPx ?? DEFAULT_MIN_BLOCK_PX;
  const gridHeight = hourHeight * 24;
  const maxLanes = props.maxStripLanes ?? DEFAULT_MAX_STRIP_LANES;

  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [popover, setPopover] = useState<PopoverState>({ kind: 'none' });
  const [stripExpanded, setStripExpanded] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const didScrollRef = useRef(false);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const e of events) if (e.category) set.add(e.category);
    return [...set].sort();
  }, [events]);
  const catColor = (cat: string | undefined): string | undefined =>
    cat ? config.categoryColors?.[cat] : undefined;
  const eventColor = (eventId: string): string | undefined =>
    catColor(events.find((e) => e.id === eventId)?.category);

  const visibleEvents = useMemo(
    () => events.filter((e) => e.category === undefined || !hidden.has(e.category)),
    [events, hidden],
  );

  const strip = useMemo(
    () => packStrip(visibleEvents, days, config, stripExpanded ? Infinity : maxLanes),
    [visibleEvents, days, config, stripExpanded, maxLanes],
  );
  const columns = useMemo(
    () =>
      days.map((day) => ({
        day,
        blocks: packDayColumn(dayColumnSegments(visibleEvents, day, config)),
        dayLen: dayLengthMinutes(day, dtz),
        nowFrac: nowLineFraction(now, day, dtz),
      })),
    [visibleEvents, days, config, now, dtz],
  );

  // Default scroll anchor — precedence (§4.2 / review S2-1): today visible → now-line; else the
  // earliest event in the window; else weekScrollAnchorHour. Runs once post-mount (SSR-safe).
  useEffect(() => {
    if (didScrollRef.current || status !== 'loaded') return;
    const el = scrollRef.current;
    if (!el) return;
    didScrollRef.current = true;
    const anchorHour = config.weekScrollAnchorHour ?? 7;
    let anchorMin: number;
    const todayCol = columns.find((c) => c.nowFrac != null);
    if (todayCol && todayCol.nowFrac != null) {
      anchorMin = todayCol.nowFrac * todayCol.dayLen;
    } else {
      const starts = columns.flatMap((c) => c.blocks.map((b) => b.startMin));
      anchorMin = starts.length ? Math.min(...starts) : anchorHour * 60;
    }
    el.scrollTop = Math.max(0, (anchorMin / 1440) * gridHeight - hourHeight);
  }, [columns, config.weekScrollAnchorHour, gridHeight, hourHeight, status]);

  function closePopover(): void {
    setPopover({ kind: 'none' });
    triggerRef.current?.focus();
    triggerRef.current = null;
  }
  function openEvent(eventId: string, occId: string, el: HTMLElement): void {
    triggerRef.current = el;
    setPopover({ kind: 'event', eventId, occId });
  }
  function toggleCategory(cat: string): void {
    const next = new Set(hidden);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    setHidden(next);
    props.onLegendFilterChange?.(next);
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

  // Arrow Left/Right moves focus between day-column headers (§7.3); Up/Down is NOT pixel roving.
  function onHeaderKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const headers = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-col-header]'));
    const idx = headers.indexOf(document.activeElement as HTMLElement);
    if (idx === -1) return;
    e.preventDefault();
    const next = e.key === 'ArrowRight' ? Math.min(idx + 1, headers.length - 1) : Math.max(idx - 1, 0);
    headers[next]?.focus();
  }

  if (status === 'error') {
    return (
      <div className="cm-root cm-timegrid" data-testid="cm-root" style={props.themeVars}>
        <TimeGridToolbar {...props} />
        <FetchError onRetry={onRetry} />
      </div>
    );
  }

  const selectedEvent = popover.kind === 'event' ? events.find((e) => e.id === popover.eventId) : undefined;
  const selectedOcc = selectedEvent?.occurrences.find((o) => o.id === (popover as { occId: string }).occId);

  return (
    <div className="cm-root cm-timegrid" data-testid="cm-root" style={props.themeVars}>
      <TimeGridToolbar {...props} />

      {categories.length > 0 &&
        (props.renderLegend ? (
          props.renderLegend({ categories, hidden, toggle: toggleCategory })
        ) : (
          <div className="cm-legend" role="group" aria-label="Filter by category" data-testid="cm-legend">
            {categories.map((cat) => (
              <label key={cat} className="cm-legend-item">
                <input type="checkbox" checked={!hidden.has(cat)} data-testid={`cm-legend-${cat}`} onChange={() => toggleCategory(cat)} />
                <span className="cm-dot" data-category={cat} aria-hidden="true" style={catColor(cat) ? { background: catColor(cat) } : undefined} />
                {cat}
              </label>
            ))}
          </div>
        ))}

      {/* Ongoing band (>14d) — above everything; clickable + a focus stop (§4.1/§7.3). */}
      {strip.ongoing.length > 0 && (
        <ul className="cm-ongoing-band" data-testid="cm-ongoing-band">
          {strip.ongoing.map((o) => (
            <li key={o.occurrenceId}>
              <button
                type="button"
                className="cm-ongoing-strip"
                data-testid={`cm-ongoing-${o.occurrenceId}`}
                style={eventColor(o.eventId) ? { background: eventColor(o.eventId) } : undefined}
                onClick={(e) => openEvent(o.eventId, o.occurrenceId, e.currentTarget)}
              >
                Ongoing through {formatDayLong(o.throughDate, config.locale)}: {o.title}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Day-column headers. */}
      <div className="cm-tg-headers" data-testid="cm-tg-headers" onKeyDown={onHeaderKeyDown} style={{ ['--cm-cols' as string]: days.length }}>
        <span className="cm-tg-axis-spacer" aria-hidden="true" />
        {days.map((day) => (
          <button
            key={day}
            type="button"
            data-col-header
            data-testid={`cm-tg-header-${day}`}
            className="cm-tg-header"
            onClick={() => props.onNavigateToDay?.(day)}
          >
            {days.length > 1 ? formatScheduleHeader(day, config.locale) : formatDayLong(day, config.locale)}
          </button>
        ))}
      </div>

      {/* All-day strip (bars + ribbons), positioned relative to the grid, not the viewport. */}
      <div className="cm-tg-allday" data-testid="cm-tg-allday" style={{ ['--cm-cols' as string]: days.length }}>
        <span className="cm-tg-axis-label cm-tg-allday-label" aria-hidden="true">all-day</span>
        <div className="cm-tg-allday-lanes" style={{ ['--cm-lanes' as string]: Math.max(1, strip.laneCount) }}>
          {strip.ribbons.filter((r) => r.visible).map((r) => (
            <button
              key={r.occurrenceId}
              type="button"
              data-testid={`cm-tg-ribbon-${r.occurrenceId}`}
              className={'cm-tg-ribbon' + (r.continuesLeft ? ' cm-clip-left' : '') + (r.continuesRight ? ' cm-clip-right' : '')}
              style={{
                gridColumn: `${r.startCol + 1} / ${r.endCol + 2}`,
                gridRow: r.lane + 1,
                ...(eventColor(r.eventId) ? { background: eventColor(r.eventId) } : {}),
              }}
              onClick={(e) => openEvent(r.eventId, r.occurrenceId, e.currentTarget)}
            >
              {events.find((ev) => ev.id === r.eventId)?.title}
            </button>
          ))}
        </div>
        {strip.overflow.length > 0 && !stripExpanded && (
          <div className="cm-tg-allday-overflow" style={{ ['--cm-cols' as string]: days.length }}>
            {strip.overflow.map((o) => (
              <button
                key={o.col}
                type="button"
                className="cm-more"
                data-testid={`cm-tg-more-${o.day}`}
                style={{ gridColumn: o.col + 1 }}
                onClick={() => setStripExpanded(true)}
              >
                +{o.count} more
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Scrollable hour grid. */}
      <div className="cm-tg-scroll" data-testid="cm-tg-scroll" ref={scrollRef}>
        <div className="cm-tg-grid" style={{ height: gridHeight, ['--cm-cols' as string]: days.length }}>
          {/* Hour axis. */}
          <div className="cm-tg-axis" aria-hidden="true">
            {HOURS.map((h) => (
              <div className="cm-tg-hour" key={h} style={{ height: hourHeight }}>
                <span className="cm-tg-hour-label">{formatHour(h, config.locale)}</span>
              </div>
            ))}
          </div>
          {/* Day columns. */}
          {columns.map((col, ci) => (
            <div
              key={col.day}
              className="cm-tg-col"
              data-testid={`cm-tg-col-${col.day}`}
              style={{ left: `calc(var(--cm-axis-w) + ${ci} * (100% - var(--cm-axis-w)) / ${days.length})`, width: `calc((100% - var(--cm-axis-w)) / ${days.length})` }}
            >
              {col.blocks.map((b) => (
                <TimeBlock
                  key={b.key}
                  block={b}
                  dayLen={col.dayLen}
                  gridHeight={gridHeight}
                  minBlockPx={minBlockPx}
                  color={eventColor(b.eventId)}
                  onOpen={(el) => openEvent(b.eventId, b.occurrenceId, el)}
                />
              ))}
              {col.nowFrac != null && (
                <div
                  className="cm-tg-nowline"
                  data-testid={`cm-tg-nowline-${col.day}`}
                  style={{ top: col.nowFrac * gridHeight }}
                  aria-hidden="true"
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {popover.kind === 'event' &&
        selectedEvent &&
        selectedOcc &&
        (props.renderEventPopover ? (
          props.renderEventPopover({ event: selectedEvent, occ: selectedOcc, now, close: closePopover, addToCalendar: exportIcs })
        ) : (
          <EventDetailPopover
            event={selectedEvent}
            occ={selectedOcc}
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

function TimeBlock({
  block,
  dayLen,
  gridHeight,
  minBlockPx,
  color,
  onOpen,
}: {
  block: PositionedBlock;
  dayLen: number;
  gridHeight: number;
  minBlockPx: number;
  color: string | undefined;
  onOpen: (el: HTMLElement) => void;
}): ReactNode {
  const { top, height } = blockBox(block.startMin, block.endMin, dayLen, gridHeight, minBlockPx);
  const width = 100 / block.columnCount;
  return (
    <button
      type="button"
      data-block
      data-testid={`cm-tg-block-${block.key}`}
      className="cm-tg-block"
      style={{
        top,
        height,
        left: `${block.columnIndex * width}%`,
        width: `${width}%`,
        ...(color ? { background: color } : {}),
      }}
      onClick={(e) => onOpen(e.currentTarget)}
    >
      {block.timeLabel && <span className="cm-tg-block-time">{block.timeLabel}</span>}
      <span className="cm-tg-block-title">{block.title}</span>
    </button>
  );
}

function formatHour(hour: number, locale = 'en-US'): string {
  const d = new Date(Date.UTC(2026, 0, 1, hour, 0));
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', timeZone: 'UTC' }).format(d);
}

function TimeGridToolbar(props: TimeGridSkinProps): ReactNode {
  return (
    <div className="cm-toolbar" role="toolbar" aria-label="Calendar navigation">
      <button type="button" className="cm-today" data-testid="cm-today" disabled={props.todayDisabled} onClick={props.onToday}>
        Today
      </button>
      <button type="button" className="cm-prev" data-testid="cm-prev" aria-label="Previous" onClick={props.onPrev}>
        ‹
      </button>
      <button type="button" className="cm-next" data-testid="cm-next" aria-label="Next" onClick={props.onNext}>
        ›
      </button>
      <h1 className="cm-range-title" data-testid="cm-range-title">
        {props.rangeTitle}
      </h1>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Host-facing mount API (flat props), mirroring `MonthCalendar`.
 * ------------------------------------------------------------------ */

export type TimeGridView = 'week' | 'day' | 'custom';

export interface TimeGridCalendarProps {
  events: CalendarEvent[];
  displayTimeZone: string;
  now: string;
  /** Which time-grid variant; drives the visible day count + range title. */
  view: TimeGridView;
  /** The focused date the range is built around (week containing it / the day / custom start). */
  anchor: DayKey;
  /** Custom view day count (2–7); ignored for week/day. */
  customViewDays?: number;
  theme?: CalendarTheme;
  locale?: string;
  weekStartsOn?: 0 | 1;
  defaultDurationMinutes?: number;
  minBlockPx?: number;
  weekScrollAnchorHour?: number;
  hourHeightPx?: number;
  maxStripLanes?: number;
  status?: 'loading' | 'loaded' | 'error';
  onRetry?: () => void;
  /** Fired on prev/next/today with the new anchor so the host moves + refetches the window. */
  onNavigate?: (next: { anchor: DayKey; days: DayKey[] }) => void;
  onNavigateToDay?: (date: DayKey) => void;
  onExportIcs?: (ics: string, filename: string) => void;
  onLegendFilterChange?: (hidden: ReadonlySet<string>) => void;
  renderEventActions?: (event: CalendarEvent, occ: Occurrence) => ReactNode;
  renderEventPopover?: (ctx: EventPopoverSlotCtx) => ReactNode;
  renderLegend?: (ctx: LegendSlotCtx) => ReactNode;
}

function rangeFor(view: TimeGridView, anchor: DayKey, cfg: CalendarConfig, customDays: number): DayKey[] {
  if (view === 'day') return [anchor];
  if (view === 'custom') return rangeDays(anchor, Math.min(7, Math.max(2, customDays)));
  return rangeDays(alignWeekStart(anchor, cfg), 7);
}

function titleFor(days: DayKey[], view: TimeGridView, locale: string | undefined): string {
  if (view === 'day') return formatDayLong(days[0]!, locale);
  const first = days[0]!;
  const last = days[days.length - 1]!;
  return `${formatDayRange(first, last, locale)}, ${last.slice(0, 4)}`; // e.g. "Jun 14 – 20, 2026"
}

export function TimeGridCalendar(props: TimeGridCalendarProps): ReactNode {
  const result = validateConfig({
    displayTimeZone: props.displayTimeZone,
    locale: props.locale,
    weekStartsOn: props.weekStartsOn,
    defaultDurationMinutes: props.defaultDurationMinutes,
    categoryColors: props.theme?.categoryColors,
    minBlockPx: props.minBlockPx,
    weekScrollAnchorHour: props.weekScrollAnchorHour,
    customViewDays: props.customViewDays,
  });
  const config = result.success && result.data ? result.data : { displayTimeZone: 'UTC' };
  const status = result.success ? (props.status ?? 'loaded') : 'error';

  const customDays = props.customViewDays ?? 4;
  const days = rangeFor(props.view, props.anchor, config, customDays);
  const rangeTitle = titleFor(days, props.view, props.locale);

  const step = props.view === 'day' ? 1 : props.view === 'custom' ? days.length : 7;
  const navigate = (delta: number): void => {
    const base = props.view === 'week' ? alignWeekStart(props.anchor, config) : props.anchor;
    const nextAnchor = addDays(base, delta * step);
    props.onNavigate?.({ anchor: nextAnchor, days: rangeFor(props.view, nextAnchor, config, customDays) });
  };

  return (
    <TimeGridSkin
      events={props.events}
      config={config}
      now={props.now}
      days={days}
      rangeTitle={rangeTitle}
      status={status}
      themeVars={themeToVars(props.theme)}
      hourHeightPx={props.hourHeightPx}
      maxStripLanes={props.maxStripLanes}
      onRetry={props.onRetry}
      onPrev={() => navigate(-1)}
      onNext={() => navigate(1)}
      onToday={() => props.onNavigate?.({ anchor: props.anchor, days })}
      onNavigateToDay={props.onNavigateToDay}
      onExportIcs={props.onExportIcs}
      onLegendFilterChange={props.onLegendFilterChange}
      renderEventActions={props.renderEventActions}
      renderEventPopover={props.renderEventPopover}
      renderLegend={props.renderLegend}
    />
  );
}
