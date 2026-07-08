"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { QrMenu, QrProduct } from "@/server/services/qr-public";
import { checkoutAction, pollStatusAction, type PayIntent } from "./actions";
import { baht, type CartItem } from "./_components/shared";
import { StoreHeader } from "./_components/store-header";
import { CategoryNav } from "./_components/category-nav";
import { ProductCard } from "./_components/product-card";
import { ProductDetailSheet } from "./_components/product-detail-sheet";
import { CartBar } from "./_components/cart-bar";
import { CartSheet } from "./_components/cart-sheet";

const SETTLED = new Set(["order_received", "in_progress", "ready_for_pickup", "completed", "needs_review"]);
const DEAD = new Set(["expired", "cancelled"]);

export function QrClient({ slug, menu }: { slug: string; menu: QrMenu }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [note, setNote] = useState("");
  const [phase, setPhase] = useState<"browse" | "pay">("browse");
  const [pay, setPay] = useState<PayIntent | null>(null);
  const [remaining, setRemaining] = useState<number>(0);
  const [expired, setExpired] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // browse UI state
  const [activeSection, setActiveSection] = useState<string>("");
  const [openProduct, setOpenProduct] = useState<QrProduct | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  const products = menu.products ?? [];
  const sections = useMemo(() => {
    const map = new Map<string, QrProduct[]>();
    for (const p of products) {
      const k = p.menu_section ?? "เมนู · Menu";
      (map.get(k) ?? map.set(k, []).get(k)!).push(p);
    }
    return [...map.entries()];
  }, [products]);
  const sectionNames = sections.map(([name]) => name);

  const total = cart.reduce((s, c) => s + c.unitPrice * c.qty, 0);
  const cartCount = cart.reduce((s, c) => s + c.qty, 0);

  function addToCart(item: Omit<CartItem, "qty">, qty = 1) {
    setCart((prev) => {
      const i = prev.findIndex((c) => c.key === item.key);
      if (i >= 0) { const next = [...prev]; next[i] = { ...next[i], qty: next[i].qty + qty }; return next; }
      return [...prev, { ...item, qty }];
    });
  }
  function setQty(key: string, delta: number) {
    setCart((prev) => prev.flatMap((c) => (c.key === key ? (c.qty + delta <= 0 ? [] : [{ ...c, qty: c.qty + delta }]) : [c])));
  }

  function selectSection(name: string) {
    setActiveSection(name);
    const idx = sectionNames.indexOf(name);
    if (idx >= 0) document.getElementById(`qr-sec-${idx}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function checkout() {
    if (!cart.length) return;
    const items = cart.map((c) => ({ product_id: c.productId, qty: c.qty, option_ids: c.optionIds }));
    start(async () => {
      const res = await checkoutAction(slug, items, note.trim() || null);
      if (!res.ok || !res.data) { setMsg(res.error ?? "error"); return; }
      setMsg(null);
      setExpired(false);
      setPay(res.data);
      setPhase("pay");
    });
  }

  // countdown
  useEffect(() => {
    if (phase !== "pay" || !pay) return;
    const end = new Date(pay.expires_at).getTime();
    const tick = () => {
      const left = Math.max(0, Math.round((end - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) setExpired(true);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [phase, pay]);

  // poll for settlement
  const polling = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (phase !== "pay" || !pay || expired) return;
    async function poll() {
      const res = await pollStatusAction(pay!.tracking_token);
      if (!res.ok) return;
      if (res.status && SETTLED.has(res.status)) router.push(`/qr/track/${pay!.tracking_token}`);
      else if (res.status && DEAD.has(res.status)) setExpired(true);
    }
    polling.current = setInterval(poll, 4000);
    return () => { if (polling.current) clearInterval(polling.current); };
  }, [phase, pay, expired, router]);

  function startOver() {
    setPhase("browse"); setPay(null); setExpired(false); setCart([]); setNote(""); setMsg(null); setCartOpen(false);
  }

  const mmss = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;

  // ---------- PAY (unchanged flow) ----------
  if (phase === "pay" && pay) {
    if (expired) {
      return (
        <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
          <span className="text-4xl" aria-hidden>⏳</span>
          <h1 className="mt-4 text-lg font-bold">หมดเวลาชำระเงิน · Payment window expired</h1>
          <p className="mt-2 text-sm text-muted">ออเดอร์ถูกยกเลิกเนื่องจากไม่ได้ชำระภายในเวลาที่กำหนด · The order was not paid in time.</p>
          <button onClick={startOver} className="mt-5 rounded-xl bg-accent px-5 py-3 font-semibold text-fg hover:opacity-90">
            สั่งใหม่ · Start over
          </button>
        </div>
      );
    }
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
        <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <h1 className="text-lg font-bold">สแกนเพื่อจ่าย · Scan to pay</h1>
          <p className="mt-1 text-sm text-muted">ยอดชำระ · Amount due</p>
          <p className="my-2 text-3xl font-bold tabular-nums">{baht(pay.amount)}</p>

          <div className="mx-auto my-3 w-fit rounded-xl bg-white p-3">
            <div dangerouslySetInnerHTML={{ __html: pay.qr_svg }} />
          </div>
          {pay.is_mock ? (
            <p className="mb-2 inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
              MOCK MODE — awaiting settlement
            </p>
          ) : (
            <p className="mb-2 text-xs text-muted">พร้อมเพย์ · PromptPay — scan in your banking app</p>
          )}

          <div className="mt-2 flex items-center justify-center gap-2 text-sm">
            <span className="text-muted">หมดเวลาใน · Expires in</span>
            <span className={`font-bold tabular-nums ${remaining <= 60 ? "text-red-600" : ""}`}>{mmss}</span>
          </div>

          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted">
            <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-accent" aria-hidden />
            รอการชำระเงิน · Waiting for payment…
          </div>
          <p className="mt-3 text-xs text-muted">หมายเลขคิวจะปรากฏหลังชำระเงินสำเร็จ · Your queue number appears once payment is confirmed.</p>

          <button onClick={startOver} disabled={pending} className="mt-4 w-full rounded-xl border border-border py-2.5 text-sm hover:bg-bg">
            ยกเลิก · Cancel
          </button>
        </div>
      </div>
    );
  }

  // ---------- BROWSE (Phase F redesign) ----------
  return (
    <div className="min-h-dvh bg-bg pb-28">
      <StoreHeader pickup={menu.pickup_instruction} />
      {sectionNames.length ? <CategoryNav sections={sectionNames} active={activeSection || sectionNames[0]} onSelect={selectSection} /> : null}

      <div className="mx-auto max-w-md px-4 pt-4">
        {products.length === 0 ? <p className="text-sm text-muted">ยังไม่มีสินค้า · No items available.</p> : null}

        {sections.map(([section, items], idx) => (
          <section key={section} id={`qr-sec-${idx}`} className="mb-6" style={{ scrollMarginTop: 56 }}>
            <h2 className="mb-2 text-sm font-semibold text-fg">{section}</h2>
            <div className="space-y-2.5">
              {items.map((p) => <ProductCard key={p.product_id} product={p} onOpen={setOpenProduct} />)}
            </div>
          </section>
        ))}
        {msg ? <p className="text-sm text-red-600">{msg}</p> : null}
      </div>

      <CartBar count={cartCount} total={total} onOpen={() => setCartOpen(true)} />

      <ProductDetailSheet product={openProduct} onClose={() => setOpenProduct(null)} onAdd={addToCart} />

      <CartSheet
        open={cartOpen}
        items={cart}
        note={note}
        pending={pending}
        error={msg}
        onClose={() => setCartOpen(false)}
        onQty={setQty}
        onNote={setNote}
        onCheckout={checkout}
      />
    </div>
  );
}
