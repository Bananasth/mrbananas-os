# 13 — Phase 0 Completion Package

> Part of the [MR.BANANA'S OS architecture set](./00-README.md). Status: **✅ Phase 0 complete (offline foundation) — staged for manual review, not committed.**
> Date: 2026-06-20

Phase 0 built a **production-grade, security-first, RLS-first foundation** with **no
frontend, no business modules, no mock data**. Everything was authored and verified
**offline** (no database, Docker, connection, or secrets); each work package was reviewed
and approved individually and left staged for manual commit.

---

## 1. Final Phase-0 completion report

### Work packages (all complete)

| WP | Deliverable | Migration |
| -- | ----------- | --------- |
| W1 | Project scaffold (TS, ESLint, Prettier, Vitest, PWA-ready) | — |
| W2 | CI/CD (GitHub Actions: typecheck/lint/format/test) | — |
| W3 | Supabase structure (user + admin clients, env validation, import boundary) | — |
| W4 | Migration foundation + prelude | `0000_prelude` |
| W5 | Core tenancy | `0001_core_tenancy` |
| W6 | Identity (app_user, role, user_branch_role) | `0002_identity` |
| W7 | Workstation + employee | `0003_workstation_employee` |
| W8 | Session-version / JWT revocation (S1) | `0004_session_version` |
| W9 | Inventory-item supertype (N1) | `0005_inventory_item` |
| W10 | Immutable audit-log foundation | `0006_audit` |
| W11 | RLS policy foundation (least-privilege) | `0007_rls_policies` |
| W12 | RLS CI guard (S2) | — |
| W13 | Final verification gate + completion package | — |

### Metrics

| Metric | Value |
| ------ | ----- |
| Migrations | 8 (`0000`–`0007`) |
| Business tables | 9, all RLS-protected with least-privilege policies |
| RLS helper functions | 8 (`app.*`) |
| Tests | **95** across 15 files |
| Coverage | **100%** lines / **100%** functions / **100%** statements / **96.3%** branches |
| Vulnerabilities | **0** (`npm audit`) |
| Gates | typecheck ✅ · lint ✅ · format ✅ · RLS guard ✅ · test ✅ · coverage ✅ |

---

## 2. Architecture compliance matrix

| Approved decision | Status | Evidence |
| ----------------- | :----: | -------- |
| Multi-tenant from day one (`tenant_id`/`branch_id` everywhere) | ✅ | `0001`–`0005`; isolation predicates in `0007` |
| RLS is the final authority | ✅ | Every table RLS-enabled; policies in `0007`; guard in W12 |
| Append-only ledgers (audit) | ✅ | `0006` append-only trigger + RLS |
| **N1 — inventory_item supertype** | ✅ | `0005_inventory_item`; single-FK convention documented |
| **S1 — JWT revocation via session_version** | ✅ | `0004` + `src/server/auth/*`; tests |
| **S2 — CI guard fails build on RLS-less table** | ✅ | `scripts/check-rls.ts` + `tests/rls-guard` + CI step |
| Recipe-version-style immutability (pattern) | ✅ (audit) | `app.reject_mutation()` append-only pattern established |
| Service-role server-only (S3 groundwork) | ✅ | `admin.ts` + ESLint import boundary (proven by test) |
| Money/integer, Thailand VAT, recall, etc. | ⏭ Phase 1+ | not in Phase 0 scope |

### Verification checklist (requested)

| Item | Status | Verified by |
| ---- | :----: | ----------- |
| Multi-tenant isolation | ✅ | `0007` (`current_tenant_id`), `schema-rls-policies`, tenant FKs |
| Branch isolation | ✅ | `has_branch_role` / `current_branch_ids`, `schema-rls-policies` |
| Role isolation | ✅ | role helpers + claim enum, `schema-rls-policies`, `claims.test` |
| Session revocation model | ✅ | `0004`, `session-version.test`, `claims.test`, `schema-session-version` |
| Audit immutability | ✅ | `0006`, `schema-audit` (append-only trigger + RLS, read-only policies) |
| RLS coverage | ✅ | `rls-guard` → 0 violations across all 9 tables |
| Migration ordering | ✅ | `migrations.test` (unique ascending; prelude first) |
| Inventory supertype foundation | ✅ | `0005`, `schema-inventory-item` (exact enum, tenant-safe) |
| CI guard enforcement | ✅ | `rls-guard` pass/fail cases + `RLS guard (S2)` CI step |

---

## 3. Security compliance matrix

| Security requirement | Status | Evidence |
| -------------------- | :----: | -------- |
| RLS enabled on every table immediately | ✅ | `enable row level security` in every table migration |
| Deny-by-default → least-privilege | ✅ | deny-all in `0001`–`0006`, replaced in `0007` |
| Tenant isolation mandatory | ✅ | `current_tenant_id()` / `branch_tenant_id()` gates |
| Branch isolation mandatory | ✅ | `has_branch_role()` / `current_branch_ids()` |
| Role isolation mandatory | ✅ | owner/manager/staff/baker/customer modeled; customer excluded from internal tables |
| No table readable without policy | ✅ | W12 guard (0 violations) |
| Helper hardening | ✅ | helpers STABLE + `search_path=''`; `branch_tenant_id` SECURITY DEFINER |
| Audit read-only (Owner/Manager) + immutable | ✅ | `0007` SELECT-only policies; `0006` raising trigger blocks all roles |
| Short token TTL + revocation (S1) | ✅ | `config.toml` jwt_expiry 900; `session_version` SoT + bump |
| Service-role never client-reachable (S3) | ✅ | `import 'server-only'` + ESLint boundary (tested) |
| No secrets in repo | ✅ | `.env.example` placeholders only; `.gitignore` covers env |
| Forward-only, migration-safe | ✅ | additive ALTERs; no edits to applied migrations; convention test |

---

## 4. Deferred items list

Explicitly out of Phase 0 (by scope), to be picked up later:

1. **Live-DB integration tests** — runtime proof of RLS isolation, revocation enforcement,
   and audit immutability (needs Postgres/Docker). The static proofs are in place; the live
   layer is the first Phase-1 task.
2. **Supabase Auth wiring** — middleware that reads the JWT, sets `request.jwt.claims`,
   fetches the user's current `session_version`, and enforces it per request. Logic + DB
   primitive exist; the HTTP wiring does not.
3. **Manager user-management writes** — the matrix's "manage staff/baker, own branch" is an
   HR/admin workflow; Phase 0 grants Owner-only writes (less than the matrix, never more).
4. **Non-owner inventory writes** — `inventory_item` writes are Owner-only for now; Manager
   catalog management arrives with the catalog/menu module.
5. **Customer / anon policies** — customers have no Phase-0 internal-table access; their
   menu/order access arrives with QR ordering.
6. **`branch.tax_profile_id` FK** — column present; constraint added when `tax_profile`
   exists (compliance phase).
7. **Frontend, POS, KDS, production, tax, recall, HR export** — all Phase 1+.

---

## 5. Technical debt list

| # | Debt | Impact | Suggested fix |
| - | ---- | ------ | ------------- |
| D1 | Verification is **static**, not runtime | Behaviors asserted structurally, not executed | Add `tests/integration/` against local Supabase (Phase-1 first task) |
| D2 | Audit `tenant_id` capture is partial | Audits of `tenant`/`role` rows (no tenant/branch on the row) aren't visible to Owner via app | Enhance `app.audit_trigger()` to backfill tenant via `branch_tenant_id()` where possible; accept null/null for global tables |
| D3 | RLS guard requires **all** `public` tables to have RLS | A future intentionally-public table would fail the guard | Add an explicit allowlist if/when such a table is justified |
| D4 | `check:rls` runs via Vitest, not standalone node | Node 20 can't run `.ts` directly | Fine as-is; revisit if a non-test CLI is needed |
| D5 | `branch.tax_profile_id` unconstrained | No referential integrity yet | Add FK in the compliance phase |

None are blocking; all are tracked.

---

## 6. Risks list

| # | Risk | Severity | Mitigation |
| - | ---- | :------: | ---------- |
| R1 | RLS correctness proven statically only | Medium | Stand up the live integration suite before any Phase-1 transactional code (D1) |
| R2 | RLS depends on Auth stamping claims correctly (`tenant_id`, `branch_roles`, `session_version`) | High (once live) | Auth-integration task must stamp claims + a live RLS isolation test must pass before features |
| R3 | Owner modeled as `branch_roles[].role = 'owner'` | Low | Document the claim contract; assert in the Auth-stamping test |
| R4 | Service-role key leakage would bypass all RLS | High | Server-only import boundary (tested) + future client-bundle scan; key in env only |
| R5 | Partial audit tenant capture (D2) could hide some changes from Owner view | Low | Backfill tenant in the audit trigger (D2) |

---

## 7. Recommended Phase-1 entry sequence

Do these **in order** — the first two convert Phase 0's static guarantees into live ones and
must precede any feature code:

1. **Live data plane + Auth + integration tests.** Boot local Supabase; wire Auth to stamp
   claims (`tenant_id`, `branch_roles`, `session_version`) and enforce `session_version` per
   request; add `tests/integration/` proving — against a real DB — cross-tenant denied,
   cross-branch denied, role-gated writes, revocation kills a stale token, and `audit_log`
   UPDATE/DELETE actually raise. This closes R1/R2.
2. **Address D2** (audit tenant backfill) and re-run the live audit visibility test.
3. **Inventory subtypes on the supertype** — `raw_material`, `semi_finished`, `product`
   (shared-PK), `unit_conversion`, `branch_product` — all RLS-first, reusing the W11 policy
   template and passing the W12 guard.
4. **Catalog & recipes** — `product`, `recipe`, immutable `recipe_version`, single-FK
   `recipe_ingredient` — then proceed through the [roadmap](./08-development-roadmap.md)
   Phase 1 (master data) → Phase 2 (production) → … .

> Each Phase-1 table inherits the foundation: copy the RLS policy template, get caught by the
> W12 guard if RLS is forgotten, and auto-audit via the W10 trigger. The team builds
> features, not foundations.

---

> **Phase 0 is complete and green.** All work is **staged, not committed** — ready for your
> review and a single foundational commit when you choose.
