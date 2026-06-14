import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

// Runs tests inside the real workerd runtime (ES §6 "test in real runtime").
export default defineWorkersConfig({
  test: {
    name: 'worker',
    include: ['test/**/*.test.ts'],
    poolOptions: {
      workers: {
        main: './src/worker.tsx',
        miniflare: {
          compatibilityDate: '2024-12-01',
          compatibilityFlags: ['nodejs_compat'],
          d1Databases: { DB: 'calendar-local' },
        },
      },
    },
  },
});
