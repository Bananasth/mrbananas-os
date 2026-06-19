# Runtime validation

Verifies the schema actually runs on a **local** Postgres — migrations, seed, end-to-end
flows, RLS role simulation, and concurrency. Talks only to `DATABASE_URL` (a local DB); no
external services, no real secrets.

> Status: **harness authored, not yet executed** (no local DB was available at authoring
> time). First live run will likely need a small debugging pass.

## Option A — Docker + Supabase CLI (closest to prod)

```bash
npx --yes supabase start                 # boots local Postgres + Supabase roles
npx --yes supabase db reset              # applies supabase/migrations in order
export DATABASE_URL="$(npx --yes supabase status -o json | jq -r '.DB_URL')"  # or the printed DB URL
node tests/runtime/runtime.mjs seed      # master data
node tests/runtime/runtime.mjs validate  # e2e + RLS + concurrency
```

## Option B — plain local Postgres

```bash
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/mrbananas"
node tests/runtime/runtime.mjs apply     # create roles + apply all migrations + seed
node tests/runtime/runtime.mjs validate
```

`apply` creates the `authenticated` / `anon` / `service_role` roles the RLS policies
reference (Supabase already has them), then applies every `supabase/migrations/*.sql` in
order, then seeds.

## What it checks

- **E2E (Task 5):** purchase→lot · production consumes · production produces finished lot ·
  FEFO sale deduction (+ batch stamp) · beverage ingredient deduction · payment capture ·
  tax invoice issuance (VAT 7%, no.1) · quarantine blocks sale · recall traces affected orders.
- **RLS (Task 6):** owner / manager / staff / baker / customer — visibility + write denials.
- **Concurrency (Task 7):** stock cannot oversell (parallel `consume` on the last unit);
  invoice numbers cannot duplicate (parallel `issue_tax_invoice`).

The harness prints `PASS`/`FAIL` per check and a final tally; non-zero exit on any failure.

## Notes / limitations

- Run against a **disposable** DB — the seed is not idempotent (re-seeding duplicates).
- Concurrency tests need a real multi-connection Postgres (Docker/Supabase or local PG);
  an in-process engine (pglite) can't run true parallel transactions.
- These files are excluded from the offline lint/format/test gate (ops tooling).
