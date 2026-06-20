// Flat ESLint config (ESLint 9 + typescript-eslint).
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    // tests/runtime and scripts/*.mjs are ops tooling that talk to a live DB / Supabase
    // project; they are not part of the offline (typed) gate.
    ignores: [
      'node_modules',
      'dist',
      'build',
      '.next',
      'next-env.d.ts',
      'coverage',
      'supabase/.temp',
      'tests/runtime',
      'scripts/**/*.mjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Service worker (web worker context) — `self` is the global scope.
    files: ['public/**/*.js'],
    languageOptions: { globals: { self: 'readonly' } },
  },
  {
    // Server-only import boundary (S3 groundwork): the service-role admin client must not be
    // imported anywhere except trusted server zones. This config applies to every TS file
    // EXCEPT those zones, forbidding any import that resolves to `server/db/admin`.
    files: ['**/*.ts'],
    ignores: ['src/server/**', 'supabase/functions/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/server/db/admin', '**/server/db/admin.*'],
              message:
                'The Supabase admin (service-role) client bypasses RLS and is server-only. ' +
                'Import it only within src/server or supabase/functions.',
            },
          ],
        },
      ],
    },
  },
)
