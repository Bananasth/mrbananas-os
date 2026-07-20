import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireRole } from "@/server/auth/guard";
import { loadUserPermissions } from "@/server/auth/permissions.load";
import { ADMIN_NAV, visibleNav, type NavItem } from "@/server/auth/module-routes";
import { AdminNav } from "./_components/admin-nav";

/**
 * Setup access (Phase 3C, manager-only, feature-flagged).
 *
 * Flag OFF (default): OWNER-ONLY — identical to before; requireRole redirects everyone else home.
 * Flag ON (ADMIN_MANAGER_ACCESS === "true"): owner (full menu) + manager who holds ≥1 admin
 * module (filtered menu). A manager with no admin modules is sent to /no-access (no empty shell).
 * Staff/baker/accounting are still blocked upstream by the owner/manager dashboard layout, so
 * this stays manager-only even with the flag on. Page guards remain the real per-page authority.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const managerAccess = process.env.ADMIN_MANAGER_ACCESS === "true";
  const ctx = await requireRole(managerAccess ? ["owner", "manager"] : ["owner"]);

  let navItems: NavItem[];
  if (ctx.primaryRole === "owner") {
    // Owner: full menu, no extra RBAC round-trips — behaviour identical to before.
    navItems = [...ADMIN_NAV];
  } else {
    // Non-owner (manager): filtered menu; deny entry entirely if no admin module is granted.
    navItems = visibleNav(await loadUserPermissions(ctx));
    if (navItems.length === 0) redirect("/no-access");
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          ตั้งค่าระบบ <span className="text-base font-normal text-muted">Setup</span>
        </h1>
        <p className="text-sm text-muted">
          จัดการสินค้า ราคา สูตร และสต๊อก · Catalog, pricing, recipes &amp; stock
        </p>
      </div>
      <AdminNav items={navItems} />
      {children}
    </div>
  );
}
