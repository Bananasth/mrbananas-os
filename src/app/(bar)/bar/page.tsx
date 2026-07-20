import type { Metadata } from "next";
import { requireRole } from "@/server/auth/guard";
import { listBarQueue, listBarEmployees, listPickupQueue } from "@/server/services";
import { BarClient } from "./bar-client";

export const metadata: Metadata = { title: "Bar Station", robots: { index: false } };

export default async function BarPage() {
  const ctx = await requireRole(["owner", "manager", "staff", "baker"]);
  const branchId = ctx.branchIds[0];
  if (!branchId) {
    return <p className="text-sm text-muted">ไม่พบสาขาในสิทธิ์ของคุณ · No branch in your context.</p>;
  }

  // listPickupQueue is manager/staff-only (mirrors the pickup RPC): a baker simply gets no
  // handover list, so the section is absent rather than broken.
  const [queue, employees, pickups] = await Promise.all([
    listBarQueue(branchId),
    listBarEmployees(branchId),
    listPickupQueue(branchId),
  ]);
  if (!queue.ok) {
    return (
      <p className="text-sm text-red-600">
        [{queue.error.code}] {queue.error.message}
      </p>
    );
  }

  return (
    <BarClient
      items={queue.value}
      employees={employees.ok ? employees.value : []}
      pickups={pickups.ok ? pickups.value : []}
      branchId={branchId}
    />
  );
}
