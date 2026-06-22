import type { Metadata } from "next";
import { requireRole } from "@/server/auth/guard";
import { listRecipeAccess, listRecipeAnomalies } from "@/server/services";
import { Card, CardContent, CardHeader, CardTitle, Badge, th, td } from "../../_components/ui";
import { ServiceErrorCard } from "../../_components/service-error";

export const metadata: Metadata = { title: "Recipe access · Setup", robots: { index: false } };

function avg(ns: number[]) {
  return ns.length ? Math.round(ns.reduce((a, b) => a + b, 0) / ns.length) : null;
}

export default async function RecipeAccessPage() {
  const ctx = await requireRole(["owner"]);
  const branchId = ctx.branchIds[0];
  if (!branchId) return <p className="text-sm text-muted">ไม่พบสาขา · No branch.</p>;

  const [logs, anomalies] = await Promise.all([listRecipeAccess(branchId), listRecipeAnomalies(branchId)]);
  if (!logs.ok) return <ServiceErrorCard error={logs.error} />;

  const granted = logs.value.filter((l) => l.outcome === "granted");
  const recipeAvg = avg(granted.filter((l) => l.kind === "recipe" && l.durationSeconds != null).map((l) => l.durationSeconds!));
  const methodAvg = avg(granted.filter((l) => l.kind === "method" && l.durationSeconds != null).map((l) => l.durationSeconds!));
  const deniedCount = logs.value.filter((l) => l.outcome !== "granted").length;
  const anomalyRows = anomalies.ok ? anomalies.value : [];

  const dur = (s: number | null) => (s == null ? "—" : `${s}s`);
  const when = (s: string) => s.slice(0, 16).replace("T", " ");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="เปิดดูสูตร · Recipe views" value={String(granted.filter((l) => l.kind === "recipe").length)} />
        <Stat label="ดูวิธีทำ · Method views" value={String(granted.filter((l) => l.kind === "method").length)} />
        <Stat label="เฉลี่ยดูสูตร · Avg recipe" value={dur(recipeAvg)} />
        <Stat label="ถูกปฏิเสธ · Denied" value={String(deniedCount)} tone={deniedCount > 0 ? "warning" : "neutral"} />
      </div>

      {anomalyRows.length > 0 ? (
        <Card>
          <CardHeader><CardTitle>⚠️ สิ่งผิดปกติ · Anomalies ({anomalyRows.length})</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left text-xs text-muted">
                <th className={th}>เวลา</th><th className={th}>kind</th><th className={th}>outcome</th>
                <th className={th}>flags</th><th className={th}>device</th><th className="py-2 font-medium">IP</th>
              </tr></thead>
              <tbody>
                {anomalyRows.map((a) => (
                  <tr key={a.id} className="border-b border-border/60">
                    <td className={td}>{when(a.openedAt)}</td>
                    <td className={td}>{a.kind}</td>
                    <td className={td}>{a.outcome}</td>
                    <td className={td}>
                      <span className="flex flex-wrap gap-1">
                        {a.denied ? <Badge tone="danger">denied</Badge> : null}
                        {a.openedNotClosed ? <Badge tone="warning">not closed</Badge> : null}
                        {a.longView ? <Badge tone="warning">long {dur(a.durationSeconds)}</Badge> : null}
                      </span>
                    </td>
                    <td className={td}>{a.deviceId ?? "—"}</td>
                    <td className="py-2 text-muted">{a.ip ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle>บันทึกการเข้าถึง · Access log ({logs.value.length})</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {logs.value.length === 0 ? <p className="text-sm text-muted">ยังไม่มี · None yet.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left text-xs text-muted">
                <th className={th}>เวลา · When</th><th className={th}>kind</th><th className={th}>outcome</th>
                <th className={th}>พนักงาน · By</th><th className={th}>นาน · Duration</th>
                <th className={th}>device</th><th className="py-2 font-medium">IP</th>
              </tr></thead>
              <tbody>
                {logs.value.map((l) => (
                  <tr key={l.id} className="border-b border-border/60">
                    <td className={td}>{when(l.openedAt)}</td>
                    <td className={td}>{l.kind === "recipe" ? "สูตร · recipe" : "วิธี · method"}</td>
                    <td className={td}>
                      {l.outcome === "granted"
                        ? <Badge tone="success">granted</Badge>
                        : <Badge tone="danger">{l.outcome.replace("denied_", "")}</Badge>}
                    </td>
                    <td className={td}>{l.employeeName ?? "—"}</td>
                    <td className={td}>{dur(l.durationSeconds)}</td>
                    <td className={td}>{l.deviceId ?? "—"}</td>
                    <td className="py-2 text-muted">{l.ip ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted">เฉลี่ยดูวิธีทำ · Avg method-view: {dur(methodAvg)}</p>
    </div>
  );
}

function Stat({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "warning" }) {
  return (
    <div className={`rounded-lg border p-3 ${tone === "warning" ? "border-amber-300 bg-amber-50" : "border-border bg-card"}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
