import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  // Keep peer/workspace deps external; the engine bundles nothing but its own source.
  external: ['@calendar-module/contract', 'luxon'],
});
