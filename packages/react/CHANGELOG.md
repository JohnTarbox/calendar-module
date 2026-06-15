# @jonnyboats/calendar-react

## 1.0.2

### Patch Changes

- Ongoing strip now renders a human-readable through-date ("Dec 19, 2026") instead of the raw ISO
  date ("2026-12-19"). Surfaced by the live MMATF integration.

## 1.0.1

### Patch Changes

- Verify the OIDC Trusted Publishing release pipeline (no functional change).

## 1.0.0

### Major Changes

- 1.0.0 — frozen seam + host-embeddable Month.

  The `CalendarEvent` contract is declared stable: any future change is a major bump (enforced by
  `guard:changeset`). `@jonnyboats/calendar-react` adds the host-facing **`MonthCalendar`** mount API
  (flat props, theme tokens, render slots, navigation/filter callbacks), ships as a proper client
  component (`"use client"` baked into the package entry) for host Next.js App Router / OpenNext
  embedding, and re-exports the contract validators. `CalendarMonth` is kept as a deprecated alias.

### Minor Changes

- 448b817: v0 walking skeleton: the SemVer-frozen `CalendarEvent` contract + Zod validators, the headless
  Month engine (span resolution, ongoing rule, lane-packing + ribbon×overflow, a11y state model,
  `.ics`), and the React Month skin. See `docs/` for the full scope; Week/Day/Year/Schedule, the
  web component, and the MCP server are committed but fenced off until after v0.

### Patch Changes

- Updated dependencies
- Updated dependencies [448b817]
  - @jonnyboats/calendar-contract@1.0.0
  - @jonnyboats/calendar-core@1.0.0
