"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import type { Recipe } from "@/server/services/types";
import { deleteRecipeAction, updateRecipeAction, type FormState } from "../actions";

const init: FormState = {};
const inputCls = "rounded-md border border-border bg-bg px-2 py-1 text-sm outline-none focus:border-accent";

export function RecipeRow({ recipe: r, productLabel }: { recipe: Recipe; productLabel: string }) {
  const [editing, setEditing] = useState(false);
  const [editState, editAction] = useActionState(updateRecipeAction, init);
  const [delState, delAction] = useActionState(deleteRecipeAction, init);

  useEffect(() => {
    if (editState.ok) setEditing(false);
  }, [editState.ok]);

  if (editing) {
    return (
      <tr className="border-b border-border/60">
        <td colSpan={3} className="py-2">
          <form action={editAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={r.id} />
            <input name="name" defaultValue={r.name} className={inputCls} />
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
      <td className="py-2 pr-3 font-medium">{r.name}</td>
      <td className="py-2 pr-3 text-muted">{productLabel}</td>
      <td className="py-2">
        <div className="flex items-center justify-end gap-2">
          <Link
            href={`/admin/recipes/${r.id}`}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-bg"
          >
            เวอร์ชัน · Versions
          </Link>
          <button
            onClick={() => setEditing(true)}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-bg"
          >
            แก้ไข · Edit
          </button>
          <form
            action={delAction}
            onSubmit={(e) => {
              if (!confirm(`ลบสูตร "${r.name}" และเวอร์ชันทั้งหมด? · Delete recipe + all versions?`)) e.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={r.id} />
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
