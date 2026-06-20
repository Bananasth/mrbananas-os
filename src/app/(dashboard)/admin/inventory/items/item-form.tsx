"use client";

import { useActionState } from "react";
import { createInventoryItemAction, type FormState } from "../../actions";
import { Field, FormMessage, SubmitButton, fieldClass } from "../../_components/forms";

const init: FormState = {};

export function ItemForm() {
  const [state, action] = useActionState(createInventoryItemAction, init);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <Field label="ชนิด · Kind" htmlFor="itemKind">
        <select id="itemKind" name="itemKind" defaultValue="raw" className={fieldClass}>
          <option value="raw">raw · วัตถุดิบ</option>
          <option value="semi_finished">semi_finished · กึ่งสำเร็จ</option>
          <option value="finished">finished · สินค้าสำเร็จ</option>
        </select>
      </Field>
      <Field label="หน่วยฐาน · Base unit" htmlFor="baseUnit">
        <input id="baseUnit" name="baseUnit" required placeholder="g / ml / kg / loaf" className={fieldClass} />
      </Field>
      <Field label="ชื่อ · Name (raw / semi_finished)" htmlFor="name">
        <input id="name" name="name" placeholder="Milk" className={fieldClass} />
      </Field>
      <Field label="SKU (raw / semi_finished)" htmlFor="sku">
        <input id="sku" name="sku" placeholder="MILK" className={fieldClass} />
      </Field>
      <div className="flex items-center gap-3 sm:col-span-2">
        <SubmitButton>เพิ่มวัตถุดิบ · Add item</SubmitButton>
        <FormMessage ok={state.ok} error={state.error} />
      </div>
    </form>
  );
}
