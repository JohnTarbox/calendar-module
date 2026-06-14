// Flat config is the future, but eslint 8 + the security/no-unsanitized plugins are most
// stable on the classic config — and these plugins are the load-bearing render-safety gate
// (ES §7). Keep it boring and reliable.
/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  plugins: ['@typescript-eslint', 'security', 'no-unsanitized'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:security/recommended-legacy',
  ],
  env: { es2022: true, node: true },
  ignorePatterns: ['dist/', 'node_modules/', 'coverage/', '*.cjs', 'storybook-static/', '.open-next/'],
  rules: {
    // Render-safety: untrusted third-party event data is the #1 threat (ES §7).
    'no-unsanitized/method': 'error',
    'no-unsanitized/property': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/consistent-type-imports': 'error',
    // Object-injection sink warnings are noisy on legitimate indexed access; keep as warn.
    'security/detect-object-injection': 'off',
  },
  overrides: [
    {
      files: ['**/*.test.ts', '**/*.test.tsx', '**/*.prop.test.ts', '**/__tests__/**'],
      rules: {
        'security/detect-non-literal-fs-filename': 'off',
      },
    },
    {
      // Non-negotiable (ES §2): the headless core imports NO React, DOM, or Cloudflare.
      // The contract is the only seam it may depend on. Enforce it at the lint boundary.
      files: ['packages/core/src/**/*.ts'],
      excludedFiles: ['**/*.test.ts', '**/*.prop.test.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: ['react', 'react-dom'],
            patterns: ['react', 'react-dom/*', '@cloudflare/*', 'cloudflare:*', 'wrangler'],
          },
        ],
      },
    },
  ],
};
