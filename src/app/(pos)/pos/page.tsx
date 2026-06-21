import type { Metadata } from "next";
import { requireRole } from "@/server/auth/guard";
import { getMenu, getProductModifiers, listWorkstations } from "@/server/services";
import type { GroupWithOptions } from "@/server/services/types";
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

  // Modifier groups per menu product (active groups/options). Empty array = no modifiers.
  const modifierResults = await Promise.all(menu.value.map((m) => getProductModifiers(m.productId)));
  const modifiersByProduct: Record<string, GroupWithOptions[]> = {};
  menu.value.forEach((m, i) => {
    const r = modifierResults[i];
    modifiersByProduct[m.productId] = r && r.ok ? r.value : [];
  });

  return (
    <PosClient
      branchId={branchId}
      menu={menu.value}
      modifiersByProduct={modifiersByProduct}
      workstations={(workstations.ok ? workstations.value : []).map((w) => ({
        id: w.id,
        name: w.name,
        type: w.type,
      }))}
    />
  );
}
