// Flat ESLint config (ESLint 9 + typescript-eslint).
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    // tests/runtime is ops tooling that talks to a live DB; not part of the offline gate.
    ignores: [
      'node_modules',
      'dist',
      'build',
      '.next',
      'coverage',
      'supabase/.temp',
      'tests/runtime',
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
