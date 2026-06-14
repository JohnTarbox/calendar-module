import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import type { CalendarConfig } from '@calendar-module/contract';
import { validateConfig } from '@calendar-module/contract';
import { buildMonthGrid, todayMonthAnchor } from '@calendar-module/core';
import { CalendarMonth } from '@calendar-module/react';
import { fetchWindow, type Env } from './data.js';

/**
 * Cloudflare Worker: a windowed events endpoint over D1 + SSR-safe Month page (ES §0 finish
 * line, local form). "now" is pinned once per request (request-time), passed explicitly into
 * both the data window and the render, so the today-disc is stable across the SSR boundary —
 * the Worker's `Date` is UTC, but the display tz is always passed in, never inferred (ES §8).
 *
 * Note: v0 renders server HTML via react-dom/server. A client hydration bundle + OpenNext are
 * the MMATF-integration step deferred to a connected environment; the serialized props below
 * make that hydration drop-in (same `now`, same events → no mismatch).
 */
function resolveConfig(env: Env, tzOverride?: string | null): CalendarConfig {
  const displayTimeZone = tzOverride || env.DISPLAY_TZ || 'America/New_York';
  const check = validateConfig({ displayTimeZone, locale: 'en-US', weekStartsOn: 0 });
  if (!check.success || !check.data) {
    throw new ConfigError(check.errors.join('; ') || 'invalid displayTimeZone');
  }
  return check.data;
}

class ConfigError extends Error {}

/**
 * Escape a JSON string for safe embedding inside a `<script>` element. Untrusted event data
 * (titles, locations) could contain `</script>` or `<!--`, which the HTML parser would act on
 * even inside `type="application/json"` — a stored-XSS breakout (ES §7, threat #1). Escaping
 * `<` plus the U+2028 / U+2029 JS line separators keeps the payload a single inert text node;
 * `JSON.parse` restores the original on hydration since these are valid JSON escapes. The
 * separator regexes are built from strings so no literal separator bytes live in source.
 */
function escapeForScript(json: string): string {
  return json
    .replace(/</g, '\\u003c')
    .replace(new RegExp('\\u2028', 'g'), '\\u2028')
    .replace(new RegExp('\\u2029', 'g'), '\\u2029');
}

function htmlShell(body: string, dataScript: string, status = 200): Response {
  const safeData = escapeForScript(dataScript);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Events</title></head><body><div id="root">${body}</div>
<script type="application/json" id="cm-initial-data">${safeData}</script>
</body></html>`;
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    // "now" pinned once per request (request-time). `?now=` is a test/SSR hook for a fixed
    // clock so the today-disc is reproducible; `?tz=` exercises the bad-zone guard.
    const now = url.searchParams.get('now') ?? new Date().toISOString();

    // Resolve config behind the render-time guard (S2-9): a bad zone renders the error state,
    // never a 500 / blank page.
    let config: CalendarConfig;
    try {
      config = resolveConfig(env, url.searchParams.get('tz'));
    } catch (e) {
      if (e instanceof ConfigError) {
        const body = renderToString(
          createElement(CalendarMonth, {
            events: [],
            config: { displayTimeZone: 'UTC' },
            now,
            status: 'error',
          }),
        );
        return htmlShell(body, JSON.stringify({ error: e.message }), 200);
      }
      throw e;
    }

    // --- JSON windowed endpoint ---
    if (url.pathname === '/api/events') {
      const anchor = todayMonthAnchor(now, config);
      const grid = buildMonthGrid(anchor, config, now);
      const from = url.searchParams.get('from') ?? grid.weeks[0]!.cells[0]!.date;
      const lastWeek = grid.weeks[grid.weeks.length - 1]!;
      const to = url.searchParams.get('to') ?? lastWeek.cells[lastWeek.cells.length - 1]!.date;
      try {
        const events = await fetchWindow(env, from, to, config.displayTimeZone);
        return Response.json(events, {
          headers: { 'cache-control': 's-maxage=300, stale-while-revalidate=600' },
        });
      } catch (err) {
        return Response.json({ error: String((err as Error).message) }, { status: 500 });
      }
    }

    // --- SSR Month page ---
    if (url.pathname === '/' || url.pathname === '/events') {
      const anchor = todayMonthAnchor(now, config);
      const grid = buildMonthGrid(anchor, config, now);
      const from = grid.weeks[0]!.cells[0]!.date;
      const lastWeek = grid.weeks[grid.weeks.length - 1]!;
      const to = lastWeek.cells[lastWeek.cells.length - 1]!.date;
      try {
        const events = await fetchWindow(env, from, to, config.displayTimeZone);
        const body = renderToString(createElement(CalendarMonth, { events, config, now }));
        return htmlShell(body, JSON.stringify({ events, config, now }));
      } catch {
        const body = renderToString(
          createElement(CalendarMonth, { events: [], config, now, status: 'error' }),
        );
        return htmlShell(body, JSON.stringify({ error: 'fetch failed' }), 200);
      }
    }

    return new Response('Not found', { status: 404 });
  },
};
