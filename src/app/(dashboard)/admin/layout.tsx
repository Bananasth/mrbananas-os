import type { ReactNode } from "react";
import { requireRole } from "@/server/auth/guard";
import { AdminNav } from "./_components/admin-nav";

/** Setup is OWNER-ONLY. requireRole redirects managers/others to their home surface. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireRole(["owner"]);
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
      <AdminNav />
      {children}
    </div>
  );
}
