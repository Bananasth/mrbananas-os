"use client";

import { useActionState } from "react";
import type { ComplaintableItem } from "@/server/services/qr-admin";
import { fileComplaintAction, type CState } from "./actions";

const sel = "rounded-md border border-border bg-bg px-2 py-1.5 text-sm";
const CATEGORIES = ["taste", "temperature", "wrong_item", "missing_modifier", "hygiene", "packaging", "slow_service", "other"];

export function FileComplaintForm({ items }: { items: ComplaintableItem[] }) {
  const [state, action, pending] = useActionState<CState, FormData>(fileComplaintAction, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-xs text-muted">
        รายการ · Item
        <select name="order_item_id" required className={`${sel} w-56`}>
          <option value="">— เลือก · select —</option>
          {items.map((it) => <option key={it.orderItemId} value={it.orderItemId}>{it.label}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        หมวด · Category
        <select name="category" className={sel}>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        ระดับ · Severity
        <select name="severity" defaultValue="medium" className={sel}><option>low</option><option>medium</option><option>high</option></select>
      </label>
      <input name="description" placeholder="รายละเอียด · details" className={`${sel} w-48`} />
      <button type="submit" disabled={pending || items.length === 0}
        className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-fg hover:opacity-90 disabled:opacity-50">
        แจ้ง · File
      </button>
      {state.error ? <span className="w-full text-xs text-red-600">{state.error}</span> : null}
      {state.ok ? <span className="w-full text-xs text-green-700">บันทึกแล้ว · Filed.</span> : null}
    </form>
  );
}
