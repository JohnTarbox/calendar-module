import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToPipeableStream } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { act } from '@testing-library/react';
import { Writable } from 'node:stream';
import type { CalendarEvent } from '@calendar-module/contract';
import { MonthCalendar } from './MonthCalendar.js';

const NOW = '2026-06-14T12:00:00-04:00';
const events: CalendarEvent[] = [
  { id: 'fair', title: 'Craft Fair', category: 'Fair', occurrences: [{ id: 'fair-1', start: '2026-06-10', allDay: true }] },
];

function streamToString(el: React.ReactElement): Promise<string> {
  return new Promise((resolve, reject) => {
    let out = '';
    const sink = new Writable({
      write(chunk, _enc, cb) {
        out += chunk.toString();
        cb();
      },
    });
    sink.on('finish', () => resolve(out));
    const { pipe } = renderToPipeableStream(el, {
      onAllReady() {
        pipe(sink);
      },
      onError: reject,
    });
  });
}

/**
 * The host renders via streaming SSR (`renderToPipeableStream` — the streaming server API
 * Next/OpenNext use), then hydrates on the client. This is the on-box analogue of mounting
 * inside a host app: it proves the `MonthCalendar` path is SSR-stable (host-pinned `now`, tz
 * always explicit) with no hydration mismatch. Real in-host RSC/Suspense verification is
 * deferred to a connected environment.
 */
describe('streaming SSR + hydrate via MonthCalendar (ES §8)', () => {
  it('hydrates streamed server output with no mismatch', async () => {
    const el = createElement(MonthCalendar, {
      events,
      displayTimeZone: 'America/New_York',
      now: NOW,
      locale: 'en-US',
      window: { start: '2026-05-31', end: '2026-07-04' },
    });

    const html = await streamToString(el);
    expect(html).toContain('role="grid"');
    expect(html).toContain('aria-current="date"');

    const container = document.createElement('div');
    // eslint-disable-next-line no-unsanitized/property -- trusted: our own streamed server markup
    container.innerHTML = html;
    document.body.appendChild(container);

    const errors: unknown[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...a) => errors.push(a));
    await act(async () => {
      hydrateRoot(container, el);
    });
    spy.mockRestore();

    const mismatch = errors
      .map((e) => JSON.stringify(e))
      .filter((s) => /hydrat|did not match|server HTML|Text content/i.test(s));
    expect(mismatch).toEqual([]);
    expect(container.querySelector('[aria-current="date"]')).not.toBeNull();
  });
});
