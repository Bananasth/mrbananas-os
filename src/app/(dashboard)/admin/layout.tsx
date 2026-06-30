import type { ReactNode } from "react";
import { requireRole } from "@/server/auth/guard";
import { Sidebar } from "./_components/sidebar";

/**
 * Owner console shell. OWNER-ONLY for now (requireRole redirects others). The sidebar
 * is role-aware (see nav-config); opening the console to managers for their permitted
 * modules is a follow-up auth change.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireRole(["owner"]);
  return (
    <div className="flex gap-6">
      <Sidebar role="owner" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
