import type { Metadata } from "next";
import { listInventoryItems, listProducts } from "@/server/services";
import { Card, CardContent, CardHeader, CardTitle, th } from "../_components/ui";
import { ServiceErrorCard } from "../_components/service-error";
import { ProductForm } from "./product-form";
import { ProductRow } from "./product-row";

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
                  <th className="py-2 text-right font-medium">จัดการ · Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.value.map((p) => (
                  <ProductRow key={p.id} product={p} />
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
