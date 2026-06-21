import type { Metadata } from "next";
import Link from "next/link";
import {
  getRecipeIngredients,
  getRecipeVersions,
  listInventoryItems,
  listRecipes,
  type RecipeVersionStatus,
} from "@/server/services";
import { activateVersionAction } from "../../actions";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "../../_components/ui";
import { ServiceErrorCard } from "../../_components/service-error";
import { DraftVersionForm, IngredientForm } from "./version-forms";
import { VersionActions } from "./version-actions";

export const metadata: Metadata = { title: "Recipe versions · Setup", robots: { index: false } };

const STATUS_TONE: Record<RecipeVersionStatus, "warning" | "success" | "neutral"> = {
  draft: "warning",
  active: "success",
  retired: "neutral",
};

export default async function RecipeVersionsPage({
  params,
}: {
  params: Promise<{ recipeId: string }>;
}) {
  const { recipeId } = await params;
  const [versionsRes, itemsRes, recipesRes] = await Promise.all([
    getRecipeVersions(recipeId),
    listInventoryItems(),
    listRecipes(),
  ]);
  if (!versionsRes.ok) return <ServiceErrorCard error={versionsRes.error} />;
  const items = itemsRes.ok ? itemsRes.value : [];
  const recipe = recipesRes.ok ? recipesRes.value.find((r) => r.id === recipeId) : undefined;
  const ingredientsByVersion = await Promise.all(
    versionsRes.value.map((v) => getRecipeIngredients(v.id)),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{recipe?.name ?? "สูตร · Recipe"}</h2>
        <Link href="/admin/recipes" className="text-sm hover:text-accent-dark">
          ← กลับ · Back
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>เวอร์ชันใหม่ (ร่าง) · New draft version</CardTitle>
        </CardHeader>
        <CardContent>
          <DraftVersionForm recipeId={recipeId} />
        </CardContent>
      </Card>

      {versionsRes.value.length === 0 ? (
        <p className="text-sm text-muted">ยังไม่มีเวอร์ชัน · No versions yet.</p>
      ) : (
        versionsRes.value.map((v, idx) => {
          const ingRes = ingredientsByVersion[idx];
          const ingredients = ingRes && ingRes.ok ? ingRes.value : [];
          const isDraft = v.status === "draft";
          return (
            <Card key={v.id}>
              <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  เวอร์ชัน {v.version_no}
                  <Badge tone={STATUS_TONE[v.status]}>{v.status}</Badge>
                </CardTitle>
                <div className="flex items-center gap-3 text-xs text-muted">
                  <span>อายุ {v.shelf_life_hours ?? "—"} ชม.</span>
                  <span>ผลผลิต {v.yield_qty ?? "—"}</span>
                  {isDraft ? (
                    <form action={activateVersionAction}>
                      <input type="hidden" name="recipeVersionId" value={v.id} />
                      <input type="hidden" name="recipeId" value={recipeId} />
                      <button
                        type="submit"
                        className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-fg transition-opacity hover:opacity-90"
                      >
                        เปิดใช้งาน · Activate
                      </button>
                    </form>
                  ) : null}
                  <VersionActions version={v} recipeId={recipeId} />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {ingredients.length === 0 ? (
                  <p className="text-sm text-muted">ยังไม่มีวัตถุดิบ · No ingredients.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted">
                        <th className="py-1 pr-3 font-medium">วัตถุดิบ · Item</th>
                        <th className="py-1 pr-3 font-medium">จำนวน · Qty</th>
                        <th className="py-1 font-medium">หน่วย · Unit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ingredients.map((ing) => (
                        <tr key={ing.id} className="border-b border-border/60">
                          <td className="py-1 pr-3 font-mono text-xs">{ing.item_id.slice(0, 8)}</td>
                          <td className="py-1 pr-3 tabular-nums">{ing.quantity}</td>
                          <td className="py-1">{ing.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {isDraft ? (
                  <IngredientForm recipeId={recipeId} recipeVersionId={v.id} items={items} />
                ) : (
                  <p className="text-xs text-muted">
                    เวอร์ชันนี้ล็อกแล้ว แก้วัตถุดิบไม่ได้ · Locked; ingredients are immutable.
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
