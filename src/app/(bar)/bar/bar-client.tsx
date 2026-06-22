"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BarItem, BarEmployee, TimelineRow } from "@/server/services/qr-staff";
import {
  claimAction, startPreparingAction, startQcAction, passQcAction, completeAction,
  qcFailAction, uploadPhotoAction, openRecipeAction, closeRecipeAction, timelineAction,
  type ActionState,
} from "./actions";

const LANES: { key: string; label: string }[] = [
  { key: "waiting", label: "รอ · Waiting" },
  { key: "claimed", label: "รับแล้ว · Claimed" },
  { key: "preparing", label: "กำลังทำ · Preparing" },
  { key: "qc_required", label: "ตรวจ · QC" },
  { key: "qc_passed", label: "พร้อม · Ready" },
  { key: "completed", label: "เสร็จ · Completed" },
];

const DEVICE_NAME = "Bar station";
const btn = "rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-bg disabled:opacity-40";
const btnPrimary = "rounded-md bg-accent px-2.5 py-1 text-xs font-semibold text-fg transition-opacity hover:opacity-90 disabled:opacity-40";

type Drawer = { kind: "recipe" | "method"; content: unknown; accessId: string | null; item: string };

export function BarClient({ items, employees }: { items: BarItem[]; employees: BarEmployee[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [emp, setEmp] = useState<string>(employees[0]?.id ?? "");
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "err" | "ok"; text: string } | null>(null);
  const [drawer, setDrawer] = useState<Drawer | null>(null);
  const [timeline, setTimeline] = useState<{ item: string; rows: TimelineRow[] } | null>(null);

  useEffect(() => {
    let d = localStorage.getItem("bar-device-id");
    if (!d) { d = crypto.randomUUID(); localStorage.setItem("bar-device-id", d); }
    setDeviceId(d);
  }, []);

  const empName = (id: string | null) => (id ? employees.find((e) => e.id === id)?.name ?? id.slice(0, 8) : "—");

  function run(action: () => Promise<ActionState>) {
    if (!emp) { setMsg({ type: "err", text: "เลือกพนักงานก่อน · Select who you are first." }); return; }
    start(async () => {
      const res = await action();
      if (!res.ok) setMsg({ type: "err", text: res.error ?? "error" });
      else { setMsg(null); router.refresh(); }
    });
  }

  function openDrawer(item: string, kind: "recipe" | "method") {
    if (!emp) { setMsg({ type: "err", text: "เลือกพนักงานก่อน · Select who you are first." }); return; }
    start(async () => {
      const res = await openRecipeAction(item, emp, kind, deviceId, DEVICE_NAME);
      if (!res.ok) { setMsg({ type: "err", text: res.error ?? "error" }); return; }
      const d = res.data as { outcome: string; content: unknown; access_id: string | null };
      if (d.outcome !== "granted") { setMsg({ type: "err", text: `${kind}: ${d.outcome.replace(/_/g, " ")}` }); return; }
      setMsg(null);
      setDrawer({ kind, content: d.content, accessId: d.access_id, item });
    });
  }
  function closeDrawer() {
    if (drawer?.accessId) void closeRecipeAction(drawer.accessId);
    setDrawer(null);
  }

  function openTimeline(item: string) {
    start(async () => {
      const res = await timelineAction(item);
      if (!res.ok) { setMsg({ type: "err", text: res.error ?? "error" }); return; }
      setTimeline({ item, rows: res.rows ?? [] });
    });
  }

  function failQc(item: string) {
    const reason = window.prompt("เหตุผล · QC fail reason (sends the item back to rework):");
    if (!reason) return;
    run(() => qcFailAction(item, emp, reason, deviceId, DEVICE_NAME));
  }
  function uploadPhoto(item: string) {
    const url = window.prompt("Completion photo URL:", `smoke://photo/${item}`);
    if (!url) return;
    run(() => uploadPhotoAction(item, emp, url, deviceId, DEVICE_NAME));
  }

  const byLane = (k: string) => items.filter((i) => i.prepStatus === k);

  function actions(i: BarItem) {
    switch (i.prepStatus) {
      case "waiting":
        return <button className={btnPrimary} disabled={pending} onClick={() => run(() => claimAction(i.orderItemId, emp, deviceId, DEVICE_NAME))}>รับงาน · Claim</button>;
      case "claimed":
        return (<>
          <button className={btn} disabled={pending} onClick={() => openDrawer(i.orderItemId, "recipe")}>Recipe</button>
          <button className={btn} disabled={pending} onClick={() => openDrawer(i.orderItemId, "method")}>Method</button>
          <button className={btnPrimary} disabled={pending} onClick={() => run(() => startPreparingAction(i.orderItemId, emp, deviceId, DEVICE_NAME))}>เริ่มทำ · Start</button>
        </>);
      case "preparing":
        return (<>
          <button className={btn} disabled={pending} onClick={() => openDrawer(i.orderItemId, "recipe")}>Recipe</button>
          <button className={btn} disabled={pending} onClick={() => openDrawer(i.orderItemId, "method")}>Method</button>
          <button className={btnPrimary} disabled={pending} onClick={() => run(() => startQcAction(i.orderItemId, emp, deviceId, DEVICE_NAME))}>ส่งตรวจ · Start QC</button>
        </>);
      case "qc_required":
        return (<>
          <button className={btnPrimary} disabled={pending} onClick={() => run(() => passQcAction(i.orderItemId, emp, deviceId, DEVICE_NAME))}>ผ่าน · Pass</button>
          <button className={btn} disabled={pending} onClick={() => failQc(i.orderItemId)}>ไม่ผ่าน · Fail</button>
        </>);
      case "qc_passed":
        return i.hasPhoto
          ? <button className={btnPrimary} disabled={pending} onClick={() => run(() => completeAction(i.orderItemId, emp, deviceId, DEVICE_NAME))}>เสร็จ · Complete</button>
          : <button className={btn} disabled={pending} onClick={() => uploadPhoto(i.orderItemId)}>📷 Upload photo</button>;
      default:
        return <span className="text-xs text-muted">{i.orderStatus}</span>;
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold">สถานีบาร์ · Bar Station</h1>
        <div className="flex items-center gap-2 text-sm">
          <label className="text-muted">ฉันคือ · I am</label>
          <select value={emp} onChange={(e) => setEmp(e.target.value)} className="rounded-md border border-border bg-bg px-2 py-1">
            {employees.length === 0 ? <option value="">— no employees —</option> : null}
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name}{e.trainingMode ? " (training)" : ""}</option>
            ))}
          </select>
          <button className={btn} disabled={pending} onClick={() => router.refresh()}>↻ Refresh</button>
        </div>
      </div>

      {msg ? <p className={`text-sm ${msg.type === "err" ? "text-red-600" : "text-green-700"}`}>{msg.text}</p> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {LANES.map((lane) => {
          const laneItems = byLane(lane.key);
          return (
            <div key={lane.key} className="rounded-lg border border-border bg-card/40 p-2">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-xs font-semibold">{lane.label}</span>
                <span className="text-xs text-muted">{laneItems.length}</span>
              </div>
              <div className="space-y-2">
                {laneItems.map((i) => (
                  <div key={i.orderItemId} className="rounded-md border border-border bg-card p-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">#{i.queueNumber ?? "—"}</span>
                      {i.reworkCount > 0 ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">rework ×{i.reworkCount}</span> : null}
                    </div>
                    <div className="truncate text-sm">{i.productName}{i.qty > 1 ? ` ×${i.qty}` : ""}</div>
                    <div className="mt-0.5 text-[11px] text-muted">
                      attempt {i.attemptNo}{i.claimedBy ? ` · ${empName(i.claimedBy)}` : ""}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {actions(i)}
                      <button className={btn} disabled={pending} onClick={() => openTimeline(i.orderItemId)}>เส้นเวลา · Timeline</button>
                    </div>
                  </div>
                ))}
                {laneItems.length === 0 ? <p className="px-1 py-2 text-[11px] text-muted">—</p> : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* recipe / method drawer */}
      {drawer ? (
        <div className="fixed inset-0 z-30 flex justify-end bg-black/30" onClick={closeDrawer}>
          <div className="h-full w-full max-w-md overflow-y-auto bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold capitalize">{drawer.kind} · #{items.find((i) => i.orderItemId === drawer.item)?.queueNumber ?? ""}</h2>
              <button className={btn} onClick={closeDrawer}>ปิด · Close</button>
            </div>
            <p className="mb-3 text-xs text-amber-700">ดูได้ครั้งเดียว · One-time view — this is now logged and cannot be reopened.</p>
            {drawer.kind === "recipe" ? (
              <ul className="space-y-1 text-sm">
                {(drawer.content as Array<{ name: string | null; quantity: number; unit: string }>).map((ln, idx) => (
                  <li key={idx} className="flex justify-between border-b border-border/60 py-1">
                    <span>{ln.name ?? "item"}</span><span className="tabular-nums text-muted">{ln.quantity} {ln.unit}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="whitespace-pre-wrap text-sm">{String(drawer.content) || "— no method recorded —"}</p>
            )}
          </div>
        </div>
      ) : null}

      {/* timeline modal */}
      {timeline ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4" onClick={() => setTimeline(null)}>
          <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold">เส้นเวลาการผลิต · Production timeline</h2>
              <button className={btn} onClick={() => setTimeline(null)}>ปิด · Close</button>
            </div>
            {timeline.rows.length === 0 ? <p className="text-sm text-muted">—</p> : (
              <ol className="space-y-2">
                {timeline.rows.map((r, idx) => (
                  <li key={idx} className="border-l-2 border-accent pl-3 text-sm">
                    <div className="font-medium">{r.event.replace(/_/g, " ")}</div>
                    <div className="text-[11px] text-muted">
                      {r.occurredAt.slice(0, 19).replace("T", " ")} · {empName(r.actor)} · {r.source}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
