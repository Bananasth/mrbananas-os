import type { Metadata } from "next";
import { headers } from "next/headers";
import { getReceiptModel, onlineReceiptPath, receiptQrSvg } from "@/server/services/receipt";
import { Receipt } from "@/components/receipt/receipt";

export const metadata: Metadata = { title: "ใบเสร็จ · Receipt", robots: { index: false } };

async function baseUrl(): Promise<string> {
  const h = await headers();
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`
  );
}

/**
 * Public online receipt. RLS-scoped: renders for a signed-in owner/manager/staff/baker of the
 * order's tenant/branch. Anonymous customer access needs a future token-gated definer RPC
 * (deferred — this phase makes no DB changes), so anon sees a graceful notice.
 * QR target = business_profile.receipt_qr_url when set, else this receipt's absolute URL.
 */
export default async function OnlineReceiptPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const res = await getReceiptModel(orderId);
  if (!res.ok) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <p className="text-sm text-muted">
          ไม่พบใบเสร็จ หรือกรุณาเข้าสู่ระบบ · Receipt unavailable or sign-in required.
        </p>
      </main>
    );
  }
  const base = await baseUrl();
  const qrTarget = res.value.seller.qrUrl ?? `${base}${onlineReceiptPath(orderId)}`;
  const qrSvg = await receiptQrSvg(qrTarget);
  return (
    <main className="min-h-dvh bg-bg px-4 py-8">
      <Receipt model={res.value} qrSvg={qrSvg} variant="online" />
    </main>
  );
}
