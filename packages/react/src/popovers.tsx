import { useEffect, useRef, type ReactNode } from 'react';
import type { CalendarConfig, CalendarEvent, Occurrence } from '@jonnyboats/calendar-contract';
import { isOccurrencePast, nextUpcomingOccurrence } from '@jonnyboats/calendar-core';
import { formatDayLong, safeHref } from './format.js';

const FOCUSABLE = 'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Focus-trapped popover shell (RS §5a/§8b): focuses its first control on open, traps Tab, and
 * Escape closes. Focus RETURN to the trigger is handled by the parent (it owns the trigger ref),
 * so this shell stays presentation-only.
 */
function PopoverShell({
  labelledBy,
  testId,
  onClose,
  children,
}: {
  labelledBy: string;
  testId: string;
  onClose: () => void;
  children: ReactNode;
}): ReactNode {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const first = root.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
  }, []);

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const root = ref.current;
    if (!root) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const firstEl = items[0]!;
    const lastEl = items[items.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && active === firstEl) {
      e.preventDefault();
      lastEl.focus();
    } else if (!e.shiftKey && active === lastEl) {
      e.preventDefault();
      firstEl.focus();
    }
  }

  return (
    <div
      ref={ref}
      className="cm-popover"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      data-testid={testId}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}

export function EventDetailPopover({
  event,
  occ,
  now,
  config,
  onClose,
  onAddToCalendar,
  renderActions,
}: {
  event: CalendarEvent;
  occ: Occurrence;
  now: string;
  config: CalendarConfig;
  onClose: () => void;
  onAddToCalendar: (event: CalendarEvent, occ: Occurrence) => void;
  renderActions?: (event: CalendarEvent, occ: Occurrence) => ReactNode;
}): ReactNode {
  const titleId = `cm-detail-title-${event.id}`;
  const past = isOccurrencePast(occ, now, config);
  const next = past ? nextUpcomingOccurrence(event, now, config) : undefined;
  const href = safeHref(event.url);
  const mapHref = safeHref(occ.mapUrl);

  return (
    <PopoverShell labelledBy={titleId} testId="cm-event-popover" onClose={onClose}>
      <div className="cm-popover-head">
        {event.category && <span className="cm-chip" data-category={event.category} aria-hidden="true" />}
        <h2 id={titleId} className="cm-popover-title">
          {event.title}
        </h2>
        <button type="button" className="cm-close" data-testid="cm-popover-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <p className="cm-popover-date" data-testid="cm-occurrence-date">
        {formatDayLong(occ.allDay ? occ.start : occ.start.slice(0, 10), config.locale)}
      </p>

      {past && (
        <p className="cm-next-upcoming" data-testid="cm-next-upcoming">
          {next
            ? `Next upcoming: ${formatDayLong(next.allDay ? next.start : next.start.slice(0, 10), config.locale)}`
            : event.recurrenceSummary ?? ''}
        </p>
      )}

      {event.recurrenceSummary && (
        <p className="cm-recurrence" data-testid="cm-recurrence">
          {event.recurrenceSummary}
        </p>
      )}

      <p className="cm-hours">
        {occ.openTime && occ.closeTime ? `${occ.openTime}–${occ.closeTime}` : 'Hours not listed — confirm with organizer'}
      </p>

      {occ.location && (
        <p className="cm-location">
          {occ.location}
          {mapHref && (
            <>
              {' · '}
              <a href={mapHref} className="cm-directions" rel="noopener noreferrer">
                Get directions
              </a>
            </>
          )}
        </p>
      )}

      <div className="cm-popover-actions">
        <button
          type="button"
          className="cm-add-to-calendar"
          data-testid="cm-add-to-calendar"
          onClick={() => onAddToCalendar(event, occ)}
        >
          Add to calendar
        </button>
        {href && (
          <a href={href} className="cm-view-event" rel="noopener noreferrer">
            View event page →
          </a>
        )}
        {renderActions?.(event, occ)}
      </div>
    </PopoverShell>
  );
}

export interface DayEntry {
  event: CalendarEvent;
  occ: Occurrence;
  timeLabel: string | undefined;
  allDay: boolean;
}

export function DayPopover({
  date,
  entries,
  locale,
  onSelectEvent,
  onClose,
  onViewFullDay,
}: {
  date: string;
  entries: DayEntry[];
  locale: string | undefined;
  onSelectEvent: (entry: DayEntry) => void;
  onClose: () => void;
  onViewFullDay: (date: string) => void;
}): ReactNode {
  const titleId = `cm-day-title-${date}`;
  return (
    <PopoverShell labelledBy={titleId} testId="cm-day-popover" onClose={onClose}>
      <div className="cm-popover-head">
        <h2 id={titleId} className="cm-popover-title">
          {formatDayLong(date, locale)}
        </h2>
        <button type="button" className="cm-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="cm-empty-day" data-testid="cm-empty-day">
          No events on {formatDayLong(date, locale)}
        </p>
      ) : (
        <ul className="cm-day-list" data-testid="cm-day-list">
          {entries.map((entry) => (
            <li key={entry.occ.id}>
              <button type="button" className="cm-day-item" onClick={() => onSelectEvent(entry)}>
                <span className="cm-dot" data-category={entry.event.category} aria-hidden="true" />
                <span className="cm-day-time">{entry.allDay ? 'All day' : entry.timeLabel}</span>
                <span className="cm-day-title">{entry.event.title}</span>
                {entry.occ.location && <span className="cm-day-loc">{entry.occ.location}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      <button type="button" className="cm-view-full-day" data-testid="cm-view-full-day" onClick={() => onViewFullDay(date)}>
        View full day →
      </button>
    </PopoverShell>
  );
}
