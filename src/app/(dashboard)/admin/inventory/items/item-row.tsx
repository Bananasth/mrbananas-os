"use client";

import { useActionState, useEffect, useState } from "react";
import { ITEM_TYPES, type InventoryItem } from "@/server/services/types";
import { deleteInventoryItemAction, updateInventoryItemAction, type FormState } from "../../actions";

const init: FormState = {};
const inputCls = "rounded-md border border-border bg-bg px-2 py-1 text-sm outline-none focus:border-accent";

export function ItemRow({ item }: { item: InventoryItem }) {
  const [editing, setEditing] = useState(false);
  const [editState, editAction] = useActionState(updateInventoryItemAction, init);
  const [delState, delAction] = useActionState(deleteInventoryItemAction, init);

  useEffect(() => {
    if (editState.ok) setEditing(false);
  }, [editState.ok]);

  if (editing) {
    return (
      <tr className="border-b border-border/60">
        <td colSpan={5} className="py-2">
          <form action={editAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={item.id} />
            <select name="itemType" defaultValue={item.item_type ?? "RM"} className={inputCls}>
              {ITEM_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.value}
                </option>
              ))}
            </select>
            <input name="name" defaultValue={item.name ?? ""} placeholder="Name" className={inputCls} />
            <input name="sku" defaultValue={item.sku ?? ""} placeholder="SKU" className={`${inputCls} w-28`} />
            <input name="baseUnit" defaultValue={item.base_unit} placeholder="Unit" className={`${inputCls} w-20`} />
            <button type="submit" className="rounded-md bg-accent px-3 py-1 text-sm font-semibold text-fg hover:opacity-90">
              บันทึก · Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-md border border-border px-3 py-1 text-sm hover:bg-bg"
            >
              ยกเลิก · Cancel
            </button>
            {editState.error ? <span className="text-sm text-red-600">{editState.error}</span> : null}
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-border/60">
      <td className="py-2 pr-3">{item.name ?? <span className="text-muted">—</span>}</td>
      <td className="py-2 pr-3 font-mono text-xs">{item.sku ?? "—"}</td>
      <td className="py-2 pr-3">
        <span className="inline-flex items-center rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-700">
          {item.item_type ?? item.item_kind ?? "—"}
        </span>
      </td>
      <td className="py-2 pr-3">{item.base_unit}</td>
      <td className="py-2">
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => setEditing(true)}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-bg"
          >
            แก้ไข · Edit
          </button>
          <form
            action={delAction}
            onSubmit={(e) => {
              if (!confirm(`ลบ "${item.name ?? item.sku ?? ""}" ? · Delete this item?`)) e.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={item.id} />
            <button
              type="submit"
              className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              ลบ · Delete
            </button>
          </form>
        </div>
        {delState.error ? <p className="mt-1 text-right text-xs text-red-600">{delState.error}</p> : null}
      </td>
    </tr>
  );
}
