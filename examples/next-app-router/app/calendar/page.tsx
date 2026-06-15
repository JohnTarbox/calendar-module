/**
 * Reference: mounting `MonthCalendar` in a host Next.js App Router Server Component.
 *
 * The host owns the route, the runtime (OpenNext/Cloudflare), and data fetching. This file is
 * typecheck-only here (no Next runtime on the build machine) — it proves the documented call site
 * compiles against the module's real published types. See RECIPE.md for the full integration.
 */
import { MonthCalendar, validateWindow, type CalendarEvent } from '@johntarbox/calendar-react';

// Replace with your own D1 / API query for the window. The module never fetches.
async function loadWindow(start: string, end: string): Promise<CalendarEvent[]> {
  void start;
  void end;
  return [];
}

export default async function CalendarPage() {
  // Pin "now" once per request so the today-disc is stable across the SSR boundary.
  const now = new Date().toISOString();
  const window = { start: '2026-06-01', end: '2026-07-05' };

  const events = await loadWindow(window.start, window.end);

  // Validate at the seam before rendering (the contract gate that keeps host + module independent).
  const checked = validateWindow(events);
  if (!checked.success) {
    // Render the module's error guard instead of throwing in production.
    return (
      <MonthCalendar events={[]} displayTimeZone="America/New_York" now={now} status="error" />
    );
  }

  return (
    <MonthCalendar
      events={events}
      displayTimeZone="America/New_York"
      now={now}
      window={window}
      theme={{ accent: '#1a73e8', categoryColors: { Fair: '#d81b60', Market: '#2e7d32' } }}
    />
  );
}
