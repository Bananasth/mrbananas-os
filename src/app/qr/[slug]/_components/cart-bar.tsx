"use client";

import { baht, BRAND } from "./shared";

/** Floating bottom bar summarising the cart; tap to open the cart sheet. */
export function CartBar({ count, total, onOpen }: { count: number; total: number; onOpen: () => void }) {
  if (count === 0) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
      <button
        onClick={onOpen}
        className="mx-auto flex w-full max-w-md items-center justify-between rounded-2xl px-5 py-3.5 font-semibold text-white shadow-lg"
        style={{ background: BRAND.primary }}
      >
        <span className="flex items-center gap-2">
          <span
            className="flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-sm font-bold"
            style={{ background: BRAND.secondary, color: "#111827" }}
          >
            {count}
          </span>
          ดูตะกร้า · View cart
        </span>
        <span className="tabular-nums">{baht(total)}</span>
      </button>
    </div>
  );
}
