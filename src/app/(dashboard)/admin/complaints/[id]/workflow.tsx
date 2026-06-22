"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setStatusAction, assignAction, resolveAction } from "../actions";

const NEXT: Record<string, { label: string; status: string }[]> = {
  new: [{ label: "คัดกรอง · Triage", status: "triaged" }, { label: "ปฏิเสธ · Reject", status: "rejected" }],
  triaged: [{ label: "สอบสวน · Investigate", status: "investigating" }, { label: "ปฏิเสธ · Reject", status: "rejected" }],
  investigating: [{ label: "ดำเนินการแล้ว · Action taken", status: "action_taken" }, { label: "ปฏิเสธ · Reject", status: "rejected" }],
  resolved: [{ label: "ปิด · Close", status: "closed" }],
};
const RESOLUTIONS = ["refund", "remake", "replacement", "apology", "none"];
const btn = "rounded-md border border-border px-3 py-1.5 text-sm hover:bg-bg disabled:opacity-40";
const btnPrimary = "rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-fg hover:opacity-90 disabled:opacity-40";

export function ComplaintWorkflow({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [resType, setResType] = useState("none");
  const [resNote, setResNote] = useState("");
  const [contacted, setContacted] = useState(false);

  const terminal = status === "closed" || status === "rejected";
  const canResolve = status === "investigating" || status === "action_taken";

  function act(fn: () => Promise<{ ok?: boolean; error?: string }>) {
    start(async () => {
      const res = await fn();
      if (!res.ok) setMsg(res.error ?? "error");
      else { setMsg(null); router.refresh(); }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(NEXT[status] ?? []).map((t) => (
          <button key={t.status} className={btn} disabled={pending} onClick={() => act(() => setStatusAction(id, t.status))}>
            {t.label}
          </button>
        ))}
        {!terminal ? (
          <button className={btn} disabled={pending} onClick={() => act(() => assignAction(id))}>มอบหมายให้ฉัน · Assign to me</button>
        ) : null}
      </div>

      {canResolve ? (
        <div className="rounded-lg border border-border p-3">
          <p className="mb-2 text-sm font-medium">แก้ไขเรื่อง · Resolve</p>
          <div className="flex flex-wrap items-end gap-2">
            <select value={resType} onChange={(e) => setResType(e.target.value)} className="rounded-md border border-border bg-bg px-2 py-1.5 text-sm">
              {RESOLUTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <input value={resNote} onChange={(e) => setResNote(e.target.value)} placeholder="หมายเหตุ · note"
              className="w-56 rounded-md border border-border bg-bg px-2 py-1.5 text-sm" />
            <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={contacted} onChange={(e) => setContacted(e.target.checked)} /> ติดต่อลูกค้าแล้ว · contacted</label>
            <button className={btnPrimary} disabled={pending} onClick={() => act(() => resolveAction(id, resType, resNote.trim() || null, contacted))}>
              บันทึกการแก้ไข · Resolve
            </button>
          </div>
        </div>
      ) : null}

      {terminal ? <p className="text-sm text-muted">เรื่องนี้ปิดแล้ว · This complaint is closed.</p> : null}
      {msg ? <p className="text-sm text-red-600">{msg}</p> : null}
    </div>
  );
}
