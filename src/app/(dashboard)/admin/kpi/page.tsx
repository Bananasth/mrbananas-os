import type { Metadata } from "next";
import { requireRole } from "@/server/auth/guard";
import { kpiOrderCounts, kpiRecipePerformance, kpiEmployeePerformance } from "@/server/services";
import { Card, CardContent, CardHeader, CardTitle, Badge, th, td } from "../_components/ui";
import { ServiceErrorCard } from "../_components/service-error";

export const metadata: Metadata = { title: "KPI · Setup", robots: { index: false } };

const sec = (s: number | null) => (s == null ? "—" : `${s}s`);
const pct = (num: number, den: number) => (den === 0 ? "—" : `${Math.round((num / den) * 100)}%`);

function Stat({ label, value, tone = "card" }: { label: string; value: string; tone?: "card" | "warn" }) {
  return (
    <div className={`rounded-lg border p-3 ${tone === "warn" ? "border-amber-300 bg-amber-50" : "border-border bg-card"}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

export default async function KpiPage() {
  const ctx = await requireRole(["owner"]);
  const branchId = ctx.branchIds[0];
  if (!branchId) return <p className="text-sm text-muted">ไม่พบสาขา · No branch.</p>;

  const [orders, recipes, employees] = await Promise.all([
    kpiOrderCounts(branchId), kpiRecipePerformance(), kpiEmployeePerformance(),
  ]);
  if (!orders.ok) return <ServiceErrorCard error={orders.error} />;

  const rp = recipes.ok ? recipes.value : [];
  const totalItems = rp.reduce((s, r) => s + r.completed, 0);
  const totalRework = rp.reduce((s, r) => s + r.reworked, 0);
  const totalFirstPass = rp.reduce((s, r) => s + r.firstPass, 0);
  const totalComplaints = rp.reduce((s, r) => s + r.complaints, 0);
  const prepVals = rp.map((r) => r.avgPrepSeconds).filter((x): x is number => x != null);
  const avgPrep = prepVals.length ? Math.round(prepVals.reduce((a, b) => a + b, 0) / prepVals.length) : null;
  const ep = employees.ok ? employees.value : [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="ออเดอร์ทั้งหมด · Orders" value={String(orders.value.total)} />
        <Stat label="กำลังทำ · Active" value={String(orders.value.active)} />
        <Stat label="พร้อมรับ · Ready" value={String(orders.value.ready)} />
        <Stat label="เสร็จ · Completed" value={String(orders.value.completed)} />
        <Stat label="ต้องตรวจ · Needs review" value={String(orders.value.needsReview)} tone={orders.value.needsReview ? "warn" : "card"} />
        <Stat label="หมด/ยกเลิก · Exp/Cxl" value={String(orders.value.expiredCancelled)} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="ทำเสร็จ · Items made" value={String(totalItems)} />
        <Stat label="เวลาเตรียมเฉลี่ย · Avg prep" value={sec(avgPrep)} />
        <Stat label="QC ไม่ผ่าน/ทำใหม่ · Rework" value={String(totalRework)} tone={totalRework ? "warn" : "card"} />
        <Stat label="ผ่านครั้งเดียว · First-pass" value={pct(totalFirstPass, totalItems)} />
        <Stat label="ร้องเรียน · Complaints" value={String(totalComplaints)} tone={totalComplaints ? "warn" : "card"} />
      </div>

      <Card>
        <CardHeader><CardTitle>ประสิทธิภาพตามสูตร · Recipe-version performance</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {rp.length === 0 ? <p className="text-sm text-muted">ยังไม่มีข้อมูล · No data yet.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left text-xs text-muted">
                <th className={th}>สินค้า · Product</th><th className={th}>ทำเสร็จ</th><th className={th}>ผ่านครั้งเดียว</th>
                <th className={th}>ทำใหม่</th><th className={th}>เวลาเตรียม</th><th className={th}>ดูสูตร</th>
                <th className={th}>ดูวิธี</th><th className="py-2 font-medium">ร้องเรียน</th>
              </tr></thead>
              <tbody>
                {rp.map((r) => (
                  <tr key={r.recipeVersionId} className="border-b border-border/60">
                    <td className={td}>{r.productName}</td>
                    <td className={td}>{r.completed}/{r.items}</td>
                    <td className={td}>{pct(r.firstPass, r.completed)}</td>
                    <td className={td}>{r.reworked}</td>
                    <td className={td}>{sec(r.avgPrepSeconds)}</td>
                    <td className={td}>{sec(r.avgRecipeView)}</td>
                    <td className={td}>{sec(r.avgMethodView)}</td>
                    <td className="py-2">{r.complaints}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>ทักษะพนักงาน · Employee skill matrix</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {ep.length === 0 ? <p className="text-sm text-muted">ยังไม่มีข้อมูล · No data yet.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left text-xs text-muted">
                <th className={th}>พนักงาน · Employee</th><th className={th}>สินค้า</th><th className={th}>ทำเสร็จ</th>
                <th className={th}>ผ่านครั้งเดียว</th><th className={th}>ทำใหม่</th><th className={th}>เวลาเตรียม</th>
                <th className="py-2 font-medium">ร้องเรียน</th>
              </tr></thead>
              <tbody>
                {ep.map((e, i) => (
                  <tr key={`${e.employeeId}-${e.productName}-${i}`} className="border-b border-border/60">
                    <td className={td}>{e.employeeName}{e.madeInTraining ? <Badge tone="warning">training</Badge> : null}</td>
                    <td className={td}>{e.productName}</td>
                    <td className={td}>{e.completed}</td>
                    <td className={td}>{pct(e.firstPass, e.completed)}</td>
                    <td className={td}>{e.reworked}</td>
                    <td className={td}>{sec(e.avgPrepSeconds)}</td>
                    <td className="py-2">{e.complaints}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted">เวลาเตรียม = preparing→QC · “Avg prep” is preparing-started to QC-started; training makers shown separately.</p>
    </div>
  );
}
