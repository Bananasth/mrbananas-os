import type { Metadata } from "next";
import { requireRole } from "@/server/auth/guard";
import { getStockOnHand, listInventoryItems } from "@/server/services";
import { Badge, Card, CardContent, CardHeader, CardTitle, th } from "../../_components/ui";
import { ServiceErrorCard } from "../../_components/service-error";

export const metadata: Metadata = { title: "Stock on hand · Setup", robots: { index: false } };

export default async function StockPage() {
  const ctx = await requireRole(["owner"]);
  const branchId = ctx.branchIds[0];
  if (!branchId) {
    return <p className="text-sm text-muted">ไม่พบสาขาในสิทธิ์ของคุณ · No branch in your context.</p>;
  }

  const [stock, items] = await Promise.all([getStockOnHand({ branchId }), listInventoryItems()]);
  if (!stock.ok) return <ServiceErrorCard error={stock.error} />;
  const itemById = new Map((items.ok ? items.value : []).map((it) => [it.id, it]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>สต๊อกคงเหลือ · Stock on hand ({stock.value.length})</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {stock.value.length === 0 ? (
          <p className="text-sm text-muted">ไม่มีสต๊อก · No stock on hand.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className={th}>วัตถุดิบ · Item</th>
                <th className={th}>ชนิด · Kind</th>
                <th className="py-2 font-medium">คงเหลือ · Available</th>
              </tr>
            </thead>
            <tbody>
              {stock.value.map((s) => {
                const it = itemById.get(s.item_id);
                return (
                  <tr key={s.item_id} className="border-b border-border/60">
                    <td className="py-2 pr-3">
                      {it?.name ?? <span className="font-mono text-xs">{s.item_id.slice(0, 8)}</span>}
                    </td>
                    <td className="py-2 pr-3">{it ? <Badge tone="neutral">{it.item_kind}</Badge> : "—"}</td>
                    <td className="py-2 tabular-nums">
                      {s.qty_available} {it?.base_unit ?? ""}
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
