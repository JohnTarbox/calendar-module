#!/usr/bin/env node
/**
 * CalendarEvent-major guard. The contract is the seam: any change to its shape is a SemVer-MAJOR
 * event (the module's own rule). Changesets has no built-in "this file = major", so this script
 * fails CI if `packages/contract/src/{schema,types}.ts` changed in the branch but no `major`
 * changeset targets `@calendar-module/contract`.
 *
 * Best-effort: if the base ref isn't available (shallow clone, detached, or running on the base
 * itself), it SKIPS rather than failing — so it's safe to run anywhere in `pnpm verify`. The PR's
 * CI (with full history) is the authoritative gate.
 */
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.CHANGESET_GUARD_BASE || 'origin/main';
// Guard against shell injection via the env var: a git ref is a restricted character set.
if (!/^[\w./-]+$/.test(BASE)) {
  console.error(`changeset-guard: refusing unsafe base ref '${BASE}'.`);
  process.exit(1);
}
const WATCHED = ['packages/contract/src/schema.ts', 'packages/contract/src/types.ts'];

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

let mergeBase;
try {
  mergeBase = sh(`git merge-base ${BASE} HEAD`);
} catch {
  console.log(`changeset-guard: base '${BASE}' unavailable — skipping (informational).`);
  process.exit(0);
}

const changed = sh(`git diff --name-only ${mergeBase} HEAD`).split('\n').filter(Boolean);
const contractTouched = changed.some((f) => WATCHED.includes(f));
if (!contractTouched) {
  console.log('changeset-guard: contract shape unchanged — ok.');
  process.exit(0);
}

const dir = '.changeset';
const hasMajor = readdirSync(dir)
  .filter((f) => f.endsWith('.md') && f !== 'README.md')
  .some((f) => /["']@calendar-module\/contract["']\s*:\s*major/.test(readFileSync(join(dir, f), 'utf8')));

if (!hasMajor) {
  console.error(
    'changeset-guard: the CalendarEvent contract (schema.ts/types.ts) changed but no MAJOR\n' +
      'changeset targets "@calendar-module/contract". A contract change is a major bump.\n' +
      'Run `pnpm changeset` and select a major bump for @calendar-module/contract.',
  );
  process.exit(1);
}
console.log('changeset-guard: contract change has a major changeset — ok.');
