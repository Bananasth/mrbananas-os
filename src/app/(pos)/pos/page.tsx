import type { Metadata } from "next";
import { requireRole } from "@/server/auth/guard";
import { getMenu, listWorkstations } from "@/server/services";
import { PosClient } from "./pos-client";

export const metadata: Metadata = { title: "POS", robots: { index: false } };

export default async function PosPage() {
  const ctx = await requireRole(["owner", "manager", "staff"]);
  const branchId = ctx.branchIds[0];
  if (!branchId) {
    return <p className="text-sm text-muted">ไม่พบสาขาในสิทธิ์ของคุณ · No branch in your context.</p>;
  }

  const [menu, workstations] = await Promise.all([getMenu(branchId), listWorkstations(branchId)]);
  if (!menu.ok) {
    return (
      <p className="text-sm text-red-600">
        [{menu.error.code}] {menu.error.message}
      </p>
    );
  }

  return (
    <PosClient
      branchId={branchId}
      menu={menu.value}
      workstations={(workstations.ok ? workstations.value : []).map((w) => ({
        id: w.id,
        name: w.name,
        type: w.type,
      }))}
    />
  );
}
