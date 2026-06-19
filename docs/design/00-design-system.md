# MR.BANANA'S — Design System (UI/UX Specification)

> Status: **Specification — no code.** Brand references: storefront + mascot renders + logo
> source `~/Documents/mrb.ai`. Applies to POS, KDS, Dashboard, and the PWA.

**Design tension to hold:** playful banana brand ↔ professional, fast, legible ERP/POS.
Rule of thumb: **brand = warmth & delight (yellow, mascot, rounded); UI = clarity & speed
(navy structure, high contrast, tabular numbers).** The mascot delights at the edges
(empty/success/onboarding); it never clutters dense data or transaction screens.

**Brand voice:** friendly, upbeat, effortless — *"เรื่องกล้วยๆ" (easy peasy)*, *"Good food,
good mood, happy time."*

---

## 1. Brand colors

### Core palette
| Token | Hex | Role |
|------|-----|------|
| **Banana** (primary brand) | `#FFC72C` | Brand accent, highlights, primary CTA fills (with navy text), active states |
| **Navy / Ink** (structural) | `#1A2862` | App chrome, nav, headings, primary UI text/actions — the "professional" anchor |
| **Banana Red** (accent) | `#E63A2E` | Destructive (void/remove), alerts, awning accents, sparing emphasis |
| **Cream** (warm surface) | `#FBEAC9` → `#FFFDF7` | Warm backgrounds, the mascot's body tone, friendly fills |
| **Leaf Green** (fresh/success) | `#4FB23A` | Paid / success / "fresh" shelf-life / positive deltas |
| **Off-white** | `#FFFDF7` | Card/surface base (slightly warm, not stark white) |

### Accessibility rule (critical)
- **Yellow is never text.** It fails contrast on white/cream. Use banana as a **fill** with
  **navy `#1A2862` text** (passes AA for large text) or as an accent block. All body text is
  navy/ink or warm-gray on light surfaces. Target **WCAG AA** (4.5:1 body, 3:1 large/UI).

### Full scales (for tokens — see §8)
- `banana` 50→900, `navy` 50→900, `red` 50→900, `leaf` 50→900, `cream` 50→400, and a warm
  neutral `stone` for text/borders/surfaces.

### Semantic mapping
| Semantic | Value |
|----------|-------|
| primary (structure/links/secondary actions) | navy-700 `#1A2862` |
| accent / brand highlight | banana-500 `#FFC72C` |
| **Pay/Charge CTA** | banana-500 fill + navy-900 text |
| success / paid / fresh | leaf-500 `#4FB23A` |
| danger / void | red-500 `#E63A2E` |
| warning / expiring | amber `#F59E0B` (or banana-600) |
| info | navy-400 |
| background (app) | cream-50 `#FFFDF7` / white |
| surface (cards) | white `#FFFFFF` |
| text / foreground | navy-900 `#0E1638` / stone-800 |
| muted text | stone-500 |
| border / divider | stone-200 |

---

## 2. Typography

Thai-first pairing. Friendly rounded display for brand moments; clean humanist sans for UI;
**tabular numerals everywhere money/qty appears.**

| Use | Font | Notes |
|-----|------|-------|
| **Display / brand headings, POS tile prices, big numbers** | **Baloo 2** (Latin) + **Baloo Thai 2** (Thai) | Rounded, warm, on-brand; weights 600/700/800. Headings & hero numbers only |
| **UI / body (Thai + Latin)** | **IBM Plex Sans Thai** | Professional, excellent Thai support, includes Latin; weights 400/500/600 |
| **Tabular numerals (tables, totals, receipts)** | IBM Plex Sans Thai `tabular-nums` (or Inter for Latin-only tables) | Money + quantities must align |
| **Receipt / invoice no.** | **IBM Plex Mono** | Monospace for ESC/POS-style receipts & sequential numbers |

### Type scale (rem)
| Token | Size / line-height | Use |
|-------|--------------------|-----|
| display | 2.5 / 1.15 | Hero, login, big totals |
| h1 | 2.0 / 1.2 | Page titles |
| h2 | 1.5 / 1.3 | Section |
| h3 | 1.25 / 1.35 | Card titles |
| body-lg | 1.125 / **1.7** | POS readability at arm's length |
| body | 1.0 / **1.65** | Default |
| sm | 0.875 / 1.6 | Secondary |
| caption | 0.75 / 1.5 | Labels, meta |

### Thai-specific rules
- **Generous line-height (1.6–1.75)** — Thai stacks tone marks above/below; tight leading clips them.
- **No ALL-CAPS for Thai**, no letter-spacing on Thai, no forced italics.
- Provide **Thai as primary, English secondary** on product names (e.g. `ครัวซองต์ / Croissant`).
- Avoid truncating Thai mid-cluster; prefer wrapping in tiles.

---

## 3. Logo placement rules

**Assets:** wordmark "Mr.Bananas" (banana swoosh + navy/red letters), a **roundel/badge**
(banana in a circle, for app icon/avatar), and the **mascot** character.

- **Color variants by background:**
  - on **navy** → yellow + white wordmark
  - on **cream/white** → navy + red wordmark
  - never place the wordmark on busy photos without a solid cream/navy chip behind it.
- **Clear space:** ≥ the height of the banana swoosh on all sides. Don't crowd.
- **Minimum size:** wordmark ≥ 120px wide on screen; below that use the **roundel**.
- **App icon / PWA:** banana **roundel on navy** (maskable, safe-area aware).
- **Mascot usage (delight layer):** empty states, onboarding, loading, success/celebration,
  errors/offline (sleeping mascot), receipt footer. **Not** a functional button, **not** in
  tables/forms/KDS tickets.
- **Don'ts:** don't stretch/skew, don't recolor outside palette, don't add drop shadows to the
  wordmark, don't outline, don't rotate.

---

## 4. POS screen theme (cashier — primary device: landscape tablet)

**Priority: speed + glanceability.** Minimal chrome, big targets, instant feedback.

- **Layout (landscape):** top bar (navy) = logo roundel · branch · cashier · clock. Left/main
  = **category pills** (active = banana-500 + navy text) over a **product grid**. Right =
  **sticky order panel**. Bottom of order panel = totals + **CHARGE**.
- **Surfaces:** app bg `cream-50`; cards `white`, `rounded-2xl`, soft shadow. Navy top bar.
- **Product tile:** white card, image, **Thai name (primary) / EN (secondary)**, price in
  navy **bold tabular**, tap = add (quantity badge in red). Min tile **≥ 112px**; image + 2
  lines name + price.
- **Order panel:** line items with large **− / +** steppers (≥ 48px), item subtotal; then
  **Subtotal / VAT 7% / Total** (tabular, total in display size). **CHARGE button: banana-500
  fill, navy-900 text, ≥ 64px tall**, label `ชำระเงิน · Charge`.
- **Payment dialog (cash):** amount due (big), **quick-cash chips** (฿20/50/100/500/1000),
  numpad, **change due** prominent; confirm → **green success** + auto-print receipt/invoice.
- **Touch targets:** primary actions ≥ 56–64px; never below 44px.
- **States:** out-of-stock tile dimmed + badge; quarantined items hidden/blocked (backend
  enforces); loading skeletons; **offline banner = red** (per Decision 4); void/refund = red,
  requires confirm.
- **Color discipline:** navy = structure, banana = the one hero CTA + active tab, green =
  paid, red = destructive/alert. Avoid rainbow.

---

## 5. Dashboard theme (back-office — owner/manager)

**Priority: data clarity + professional ERP feel.** Denser, calmer, more whitespace control.

- **Shell:** left **navy nav rail** (Catalog · Inventory · Production · Sales · Settings),
  collapsible; top bar with **branch switcher** + user menu.
- **Surfaces:** bg `cream-50`/`stone-50`; **white cards**, `rounded-xl` (tighter than POS),
  subtle borders `stone-200`.
- **KPI cards:** big **tabular** numbers (navy), small label, delta chip (green up / red down).
- **Tables:** tabular-nums, sticky headers, subtle zebra, status **chips** (draft=stone,
  active=leaf, paid=leaf, unpaid=amber, quarantined=red, recall=red). Row height ~44px.
- **Charts:** primary series **navy**, secondary **banana**, positive **leaf**, negative
  **red**; gridlines `stone-200`. No heavy gradients.
- **Forms:** shadcn/ui form fields, clear labels (Thai primary), inline validation (red),
  generous spacing. Recipe-version *immutability* surfaced as a lock state.
- **Tone:** brand shows in accents + the logo, not in busy color — this screen reads as a
  serious ERP.

---

## 6. KDS theme (kitchen / bar display — wall-mounted, glance from distance)

**Priority: legibility at 2–3m, urgency at a glance, minimal interaction.**

- **Dark theme** for contrast & screen comfort: background **navy-900 `#0E1638`**.
- **Tickets:** large cards on a cream/white base, **station color strip** (Bakery vs Beverage),
  **big Thai item names (≥ 22–28px)**, qty, modifiers. Columns per station.
- **Age timer per ticket** with escalating color: **leaf (fresh) → amber (>X min) → red pulse
  (overdue)**.
- **Status flow:** `queued` (neutral) → **making** (banana/amber) → **ready** (leaf) →
  served. Big tap targets (**Start / Ready**, ≥ 72px) or tap-to-bump.
- **New-ticket cue:** brief flash + optional sound. Keep text minimal; rely on color + size.
- No mascot, no decoration — pure operational clarity.

---

## 7. Mobile / PWA theme

- **Installable PWA:** `theme-color` = **navy `#1A2862`**, background splash navy with the
  roundel; **app icon = banana roundel** (maskable). Standalone display.
- **Primary device = landscape tablet (POS).** Phone = compact POS + manager dashboard summary.
- **Responsive:** tablet landscape (POS full layout) → tablet portrait (stacked) → phone
  (single-column, **bottom tab bar** nav, order panel as a sheet).
- **Touch-first:** ≥ 44–48px targets, **safe-area insets**, no hover-only affordances,
  thumb-reachable primary actions (bottom).
- **Light theme default** (cream/white). KDS is the dark exception. Dark mode for POS/dashboard
  is post-MVP.
- **Performance:** instant tap feedback, optimistic add-to-cart, skeletons, cached app shell,
  **offline banner** (no full outbox in MVP per Decision 4).

---

## 8. Tailwind color tokens

Provided as **design tokens** (config values, not application code). Implement as
`tailwind.config` `theme.extend.colors` + CSS variables so POS (light) and KDS (dark) can
re-map semantics.

### Palette scales
```text
banana:  50 #FFFBEB · 100 #FFF3C4 · 200 #FFE894 · 300 #FFDA5E · 400 #FFCB3D ·
         500 #FFC72C · 600 #E2A310 · 700 #B67F0E · 800 #8A5F12 · 900 #5E4112
navy:    50 #EDF0FA · 100 #D2D9F0 · 200 #A6B2E1 · 300 #7888CC · 400 #4C5FAE ·
         500 #2E3F8C · 600 #21306F · 700 #1A2862 · 800 #142050 · 900 #0E1638
red:     50 #FEECEA · 100 #FBD0CC · 200 #F6A39B · 300 #F1766B · 400 #EC5444 ·
         500 #E63A2E · 600 #C72A20 · 700 #9F2019 · 800 #781813 · 900 #54100C
leaf:    50 #EEFAE9 · 100 #D2F2C6 · 200 #A9E690 · 300 #7FD862 · 400 #62C846 ·
         500 #4FB23A · 600 #3C8E2D · 700 #2F6E24 · 800 #245219 · 900 #173610
cream:   50 #FFFDF7 · 100 #FBF4E1 · 200 #FBEAC9 · 300 #F3DCA9 · 400 #E9CB85
stone:   50 #FAF8F5 · 100 #F2EEE8 · 200 #E5DFD6 · 300 #CFC7BA · 400 #ABA193 ·
         500 #847C70 · 600 #635D54 · 700 #4A453F · 800 #322E29 · 900 #1C1A17
```

### Semantic tokens (CSS variables → light POS/Dashboard)
```text
--background: cream-50      --surface: #FFFFFF        --foreground: navy-900
--muted: stone-500         --border: stone-200       --ring: banana-500
--primary: navy-700        --primary-foreground: #FFFFFF
--accent: banana-500       --accent-foreground: navy-900
--success: leaf-500        --warning: #F59E0B        --danger: red-500       --info: navy-400
--cta: banana-500          --cta-foreground: navy-900     (the Charge/Pay button)
```

### KDS dark overrides
```text
--background: navy-900     --surface: cream-50        --foreground: navy-900
--ticket-fresh: leaf-500   --ticket-warn: #F59E0B     --ticket-overdue: red-500
```

### Other tokens
- **Radius:** `--radius` POS/cards = `1rem` (rounded-2xl) for friendliness; dashboard tables =
  `0.75rem`; pills/badges = full.
- **Shadow:** soft, low (`0 1px 2px`, `0 4px 12px` on raised cards) — no harsh shadows.
- **Spacing:** 4px base; POS uses 8/12/16 rhythm with larger hit areas.
- **Fonts:** `--font-display: "Baloo Thai 2","Baloo 2"`; `--font-sans: "IBM Plex Sans Thai"`;
  `--font-mono: "IBM Plex Mono"`. Enable `font-feature-settings: "tnum"` for numbers.
- **Icons:** Lucide (rounded line icons) — matches the rounded brand.
- **Motion:** quick, springy micro-interactions (120–200ms); celebratory mascot animation only
  on sale-complete.

---

## Component cheat-sheet (applies across surfaces)
- **Buttons:** primary CTA = banana fill/navy text; secondary = navy fill/white; ghost = navy
  text; destructive = red. Min height 44 (UI) / 56–64 (POS).
- **Badges/chips:** status colors above; rounded-full; tabular for counts.
- **Inputs:** white, `stone-200` border, `banana-500` focus ring, Thai labels, large on POS.
- **Empty/onboarding/success:** mascot + short upbeat Thai copy.
- **Toasts:** top-right (dashboard) / top-center (POS); success=leaf, error=red.

> Next step on approval: build this into the Phase 0 scaffold as `tailwind.config` tokens +
> CSS variables + base shadcn/ui theme, then validate contrast (AA) before UI work begins.
