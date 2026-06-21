"use client";

import { useActionState, useEffect, useState } from "react";
import type { Product } from "@/server/services/types";
import {
  deleteProductAction,
  toggleProductAction,
  updateProductAction,
  type FormState,
} from "../actions";

const init: FormState = {};
const inputCls = "rounded-md border border-border bg-bg px-2 py-1 text-sm outline-none focus:border-accent";

export function ProductRow({ product: p }: { product: Product }) {
  const [editing, setEditing] = useState(false);
  const [editState, editAction] = useActionState(updateProductAction, init);
  const [delState, delAction] = useActionState(deleteProductAction, init);

  useEffect(() => {
    if (editState.ok) setEditing(false);
  }, [editState.ok]);

  if (editing) {
    return (
      <tr className="border-b border-border/60">
        <td colSpan={6} className="py-2">
          <form action={editAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={p.id} />
            <input name="sku" defaultValue={p.sku} placeholder="SKU" className={`${inputCls} w-28`} />
            <input name="name" defaultValue={p.name} placeholder="Name" className={inputCls} />
            <select name="category" defaultValue={p.category} className={inputCls}>
              <option value="beverage">beverage</option>
              <option value="bakery">bakery</option>
            </select>
            <span className="text-xs text-muted">type: {p.type} (fixed)</span>
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
      <td className="py-2 pr-3 font-mono text-xs">{p.sku}</td>
      <td className="py-2 pr-3">{p.name}</td>
      <td className="py-2 pr-3">
        <span className="inline-flex items-center rounded-full bg-accent/20 px-2.5 py-0.5 text-xs font-medium text-fg">
          {p.category}
        </span>
      </td>
      <td className="py-2 pr-3 text-muted">{p.type}</td>
      <td className="py-2 pr-3">
        {p.is_active ? (
          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
            active
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
            inactive
          </span>
        )}
      </td>
      <td className="py-2">
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => setEditing(true)}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-bg"
          >
            แก้ไข · Edit
          </button>
          <form action={toggleProductAction}>
            <input type="hidden" name="productId" value={p.id} />
            <input type="hidden" name="isActive" value={p.is_active ? "false" : "true"} />
            <button
              type="submit"
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-bg"
            >
              {p.is_active ? "ปิดการขาย" : "เปิดการขาย"}
            </button>
          </form>
          <form
            action={delAction}
            onSubmit={(e) => {
              if (!confirm(`ลบสินค้า "${p.name}" ? · Delete product? (deactivate is safer)`)) e.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={p.id} />
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
