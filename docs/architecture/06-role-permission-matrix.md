# 06 — Role Permission Matrix

> Part of the [MR.BANANA'S OS architecture set](./00-README.md). Status: **Draft for approval.**

This matrix is the **human-readable contract** that the [RLS policies](./05-security-model.md)
implement at the database. Roles are assigned **per branch** — a user can be a
Manager at one branch and Staff at another.

---

## 1. Roles at a glance

| Role | Scope | Summary |
|------|-------|---------|
| **Owner** | All branches in tenant | Full control: config, users, finance, cross-branch reporting, audit |
| **Manager** | Single branch | Runs a branch: production, inventory, staff, complaints, reports |
| **Staff** | Single branch | Front-of-house: POS, payments, KDS, point-of-contact logging |
| **Baker** | Single branch | Back-of-house: production batches, inventory consumption, production waste |
| **Customer** | Self / session | Place & track own orders, pay, file complaints |

**Legend:** ✅ Full · 🟡 Limited / own-scope only · 👁️ Read-only · ❌ None

---

## 2. Master permission matrix

### Sales & front-of-house

| Capability | Owner | Manager | Staff | Baker | Customer |
|------------|:-----:|:-------:|:-----:|:-----:|:--------:|
| Create POS order | ✅ | ✅ | ✅ | ❌ | ❌ |
| Place QR order | ✅ | ✅ | ✅ | ❌ | 🟡 own |
| Take payment | ✅ | ✅ | ✅ | ❌ | 🟡 own |
| Void / refund order | ✅ | ✅ | 🟡 w/ reason | ❌ | ❌ |
| View order status | ✅ | ✅ | ✅ | 👁️ | 🟡 own |
| Operate KDS (beverage) | ✅ | ✅ | ✅ | ❌ | ❌ |

### Production & manufacturing

| Capability | Owner | Manager | Staff | Baker | Customer |
|------------|:-----:|:-------:|:-----:|:-----:|:--------:|
| Create/edit production plan | ✅ | ✅ | ❌ | 👁️ | ❌ |
| Start / advance batch | ✅ | ✅ | ❌ | ✅ | ❌ |
| Record batch events | ✅ | ✅ | ❌ | ✅ | ❌ |
| Complete batch → finished lots | ✅ | ✅ | ❌ | ✅ | ❌ |
| Operate KDS (bakery) | ✅ | ✅ | ❌ | ✅ | ❌ |

### Inventory

| Capability | Owner | Manager | Staff | Baker | Customer |
|------------|:-----:|:-------:|:-----:|:-----:|:--------:|
| View raw / semi / finished stock | ✅ | ✅ | 👁️ | 👁️ | ❌ |
| Receive raw materials | ✅ | ✅ | 🟡 | ❌ | ❌ |
| Consume inventory (production) | ✅ | ✅ | ❌ | ✅ | ❌ |
| Inventory adjustment | ✅ | ✅ | ❌ | ❌ | ❌ |
| Stock transfer between branches | ✅ | 🟡 req. | ❌ | ❌ | ❌ |

### Shelf life & waste

| Capability | Owner | Manager | Staff | Baker | Customer |
|------------|:-----:|:-------:|:-----:|:-----:|:--------:|
| View shelf-life / FEFO | ✅ | ✅ | ✅ | ✅ | ❌ |
| Log waste (counter) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Log waste (production loss) | ✅ | ✅ | ❌ | ✅ | ❌ |
| Approve / adjust waste records | ✅ | ✅ | ❌ | ❌ | ❌ |

### Recipes & catalog

| Capability | Owner | Manager | Staff | Baker | Customer |
|------------|:-----:|:-------:|:-----:|:-----:|:--------:|
| View recipes / versions | ✅ | ✅ | 👁️ active | ✅ active | ❌ |
| Create / edit draft recipe | ✅ | 🟡 | ❌ | ❌ | ❌ |
| Approve / activate recipe version | ✅ | ❌ | ❌ | ❌ | ❌ |
| Retire recipe version | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage product catalog / menu | ✅ | ✅ | ❌ | ❌ | 👁️ menu |

### Tax & finance

| Capability | Owner | Manager | Staff | Baker | Customer |
|------------|:-----:|:-------:|:-----:|:-----:|:--------:|
| Issue tax invoice | ✅ | ✅ | ✅ (at sale) | ❌ | ❌ |
| View invoices | ✅ all | ✅ branch | 🟡 own sales | ❌ | 🟡 own |
| Issue credit note / correction | ✅ | 🟡 w/ reason | ❌ | ❌ | ❌ |
| Configure tax profiles | ✅ | ❌ | ❌ | ❌ | ❌ |
| Financial reports | ✅ all | 👁️ branch | ❌ | ❌ | ❌ |

### SOP, complaints, KPI

| Capability | Owner | Manager | Staff | Baker | Customer |
|------------|:-----:|:-------:|:-----:|:-----:|:--------:|
| View SOPs | ✅ | ✅ | ✅ | ✅ | ❌ |
| Create / version SOPs | ✅ | 🟡 branch | ❌ | ❌ | ❌ |
| File complaint | ✅ | ✅ | ✅ | ❌ | 🟡 own |
| Assign / resolve complaint | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Initiate recall / quarantine** | ✅ | ✅ | ❌ | ❌ | ❌ |
| Execute recall actions (notify/dispose/close) | ✅ | ✅ | ❌ | ❌ | ❌ |
| View recall history | ✅ all | 👁️ branch | ❌ | ❌ | ❌ |
| Edit / delete recall history | ❌ | ❌ | ❌ | ❌ | ❌ |
| View KPI dashboards | ✅ all | ✅ branch | 🟡 own | 🟡 own | ❌ |
| Configure KPI targets | ✅ | 🟡 branch | ❌ | ❌ | ❌ |

### Administration & security

| Capability | Owner | Manager | Staff | Baker | Customer |
|------------|:-----:|:-------:|:-----:|:-----:|:--------:|
| Manage users & assign roles | ✅ | 🟡 staff/baker, own branch | ❌ | ❌ | ❌ |
| Onboard new branch (franchise) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage workstations | ✅ | ✅ | ❌ | ❌ | ❌ |
| View audit log | ✅ all | 👁️ branch | ❌ | ❌ | ❌ |
| Edit / delete audit log | ❌ | ❌ | ❌ | ❌ | ❌ |
| Tenant / billing settings | ✅ | ❌ | ❌ | ❌ | ❌ |

> **Note:** No role — not even Owner — can edit or delete the audit log, a finalized
> tax invoice, or recall history. These are immutable by design (see [Security Model §5](./05-security-model.md)).

---

## 3. Design rules behind the matrix

1. **Least privilege.** Each role gets exactly what its job requires. Bakers can't
   take payments; staff can't activate recipes.
2. **Separation of duties.** The person who *creates* a recipe draft (Manager) is not
   the person who *activates* it (Owner). Waste logging and waste approval are split.
3. **Branch confinement.** Manager/Staff/Baker permissions are always scoped to their
   assigned branch via RLS — "✅" never means cross-branch for non-Owners.
4. **Own-scope for customers.** Customers act only on their own orders/complaints,
   enforced by session ownership.
5. **Immutability beats permission.** Compliance-critical records are append-only;
   "edit" simply does not exist as an operation for anyone.

---

## 4. Escalations requiring approval

| Action | Performed by | Requires |
|--------|--------------|----------|
| Refund above threshold | Staff | Manager approval |
| Inventory adjustment | — | Manager (logged + audited) |
| Cross-branch stock transfer | Manager | Owner approval |
| Recipe version activation | — | Owner only |
| Tax invoice correction | Manager | Reason + audit entry |

---

## 5. Traceability of the matrix itself

Every permission grant is realized as an RLS policy and every role assignment is an
audited row in `user_branch_role`. Changing who-can-do-what is therefore a reviewed,
logged, version-controlled change — not a hidden toggle.
