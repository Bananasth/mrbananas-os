"use client";

import { useActionState } from "react";
import type { ModifierGroup } from "@/server/services/types";
import { assignGroupAction, type FormState } from "./actions";
import { Field, FormMessage, SubmitButton, fieldClass } from "../../_components/forms";

const init: FormState = {};

export function AssignForm({ productId, available }: { productId: string; available: ModifierGroup[] }) {
  const [state, action] = useActionState(assignGroupAction, init);
  if (available.length === 0) {
    return <p className="text-sm text-muted">ทุกกลุ่มถูกเพิ่มแล้ว · All groups already assigned.</p>;
  }
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="productId" value={productId} />
      <Field label="กลุ่มตัวเลือก · Group" htmlFor="modifierGroupId">
        <select id="modifierGroupId" name="modifierGroupId" required defaultValue="" className={fieldClass}>
          <option value="" disabled>
            — เลือก / choose —
          </option>
          {available.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
              {g.is_active ? "" : " (inactive)"}
            </option>
          ))}
        </select>
      </Field>
      <Field label="ลำดับ · Sort" htmlFor="sortOrder">
        <input id="sortOrder" name="sortOrder" type="number" defaultValue="0" className={`${fieldClass} w-24`} />
      </Field>
      <SubmitButton>เพิ่มกลุ่ม · Assign</SubmitButton>
      <FormMessage ok={state.ok} error={state.error} />
    </form>
  );
}
