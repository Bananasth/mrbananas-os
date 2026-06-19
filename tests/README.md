# Test strategy

Phase 0 is verified **offline** — no database, Docker, or external service. Verification is
layered; `npm test` runs all layers, `npm run coverage` adds a coverage gate, and
`npm run check:rls` runs the security guard on its own.

| Layer                    | What it proves                                                                                    | Location                         |
| ------------------------ | ------------------------------------------------------------------------------------------------- | -------------------------------- |
| **Unit**                 | Pure logic: `Result`, env validation, JWT claims, session-version revocation, client construction | `src/**/*.test.ts`               |
| **Boundary**             | The service-role admin client cannot be imported outside server zones (runs ESLint via API)       | `src/server/db/boundary.test.ts` |
| **Schema**               | Each migration's DDL: tables, columns, FKs, constraints, RLS + deny/policy, triggers              | `tests/schema-*.test.ts`         |
| **Migration convention** | Filenames `NNNN_snake_case.sql`, unique ascending numbers, prelude present                        | `tests/migrations.test.ts`       |
| **RLS guard (S2)**       | Every business table has RLS + ≥1 net policy; pass/fail unit cases                                | `tests/rls-guard.test.ts`        |

## Offline scope & the deferred live layer

These are **static structural proofs** — they assert the enforcing DDL exists (RLS policies,
append-only triggers, isolation predicates). Proving the _runtime behavior_ (e.g. that a
cross-tenant `SELECT` actually returns zero rows, that an `UPDATE` on `audit_log` actually
raises) requires a live Postgres and is **deferred** to a `tests/integration/` layer that
runs once Docker/Supabase is permitted. See the Phase 0 completion report for details.

## Commands

```bash
npm test            # all layers
npm run coverage    # all layers + coverage thresholds (lines/fns/stmts 90, branches 85)
npm run check:rls   # the RLS guard only (also part of npm test and CI)
```
