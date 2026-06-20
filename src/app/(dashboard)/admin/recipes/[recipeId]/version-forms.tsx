"use client";

import { useActionState } from "react";
import type { InventoryItem } from "@/server/services";
import { addIngredientAction, createDraftVersionAction, type FormState } from "../../actions";
import { Field, FormMessage, SubmitButton, fieldClass } from "../../_components/forms";

const init: FormState = {};

export function DraftVersionForm({ recipeId }: { recipeId: string }) {
  const [state, action] = useActionState(createDraftVersionAction, init);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3">
      <input type="hidden" name="recipeId" value={recipeId} />
      <Field label="เวอร์ชัน · Version no." htmlFor="versionNo">
        <input
          id="versionNo"
          name="versionNo"
          type="number"
          min="1"
          required
          placeholder="1"
          className={fieldClass}
        />
      </Field>
      <Field label="อายุ (ชม.) · Shelf life (h)" htmlFor="shelfLifeHours">
        <input
          id="shelfLifeHours"
          name="shelfLifeHours"
          type="number"
          min="0"
          placeholder="48"
          className={fieldClass}
        />
      </Field>
      <Field label="ผลผลิต · Yield qty" htmlFor="yieldQty">
        <input
          id="yieldQty"
          name="yieldQty"
          type="number"
          step="0.01"
          min="0"
          placeholder="20"
          className={fieldClass}
        />
      </Field>
      <div className="flex items-center gap-3 sm:col-span-3">
        <SubmitButton>สร้างเวอร์ชันร่าง · Add draft version</SubmitButton>
        <FormMessage ok={state.ok} error={state.error} />
      </div>
    </form>
  );
}

export function IngredientForm({
  recipeId,
  recipeVersionId,
  items,
}: {
  recipeId: string;
  recipeVersionId: string;
  items: InventoryItem[];
}) {
  const [state, action] = useActionState(addIngredientAction, init);
  return (
    <form action={action} className="grid gap-2 sm:grid-cols-4 sm:items-end">
      <input type="hidden" name="recipeId" value={recipeId} />
      <input type="hidden" name="recipeVersionId" value={recipeVersionId} />
      <Field label="วัตถุดิบ · Item" htmlFor={`item-${recipeVersionId}`}>
        <select id={`item-${recipeVersionId}`} name="itemId" required defaultValue="" className={fieldClass}>
          <option value="" disabled>
            — เลือก / choose —
          </option>
          {items.map((it) => (
            <option key={it.id} value={it.id}>
              {it.name ?? it.item_kind} · {it.base_unit}
            </option>
          ))}
        </select>
      </Field>
      <Field label="จำนวน · Qty" htmlFor={`qty-${recipeVersionId}`}>
        <input
          id={`qty-${recipeVersionId}`}
          name="quantity"
          type="number"
          step="0.001"
          min="0"
          required
          className={fieldClass}
        />
      </Field>
      <Field label="หน่วย · Unit" htmlFor={`unit-${recipeVersionId}`}>
        <input id={`unit-${recipeVersionId}`} name="unit" required placeholder="g / ml" className={fieldClass} />
      </Field>
      <div className="flex items-center gap-2">
        <SubmitButton>เพิ่ม · Add</SubmitButton>
        <FormMessage ok={state.ok} error={state.error} />
      </div>
    </form>
  );
}
