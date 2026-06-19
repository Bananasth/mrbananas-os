# 10 — Architecture Review (Adversarial)

> Part of the [MR.BANANA'S OS architecture set](./00-README.md). Status: **✅ All resolutions applied — design green for Phase 0.**

The architecture is approved. This document deliberately **attacked** it — surfacing every
flaw, edge case and scaling risk **while changes were still free**, before a line of code
locked them in. Findings are rated and each is marked **🔴 Resolve before coding** or
**🟡 Can defer (track it)**.

The review found **12 blocking issues**. **All 12 are now resolved and folded into the
schema and module contracts** (see the status column below and the change log at the end).
None invalidated the architecture; all were fixable cheaply on paper. The 🟡 backlog is
logged for its relevant phase.

---

## Severity & disposition legend

| | Severity | | Disposition |
|---|----------|---|-------------|
| 🔥 | Critical — data corruption / legal / breach | 🔴 | Resolve before coding |
| ⚠️ | High — wrong behavior under real load | 🟡 | Can defer, track as backlog |
| ▫️ | Medium / Low — quality or future concern | | |

---

## Findings summary

| # | Area | Finding | Sev | Disp |
|---|------|---------|:---:|:----:|
| N1 | Normalization | Polymorphic FKs — **✅ RESOLVED:** `inventory_item` supertype, single FK | 🔥 | ✅ |
| N2 | Normalization | Duplicated expiry / stored FEFO — **✅ RESOLVED:** `expires_at` on lot only; `shelf_life` is a view; FEFO computed | ⚠️ | ✅ |
| N3 | Normalization | `qty_on_hand` drift — **✅ RESOLVED:** ledger is authority; on-hand is reconciled cache | ⚠️ | ✅ |
| N4 | Normalization | Exclusive-arc FK — **✅ RESOLVED:** subsumed by N1 supertype | ▫️ | ✅ |
| I1 | Inventory | Oversell race — **✅ RESOLVED:** atomic locked decrement in sale txn | 🔥 | ✅ |
| I2 | Inventory | Offline POS sells stock that is already gone | ⚠️ | 🟡 |
| I3 | Inventory | Cross-branch transfer has no in-transit state | ⚠️ | 🟡 |
| I4 | Inventory | Refund/return restock path undefined | ▫️ | 🟡 |
| B1 | Bakery | Single-baker batch — **✅ RESOLVED:** per-stage `batch_stage.employee_id` | 🔥 | ✅ |
| B2 | Bakery | No failure/partial-yield — **✅ RESOLVED:** `failed`/`scrapped` states + `actual_yield`-driven output | ⚠️ | ✅ |
| B3 | Bakery | Perpetual sourdough starter doesn't fit the discrete-lot model | ⚠️ | 🟡 |
| B4 | Bakery | Co-products (one dough → loaves + rolls) unmodeled | ▫️ | 🟡 |
| T1 | Tax | "Gapless" vs Postgres sequences — **✅ RESOLVED:** Thailand, sequential-by-branch + documented gaps in `invoice_number_gap` | 🔥 | ✅ |
| T2 | Tax | Taxable date for offline sales — **✅ RESOLVED:** `sale_occurred_at` tax point added to `tax_invoice` | ⚠️ | ✅ |
| T3 | Tax | Line-vs-total tax rounding mismatch | ▫️ | 🟡 |
| T4 | Tax | Credit-note numbering — **✅ RESOLVED:** separate documented-gap series | ▫️ | ✅ |
| C1 | Complaint | Recall workflow — **✅ RESOLVED:** Recall & Quarantine added, launch-required | 🔥 | ✅ |
| C2 | Complaint | KPI attribution of complaints can be unfair / gameable | ⚠️ | 🟡 |
| C3 | Complaint | Complaint on an unsynced offline order can't link | ▫️ | 🟡 |
| F1 | Franchise | RLS + JWT claim-array cost at branch scale | ⚠️ | 🟡 |
| F2 | Franchise | Branch-level menu/price — **✅ RESOLVED:** `branch_product` table | ⚠️ | ✅ |
| F3 | Franchise | Single shared DB: data residency, noisy-neighbor, per-tenant extraction | ⚠️ | 🟡 |
| S1 | Security | JWT staleness — **✅ RESOLVED:** short TTL + `session_version` revocation | 🔥 | ✅ |
| S2 | Security | RLS fails open — **✅ RESOLVED:** CI guard fails build on any RLS-less table | 🔥 | ✅ |
| S3 | Security | Service-role key compromise = total bypass | ⚠️ | 🟡 |
| S4 | Security | Audit log tamperable by service-role; client-supplied UUID/branch trust | ⚠️ | 🟡 |

---

## 1. Database normalization

### N1 — Polymorphic foreign keys break integrity 🔥 → ✅ RESOLVED (`inventory_item` supertype)
`inventory_lot`, `inventory_movement`, and `waste_record` use `(item_kind, item_id)` to
point at one of `raw_material` / `semi_finished` / `product`. **Postgres cannot enforce a
foreign key on a polymorphic column** — nothing stops an `item_id` that references a
deleted or non-existent item, and joins require `CASE` branching. For a system whose
entire value proposition is *traceability*, an unenforceable reference at the center of
inventory is the single most dangerous design smell here.

**Resolution:** introduce a supertype table `inventory_item (id, item_kind, tenant_id)`
that `raw_material`, `semi_finished`, and `product` each reference 1:1 (shared-PK
inheritance). Inventory lots/movements/waste then carry a single real FK `item_id →
inventory_item.id`. One enforceable FK, no `CASE` joins, integrity guaranteed.

### N2 — Duplicated expiry + stored FEFO rank ⚠️ → ✅ RESOLVED (`shelf_life` is a view)
`expires_at` lives on **both** `inventory_lot` and `shelf_life`, and `shelf_life.fefo_rank`
is a **stored** derived value. Stored derivations rot: a corrected `produced_at` updates
one copy and not the other, and `fefo_rank` is wrong the moment any lot is added,
consumed, or expires.

**Resolution:** `expires_at` lives in exactly one place — `inventory_lot`. Drop
`shelf_life` as a separate table or reduce it to a *view*. Compute FEFO ordering at query
time (`ORDER BY expires_at`) backed by an index; never store the rank.

### N3 — `qty_on_hand` drifts from the ledger ⚠️ → ✅ RESOLVED (ledger authority + reconciliation)
We declared `inventory_movement` the append-only source of truth, then also store
`inventory_lot.qty_on_hand`. These **will** diverge under concurrency, failed
transactions, or a missed movement — and then which is right?

**Resolution:** pick one authority. Recommended: treat `qty_on_hand` as a *cache*
maintained transactionally in the same statement as the movement insert (trigger or
service), plus a scheduled reconciliation job that recomputes from the ledger and alarms
on mismatch. Document that the ledger always wins.

### N4 — Exclusive-arc ingredient FK ▫️ → ✅ RESOLVED (subsumed by N1)
`recipe_ingredient` has nullable `raw_material_id` and `semi_finished_id` with a prose
rule "exactly one set." Subsumed by N1's supertype: point `recipe_ingredient` at
`inventory_item` and the arc disappears. If N1 is deferred, add a `CHECK (num_nonnulls(...) = 1)`.

> **Verdict:** the model is otherwise sound and well-normalized (price/total snapshots on
> orders and invoices are *correct, intentional* denormalizations for immutability — not
> flaws). N1 is the one that must be fixed now because it's load-bearing.

---

## 2. Inventory edge cases

### I1 — Oversell race condition 🔥 → ✅ RESOLVED (atomic locked decrement)
Two POS terminals sell the last unit of a lot simultaneously. Both read
`qty_on_hand = 1`, both insert a `consume` movement, stock goes to `-1`. A CHECK on a
denormalized column won't save you under concurrent transactions.

**Resolution:** decrement must be atomic — `SELECT ... FOR UPDATE` on the lot row (or an
atomic `UPDATE ... WHERE qty_on_hand >= :n RETURNING`) inside the sale transaction; if it
fails, the sale is rejected or rerouted to another lot. This is a service-layer invariant
that must exist from the first POS line of code.

### I2 — Offline POS oversells ⚠️ 🟡
The offline outbox (approved in [Arch §7](./01-system-architecture.md)) can take sales for
stock that was depleted elsewhere while offline. On replay, I1's guard correctly rejects —
but the customer already has the product.

**Resolution (policy, not just code):** offline mode is for *made-to-order beverages* where
ingredient depletion is forgiving; **finished bakery lots should be sale-blocked offline or
sold against a reserved local allocation**. Conflicts on replay flag for manager
reconciliation rather than silently failing. Acceptable to defer if launch is single-store
with one terminal.

### I3 — Transfers have no in-transit state ⚠️ 🟡
A branch-to-branch transfer is modeled as one `consume` + one `receive`. Reality has a gap:
goods leave A, arrive at B hours/days later, and can be lost or partially received.

**Resolution:** model transfer as a two-phase entity (`dispatched → received`) with an
in-transit pseudo-location, reconciling discrepancies as waste/adjustment. Defer until
multi-branch (Phase 6), but note it now so the movement `reason` enum reserves the states.

### I4 — Return/refund restock undefined ▫️ 🟡
If a sale is refunded, does inventory come back? A spilled latte cannot be un-poured; an
unopened bag of beans can. The model has no rule.

**Resolution:** refunds default to **no restock** (treated as waste if applicable);
restock is an explicit manager action posting a `receive`/`adjust` movement. Define the
default at build.

---

## 3. Bakery production edge cases

### B1 — One baker per multi-day batch is wrong 🔥 → ✅ RESOLVED (per-stage `employee_id`)
`production_batch.employee_id` records a single baker. But the headline requirement is a
**multi-day** process (mix Monday, proof overnight, bake Wednesday) that inherently spans
**shifts and people**. Attributing the whole batch — and thus every item sold from it — to
one employee corrupts the traceability and KPI guarantees we sold the business on.

**Resolution:** move employee attribution to **`batch_stage.employee_id`** (who did each
stage) and keep `production_batch.employee_id` only as an optional "lead/owner." Provenance
for a sold bakery item then resolves to the *stage-level* actors. This is a small schema
change now, a painful one later.

### B2 — No failure / partial-yield path ⚠️ → ✅ RESOLVED (`failed`/`scrapped` + yield-driven)
Batches fail: a ferment goes wrong, an oven dies, yield comes in under plan. The status
enum and yield handling assume success.

**Resolution:** add batch statuses `failed` / `scrapped`; require `actual_yield` to drive
the produced finished-lot quantity (not `planned_qty`); route scrapped inputs/outputs to
`waste_record` with `production_loss`. Cheap now, structural later.

### B3 — Perpetual starter doesn't fit discrete lots ⚠️ 🟡
Sourdough starter/levain is *continuous* — you remove some, feed it, it never expires as a
discrete lot. Forcing it into `inventory_lot` with an `expires_at` is a category error.

**Resolution:** model a "maintained culture" as a long-lived semi-finished item with
feeding events (reuse `batch_event`) and *consumption* movements, but no hard expiry — or
exclude it from FEFO. Defer, but don't pretend it's a normal lot.

### B4 — Co-products unmodeled ▫️ 🟡
One dough batch can yield multiple products (loaves *and* rolls), and a batch maps to one
`recipe_version` → one product. Co-products and downcycling (stale bread → breadcrumbs)
have no representation.

**Resolution:** allow a batch to produce multiple finished lots of different products
(`batch_output` child table) if the bakery actually works this way — confirm with
operations before building. Likely Phase 2+ refinement.

---

## 4. Tax invoice edge cases

### T1 — "Gapless" vs Postgres sequences 🔥 → ✅ RESOLVED
> **Decided (Thailand):** use **sequential numbering per branch** and **accept documented
> gaps** (cancelled-before-issue / system failure / rollback), each recorded in
> `invoice_number_gap`. Strict gapless is **not** attempted — traceability and auditability
> beat artificial gaplessness, and this matches Thai Revenue Department practice. Option (a)
> below is therefore *not* used; option (b) is the chosen path.

We had promised **gapless** sequential invoice numbers and proposed a Postgres `sequence`.
Postgres sequences are explicitly **not** gapless — a rolled-back transaction consumes a
number permanently. So the implementation as specified cannot meet the requirement. This is
a genuine contradiction in the approved design.

**Resolution — pick one, per jurisdiction:**
- **(a)** Allocate the invoice number in a separate, *committed* step only after the sale
  is finalized, using a `branch_invoice_counter` row locked `FOR UPDATE` — truly gapless but
  serializes invoice issuance per branch (fine at store throughput).
- **(b)** Accept documented gaps if the tax authority permits (many do), and use a plain
  sequence.
  The choice depends on the jurisdiction decision still open ([Considerations §13 #1](./09-design-considerations.md)).
  **This must be answered before the tax module is built.**

### T2 — Taxable date for offline-then-synced sales ⚠️ → ✅ RESOLVED
> **Applied:** `tax_invoice.sale_occurred_at` (the tax point) added alongside `issued_at`;
> tax-period reporting keys on `sale_occurred_at`.

A sale is taken offline Friday night, syncs and is invoiced Saturday. Which date is the
*taxable event* — sale time or invoice time? Wrong choice misstates tax periods.

**Resolution:** the invoice must capture **both** `sale_occurred_at` (the tax point) and
`issued_at`, and tax-period reporting keys on the tax point. Add `sale_occurred_at` to
`tax_invoice` now.

### T3 — Line vs total tax rounding ▫️ 🟡
Tax computed per line then summed rarely equals tax computed on the order total — a
classic cent discrepancy that auditors notice.

**Resolution:** fix the rounding strategy (recommend line-level rounding, summed) and store
both line tax and invoice tax so they reconcile by construction. Document it.

### T4 — Credit-note numbering ▫️ → ✅ RESOLVED
Corrections issue credit notes, but their numbering series (shared with invoices? separate?)
is undefined — and credit notes have the same gapless concern as T1.

**Resolution (applied):** separate, clearly-prefixed **sequential** series for credit
notes, same documented-gap mechanism as T1, gaps logged in `invoice_number_gap` with
`series='credit_note'`.

---

## 5. Complaint edge cases

### C1 — No recall workflow 🔥 → ✅ RESOLVED (launch-required)
> **Applied:** Recall & Quarantine added to docs 02/04/05/06/07/08 — any batch/lot can be
> `quarantined` (sale-blocked), the spine identifies affected products/lots/orders into an
> immutable `recall_affected` snapshot, Owner/Manager initiate, all actions audited in the
> append-only `recall_action` log.

This was the most important *missing* capability in the whole system. We built a perfect
traceability spine precisely so that a contaminated batch can be traced — yet there is **no
workflow** to act on it. A foreign-object or illness complaint should let a manager: trace
the offending `production_batch` → find every finished lot from it → find every `order_item`
that sold those lots → identify affected customers/branches → quarantine remaining stock.
The data supports this; the process doesn't exist.

**Resolution:** add a **Product Recall / Quarantine** workflow (an extension of Complaint or
its own module): given a batch or lot, fan out across the traceability links to produce the
affected-sales list and flip remaining lots to a `quarantined` status that blocks sale. This
is high-value and should be at least stubbed in Phase 4. For a food business it is arguably a
launch requirement, not a nice-to-have.

### C2 — Unfair / gameable KPI attribution ⚠️ 🟡
Complaints feed employee KPI. But many complaints aren't the server's fault (supplier issue,
customer error, a different shift's batch). Auto-attributing to whoever served the order
creates perverse incentives and disputes.

**Resolution:** attribution must be **reviewed, not automatic** — a manager assigns
root-cause responsibility (employee / batch / supplier / none) during resolution, and only
*confirmed* attributions feed KPI. Add a `root_cause` + `attributed_to` to `complaint`.

### C3 — Complaint on an unsynced order ▫️ 🟡
A customer complains about an order still sitting in an offline outbox; there's no `order_id`
to link.

**Resolution:** allow complaints to attach a client order UUID and back-link once the order
syncs. Minor; defer.

---

## 6. Franchise scaling risks

### F1 — RLS + JWT claim-array cost ⚠️ 🟡
Every query is filtered through policy functions reading a `branch_roles` JWT array. At a
large franchise, an owner with many branches has a big claim array, and per-row
`has_branch_role()` evaluation can degrade. JWT size also grows.

**Resolution:** keep policies index-friendly (filter on indexed `branch_id`, mark helper
functions `STABLE`); for owners use a tenant-wide read policy rather than enumerating
branches; cap/段 the branch claim and fall back to a server-side lookup for super-owners.
Benchmark in Phase 6. Not a launch blocker at single-store.

### F2 — No branch-level menu/price override ⚠️ → ✅ RESOLVED (`branch_product`)
`product` is tenant-scoped with a single price. Real franchises have **per-branch pricing,
availability, and menus** (airport branch charges more; some items are branch-exclusive).
The model can't express this, and retrofitting pricing after sales/invoices exist is
painful.

**Resolution:** add a `branch_product` table (branch_id, product_id, price_override,
is_available, menu flags) now, even if single-store ignores it. Order/invoice already
snapshot price, so history stays correct. Decide before the catalog schema locks.

### F3 — Single shared DB limits ⚠️ 🟡
One Postgres for all tenants brings: **data-residency** conflicts (a franchisee in another
country under GDPR/local law), **noisy-neighbor** contention, and hard **per-tenant
extraction/deletion** on franchise exit, plus a single migration blast-radius across all
tenants.

**Resolution:** acceptable for the single-store and early-franchise stage, but document the
exit ramp: tenant-per-schema or tenant-per-database sharding is the scale-out path, and the
clean module/RLS boundaries already make it feasible. Add data-residency to the jurisdiction
decision. Track explicitly; don't let "multi-tenant ready" imply "infinitely scalable as-is."

---

## 7. Security risks

### S1 — Stale JWT after role change 🔥 → ✅ RESOLVED (short TTL + `session_version`)
Roles live in the JWT claims. Fire an employee or revoke a manager and **their existing token
still works until it expires** — they retain access to POS, data, maybe refunds, for the
token lifetime. For a system with cash and PII, that window is a real breach vector.

**Resolution:** short access-token TTL (≤ 5–15 min) with refresh; on
role-change/termination, **revoke refresh tokens** and maintain a server-side
revocation/`session_version` check so the next request fails fast. Must be designed into
auth from Phase 0, not bolted on.

### S2 — New table without RLS = silent open door 🔥 → ✅ RESOLVED (CI guard)
RLS is deny-by-default *only on tables that have it enabled*. A future migration that adds a
table and forgets `ENABLE ROW LEVEL SECURITY` is wide open via the anon/auth key — and
nothing fails loudly.

**Resolution:** a CI guard that **fails the build** if any table in a business schema lacks
RLS enabled and at least one policy; plus a default-deny baseline. This is the cheapest
high-leverage control in the whole review — add it in Phase 0.

### S3 — Service-role key = total bypass ⚠️ 🟡
The admin client bypasses all RLS. One leak (a mis-imported module, a logged env var, a
client bundle mistake) compromises every tenant.

**Resolution:** the service-role key is server-only, never imported into any client-reachable
module (enforce with an ESLint/import boundary + bundle check), scoped to Edge Functions and
cron, rotated on a schedule, and never used to serve a browser request. Already the intent —
make it mechanically enforced, not a convention.

### S4 — Audit tamper & client-trust gaps ⚠️ 🟡
Two related holes: (a) the "immutable" audit log is only immutable against normal roles — the
service-role can still alter it; (b) `payment.client_uuid` and any client-supplied id are
attacker-controllable (replay/forge), and `branch_id` must **never** be trusted from a request
body.

**Resolution:** (a) consider append-only hardening — a separate restricted role for audit
writes, periodic export to WORM/external storage, and row hashing/chaining for
tamper-evidence; (b) reaffirmed rule: `tenant_id`/`branch_id` always derive from the JWT,
never the payload; validate `client_uuid` format and bind it to the authenticated session.

> **Broader note:** also confirm rate-limiting placement (QR ordering + Edge Functions),
> QR-token entropy/expiry, signed-URL TTLs, and PII minimization in `audit_log` before/after
> JSON. These are build-time controls, tracked but not blocking the schema.

---

## What this review changed

### 🔴 → ✅ All 12 blocking resolutions applied

| Finding | Concrete change | Folded into |
|---------|-----------------|-------------|
| C1 | Recall & Quarantine over the spine (batch/lot `quarantined`, immutable history, Owner/Manager) | docs 02/04/05/06/07/08 |
| T1 | Sequential-by-branch + documented gaps in `invoice_number_gap` (Thailand VAT 7%) | docs 02/05/08 |
| T2 | `sale_occurred_at` (tax point) on `tax_invoice` | doc 02 |
| T4 | Separate documented-gap series for credit notes | doc 02 |
| N1 | `inventory_item` supertype; single FK for lots/movements/waste/ingredients | docs 02/08 |
| N2 | Single `expires_at` on `inventory_lot`; `shelf_life` a view; FEFO computed | docs 02/08 |
| N3 | `qty_on_hand` = transactional cache + reconciliation; ledger is authority | docs 02/08 |
| I1 | Atomic locked decrement as a service invariant | docs 02/08 |
| B1 | Employee attribution at `batch_stage` | docs 02/08 |
| B2 | `failed`/`scrapped` statuses; yield-driven output; scrap → waste | docs 02/08 |
| F2 | `branch_product` for per-branch price/availability | docs 02/08 |
| S1 | Short token TTL + `session_version` revocation | docs 05/08 |
| S2 | CI guard failing the build on any RLS-less business table | docs 05/08 |

### 🟡 Tracked backlog (revisit at the relevant phase)
I2, I3, I4, B3, B4, T3, C2, C3, F1, F3, S3, S4 — each noted in its section with the phase it
belongs to.

---

## Reviewer's bottom line

The architecture is **sound and approved** — the traceability spine, RLS-first security,
multi-tenant schema, and immutability model all held up under pressure. The review found one
unenforceable integrity hole (N1), one self-contradiction (T1), a traceability gap (B1), a
missing food-safety capability (C1), and two security defaults that failed open (S1, S2) —
**all twelve are now resolved and folded into the schema and contracts.**

**Status: 🟢 Green for Phase 0.** No 🔴 items remain; the 🟡 backlog needs no action before
build. No application code is written until the build is authorized.
