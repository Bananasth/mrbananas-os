"use client";

import { useActionState, useEffect, useState } from "react";
import type { InventoryLot } from "@/server/services/types";
import { displayUnit } from "@/server/services/unit-convert";
import { adjustStockAction, recordWasteAction, type FormState } from "./actions";

const init: FormState = {};
const inputCls = "rounded-md border border-border bg-bg px-2 py-1 text-sm outline-none focus:border-accent";

export function LotRow({ lot, itemName }: { lot: InventoryLot; itemName: string }) {
  const [mode, setMode] = useState<"adjust" | "waste" | null>(null);
  const [adjState, adjAction] = useActionState(adjustStockAction, init);
  const [wasteState, wasteAction] = useActionState(recordWasteAction, init);

  useEffect(() => {
    if (adjState.ok || wasteState.ok) setMode(null);
  }, [adjState.ok, wasteState.ok]);

  return (
    <tr className="border-b border-border/60 align-top">
      <td className="py-2 pr-3">{itemName}</td>
      <td className="py-2 pr-3 tabular-nums">
        {lot.qty_on_hand} {displayUnit(lot.unit)}
      </td>
      <td className="py-2 pr-3 text-muted">{lot.expires_at ? lot.expires_at.slice(0, 10) : "—"}</td>
      <td className="py-2">
        {mode === null ? (
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => setMode("adjust")} className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-bg">
              ปรับยอด · Adjust
            </button>
            <button onClick={() => setMode("waste")} className="rounded-md border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50">
              ของเสีย · Waste
            </button>
          </div>
        ) : mode === "adjust" ? (
          <form action={adjAction} className="flex flex-wrap items-center justify-end gap-2">
            <input type="hidden" name="lotId" value={lot.id} />
            <input name="newQty" type="number" step="0.001" min="0" defaultValue={lot.qty_on_hand} required placeholder="new qty" className={`${inputCls} w-24`} />
            <input name="reason" required placeholder="เหตุผล · reason" className={`${inputCls} w-44`} />
            <button type="submit" className="rounded-md bg-accent px-3 py-1 text-sm font-semibold text-fg hover:opacity-90">
              บันทึก · Save
            </button>
            <button type="button" onClick={() => setMode(null)} className="rounded-md border border-border px-3 py-1 text-sm hover:bg-bg">
              ยกเลิก
            </button>
            {adjState.error ? <span className="w-full text-right text-xs text-red-600">{adjState.error}</span> : null}
          </form>
        ) : (
          <form action={wasteAction} className="flex flex-wrap items-center justify-end gap-2">
            <input type="hidden" name="lotId" value={lot.id} />
            <input name="qty" type="number" step="0.001" min="0" required placeholder="waste qty" className={`${inputCls} w-24`} />
            <input name="reason" required placeholder="เหตุผล · reason" className={`${inputCls} w-44`} />
            <button type="submit" className="rounded-md bg-amber-500 px-3 py-1 text-sm font-semibold text-white hover:opacity-90">
              ของเสีย · Waste
            </button>
            <button type="button" onClick={() => setMode(null)} className="rounded-md border border-border px-3 py-1 text-sm hover:bg-bg">
              ยกเลิก
            </button>
            {wasteState.error ? <span className="w-full text-right text-xs text-red-600">{wasteState.error}</span> : null}
          </form>
        )}
      </td>
    </tr>
  );
}
