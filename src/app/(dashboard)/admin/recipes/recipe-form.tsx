"use client";

import { useActionState } from "react";
import type { Product } from "@/server/services";
import { createRecipeAction, type FormState } from "../actions";
import { Field, FormMessage, SubmitButton, fieldClass } from "../_components/forms";

const init: FormState = {};

export function RecipeForm({ products }: { products: Product[] }) {
  const [state, action] = useActionState(createRecipeAction, init);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <Field label="สินค้า · Product" htmlFor="productId">
        <select id="productId" name="productId" required defaultValue="" className={fieldClass}>
          <option value="" disabled>
            — เลือกสินค้า / choose —
          </option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.sku} · {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="ชื่อสูตร · Recipe name" htmlFor="name">
        <input id="name" name="name" required placeholder="Latte v1" className={fieldClass} />
      </Field>
      <div className="flex items-center gap-3 sm:col-span-2">
        <SubmitButton>เพิ่มสูตร · Add recipe</SubmitButton>
        <FormMessage ok={state.ok} error={state.error} />
      </div>
    </form>
  );
}
