import { env, SELF } from 'cloudflare:test';
import { beforeAll, describe, it, expect } from 'vitest';
import { SCHEMA_SQL, SEED_SQL } from '../src/seed.js';

/**
 * Year presence endpoint in the real workerd runtime (AVS §3.2, "test in real runtime"). Asserts
 * the per-day per-category map dots the right days (incl. every day of a multi-day span), carries
 * NO event payloads (the cheap-presence contract), and degrades safely under `TZ=UTC` (display tz
 * passed in, never inferred).
 */
const NOW = '2026-06-16T12:00:00-04:00';

async function applySql(sql: string): Promise<void> {
  for (const stmt of sql.split(';').map((s) => s.trim()).filter(Boolean)) {
    await env.DB.prepare(stmt).run();
  }
}

beforeAll(async () => {
  await applySql(SCHEMA_SQL);
  await applySql(SEED_SQL);
});

describe('worker — /api/presence (workerd, TZ=UTC)', () => {
  it('returns a per-day per-category map for the year', async () => {
    const res = await SELF.fetch(`https://x/api/presence?year=2026&now=${encodeURIComponent(NOW)}`);
    expect(res.status).toBe(200);
    const map = (await res.json()) as Record<string, string[]>;

    // The market (id 2) dots each of its three single days with its category.
    expect(map['2026-06-06']).toContain('Market');
    expect(map['2026-06-13']).toContain('Market');
    expect(map['2026-06-20']).toContain('Market');

    // The long exhibit (Jun 1–30 inclusive) dots EVERY day it spans.
    for (let d = 1; d <= 30; d++) {
      const key = `2026-06-${String(d).padStart(2, '0')}`;
      expect(map[key], `expected a dot on ${key}`).toBeTruthy();
    }
    // The concert day carries both Music (concert) and Market (Jun 13 market).
    expect(map['2026-06-13']).toEqual(expect.arrayContaining(['Market', 'Music']));
  });

  it('carries NO event payloads — only dates + category labels', async () => {
    const res = await SELF.fetch(`https://x/api/presence?year=2026&now=${encodeURIComponent(NOW)}`);
    const text = await res.text();
    expect(text).not.toMatch(/title|occurrences|venue|url|location/i);
  });

  it('defaults the year to now when ?year= is absent', async () => {
    const res = await SELF.fetch(`https://x/api/presence?now=${encodeURIComponent(NOW)}`);
    const map = (await res.json()) as Record<string, string[]>;
    expect(Object.keys(map).every((k) => k.startsWith('2026-'))).toBe(true);
  });
});
