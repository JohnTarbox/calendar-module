**To:** [Calendar Module developer]
**From:** John Tarbox
**Date:** 2026-06-14
**Subject:** Calendar Module — next phase: package the Month view for host embedding + integration handoff

Hi [name],

Excellent work on the v0 walking skeleton — green, pushed, and the build fence held exactly where §0 says it should. The contract froze as written and the property tests are doing real work.

This next phase makes the **Month view consumable by a host application** so the MMATF developer (a separate person) can mount it into meetmeatthefair.com. **You don't need any MMATF access** — keep working against fixtures + Miniflare. The seam between the two of you is the frozen `CalendarEvent` contract; everything below exists to protect it.

**Scope: Month only. The build fence still holds** — do not build Week/Day/Year/Schedule, the web component, the MCP server, the Cowork skill, or the deploy template yet (per §0, until Month is live on MMATF).

## What to build

**1. A host-embeddable SSR package**
Replace the v0 standalone `react-dom/server` Worker proof with a package that SSRs **inside a host Next.js app running on OpenNext/Cloudflare**. The host owns the route and the Next runtime; you provide a component (+ server entry) that renders correctly under the host's streaming SSR with **no hydration mismatch**. Keep the headless core pure (no React/DOM/Cloudflare imports — the lint fence stays); only the skin package gains the host-embedding shim. Ship it as a **versioned, installable artifact** (npm package or pinned git tag).

**2. A documented, stable mount API**
Expose a `<MonthCalendar>` component (or equivalent) consuming:
- `events: CalendarEvent[]` (validated via `validateEvent`)
- `window: { start, end }` (validated via `validateWindow`)
- `now`: ISO string, **host-pinned per request — the engine never reads a clock** (SSR stability)
- `displayTimeZone`: IANA name; invalid → the existing render guard
- `theme` tokens + `LayoutCaps` (cell/row geometry that drives the §10c lane cap)
- render slots / callbacks: `onNavigate`, event popover, day popover, legend filter
Export `validateEvent` / `validateWindow` / `validateConfig` for host-side use.

**3. The integration handoff doc (the load-bearing deliverable)**
A single doc the MMATF dev builds against, covering:
- the frozen `CalendarEvent` JSON shape + schema
- the `events` / `event_days` schema your adapter assumes (so MMATF can reconcile against its own tables)
- the `now`-pinning requirement, windowing semantics, the `(allDay, end)` span table, the >14-day "ongoing" rule
- the confirmed overflow defaults — #1 (formula cap `floor((cellH−headerH)/rowH)`, no fixed 3-lane) and #4 (ongoing strip as a separate band) — and the note that these live in `packages/core` so they are **module-wide, not per-site config**
- the theming token list a host sets to match its look

**4. Hand off the MMATF adapter as reference — don't own it**
The v0 `events`/`event_days` → `CalendarEvent` adapter goes to the MMATF dev as **reference**; the generic contract stays in the module. Mark it clearly as reference so it doesn't drift into the core. The MMATF-specific D1 mapping is the MMATF dev's to own.

**5. Versioning + separation**
Pin a **SemVer release** that MMATF builds against; any `CalendarEvent` change is a major bump. Continue developing against fixtures / Miniflare — you should never need MMATF prod, and the MMATF dev should never fork module internals.

## Out of scope (later phases)
Week/Day/Year/Schedule views, web component, MCP server, Cowork skill, deploy template — all committed-but-not-built per §0. The **v2 write surface** is also later and is gated on a separate **MCP write-authority invariant table** (tracked on the MMATF side as K25) — don't design against a write path yet.

## Coordination
Before the MMATF dev wires the adapter, let's **freeze the seam together** — `CalendarEvent` shape, adapter ownership, theme tokens, and the version MMATF pins to. After that you two work independently.

Thanks again — the spec rigor made v0 a clean build, and this phase is mostly packaging what's already proven.

Best,
John
