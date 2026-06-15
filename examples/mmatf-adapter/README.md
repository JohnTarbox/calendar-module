# MMATF adapter — REFERENCE (owned by the MMATF developer)

This is the **reference** mapping from MMATF's `events` + `event_days` D1 tables to the frozen
[`CalendarEvent`](../../packages/contract/src/types.ts) contract. It is deliberately kept here,
**outside the published packages**, for two reasons:

1. **The module ships no MMATF-isms** (ES §5/§11). The contract carries no `event_days`, D1 ids,
   price, or hero concepts. The MMATF-specific mapping is *yours* to own and evolve against your
   real tables.
2. **It must not drift into the module core.** The module packages
   (`@johntarbox/calendar-contract` · `core` · `react`) **must never import this file.** Only a
   host/demo (e.g. the local `apps/worker`) consumes it.

## What it does

`toCalendarEvents(events, days, displayTimeZone)` →
[`CalendarEvent[]`](../../packages/contract/src/types.ts), with:

- occurrence ids = the composite `event_days.id` (stable + idempotent across windowed loads),
- all-day `end` made **exclusive** (DTEND) from the inclusive stored `end_day`,
- timed occurrences pinned to `displayTimeZone` with an explicit offset,
- output sorted ascending so it passes the contract's `validateWindow`.

## How to use it

Copy this file into your MMATF codebase (or depend on it as reference) and reconcile the
`EventRow` / `DayRow` shapes against your **actual** `events` / `event_days` columns. Run every
window you produce through the module's `validateWindow` before passing it to `<MonthCalendar>` —
that is the contract gate that keeps the two codebases independent.

See [`docs/Calendar-Module-Integration-Handoff.md`](../../docs/Calendar-Module-Integration-Handoff.md)
for the full integration contract.
