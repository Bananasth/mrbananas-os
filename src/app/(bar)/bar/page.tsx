import type { Metadata } from "next";
import { requireRole } from "@/server/auth/guard";
import { listBarQueue, listBarEmployees } from "@/server/services";
import { BarClient } from "./bar-client";

export const metadata: Metadata = { title: "Bar Station", robots: { index: false } };

export default async function BarPage() {
  const ctx = await requireRole(["owner", "manager", "staff", "baker"]);
  const branchId = ctx.branchIds[0];
  if (!branchId) {
    return <p className="text-sm text-muted">ไม่พบสาขาในสิทธิ์ของคุณ · No branch in your context.</p>;
  }

  const [queue, employees] = await Promise.all([listBarQueue(branchId), listBarEmployees(branchId)]);
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
    />
  );
}
