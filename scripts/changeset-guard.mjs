#!/usr/bin/env node
/**
 * CalendarEvent-major guard. The contract is the seam: any change to its SHAPE is a SemVer-MAJOR
 * event (the module's own rule). Changesets has no built-in "this file = major", so this enforces
 * it — keyed on the generated JSON-schema artifact, which is the true shape signal (a comment or a
 * package rename doesn't change it; adding/removing a field does).
 *
 * Two gates:
 *  1. Staleness — the committed schema artifact must match the one generated from the built
 *     contract (so the artifact tracks the code; regenerate with `pnpm gen:schema`).
 *  2. Major — if the schema artifact was MODIFIED vs the base branch, a `major` changeset must
 *     target the contract package. A newly-ADDED artifact (first commit) is exempt.
 *
 * Best-effort: skips gracefully when the contract isn't built or the base ref is unavailable, so
 * it's safe to run anywhere in `pnpm verify`. The PR's CI (full history) is the authoritative gate.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SCHEMA_PATH, serialize } from './schema-artifact.mjs';

const CONTRACT_PKG = '@jonnyboats/calendar-contract';
const BASE = process.env.CHANGESET_GUARD_BASE || 'origin/main';
if (!/^[\w./-]+$/.test(BASE)) {
  console.error(`changeset-guard: refusing unsafe base ref '${BASE}'.`);
  process.exit(1);
}

const sh = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

// --- Gate 1: staleness (requires the contract to be built) ---
try {
  const { calendarEventJsonSchema } = await import('../packages/contract/dist/index.js');
  const generated = serialize(calendarEventJsonSchema);
  const committed = existsSync(SCHEMA_PATH) ? readFileSync(SCHEMA_PATH, 'utf8') : '';
  if (committed !== generated) {
    console.error(`changeset-guard: ${SCHEMA_PATH} is stale vs the built contract. Run \`pnpm gen:schema\`.`);
    process.exit(1);
  }
} catch {
  console.log('changeset-guard: contract not built — skipping staleness check (informational).');
}

// --- Gate 2: major-on-shape-change ---
let mergeBase;
try {
  mergeBase = sh(`git merge-base ${BASE} HEAD`);
} catch {
  console.log(`changeset-guard: base '${BASE}' unavailable — skipping major check (informational).`);
  process.exit(0);
}

const modified = sh(`git diff --diff-filter=M --name-only ${mergeBase} HEAD`).split('\n').filter(Boolean);
if (!modified.includes(SCHEMA_PATH)) {
  console.log('changeset-guard: contract shape unchanged — ok.');
  process.exit(0);
}

const dir = '.changeset';
const hasMajor = readdirSync(dir)
  .filter((f) => f.endsWith('.md') && f !== 'README.md')
  .some((f) => new RegExp(`["']${CONTRACT_PKG.replace('/', '\\/')}["']\\s*:\\s*major`).test(readFileSync(join(dir, f), 'utf8')));

if (!hasMajor) {
  console.error(
    `changeset-guard: the CalendarEvent schema changed but no MAJOR changeset targets\n` +
      `"${CONTRACT_PKG}". A contract shape change is a major bump.\n` +
      `Run \`pnpm changeset\` and select a major bump for ${CONTRACT_PKG}.`,
  );
  process.exit(1);
}
console.log('changeset-guard: contract shape change has a major changeset — ok.');
