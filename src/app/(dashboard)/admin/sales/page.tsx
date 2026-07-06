import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/server/auth/guard";
import { getSalesSummary, getTopProducts, listSales } from "@/server/services/sales";
import { baht } from "../_components/format";
import { Badge, Card, CardContent, CardHeader, CardTitle, td, th } from "../_components/ui";

export const metadata: Metadata = { title: "การขาย · Sales", robots: { index: false } };

const PAGE_SIZE = 50;
const CHANNELS = ["", "pos", "qr"];
const METHODS = ["", "cash", "qr", "card", "other", "mixed"];

const CHANNEL_LABEL: Record<string, string> = { pos: "POS", qr: "QR Order" };
const PAYMENT_LABEL: Record<string, string> = {
  cash: "Cash",
  qr: "QR PromptPay",
  card: "Credit Card",
  other: "Other",
  mixed: "Mixed",
};
const channelLabel = (c: string) => CHANNEL_LABEL[c] ?? c;
const paymentLabel = (m: string) => PAYMENT_LABEL[m] ?? m;

/** YYYY-MM-DD for a Date (local). */
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return ymd(d);
}
/** DD/MM/YYYY HH:mm */
function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requireRole(["owner", "manager"]);
  const branchId = ctx.branchIds[0];
  if (!branchId) {
    return <p className="text-sm text-muted">ไม่พบสาขาในสิทธิ์ของคุณ · No branch in your context.</p>;
  }

  const sp = await searchParams;
  const today = new Date();
  const defFrom = new Date(today);
  defFrom.setDate(defFrom.getDate() - 29);
  const from = sp.from ?? ymd(defFrom);
  const to = sp.to ?? ymd(today);
  const channel = sp.channel ?? "";
  const method = sp.method ?? "";
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  // Query bounds: [from 00:00, to+1day 00:00) so both endpoints are inclusive dates.
  const filters = {
    branchId,
    from: `${from}T00:00:00`,
    to: `${addDays(to, 1)}T00:00:00`,
    channel: channel || null,
    paymentMethod: method || null,
  };

  const [summary, top, rows] = await Promise.all([
    getSalesSummary(filters),
    getTopProducts({ ...filters, limit: 5 }),
    listSales({ ...filters, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
  ]);

  const mkHref = (nextPage: number) => {
    const q = new URLSearchParams();
    q.set("from", from);
    q.set("to", to);
    if (channel) q.set("channel", channel);
    if (method) q.set("method", method);
    if (nextPage > 1) q.set("page", String(nextPage));
    return `/admin/sales?${q.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          การขาย <span className="text-base font-normal text-muted">Sales</span>
        </h1>
        <p className="text-sm text-muted">
          ยอดขายที่ชำระเงินแล้ว (completed + captured) · Paid sales only
        </p>
      </div>

      {/* Filters (server-side GET form) */}
      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4" method="get">
        <label className="text-sm">
          <span className="block text-xs text-muted">จาก · From</span>
          <input type="date" name="from" defaultValue={from} className="rounded-md border border-border bg-bg px-2 py-1.5" />
        </label>
        <label className="text-sm">
          <span className="block text-xs text-muted">ถึง · To</span>
          <input type="date" name="to" defaultValue={to} className="rounded-md border border-border bg-bg px-2 py-1.5" />
        </label>
        <label className="text-sm">
          <span className="block text-xs text-muted">ช่องทาง · Channel</span>
          <select name="channel" defaultValue={channel} className="rounded-md border border-border bg-bg px-2 py-1.5">
            {CHANNELS.map((c) => (
              <option key={c} value={c}>{c === "" ? "ทั้งหมด · All" : channelLabel(c)}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-xs text-muted">การชำระ · Payment</span>
          <select name="method" defaultValue={method} className="rounded-md border border-border bg-bg px-2 py-1.5">
            {METHODS.map((m) => (
              <option key={m} value={m}>{m === "" ? "ทั้งหมด · All" : paymentLabel(m)}</option>
            ))}
          </select>
        </label>
        <button className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-fg hover:opacity-90">
          กรอง · Filter
        </button>
      </form>

      {/* KPI cards */}
      {summary.ok ? (
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Kpi label="ยอดขายรวม · Revenue" value={baht(summary.value.grossTotal)} />
          <Kpi label="VAT" value={baht(summary.value.taxTotal)} />
          <Kpi label="ก่อน VAT · Net" value={baht(summary.value.netTotal)} />
          <Kpi label="จำนวนบิล · Orders" value={String(summary.value.orderCount)} />
          <Kpi label="เฉลี่ย/บิล · AOV" value={baht(Math.round(summary.value.avgOrderValue))} />
        </dl>
      ) : (
        <p className="text-sm text-red-600">[{summary.error.code}] {summary.error.message}</p>
      )}

      {/* Top products */}
      <Card>
        <CardHeader>
          <CardTitle>สินค้าขายดี · Top Products</CardTitle>
        </CardHeader>
        <CardContent>
          {top.ok ? (
            top.value.length === 0 ? (
              <p className="text-sm text-muted">ไม่มีข้อมูลในช่วงนี้ · No sales in this range.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border text-muted">
                    <tr>
                      <th className={`${th} w-12`}>อันดับ · Rank</th>
                      <th className={th}>สินค้า · Product</th>
                      <th className={`${th} text-right`}>จำนวน · Qty</th>
                      <th className={`${th} text-right`}>ยอดขาย · Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top.value.map((p, i) => (
                      <tr key={p.productId} className="border-b border-border/60">
                        <td className={`${td} tabular-nums text-muted`}>{i + 1}</td>
                        <td className={td}>{p.name}</td>
                        <td className={`${td} text-right tabular-nums`}>{p.qtySold}</td>
                        <td className={`${td} text-right font-medium tabular-nums`}>{baht(p.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <p className="text-sm text-red-600">[{top.error.code}] {top.error.message}</p>
          )}
        </CardContent>
      </Card>

      {/* History table */}
      <Card>
        <CardHeader>
          <CardTitle>ประวัติการขาย · Sales History</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.ok ? (
            rows.value.length === 0 ? (
              <p className="text-sm text-muted">ไม่มีรายการ · No sales.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border text-muted">
                      <tr>
                        <th className={th}>วันเวลา · Date/time</th>
                        <th className={th}>ช่องทาง · Channel</th>
                        <th className={th}>การชำระ · Payment</th>
                        <th className={th}>ใบกำกับ · Invoice</th>
                        <th className={`${th} text-right`}>ก่อน VAT · Net</th>
                        <th className={`${th} text-right`}>VAT</th>
                        <th className={`${th} text-right`}>รวม · Gross</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.value.map((r) => (
                        <tr key={r.orderId} className="border-b border-border/60">
                          <td className={`${td} tabular-nums`}>{fmtDateTime(r.saleDatetime)}</td>
                          <td className={td}><Badge>{channelLabel(r.channel)}</Badge></td>
                          <td className={td}>
                            {paymentLabel(r.primaryPaymentMethod)}
                            {r.paymentCount > 1 ? <span className="text-muted"> (×{r.paymentCount})</span> : null}
                          </td>
                          <td className={td}>{r.invoiceNo ?? "—"}</td>
                          <td className={`${td} text-right tabular-nums`}>{baht(r.netTotal)}</td>
                          <td className={`${td} text-right tabular-nums`}>{baht(r.taxTotal)}</td>
                          <td className={`${td} text-right font-medium tabular-nums`}>{baht(r.grossTotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-muted">หน้า · Page {page}</span>
                  <span className="flex gap-2">
                    {page > 1 ? (
                      <Link href={mkHref(page - 1)} className="rounded-md border border-border px-3 py-1.5 hover:bg-bg">
                        ← ก่อนหน้า · Prev
                      </Link>
                    ) : null}
                    {rows.value.length === PAGE_SIZE ? (
                      <Link href={mkHref(page + 1)} className="rounded-md border border-border px-3 py-1.5 hover:bg-bg">
                        ถัดไป · Next →
                      </Link>
                    ) : null}
                  </span>
                </div>
              </>
            )
          ) : (
            <p className="text-sm text-red-600">[{rows.error.code}] {rows.error.message}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-1 text-lg font-bold tabular-nums">{value}</dd>
    </div>
  );
}
