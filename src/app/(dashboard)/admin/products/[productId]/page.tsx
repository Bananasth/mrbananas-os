import type { Metadata } from "next";
import Link from "next/link";
import { getProductModifierAssignments, listModifierGroups, listProducts } from "@/server/services";
import { Card, CardContent, CardHeader, CardTitle, th } from "../../_components/ui";
import { ServiceErrorCard } from "../../_components/service-error";
import { AssignForm } from "./assign-form";
import { AssignmentRow } from "./assignment-row";

export const metadata: Metadata = { title: "Product modifiers · Setup", robots: { index: false } };

export default async function ProductModifiersPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  const [products, assignments, groups] = await Promise.all([
    listProducts(),
    getProductModifierAssignments(productId),
    listModifierGroups(),
  ]);
  if (!assignments.ok) return <ServiceErrorCard error={assignments.error} />;
  const product = products.ok ? products.value.find((p) => p.id === productId) : undefined;
  const assignedIds = new Set(assignments.value.map((a) => a.group.id));
  const available = (groups.ok ? groups.value : []).filter((g) => !assignedIds.has(g.id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">
          {product ? `${product.sku} · ${product.name}` : "Product"}{" "}
          <span className="text-sm font-normal text-muted">ตัวเลือก · Modifiers</span>
        </h2>
        <Link href="/admin/products" className="text-sm hover:text-accent-dark">
          ← กลับ · Back
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>เพิ่มกลุ่มตัวเลือก · Assign modifier group</CardTitle>
        </CardHeader>
        <CardContent>
          <AssignForm productId={productId} available={available} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>กลุ่มที่ใช้ · Assigned groups ({assignments.value.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {assignments.value.length === 0 ? (
            <p className="text-sm text-muted">ยังไม่ได้เพิ่มกลุ่ม · No groups assigned yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className={th}>กลุ่ม · Group</th>
                  <th className={th}>ชนิด · Type</th>
                  <th className={th}>สถานะ · Status</th>
                  <th className={th}>ลำดับ · Sort</th>
                  <th className="py-2 text-right font-medium">จัดการ · Actions</th>
                </tr>
              </thead>
              <tbody>
                {assignments.value.map((a) => (
                  <AssignmentRow
                    key={a.group.id}
                    productId={productId}
                    group={a.group}
                    sortOrder={a.sortOrder}
                  />
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
