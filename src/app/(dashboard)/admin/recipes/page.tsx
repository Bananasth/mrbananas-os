import type { Metadata } from "next";
import { listProducts, listRecipes } from "@/server/services";
import { Card, CardContent, CardHeader, CardTitle, th } from "../_components/ui";
import { ServiceErrorCard } from "../_components/service-error";
import { RecipeForm } from "./recipe-form";
import { RecipeRow } from "./recipe-row";

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
                  <th className="py-2 text-right font-medium">จัดการ · Actions</th>
                </tr>
              </thead>
              <tbody>
                {recipes.value.map((r) => (
                  <RecipeRow
                    key={r.id}
                    recipe={r}
                    productLabel={productName.get(r.product_id) ?? "—"}
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
