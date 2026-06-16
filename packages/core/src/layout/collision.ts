/**
 * Collision layout — the Defined Equivalent (AVS §6). The constants/rules here are OURS,
 * deterministic, and the spec of record for Week/Day/Custom timed-block layout. Pure column
 * assignment over the single-day timed segments in ONE day column; pixel geometry is computed
 * separately (the skin) so the min-block-height floor can never leak into collision math.
 *
 * **Deliberate divergence (record, don't "fix" — review S3-1):** Google *expands* a block to
 * absorb free space to its right when no later-column event overlaps it. This uses **fixed
 * equal-width** columns (`clusterWidth / maxConcurrent`) and does NOT expand-to-fill. Intentional.
 *
 * Overlap is **strict** on `[start, end)`: touching at an endpoint does NOT overlap (back-to-back
 * events share no column). A zero-duration marker (`end === start`) therefore never creates a
 * phantom overlap with a neighbor, but is absorbed by an event that strictly contains its instant.
 */

/** A single-day timed segment to lay out (minutes since midnight in the day column). */
export interface TimedSegment {
  /** Stable key, unique within the day column (a cross-midnight occurrence yields one per day). */
  key: string;
  occurrenceId: string;
  eventId: string;
  startMin: number;
  endMin: number; // >= startMin (clamped upstream); may equal startMin (zero-duration)
  title?: string;
  timeLabel?: string;
  /** True if this segment is the tail of a cross-midnight occurrence (starts at 00:00). */
  continuesFromPrevDay?: boolean;
  /** True if this segment is the head of a cross-midnight occurrence (runs to end-of-day). */
  continuesToNextDay?: boolean;
}

export interface PositionedBlock extends TimedSegment {
  /** 0-based column within its overlap cluster. */
  columnIndex: number;
  /** Number of columns in the cluster = its peak simultaneous count (`maxConcurrent`). */
  columnCount: number;
}

/** Canonical sort: start asc, then end desc (longer first), then stable key (§6 step 1). */
function compareSegments(a: TimedSegment, b: TimedSegment): number {
  if (a.startMin !== b.startMin) return a.startMin - b.startMin;
  if (a.endMin !== b.endMin) return b.endMin - a.endMin; // longer first
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

/**
 * Assign each segment a `(columnIndex, columnCount)` per the §6 Defined Equivalent. Greedy
 * lowest-free-column over connected overlap clusters yields exactly `peakConcurrency` columns
 * (the chromatic number of an interval graph). Deterministic for identical input (stable key).
 */
export function packDayColumn(segments: readonly TimedSegment[]): PositionedBlock[] {
  const sorted = [...segments].sort(compareSegments);
  const out: PositionedBlock[] = [];

  let cluster: TimedSegment[] = [];
  let clusterMaxEnd = -Infinity;

  const flush = (): void => {
    if (cluster.length === 0) return;
    // Greedy column assignment: each segment takes the lowest-indexed column whose last segment
    // ends at or before this one starts (touching is free — strict-overlap rule).
    const columnEnds: number[] = []; // columnEnds[i] = endMin of the last segment placed in col i
    const assigned: Array<{ seg: TimedSegment; columnIndex: number }> = [];
    for (const seg of cluster) {
      let col = columnEnds.findIndex((end) => end <= seg.startMin);
      if (col === -1) {
        col = columnEnds.length;
        columnEnds.push(seg.endMin);
      } else {
        columnEnds[col] = seg.endMin;
      }
      assigned.push({ seg, columnIndex: col });
    }
    const columnCount = columnEnds.length; // = peak concurrency of the cluster
    for (const { seg, columnIndex } of assigned) {
      out.push({ ...seg, columnIndex, columnCount });
    }
    cluster = [];
    clusterMaxEnd = -Infinity;
  };

  for (const seg of sorted) {
    if (cluster.length > 0 && seg.startMin >= clusterMaxEnd) flush(); // disjoint → new cluster
    cluster.push(seg);
    clusterMaxEnd = Math.max(clusterMaxEnd, seg.endMin);
  }
  flush();

  // Restore canonical order for stable rendering/testing.
  out.sort(compareSegments);
  return out;
}

/** Peak simultaneous count among segments (the number of columns the cluster needs). */
export function peakConcurrency(segments: readonly TimedSegment[]): number {
  const events: Array<{ t: number; delta: number }> = [];
  for (const s of segments) {
    if (s.endMin <= s.startMin) continue; // zero-duration adds no concurrency of its own
    events.push({ t: s.startMin, delta: 1 }, { t: s.endMin, delta: -1 });
  }
  // Process ends before starts at the same instant (touching does not overlap).
  events.sort((a, b) => (a.t !== b.t ? a.t - b.t : a.delta - b.delta));
  let cur = 0;
  let peak = 0;
  for (const e of events) {
    cur += e.delta;
    if (cur > peak) peak = cur;
  }
  return peak;
}

/**
 * Pixel box for a block given the day's real length (DST-aware) and the grid height. The
 * `minBlockPx` floor is **visual only** — it never feeds back into {@link packDayColumn}.
 */
export function blockBox(
  startMin: number,
  endMin: number,
  dayLengthMinutes: number,
  gridHeightPx: number,
  minBlockPx: number,
): { top: number; height: number } {
  const len = dayLengthMinutes > 0 ? dayLengthMinutes : 1440;
  const top = (startMin / len) * gridHeightPx;
  const rawHeight = ((Math.max(endMin, startMin) - startMin) / len) * gridHeightPx;
  return { top, height: Math.max(rawHeight, minBlockPx) };
}
