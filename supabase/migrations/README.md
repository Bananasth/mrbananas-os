# Database migrations

Versioned SQL is the **only** way the schema changes — never hand-edit the database. All
files here are applied in lexical order to build the database from zero.

> **Phase 0 note:** this directory currently holds only the **prelude**. Business tables
> begin in W5. Migrations are **not** run in Phase 0 CI and require no live database.

## Naming

```
NNNN_snake_case.sql
```

- `NNNN` — 4-digit, zero-padded, ascending. Each number is unique.
- Gaps are allowed (numbers may be reserved for a domain), but never reused.
- Lower-case `snake_case` description after the number.

Convention is enforced automatically by the test suite
([`tests/migrations.test.ts`](../../tests/migrations.test.ts) via
[`scripts/check-migrations.ts`](../../scripts/check-migrations.ts)).

## Dedicated files for security

Security-relevant SQL lives in its **own** reviewable migration, never buried inside a
feature migration:

| Reserved                  | Contents                                                 |
| ------------------------- | -------------------------------------------------------- |
| `0000_prelude.sql`        | Extensions, `app` schema, shared `updated_at` trigger fn |
| `0007_rls_policies.sql`   | RLS helper functions + policies (W11)                    |
| `0008_audit_triggers.sql` | Append-only audit triggers (W10)                         |

## Rules

- **Forward-only & immutable.** Once a migration is committed/applied, it is never edited.
  Corrections are new migrations.
- **Idempotent foundations.** The prelude and shared helpers use `create ... if not exists`
  / `create or replace` so a rebuild is deterministic.
- **RLS-first.** Every business table enables Row Level Security with at least one policy
  (a CI guard in W12 fails the build otherwise).
- **Append-only ledgers.** Inventory movements, production events, audit log, and tax
  records are insert-only; corrections are new rows.
- **Supertype convention (N1).** Stockable items reference the `inventory_item` supertype by
  a single FK — no polymorphic `(kind, id)` columns. The supertype table is created in
  `0005_inventory_item.sql` (W9); `item_kind` is exactly `raw` / `semi_finished` /
  `finished`. Subtypes (`raw_material`, `semi_finished`, `product`) attach via shared
  primary key in Phase 1.

## Running locally (W5+; requires Docker)

The Supabase CLI is invoked via `npx` (never installed globally or added as a dependency):

```bash
npm run db:start    # boot local Supabase (Docker)
npm run db:new      # scaffold a new migration
npm run db:reset    # rebuild the DB from all migrations
npm run db:up       # apply pending migrations
npm run db:diff     # diff schema into a migration
npm run db:stop
```

These need a local Docker + Supabase and are **not** used in Phase 0 CI.
