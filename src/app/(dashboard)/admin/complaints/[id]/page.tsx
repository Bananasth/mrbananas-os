import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/server/auth/guard";
import { getComplaint } from "@/server/services";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "../../_components/ui";
import { ServiceErrorCard } from "../../_components/service-error";
import { ComplaintWorkflow } from "./workflow";

export const metadata: Metadata = { title: "Complaint · Setup", robots: { index: false } };

const TONE: Record<string, "neutral" | "accent" | "warning" | "success" | "danger"> = {
  new: "neutral", triaged: "accent", investigating: "warning", action_taken: "warning",
  resolved: "success", closed: "success", rejected: "danger",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/60 py-1.5 text-sm">
      <span className="text-muted">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

export default async function ComplaintDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["owner"]);
  const { id } = await params;
  const res = await getComplaint(id);
  if (!res.ok) return <ServiceErrorCard error={res.error} />;
  const c = res.value;
  const dur = c.prepDurationSeconds == null ? "—" : `${c.prepDurationSeconds}s`;

  return (
    <div className="space-y-6">
      <Link href="/admin/complaints" className="text-sm text-accent hover:underline">← ทั้งหมด · All complaints</Link>

      <Card>
        <CardHeader>
          <CardTitle>
            <span className="flex items-center gap-3">
              คิว #{c.queueNumber ?? "—"} · {c.productName}
              <Badge tone={TONE[c.status] ?? "neutral"}>{c.status}</Badge>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Field label="หมวด · Category">{c.category}</Field>
          <Field label="ระดับ · Severity">{c.severity}</Field>
          <Field label="ความพยายาม · Attempt">{c.attemptNo ?? "—"}</Field>
          <Field label="บาริสต้าที่รับผิดชอบ · Barista">{c.baristaName ?? "—"}</Field>
          <Field label="เวลาเตรียม · Prep duration">{dur}</Field>
          <Field label="รูปถ่าย · Photo">{c.photoUrl ? <span className="break-all text-xs">{c.photoUrl}</span> : "—"}</Field>
          <Field label="รายละเอียด · Description">{c.description ?? "—"}</Field>
          <Field label="ติดต่อลูกค้า · Customer contacted">{c.customerContactedAt ? c.customerContactedAt.slice(0, 16).replace("T", " ") : "—"}</Field>
          <Field label="การแก้ไข · Resolution">{c.resolutionType ? `${c.resolutionType}${c.resolutionNote ? ` — ${c.resolutionNote}` : ""}` : "—"}</Field>
          <Field label="ปิดเมื่อ · Closed">{c.closedAt ? c.closedAt.slice(0, 16).replace("T", " ") : "—"}</Field>
          <Field label="สร้างเมื่อ · Created">{c.createdAt.slice(0, 16).replace("T", " ")}</Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>ขั้นตอน · Workflow</CardTitle></CardHeader>
        <CardContent><ComplaintWorkflow id={c.id} status={c.status} /></CardContent>
      </Card>
    </div>
  );
}
