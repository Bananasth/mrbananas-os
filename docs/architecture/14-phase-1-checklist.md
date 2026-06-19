# 14 — Phase 1 & 2 Implementation Checklist

> Part of the [MR.BANANA'S OS architecture set](./00-README.md). Status: **In progress.**

Phase 1 builds **master data** on the Phase 0 foundation; Phase 2 begins **production**. Each table reuses the W11 RLS
policy template and is caught by the W12 guard if RLS is forgotten. Commit cadence: **one
commit per work package**. The recommended live-DB + Auth + runtime integration task is
**deferred** until a database (Docker/Supabase or equivalent) is available — current WPs are
authored and verified **offline / statically** like Phase 0.

**Legend:** ⬜ not started · 🔄 in progress · ✅ complete

| WP | Title | Status |
|----|-------|:------:|
| P1-W1 | Inventory subtypes (raw_material, semi_finished, product, unit_conversion) | ✅ |
| P1-W2 | Branch-specific product (pricing/availability) | ✅ |
| P1-W3 | Catalog & recipes (recipe, recipe_version, recipe_ingredient) | ✅ |
| P1-W4 | Suppliers & purchasing (supplier, purchase_order, purchase_order_line) | ✅ |
| P1-W5 | Inventory ledger (lots, movements, stock-on-hand, receiving) | ✅ |
| P2-W1 | Production core (plan, batch, stage, event) | ✅ |
| P2-W2 | Batch-execution primitives (consume, complete, produce, reconcile) | ✅ |
| P1-Wx | Live-DB + Auth + runtime integration tests | ⬜ (deferred — needs a database) |

---

## P1-W1 — Inventory subtypes ✅

> **Scope:** the three stockable subtypes + unit conversions on the `inventory_item`
> supertype. RLS-first least-privilege (reusing 0007 helpers). No movements, lots, ledger,
> pricing logic, or workflows. Offline / static-reviewed.

- **Objective:** Attach `raw_material` and `semi_finished` as shared-PK subtypes of
  `inventory_item`, add `product` (catalog entity, optional stock link), and
  `unit_conversion` (UoM).
- **Migrations:** `0008_inventory_subtypes.sql`.
- **Tests:** static schema test (subtypes, composite FKs, kind/tenant enforcement, RLS +
  policies, UoM constraints); RLS guard updated to cover the 13 tables.
- **Acceptance:** all four tables RLS-protected + least-privilege; supertype integrity
  enforced by composite FKs; guard green.
- **Deferred (documented):** product↔inventory_item tenant-match is app-enforced for the
  optional link; product `finished`-kind tie deferred; live runtime proof pending a DB.

---

## P1-W2 — Branch-specific product (F2) ✅

> **Scope:** per-branch price override + availability/menu placement. RLS-first; money in
> integer minor units. Offline / static-reviewed.

- **Objective:** `branch_product` so franchises override price/availability per branch while
  orders/invoices still snapshot the effective price.
- **Migrations:** `0009_branch_product.sql`.
- **Tests:** static schema (composite-FK tenant match, minor-unit price, availability, one
  override per product/branch, RLS Owner/Manager/member); RLS guard updated to 14 tables.
- **Acceptance:** RLS-protected least-privilege (Owner full, Manager own-branch manage,
  staff/baker read); branch+product forced to share a tenant. Guard green.
- **Deferred:** customer menu read arrives with QR ordering.

---

## P1-W3 — Catalog & recipes ✅

> **Scope:** recipe → recipe_version (immutable once active) → recipe_ingredient (single FK
> to inventory_item, N1). DB-enforced version control. RLS-first. Offline / static-reviewed.

- **Objective:** Versioned recipes with database-enforced immutability and a single-FK BoM.
- **Migrations:** `0010_catalog_recipes.sql`.
- **Tests:** static schema (FK chain, single-FK ingredient, status/quantity checks); version
  control (one-active partial unique; active/retired immutability triggers; ingredient
  freeze; SECURITY DEFINER status helper); RLS on all three. RLS guard updated to 17 tables.
- **Acceptance:** active versions content-frozen (only active→retired); retired fully
  immutable; ≤1 active version per recipe; active-version ingredients frozen; RLS
  least-privilege. Guard green.
- **Deferred:** Manager draft authoring + activation *workflow* (Owner-write for now);
  restrict ingredient `item_id` to raw/semi kinds; live runtime proof pending a DB.

---

## P1-W4 — Suppliers & purchasing ✅

> **Scope:** minimal purchasing — supplier master, PO header, PO lines. No receiving,
> movements, lots, or ledger (those arrive with the inventory-ledger module). RLS-first.
> Offline / static-reviewed.

- **Objective:** `supplier` → `purchase_order` (per branch) → `purchase_order_line`
  (single FK to inventory_item).
- **Migrations:** `0011_purchasing.sql`.
- **Tests:** static schema (tenant-safe composite FKs, status enum, qty/cost checks,
  PO-branch SECURITY DEFINER helper, minimal-scope guard); RLS (Owner full, Manager
  own-branch, staff read; supplier tenant-read). RLS guard updated to 20 tables.
- **Acceptance:** branch isolation on PO + lines (lines via `purchase_order_branch()`
  helper); supplier/PO/line RLS least-privilege. Guard green.
- **Deferred:** receiving → inventory movements/lots (inventory-ledger module).

---

## P1-W5 — Inventory ledger ✅

> **Scope:** lots, the append-only movement ledger (N3 source of truth), the qty_on_hand
> cache, a guarded receiving primitive, and shelf_life/stock_on_hand views (N2). RLS-first.
> Offline / static-reviewed.

- **Objective:** receiving + inventory movement + stock-on-hand foundation.
- **Migrations:** `0012_inventory_ledger.sql`.
- **Tests:** static schema (lot cache/expiry/status, movement reason enum + non-zero delta,
  tenant-safe FKs, FEFO index); append-only movement (reuses reject_mutation) + qty_on_hand
  maintenance trigger; guarded `receive_inventory` (SECURITY DEFINER + internal authz);
  shelf_life/stock_on_hand views (security_invoker); RLS. Guard updated to 22 tables.
- **Acceptance:** ledger append-only; qty_on_hand maintained from movements with a `>= 0`
  CHECK preventing over-depletion; receiving validates tenant + branch role; shelf life is a
  view (N2); FEFO = order by expires_at. Guard green.
- **Deferred:** atomic locked decrement at point-of-sale (I1, Phase 3 POS);
  qty_on_hand-freeze against direct edits; nightly ledger reconciliation job (Edge
  Function); inventory_lot.batch_id FK (closed in P2-W1); live runtime proof pending a DB.

---

## P2-W1 — Production core ✅

> **Scope:** the bakery traceability spine — plan → batch → stage → event. RLS-first.
> Offline / static-reviewed.

- **Objective:** `production_plan`, `production_batch`, `batch_stage`, `batch_event`.
- **Migrations:** `0013_production_core.sql`.
- **Tests:** static schema (FK chain, recipe_version pin, branch-checked workstation, six
  stages); B1 per-stage employee + optional batch lead; B2 failed/scrapped + actual_yield;
  append-only `batch_event`; closes `inventory_lot.batch_id` FK; RLS (Owner full, Manager+
  Baker ops on batch/stage/event, Manager-only plan, staff read) via `batch_branch()` helper.
  RLS guard updated to 26 tables.
- **Acceptance:** batch pins recipe_version + branch-local workstation; per-stage provenance;
  failure/partial-yield first-class; event log append-only; produced lots link back to the
  batch. Guard green.
- **Deferred:** stage-timer / multi-day SLA logic, quarantine/recall workflow (Phase 4);
  live runtime proof pending a DB.

---

## P2-W2 — Batch-execution primitives ✅

> **Scope:** close the production↔inventory loop with guarded DB primitives. No new tables.
> Offline / static-reviewed.

- **Objective:** consume inventory, complete batches, produce finished lots, reconcile yield.
- **Migrations:** `0014_batch_execution.sql`.
- **Tests:** static — `consume_for_batch` (SECURITY DEFINER, FEFO + row-lock, negative
  consume movements ref the batch, insufficient-stock raise); `complete_batch` (status guard,
  finished-item resolution via recipe→product, produce movement from actual_yield, batch
  reconciliation); `production_batch_yield` variance view.
- **Acceptance:** consumption is FEFO and authorized; completion produces a finished lot of
  exactly actual_yield linked to the batch and marks it completed; yield variance is
  queryable. Production now reads/writes the ledger end-to-end.
- **Deferred:** scrap→waste routing (waste module, Phase 4); recipe-driven auto-consume of a
  whole BoM (service layer); live runtime proof pending a DB.
