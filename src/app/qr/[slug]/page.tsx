import type { Metadata } from "next";
import { getQrMenu } from "@/server/services/qr-public";
import { QrClient } from "./qr-client";

export const metadata: Metadata = { title: "Order · Mr. Banana's", robots: { index: false } };

function Closed({ note }: { note?: string }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <span className="text-4xl" aria-hidden>🍌</span>
      <h1 className="mt-4 text-lg font-bold">ยังไม่เปิดรับออเดอร์ · Ordering is closed</h1>
      <p className="mt-2 text-sm text-muted">{note ?? "กรุณาลองใหม่ภายหลัง · Please try again later."}</p>
    </div>
  );
}

export default async function QrMenuPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const res = await getQrMenu(slug);
  if (!res.ok) return <Closed note={res.error.message} />;
  if (!res.value.enabled) return <Closed />;
  return <QrClient slug={slug} menu={res.value} />;
}
