import type { Metadata } from "next";
import { requireRole } from "@/server/auth/guard";
import { listInventoryItems, listMovements, listStockAdjustments } from "@/server/services";
import { displayUnit } from "@/server/services/unit-convert";
import type { MovementReason } from "@/server/services/types";
import { Card, CardContent, CardHeader, CardTitle, th } from "../../_components/ui";
import { ServiceErrorCard } from "../../_components/service-error";

export const metadata: Metadata = { title: "Stock movements · Setup", robots: { index: false } };

const REASON: Record<MovementReason, { label: string; cls: string }> = {
  receive: { label: "รับเข้า · receive", cls: "bg-green-100 text-green-700" },
  sell: { label: "ขาย · sale", cls: "bg-accent/20 text-fg" },
  produce: { label: "ผลิต · production", cls: "bg-blue-100 text-blue-700" },
  consume: { label: "ใช้ · consume", cls: "bg-stone-100 text-stone-700" },
  adjust: { label: "ปรับ · adjust", cls: "bg-amber-100 text-amber-700" },
  waste: { label: "ของเสีย · waste", cls: "bg-red-100 text-red-700" },
  transfer: { label: "โอน · transfer", cls: "bg-stone-100 text-stone-700" },
};

export default async function MovementsPage() {
  const ctx = await requireRole(["owner"]);
  const branchId = ctx.branchIds[0];
  if (!branchId) {
    return <p className="text-sm text-muted">ไม่พบสาขาในสิทธิ์ของคุณ · No branch in your context.</p>;
  }
  const [moves, items, adjustments] = await Promise.all([
    listMovements({ branchId }),
    listInventoryItems(),
    listStockAdjustments(branchId),
  ]);
  if (!moves.ok) return <ServiceErrorCard error={moves.error} />;

  const item = new Map((items.ok ? items.value : []).map((it) => [it.id, it]));
  const adjByMovement = new Map(
    (adjustments.ok ? adjustments.value : []).map((a) => [a.movement_id, a]),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>ประวัติการเคลื่อนไหวสต๊อก · Stock movements ({moves.value.length})</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {moves.value.length === 0 ? (
          <p className="text-sm text-muted">ยังไม่มีการเคลื่อนไหว · No movements yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className={th}>เวลา · When</th>
                <th className={th}>วัตถุดิบ · Item</th>
                <th className={th}>ประเภท · Type</th>
                <th className={th}>เปลี่ยนแปลง · Change</th>
                <th className="py-2 font-medium">ก่อน→หลัง · Before→After</th>
              </tr>
            </thead>
            <tbody>
              {moves.value.map((m) => {
                const it = item.get(m.item_id);
                const unit = displayUnit(it?.base_unit ?? "");
                const r = REASON[m.reason];
                const a = adjByMovement.get(m.id);
                return (
                  <tr key={m.id} className="border-b border-border/60">
                    <td className="py-2 pr-3 text-muted">{m.occurred_at.slice(0, 16).replace("T", " ")}</td>
                    <td className="py-2 pr-3">{it?.name ?? m.item_id.slice(0, 8)}</td>
                    <td className="py-2 pr-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${r.cls}`}>
                        {r.label}
                      </span>
                    </td>
                    <td className={`py-2 pr-3 tabular-nums ${m.qty_delta < 0 ? "text-red-600" : "text-green-700"}`}>
                      {m.qty_delta > 0 ? "+" : ""}
                      {m.qty_delta} {unit}
                    </td>
                    <td className="py-2 tabular-nums text-muted">
                      {a ? `${a.before_qty} → ${a.after_qty} (${a.reason})` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
