# 03 — Folder Structure

> Part of the [MR.BANANA'S OS architecture set](./00-README.md). Status: **Draft for approval.**

The codebase is a **single Next.js (App Router) application** organized by
**feature module**, not by technical type. Each of the 13 business modules owns a
vertical slice: its UI, its server logic, and its types live together. Shared
infrastructure (auth, db, ui primitives) sits in `lib/` and `components/ui/`.

---

## 1. Top-level layout

```
mr-bananas-os/
├── docs/
│   ├── architecture/            # ← these documents
│   └── adr/                     # Architecture Decision Records (added during build)
├── public/                      # PWA assets, icons, manifest, service worker
├── src/
│   ├── app/                     # Next.js App Router (routes only)
│   ├── modules/                 # 13 business modules (the heart of the app)
│   ├── components/              # Shared UI (shadcn/ui primitives + composites)
│   ├── lib/                     # Cross-cutting infrastructure
│   ├── server/                  # Server-only: db client, RLS context, services base
│   ├── types/                   # Shared/global types & zod schemas
│   └── styles/                  # Tailwind globals, tokens
├── supabase/
│   ├── migrations/              # Versioned SQL (schema, RLS policies, triggers)
│   ├── functions/               # Edge Functions (invoices, forecasts, KPI rollups)
│   ├── seed/                    # Seed data per environment
│   └── config.toml
├── tests/
│   ├── e2e/                     # Playwright (POS flow, QR order, production)
│   └── integration/             # Service + RLS policy tests
├── scripts/                     # Dev/ops scripts (codegen, seeding)
├── .env.example
├── next.config.ts
├── tailwind.config.ts
└── package.json
```

> **Principle:** `app/` contains *routes and layouts only* — thin. All real logic
> lives in `modules/` and `server/`. A route handler imports a module service; it
> never embeds SQL or business rules.

---

## 2. The `app/` directory (routing)

Route groups mirror the operational surfaces, each with its own layout and access
gate:

```
src/app/
├── (auth)/                      # Login, password, branch selection
│   └── login/
├── (pos)/                       # POS terminal surface (staff)
│   ├── layout.tsx               # Offline-capable shell
│   ├── sale/
│   └── orders/
├── (kds)/                       # Kitchen Display (staff/baker, realtime)
│   └── board/
├── (production)/                # Baker production console
│   ├── plan/
│   └── batch/[batchId]/
├── (backoffice)/                # Owner/manager dashboards
│   ├── layout.tsx
│   ├── dashboard/
│   ├── inventory/
│   ├── recipes/
│   ├── invoices/
│   ├── waste/
│   ├── sop/
│   ├── complaints/
│   ├── kpi/
│   └── settings/                # Branches, users, roles, tax profiles
├── (customer)/                  # Public QR ordering (no login or light auth)
│   └── order/[branchId]/[table]/
├── api/                         # Route Handlers (BFF) — validate + call services
│   └── [...module endpoints]
├── layout.tsx                   # Root: providers, theme, PWA registration
└── manifest.ts                  # PWA manifest
```

Route groups `( )` keep URLs clean while letting each surface enforce its own auth
boundary in its `layout.tsx`.

---

## 3. The `modules/` directory (business logic)

Each module is a self-contained vertical slice with a **consistent internal shape**:

```
src/modules/
├── pos/
│   ├── components/              # Module-specific React components
│   ├── services/                # Server logic (orchestrates db, enforces invariants)
│   │   ├── create-order.ts
│   │   └── take-payment.ts
│   ├── hooks/                   # Client hooks (offline outbox, optimistic state)
│   ├── schemas.ts               # zod input/output validation
│   ├── types.ts
│   └── index.ts                 # Public interface — what other modules may import
├── qr-ordering/
├── kds/
├── production-planning/
├── batch-manufacturing/
├── inventory-raw/
├── inventory-semi-finished/
├── inventory-finished/
├── shelf-life/
├── waste/
├── tax-invoice/
├── sop/
├── complaints/
└── employee-kpi/
```

**Module boundary rule:** a module may import another module **only through its
`index.ts`**. Direct reach-ins (`modules/inventory-raw/services/...`) are forbidden
and enforced by an ESLint boundary rule. This keeps the [dependency map](./07-module-dependency-map.md)
honest and makes future extraction to a service trivial.

A representative module's public interface:

```
// src/modules/tax-invoice/index.ts  (interface only — not implementation)
export { issueInvoice, getInvoice, listInvoices } from './services'
export type { Invoice, InvoiceDraft } from './types'
```

---

## 4. The `server/` and `lib/` directories (infrastructure)

```
src/server/
├── db/
│   ├── client.ts                # Supabase server client bound to the USER's JWT (RLS applies)
│   ├── admin.ts                 # Service-role client — server jobs ONLY, never in request path
│   └── queries/                 # Reusable typed query builders
├── auth/
│   ├── context.ts               # Resolve tenant + branch + role from session
│   └── guard.ts                 # requireRole(), requireBranch() helpers
├── services/
│   └── base.ts                  # Transaction + audit helpers all services build on
└── realtime/
    └── channels.ts              # KDS / order-status channel definitions

src/lib/
├── money.ts                     # Integer minor-unit helpers
├── time.ts                      # UTC + branch-timezone helpers
├── fefo.ts                      # FEFO selection logic
├── pwa/                         # Service worker registration, outbox queue
├── validation/                  # Shared zod helpers
└── result.ts                    # Typed result/error wrapper
```

```
src/components/
├── ui/                          # shadcn/ui primitives (button, dialog, table, ...)
├── data/                        # Shared data-table, chart wrappers
└── layout/                      # App shell, nav, branch switcher
```

---

## 5. The `supabase/` directory (data plane as code)

```
supabase/
├── migrations/
│   ├── 0001_core_tenancy.sql        # tenant, branch, user_branch_role
│   ├── 0002_catalog_recipes.sql
│   ├── 0003_inventory.sql
│   ├── 0004_production.sql
│   ├── 0005_sales.sql
│   ├── 0006_compliance.sql
│   ├── 0007_rls_policies.sql        # All RLS policies in one auditable place
│   ├── 0008_audit_triggers.sql      # Append-only audit triggers
│   └── ...
├── functions/
│   ├── issue-tax-invoice/
│   ├── nightly-production-forecast/
│   └── kpi-rollup/
└── seed/
    ├── dev.sql
    └── staging.sql
```

> RLS policies and audit triggers live in **dedicated, reviewable migration files**
> so security changes are never buried inside a feature migration.

---

## 6. Naming & convention summary

| Item | Convention | Example |
|------|------------|---------|
| Folders | kebab-case | `tax-invoice/` |
| React components | PascalCase | `OrderTicket.tsx` |
| Services / utils | kebab-case files, camelCase exports | `create-order.ts` → `createOrder` |
| Zod schemas | `XxxSchema` | `CreateOrderSchema` |
| DB tables/columns | snake_case | `order_item`, `recipe_version_id` |
| Migrations | `NNNN_description.sql` | `0007_rls_policies.sql` |
| Env vars | SCREAMING_SNAKE | `SUPABASE_SERVICE_ROLE_KEY` |

---

## 7. Why this structure

- **Feature-first** means a developer touching "waste management" works in one
  folder, not five technical layers — faster, lower cognitive load.
- **Enforced module boundaries** keep the modular monolith from rotting into a big
  ball of mud, and make the eventual microservice split mechanical.
- **Thin routes** keep business logic testable without spinning up Next.js.
- **Data plane as code** (migrations + RLS in repo) means security is reviewed in
  PRs, not clicked into a dashboard and forgotten.
