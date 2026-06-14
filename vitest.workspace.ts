import { defineWorkspace } from 'vitest/config';

// Each package/app supplies its own vitest config. The worker uses
// @cloudflare/vitest-pool-workers (workerd parity); the rest run in node with TZ=UTC.
export default defineWorkspace([
  'packages/*',
  'apps/worker',
]);
