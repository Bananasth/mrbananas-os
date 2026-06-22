"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { QrMenu, QrProduct } from "@/server/services/qr-public";
import { checkoutAction, payAction } from "./actions";

const baht = (satang: number) => `฿${(satang / 100).toFixed(2)}`;

type CartItem = { key: string; productId: string; name: string; optionIds: string[]; optionLabel: string; unitPrice: number; qty: number };

export function QrClient({ slug, menu }: { slug: string; menu: QrMenu }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [note, setNote] = useState("");
  const [phase, setPhase] = useState<"browse" | "pay">("browse");
  const [order, setOrder] = useState<{ tracking_token: string; client_uuid: string; amount: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const products = menu.products ?? [];
  const sections = useMemo(() => {
    const map = new Map<string, QrProduct[]>();
    for (const p of products) {
      const k = p.menu_section ?? "เมนู · Menu";
      (map.get(k) ?? map.set(k, []).get(k)!).push(p);
    }
    return [...map.entries()];
  }, [products]);

  const total = cart.reduce((s, c) => s + c.unitPrice * c.qty, 0);

  function addToCart(item: Omit<CartItem, "qty">) {
    setCart((prev) => {
      const i = prev.findIndex((c) => c.key === item.key);
      if (i >= 0) { const next = [...prev]; next[i] = { ...next[i], qty: next[i].qty + 1 }; return next; }
      return [...prev, { ...item, qty: 1 }];
    });
  }
  function setQty(key: string, delta: number) {
    setCart((prev) => prev.flatMap((c) => (c.key === key ? (c.qty + delta <= 0 ? [] : [{ ...c, qty: c.qty + delta }]) : [c])));
  }

  function checkout() {
    if (!cart.length) return;
    const items = cart.map((c) => ({ product_id: c.productId, qty: c.qty, option_ids: c.optionIds }));
    start(async () => {
      const res = await checkoutAction(slug, items, note.trim() || null);
      if (!res.ok) { setMsg(res.error ?? "error"); return; }
      setMsg(null);
      setOrder(res.data as { tracking_token: string; client_uuid: string; amount: number });
      setPhase("pay");
    });
  }
  function pay() {
    if (!order) return;
    start(async () => {
      const res = await payAction(order.tracking_token, order.client_uuid);
      if (!res.ok) { setMsg(res.error ?? "error"); return; }
      router.push(`/qr/track/${order.tracking_token}`);
    });
  }

  if (phase === "pay" && order) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
        <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <span className="text-3xl" aria-hidden>🍌</span>
          <h1 className="mt-3 text-lg font-bold">ชำระเงิน · Payment</h1>
          <p className="mt-1 text-sm text-muted">ยอดชำระ · Amount due</p>
          <p className="my-3 text-4xl font-bold tabular-nums">{baht(order.amount)}</p>
          {msg ? <p className="mb-3 text-sm text-red-600">{msg}</p> : null}
          <button onClick={pay} disabled={pending} className="w-full rounded-xl bg-accent py-3 font-semibold text-fg transition-opacity hover:opacity-90 disabled:opacity-50">
            {pending ? "กำลังชำระ…" : "จ่ายเลย (ทดสอบ) · Pay now (mock)"}
          </button>
          <button onClick={() => { setPhase("browse"); setOrder(null); setMsg(null); }} disabled={pending} className="mt-2 w-full rounded-xl border border-border py-2.5 text-sm hover:bg-bg">
            ย้อนกลับ · Back
          </button>
          <p className="mt-3 text-xs text-muted">ออเดอร์จะยืนยันหลังชำระเงินสำเร็จ · Your order is confirmed only after payment, and expires in 10 minutes if unpaid.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 pb-44 pt-5">
      <header className="mb-4 flex items-center gap-2">
        <span className="text-2xl" aria-hidden>🍌</span>
        <h1 className="text-lg font-bold">สั่งเลย · Order</h1>
      </header>

      {products.length === 0 ? <p className="text-sm text-muted">ยังไม่มีสินค้า · No items available.</p> : null}

      {sections.map(([section, items]) => (
        <section key={section} className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-muted">{section}</h2>
          <div className="space-y-3">
            {items.map((p) => <ProductCard key={p.product_id} product={p} onAdd={addToCart} />)}
          </div>
        </section>
      ))}

      {/* sticky cart bar */}
      {cart.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 backdrop-blur">
          <div className="mx-auto max-w-md px-4 py-3">
            <div className="mb-2 max-h-40 space-y-1 overflow-y-auto">
              {cart.map((c) => (
                <div key={c.key} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{c.name}{c.optionLabel ? <span className="text-muted"> · {c.optionLabel}</span> : null}</span>
                  <span className="flex items-center gap-2">
                    <button onClick={() => setQty(c.key, -1)} className="h-6 w-6 rounded border border-border">−</button>
                    <span className="w-4 text-center tabular-nums">{c.qty}</span>
                    <button onClick={() => setQty(c.key, 1)} className="h-6 w-6 rounded border border-border">+</button>
                    <span className="w-16 text-right tabular-nums">{baht(c.unitPrice * c.qty)}</span>
                  </span>
                </div>
              ))}
            </div>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="หมายเหตุ · Note (optional)"
              className="mb-2 w-full rounded-md border border-border bg-bg px-2 py-1.5 text-sm" />
            {msg ? <p className="mb-2 text-sm text-red-600">{msg}</p> : null}
            <button onClick={checkout} disabled={pending}
              className="flex w-full items-center justify-between rounded-xl bg-accent px-4 py-3 font-semibold text-fg transition-opacity hover:opacity-90 disabled:opacity-50">
              <span>{pending ? "กำลังดำเนินการ…" : "ชำระเงิน · Checkout"}</span>
              <span className="tabular-nums">{baht(total)}</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ProductCard({ product, onAdd }: { product: QrProduct; onAdd: (i: Omit<CartItem, "qty">) => void }) {
  const groups = product.modifier_groups ?? [];
  const [sel, setSel] = useState<Record<string, string[]>>(() => {
    const init: Record<string, string[]> = {};
    for (const g of groups) {
      const def = g.options.find((o) => o.is_default);
      init[g.group_id] = g.is_required && def ? [def.option_id] : [];
    }
    return init;
  });

  function toggle(g: QrGroupLike, optId: string) {
    setSel((prev) => {
      const cur = prev[g.group_id] ?? [];
      if (g.selection_type === "single") return { ...prev, [g.group_id]: cur[0] === optId ? (g.is_required ? cur : []) : [optId] };
      const has = cur.includes(optId);
      if (has) return { ...prev, [g.group_id]: cur.filter((x) => x !== optId) };
      if (cur.length >= g.max_select) return prev;
      return { ...prev, [g.group_id]: [...cur, optId] };
    });
  }

  const optionIds = groups.flatMap((g) => sel[g.group_id] ?? []);
  const adjust = groups.reduce((s, g) =>
    s + (sel[g.group_id] ?? []).reduce((a, id) => a + (g.options.find((o) => o.option_id === id)?.price_adjustment ?? 0), 0), 0);
  const unitPrice = product.price + adjust;
  const optionLabel = groups.flatMap((g) => (sel[g.group_id] ?? []).map((id) => g.options.find((o) => o.option_id === id)?.name).filter(Boolean)).join(", ");
  const missingRequired = groups.some((g) => g.is_required && (sel[g.group_id] ?? []).length < Math.max(g.min_select, 1));

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="font-medium">{product.name}</span>
        <span className="tabular-nums text-sm text-muted">{baht(product.price)}</span>
      </div>
      {groups.map((g) => (
        <div key={g.group_id} className="mt-2">
          <p className="text-xs text-muted">{g.name}{g.is_required ? " *" : ""}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {g.options.map((o) => {
              const on = (sel[g.group_id] ?? []).includes(o.option_id);
              return (
                <button key={o.option_id} onClick={() => toggle(g, o.option_id)}
                  className={`rounded-full border px-2.5 py-1 text-xs ${on ? "border-accent bg-accent/20 font-medium" : "border-border"}`}>
                  {o.name}{o.price_adjustment ? ` (+${baht(o.price_adjustment)})` : ""}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <button onClick={() => onAdd({ key: `${product.product_id}|${[...optionIds].sort().join(",")}`, productId: product.product_id, name: product.name, optionIds, optionLabel, unitPrice })}
        disabled={missingRequired}
        className="mt-3 w-full rounded-lg border border-accent bg-accent/10 py-2 text-sm font-medium disabled:opacity-40">
        {missingRequired ? "เลือกตัวเลือก · Choose options" : `เพิ่ม · Add · ${baht(unitPrice)}`}
      </button>
    </div>
  );
}

type QrGroupLike = QrProduct["modifier_groups"][number];
