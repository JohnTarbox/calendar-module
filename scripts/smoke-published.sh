#!/usr/bin/env bash
# Packaging smoke test. Packs the publishable tarballs (pnpm rewrites workspace:* → real
# versions), installs them into a CLEAN throwaway consumer project, then imports + SSR-renders the
# real packaged artifact. Catches regressions the source-level suite can't see: a dropped
# "use client" directive, a broken exports map, a missing styles file, or a bad transitive-dep
# rewrite. Run locally with `pnpm smoke`; CI runs the same command.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "smoke: building + packing tarballs"
( cd "$ROOT" && pnpm build >/dev/null )
for pkg in contract core react; do
  ( cd "$ROOT/packages/$pkg" && pnpm pack --pack-destination "$TMP" >/dev/null )
done

C="$(ls "$TMP"/jonnyboats-calendar-contract-*.tgz)"
O="$(ls "$TMP"/jonnyboats-calendar-core-*.tgz)"
R="$(ls "$TMP"/jonnyboats-calendar-react-*.tgz)"

# Consumer project: install react's tarball; force the transitive deps to the LOCAL tarballs too
# (via overrides) so the smoke tests THIS commit's packaging, not whatever is on the registry.
cat > "$TMP/package.json" <<JSON
{
  "name": "cm-smoke-consumer",
  "private": true,
  "type": "module",
  "dependencies": {
    "@jonnyboats/calendar-react": "file:$R",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "pnpm": {
    "overrides": {
      "@jonnyboats/calendar-contract": "file:$C",
      "@jonnyboats/calendar-core": "file:$O"
    }
  }
}
JSON

cp "$ROOT/scripts/smoke-consumer.mjs" "$TMP/smoke.mjs"

echo "smoke: installing packed tarballs into a clean project"
( cd "$TMP" && pnpm install --silent --ignore-workspace >/dev/null )

echo "smoke: importing + SSR-rendering the published artifact"
( cd "$TMP" && node smoke.mjs )
