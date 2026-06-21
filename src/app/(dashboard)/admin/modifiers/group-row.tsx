"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import type { ModifierGroup } from "@/server/services/types";
import { deleteGroupAction, toggleGroupActiveAction, updateGroupAction, type FormState } from "./actions";
import { fieldClass } from "../_components/forms";

const init: FormState = {};
const btn = "rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-bg";

export function GroupRow({ group: g }: { group: ModifierGroup }) {
  const [editing, setEditing] = useState(false);
  const [editState, editAction] = useActionState(updateGroupAction, init);
  const [delState, delAction] = useActionState(deleteGroupAction, init);
  useEffect(() => {
    if (editState.ok) setEditing(false);
  }, [editState.ok]);

  if (editing) {
    return (
      <tr className="border-b border-border/60">
        <td colSpan={5} className="py-2">
          <form action={editAction} className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
            <input type="hidden" name="id" value={g.id} />
            <input name="name" defaultValue={g.name} placeholder="Name" className={fieldClass} />
            <input name="description" defaultValue={g.description ?? ""} placeholder="Description" className={fieldClass} />
            <select name="selectionType" defaultValue={g.selection_type} className={fieldClass}>
              <option value="single">single</option>
              <option value="multiple">multiple</option>
            </select>
            <select name="displayType" defaultValue={g.display_type} className={fieldClass}>
              <option value="radio">radio</option>
              <option value="checkbox">checkbox</option>
              <option value="button">button</option>
              <option value="dropdown">dropdown</option>
            </select>
            <input name="minSelect" type="number" defaultValue={g.min_select} placeholder="min" className={fieldClass} />
            <input name="maxSelect" type="number" defaultValue={g.max_select} placeholder="max" className={fieldClass} />
            <input name="sortOrder" type="number" defaultValue={g.sort_order} placeholder="sort" className={fieldClass} />
            <label className="flex items-center gap-2">
              <input type="checkbox" name="isRequired" defaultChecked={g.is_required} className="h-4 w-4" />
              <span className="text-sm">Required</span>
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
        {g.name}
        {g.is_required ? <span className="ml-1 text-xs text-red-600">*</span> : null}
      </td>
      <td className="py-2 pr-3 text-muted">
        {g.selection_type} · {g.display_type}
      </td>
      <td className="py-2 pr-3 text-muted">
        {g.min_select}–{g.max_select}
      </td>
      <td className="py-2 pr-3">
        {g.is_active ? (
          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">active</span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">inactive</span>
        )}
      </td>
      <td className="py-2">
        <div className="flex items-center justify-end gap-2">
          <Link href={`/admin/modifiers/${g.id}`} className={btn}>
            ตัวเลือก · Options
          </Link>
          <button onClick={() => setEditing(true)} className={btn}>
            แก้ไข · Edit
          </button>
          <form action={toggleGroupActiveAction}>
            <input type="hidden" name="id" value={g.id} />
            <input type="hidden" name="isActive" value={g.is_active ? "false" : "true"} />
            <button type="submit" className={btn}>
              {g.is_active ? "ปิด" : "เปิด"}
            </button>
          </form>
          <form
            action={delAction}
            onSubmit={(e) => {
              if (!confirm(`ลบกลุ่ม "${g.name}" และตัวเลือกทั้งหมด? · Delete group + options?`)) e.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={g.id} />
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
