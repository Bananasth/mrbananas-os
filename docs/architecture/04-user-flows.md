# 04 — User Flows

> Part of the [MR.BANANA'S OS architecture set](./00-README.md). Status: **Draft for approval.**

Flows for the five roles — **Owner, Manager, Staff, Baker, Customer** — plus the two
defining end-to-end journeys (made-to-order beverage, batch-produced bakery) that
exercise the traceability spine.

---

## 1. Authentication & branch context

Every authenticated session resolves a **tenant → branch → role** context before any
screen renders.

```mermaid
flowchart TD
    A[Open PWA] --> B{Authenticated?}
    B -- No --> C[Login via Supabase Auth]
    C --> D[JWT issued with tenant_id + branch roles]
    B -- Yes --> D
    D --> E{Multiple branches?}
    E -- Yes --> F[Select branch]
    E -- No --> G[Auto-select sole branch]
    F --> H[Set active branch context]
    G --> H
    H --> I{Role for this branch}
    I -- Owner/Manager --> J[Back-office]
    I -- Staff --> K[POS / KDS]
    I -- Baker --> L[Production console]
    I -- Customer --> M[QR ordering surface]
```

Customers typically arrive **without login** via a QR link; an optional light account
enables order history/loyalty (see open question in the [ER doc](./02-database-er-diagram.md)).

---

## 2. Journey A — Made-to-order beverage (POS + QR + KDS)

This is the high-frequency path. It creates the traceability chain **at sale time**.

```mermaid
sequenceDiagram
    participant C as Customer
    participant QR as QR Ordering
    participant S as Staff (POS)
    participant K as KDS (barista)
    participant DB as Database
    participant INV as Inventory
    participant TI as Tax Invoice

    alt Self-order
        C->>QR: Scan table QR, build order
        QR->>DB: Create order (channel=qr)
    else Counter order
        S->>DB: Create order (channel=pos, employee_id)
    end
    DB-->>K: Realtime: new order_item (queued)
    K->>DB: Mark "making" (workstation, employee captured)
    K->>INV: Consume ingredients → inventory_movement
    K->>DB: Mark "ready"
    DB-->>C: Realtime: order ready
    S->>DB: Take payment (idempotent)
    DB->>TI: Issue tax invoice (server-side, immutable)
    TI-->>S: Print receipt + invoice
    Note over DB: order_item now links employee, workstation,<br/>recipe_version, inventory_movement, tax_invoice
```

**Traceability captured:** employee, workstation, recipe version, inventory movement,
tax invoice. (`batch_id` is null for made-to-order.)

---

## 3. Journey B — Batch-produced bakery (multi-day)

The chain is created **during production**, days before the sale. This is why
production batches are the central hub.

```mermaid
flowchart TD
    A[Manager: create production plan] --> B[Baker: start batch from recipe_version]
    B --> C[Batch consumes raw + semi-finished<br/>→ inventory_movement]
    C --> D[Stage: Mix]
    D --> E[Stage: Ferment - hours/overnight]
    E --> F[Stage: Proof]
    F --> G[Stage: Bake]
    G --> H[Stage: Cool / Pack]
    H --> I[Batch complete → finished inventory_lot]
    I --> J[Shelf life computed from recipe shelf_life_hours]
    J --> K[Lot available for sale, FEFO-ranked]
    K --> L[Sold via POS/QR → order_item.batch_id set]
    L --> M[Finished lot decremented → inventory_movement]

    E -. timer anchored to DB timestamp .-> E
    F -. timer .-> F
```

**Multi-day handling:** each `batch_stage` carries planned/actual start+end; long
stages (overnight ferment) are tracked by server-anchored timers so a closed browser
or shift change never loses the clock. Each stage transition writes an append-only
`batch_event`.

**Traceability captured:** baker (employee), workstation, recipe version, production
batch, inventory movements (consume + produce + sell), and tax invoice at sale.

---

## 4. Role flows

### 4.1 Owner

```mermaid
flowchart LR
    O[Owner] --> A[All branches dashboard]
    O --> B[User & role management]
    O --> C[Tax profiles & invoice settings]
    O --> D[Recipe version approval / retire]
    O --> E[KPI & financial reports]
    O --> F[Audit log review]
    O --> G[Branch onboarding - franchise]
```

The Owner is the only role with cross-branch visibility and configuration authority,
including franchise branch onboarding.

### 4.2 Manager

```mermaid
flowchart LR
    M[Manager - single branch] --> A[Daily sales dashboard]
    M --> B[Create/adjust production plan]
    M --> C[Approve inventory adjustments]
    M --> D[Manage waste records]
    M --> E[Assign & resolve complaints]
    M --> F[Review staff KPI]
    M --> G[Manage SOPs for branch]
```

### 4.3 Staff (front-of-house)

```mermaid
flowchart LR
    S[Staff] --> A[Open/Take order at POS]
    S --> B[Process payment]
    S --> C[Issue receipt/invoice]
    S --> D[Work KDS queue - beverage]
    S --> E[Log waste at counter]
    S --> F[Capture complaint at point of contact]
```

### 4.4 Baker (back-of-house)

```mermaid
flowchart LR
    B[Baker] --> A[View today's production plan]
    B --> C[Start / advance batch stages]
    B --> D[Record batch events - temp, checks]
    B --> E[Consume raw/semi-finished inventory]
    B --> F[Complete batch → finished lots]
    B --> G[Log production-loss waste]
    B --> H[Follow SOP for workstation]
```

### 4.5 Customer

```mermaid
flowchart LR
    C[Customer] --> A[Scan QR at table/counter]
    A --> B[Browse menu - branch-specific]
    B --> D[Build & place order]
    D --> E[Track order status - realtime]
    E --> F[Pay - at counter or online]
    F --> G[Receive receipt]
    G --> H[Optionally file complaint]
```

---

## 5. Cross-cutting workflow — Complaint resolution

```mermaid
flowchart TD
    A[Complaint filed - customer/staff] --> B[Auto-link order/product if available]
    B --> C[Severity triage]
    C --> D[Manager assigns owner]
    D --> E{Investigation}
    E -->|Trace via order_item| F[Resolve root cause<br/>employee/batch/recipe/lot]
    F --> G[Record resolution]
    G --> H[Close + feed KPI]
```

Because every order item is fully traceable, a complaint can be resolved to the exact
batch, recipe version, employee, and workstation involved — turning complaints into
quality signals rather than dead-ends.

---

## 5b. Recall & Quarantine flow (Owner / Manager — required at launch)

Triggered by a quality/safety issue (often escalated from a complaint). Leverages the
traceability spine to find everything the bad batch touched, then quarantines remaining
stock so it cannot be sold.

```mermaid
flowchart TD
    A[Owner/Manager initiates recall<br/>on a batch or lot] --> B[Create recall record - status initiated]
    B --> C[Set batch/lot status = QUARANTINED]
    C --> D[Traverse spine:<br/>batch → finished lots → order_items → orders]
    D --> E[Snapshot results into recall_affected<br/>products, lots, orders - immutable]
    E --> F[List affected: products, lots, orders/customers]
    F --> G{Action}
    G -->|Block sales| H[Quarantined stock rejected at POS/QR]
    G -->|Notify| I[Flag affected orders / contact customers]
    G -->|Dispose| J[Quarantined lots → waste_record]
    H & I & J --> K[Record each step in recall_action - append-only]
    K --> L[Complete → Close recall]

    H -. sale attempt on quarantined lot .-> X[REJECTED at sale transaction]
```

**Guarantees:** every action writes an immutable `recall_action` row; the affected-set is
snapshotted at initiation; a quarantined batch/lot is structurally unsellable; only Owner
and Manager can initiate; all of it is audited.

---

## 6. Offline POS flow (degraded mode)

```mermaid
flowchart TD
    A[Network lost] --> B[POS stays live from cache]
    B --> C[Take order + tentative payment]
    C --> D[Write to local outbox - IndexedDB, client UUID]
    D --> E{Network back?}
    E -- Yes --> F[Replay outbox to server]
    F --> G{Server validates}
    G -- OK --> H[Finalize + issue tax invoice]
    G -- Conflict e.g. stock --> I[Flag for staff resolution]
    E -- No --> B
```

Tax invoices are **never** finalized offline — only after server confirmation — to
keep the legal record's per-branch numbering valid (any genuine gap is documented in
`invoice_number_gap`, not hidden).
