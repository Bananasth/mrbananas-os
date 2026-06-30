/**
 * Single source of truth for the owner/admin console navigation.
 *
 * The sidebar, the module landing placeholders, and (later) route guards all read
 * from this tree, so adding a module or changing role visibility happens in ONE place.
 *
 * Roles: only console roles are modelled here (owner, manager). Staff/baker use the
 * dedicated /pos and /bar operator surfaces, not this console.
 *
 * status: 'ready'  = a real, implemented page lives at href.
 *         'planned' = placeholder shell only (no business logic yet).
 *
 * Manager visibility rules (owner-only items are simply absent from a manager's tree):
 *   managers must NOT see Profit, Costing, Payroll, VAT, or Tax documents.
 *   → Recipes/Costing, Accounting and Settings are owner-only modules; Reports'
 *     profit sections stay owner-only at render time (future).
 */

export type Role = "owner" | "manager";

export type NavLeaf = {
  label: string; // Thai (primary)
  en: string; // English (sub-label)
  href: string;
  roles: Role[];
  status: "ready" | "planned";
  external?: boolean; // links out to a dedicated operator app (/pos, /bar)
};

export type NavItem = NavLeaf & { children?: NavLeaf[] };

export type NavModule = {
  key: string;
  label: string; // Thai
  en: string; // English
  href: string; // module landing route
  icon: string; // emoji glyph
  roles: Role[];
  status: "ready" | "planned";
  items?: NavItem[];
};

const BOTH: Role[] = ["owner", "manager"];
const OWNER: Role[] = ["owner"];

export const NAV: NavModule[] = [
  {
    key: "dashboard",
    label: "แดชบอร์ดเจ้าของ",
    en: "Owner Dashboard",
    href: "/admin",
    icon: "📊",
    roles: BOTH,
    status: "ready",
  },
  {
    key: "sales",
    label: "การขาย",
    en: "Sales",
    href: "/admin/sales",
    icon: "💳",
    roles: BOTH,
    status: "planned",
    items: [
      { label: "เครื่องขาย (POS)", en: "Register", href: "/pos", roles: BOTH, status: "ready", external: true },
      { label: "ประวัติการขาย", en: "Sales history", href: "/admin/sales", roles: BOTH, status: "planned" },
      { label: "ใบเสร็จ", en: "Receipts", href: "/admin/sales", roles: BOTH, status: "planned" },
    ],
  },
  {
    key: "orders",
    label: "ออเดอร์ / คิว",
    en: "Orders / Queue",
    href: "/admin/orders",
    icon: "🧾",
    roles: BOTH,
    status: "planned",
    items: [
      { label: "คิวสด", en: "Live queue", href: "/bar", roles: BOTH, status: "ready", external: true },
      { label: "ออเดอร์ QR", en: "QR orders", href: "/admin/orders", roles: BOTH, status: "planned" },
    ],
  },
  {
    key: "inventory",
    label: "คลังวัตถุดิบ",
    en: "Inventory",
    href: "/admin/inventory/items",
    icon: "📦",
    roles: BOTH,
    status: "ready",
    items: [
      { label: "วัตถุดิบ", en: "Items", href: "/admin/inventory/items", roles: BOTH, status: "ready" },
      { label: "รับสต๊อก", en: "Receive", href: "/admin/inventory/receive", roles: BOTH, status: "ready" },
      { label: "สต๊อกคงเหลือ", en: "Stock", href: "/admin/inventory/stock", roles: BOTH, status: "ready" },
      { label: "ปรับสต๊อก", en: "Adjust", href: "/admin/inventory/adjust", roles: BOTH, status: "ready" },
      { label: "ประวัติการเคลื่อนไหว", en: "Movements", href: "/admin/inventory/movements", roles: BOTH, status: "ready" },
    ],
  },
  {
    key: "recipes",
    label: "สูตร / ต้นทุน",
    en: "Recipes / Costing",
    href: "/admin/recipes",
    icon: "📖",
    roles: OWNER, // Costing is owner-only → whole module owner-only
    status: "ready",
    items: [
      { label: "สูตร", en: "Recipes", href: "/admin/recipes", roles: OWNER, status: "ready" },
      { label: "ต้นทุน", en: "Costing", href: "/admin/recipes/costing", roles: OWNER, status: "planned" },
    ],
  },
  {
    key: "production-planning",
    label: "วางแผนการผลิต",
    en: "Production Planning",
    href: "/admin/production-planning",
    icon: "🧠",
    roles: BOTH,
    status: "planned",
    items: [
      { label: "พยากรณ์การผลิต (AI)", en: "AI Production Forecast", href: "/admin/production-planning", roles: BOTH, status: "planned" },
      { label: "แจ้งเตือนของหมดอายุ", en: "Expiry Alerts", href: "/admin/production-planning", roles: BOTH, status: "planned" },
      { label: "โปรโมชั่นแนะนำ", en: "Suggested Promotions", href: "/admin/production-planning", roles: BOTH, status: "planned" },
      { label: "วิเคราะห์ความเสี่ยงของเสีย", en: "Waste Risk Analysis", href: "/admin/production-planning", roles: BOTH, status: "planned" },
    ],
  },
  {
    key: "production",
    label: "การผลิต",
    en: "Production",
    href: "/admin/production",
    icon: "🥤",
    roles: BOTH,
    status: "planned",
    items: [
      { label: "กระดานเตรียม", en: "Prep board", href: "/bar", roles: BOTH, status: "ready", external: true },
      { label: "ภาพถ่ายเสร็จงาน", en: "Completion photos", href: "/admin/production", roles: BOTH, status: "planned" },
    ],
  },
  {
    key: "staff",
    label: "พนักงาน / KPI",
    en: "Staff / KPI",
    href: "/admin/staff",
    icon: "👥",
    roles: BOTH,
    status: "planned",
    items: [
      { label: "ตัวชี้วัด", en: "KPI", href: "/admin/kpi", roles: BOTH, status: "ready" },
      { label: "ร้องเรียน", en: "Complaints", href: "/admin/complaints", roles: BOTH, status: "ready" },
      { label: "การฝึกอบรม", en: "Training", href: "/admin/staff", roles: BOTH, status: "planned" },
    ],
  },
  {
    key: "accounting",
    label: "บัญชี",
    en: "Accounting",
    href: "/admin/accounting",
    icon: "🧮",
    roles: OWNER, // tax / VAT / payroll — owner-only
    status: "planned",
    items: [
      { label: "ใบกำกับภาษีขาย", en: "Sales Tax Invoices", href: "/admin/accounting", roles: OWNER, status: "planned" },
      { label: "ใบกำกับภาษีซื้อ", en: "Purchase Tax Invoices", href: "/admin/accounting", roles: OWNER, status: "planned" },
      { label: "ออกใบกำกับภาษีขายเอง", en: "Manual Sales Tax Invoice", href: "/admin/accounting", roles: OWNER, status: "planned" },
      { label: "ใบลดหนี้", en: "Credit Notes", href: "/admin/accounting", roles: OWNER, status: "planned" },
      { label: "สรุป VAT", en: "VAT Summary", href: "/admin/accounting", roles: OWNER, status: "planned" },
      {
        label: "ค่าใช้จ่าย",
        en: "Expenses",
        href: "/admin/accounting",
        roles: OWNER,
        status: "planned",
        children: [
          { label: "เงินเดือน", en: "Payroll", href: "/admin/accounting", roles: OWNER, status: "planned" },
          { label: "ค่าเช่า", en: "Rent", href: "/admin/accounting", roles: OWNER, status: "planned" },
          { label: "ค่าสาธารณูปโภค", en: "Utilities", href: "/admin/accounting", roles: OWNER, status: "planned" },
          { label: "การตลาด", en: "Marketing", href: "/admin/accounting", roles: OWNER, status: "planned" },
          { label: "ซ่อมบำรุง", en: "Maintenance", href: "/admin/accounting", roles: OWNER, status: "planned" },
          { label: "อื่น ๆ", en: "Other", href: "/admin/accounting", roles: OWNER, status: "planned" },
        ],
      },
      { label: "ส่งออกข้อมูลบัญชี", en: "Accounting Export", href: "/admin/accounting", roles: OWNER, status: "planned" },
    ],
  },
  {
    key: "reports",
    label: "รายงาน",
    en: "Reports",
    href: "/admin/reports",
    icon: "📈",
    roles: BOTH, // profit sections gated to owner at render time (future)
    status: "planned",
  },
  {
    key: "notifications",
    label: "การแจ้งเตือน",
    en: "Notifications",
    href: "/admin/notifications",
    icon: "🔔",
    roles: BOTH,
    status: "planned",
  },
  {
    key: "settings",
    label: "ตั้งค่า",
    en: "Settings",
    href: "/admin/settings",
    icon: "⚙️",
    roles: OWNER,
    status: "planned",
    items: [
      {
        label: "เมนู / แคตตาล็อก",
        en: "Menu / Catalog",
        href: "/admin/products",
        roles: OWNER,
        status: "ready",
        children: [
          { label: "สินค้า", en: "Products", href: "/admin/products", roles: OWNER, status: "ready" },
          { label: "หมวดหมู่", en: "Categories", href: "/admin/categories", roles: OWNER, status: "ready" },
          { label: "ตัวเลือก", en: "Modifiers", href: "/admin/modifiers", roles: OWNER, status: "ready" },
          { label: "ราคาสาขา", en: "Pricing", href: "/admin/pricing", roles: OWNER, status: "ready" },
        ],
      },
      { label: "QR ออเดอร์", en: "QR ordering", href: "/admin/settings/qr", roles: OWNER, status: "ready" },
      { label: "การเข้าถึงสูตร", en: "Recipe access", href: "/admin/security/recipe-access", roles: OWNER, status: "ready" },
      { label: "สาขา & ภาษี", en: "Branches & Tax", href: "/admin/settings", roles: OWNER, status: "planned" },
    ],
  },
];

/** Return the nav tree filtered to what `role` may see (modules, items, children). */
export function visibleNav(role: Role): NavModule[] {
  const leaf = (l: NavLeaf) => l.roles.includes(role);
  return NAV.filter((m) => m.roles.includes(role)).map((m) => ({
    ...m,
    items: m.items
      ?.filter(leaf)
      .map((i) => ({ ...i, children: i.children?.filter(leaf) })),
  }));
}

/** Look up a module by key (used by the placeholder shells to list planned submodules). */
export function moduleByKey(key: string): NavModule | undefined {
  return NAV.find((m) => m.key === key);
}
