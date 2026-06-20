import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'],
      include: ['src/**/*.ts', 'scripts/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        'src/types/**',
        'tests/**',
        // Live-integration service adapters: they issue Supabase/PostgREST calls and require
        // a real endpoint, so they are exercised by tests/runtime (Docker DB) + live owner
        // login, not by offline unit tests. The pure logic they rely on (money, roles,
        // schemas, types) IS unit-tested and stays in coverage.
        'src/server/services/context.ts',
        'src/server/services/catalog.ts',
        'src/server/services/pricing.ts',
        'src/server/services/recipes.ts',
        'src/server/services/inventory.ts',
        'src/server/services/orders.ts',
        'src/server/services/payments.ts',
        'src/server/services/invoices.ts',
        'src/server/services/fulfillment.ts',
        'src/server/services/index.ts',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 85,
      },
    },
  },
  resolve: {
    alias: {
      // `server-only` throws outside a React Server Component bundle; alias it to an empty
      // module so server-side units can be imported and tested under Node.
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
})
