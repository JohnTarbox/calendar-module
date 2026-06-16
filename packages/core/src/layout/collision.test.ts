import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { packDayColumn, peakConcurrency, blockBox, type TimedSegment } from './collision.js';

function seg(key: string, startMin: number, endMin: number): TimedSegment {
  return { key, occurrenceId: key, eventId: key, startMin, endMin };
}

describe('packDayColumn — Defined Equivalent (AVS §6)', () => {
  it('a solitary event spans full width (columnCount 1)', () => {
    const [b] = packDayColumn([seg('a', 540, 600)]);
    expect(b).toMatchObject({ columnIndex: 0, columnCount: 1 });
  });

  it('two overlapping events split into 2 equal columns', () => {
    const out = packDayColumn([seg('a', 540, 660), seg('b', 600, 720)]);
    expect(out.every((b) => b.columnCount === 2)).toBe(true);
    expect(out.map((b) => b.columnIndex).sort()).toEqual([0, 1]);
  });

  it('back-to-back events (touching endpoints) do NOT share a cluster — both full width', () => {
    const out = packDayColumn([seg('a', 540, 600), seg('b', 600, 660)]);
    expect(out.every((b) => b.columnCount === 1)).toBe(true);
  });

  it('a third event overlapping only the first reuses a freed column (peak concurrency = 2)', () => {
    // a:[9,10) b:[9,11) c:[10,12): a&b overlap (2 cols); c starts when a ends → reuses col, peak 2
    const out = packDayColumn([seg('a', 540, 600), seg('b', 540, 660), seg('c', 600, 720)]);
    expect(out.every((b) => b.columnCount === 2)).toBe(true);
  });

  it('zero-duration marker inside an event shares its cluster; at the boundary it does not', () => {
    const inside = packDayColumn([seg('a', 540, 600), seg('z', 570, 570)]);
    expect(inside.every((b) => b.columnCount === 2)).toBe(true);
    const boundary = packDayColumn([seg('a', 540, 600), seg('z', 600, 600)]);
    expect(boundary.every((b) => b.columnCount === 1)).toBe(true);
  });

  it('is deterministic regardless of input order', () => {
    const segs = [seg('a', 540, 660), seg('b', 600, 720), seg('c', 540, 600)];
    const fwd = packDayColumn(segs);
    const rev = packDayColumn([...segs].reverse());
    expect(rev).toEqual(fwd);
  });
});

describe('blockBox — geometry (min-height is visual only, §6)', () => {
  it('height ∝ duration; floors at minBlockPx', () => {
    const full = blockBox(0, 720, 1440, 1440, 22); // half a 24h day in a 1440px grid
    expect(full.height).toBe(720);
    const tiny = blockBox(600, 605, 1440, 1440, 22); // 5 min → floored
    expect(tiny.height).toBe(22);
    expect(tiny.top).toBeCloseTo((600 / 1440) * 1440);
  });

  it('uses the real day length so a DST grid does not drift', () => {
    const springTop = blockBox(120, 180, 1380, 1380, 22).top; // 2 AM on a 1380-min day
    expect(springTop).toBeCloseTo((120 / 1380) * 1380);
  });
});

describe('packDayColumn — property invariants (AVS §6/§8)', () => {
  // Positive-duration intervals: columnCount === peak concurrency holds exactly. (Zero-duration
  // markers are a clamped special case covered by the unit test — they take a column without
  // adding to interval concurrency, so they're excluded from this invariant.)
  const posSegArb = fc
    .record({ id: fc.uuid(), start: fc.integer({ min: 0, max: 1439 }), dur: fc.integer({ min: 1, max: 240 }) })
    .map(({ id, start, dur }) => seg(id, start, Math.min(1440, start + dur)));
  // Degenerate: includes zero-duration markers, for the no-NaN/no-negative geometry fuzz.
  const anySegArb = fc
    .record({ id: fc.uuid(), start: fc.integer({ min: 0, max: 1440 }), dur: fc.integer({ min: 0, max: 240 }) })
    .map(({ id, start, dur }) => seg(id, start, Math.min(1440, start + dur)));

  it('no two blocks share a column AND overlap in time; columnCount = peak concurrency', () => {
    fc.assert(
      fc.property(fc.array(posSegArb, { maxLength: 40 }), (segs) => {
        // de-dup keys (fc.uuid is unique enough, but be safe)
        const uniq = Array.from(new Map(segs.map((s) => [s.key, s])).values());
        const blocks = packDayColumn(uniq);

        // Same-column blocks never strictly overlap.
        for (let i = 0; i < blocks.length; i++) {
          for (let j = i + 1; j < blocks.length; j++) {
            const a = blocks[i]!;
            const b = blocks[j]!;
            if (a.columnIndex === b.columnIndex) {
              const strictOverlap = a.startMin < b.endMin && b.startMin < a.endMin;
              expect(strictOverlap).toBe(false);
            }
          }
        }
        // Every block's columnIndex is within its cluster's columnCount.
        for (const b of blocks) expect(b.columnIndex).toBeLessThan(b.columnCount);

        // Per connected cluster, columnCount === peak concurrency of that cluster.
        // (Group blocks by their columnCount-bearing cluster via a sweep over starts.)
        const byStart = [...blocks].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
        let cluster: typeof byStart = [];
        let maxEnd = -Infinity;
        const checkCluster = (): void => {
          if (!cluster.length) return;
          const peak = peakConcurrency(cluster);
          const cc = cluster[0]!.columnCount;
          expect(cc).toBe(Math.max(peak, 1));
          cluster = [];
          maxEnd = -Infinity;
        };
        for (const b of byStart) {
          if (cluster.length && b.startMin >= maxEnd) checkCluster();
          cluster.push(b);
          maxEnd = Math.max(maxEnd, b.endMin);
        }
        checkCluster();
      }),
    );
  });

  it('fuzz: never produces NaN / negative geometry, even on degenerate input', () => {
    fc.assert(
      fc.property(fc.array(anySegArb, { maxLength: 60 }), (segs) => {
        const uniq = Array.from(new Map(segs.map((s) => [s.key, s])).values());
        for (const b of packDayColumn(uniq)) {
          const box = blockBox(b.startMin, b.endMin, 1440, 1000, 22);
          expect(Number.isFinite(box.top)).toBe(true);
          expect(box.height).toBeGreaterThanOrEqual(22);
          expect(box.top).toBeGreaterThanOrEqual(0);
        }
      }),
    );
  });
});
