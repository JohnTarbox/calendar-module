import type { ReactNode } from 'react';

/**
 * Observable state elements (RS §9). Each carries a known test id so the named ACs are
 * assertable: a loading skeleton (never a blank flash), a distinct empty-window state, and a
 * non-blocking fetch-error state with a retry affordance that preserves the chrome.
 */

export function MonthSkeleton(): ReactNode {
  return (
    <div className="cm-skeleton" data-testid="cm-loading" aria-busy="true" aria-live="polite">
      {Array.from({ length: 6 }).map((_, i) => (
        <div className="cm-skeleton-row" key={i} data-testid="cm-skeleton-row" />
      ))}
    </div>
  );
}

export function ScheduleSkeleton(): ReactNode {
  return (
    <div className="cm-skeleton cm-sched-skeleton" data-testid="cm-loading" aria-busy="true" aria-live="polite">
      {Array.from({ length: 5 }).map((_, i) => (
        <div className="cm-skeleton-row cm-sched-skeleton-row" key={i} data-testid="cm-skeleton-row" />
      ))}
    </div>
  );
}

export function EmptyWindow({ message = 'No events in this period.' }: { message?: string } = {}): ReactNode {
  return (
    <div className="cm-empty" data-testid="cm-empty">
      {message}
    </div>
  );
}

export function FetchError({ onRetry }: { onRetry?: () => void }): ReactNode {
  return (
    <div className="cm-error" data-testid="cm-error" role="alert">
      <span>Couldn’t load events.</span>
      <button type="button" className="cm-retry" data-testid="cm-retry" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}
