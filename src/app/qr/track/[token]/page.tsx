import type { Metadata } from "next";
import { getQrStatus } from "@/server/services/qr-public";
import { TrackClient } from "./track-client";

export const metadata: Metadata = { title: "Your order · Mr. Banana's", robots: { index: false } };

export default async function TrackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const res = await getQrStatus(token);
  const initial = res.ok ? res.value : { found: false };
  return <TrackClient token={token} initial={initial} />;
}
