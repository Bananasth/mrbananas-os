"use client";

import { useActionState, useState, useTransition } from "react";
import { ITEM_TYPES } from "@/server/services/types";
import { createInventoryItemAction, generateSkuAction, type FormState } from "../../actions";
import { Field, FormMessage, SubmitButton, fieldClass } from "../../_components/forms";

const init: FormState = {};
type ItemType = "RM" | "SF" | "PK" | "FG" | "MD" | "SV";

export function ItemForm() {
  const [state, action] = useActionState(createInventoryItemAction, init);
  const [itemType, setItemType] = useState<ItemType>("RM");
  const [sku, setSku] = useState("");
  const [genPending, startGen] = useTransition();
  const [genErr, setGenErr] = useState<string | null>(null);

  const generate = () => {
    setGenErr(null);
    startGen(async () => {
      const res = await generateSkuAction(itemType);
      if (res.ok) setSku(res.sku);
      else setGenErr(res.error);
    });
  };

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <Field label="ประเภท · Item type" htmlFor="itemType">
        <select
          id="itemType"
          name="itemType"
          value={itemType}
          onChange={(e) => setItemType(e.target.value as ItemType)}
          className={fieldClass}
        >
          {ITEM_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.value} · {t.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="หน่วยฐาน · Base unit" htmlFor="baseUnit">
        <input id="baseUnit" name="baseUnit" required placeholder="g / ml / kg / pcs" className={fieldClass} />
      </Field>
      <Field label="ชื่อ · Name" htmlFor="name">
        <input id="name" name="name" required placeholder="Milk Powder" className={fieldClass} />
      </Field>
      <Field label="SKU" htmlFor="sku">
        <div className="flex gap-2">
          <input
            id="sku"
            name="sku"
            required
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            placeholder={`${itemType}0001 (or type your own)`}
            className={fieldClass}
          />
          <button
            type="button"
            onClick={generate}
            disabled={genPending}
            className="shrink-0 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-bg disabled:opacity-50"
          >
            {genPending ? "…" : "สร้าง SKU"}
          </button>
        </div>
      </Field>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <SubmitButton>เพิ่มวัตถุดิบ · Add item</SubmitButton>
        <FormMessage ok={state.ok} error={state.error} />
        {genErr ? <span className="text-sm text-red-600">{genErr}</span> : null}
      </div>
    </form>
  );
}
