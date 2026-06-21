"use client";

import { useActionState, useEffect, useState } from "react";
import type { ModifierOption } from "@/server/services/types";
import { deleteOptionAction, toggleOptionActiveAction, updateOptionAction, type FormState } from "../actions";
import { fieldClass } from "../../_components/forms";
import { baht } from "../../_components/format";

const init: FormState = {};
const btn = "rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-bg";

export function OptionRow({ option: o, groupId }: { option: ModifierOption; groupId: string }) {
  const [editing, setEditing] = useState(false);
  const [editState, editAction] = useActionState(updateOptionAction, init);
  const [delState, delAction] = useActionState(deleteOptionAction, init);
  useEffect(() => {
    if (editState.ok) setEditing(false);
  }, [editState.ok]);

  if (editing) {
    return (
      <tr className="border-b border-border/60">
        <td colSpan={5} className="py-2">
          <form action={editAction} className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
            <input type="hidden" name="id" value={o.id} />
            <input type="hidden" name="groupId" value={groupId} />
            <input name="name" defaultValue={o.name} placeholder="Name" className={fieldClass} />
            <input name="priceAdjustment" type="number" step="0.01" defaultValue={(o.price_adjustment / 100).toFixed(2)} placeholder="price" className={fieldClass} />
            <input name="code" defaultValue={o.code ?? ""} placeholder="code" className={fieldClass} />
            <input name="imageUrl" defaultValue={o.image_url ?? ""} placeholder="image url" className={fieldClass} />
            <input name="sortOrder" type="number" defaultValue={o.sort_order} placeholder="sort" className={fieldClass} />
            <label className="flex items-center gap-2">
              <input type="checkbox" name="isDefault" defaultChecked={o.is_default} className="h-4 w-4" />
              <span className="text-sm">Default</span>
            </label>
            <div className="flex items-center gap-2 sm:col-span-3 lg:col-span-4">
              <button type="submit" className="rounded-md bg-accent px-3 py-1 text-sm font-semibold text-fg hover:opacity-90">
                บันทึก · Save
              </button>
              <button type="button" onClick={() => setEditing(false)} className="rounded-md border border-border px-3 py-1 text-sm hover:bg-bg">
                ยกเลิก · Cancel
              </button>
              {editState.error ? <span className="text-sm text-red-600">{editState.error}</span> : null}
            </div>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-border/60">
      <td className="py-2 pr-3 font-medium">
        {o.name}
        {o.is_default ? <span className="ml-1 text-xs text-muted">(default)</span> : null}
      </td>
      <td className="py-2 pr-3 tabular-nums">{o.price_adjustment === 0 ? "—" : baht(o.price_adjustment)}</td>
      <td className="py-2 pr-3 font-mono text-xs">{o.code ?? "—"}</td>
      <td className="py-2 pr-3">
        {o.is_active ? (
          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">active</span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">inactive</span>
        )}
      </td>
      <td className="py-2">
        <div className="flex items-center justify-end gap-2">
          <button onClick={() => setEditing(true)} className={btn}>
            แก้ไข · Edit
          </button>
          <form action={toggleOptionActiveAction}>
            <input type="hidden" name="id" value={o.id} />
            <input type="hidden" name="groupId" value={groupId} />
            <input type="hidden" name="isActive" value={o.is_active ? "false" : "true"} />
            <button type="submit" className={btn}>
              {o.is_active ? "ปิด" : "เปิด"}
            </button>
          </form>
          <form
            action={delAction}
            onSubmit={(e) => {
              if (!confirm(`ลบตัวเลือก "${o.name}" ? · Delete option?`)) e.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={o.id} />
            <input type="hidden" name="groupId" value={groupId} />
            <button type="submit" className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50">
              ลบ · Delete
            </button>
          </form>
        </div>
        {delState.error ? <p className="mt-1 text-right text-xs text-red-600">{delState.error}</p> : null}
      </td>
    </tr>
  );
}
