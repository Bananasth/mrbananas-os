import type { Metadata } from "next";
import { listInventoryItems } from "@/server/services";
import { Badge, Card, CardContent, CardHeader, CardTitle, td, th } from "../../_components/ui";
import { ServiceErrorCard } from "../../_components/service-error";
import { ItemForm } from "./item-form";

export const metadata: Metadata = { title: "Inventory items · Setup", robots: { index: false } };

export default async function ItemsPage() {
  const items = await listInventoryItems();
  if (!items.ok) return <ServiceErrorCard error={items.error} />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>เพิ่มวัตถุดิบ / สินค้าคงคลัง · New inventory item</CardTitle>
        </CardHeader>
        <CardContent>
          <ItemForm />
          <p className="mt-2 text-xs text-muted">
            raw / semi_finished ต้องมีชื่อ + SKU · raw/semi need a name + SKU (stored in the subtype).
            ใช้เป็นวัตถุดิบในสูตรและรับสต๊อกได้ · usable as recipe ingredients and for receiving stock.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>วัตถุดิบทั้งหมด · Inventory items ({items.value.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {items.value.length === 0 ? (
            <p className="text-sm text-muted">ยังไม่มีวัตถุดิบ · No inventory items yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className={th}>ชื่อ · Name</th>
                  <th className={th}>SKU</th>
                  <th className={th}>ชนิด · Kind</th>
                  <th className="py-2 font-medium">หน่วย · Unit</th>
                </tr>
              </thead>
              <tbody>
                {items.value.map((it) => (
                  <tr key={it.id} className="border-b border-border/60">
                    <td className={td}>{it.name ?? <span className="text-muted">— (finished) —</span>}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{it.sku ?? "—"}</td>
                    <td className={td}>
                      <Badge tone="neutral">{it.item_kind}</Badge>
                    </td>
                    <td className="py-2">{it.base_unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
