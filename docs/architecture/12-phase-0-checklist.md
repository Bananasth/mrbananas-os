# 12 — Phase 0 Implementation Checklist

> Part of the [MR.BANANA'S OS architecture set](./00-README.md). Status: **✅ COMPLETE — W1–W13 done, all gates green, staged for manual review. See the [completion package](./13-phase-0-completion.md).**

Phase 0 builds a **production-grade, security-first, RLS-first foundation** with **no
frontend, no POS, no business modules, no mock data**. Each work package is committable on
its own. Implementation proceeds **one WP at a time**, stopping for approval between
packages.

**Legend:** ⬜ not started · 🔄 in progress · ✅ complete

| WP | Title | Status |
|----|-------|:------:|
| W1 | Project scaffold | ✅ |
| W2 | CI/CD foundation | ✅ |
| W3 | Supabase project structure | ✅ |
| W4 | Database migration foundation | ✅ |
| W5 | Core tenancy schema | ✅ |
| W6 | Identity & user-profile schema | ✅ |
| W7 | Branch & workstation schema | ✅ |
| W8 | Session-version & JWT-revocation model | ✅ |
| W9 | Inventory-item supertype schema | ✅ |
| W10 | Audit-log foundation | ✅ |
| W11 | RLS policy foundation | ✅ |
| W12 | CI guard: fail build on any RLS-less business table | ✅ |
| W13 | Basic test suite + completion gate | ✅ |

---

## W1 — Project scaffold ✅

- **Objective:** A production-grade TypeScript repository foundation with linting,
  formatting, type-checking and a test runner — ready for the Supabase data plane and a
  future Next.js frontend, containing **no frontend or business code**.
- **Files to create/edit:** `.gitignore`, `.editorconfig`, `.nvmrc`, `.env.example`,
  `package.json`, `tsconfig.json`, `eslint.config.mjs`, `.prettierrc.json`,
  `.prettierignore`, `vitest.config.ts`, `README.md`, `src/lib/result.ts` (first shared
  utility), `src/lib/result.test.ts`, directory placeholders (`src/server/`,
  `src/modules/`, `supabase/migrations/`, `tests/`).
- **Database migrations:** none.
- **Tests:** `src/lib/result.test.ts` — unit-tests the `Result` helper; proves the
  TypeScript + Vitest toolchain runs green.
- **Acceptance criteria:** `npm install` succeeds · `npm run typecheck`, `npm run lint`,
  `npm run format:check`, `npm test` all pass · repo is a git repository with a sane
  `.gitignore` · no frontend/business code present.
- **Dependencies:** none (root of the tree).

## W2 — CI/CD foundation ✅

> **Scope per approval (2026-06-20):** **CI only** — typecheck, lint, format-check, tests
> on every push and PR. **No deployment, no Vercel connection, no database, no migrations.**
> Vercel is document-only. The migration CI job is deferred to W4/W12.

- **Objective:** Automated pipeline running the four-check gate on every push and pull
  request; Vercel deployment requirements documented (not connected).
- **Files:** `.github/workflows/ci.yml`, `.github/pull_request_template.md`,
  `CONTRIBUTING.md`, `docs/deployment/vercel.md`.
- **Migrations:** none (explicitly excluded this WP).
- **Tests:** the four gate steps run in CI; validated locally via `npm ci` + each step.
- **Acceptance:** CI workflow is valid YAML, runs typecheck/lint/format/test on push+PR
  with least-privilege `contents: read` and run-cancellation; Vercel documented as not-yet-
  connected. ✅ All gate steps pass locally on a clean `npm ci`.
- **Dependencies:** W1. (Migration runner + RLS guard step join in W4/W12.)

## W3 — Supabase project structure ✅

> **Scope per approval (2026-06-20):** fully **local/offline — mock/config only**. No
> hosted project, account, database, API key, or secret. Clients construct from validated
> env but make no connection.

- **Objective:** Local-first Supabase scaffolding and typed client conventions: a
  **user-scoped client** (RLS applies) and an **admin client** (service-role, server-only)
  with an enforced import boundary (S3 groundwork).
- **Files:** `supabase/config.toml` (local-only), `src/lib/env.ts` + `env.test.ts`,
  `src/server/db/client.ts` (user-scoped) + `client.test.ts`, `src/server/db/admin.ts`
  (service-role, `import 'server-only'`), `src/server/db/boundary.test.ts`,
  `src/types/server-only.d.ts`, `tests/stubs/server-only.ts`, ESLint `no-restricted-imports`
  zone forbidding the admin client outside `src/server`/`supabase/functions`, vitest
  `server-only` alias, deps `@supabase/supabase-js` + `zod` + `server-only`, updated
  `.env.example`.
- **Migrations:** none.
- **Tests:** env schema validation (5); offline client construction + missing-env throws
  (4); ESLint boundary fires for modules and permits server (2).
- **Acceptance:** clients instantiate from validated env with no network; the service-role
  boundary is lint-enforced and proven by test; 0 vulnerabilities. ✅ All gates green
  (15 tests).
- **Dependencies:** W1, W2.

## W4 — Database migration foundation ✅

> **Scope per approval (2026-06-20):** **offline — migration foundation + prelude only.**
> No business tables, no Docker/DB/CLI execution, no secrets. Supabase CLI referenced via
> `npx` only (never installed/added as a dependency). SQL validated by static review.

- **Objective:** A safe, versioned, forward-only migration convention with naming,
  ordering, and an idempotent SQL prelude (extensions, `app` schema, shared helper).
- **Files:** `supabase/migrations/0000_prelude.sql` (`pgcrypto`; `app` schema;
  `app.set_updated_at()` trigger fn), `supabase/migrations/README.md` (conventions),
  `scripts/check-migrations.ts` (offline filename validator), `tests/migrations.test.ts`,
  `npx`-based `db:*` package scripts.
- **Migrations:** `0000_prelude.sql` (idempotent).
- **Tests:** real-directory convention check + prelude-content assertions + validator unit
  tests (6 new).
- **Acceptance:** prelude is idempotent; conventions documented and **machine-enforced by
  the test suite**; db scripts use `npx supabase` only. ✅ All gates green (21 tests).
- **Dependencies:** W3.

## W5 — Core tenancy schema ✅

> **Scope per approval (2026-06-20):** `tenant` + `branch` exactly as defined in the ER doc;
> RLS enabled immediately with **explicit deny-by-default policies** (real access policies
> deferred to W11). Fully offline — authored + statically reviewed + convention-tested, not
> applied to any DB.

- **Objective:** The multi-tenant spine — `tenant`, `branch` — with FKs, indexes,
  `updated_at` triggers, RLS enabled, and explicit deny-all policies.
- **Files:** `supabase/migrations/0001_core_tenancy.sql`, `tests/schema-tenancy.test.ts`.
- **Migrations:** `0001_core_tenancy.sql`.
- **Tests:** static schema test — tables created; branch→tenant FK; approved columns; **RLS
  enabled on both**; **deny-by-default policy on both**; `updated_at` triggers; tenant_id
  index (7 new).
- **Acceptance:** migration is valid DDL; both tables RLS-enabled with deny-all policies;
  guarded by tests. ✅ All gates green (28 tests).
- **Dependencies:** W4.

## W6 — Identity & user-profile schema ✅

> **Scope per approval (2026-06-20):** **only** `app_user`, `role`, `user_branch` (no
> `employee` this WP). RLS-enabled with explicit deny-by-default. Five approved roles only.
> Fully offline — no Supabase Auth / IdP / connection.

- **Objective:** `app_user` (mirrors Supabase Auth uid), `role` (the 5 approved roles), and
  the per-branch `user_branch` role mapping.
- **Files:** `supabase/migrations/0002_identity.sql`, `tests/schema-identity.test.ts`.
- **Migrations:** `0002_identity.sql`.
- **Tests:** static schema test — three tables created; **no** `employee`; app_user→tenant
  + case-insensitive unique email; user_branch→user/branch/role with one-role-per-branch;
  RLS + deny-all on all three; exactly the 5 roles seeded; `updated_at` triggers (7 new).
- **Acceptance:** valid DDL; RLS-first deny-by-default; role model is exactly
  owner/manager/staff/baker/customer. ✅ All gates green (35 tests).
- **Dependencies:** W5.
- **Note:** mapping table renamed to `user_branch_role` (matches the approved architecture,
  security model, and permission matrix) per the W7 instruction.

## W7 — Workstation & employee schema ✅

> **Scope per approval (2026-06-20):** `workstation` + `employee` (employee created here as
> originally planned). RLS-enabled deny-by-default. Fully offline. Also: renamed the W6
> mapping table `user_branch` → `user_branch_role` to match the approved docs.

- **Objective:** `workstation` (traceability anchor, type enum, FK to branch) and
  `employee` (distinct from app_user, optional user link).
- **Files:** `supabase/migrations/0003_workstation_employee.sql`,
  `tests/schema-workstation-employee.test.ts`; edits to `0002_identity.sql` +
  `tests/schema-identity.test.ts` for the rename.
- **Migrations:** `0003_workstation_employee.sql`.
- **Tests:** static schema test — both tables; workstation→branch FK + 4-kind type check;
  employee tenant+branch + OPTIONAL user link + unique `(tenant_id, code)`; RLS + deny-all
  on both; `updated_at` triggers (6 new).
- **Acceptance:** valid DDL; RLS-first deny-by-default. ✅ All gates green (41 tests).
- **Dependencies:** W5 (branch), W6 (app_user).

## W8 — Session-version & JWT-revocation model (S1) ✅

> **Scope per approval (2026-06-20):** `session_version` as the **single source of truth**
> for revocation; tenant-safe + branch-safe; offline-only; no Supabase Auth integration, no
> connection/secrets.

- **Objective:** Server-side revocation: a per-user `session_version` that, when bumped,
  invalidates outstanding tokens on the next request.
- **Files:** `supabase/migrations/0004_session_version.sql`,
  `src/server/auth/session-version.ts` (pure compare/bump logic),
  `src/server/auth/claims.ts` (claim shape + zod validation), plus three test files.
- **Migrations:** `0004_session_version.sql` — adds `session_version` to `app_user`
  (additive ALTER, no new table) + hardened `app.bump_session_version()` (SECURITY DEFINER,
  empty search_path, execute revoked from public).
- **Tests:** revocation logic (7), claim validation incl. tenant/branch/role safety (5),
  migration static check (5) — 17 new.
- **Acceptance:** bump + compare proven; storage migrated; bump primitive locked to the
  trusted backend; claims enforce tenant_id + branch uuids + the 5 roles + session_version.
  ✅ All gates green (58 tests).
- **Dependencies:** W6 (app_user).

## W9 — Inventory-item supertype schema (N1) ✅

> **Scope per approval (2026-06-20):** supertype **table only**. No movements, ledger,
> transactions, purchasing, batches, yields, or menu. `item_kind` exactly `raw` /
> `semi_finished` / `finished`. Additive, forward-only, RLS deny-by-default, offline.

- **Objective:** Establish the `inventory_item` supertype (the single-FK convention all
  stockable items will use) — table + supporting constraints only.
- **Files:** `supabase/migrations/0005_inventory_item.sql`,
  `tests/schema-inventory-item.test.ts`, `supabase/migrations/README.md` (supertype note).
- **Migrations:** `0005_inventory_item.sql`.
- **Tests:** static schema test — table + tenant FK; **exact** item_kind enum; base_unit
  NOT NULL; tenant-safe index; RLS + deny-all; updated_at trigger; **negative-scope** guard
  (no movements/lots/batches/purchasing/yield in DDL) — 7 new.
- **Acceptance:** valid additive DDL; RLS-first; exact enum; in scope. ✅ All gates green
  (65 tests).
- **Dependencies:** W5.

## W10 — Audit-log foundation ✅

> **Scope per approval (2026-06-20):** immutable audit foundation only. Append-only
> `audit_log`, reusable trigger, attached to the 8 approved Phase-0 tables. No business
> modules/reporting/analytics/domain logic. Offline.

- **Objective:** An append-only `audit_log` plus a reusable trigger that records
  before/after on every attached table; immutable at the DB layer.
- **Files:** `supabase/migrations/0006_audit.sql`, `tests/schema-audit.test.ts`.
- **Migrations:** `0006_audit.sql` — `audit_log` (entity_type/action/entity_id/
  actor_user_id/tenant_id/branch_id/before/after/occurred_at); `app.audit_trigger()`
  (SECURITY DEFINER); `app.reject_mutation()` + BEFORE UPDATE/DELETE trigger (append-only
  for ALL roles); RLS deny-all; attached to all 8 Phase-0 tables.
- **Tests:** static schema + immutability proof — required columns; action check; RLS+deny;
  UPDATE/DELETE rejected via raising trigger; INSERT not blocked; SECURITY DEFINER appender;
  attachment to all 8 tables; no self-audit (10 new).
- **Acceptance:** append-only enforced by RLS **and** a raising trigger that binds every
  role; reusable trigger attached to all Phase-0 tables. ✅ All gates green (75 tests).
- **Dependencies:** W5–W9 (tables to audit).
- **Note:** offline = enforcement verified statically; live execution proof is gated on a DB
  (deferred from the offline scope).

## W11 — RLS policy foundation ✅

> **Scope per approval (2026-06-20):** full least-privilege policy foundation replacing all
> deny-all bootstraps; tenant/branch/role isolation; audit read-only (Owner/Manager) +
> immutable; customer-safe (no access to internal tables). Offline; no business workflows.

- **Objective:** Claim-reading helper functions + least-privilege policies on every Phase-0
  table, exactly per the permission matrix.
- **Files:** `supabase/migrations/0007_rls_policies.sql`, `tests/schema-rls-policies.test.ts`.
- **Migrations:** `0007_rls_policies.sql` — 8 helpers (`current_claims`, `current_user_id`,
  `current_tenant_id`, `current_branch_ids`, `is_tenant_owner`, `has_branch_role`,
  `has_any_role`, `branch_tenant_id`); drops 9 deny-all; creates least-privilege policies on
  all 9 tables.
- **Tests:** static — helpers defined + STABLE + pinned search_path; branch_tenant_id
  SECURITY DEFINER; all 9 deny-all dropped; every table covered; RLS never disabled; tenant
  + branch + role isolation present; audit read-only/immutable; customer-safe (12 new).
- **Acceptance:** every table least-privilege + RLS-protected; isolation enforced; audit
  read-only; customers excluded. ✅ All gates green (87 tests).
- **Dependencies:** W5–W10.

## W12 — CI guard: fail build on any RLS-less business table ✅

> **Scope per approval (2026-06-20):** **offline static migration scanner** (no live DB /
> Docker / connection / secrets). Every `public` table must have RLS + ≥1 net policy; build
> fails otherwise. Pass/fail proven by unit tests (no committed unprotected fixture needed).

- **Objective:** A guard that fails the build if any business table lacks RLS or has zero
  net policies.
- **Files:** `scripts/check-rls.ts` (pure analyzer), `tests/rls-guard.test.ts`,
  `check:rls` npm script, `RLS guard (S2)` step in `.github/workflows/ci.yml`.
- **Migrations:** none.
- **Tests:** real migrations report zero violations (the CI gate) + 6 synthetic pass/fail
  unit cases (missing RLS, zero policies, net-zero after drop, deny→real replacement,
  disable-after-enable) — 8 new.
- **Acceptance:** guard detects all 9 Phase-0 tables, passes the real schema, and fails on
  each violation class; wired as an explicit CI step **and** part of `npm test`. ✅ All gates
  green (95 tests).
- **Dependencies:** W4 (migrations), W11 (policies), W2 (CI).

## W13 — Basic test suite + completion gate ✅

> **Scope per approval (2026-06-20):** consolidate verification layers, add coverage gate,
> produce the completion package. Offline; live-DB integration layer documented as deferred.

- **Objective:** Final Phase-0 verification gate + completion package.
- **Files:** `vitest.config.ts` (coverage + thresholds), `coverage` script, dep
  `@vitest/coverage-v8`, `tests/README.md` (layer strategy),
  `docs/architecture/13-phase-0-completion.md` (completion package).
- **Migrations:** none.
- **Tests:** the consolidated suite — unit, boundary, schema, migration-convention, RLS
  guard — all green; coverage thresholds enforced.
- **Acceptance:** `npm test` green; coverage **100/100/100/96.3** (lines/fns/stmts/branches)
  over thresholds; completion package + compliance/security matrices + deferred/debt/risks +
  Phase-1 entry sequence delivered. ✅ Phase 0 complete.
- **Dependencies:** W1–W12.
- **Note:** live-DB integration (runtime RLS/revocation/audit proof) is the deferred first
  Phase-1 task (see completion package §4, §7).

---

## Phase 0 exit gate (recap)

All of W1–W13 complete **and** the 8 acceptance tests from the
[Phase 0 plan §4](./11-phase-0-plan.md) green in CI: cross-branch denied · cross-tenant
denied · write-authz · revocation · RLS guard fails-red · audit capture · service-role
boundary · (routing deferred — no frontend in this Phase 0). Only then does Phase 1 begin.
