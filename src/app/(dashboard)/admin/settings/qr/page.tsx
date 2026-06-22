import type { Metadata } from "next";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { requireRole } from "@/server/auth/guard";
import { getQrConfig } from "@/server/services";
import { ServiceErrorCard } from "../../_components/service-error";
import { QrSettingsClient } from "./qr-settings-client";

export const metadata: Metadata = { title: "QR ordering · Setup", robots: { index: false } };

export default async function QrSettingsPage() {
  const ctx = await requireRole(["owner"]);
  const branchId = ctx.branchIds[0];
  if (!branchId) {
    return <p className="text-sm text-muted">ไม่พบสาขาในสิทธิ์ของคุณ · No branch in your context.</p>;
  }

  const cfg = await getQrConfig(branchId);
  if (!cfg.ok) return <ServiceErrorCard error={cfg.error} />;

  const h = await headers();
  const base = process.env.NEXT_PUBLIC_SITE_URL
    ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;

  const slug = cfg.value?.public_slug ?? "";
  const publicUrl = slug ? `${base}/qr/${slug}` : null;
  const qrSvg = publicUrl ? await QRCode.toString(publicUrl, { type: "svg", margin: 1, width: 240 }) : null;

  return (
    <QrSettingsClient
      branchId={branchId}
      config={cfg.value}
      publicUrl={publicUrl}
      qrSvg={qrSvg}
    />
  );
}
