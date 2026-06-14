import { env, SELF } from 'cloudflare:test';
import { beforeAll, describe, it, expect } from 'vitest';
import { validateWindow, type CalendarEvent } from '@calendar-module/contract';
import { SCHEMA_SQL, SEED_SQL } from '../src/seed.js';

async function applySql(sql: string): Promise<void> {
  for (const stmt of sql.split(';').map((s) => s.trim()).filter(Boolean)) {
    await env.DB.prepare(stmt).run();
  }
}

beforeAll(async () => {
  await applySql(SCHEMA_SQL);
  await applySql(SEED_SQL);
});

describe('worker — windowed D1 endpoint + MMATF adapter (workerd runtime)', () => {
  it('serves a windowed, contract-valid CalendarEvent[] mapped from events+event_days', async () => {
    const res = await SELF.fetch('https://x/api/events?from=2026-05-31&to=2026-07-04');
    expect(res.status).toBe(200);
    const events = (await res.json()) as CalendarEvent[];
    // The adapter output must satisfy the contract's window invariants.
    expect(validateWindow(events).success).toBe(true);
    expect(events.map((e) => e.id).sort()).toEqual(['1', '2', '3', '4']);
    // The long event maps to a single multi-day occurrence with an EXCLUSIVE DTEND.
    const exhibit = events.find((e) => e.id === '4')!;
    expect(exhibit.occurrences[0]!.end).toBe('2026-07-01'); // 2026-06-30 inclusive + 1
    // The timed concert carries a wall-clock start with offset + a zone.
    const concert = events.find((e) => e.id === '3')!;
    expect(concert.occurrences[0]!.timezone).toBe('America/New_York');
    expect(concert.occurrences[0]!.start).toMatch(/^2026-06-13T19:00/);
  });

  it('only returns events intersecting the requested window', async () => {
    const res = await SELF.fetch('https://x/api/events?from=2026-06-19&to=2026-06-21');
    const events = (await res.json()) as CalendarEvent[];
    const ids = events.map((e) => e.id).sort();
    // Market (Jun 20) + the long exhibit span; not the Jun 6/13-only events.
    expect(ids).toContain('2');
    expect(ids).toContain('4');
    expect(ids).not.toContain('3'); // concert is Jun 13 only
  });

  it('SSRs the Month page (indexable HTML) from D1 with a pinned now', async () => {
    const res = await SELF.fetch('https://x/?now=2026-06-14T12:00:00-04:00');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('role="grid"');
    expect(html).toContain('Saturday Farmers Market'); // a fixture event rendered server-side
    expect(html).toContain('aria-current="date"'); // today disc, stable from the pinned now
    expect(html).toContain('id="cm-initial-data"'); // serialized props for drop-in hydration
  });

  it('an invalid displayTimeZone renders the error guard, never a 500/blank (S2-9)', async () => {
    const res = await SELF.fetch('https://x/?tz=Not/AZone&now=2026-06-14T12:00:00-04:00');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-testid="cm-error"');
  });

  it('escapes a hostile event title in the embedded <script> JSON (no XSS breakout, ES §7)', async () => {
    await env.DB.prepare('INSERT INTO events (id, title) VALUES (?1, ?2)')
      .bind(99, '</script><img src=x onerror=alert(1)>')
      .run();
    await env.DB.prepare(
      "INSERT INTO event_days (id, event_id, day, end_day, all_day) VALUES ('99-d', 99, '2026-06-15', NULL, 1)",
    ).run();

    const res = await SELF.fetch('https://x/?now=2026-06-14T12:00:00-04:00');
    const html = await res.text();
    // The raw closing-tag breakout must NOT appear anywhere (body is React-escaped; the
    // serialized JSON is escapeForScript-escaped).
    expect(html).not.toContain('</script><img');
    // The serialized data carries the title with `<` neutralized to the JSON escape.
    expect(html).toContain('\\u003c/script');
  });
});
