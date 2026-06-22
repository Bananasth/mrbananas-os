"use client";

import { useActionState, useState } from "react";
import type { QrConfigRow } from "@/server/services/qr-admin";
import { Card, CardContent, CardHeader, CardTitle } from "../../_components/ui";
import { saveQrConfigAction, type QrSettingsState } from "./actions";

const input = "w-full rounded-md border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent";

export function QrSettingsClient({
  branchId, config, publicUrl, qrSvg,
}: { branchId: string; config: QrConfigRow | null; publicUrl: string | null; qrSvg: string | null }) {
  const action = saveQrConfigAction.bind(null, branchId);
  const [state, formAction, pending] = useActionState<QrSettingsState, FormData>(action, {});
  const [copied, setCopied] = useState(false);

  function copy() {
    if (!publicUrl) return;
    navigator.clipboard?.writeText(publicUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>ตั้งค่า QR ออเดอร์ · QR ordering</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="enabled" defaultChecked={config?.enabled ?? false} className="h-4 w-4" />
              เปิดรับออเดอร์ผ่าน QR · Enable QR ordering
            </label>
            <div>
              <label className="mb-1 block text-sm font-medium">Public slug</label>
              <input name="public_slug" required defaultValue={config?.public_slug ?? ""} placeholder="e.g. mr-banana-siam"
                pattern="[a-z0-9-]{3,40}" className={input} />
              <p className="mt-1 text-xs text-muted">ตัวพิมพ์เล็ก ตัวเลข ขีดกลาง · lowercase, numbers, hyphens (3–40). URL: /qr/&lt;slug&gt;</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">คำแนะนำการรับ · Pickup instruction</label>
              <textarea name="pickup_instruction" rows={2} defaultValue={config?.pickup_instruction ?? ""}
                placeholder="Pick up at the bar · รับที่บาร์" className={input} />
            </div>
            {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
            {state.ok ? <p className="text-sm text-green-700">บันทึกแล้ว · Saved.</p> : null}
            <button type="submit" disabled={pending}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-fg hover:opacity-90 disabled:opacity-50">
              {pending ? "กำลังบันทึก…" : "บันทึก · Save"}
            </button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>QR สำหรับติดหน้าร้าน · Printable QR</CardTitle>
        </CardHeader>
        <CardContent>
          {!config?.enabled ? (
            <p className="text-sm text-amber-700">เปิดใช้งานก่อน · Enable ordering to publish the QR.</p>
          ) : qrSvg && publicUrl ? (
            <div className="space-y-3">
              <div id="qr-print" className="mx-auto w-fit rounded-xl bg-white p-4 text-center">
                <div dangerouslySetInnerHTML={{ __html: qrSvg }} />
                <p className="mt-2 text-sm font-semibold text-black">🍌 สแกนเพื่อสั่ง · Scan to order</p>
              </div>
              <div className="flex items-center gap-2">
                <input readOnly value={publicUrl} className={`${input} text-xs`} />
                <button onClick={copy} className="whitespace-nowrap rounded-md border border-border px-3 py-2 text-sm hover:bg-bg">
                  {copied ? "คัดลอกแล้ว" : "คัดลอก · Copy"}
                </button>
              </div>
              <button onClick={() => window.print()} className="w-full rounded-md border border-border py-2 text-sm font-medium hover:bg-bg">
                🖨️ พิมพ์ · Print QR
              </button>
            </div>
          ) : (
            <p className="text-sm text-muted">ตั้งค่า slug แล้วบันทึก · Set a slug and save to generate the QR.</p>
          )}
        </CardContent>
      </Card>
      <style>{`@media print { body * { visibility: hidden; } #qr-print, #qr-print * { visibility: visible; } #qr-print { position: fixed; inset: 0; margin: auto; } }`}</style>
    </div>
  );
}
