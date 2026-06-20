import type { Metadata } from "next";
import { listInventoryItems, listProducts } from "@/server/services";
import { toggleProductAction } from "../actions";
import { Badge, Card, CardContent, CardHeader, CardTitle, td, th } from "../_components/ui";
import { ServiceErrorCard } from "../_components/service-error";
import { ProductForm } from "./product-form";

export const metadata: Metadata = { title: "Products · Setup", robots: { index: false } };

export default async function ProductsPage() {
  const [products, items] = await Promise.all([listProducts(), listInventoryItems()]);
  if (!products.ok) return <ServiceErrorCard error={products.error} />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>เพิ่มสินค้า · New product</CardTitle>
        </CardHeader>
        <CardContent>
          <ProductForm items={items.ok ? items.value : []} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>สินค้าทั้งหมด · Catalog ({products.value.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {products.value.length === 0 ? (
            <p className="text-sm text-muted">ยังไม่มีสินค้า · No products yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className={th}>SKU</th>
                  <th className={th}>ชื่อ · Name</th>
                  <th className={th}>หมวด · Category</th>
                  <th className={th}>ประเภท · Type</th>
                  <th className={th}>สถานะ · Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {products.value.map((p) => (
                  <tr key={p.id} className="border-b border-border/60">
                    <td className="py-2 pr-3 font-mono text-xs">{p.sku}</td>
                    <td className={td}>{p.name}</td>
                    <td className={td}>
                      <Badge tone="accent">{p.category}</Badge>
                    </td>
                    <td className="py-2 pr-3 text-muted">{p.type}</td>
                    <td className={td}>
                      {p.is_active ? (
                        <Badge tone="success">active</Badge>
                      ) : (
                        <Badge tone="danger">inactive</Badge>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <form action={toggleProductAction}>
                        <input type="hidden" name="productId" value={p.id} />
                        <input type="hidden" name="isActive" value={p.is_active ? "false" : "true"} />
                        <button
                          type="submit"
                          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-bg"
                        >
                          {p.is_active ? "ปิดการขาย" : "เปิดการขาย"}
                        </button>
                      </form>
                    </td>
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
