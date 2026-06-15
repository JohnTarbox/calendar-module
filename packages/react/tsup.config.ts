import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/styles.css'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  // The skin is a client component, but esbuild STRIPS `"use client"` directives during
  // bundling — even from a `banner` (verified empirically). So we prepend the directive in a
  // post-build step, after esbuild can no longer touch it. `splitting: false` keeps a single JS
  // chunk so there is exactly one entry to mark. A build-artifact test asserts it survives, so a
  // regression fails CI. This is what makes `import { MonthCalendar }` legal in a host RSC tree.
  splitting: false,
  external: ['react', 'react-dom', '@jonnyboats/calendar-core', '@jonnyboats/calendar-contract'],
  loader: { '.css': 'copy' },
  async onSuccess() {
    const { readFile, writeFile } = await import('node:fs/promises');
    const entry = 'dist/index.js';
    const code = await readFile(entry, 'utf8');
    if (!code.startsWith('"use client"')) {
      await writeFile(entry, `"use client";\n${code}`);
    }
  },
});
