import type { Metadata } from "next";
import { listProducts } from "@/server/services";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "../_components/ui";
import { ServiceErrorCard } from "../_components/service-error";

export const metadata: Metadata = { title: "Categories · Setup", robots: { index: false } };

// product.category is a FIXED schema enum (CHECK constraint), not a CRUD table — changing the
// set would require a schema change (out of scope). Read-only overview with live counts.
const CATEGORIES = [
  { key: "beverage", th: "เครื่องดื่ม", en: "Beverage" },
  { key: "bakery", th: "เบเกอรี่", en: "Bakery" },
];

export default async function CategoriesPage() {
  const products = await listProducts();
  if (!products.ok) return <ServiceErrorCard error={products.error} />;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {CATEGORIES.map((c) => {
          const inCat = products.value.filter((p) => p.category === c.key);
          const active = inCat.filter((p) => p.is_active).length;
          return (
            <Card key={c.key}>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>
                  {c.th} <span className="text-sm font-normal text-muted">{c.en}</span>
                </CardTitle>
                <Badge tone="accent">{c.key}</Badge>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold tabular-nums">{inCat.length}</p>
                <p className="text-sm text-muted">
                  {active} เปิดขาย · active / {inCat.length - active} ปิด · inactive
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <p className="text-xs text-muted">
        หมวดหมู่เป็นค่าคงที่ในสคีมา (CHECK constraint) — แก้ไขชุดหมวดหมู่ต้องเปลี่ยนสคีมา · Categories are a fixed
        schema enum; changing the set requires a schema change.
      </p>
    </div>
  );
}
