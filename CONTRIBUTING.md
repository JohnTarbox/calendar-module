# Contributing

Thanks for your interest in calendar-module.

## Developer Certificate of Origin (DCO)

This project uses the [DCO](https://developercertificate.org/) instead of a CLA. Every
commit must be signed off, certifying you wrote the code or have the right to submit it:

```
Signed-off-by: Your Name <you@example.com>
```

Add it automatically with `git commit -s`. PRs with unsigned commits will be asked to amend.

## Toolchain

- **Node 20+**, **pnpm** (provisioned via corepack: `corepack enable pnpm`).
- Commit the lockfile. CI runs `pnpm install --frozen-lockfile` — never a plain install.

## Workflow

- **Work on a branch and open a PR** — don't push straight to `main`. CI runs on the PR, so a
  red build is caught *before* it reaches the shared branch (and never lands on `main`).
- **`pnpm verify` is the single source of truth.** It runs `build → typecheck → lint → test`
  in that order — the same script CI runs and the same one the pre-push hook runs, so
  "passes locally" and "passes in CI" cannot diverge. (The build must come first: cross-package
  imports resolve through each package's `exports` → `dist`, so the libs are built before
  anything typechecks or tests against them.)
- **A pre-push hook runs `pnpm verify` automatically.** It's wired by the `prepare` script
  (`git config core.hooksPath .githooks`) on `pnpm install`, so a fresh clone gets it for free.
  Bypass in an emergency with `git push --no-verify`.

## Before you push

```bash
pnpm install --frozen-lockfile
pnpm verify   # build → typecheck → lint → test (exactly what CI runs)
```

- **TDD:** each Reference-Spec rule and `[AC]` becomes a named test — the spec is the test
  backlog (ES §6). Property/fuzz tests run fixed-seed on PRs and random-seed nightly; persist
  any failing seed as a permanent regression.
- **The contract is the seam.** Nothing in `core`/`react` may import Cloudflare; the contract
  carries no MMATF-isms. **Any change to the `CalendarEvent` contract is a SemVer-MAJOR bump** —
  add a `major` changeset for `@johntarbox/calendar-contract` (`pnpm changeset`). CI enforces this:
  `pnpm guard:changeset` fails if `packages/contract/src/{schema,types}.ts` changed without one.
  A host (e.g. MMATF) pins `^1.0.0` and treats a major as a coordinated migration.
- **Render-safety is non-negotiable:** never `dangerouslySetInnerHTML` untrusted content; the
  Zod URL/`mapUrl` allowlist is the single protocol gate (ES §7).

## Genuine ambiguity

If you hit a decision not covered by RS/ES, **stop and flag it** rather than inventing one.
The specs are the result of multiple review passes.
