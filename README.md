# calendar-module

A **reusable, data-agnostic, headless events-calendar module** — Cloudflare-native,
display-only. One framework-agnostic core, multiple skins (React first), all coding against
a single versioned `CalendarEvent` contract.

> **Status: v0 = Month slice.** This repository currently implements only the v0 *walking
> skeleton* (a single vertical slice): the `CalendarEvent` contract + validators → headless
> **Month** engine (lane-packing + ribbon×overflow + ongoing rule) → React **Month** skin →
> a local Miniflare-D1 windowed endpoint + MMATF adapter + SSR-safe Month page. **Week/Day,
> Year, Schedule, the web component, the MCP server, and the deploy template are committed
> but deliberately fenced off** — see `docs/` for the full scope and phasing.

## Packages

| Package | Role |
|---|---|
| `@calendar-module/contract` | `CalendarEvent`/`Occurrence`/`CalendarConfig` types + Zod `validateEvent`/`validateWindow` + JSON schema. The SemVer-frozen seam. |
| `@calendar-module/core` | Headless engine — pure TS, **no React/DOM/Cloudflare**. Occurrence model, lane-packing, ongoing rule, `.ics`, Luxon view math, a11y state model. |
| `@calendar-module/react` | Month skin + theming tokens. Binds the core a11y API to the DOM; renders nothing unsafe. |
| `apps/harness` | Storybook + fixtures (dev/test harness; no network). |
| `apps/worker` | Cloudflare Worker — windowed data endpoint + OpenNext SSR Month + MMATF adapter (local Miniflare D1 for v0). |

## Authoritative specs

The two specs in `docs/` are the source of truth — **build to them, do not re-derive
locked decisions**:

- `docs/Calendar-Module-01-Google-Display-Reference-Spec.md` — display behavior (RS).
- `docs/Calendar-Module-02-Engineering-Spec-Dev-Handoff.md` — architecture/contract/testing (ES).
- `docs/Calendar-Module-04-Adversarial-Review-v1.2.md` — why several rules exist.
- `docs/Calendar-Module-05-Claude-Code-Kickoff.md` — the v0 work order.

## Develop

```bash
corepack enable pnpm          # provision pnpm (see CONTRIBUTING)
pnpm install --frozen-lockfile
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Tests run with `TZ=UTC` for deterministic timezone behavior; the Worker tests run inside the
real `workerd` runtime via `@cloudflare/vitest-pool-workers`.

## License

[Apache-2.0](./LICENSE) — permissive, with an explicit patent grant. See [`NOTICE`](./NOTICE)
for third-party attributions. Contributions require a [DCO](./CONTRIBUTING.md) `Signed-off-by`.
