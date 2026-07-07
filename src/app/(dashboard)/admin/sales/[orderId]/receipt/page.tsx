import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { requireRole } from "@/server/auth/guard";
import { getReceiptModel, onlineReceiptPath, receiptQrSvg } from "@/server/services/receipt";
import { ReceiptReprintClient } from "@/components/receipt/receipt-reprint-client";

export const metadata: Metadata = { title: "พิมพ์ใบเสร็จ · Reprint", robots: { index: false } };

/** Owner/manager reprint: preview + print 80mm/58mm, with a link to the online receipt. */
export default async function ReprintPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  await requireRole(["owner", "manager"]);
  const { orderId } = await params;
  const res = await getReceiptModel(orderId);
  if (!res.ok) {
    return <p className="text-sm text-red-600">[{res.error.code}] {res.error.message}</p>;
  }
  const h = await headers();
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ??
    `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;
  const onlineHref = `${base}${onlineReceiptPath(orderId)}`;
  const qrTarget = res.value.seller.qrUrl ?? onlineHref;
  const qrSvg = await receiptQrSvg(qrTarget);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-xl font-bold">พิมพ์ใบเสร็จ · Reprint</h1>
        <Link href="/admin/sales" className="text-sm text-muted hover:underline">← กลับ · Back</Link>
      </div>
      <ReceiptReprintClient model={res.value} qrSvg={qrSvg} onlineHref={onlineHref} />
    </div>
  );
}
