import type { Metadata } from "next";
import Link from "next/link";
import { listProducts, listRecipes } from "@/server/services";
import { Card, CardContent, CardHeader, CardTitle, td, th } from "../_components/ui";
import { ServiceErrorCard } from "../_components/service-error";
import { RecipeForm } from "./recipe-form";

export const metadata: Metadata = { title: "Recipes · Setup", robots: { index: false } };

export default async function RecipesPage() {
  const [recipes, products] = await Promise.all([listRecipes(), listProducts()]);
  if (!recipes.ok) return <ServiceErrorCard error={recipes.error} />;
  const productName = new Map(
    (products.ok ? products.value : []).map((p) => [p.id, `${p.sku} · ${p.name}`]),
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>เพิ่มสูตร · New recipe</CardTitle>
        </CardHeader>
        <CardContent>
          <RecipeForm products={products.ok ? products.value : []} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>สูตรทั้งหมด · Recipes ({recipes.value.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {recipes.value.length === 0 ? (
            <p className="text-sm text-muted">ยังไม่มีสูตร · No recipes yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className={th}>ชื่อสูตร · Recipe</th>
                  <th className={th}>สินค้า · Product</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {recipes.value.map((r) => (
                  <tr key={r.id} className="border-b border-border/60">
                    <td className="py-2 pr-3 font-medium">{r.name}</td>
                    <td className="py-2 pr-3 text-muted">{productName.get(r.product_id) ?? "—"}</td>
                    <td className="py-2 text-right">
                      <Link
                        href={`/admin/recipes/${r.id}`}
                        className="text-sm font-medium hover:text-accent-dark"
                      >
                        จัดการเวอร์ชัน · Versions →
                      </Link>
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
