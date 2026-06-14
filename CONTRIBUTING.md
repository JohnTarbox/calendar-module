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

## Before you push

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

- **TDD:** each Reference-Spec rule and `[AC]` becomes a named test — the spec is the test
  backlog (ES §6). Property/fuzz tests run fixed-seed on PRs and random-seed nightly; persist
  any failing seed as a permanent regression.
- **The contract is the seam.** Nothing in `core`/`react` may import Cloudflare; the contract
  carries no MMATF-isms. Changes to `@calendar-module/contract` are SemVer-significant — add a
  Changeset (`pnpm changeset`).
- **Render-safety is non-negotiable:** never `dangerouslySetInnerHTML` untrusted content; the
  Zod URL/`mapUrl` allowlist is the single protocol gate (ES §7).

## Genuine ambiguity

If you hit a decision not covered by RS/ES, **stop and flag it** rather than inventing one.
The specs are the result of multiple review passes.
