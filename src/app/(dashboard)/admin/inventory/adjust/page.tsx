import type { Metadata } from "next";
import { requireRole } from "@/server/auth/guard";
import { listInventoryItems, listInventoryLots } from "@/server/services";
import { Card, CardContent, CardHeader, CardTitle, th } from "../../_components/ui";
import { ServiceErrorCard } from "../../_components/service-error";
import { LotRow } from "./lot-row";

export const metadata: Metadata = { title: "Stock adjustment · Setup", robots: { index: false } };

export default async function AdjustPage() {
  const ctx = await requireRole(["owner"]);
  const branchId = ctx.branchIds[0];
  if (!branchId) {
    return <p className="text-sm text-muted">ไม่พบสาขาในสิทธิ์ของคุณ · No branch in your context.</p>;
  }
  const [lots, items] = await Promise.all([listInventoryLots(branchId), listInventoryItems()]);
  if (!lots.ok) return <ServiceErrorCard error={lots.error} />;
  const itemName = new Map(
    (items.ok ? items.value : []).map((it) => [it.id, it.name ?? it.sku ?? it.item_type ?? "item"]),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>ปรับสต๊อก · Stock adjustment ({lots.value.length} lots)</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <p className="mb-3 text-xs text-muted">
          ไม่แก้ยอดโดยตรง — ทุกการเปลี่ยนแปลงสร้าง movement + บันทึก before/after/เหตุผล/ผู้ใช้/เวลา · Never edits
          quantity directly; every change writes an inventory_movement + an audit record.
        </p>
        {lots.value.length === 0 ? (
          <p className="text-sm text-muted">ไม่มีล็อตสต๊อก · No stock lots.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className={th}>วัตถุดิบ · Item</th>
                <th className={th}>คงเหลือ · On hand</th>
                <th className={th}>หมดอายุ · Expires</th>
                <th className="py-2 text-right font-medium">จัดการ · Actions</th>
              </tr>
            </thead>
            <tbody>
              {lots.value.map((lot) => (
                <LotRow key={lot.id} lot={lot} itemName={itemName.get(lot.item_id) ?? "—"} />
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
