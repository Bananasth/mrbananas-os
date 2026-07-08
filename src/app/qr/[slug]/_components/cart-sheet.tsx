"use client";

import { Sheet } from "./sheet";
import { baht, BRAND, type CartItem } from "./shared";

/** Cart review sheet: edit quantities, add a note, and check out (hands off to the existing pay flow). */
export function CartSheet({
  open,
  items,
  note,
  pending,
  error,
  onClose,
  onQty,
  onNote,
  onCheckout,
}: {
  open: boolean;
  items: CartItem[];
  note: string;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onQty: (key: string, delta: number) => void;
  onNote: (v: string) => void;
  onCheckout: () => void;
}) {
  const total = items.reduce((s, c) => s + c.unitPrice * c.qty, 0);
  return (
    <Sheet open={open} onClose={onClose} title="ตะกร้า · Cart">
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">ตะกร้าว่าง · Your cart is empty.</p>
      ) : (
        <div className="space-y-3">
          {items.map((c) => (
            <div key={c.key} className="flex items-center justify-between gap-2 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium">{c.name}</div>
                {c.optionLabel ? <div className="truncate text-xs text-muted">{c.optionLabel}</div> : null}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => onQty(c.key, -1)} className="h-7 w-7 rounded-full border border-border">−</button>
                <span className="w-5 text-center tabular-nums">{c.qty}</span>
                <button onClick={() => onQty(c.key, 1)} className="h-7 w-7 rounded-full border border-border">+</button>
                <span className="w-16 text-right tabular-nums">{baht(c.unitPrice * c.qty)}</span>
              </div>
            </div>
          ))}

          <input
            value={note}
            onChange={(e) => onNote(e.target.value)}
            placeholder="หมายเหตุ · Note (optional)"
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            onClick={onCheckout}
            disabled={pending}
            className="flex w-full items-center justify-between rounded-xl px-4 py-3 font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: BRAND.accent }}
          >
            <span>{pending ? "กำลังดำเนินการ…" : "ชำระเงิน · Checkout"}</span>
            <span className="tabular-nums">{baht(total)}</span>
          </button>
        </div>
      )}
    </Sheet>
  );
}
