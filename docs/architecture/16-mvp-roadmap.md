# 16 — Store MVP Implementation Roadmap

> Part of the [MR.BANANA'S OS architecture set](./00-README.md). Status: **Plan — no code written.**

Goal: the **first usable single-store MVP** — an owner can set up the store, staff can take
orders and payment, the kitchen/bar can fulfil them, and compliant tax invoices are issued.

**In scope (priority order):** Supabase Auth → API layer → Admin setup UI → POS → KDS.
**Out of scope (deferred):** Waste, SOP, Complaint, KPI/HR, QR ordering, franchise/multi-branch UI.

The **backend is done and runtime-validated** (35 tables, RLS, primitives like
`receive_inventory`, `fulfil_order_item`, `complete_batch`, `issue_tax_invoice`). This
roadmap is almost entirely the **application layer** that sits on top of it.

> Estimates are rough developer-days for one focused engineer; parallelizable across two.
> Stack: Next.js (App Router) · TypeScript · Tailwind · shadcn/ui · PWA · Supabase
> (Auth/Postgres/Realtime/Storage) · Vercel.

| Phase | Title | Est. (dev-days) |
|------|-------|:---------------:|
| 0 | App scaffold (prerequisite) | 2–3 |
| 1 | Supabase Auth | 3–4 |
| 2 | API / service layer | 5–7 |
| 3 | Admin setup UI | 6–9 |
| 4 | POS | 8–12 |
| 5 | KDS | 4–6 |
| 6 | Deploy & MVP hardening | 4–6 |
| | **Total** | **~32–47** (≈ 6–9 weeks solo) |

---

## Phase 0 — App scaffold (prerequisite, not in the priority list but required)

**Why:** the repo has no Next.js app, Tailwind, or shadcn/ui yet — nothing else can be built
without it.

**Files to create**
- `next.config.ts`, `postcss.config.mjs`, `tailwind.config.ts`, `components.json` (shadcn)
- `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`, `src/app/manifest.ts`
- `public/` — PWA icons + service-worker registration
- `components/ui/*` — shadcn primitives (button, input, dialog, table, form, toast, select, card)
- `src/components/layout/*` — app shell, nav, branch switcher (stub)
- `src/lib/utils.ts` (`cn`)
- edits: `package.json` (next/react/tailwind/shadcn deps), `tsconfig.json` (jsx, path aliases), CI to build the app

**Dependencies:** existing repo (Phase 0 backend).

**Completion criteria**
- `next build` succeeds; app renders a shell; installable PWA; design tokens + base components in place; CI builds the frontend; deploys to a Vercel preview.

---

## Phase 1 — Supabase Auth

**Scope:** real login against the project, JWT claims wired into RLS, route protection,
session-version revocation. (The claims hook is already authored/applied.)

**Files to create**
- `src/lib/supabase/client.ts` (browser, `@supabase/ssr`), `src/lib/supabase/server.ts` (server), `src/lib/supabase/middleware.ts`
- `middleware.ts` (Next root) — session refresh, route protection, **session-version check**
- `src/server/auth/context.ts` — resolve `{ userId, tenantId, branchRoles, role }` from JWT claims
- `src/server/auth/guard.ts` — `requireAuth` / `requireRole` / `requireBranch`
- wire existing `src/server/auth/session-version.ts` + `claims.ts`
- `src/app/(auth)/login/page.tsx` + login/logout server actions; branch auto-select (single store)
- `.env.local` wiring: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `tests/integration/auth.*` — login → claims → RLS

**Dependencies:** Phase 0; claims hook applied to the Supabase project; anon key.

**Completion criteria**
- A user logs in via Supabase Auth; the access token carries `tenant_id` / `branch_roles` /
  `session_version`; unauthenticated requests redirect to login; role-based routing works;
  **bumping `session_version` invalidates the session on the next request (S1)**; validated
  against the live project.

---

## Phase 2 — API / service layer

**Scope:** typed service functions + server actions/route handlers that wrap the existing DB
primitives, enforced by RLS via the **user-scoped** client (the user's JWT). This is the BFF;
it adds validation and orchestration, not new business logic.

**Files to create**
- `src/server/db/client.ts` (user-scoped, RLS applies), `src/server/db/admin.ts` (server-only; already patterned)
- `src/server/services/base.ts` (Result/error/transaction helpers), reuse `src/lib/result.ts`
- per module: `src/modules/<m>/{services,schemas,types,index.ts}` for:
  - `catalog` — list products + per-branch prices, recipes
  - `inventory` — `receive_inventory`, stock-on-hand, lots, quarantine/recall (read)
  - `production` — plan, batch, `consume_for_batch`, `complete_batch`
  - `sales` — create order, add/update line, `fulfil_order_item`
  - `payment` — capture (cash now; gateway later)
  - `invoice` — `issue_tax_invoice`, fetch invoice/receipt data
- `src/app/api/**` route handlers **or** server actions (BFF); zod-validate every input
- `tests/integration/services.*`

**Dependencies:** Phase 1 (auth context drives RLS); backend primitives (exist).

**Completion criteria**
- Every MVP operation exposed as a typed, zod-validated service that runs **under RLS as the
  caller**; integration tests prove correct results and role enforcement (e.g. staff can sell
  but not edit recipes); errors returned as `Result`, never leaked.

---

## Phase 3 — Admin setup UI

**Scope:** an owner/manager can stand up a store's master data **without SQL** — the
chicken-and-egg fix so POS has a menu and staff.

**Files to create**
- `src/app/(backoffice)/layout.tsx` — owner/manager shell, nav, branch switcher
- `settings/`: `users` (create `app_user` + assign `user_branch_role`), `branches`,
  `workstations`, `suppliers`, `employees`
- `catalog/`: `products` (+ per-branch price via `branch_product`), `recipes`
  (draft → ingredients → **activate**, respecting immutability)
- `inventory/`: receive-stock form, stock-on-hand view
- shadcn `form` + zod forms, data tables, server actions calling Phase 2 services
- a first-owner **bootstrap** flow (provision the initial tenant/owner)
- `tests/e2e/admin.*` (Playwright)

**Dependencies:** Phase 2 services; Phase 1 (owner/manager-gated).

**Completion criteria**
- An owner can create branches/workstations/employees/users+roles, enter products with
  per-branch prices, author and activate recipes, and receive stock — entirely via UI. The
  store has a real menu, prices, recipes, and staff logins.

---

## Phase 4 — POS

**Scope:** the revenue path — build order → take payment → fulfil (deduct stock) → issue tax
invoice → print/PDF receipt.

**Files to create**
- `src/app/(pos)/layout.tsx` (terminal shell), `src/app/(pos)/sale/page.tsx`
- components: `MenuGrid`, `Cart`, `PaymentDialog`, `Receipt`
- order flow: create `sales_order`, add `order_item` (capturing recipe_version + workstation +
  employee), `fulfil_order_item` (FEFO deduct, no oversell), complete → `issue_tax_invoice`
- cash payment now; **payment-gateway hook** stubbed for Phase 6
- receipt/tax-invoice **PDF or thermal print**
- (optional, flagged) offline outbox — see Decisions
- `tests/e2e/pos.*`

**Dependencies:** Phase 2 (sales/payment/invoice services), Phase 3 (menu exists), Phase 1 (staff auth).

**Completion criteria**
- A staff user takes an order, takes cash payment, fulfils it (stock deducts via FEFO with no
  oversell — for **both** beverages [ingredient deduct] and bakery [finished-lot deduct]), and
  the system issues a sequential **Thai VAT 7% tax invoice** + a printable receipt — full path
  end-to-end on the live DB.

---

## Phase 5 — KDS

**Scope:** kitchen/bar see and fulfil order items in realtime.

**Files to create**
- `src/app/(kds)/board/page.tsx` — realtime ticket board by station
- Supabase **Realtime** subscription on `order_item` (per branch/station); polling fallback
- components: `Ticket`, `StationColumn`; status transitions `queued → making → ready → served`
- status-update server actions (RLS: staff/baker on their branch)
- enable Realtime on `order_item` in the project
- `tests/e2e/kds.*`

**Dependencies:** Phase 4 (orders exist); Realtime enabled; Phase 1 (staff/baker auth).

**Completion criteria**
- New order items appear on the KDS in realtime; staff/baker advance status; POS reflects
  `ready`; beverage and bakery stations both routed correctly.

---

## Phase 6 — Deploy & MVP hardening (required for a real store)

**Scope:** make it real and safe to operate.

**Files to create / set up**
- Vercel project + env/secrets (prod Supabase URL/anon; service-role server-only)
- CI deploy workflow; preview-per-PR + prod-on-main
- monitoring/error tracking (e.g. Sentry); basic rate limiting at the edge
- **payment gateway** integration if accepting card/PromptPay (Omise/2C2P) — else cash-only MVP
- receipt/label printing integration; backup/restore runbook; go-live checklist
- PDPA notice + tax (RD) compliance confirmation
- `tests/e2e/*` smoke against the deployed preview

**Dependencies:** Phases 1–5.

**Completion criteria**
- Deployed to production Supabase + Vercel; a real store can log in and transact; monitoring +
  backups verified; a documented go-live runbook and rollback.

---

## Cross-cutting (every phase)

- **Testing:** extend the existing runtime harness; add **Playwright** E2E per surface; keep
  the offline gate (typecheck/lint/format/test/RLS-guard/coverage) green.
- **Security:** RLS is the authority (already proven); service-role stays server-only;
  short token TTL + session-version revocation; rate limiting (Phase 6).
- **i18n:** Thai language for POS/receipts/customer-facing text.
- **PWA/offline:** installable; offline POS is a **decision** (below).
- **Accessibility & design system:** shadcn/ui + tokens from Phase 0.

## Key decisions / risks to resolve before/within these phases

1. **First-owner bootstrap** — how the very first tenant + owner login is created (admin
   script vs. a one-time provisioning page). Blocks Phase 3.
2. **Payment at launch** — cash-only (fast) vs. real gateway (Omise/2C2P/PromptPay → Phase 6,
   adds scope). Affects Phase 4/6.
3. **Receipt/invoice output** — PDF vs. thermal printer; affects Phase 4 + hardware.
4. **Offline POS outbox** — build now (resilient, more work) or defer (risk if network drops).
   The architecture mandated it; treat as a launch risk, not a nice-to-have.
5. **KDS transport** — Supabase Realtime vs. polling; Realtime needs enabling + testing.
6. **Tax compliance** — confirm Thai RD invoice format / e-Tax obligations before go-live.

## Suggested execution order

`0 → 1 → 2` are strictly sequential (foundation). `3` and the read parts of `4` can overlap
once `2` lands. `5` follows `4`. `6` runs alongside late `4/5` and finishes last. Recommend
committing per work-package and validating each against the live Supabase project, exactly as
the backend was built.
