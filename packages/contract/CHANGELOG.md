# @calendar-module/contract

## 1.0.0

### Major Changes

- 1.0.0 — frozen seam + host-embeddable Month.

  The `CalendarEvent` contract is declared stable: any future change is a major bump (enforced by
  `guard:changeset`). `@calendar-module/react` adds the host-facing **`MonthCalendar`** mount API
  (flat props, theme tokens, render slots, navigation/filter callbacks), ships as a proper client
  component (`"use client"` baked into the package entry) for host Next.js App Router / OpenNext
  embedding, and re-exports the contract validators. `CalendarMonth` is kept as a deprecated alias.

### Minor Changes

- 448b817: v0 walking skeleton: the SemVer-frozen `CalendarEvent` contract + Zod validators, the headless
  Month engine (span resolution, ongoing rule, lane-packing + ribbon×overflow, a11y state model,
  `.ics`), and the React Month skin. See `docs/` for the full scope; Week/Day/Year/Schedule, the
  web component, and the MCP server are committed but fenced off until after v0.
