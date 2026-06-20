"use client";

import { useMemo, useState, useTransition } from "react";
import { computeOrderTotals } from "@/server/services/money";
import type { MenuItem } from "@/server/services/types";
import { checkout, type CheckoutResult } from "./actions";

const fmt = (n: number) =>
  (n / 100).toLocaleString("th-TH", { style: "currency", currency: "THB" });

type WS = { id: string; name: string; type: string };

export function PosClient({
  branchId,
  menu,
  workstations,
}: {
  branchId: string;
  menu: MenuItem[];
  workstations: WS[];
}) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [wsId, setWsId] = useState(
    workstations.find((w) => w.type === "pos")?.id ?? workstations[0]?.id ?? "",
  );
  const [pending, start] = useTransition();
  const [receipt, setReceipt] = useState<CheckoutResult | null>(null);

  const lines = useMemo(
    () => menu.filter((m) => (cart[m.productId] ?? 0) > 0).map((m) => ({ ...m, qty: cart[m.productId] ?? 0 })),
    [cart, menu],
  );
  const totals = useMemo(
    () => computeOrderTotals(lines.map((l) => ({ unitPrice: l.unitPrice, qty: l.qty }))),
    [lines],
  );

  const add = (id: string) => setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
  const sub = (id: string) =>
    setCart((c) => {
      const n = (c[id] ?? 0) - 1;
      const next = { ...c };
      if (n <= 0) delete next[id];
      else next[id] = n;
      return next;
    });
  const reset = () => {
    setCart({});
    setReceipt(null);
  };

  const onCharge = () => {
    if (lines.length === 0 || !wsId) return;
    start(async () => {
      const res = await checkout({
        branchId,
        workstationId: wsId,
        lines: lines.map((l) => ({
          productId: l.productId,
          recipeVersionId: l.recipeVersionId,
          unitPrice: l.unitPrice,
          qty: l.qty,
        })),
      });
      setReceipt(res);
      if (res.ok) setCart({});
    });
  };

  if (receipt?.ok) {
    return (
      <div className="mx-auto max-w-sm rounded-xl border border-border bg-card p-6 text-center">
        <p className="text-4xl" aria-hidden>
          ✅
        </p>
        <h2 className="mt-2 text-lg font-bold">ชำระเงินสำเร็จ · Paid</h2>
        <p className="mt-1 text-sm text-muted">ใบกำกับภาษีเลขที่ · Invoice #{receipt.invoiceNo}</p>
        <p className="mt-3 text-2xl font-bold tabular-nums">{fmt(receipt.total)}</p>
        <button
          onClick={reset}
          className="mt-5 w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-fg transition-opacity hover:opacity-90"
        >
          ขายรายการใหม่ · New sale
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div>
        {menu.length === 0 ? (
          <p className="text-sm text-muted">
            ยังไม่มีสินค้าพร้อมขาย — ตั้งราคาและเปิดสูตรใน Setup ก่อน · No sellable products yet (set a price +
            activate a recipe in Setup).
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {menu.map((m) => (
              <button
                key={m.productId}
                onClick={() => add(m.productId)}
                className="rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-accent"
              >
                <p className="font-medium leading-tight">{m.name}</p>
                <p className="text-xs text-muted">{m.sku}</p>
                <p className="mt-2 font-bold tabular-nums">{fmt(m.unitPrice)}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="font-bold">ตะกร้า · Cart</h2>
        <div className="mt-2 space-y-2">
          {lines.length === 0 ? (
            <p className="text-sm text-muted">ยังไม่มีรายการ · empty</p>
          ) : (
            lines.map((l) => (
              <div key={l.productId} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{l.name}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => sub(l.productId)} className="h-7 w-7 rounded border border-border">
                    −
                  </button>
                  <span className="w-6 text-center tabular-nums">{l.qty}</span>
                  <button onClick={() => add(l.productId)} className="h-7 w-7 rounded border border-border">
                    +
                  </button>
                </div>
                <span className="w-20 text-right tabular-nums">{fmt(l.unitPrice * l.qty)}</span>
              </div>
            ))
          )}
        </div>

        <div className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
          <div className="flex justify-between text-muted">
            <span>ก่อน VAT · Subtotal</span>
            <span className="tabular-nums">{fmt(totals.subtotal)}</span>
          </div>
          <div className="flex justify-between text-muted">
            <span>VAT 7%</span>
            <span className="tabular-nums">{fmt(totals.taxTotal)}</span>
          </div>
          <div className="flex justify-between font-bold">
            <span>รวม · Total</span>
            <span className="tabular-nums">{fmt(totals.total)}</span>
          </div>
        </div>

        <label className="mt-3 block space-y-1">
          <span className="text-xs text-muted">จุดทำงาน · Workstation</span>
          <select
            value={wsId}
            onChange={(e) => setWsId(e.target.value)}
            className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-sm"
          >
            {workstations.length === 0 ? (
              <option value="">— ไม่มี workstation —</option>
            ) : (
              workstations.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.type})
                </option>
              ))
            )}
          </select>
        </label>

        {receipt && !receipt.ok ? (
          <p className="mt-2 text-sm text-red-600">
            [{receipt.step}] {receipt.error}
          </p>
        ) : null}

        <button
          onClick={onCharge}
          disabled={pending || lines.length === 0 || !wsId}
          className="mt-3 w-full rounded-md bg-accent px-4 py-3 text-sm font-semibold text-fg transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "กำลังชำระ…" : `รับเงินสด · Charge cash ${fmt(totals.total)}`}
        </button>
      </div>
    </div>
  );
}
