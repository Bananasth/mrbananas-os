"use client";

import { useActionState } from "react";
import type { InventoryItem } from "@/server/services";
import { receiveInventoryAction, type FormState } from "../../actions";
import { Field, FormMessage, SubmitButton, fieldClass } from "../../_components/forms";

const init: FormState = {};

export function ReceiveForm({ branchId, items }: { branchId: string; items: InventoryItem[] }) {
  const [state, action] = useActionState(receiveInventoryAction, init);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="branchId" value={branchId} />
      <Field label="วัตถุดิบ · Item" htmlFor="itemId">
        <select id="itemId" name="itemId" required defaultValue="" className={fieldClass}>
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
      <Field label="จำนวน · Quantity" htmlFor="qty">
        <input
          id="qty"
          name="qty"
          type="number"
          step="0.001"
          min="0"
          required
          placeholder="10"
          className={fieldClass}
        />
      </Field>
      <Field label="หน่วย · Unit" htmlFor="unit">
        <input id="unit" name="unit" required placeholder="kg / loaf" className={fieldClass} />
      </Field>
      <Field label="วันหมดอายุ · Expires (optional)" htmlFor="expiresAt">
        <input id="expiresAt" name="expiresAt" type="datetime-local" className={fieldClass} />
      </Field>
      <div className="flex items-center gap-3 sm:col-span-2">
        <SubmitButton>รับเข้าสต๊อก · Receive stock</SubmitButton>
        <FormMessage ok={state.ok} error={state.error} />
      </div>
    </form>
  );
}
