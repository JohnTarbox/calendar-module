import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { CalendarConfig, CalendarEvent, Occurrence } from '@jonnyboats/calendar-contract';
import { validateConfig } from '@jonnyboats/calendar-contract';
import {
  buildAgenda,
  pageForward,
  pageEarlier,
  groupByDay,
  hasEventsOn,
  generateIcs,
  type AgendaCursor,
  type AgendaItem,
  type AgendaDayGroup,
} from '@jonnyboats/calendar-core';
import { formatDayMedium, formatDayRange, formatScheduleHeader, safeHref } from './format.js';
import { ScheduleSkeleton, EmptyWindow, FetchError } from './states.js';
import { EventDetailPopover } from './popovers.js';
import type { EventPopoverSlotCtx, LegendSlotCtx } from './CalendarMonth.js';
import { themeToVars, type CalendarTheme } from './theme.js';

/**
 * Schedule / Agenda view (AVS §2) — the mobile-default, forward-from-now chronological list.
 *
 * The headless half (classification, the keyset cursor, day-grouping) lives in
 * `@jonnyboats/calendar-core`'s `buildAgenda`/`pageForward`/`pageEarlier`/`groupByDay`; this skin
 * binds it to DOM. The host fetches a window of events; this view paginates that in-memory window
 * by the core keyset and reveals one `agendaPageSize` page at a time, calling `onLoadMore` when the
 * local stream is exhausted so the host can fetch the next window.
 *
 * a11y is a **list** (AVS §7.1), not a grid: `role="list"` + focusable row buttons, Tab/Arrow row
 * navigation, Enter/Space opens the row, Esc returns focus to it (popover shell). The pinned
 * "Happening now / Ongoing" section (§2.1a) sits above the keyset stream and never perturbs the
 * cursor.
 */

const DEFAULT_PAGE_SIZE = 25;
const DEFAULT_MOBILE_BREAKPOINT_PX = 640;

type RowAction = 'popover' | 'navigate';

/** SSR-safe responsive flag: desktop on the server + first paint, updates post-mount (§1.7). */
function useIsMobile(breakpointPx: number, override: boolean | undefined): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (override !== undefined) return;
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(`(max-width: ${breakpointPx - 1}px)`);
    const update = (): void => setIsMobile(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, [breakpointPx, override]);
  return override ?? isMobile;
}

/** Accumulate `pages` keyset pages from a sorted item list using the core pager. */
function accumulate(
  items: readonly AgendaItem[],
  pages: number,
  pageSize: number,
  pager: (s: readonly AgendaItem[], c: AgendaCursor | null, n: number) => ReturnType<typeof pageForward>,
): { items: AgendaItem[]; hasMore: boolean } {
  const out: AgendaItem[] = [];
  let cursor: AgendaCursor | null = null;
  let hasMore = items.length > 0;
  for (let p = 0; p < pages && hasMore; p++) {
    const page = pager(items, cursor, pageSize);
    out.push(...page.items);
    cursor = page.nextCursor;
    hasMore = page.hasMore;
  }
  return { items: out, hasMore };
}

export interface ScheduleSkinProps {
  events: CalendarEvent[];
  config: CalendarConfig;
  /** Host-pinned ISO at request time — SSR-stable "now". */
  now: string;
  status?: 'loading' | 'loaded' | 'error';
  onRetry?: () => void;
  themeVars?: CSSProperties;
  /** Show the "Load earlier events" backward-pagination control (AVS §2.3). */
  includePast?: boolean;
  /** Override the responsive split (testing/SSR). When set, `mobileBreakpointPx` is ignored. */
  isMobile?: boolean;
  mobileBreakpointPx?: number;
  /** Row navigate target (mobile / `scheduleRowAction: "navigate"`). Defaults to `event.url`. */
  onNavigateToEventPage?: (event: CalendarEvent, occ: Occurrence) => void;
  /** Receives the generated .ics; defaults to a browser download. */
  onExportIcs?: (ics: string, filename: string) => void;
  onLegendFilterChange?: (hidden: ReadonlySet<string>) => void;
  /** Fired when the local stream is exhausted and the user asks for more (fetch the next window). */
  onLoadMore?: () => void;
  renderEventActions?: (event: CalendarEvent, occ: Occurrence) => ReactNode;
  renderEventPopover?: (ctx: EventPopoverSlotCtx) => ReactNode;
  renderLegend?: (ctx: LegendSlotCtx) => ReactNode;
}

type PopoverState = { kind: 'none' } | { kind: 'event'; eventId: string; occId: string };

export function ScheduleSkin(props: ScheduleSkinProps): ReactNode {
  const { events, config, now, status = 'loaded', onRetry } = props;
  const pageSize = config.agendaPageSize ?? DEFAULT_PAGE_SIZE;
  const isMobile = useIsMobile(props.mobileBreakpointPx ?? DEFAULT_MOBILE_BREAKPOINT_PX, props.isMobile);

  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [forwardPages, setForwardPages] = useState(1);
  const [pastPages, setPastPages] = useState(0);
  const [popover, setPopover] = useState<PopoverState>({ kind: 'none' });
  const triggerRef = useRef<HTMLElement | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLElement | null>(null);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const e of events) if (e.category) set.add(e.category);
    return [...set].sort();
  }, [events]);
  const catColor = (cat: string | undefined): string | undefined =>
    cat ? config.categoryColors?.[cat] : undefined;

  const visibleEvents = useMemo(
    () => events.filter((e) => e.category === undefined || !hidden.has(e.category)),
    [events, hidden],
  );
  const model = useMemo(() => buildAgenda(visibleEvents, config, now), [visibleEvents, config, now]);

  const forward = useMemo(
    () => accumulate(model.stream, forwardPages, pageSize, pageForward),
    [model.stream, forwardPages, pageSize],
  );
  const past = useMemo(
    () => accumulate(model.past, pastPages, pageSize, pageEarlier),
    [model.past, pastPages, pageSize],
  );

  const forwardGroups = useMemo(() => groupByDay(forward.items), [forward.items]);
  const pastGroups = useMemo(() => groupByDay(past.items), [past.items]);
  const todayHasEvents = hasEventsOn(forwardGroups, model.todayKey);
  const moreEarlierAvailable = props.includePast && (pastPages === 0 ? model.past.length > 0 : past.hasMore);

  function resolveRowAction(): RowAction {
    const mode = config.scheduleRowAction ?? 'responsive';
    if (mode === 'responsive') return isMobile ? 'navigate' : 'popover';
    return mode;
  }

  function closePopover(): void {
    setPopover({ kind: 'none' });
    triggerRef.current?.focus();
    triggerRef.current = null;
  }
  function activateRow(item: AgendaItem, el: HTMLElement): void {
    if (resolveRowAction() === 'navigate') {
      if (props.onNavigateToEventPage) return props.onNavigateToEventPage(item.event, item.occurrence);
      const href = safeHref(item.event.url);
      if (href && typeof window !== 'undefined') window.location.assign(href);
      return;
    }
    triggerRef.current = el;
    setPopover({ kind: 'event', eventId: item.eventId, occId: item.occurrenceId });
  }
  function toggleCategory(cat: string): void {
    const next = new Set(hidden);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    setHidden(next);
    props.onLegendFilterChange?.(next);
  }
  function loadMoreForward(): void {
    if (forward.hasMore) setForwardPages((p) => p + 1);
    else props.onLoadMore?.();
  }
  function goToToday(): void {
    const el = todayRef.current;
    if (!el) return;
    el.scrollIntoView?.({ block: 'start' });
    el.focus?.();
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

  /** Arrow Up/Down moves focus row-to-row in DOM (chronological) order (AVS §7.1). */
  function onListKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const root = listRef.current;
    if (!root) return;
    const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-row]'));
    const idx = rows.indexOf(document.activeElement as HTMLElement);
    if (idx === -1) return;
    e.preventDefault();
    const nextIdx = e.key === 'ArrowDown' ? Math.min(idx + 1, rows.length - 1) : Math.max(idx - 1, 0);
    rows[nextIdx]?.focus();
  }

  const rowTimeLabel = (item: AgendaItem): string => {
    if (item.ongoing) return `Ongoing through ${formatDayMedium(item.span.endDayInclusive, config.locale)}`;
    if (item.span.spanDays > 1) {
      return formatDayRange(item.span.startDay, item.span.endDayInclusive, config.locale);
    }
    if (item.allDay) return 'All day';
    return item.span.timeLabel ?? '';
  };

  const renderRow = (item: AgendaItem, todayMarker = false): ReactNode => (
    <li key={item.occurrenceId} role="listitem">
      <button
        type="button"
        data-row
        data-testid={`cm-sched-row-${item.occurrenceId}`}
        className="cm-sched-row"
        onClick={(e) => activateRow(item, e.currentTarget)}
        ref={
          todayMarker
            ? (el) => {
                if (el) todayRef.current = el;
              }
            : undefined
        }
      >
        <span
          className="cm-dot"
          data-category={item.event.category}
          aria-hidden="true"
          style={catColor(item.event.category) ? { background: catColor(item.event.category) } : undefined}
        />
        <span className="cm-sched-time">{rowTimeLabel(item)}</span>
        <span className="cm-sched-title">{item.event.title}</span>
        {item.occurrence.location && <span className="cm-sched-loc">{item.occurrence.location}</span>}
      </button>
    </li>
  );

  const renderGroup = (group: AgendaDayGroup): ReactNode => {
    const isToday = group.day === model.todayKey;
    return (
      <section key={group.day} className="cm-sched-group" data-testid={`cm-sched-group-${group.day}`}>
        <h2
          className={'cm-sched-day' + (isToday ? ' cm-sched-day-today' : '')}
          data-testid={`cm-sched-day-${group.day}`}
        >
          {formatScheduleHeader(group.day, config.locale)}
          {isToday && (
            <span className="cm-sched-today-marker" data-testid="cm-sched-today-marker">
              {' '}
              · Today
            </span>
          )}
        </h2>
        <ul className="cm-sched-list" role="list">
          {group.items.map((item, i) =>
            renderRow(item, isToday && i === 0),
          )}
        </ul>
      </section>
    );
  };

  if (status === 'loading') {
    return (
      <div className="cm-root cm-schedule" data-testid="cm-root" style={props.themeVars}>
        <ScheduleToolbar onToday={goToToday} />
        <ScheduleSkeleton />
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="cm-root cm-schedule" data-testid="cm-root" style={props.themeVars}>
        <ScheduleToolbar onToday={goToToday} />
        <FetchError onRetry={onRetry} />
      </div>
    );
  }

  const isEmpty = model.pinned.length === 0 && model.stream.length === 0;
  const selectedEvent = popover.kind === 'event' ? events.find((e) => e.id === popover.eventId) : undefined;
  const selectedOcc = selectedEvent?.occurrences.find((o) => o.id === (popover as { occId: string }).occId);

  return (
    <div className="cm-root cm-schedule" data-testid="cm-root" style={props.themeVars}>
      <ScheduleToolbar onToday={goToToday} />

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

      {model.pinned.length > 0 && (
        <section className="cm-sched-pinned" data-testid="cm-sched-pinned" aria-label="Happening now">
          <h2 className="cm-sched-pinned-head">Happening now</h2>
          <ul className="cm-sched-list" role="list">
            {model.pinned.map((item) => renderRow(item))}
          </ul>
        </section>
      )}

      {isEmpty ? (
        <EmptyWindow message="No upcoming events." />
      ) : (
        <div
          className="cm-sched-stream"
          data-testid="cm-schedule"
          ref={listRef}
          aria-live="polite"
          onKeyDown={onListKeyDown}
        >
          {moreEarlierAvailable && (
            <button
              type="button"
              className="cm-sched-load-earlier"
              data-testid="cm-sched-load-earlier"
              onClick={() => setPastPages((p) => p + 1)}
            >
              Load earlier events
            </button>
          )}

          {pastGroups.map(renderGroup)}

          {!todayHasEvents && (
            <div
              className="cm-sched-today-anchor"
              data-testid="cm-sched-today-anchor"
              tabIndex={-1}
              ref={(el) => {
                if (el) todayRef.current = el;
              }}
            >
              {formatScheduleHeader(model.todayKey, config.locale)} · Today — no events
            </div>
          )}

          {forwardGroups.map(renderGroup)}

          {forward.hasMore || props.onLoadMore ? (
            <button
              type="button"
              className="cm-sched-load-more"
              data-testid="cm-sched-load-more"
              onClick={loadMoreForward}
            >
              Load more events
            </button>
          ) : (
            <div className="cm-sched-end" data-testid="cm-sched-end">
              No more upcoming events
            </div>
          )}
        </div>
      )}

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
            renderActions={props.renderEventActions}
          />
        ))}
    </div>
  );
}

function ScheduleToolbar({ onToday }: { onToday: () => void }): ReactNode {
  // Schedule has no discrete period → ‹ › are hidden (AVS §1.1 / review S2-5); Today is retained.
  return (
    <div className="cm-toolbar" role="toolbar" aria-label="Schedule navigation">
      <button type="button" className="cm-today" data-testid="cm-today" onClick={onToday}>
        Today
      </button>
      <h1 className="cm-range-title" data-testid="cm-range-title">
        Upcoming
      </h1>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Host-facing mount API (flat props), mirroring `MonthCalendar`.
 * ------------------------------------------------------------------ */

export interface ScheduleCalendarProps {
  events: CalendarEvent[];
  /** IANA. Invalid → the render guard (error state), never a throw/blank. */
  displayTimeZone: string;
  /** Host-pinned ISO at request time — SSR-stable "now". */
  now: string;
  theme?: CalendarTheme;
  locale?: string;
  defaultDurationMinutes?: number;
  /** Schedule keyset page size (events per page). Default 25. */
  agendaPageSize?: number;
  /** Row-click behavior. Default "responsive" (popover desktop / navigate mobile). */
  scheduleRowAction?: 'responsive' | 'popover' | 'navigate';
  includePast?: boolean;
  isMobile?: boolean;
  mobileBreakpointPx?: number;
  status?: 'loading' | 'loaded' | 'error';
  onRetry?: () => void;
  onNavigateToEventPage?: (event: CalendarEvent, occ: Occurrence) => void;
  onExportIcs?: (ics: string, filename: string) => void;
  onLegendFilterChange?: (hidden: ReadonlySet<string>) => void;
  onLoadMore?: () => void;
  renderEventActions?: (event: CalendarEvent, occ: Occurrence) => ReactNode;
  renderEventPopover?: (ctx: EventPopoverSlotCtx) => ReactNode;
  renderLegend?: (ctx: LegendSlotCtx) => ReactNode;
}

export function ScheduleCalendar(props: ScheduleCalendarProps): ReactNode {
  const result = validateConfig({
    displayTimeZone: props.displayTimeZone,
    locale: props.locale,
    defaultDurationMinutes: props.defaultDurationMinutes,
    categoryColors: props.theme?.categoryColors,
    agendaPageSize: props.agendaPageSize,
    scheduleRowAction: props.scheduleRowAction,
  });

  const config = result.success && result.data ? result.data : { displayTimeZone: 'UTC' };
  const status = result.success ? (props.status ?? 'loaded') : 'error';

  return (
    <ScheduleSkin
      events={props.events}
      config={config}
      now={props.now}
      status={status}
      themeVars={themeToVars(props.theme)}
      includePast={props.includePast}
      isMobile={props.isMobile}
      mobileBreakpointPx={props.mobileBreakpointPx}
      onRetry={props.onRetry}
      onNavigateToEventPage={props.onNavigateToEventPage}
      onExportIcs={props.onExportIcs}
      onLegendFilterChange={props.onLegendFilterChange}
      onLoadMore={props.onLoadMore}
      renderEventActions={props.renderEventActions}
      renderEventPopover={props.renderEventPopover}
      renderLegend={props.renderLegend}
    />
  );
}
