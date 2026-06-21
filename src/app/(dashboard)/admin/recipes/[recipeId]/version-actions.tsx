"use client";

import { useActionState, useState } from "react";
import type { RecipeVersion } from "@/server/services/types";
import {
  deleteRecipeVersionAction,
  retireVersionAction,
  updateRecipeVersionAction,
  type FormState,
} from "../../actions";

const init: FormState = {};
const inputCls = "w-24 rounded-md border border-border bg-bg px-2 py-1 text-xs outline-none focus:border-accent";

export function VersionActions({ version: v, recipeId }: { version: RecipeVersion; recipeId: string }) {
  const [editing, setEditing] = useState(false);
  const [editState, editAction] = useActionState(updateRecipeVersionAction, init);
  const [retState, retAction] = useActionState(retireVersionAction, init);
  const [delState, delAction] = useActionState(deleteRecipeVersionAction, init);

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {v.status === "draft" ? (
          <button
            onClick={() => setEditing((s) => !s)}
            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-bg"
          >
            แก้ไข · Edit
          </button>
        ) : null}
        {v.status === "active" ? (
          <form action={retAction}>
            <input type="hidden" name="id" value={v.id} />
            <input type="hidden" name="recipeId" value={recipeId} />
            <button
              type="submit"
              className="rounded-md border border-amber-300 px-2 py-1 text-xs text-amber-700 hover:bg-amber-50"
            >
              เลิกใช้ · Retire
            </button>
          </form>
        ) : (
          <form
            action={delAction}
            onSubmit={(e) => {
              if (!confirm("ลบเวอร์ชันนี้? · Delete this version?")) e.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={v.id} />
            <input type="hidden" name="recipeId" value={recipeId} />
            <button
              type="submit"
              className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
            >
              ลบ · Delete
            </button>
          </form>
        )}
      </div>
      {editing && v.status === "draft" ? (
        <form action={editAction} className="flex items-center gap-1">
          <input type="hidden" name="id" value={v.id} />
          <input type="hidden" name="recipeId" value={recipeId} />
          <input name="shelfLifeHours" defaultValue={v.shelf_life_hours ?? ""} placeholder="shelf(h)" className={inputCls} />
          <input name="yieldQty" defaultValue={v.yield_qty ?? ""} placeholder="yield" className={inputCls} />
          <button type="submit" className="rounded-md bg-accent px-2 py-1 text-xs font-semibold text-fg hover:opacity-90">
            บันทึก
          </button>
        </form>
      ) : null}
      {retState.error || delState.error || editState.error ? (
        <p className="text-xs text-red-600">{retState.error ?? delState.error ?? editState.error}</p>
      ) : null}
    </div>
  );
}
