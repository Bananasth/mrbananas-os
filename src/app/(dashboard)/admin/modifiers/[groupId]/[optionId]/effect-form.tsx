"use client";

import { useActionState } from "react";
import type { InventoryItem } from "@/server/services/types";
import { createEffectAction, type FormState } from "../../actions";
import { Field, FormMessage, SubmitButton, fieldClass } from "../../../_components/forms";

const init: FormState = {};

export function EffectForm({
  groupId,
  optionId,
  items,
}: {
  groupId: string;
  optionId: string;
  items: InventoryItem[];
}) {
  const [state, action] = useActionState(createEffectAction, init);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="optionId" value={optionId} />
      <Field label="ชนิดผล · Effect" htmlFor="effectType">
        <select id="effectType" name="effectType" defaultValue="set_qty" className={fieldClass}>
          <option value="set_qty">set_qty · override quantity</option>
          <option value="add">add · add ingredient</option>
          <option value="replace">replace · swap ingredient</option>
          <option value="none">none · no stock effect</option>
        </select>
      </Field>
      <Field label="วัตถุดิบเป้าหมาย · Target item" htmlFor="targetItemId">
        <select id="targetItemId" name="targetItemId" defaultValue="" className={fieldClass}>
          <option value="">— none —</option>
          {items.map((it) => (
            <option key={it.id} value={it.id}>
              {it.name ?? it.item_kind} · {it.base_unit}
            </option>
          ))}
        </select>
      </Field>
      <Field label="แทนด้วย (replace) · New item" htmlFor="newItemId">
        <select id="newItemId" name="newItemId" defaultValue="" className={fieldClass}>
          <option value="">— none —</option>
          {items.map((it) => (
            <option key={it.id} value={it.id}>
              {it.name ?? it.item_kind} · {it.base_unit}
            </option>
          ))}
        </select>
      </Field>
      <Field label="จำนวน · Quantity" htmlFor="quantity">
        <input id="quantity" name="quantity" type="number" step="0.001" min="0" className={fieldClass} />
      </Field>
      <Field label="หน่วย · Unit" htmlFor="unit">
        <input id="unit" name="unit" placeholder="ml / g" className={fieldClass} />
      </Field>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-3">
        <SubmitButton>เพิ่มผล · Add effect</SubmitButton>
        <FormMessage ok={state.ok} error={state.error} />
        <span className="text-xs text-muted">
          set_qty / add → target + quantity · replace → target + new item + quantity · none → ไม่ต้องกรอก
        </span>
      </div>
    </form>
  );
}
