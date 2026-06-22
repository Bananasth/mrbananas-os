"use client";

import { useEffect, useRef, useState } from "react";
import type { QrStatus } from "@/server/services/qr-public";
import { statusAction } from "./actions";

const baht = (s: number) => `฿${(s / 100).toFixed(2)}`;
const TERMINAL = new Set(["completed", "expired", "cancelled"]);

// order-level status -> friendly label + tone
const ORDER: Record<string, { label: string; cls: string }> = {
  pending_payment: { label: "รอชำระเงิน · Awaiting payment", cls: "bg-stone-100 text-stone-700" },
  order_received: { label: "รับออเดอร์แล้ว · Order received", cls: "bg-blue-100 text-blue-700" },
  in_progress: { label: "กำลังทำ · In progress", cls: "bg-amber-100 text-amber-700" },
  ready_for_pickup: { label: "พร้อมรับ · Ready for pickup", cls: "bg-green-100 text-green-700" },
  completed: { label: "รับแล้ว · Completed", cls: "bg-green-100 text-green-700" },
  needs_review: { label: "กำลังตรวจสอบ · Being reviewed", cls: "bg-amber-100 text-amber-700" },
  expired: { label: "หมดเวลา · Expired", cls: "bg-red-100 text-red-700" },
  cancelled: { label: "ยกเลิก · Cancelled", cls: "bg-red-100 text-red-700" },
};
const ITEM: Record<string, string> = {
  pending: "รอ", waiting: "รอคิว", claimed: "รับแล้ว", preparing: "กำลังทำ",
  qc_required: "ตรวจ", qc_passed: "พร้อม", completed: "เสร็จ",
};

export function TrackClient({ token, initial }: { token: string; initial: QrStatus }) {
  const [status, setStatus] = useState<QrStatus>(initial);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function poll() {
      const res = await statusAction(token);
      if (res.ok && res.data) {
        setStatus(res.data);
        if (res.data.status && TERMINAL.has(res.data.status) && timer.current) clearInterval(timer.current);
      }
    }
    timer.current = setInterval(poll, 4000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [token]);

  if (!status.found) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
        <span className="text-4xl" aria-hidden>🍌</span>
        <h1 className="mt-4 text-lg font-bold">ไม่พบออเดอร์ · Order not found</h1>
      </div>
    );
  }

  const o = ORDER[status.status ?? ""] ?? { label: status.status ?? "—", cls: "bg-stone-100 text-stone-700" };

  return (
    <div className="mx-auto max-w-md px-5 py-8">
      <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        <p className="text-xs uppercase tracking-wide text-muted">หมายเลขคิว · Queue</p>
        <p className="my-1 text-6xl font-bold tabular-nums">{status.queue_number ?? "—"}</p>
        <span className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${o.cls}`}>{o.label}</span>
        {status.pickup_instruction ? <p className="mt-3 text-sm text-muted">{status.pickup_instruction}</p> : null}
      </div>

      <div className="mt-5 space-y-2">
        {(status.items ?? []).map((it, i) => (
          <div key={i} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm">
            <span>{it.name}{it.qty > 1 ? ` ×${it.qty}` : ""}</span>
            <span className="text-muted">{ITEM[it.status] ?? it.status}</span>
          </div>
        ))}
      </div>

      {status.total != null ? <p className="mt-4 text-center text-sm text-muted">ยอดรวม · Total {baht(status.total)}</p> : null}
      <p className="mt-2 text-center text-xs text-muted">อัปเดตอัตโนมัติ · Updates live every few seconds.</p>
    </div>
  );
}
