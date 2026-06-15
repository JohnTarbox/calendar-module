# Recipe: mount `MonthCalendar` in a host Next.js App Router app (OpenNext/Cloudflare)

The host owns the route, the Next runtime, and data fetching. The module gives you a client
component and the contract validators. This recipe is **typecheck-only** in this repo (no Next
runtime on the air-gapped build machine); it proves the call site compiles against the real
published types. Verify the actual mount in your host app.

## 1. Install (pin the version)

```bash
pnpm add @jonnyboats/calendar-react@^1.0.0   # or install by the pinned git tag
```

Any `CalendarEvent` change is a **major** bump — pin to `^1` and treat a major as a coordinated
migration.

## 2. Import the styles once (root layout)

```tsx
// app/layout.tsx
import '@jonnyboats/calendar-react/styles';
```

## 3. Render in a Server Component (`app/calendar/page.tsx`)

See [`app/calendar/page.tsx`](./app/calendar/page.tsx). The shape:

- **Pin `now`** at request time (`new Date().toISOString()`) and pass it in — the engine never
  reads a clock, so the today-disc is stable across the SSR boundary.
- **Fetch your window** from your own D1/API. The module never fetches.
- **`validateWindow(events)`** before rendering — the seam gate. On failure, render with
  `status="error"` (the module's guard) rather than throwing.
- Pass `displayTimeZone` (IANA; invalid → the error guard), optional `theme` tokens, optional
  `window`, and optional `caps` (cell/row geometry → the §10c lane cap).

`MonthCalendar` is a client component (`"use client"` is baked into the package entry), so you can
import it directly into a Server Component; it renders on the server and hydrates on the client.

## 4. Refetch on navigation

Wire `onNavigate({ anchor, window })` to refetch the new month's window (the grid leads/trails into
adjacent months, so fetch the reported `window`, not just the anchor month).

## 5. OpenNext/Cloudflare notes

- Disable host-side HTML transforms that rewrite markup post-render (e.g. Cloudflare **Auto
  Minify**) — they are a common cause of hydration mismatches.
- The display timezone must be resolvable server-side (tenant-fixed/cookie-pinned), or the
  today-disc can't be SSR-stable. MMATF is fixed `America/New_York`.
