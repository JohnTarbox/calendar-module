import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { act } from '@testing-library/react';
import type { CalendarConfig, CalendarEvent } from '@jonnyboats/calendar-contract';
import { CalendarMonth } from './CalendarMonth.js';

const config: CalendarConfig = { displayTimeZone: 'America/New_York', locale: 'en-US' };
const NOW = '2026-06-14T12:00:00-04:00';
const events: CalendarEvent[] = [
  { id: 'fair', title: 'Craft Fair', category: 'Fair', occurrences: [{ id: 'fair-1', start: '2026-06-10', allDay: true }] },
];

describe('SSR hydration (ES §8) — "now" stable across the server/client boundary', () => {
  it('hydrates server-rendered markup with no mismatch warning', async () => {
    const el = createElement(CalendarMonth, { events, config, now: NOW });
    const serverHtml = renderToString(el);

    const container = document.createElement('div');
    // eslint-disable-next-line no-unsanitized/property -- trusted: our own server-rendered markup (hydration test)
    container.innerHTML = serverHtml;
    document.body.appendChild(container);

    const errors: unknown[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => errors.push(args));

    await act(async () => {
      hydrateRoot(container, el);
    });

    spy.mockRestore();
    const mismatch = errors
      .map((e) => JSON.stringify(e))
      .filter((s) => /hydrat|did not match|server HTML|Text content/i.test(s));
    expect(mismatch).toEqual([]);
    // The today disc rendered identically on the server (no client-only drift).
    expect(container.querySelector('[aria-current="date"]')).not.toBeNull();
  });
});
