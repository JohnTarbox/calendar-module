import type { CalendarConfig, CalendarEvent } from '@jonnyboats/calendar-contract';

/** Shared dev/test fixtures (no network). June 2026, America/New_York. */
export const config: CalendarConfig = {
  displayTimeZone: 'America/New_York',
  locale: 'en-US',
  weekStartsOn: 0,
  categoryColors: { Fair: '#d81b60', Market: '#2e7d32', Music: '#1565c0', Festival: '#ef6c00' },
};

export const NOW = '2026-06-14T12:00:00-04:00';

export const events: CalendarEvent[] = [
  {
    id: 'craft-fair',
    title: 'Spring Craft Fair',
    category: 'Fair',
    url: 'https://example.org/events/craft-fair',
    occurrences: [{ id: 'cf-1', start: '2026-06-06', end: '2026-06-09', allDay: true, location: 'Town Green, Farmington' }],
  },
  {
    id: 'market',
    title: 'Saturday Farmers Market',
    category: 'Market',
    recurrenceSummary: 'Every Saturday through October',
    occurrences: [
      { id: 'mk-1', start: '2026-06-06', allDay: true, location: 'Main St Lot' },
      { id: 'mk-2', start: '2026-06-13', allDay: true, location: 'Main St Lot' },
      { id: 'mk-3', start: '2026-06-20', allDay: true, location: 'Main St Lot' },
      { id: 'mk-4', start: '2026-06-27', allDay: true, location: 'Main St Lot' },
    ],
  },
  {
    id: 'concert',
    title: 'Green Concert Series',
    category: 'Music',
    occurrences: [{ id: 'cc-1', start: '2026-06-13T19:00:00-04:00', allDay: false, location: 'Bandshell' }],
  },
  {
    id: 'exhibit',
    title: 'Summer Art Exhibit',
    category: 'Festival',
    occurrences: [{ id: 'ex-1', start: '2026-06-01', end: '2026-06-30', allDay: true, location: 'Arts Center' }],
  },
];

/** A dense day to exercise "+N more" overflow. */
export const overflowEvents: CalendarEvent[] = Array.from({ length: 7 }, (_, i) => ({
  id: `band-${i}`,
  title: `Band ${i + 1}`,
  category: 'Music',
  occurrences: [{ id: `band-${i}-o`, start: `2026-06-20T1${i}:00:00-04:00`, allDay: false }],
}));
