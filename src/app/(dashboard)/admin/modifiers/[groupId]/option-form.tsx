"use client";

import { useActionState } from "react";
import { createOptionAction, type FormState } from "../actions";
import { Field, FormMessage, SubmitButton, fieldClass } from "../../_components/forms";

const init: FormState = {};

export function OptionForm({ groupId }: { groupId: string }) {
  const [state, action] = useActionState(createOptionAction, init);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <input type="hidden" name="groupId" value={groupId} />
      <Field label="ชื่อ · Name" htmlFor="name">
        <input id="name" name="name" required placeholder="Oat Milk" className={fieldClass} />
      </Field>
      <Field label="ปรับราคา (บาท) · Price adj (THB)" htmlFor="priceAdjustment">
        <input id="priceAdjustment" name="priceAdjustment" type="number" step="0.01" placeholder="10.00" className={fieldClass} />
      </Field>
      <Field label="รหัส · Code" htmlFor="code">
        <input id="code" name="code" placeholder="OAT" className={fieldClass} />
      </Field>
      <Field label="รูปภาพ URL · Image URL" htmlFor="imageUrl">
        <input id="imageUrl" name="imageUrl" placeholder="https://…" className={fieldClass} />
      </Field>
      <Field label="ลำดับ · Sort" htmlFor="sortOrder">
        <input id="sortOrder" name="sortOrder" type="number" defaultValue="0" className={fieldClass} />
      </Field>
      <label className="flex items-end gap-2 pb-2">
        <input type="checkbox" name="isDefault" className="h-4 w-4" />
        <span className="text-sm">ค่าเริ่มต้น · Default</span>
      </label>
      <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-3">
        <SubmitButton>เพิ่มตัวเลือก · Add option</SubmitButton>
        <FormMessage ok={state.ok} error={state.error} />
      </div>
    </form>
  );
}
