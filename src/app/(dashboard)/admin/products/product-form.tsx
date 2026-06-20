"use client";

import { useActionState } from "react";
import type { InventoryItem } from "@/server/services";
import { createProductAction, type FormState } from "../actions";
import { Field, FormMessage, SubmitButton, fieldClass } from "../_components/forms";

const init: FormState = {};

export function ProductForm({ items }: { items: InventoryItem[] }) {
  const [state, action] = useActionState(createProductAction, init);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <Field label="รหัสสินค้า · SKU" htmlFor="sku">
        <input id="sku" name="sku" required placeholder="LATTE" className={fieldClass} />
      </Field>
      <Field label="ชื่อ · Name" htmlFor="name">
        <input id="name" name="name" required placeholder="Latte" className={fieldClass} />
      </Field>
      <Field label="หมวดหมู่ · Category" htmlFor="category">
        <select id="category" name="category" defaultValue="beverage" className={fieldClass}>
          <option value="beverage">beverage · เครื่องดื่ม</option>
          <option value="bakery">bakery · เบเกอรี่</option>
        </select>
      </Field>
      <Field label="ประเภท · Type" htmlFor="type">
        <select id="type" name="type" defaultValue="made_to_order" className={fieldClass}>
          <option value="made_to_order">made_to_order · ทำสด</option>
          <option value="batch">batch · ผลิตเป็นล็อต</option>
        </select>
      </Field>
      <Field label="ผูกสต๊อก (เฉพาะ batch) · Inventory item" htmlFor="inventoryItemId">
        <select id="inventoryItemId" name="inventoryItemId" defaultValue="" className={fieldClass}>
          <option value="">— ไม่ผูก / none —</option>
          {items.map((it) => (
            <option key={it.id} value={it.id}>
              {it.item_kind} · {it.base_unit} · {it.id.slice(0, 8)}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex items-end gap-3">
        <SubmitButton>เพิ่มสินค้า · Add product</SubmitButton>
        <FormMessage ok={state.ok} error={state.error} />
      </div>
    </form>
  );
}
