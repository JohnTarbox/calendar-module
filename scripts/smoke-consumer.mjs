// Runs INSIDE a throwaway consumer project that has installed the packed tarballs. Imports the
// real published artifact and SSR-renders it — the things source-level tests can't verify:
// the "use client" directive survived bundling, the exports/styles resolve, and the transitive
// deps (core, contract) link up. Exits non-zero on any failure.
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PKG = '@jonnyboats/calendar-react';

function check(cond, msg) {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
  console.log(`✓ ${msg}`);
}

// 1. The built entry must begin with "use client" (a host Next.js Server Component requires it).
//    Use the ESM resolver — the package is ESM-only (exports has `import`, no `require`).
const entry = fileURLToPath(import.meta.resolve(PKG));
check(readFileSync(entry, 'utf8').trimStart().startsWith('"use client"'), '"use client" directive present in published dist');

// 2. The styles subpath export resolves.
let stylesOk = true;
try {
  import.meta.resolve(`${PKG}/styles`);
} catch {
  stylesOk = false;
}
check(stylesOk, 'styles export (./styles) resolves');

// 3. Public API + re-exported validators are present.
const mod = await import(PKG);
check(typeof mod.MonthCalendar === 'function', 'MonthCalendar exported');
check(typeof mod.validateWindow === 'function' && typeof mod.validateEvent === 'function', 'validators re-exported');

// 4. validateWindow works on the real artifact.
const events = [
  { id: 'fair', title: 'Craft Fair', category: 'Fair', occurrences: [{ id: 'fair-1', start: '2026-06-10', allDay: true }] },
];
check(mod.validateWindow(events).success, 'validateWindow accepts a valid window');

// 5. SSR-render the published component — proves react → core → contract all link from the
//    packed tarballs (a broken workspace-dep rewrite would throw here).
const html = renderToString(
  createElement(mod.MonthCalendar, {
    events,
    displayTimeZone: 'America/New_York',
    now: '2026-06-15T12:00:00-04:00',
    locale: 'en-US',
  }),
);
check(html.includes('role="grid"'), 'SSR renders the month grid');
check(html.includes('Craft Fair'), 'SSR renders the event title');

console.log('\nSMOKE PASS — the published artifact imports, SSR-renders, and resolves its deps.');
