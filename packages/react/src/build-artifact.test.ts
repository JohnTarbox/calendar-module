import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The skin is a client component; a host Next.js Server Component importing it requires the
 * built entry to begin with `"use client"`. esbuild strips source/banner directives during
 * bundling, so the directive is prepended in a tsup post-build step. This test fails CI if that
 * ever regresses — the single highest-value guard for the host-embedding contract.
 *
 * Requires a prior build (dist/). `pnpm verify` builds before testing.
 */
describe('package build artifact', () => {
  it('dist/index.js starts with the "use client" directive', () => {
    // Robust to running from the package dir (filtered) or the repo root (pnpm verify).
    const entry = [
      resolve(process.cwd(), 'dist/index.js'),
      resolve(process.cwd(), 'packages/react/dist/index.js'),
    ].find(existsSync);
    expect(entry, 'built dist/index.js not found — run the build first').toBeTruthy();
    const code = readFileSync(entry!, 'utf8').trimStart();
    expect(code.startsWith('"use client"') || code.startsWith("'use client'")).toBe(true);
  });
});
