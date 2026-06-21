"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { ITEM_TYPES } from "@/server/services/types";
import { createInventoryItemAction, peekSkuAction, type FormState } from "../../actions";
import { Field, FormMessage, SubmitButton, fieldClass } from "../../_components/forms";

const init: FormState = {};
type ItemType = "RM" | "SF" | "PK" | "FG" | "MD" | "SV";

export function ItemForm() {
  const [state, action] = useActionState(createInventoryItemAction, init);
  const [itemType, setItemType] = useState<ItemType>("RM");
  const [sku, setSku] = useState("");
  const [autoSku, setAutoSku] = useState(true);
  const [peekPending, startPeek] = useTransition();
  const [peekErr, setPeekErr] = useState<string | null>(null);

  // Preview the next SKU for the current type (read-only — never consumes a number).
  // Re-runs when the type changes; the Generate button re-runs it on demand.
  useEffect(() => {
    let active = true;
    startPeek(async () => {
      const res = await peekSkuAction(itemType);
      if (!active) return;
      if (res.ok) {
        setSku(res.sku);
        setAutoSku(true);
      } else {
        setPeekErr(res.error);
      }
    });
    return () => {
      active = false;
    };
  }, [itemType]);

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="autoSku" value={autoSku ? "true" : "false"} />
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
      <Field label={`SKU ${autoSku ? "· auto" : "· manual"}`} htmlFor="sku">
        <div className="flex gap-2">
          <input
            id="sku"
            name="sku"
            required
            value={sku}
            onChange={(e) => {
              setSku(e.target.value);
              setAutoSku(false); // user typed → manual override
            }}
            placeholder={`${itemType}0001`}
            className={fieldClass}
          />
          <button
            type="button"
            onClick={() => {
              setPeekErr(null);
              startPeek(async () => {
                const res = await peekSkuAction(itemType);
                if (res.ok) {
                  setSku(res.sku);
                  setAutoSku(true);
                } else {
                  setPeekErr(res.error);
                }
              });
            }}
            disabled={peekPending}
            className="shrink-0 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-bg disabled:opacity-50"
            title="Preview the next SKU (does not reserve it)"
          >
            {peekPending ? "…" : "ดูตัวอย่าง"}
          </button>
        </div>
      </Field>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <SubmitButton>เพิ่มวัตถุดิบ · Add item</SubmitButton>
        <FormMessage ok={state.ok} error={state.error} />
        {peekErr ? <span className="text-sm text-red-600">{peekErr}</span> : null}
        <span className="text-xs text-muted">
          ตัวอย่าง SKU ไม่จองเลข — เลขถูกตัดตอนบันทึกเท่านั้น · Preview doesn’t reserve; the number is taken only on save.
        </span>
      </div>
    </form>
  );
}
