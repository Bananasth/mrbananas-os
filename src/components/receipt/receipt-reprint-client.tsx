"use client";

import { useState } from "react";
import type { ReceiptModel } from "@/server/services/receipt";
import { Receipt } from "./receipt";
import { ReceiptPrintStyles } from "./receipt-print-styles";

/**
 * Admin reprint control: choose 80mm/58mm, preview the thermal receipt, and print. Purely a UI
 * wrapper over the shared Receipt + print CSS — no POS/DB changes. Receives a fully-assembled
 * ReceiptModel + pre-rendered QR SVG from the server page.
 */
export function ReceiptReprintClient({
  model,
  qrSvg,
  onlineHref,
}: {
  model: ReceiptModel;
  qrSvg?: string | null;
  onlineHref: string;
}) {
  const [paper, setPaper] = useState<"80" | "58">("80");
  const variant = paper === "58" ? "thermal58" : "thermal80";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3 text-sm print:hidden">
        <span className="text-muted">ขนาดกระดาษ · Paper</span>
        {(["80", "58"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPaper(p)}
            className={`rounded-md border px-3 py-1.5 ${paper === p ? "border-accent bg-accent/20 font-medium" : "border-border hover:bg-bg"}`}
          >
            {p}mm
          </button>
        ))}
        <button onClick={() => window.print()} className="rounded-lg bg-accent px-4 py-1.5 font-semibold text-fg hover:opacity-90">
          🖨️ พิมพ์ · Print
        </button>
        <a href={onlineHref} target="_blank" rel="noreferrer" className="rounded-md border border-border px-3 py-1.5 hover:bg-bg">
          ดูออนไลน์ · Online ↗
        </a>
      </div>

      <div className="rounded-xl border border-dashed border-border bg-white p-4">
        <Receipt model={model} qrSvg={qrSvg} variant={variant} />
      </div>

      <ReceiptPrintStyles paper={paper} />
    </div>
  );
}
