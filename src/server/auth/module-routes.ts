import "server-only";
import type { RoleKey } from "./claims";
import { canAccess, visibleModuleKeys, type PermissionLevel, type UserPermissions } from "./permissions";

/**
 * Admin navigation registry: maps each back-office route to its RBAC module_key.
 *
 * Routes are a Next.js concern (not a DB column), so the mapping lives in code. The `moduleKey`
 * values below must match `app_module.module_key`. This list is the SAME set/order the admin
 * nav has always shown, now annotated with module keys — so the owner's menu is unchanged
 * (owner short-circuits to "see everything") and only non-owners get filtered.
 *
 * NOTE: if a `moduleKey` here doesn't match a real `app_module.key`, that item simply
 * stays hidden for non-owners (fail-safe). Adjust a key in one place to fix a mismatch.
 *
 * `ownerOnly: true` marks a route that is DEFERRED to owner-only (no clean RBAC module yet, or a
 * sensitive page). Such items are hidden from the non-owner menu regardless of `moduleKey`. This
 * is menu-hiding only — the route itself must still be guarded at Phase 3 (requireRole(["owner"])).
 */
export type NavItem = {
  moduleKey: string;
  href: string;
  label: string;
  en: string;
  exact?: boolean;
  ownerOnly?: boolean;
};

export const ADMIN_NAV: readonly NavItem[] = [
  // ── MAP-NOW: RBAC-gated by a real app_module.key (must match the page's requireModule) ──
  { moduleKey: "dashboard", href: "/admin", label: "ภาพรวม", en: "Overview", exact: true },
  { moduleKey: "sales.history", href: "/admin/sales", label: "การขาย", en: "Sales" },
  // ── DEFERRED → owner-only (menu-hidden for non-owners; route guard is Phase 3) ──
  { moduleKey: "products", href: "/admin/products", label: "สินค้า", en: "Products", ownerOnly: true },
  { moduleKey: "categories", href: "/admin/categories", label: "หมวดหมู่", en: "Categories", ownerOnly: true },
  { moduleKey: "pricing", href: "/admin/pricing", label: "ราคาสาขา", en: "Pricing", ownerOnly: true },
  { moduleKey: "recipes", href: "/admin/recipes", label: "สูตร", en: "Recipes", ownerOnly: true },
  { moduleKey: "modifiers", href: "/admin/modifiers", label: "ตัวเลือก", en: "Modifiers", ownerOnly: true },
  // MAP-NOW: inventory reads share the coarse `inventory` module
  { moduleKey: "inventory", href: "/admin/inventory/items", label: "วัตถุดิบ", en: "Items" },
  { moduleKey: "inventory_receive", href: "/admin/inventory/receive", label: "รับสต๊อก", en: "Receive", ownerOnly: true },
  { moduleKey: "inventory", href: "/admin/inventory/stock", label: "สต๊อกคงเหลือ", en: "Stock" },
  { moduleKey: "inventory_adjust", href: "/admin/inventory/adjust", label: "ปรับสต๊อก", en: "Adjust", ownerOnly: true },
  { moduleKey: "inventory", href: "/admin/inventory/movements", label: "ประวัติ", en: "Movements" },
  { moduleKey: "settings", href: "/admin/settings/qr", label: "QR ออเดอร์", en: "QR" },
  { moduleKey: "settings", href: "/admin/settings/company-profile", label: "ข้อมูลบริษัท", en: "Company Profile", ownerOnly: true },
  { moduleKey: "recipe_access", href: "/admin/security/recipe-access", label: "เข้าถึงสูตร", en: "Recipe access", ownerOnly: true },
  { moduleKey: "complaints", href: "/admin/complaints", label: "ร้องเรียน", en: "Complaints", ownerOnly: true },
  { moduleKey: "reports", href: "/admin/kpi", label: "ตัวชี้วัด", en: "KPI" },
];

/** Longest matching nav route for a pathname → its module_key (used by the route guard). */
export function moduleKeyForPath(pathname: string): string | null {
  let best: NavItem | null = null;
  for (const item of ADMIN_NAV) {
    const hit = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (hit && (!best || item.href.length > best.href.length)) best = item;
  }
  return best?.moduleKey ?? null;
}

/**
 * Nav items the user may see: filtered by the visible-module set (accessible modules + their
 * ancestors), preserving the registry's order. Owner sees everything.
 */
export function visibleNav(perms: UserPermissions): NavItem[] {
  if (perms.isOwner) return [...ADMIN_NAV];
  const visible = visibleModuleKeys(perms);
  // Non-owner: hide owner-only (deferred) items, then keep only permitted modules.
  return ADMIN_NAV.filter((item) => !item.ownerOnly && visible.has(item.moduleKey));
}

/** Direct per-item permission check (view level) — kept for callers that don't need the tree. */
export function canSeeNav(perms: UserPermissions, item: NavItem, level: PermissionLevel = "view"): boolean {
  return canAccess(perms, item.moduleKey, level);
}

// ─────────────────────────────────────────────────────────────────────────────
// Department registry (main-branch launch)
//
// A GROUPING layer over the routes that already exist — NOT a second navigation
// source and NOT a second permission engine: every link is gated by the same
// `canAccess` / requireRole rules the pages themselves use, and `ADMIN_NAV`
// above is untouched.
//
// Rules encoded here:
//   * `href` points ONLY at a route that exists in src/app. `status: "missing"`
//     entries carry no href and render as disabled cards (never as links).
//   * `moduleKey` must be a key that already appears in ADMIN_NAV / requireModule.
//     No new keys are invented — an unverified key would need a DB seed.
//   * `ownerOnly` mirrors a page whose own guard is requireRole(["owner"]), so a
//     non-owner is never shown a link that would bounce them.
//   * A link with no moduleKey and no roles is owner-only (fail-safe).
// Multi-branch / franchise / HQ are deliberately absent (POST_LAUNCH).
// ─────────────────────────────────────────────────────────────────────────────

/** Readiness of the destination, as evidenced by the repository (never optimistic). */
export type DeptStatus = "ready" | "partial" | "missing";

export type DeptLink = {
  th: string;
  en: string;
  desc: string;
  /** Existing route. Omitted ⟺ status "missing". */
  href?: string;
  /** RBAC gate — must be an already-verified app_module key. */
  moduleKey?: string;
  /** Role gate for role-guarded surfaces (/pos, /bar); mirrors requireRole. */
  roles?: readonly RoleKey[];
  /** The destination page guards with requireRole(["owner"]). */
  ownerOnly?: boolean;
  status: DeptStatus;
  /** Dependency / caveat shown under the card. */
  note?: string;
};

export type Department = {
  slug: string;
  th: string;
  en: string;
  icon: string;
  desc: string;
  scope: "MAIN_BRANCH_LAUNCH" | "POST_LAUNCH";
  links: readonly DeptLink[];
};

const OPERATIONS: readonly RoleKey[] = ["owner", "manager", "staff"];
const PRODUCTION: readonly RoleKey[] = ["owner", "manager", "staff", "baker"];

export const DEPARTMENTS: readonly Department[] = [
  {
    slug: "pos",
    th: "ขายหน้าร้าน",
    en: "Point of Sale",
    icon: "🧾",
    desc: "ขายหน้าร้าน รับเงินสด และออกใบกำกับภาษีอย่างย่อ",
    scope: "MAIN_BRANCH_LAUNCH",
    links: [
      {
        th: "เปิดหน้าขาย",
        en: "Open POS",
        desc: "เมนู ตะกร้า ตัวเลือก VAT และรับเงินสด",
        href: "/pos",
        roles: OPERATIONS,
        status: "ready",
      },
    ],
  },
  {
    slug: "orders",
    th: "ออเดอร์และคิว",
    en: "Orders & Queue",
    icon: "📋",
    desc: "ออเดอร์ QR คิวผลิต และประวัติการขาย",
    scope: "MAIN_BRANCH_LAUNCH",
    links: [
      {
        th: "ออเดอร์ QR",
        en: "QR orders",
        desc: "ตั้งค่าและติดตามออเดอร์จากลูกค้าผ่าน QR",
        href: "/admin/settings/qr",
        moduleKey: "settings",
        status: "ready",
      },
      {
        th: "คิวผลิตและการส่งมอบ",
        en: "Production queue",
        desc: "กระดานสถานี: รับงาน ผลิต QC และปิดงาน",
        href: "/bar",
        roles: PRODUCTION,
        status: "ready",
      },
      {
        th: "ประวัติออเดอร์",
        en: "Order history",
        desc: "รายการขายย้อนหลังและใบเสร็จ",
        href: "/admin/sales",
        moduleKey: "sales.history",
        status: "ready",
      },
      {
        th: "หน้าจอเรียกคิวรับสินค้า",
        en: "Pickup call screen",
        desc: "จอแสดงคิวสำหรับลูกค้าหน้าร้าน",
        moduleKey: "settings",
        status: "missing",
        note: "ยังไม่มี route รองรับในระบบ",
      },
    ],
  },
  {
    slug: "bar",
    th: "บาร์และการผลิต",
    en: "Bar & Production",
    icon: "🥤",
    desc: "กระดานผลิตเครื่องดื่ม รับงาน QC ถ่ายรูป และสูตร",
    scope: "MAIN_BRANCH_LAUNCH",
    links: [
      {
        th: "กระดานบาร์",
        en: "Bar station",
        desc: "รับงาน · เริ่มทำ · QC · แนบรูป · ปิดงาน",
        href: "/bar",
        roles: PRODUCTION,
        status: "ready",
      },
      {
        th: "บันทึกเวลาทำเมนู",
        en: "Production timing",
        desc: "ดูเวลาแต่ละขั้นตอนผ่าน Timeline ของรายการในกระดานบาร์",
        href: "/bar",
        roles: PRODUCTION,
        status: "partial",
        note: "ดูได้รายรายการเท่านั้น ยังไม่มีหน้าสรุปเวลาการผลิต",
      },
      {
        th: "สิทธิ์เข้าถึงสูตร",
        en: "Recipe access",
        desc: "ใครเปิดดูสูตรได้บ้าง และประวัติการเปิดดู",
        href: "/admin/security/recipe-access",
        moduleKey: "recipe_access",
        ownerOnly: true,
        status: "ready",
      },
      {
        th: "รายงานเวลาการผลิต",
        en: "Production time report",
        desc: "สรุปเวลาเฉลี่ยต่อเมนูและต่อพนักงาน",
        moduleKey: "reports",
        status: "missing",
        note: "ยังไม่มี route รองรับในระบบ",
      },
    ],
  },
  {
    slug: "bakery",
    th: "เบเกอรี่",
    en: "Bakery",
    icon: "🥐",
    desc: "งานผลิตเบเกอรี่ สูตร และตัวชี้วัด",
    scope: "MAIN_BRANCH_LAUNCH",
    links: [
      {
        th: "กระดานผลิต",
        en: "Production board",
        desc: "ใช้กระดานสถานีร่วมกับบาร์",
        href: "/bar",
        roles: PRODUCTION,
        status: "ready",
      },
      {
        th: "สูตรเบเกอรี่",
        en: "Recipes",
        desc: "สูตรและเวอร์ชันของสินค้าเบเกอรี่",
        href: "/admin/recipes",
        moduleKey: "recipes",
        ownerOnly: true,
        status: "ready",
      },
      {
        th: "ตัวชี้วัด",
        en: "KPI",
        desc: "ตัวชี้วัดการผลิตและการขาย",
        href: "/admin/kpi",
        moduleKey: "reports",
        status: "ready",
      },
      {
        th: "แผนการผลิต / รอบอบ",
        en: "Batch planning",
        desc: "วางแผนรอบอบและจำนวนที่ต้องผลิต",
        moduleKey: "recipes",
        status: "missing",
        note: "ยังไม่มี route รองรับในระบบ",
      },
      {
        th: "ของเหลือและวันหมดอายุ",
        en: "Leftovers & expiry",
        desc: "ติดตามของเหลือปลายวันและสินค้าใกล้หมดอายุ",
        moduleKey: "inventory",
        status: "missing",
        note: "ยังไม่มี route รองรับในระบบ",
      },
    ],
  },
  {
    slug: "catalog",
    th: "สินค้าและสูตร",
    en: "Products & Recipes",
    icon: "📦",
    desc: "เมนู หมวดหมู่ ราคา สูตร ตัวเลือก และวัตถุดิบ",
    scope: "MAIN_BRANCH_LAUNCH",
    links: [
      { th: "สินค้า", en: "Products", desc: "เพิ่ม/แก้ไขเมนูสินค้า", href: "/admin/products", moduleKey: "products", ownerOnly: true, status: "ready" },
      { th: "หมวดหมู่", en: "Categories", desc: "beverage · bakery", href: "/admin/categories", moduleKey: "categories", ownerOnly: true, status: "ready" },
      { th: "ราคาสาขา", en: "Branch pricing", desc: "ตั้งราคาขายของสาขาหลัก", href: "/admin/pricing", moduleKey: "pricing", ownerOnly: true, status: "ready" },
      { th: "สูตร", en: "Recipes", desc: "สูตรและเวอร์ชัน", href: "/admin/recipes", moduleKey: "recipes", ownerOnly: true, status: "ready" },
      { th: "ตัวเลือก", en: "Modifiers", desc: "กลุ่มตัวเลือกและผลต่อราคา/วัตถุดิบ", href: "/admin/modifiers", moduleKey: "modifiers", ownerOnly: true, status: "ready" },
      { th: "วัตถุดิบ", en: "Items", desc: "รายการวัตถุดิบและหน่วยนับ", href: "/admin/inventory/items", moduleKey: "inventory", status: "ready" },
      { th: "สิทธิ์เข้าถึงสูตร", en: "Recipe access", desc: "ควบคุมการเปิดดูสูตร", href: "/admin/security/recipe-access", moduleKey: "recipe_access", ownerOnly: true, status: "ready" },
    ],
  },
  {
    slug: "inventory",
    th: "สต็อกและวัตถุดิบ",
    en: "Inventory",
    icon: "🏬",
    desc: "รับเข้า ยอดคงเหลือ ปรับปรุง และประวัติการเคลื่อนไหว",
    scope: "MAIN_BRANCH_LAUNCH",
    links: [
      { th: "รับสต๊อก", en: "Receive", desc: "รับวัตถุดิบเข้าคลัง", href: "/admin/inventory/receive", moduleKey: "inventory_receive", ownerOnly: true, status: "ready" },
      { th: "สต๊อกคงเหลือ", en: "Stock", desc: "ยอดคงเหลือปัจจุบัน", href: "/admin/inventory/stock", moduleKey: "inventory", status: "ready" },
      { th: "ปรับสต๊อก", en: "Adjust", desc: "ปรับปรุงยอดพร้อมเหตุผล", href: "/admin/inventory/adjust", moduleKey: "inventory_adjust", ownerOnly: true, status: "ready" },
      { th: "ประวัติการเคลื่อนไหว", en: "Movements", desc: "รายการเข้า/ออกทั้งหมด", href: "/admin/inventory/movements", moduleKey: "inventory", status: "ready" },
      { th: "วัตถุดิบ", en: "Items", desc: "รายการวัตถุดิบและหน่วยนับ", href: "/admin/inventory/items", moduleKey: "inventory", status: "ready" },
      {
        th: "ล็อตและวันหมดอายุ (FEFO)",
        en: "Lots & expiry",
        desc: "ดูล็อตคงเหลือและลำดับการตัดจ่ายแบบ FEFO",
        moduleKey: "inventory",
        status: "missing",
        note: "การตัดจ่าย FEFO ทำงานอยู่ในระบบหลังบ้าน แต่ยังไม่มีหน้าจอแสดงล็อต",
      },
    ],
  },
  {
    slug: "channels",
    th: "ช่องทางขาย",
    en: "Sales Channels",
    icon: "🛵",
    desc: "ออเดอร์จากช่องทางภายนอกและการกระทบยอด",
    scope: "POST_LAUNCH",
    links: [
      {
        th: "ออเดอร์ช่องทางภายนอก",
        en: "External channel orders",
        desc: "LINE MAN · ShopeeFood · GrabFood · TikTok Shop · เว็บไซต์",
        moduleKey: "sales.history",
        status: "missing",
        note: "ยังไม่มี route รองรับ และยังไม่ได้เชื่อมต่อ API ใด ๆ",
      },
      {
        th: "ค่าธรรมเนียมและการกระทบยอด",
        en: "Fees & settlement",
        desc: "ค่าธรรมเนียมช่องทางและการรับเงินจริง",
        moduleKey: "sales.history",
        status: "missing",
        note: "ยังไม่มี route รองรับในระบบ",
      },
    ],
  },
  {
    slug: "sales",
    th: "การขายและรายงาน",
    en: "Sales & Reports",
    icon: "📈",
    desc: "ยอดขาย ประวัติการขาย และตัวชี้วัด",
    scope: "MAIN_BRANCH_LAUNCH",
    links: [
      { th: "รายการขาย", en: "Sales", desc: "ออเดอร์ ยอดขาย และใบเสร็จ", href: "/admin/sales", moduleKey: "sales.history", status: "ready" },
      { th: "ตัวชี้วัด", en: "KPI", desc: "สรุปตัวชี้วัดการดำเนินงาน", href: "/admin/kpi", moduleKey: "reports", status: "ready" },
      {
        th: "รายงานยอดขายตามช่องทาง",
        en: "Sales by channel",
        desc: "แยกยอดขายตามช่องทางการขาย",
        moduleKey: "reports",
        status: "missing",
        note: "รอหน้าช่องทางขาย (POST_LAUNCH)",
      },
    ],
  },
  {
    slug: "accounting",
    th: "บัญชีและภาษี",
    en: "Accounting & Tax",
    icon: "🧮",
    desc: "ใบกำกับภาษี ใบเสร็จ และเอกสารทางภาษี",
    scope: "MAIN_BRANCH_LAUNCH",
    links: [
      {
        th: "ใบกำกับภาษีอย่างย่อ (ABB)",
        en: "Abbreviated tax invoices",
        desc: "ออกอัตโนมัติเมื่อปิดการขาย ดูได้จากรายการขาย",
        href: "/admin/sales",
        moduleKey: "sales.history",
        status: "ready",
      },
      {
        th: "พิมพ์ใบเสร็จซ้ำ",
        en: "Reprint receipt",
        desc: "เปิดใบเสร็จของออเดอร์จากรายการขาย",
        href: "/admin/sales",
        moduleKey: "sales.history",
        status: "ready",
      },
      {
        th: "ใบกำกับภาษีแบบเต็มรูป",
        en: "Full tax invoice",
        desc: "ออกใบกำกับภาษีเต็มรูปตามคำขอของลูกค้า",
        moduleKey: "sales.history",
        status: "missing",
        note: "ตารางฐานข้อมูลพร้อมแล้ว แต่ยังไม่มีหน้าจอใช้งาน",
      },
      {
        th: "คำขอและหลักฐานประกอบ",
        en: "Requests & evidence",
        desc: "คำขอใบกำกับเต็มรูปและไฟล์หลักฐาน",
        moduleKey: "sales.history",
        status: "missing",
        note: "ตารางฐานข้อมูลพร้อมแล้ว แต่ยังไม่มีหน้าจอใช้งาน",
      },
      {
        th: "เลขใบกำกับที่ขาดหาย",
        en: "Invoice gaps",
        desc: "ตรวจสอบเลขที่เอกสารที่ข้ามลำดับ",
        moduleKey: "sales.history",
        status: "missing",
        note: "ยังไม่มี route รองรับในระบบ",
      },
    ],
  },
  {
    slug: "customers",
    th: "ลูกค้าและข้อร้องเรียน",
    en: "Customers & Complaints",
    icon: "🙋",
    desc: "ข้อร้องเรียนและการค้นหาออเดอร์ให้ลูกค้า",
    scope: "MAIN_BRANCH_LAUNCH",
    links: [
      { th: "ข้อร้องเรียน", en: "Complaints", desc: "รับเรื่องและติดตามการแก้ไข", href: "/admin/complaints", moduleKey: "complaints", ownerOnly: true, status: "ready" },
      { th: "ค้นหาออเดอร์ลูกค้า", en: "Order lookup", desc: "ค้นหาออเดอร์เพื่อช่วยเหลือลูกค้า", href: "/admin/sales", moduleKey: "sales.history", status: "ready" },
    ],
  },
  {
    slug: "access",
    th: "ผู้ใช้งานและสิทธิ์",
    en: "Users & Access",
    icon: "🔑",
    desc: "บัญชีผู้ใช้งาน ตำแหน่ง บทบาท และสิทธิ์เข้าถึงเมนู (ไม่รวมงานบุคคล เช่น ลงเวลา เงินเดือน สัญญาจ้าง ลางาน ซึ่งอยู่ในระบบ HR แยกต่างหาก)",
    scope: "MAIN_BRANCH_LAUNCH",
    links: [
      { th: "บัญชีผู้ใช้งาน", en: "User accounts", desc: "ผู้ใช้งานที่เข้าระบบได้", status: "missing", note: "ยังไม่มี route รองรับในระบบ" },
      { th: "ตำแหน่งและบทบาท", en: "Positions & roles", desc: "ตำแหน่งงานและบทบาทที่ผูกกับสิทธิ์", status: "missing", note: "ยังไม่มี route รองรับในระบบ" },
      { th: "สิทธิ์เข้าถึงเมนู", en: "Module permissions", desc: "สิทธิ์ของแต่ละบทบาทต่อเมนูงาน", status: "missing", note: "ยังไม่มี route รองรับในระบบ" },
      { th: "สิทธิ์เฉพาะบุคคล", en: "Employee overrides", desc: "อนุญาต/ปฏิเสธเป็นรายบุคคล", status: "missing", note: "ยังไม่มี route รองรับในระบบ" },
    ],
  },
  {
    slug: "security",
    th: "ความปลอดภัยและตรวจสอบ",
    en: "Security & Audit",
    icon: "🛡️",
    desc: "การเข้าถึงข้อมูลสำคัญและบันทึกการตรวจสอบ",
    scope: "MAIN_BRANCH_LAUNCH",
    links: [
      { th: "สิทธิ์เข้าถึงสูตร", en: "Recipe access", desc: "ประวัติการเปิดดูสูตรและการควบคุม", href: "/admin/security/recipe-access", moduleKey: "recipe_access", ownerOnly: true, status: "ready" },
      { th: "บันทึกการตรวจสอบ", en: "Audit log", desc: "ประวัติการแก้ไขข้อมูลสำคัญ", status: "missing", note: "มีการเก็บ audit ในฐานข้อมูลแล้ว แต่ยังไม่มีหน้าจอ" },
    ],
  },
  {
    slug: "settings",
    th: "ตั้งค่าบริษัท",
    en: "Company Settings",
    icon: "⚙️",
    desc: "ข้อมูลบริษัทสำหรับเอกสารภาษี โลโก้ และการตั้งค่า QR",
    scope: "MAIN_BRANCH_LAUNCH",
    links: [
      { th: "ข้อมูลบริษัท", en: "Company profile", desc: "ชื่อ ที่อยู่ เลขผู้เสียภาษี และโลโก้บนใบเสร็จ", href: "/admin/settings/company-profile", moduleKey: "settings", ownerOnly: true, status: "ready" },
      { th: "ตั้งค่า QR", en: "QR settings", desc: "ลิงก์สั่งซื้อผ่าน QR ของสาขาหลัก", href: "/admin/settings/qr", moduleKey: "settings", status: "ready" },
    ],
  },
];

/** Department with its links already filtered for the current user. */
export type VisibleDepartment = Omit<Department, "links"> & { links: DeptLink[] };

/** Look up a department by its URL slug. */
export function departmentBySlug(slug: string): Department | null {
  return DEPARTMENTS.find((d) => d.slug === slug) ?? null;
}

/**
 * May this user see this ONE link? Evaluated per link (never per department), so holding one
 * module in a department never reveals the rest.
 *
 * `perms === null` is the owner fast-path — the same short-circuit `requireModule` uses, so the
 * owner's menu needs no RBAC round-trip.
 */
export function canSeeDeptLink(
  perms: UserPermissions | null,
  userRoles: readonly RoleKey[],
  link: DeptLink,
): boolean {
  if (perms === null) return true; // owner
  if (link.ownerOnly) return false; // destination guards with requireRole(["owner"])
  if (link.roles) return link.roles.some((r) => userRoles.includes(r));
  if (link.moduleKey) return canAccess(perms, link.moduleKey);
  return false; // no verified gate → owner-only (fail-safe)
}

/** Departments the user may see, with non-permitted links removed and empty departments dropped. */
export function visibleDepartments(
  perms: UserPermissions | null,
  userRoles: readonly RoleKey[],
): VisibleDepartment[] {
  return DEPARTMENTS.map((d) => ({
    ...d,
    links: d.links.filter((l) => canSeeDeptLink(perms, userRoles, l)),
  })).filter((d) => d.links.length > 0);
}
