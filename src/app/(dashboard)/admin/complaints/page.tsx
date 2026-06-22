import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/server/auth/guard";
import { listComplaints, listComplaintableItems } from "@/server/services";
import { Card, CardContent, CardHeader, CardTitle, Badge, th, td } from "../_components/ui";
import { ServiceErrorCard } from "../_components/service-error";
import { FileComplaintForm } from "./file-form";

export const metadata: Metadata = { title: "Complaints · Setup", robots: { index: false } };

export const STATUS_TONE: Record<string, "neutral" | "accent" | "warning" | "success" | "danger"> = {
  new: "neutral", triaged: "accent", investigating: "warning", action_taken: "warning",
  resolved: "success", closed: "success", rejected: "danger",
};

export default async function ComplaintsPage() {
  const ctx = await requireRole(["owner"]);
  const branchId = ctx.branchIds[0];
  if (!branchId) return <p className="text-sm text-muted">ไม่พบสาขา · No branch.</p>;

  const [list, items] = await Promise.all([listComplaints(branchId), listComplaintableItems(branchId)]);
  if (!list.ok) return <ServiceErrorCard error={list.error} />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>แจ้งเรื่องร้องเรียน · File a complaint</CardTitle></CardHeader>
        <CardContent><FileComplaintForm items={items.ok ? items.value : []} /></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>เรื่องร้องเรียน · Complaints ({list.value.length})</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {list.value.length === 0 ? <p className="text-sm text-muted">ยังไม่มี · None.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left text-xs text-muted">
                <th className={th}>เวลา</th><th className={th}>คิว</th><th className={th}>รายการ · Item</th>
                <th className={th}>หมวด</th><th className={th}>ระดับ</th><th className={th}>สถานะ</th>
                <th className={th}>บาริสต้า</th><th className="py-2 font-medium"></th>
              </tr></thead>
              <tbody>
                {list.value.map((c) => (
                  <tr key={c.id} className="border-b border-border/60">
                    <td className={td}>{c.createdAt.slice(0, 16).replace("T", " ")}</td>
                    <td className={td}>#{c.queueNumber ?? "—"}</td>
                    <td className={td}>{c.productName}{c.attemptNo && c.attemptNo > 1 ? ` (a${c.attemptNo})` : ""}</td>
                    <td className={td}>{c.category}</td>
                    <td className={td}>{c.severity}</td>
                    <td className={td}><Badge tone={STATUS_TONE[c.status] ?? "neutral"}>{c.status}</Badge></td>
                    <td className={td}>{c.baristaName ?? "—"}</td>
                    <td className="py-2 text-right">
                      <Link href={`/admin/complaints/${c.id}`} className="text-sm text-accent hover:underline">เปิด · Open</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
