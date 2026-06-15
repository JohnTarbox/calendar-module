# calendar-module

[![npm](https://img.shields.io/npm/v/@jonnyboats/calendar-react.svg)](https://www.npmjs.com/package/@jonnyboats/calendar-react)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
[![CI](https://github.com/JohnTarbox/calendar-module/actions/workflows/ci.yml/badge.svg)](https://github.com/JohnTarbox/calendar-module/actions/workflows/ci.yml)

A **reusable, data-agnostic, headless events-calendar module** — Cloudflare-native,
display-only. One framework-agnostic core, multiple skins (React first), all coding against
a single versioned `CalendarEvent` contract.

> **Status: Month view — published (`@jonnyboats/calendar-*@1.x`) and running in production.**
> The `CalendarEvent` contract + validators → headless **Month** engine (lane-packing +
> ribbon×overflow + ongoing rule) → host-embeddable React **Month** skin (`MonthCalendar`,
> Next.js App Router / OpenNext-ready). **Schedule + Year (v1) and Week/Day/Custom, the web
> component, and the MCP server (v2) are committed but deliberately fenced off** — see `docs/`.

## Quick start

```bash
pnpm add @jonnyboats/calendar-react        # or: npm install / yarn add (pulls in core + contract)
```

```tsx
import { MonthCalendar } from '@jonnyboats/calendar-react';
import '@jonnyboats/calendar-react/styles'; // once, e.g. in your root layout

export function Calendar({ events }) {
  return (
    <MonthCalendar
      events={events}                    // CalendarEvent[] — validate with validateWindow first
      displayTimeZone="America/New_York" // IANA; invalid → render guard, never a crash
      now={new Date().toISOString()}     // host-pinned per request → SSR-stable "today"
    />
  );
}
```

`MonthCalendar` is a **client component** (the `"use client"` directive ships in the build), so it
drops straight into a Next.js App Router Server Component. Full integration guide — the contract,
the `events`/`event_days` adapter, theming tokens, and `LayoutCaps` geometry — is in
[`docs/Calendar-Module-Integration-Handoff.md`](./docs/Calendar-Module-Integration-Handoff.md).

## Packages

| Package | Role |
|---|---|
| `@jonnyboats/calendar-contract` | `CalendarEvent`/`Occurrence`/`CalendarConfig` types + Zod `validateEvent`/`validateWindow` + JSON schema. The SemVer-frozen seam. |
| `@jonnyboats/calendar-core` | Headless engine — pure TS, **no React/DOM/Cloudflare**. Occurrence model, lane-packing, ongoing rule, `.ics`, Luxon view math, a11y state model. |
| `@jonnyboats/calendar-react` | Month skin + theming tokens. Binds the core a11y API to the DOM; renders nothing unsafe. |
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
pnpm build                          # build libs first: cross-package types resolve via exports → dist
pnpm typecheck && pnpm lint && pnpm test
```

Tests run with `TZ=UTC` for deterministic timezone behavior; the Worker tests run inside the
real `workerd` runtime via `@cloudflare/vitest-pool-workers`.

## License

[Apache-2.0](./LICENSE) — permissive, with an explicit patent grant. See [`NOTICE`](./NOTICE)
for third-party attributions. Contributions require a [DCO](./CONTRIBUTING.md) `Signed-off-by`.
