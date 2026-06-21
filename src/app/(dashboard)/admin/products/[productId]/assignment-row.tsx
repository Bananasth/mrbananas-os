"use client";

import { useActionState } from "react";
import type { ModifierGroup } from "@/server/services/types";
import { assignGroupAction, unassignGroupAction, type FormState } from "./actions";

const init: FormState = {};

export function AssignmentRow({
  productId,
  group: g,
  sortOrder,
}: {
  productId: string;
  group: ModifierGroup;
  sortOrder: number;
}) {
  const [sortState, sortAction] = useActionState(assignGroupAction, init);
  return (
    <tr className="border-b border-border/60">
      <td className="py-2 pr-3 font-medium">
        {g.name}
        {g.is_required ? <span className="ml-1 text-xs text-red-600" title="required">*</span> : null}
      </td>
      <td className="py-2 pr-3 text-muted">
        {g.selection_type} · {g.display_type}
      </td>
      <td className="py-2 pr-3">
        {g.is_active ? (
          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">active</span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">inactive</span>
        )}
      </td>
      <td className="py-2 pr-3">
        <form action={sortAction} className="flex items-center gap-1">
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="modifierGroupId" value={g.id} />
          <input
            name="sortOrder"
            type="number"
            defaultValue={sortOrder}
            className="w-16 rounded-md border border-border bg-bg px-2 py-1 text-sm outline-none focus:border-accent"
          />
          <button type="submit" className="rounded-md border border-border px-2 py-1 text-xs hover:bg-bg" title="save order">
            ↕ บันทึก
          </button>
        </form>
        {sortState.error ? <p className="mt-1 text-xs text-red-600">{sortState.error}</p> : null}
      </td>
      <td className="py-2 text-right">
        <form
          action={unassignGroupAction}
          onSubmit={(e) => {
            if (!confirm(`เอากลุ่ม "${g.name}" ออกจากสินค้านี้? · Remove group from product?`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="modifierGroupId" value={g.id} />
          <button
            type="submit"
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            เอาออก · Remove
          </button>
        </form>
      </td>
    </tr>
  );
}
