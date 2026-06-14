import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'react',
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.tsx', 'src/**/*.test.ts'],
  },
});
