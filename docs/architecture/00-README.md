# MR.BANANA'S OS — Architecture Documentation

> **Status:** 🟢 Design complete — all decisions locked, all review fixes folded in — **ready for Phase 0 (awaiting build authorization)**
> **Owner:** owner@misterbananas.com
> **Last updated:** 2026-06-19
> **Version:** 1.0 (Approved architecture; jurisdiction = Thailand)

---

## What this is

MR.BANANA'S OS is an **integrated operating system for a beverage & bakery business**.
It unifies front-of-house sales, kitchen operations, and back-of-house manufacturing
into a single, fully traceable platform — designed for **single-store operation first**,
but architected to scale to **multi-branch franchise operations** without a rewrite.

The defining constraint of the system is **end-to-end traceability**:

> Every product sold can be traced back to its **Employee**, **Workstation**,
> **Recipe Version**, **Production Batch**, **Inventory Movement**, and **Tax Invoice**.

This is not a feature — it is the backbone the entire data model is built around.

---

## Business capabilities (13 modules)

| # | Module | Purpose |
|---|--------|---------|
| 1 | Retail POS | In-store point of sale, payments, receipts |
| 2 | QR Ordering | Customer self-order via table/counter QR codes |
| 3 | Kitchen Display System (KDS) | Real-time order routing to beverage/bakery stations |
| 4 | Production Planning | Forecast & schedule batch production |
| 5 | Batch Manufacturing | Execute multi-day bakery processes (ferment/proof/bake) |
| 6 | Semi-Finished Inventory | Track work-in-progress between production stages |
| 7 | Raw Material Inventory | Stock of ingredients & supplies |
| 8 | Shelf Life Management | Expiry, FEFO rotation, freshness enforcement |
| 9 | Waste Management | Log, categorize & cost spoilage/waste |
| 10 | Tax Invoice Management | Thailand VAT 7%, sequential-by-branch (documented gaps), linked to every sale |
| 10b | Recall & Quarantine | Quarantine batches/lots, trace affected orders, immutable recall history (launch-required) |
| 11 | SOP Management | Standard operating procedures & versioned work instructions |
| 12 | Complaint Tracking | Customer complaints, resolution workflow |
| 13 | Employee KPI & HR Data | Productivity, quality, attendance, shifts, time entry + **export** to an external HR/payroll system |

> **HR boundary:** MR.BANANA'S OS is the *system of record* for KPI, attendance, shift
> and time data, and *feeds* an external HR/payroll system. It does **not** calculate
> payroll. See [Design Considerations §10](./09-design-considerations.md).

---

## Technology stack (approved direction)

| Layer | Choice |
|-------|--------|
| Frontend | Next.js (App Router) · TypeScript · Tailwind CSS · shadcn/ui |
| App type | Progressive Web App (PWA) — installable, offline-tolerant POS/KDS |
| Backend | Supabase (managed PostgreSQL, Edge Functions, Realtime) |
| Database | PostgreSQL with **Row Level Security (RLS)** |
| Auth | Supabase Auth (JWT, branch-scoped claims) |
| Storage | Supabase Storage (recipe media, SOP docs, complaint photos) |
| Deployment | Vercel (frontend + edge) · Supabase Cloud (data plane) |
| Architecture | Multi-tenant ready · Branch-based access control · Audit logging |

---

## The document set

Read in order. Each builds on the previous.

| # | Document | What it answers |
|---|----------|-----------------|
| 1 | [System Architecture](./01-system-architecture.md) | How the pieces fit together end-to-end |
| 2 | [Database ER Diagram](./02-database-er-diagram.md) | The complete data model & traceability chain |
| 3 | [Folder Structure](./03-folder-structure.md) | How the codebase is organized |
| 4 | [User Flows](./04-user-flows.md) | How each role moves through the system |
| 5 | [Security Model](./05-security-model.md) | RLS, auth, audit, threat model |
| 6 | [Role Permission Matrix](./06-role-permission-matrix.md) | Who can do what, per module |
| 7 | [Module Dependency Map](./07-module-dependency-map.md) | Build order & coupling between modules |
| 8 | [Development Roadmap](./08-development-roadmap.md) | Phased delivery plan, milestones, risks |
| 9 | [Design Considerations & Traceability](./09-design-considerations.md) | Maps the 10 critical considerations to the architecture; adds the HR layer |
| 10 | [Architecture Review (Adversarial)](./10-architecture-review.md) | Self-critique across 7 dimensions; 12 blocking fixes found — **all resolved** |
| 11 | [Phase 0 Implementation Plan](./11-phase-0-plan.md) | Foundation/security-de-risking build plan; scope, migrations, tests, exit gate |
| 12 | [Phase 0 Implementation Checklist](./12-phase-0-checklist.md) | W1–W13 work packages, status, per-WP detail |
| 13 | [Phase 0 Completion Package](./13-phase-0-completion.md) | Completion report, compliance/security matrices, deferred/debt/risks, Phase-1 entry |

---

## Guiding principles

1. **Traceability is non-negotiable.** No sale, no production step, no inventory
   movement exists without a complete provenance chain.
2. **Multi-tenant from day one in schema, single-tenant in operation.** Every row
   carries `tenant_id` + `branch_id` even while one store runs, so franchise
   scaling is a configuration change, not a migration.
3. **Append-only where it matters.** Inventory movements, production events, audit
   logs and tax invoices are immutable ledgers — corrections are new entries, never
   edits.
4. **Security enforced at the database, not just the app.** RLS is the source of
   truth for access; the application layer is a convenience, never the gatekeeper.
5. **Offline-tolerant at the edge.** POS and KDS must keep working through network
   blips; the PWA queues and reconciles.

> ⚠️ **No application code has been written.** These documents are the blueprint.
> Implementation begins only after sign-off.
