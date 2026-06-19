# 14 — Phase 1 Implementation Checklist

> Part of the [MR.BANANA'S OS architecture set](./00-README.md). Status: **In progress.**

Phase 1 builds **master data** on the Phase 0 foundation. Each table reuses the W11 RLS
policy template and is caught by the W12 guard if RLS is forgotten. Commit cadence: **one
commit per work package**. The recommended live-DB + Auth + runtime integration task is
**deferred** until a database (Docker/Supabase or equivalent) is available — current WPs are
authored and verified **offline / statically** like Phase 0.

**Legend:** ⬜ not started · 🔄 in progress · ✅ complete

| WP | Title | Status |
|----|-------|:------:|
| P1-W1 | Inventory subtypes (raw_material, semi_finished, product, unit_conversion) | ✅ |
| P1-W2 | Branch-specific product (pricing/availability) | ⬜ |
| P1-W3 | Catalog & recipes (recipe, recipe_version, recipe_ingredient) | ⬜ |
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
