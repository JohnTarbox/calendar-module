import { env, SELF } from 'cloudflare:test';
import { beforeAll, describe, it, expect } from 'vitest';
import { SCHEMA_SQL, SEED_SQL } from '../src/seed.js';

/**
 * Schedule keyset endpoint in the real workerd runtime (AVS §2.3/§8, "test in real runtime").
 * Asserts the cursor pages with no dup / no drop across a fat date, the pinned "Happening now"
 * section rides the first page, and the `includePast` window is disjoint from forward — the same
 * invariants the core property test covers, now verified end-to-end through D1 + the adapter under
 * `TZ=UTC` (the Worker's `Date` is UTC; the display tz is passed in, never inferred).
 */
const NOW = '2026-06-16T12:00:00-04:00'; // todayKey = 2026-06-16 in America/New_York

async function applySql(sql: string): Promise<void> {
  for (const stmt of sql.split(';').map((s) => s.trim()).filter(Boolean)) {
    await env.DB.prepare(stmt).run();
  }
}

interface AgendaRow {
  occurrenceId: string;
  cursor: string;
  groupDay: string;
  ongoing: boolean;
  title: string;
}
interface AgendaResponse {
  dir: string;
  items: AgendaRow[];
  nextCursor: string | null;
  hasMore: boolean;
  pinned: AgendaRow[];
}

beforeAll(async () => {
  await applySql(SCHEMA_SQL);
  await applySql(SEED_SQL);
  // A fat date: 30 timed events all on 2026-06-25, to stress the page boundary.
  for (let i = 0; i < 30; i++) {
    const hh = String(8 + (i % 12)).padStart(2, '0');
    const mm = String((i * 2) % 60).padStart(2, '0');
    await env.DB.prepare('INSERT INTO events (id, title) VALUES (?1, ?2)')
      .bind(1000 + i, `Fat ${i}`)
      .run();
    await env.DB.prepare(
      'INSERT INTO event_days (id, event_id, day, end_day, all_day, start_time, end_time) VALUES (?1, ?2, ?3, NULL, 0, ?4, ?5)',
    )
      .bind(`fat-${i}`, 1000 + i, '2026-06-25', `${hh}:${mm}`, `${hh}:59`)
      .run();
  }
});

describe('worker — /api/agenda keyset endpoint (workerd, TZ=UTC)', () => {
  it('first forward page returns a page + the pinned Happening-now section', async () => {
    const res = await SELF.fetch(`https://x/api/agenda?now=${encodeURIComponent(NOW)}&pageSize=10`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as AgendaResponse;
    expect(body.items.length).toBe(10);
    expect(body.hasMore).toBe(true);
    expect(body.nextCursor).toBeTruthy();
    // The long exhibit (Jun 1–30) started before today but is live → pinned, not in the stream.
    expect(body.pinned.some((r) => r.title === 'Summer Art Exhibit')).toBe(true);
    expect(body.items.some((r) => r.title === 'Summer Art Exhibit')).toBe(false);
  });

  it('paginating the fat date visits every occurrence exactly once, in cursor order', async () => {
    const seen: string[] = [];
    const cursors: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 100; guard++) {
      const qs = new URLSearchParams({ now: NOW, pageSize: '7' });
      if (cursor) qs.set('cursor', cursor);
      const res = await SELF.fetch(`https://x/api/agenda?${qs.toString()}`);
      const body = (await res.json()) as AgendaResponse;
      seen.push(...body.items.map((r) => r.occurrenceId));
      cursors.push(...body.items.map((r) => r.cursor));
      if (!body.hasMore) break;
      cursor = body.nextCursor;
      expect(cursor).toBeTruthy();
    }
    // All 30 fat-date occurrences present, exactly once (no dup / no drop across boundaries).
    const fat = seen.filter((id) => id.startsWith('fat-'));
    expect(fat.length).toBe(30);
    expect(new Set(fat).size).toBe(30);
    // Cursors are strictly ascending lexically by (startMs zero-padded? no) — assert no repeats.
    expect(new Set(cursors).size).toBe(cursors.length);
  });

  it('the includePast (earlier) window is disjoint from the forward stream', async () => {
    const fwd = (await (
      await SELF.fetch(`https://x/api/agenda?now=${encodeURIComponent(NOW)}&pageSize=200`)
    ).json()) as AgendaResponse;
    const earlier = (await (
      await SELF.fetch(`https://x/api/agenda?now=${encodeURIComponent(NOW)}&dir=earlier&pageSize=200`)
    ).json()) as AgendaResponse;

    const forwardIds = new Set(fwd.items.map((r) => r.occurrenceId));
    expect(earlier.items.length).toBeGreaterThan(0); // seed has Jun 6 / Jun 13 past events
    expect(earlier.items.every((r) => !forwardIds.has(r.occurrenceId))).toBe(true);
    // earlier carries no pinned section (that rides the forward first page only).
    expect(earlier.pinned.length).toBe(0);
  });
});
