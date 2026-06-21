"use client";

import { useActionState, useMemo, useState } from "react";
import { displayUnit, unitsForBase } from "@/server/services/unit-convert";
import type { InventoryItem } from "@/server/services/types";
import { receiveInventoryAction, type FormState } from "../../actions";
import { Field, FormMessage, SubmitButton, fieldClass } from "../../_components/forms";

const init: FormState = {};

export function ReceiveForm({ branchId, items }: { branchId: string; items: InventoryItem[] }) {
  const [state, action] = useActionState(receiveInventoryAction, init);
  const [itemId, setItemId] = useState("");

  const item = useMemo(() => items.find((i) => i.id === itemId), [items, itemId]);
  const baseUnit = item?.base_unit ?? "";
  const unitOptions = useMemo(() => (baseUnit ? unitsForBase(baseUnit) : []), [baseUnit]);

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="branchId" value={branchId} />
      <Field label="วัตถุดิบ · Item" htmlFor="itemId">
        <select
          id="itemId"
          name="itemId"
          required
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
          className={fieldClass}
        >
          <option value="" disabled>
            — เลือก / choose —
          </option>
          {items.map((it) => (
            <option key={it.id} value={it.id}>
              {it.name ?? it.sku ?? it.item_type ?? "item"} · {displayUnit(it.base_unit)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="จำนวน · Quantity" htmlFor="qty">
        <input id="qty" name="qty" type="number" step="0.001" min="0" required placeholder="10" className={fieldClass} />
      </Field>
      <Field label="หน่วยที่รับ · Receive unit" htmlFor="unit">
        <select id="unit" name="unit" required disabled={!item} className={fieldClass}>
          {!item ? (
            <option value="">— เลือกวัตถุดิบก่อน · choose item first —</option>
          ) : (
            unitOptions.map((u) => (
              <option key={u} value={u}>
                {displayUnit(u)}
              </option>
            ))
          )}
        </select>
      </Field>
      <Field label="วันหมดอายุ · Expires (optional)" htmlFor="expiresAt">
        <input id="expiresAt" name="expiresAt" type="datetime-local" className={fieldClass} />
      </Field>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <SubmitButton>รับเข้าสต๊อก · Receive stock</SubmitButton>
        <FormMessage ok={state.ok} error={state.error} />
        {item ? (
          <span className="text-xs text-muted">
            เก็บเป็นหน่วยฐาน · stored in base unit: <b>{displayUnit(baseUnit)}</b>
            {baseUnit && unitOptions.length > 1 ? " (auto-converted)" : ""}
          </span>
        ) : null}
      </div>
    </form>
  );
}
