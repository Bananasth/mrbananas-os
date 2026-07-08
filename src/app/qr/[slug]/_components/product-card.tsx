"use client";

import type { QrProduct } from "@/server/services/qr-public";
import { baht, BRAND } from "./shared";

/** Product card with an image placeholder (no real images yet). Tapping opens the detail sheet. */
export function ProductCard({ product, onOpen }: { product: QrProduct; onOpen: (p: QrProduct) => void }) {
  return (
    <button
      onClick={() => onOpen(product)}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-2 text-left transition hover:shadow-sm"
    >
      {/* Image placeholder — real images arrive with the future menu-image DB step */}
      <div
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg text-2xl"
        style={{ background: `${BRAND.secondary}33` }}
        aria-hidden
      >
        🍌
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{product.name}</div>
        <div className="mt-1 text-sm font-semibold tabular-nums" style={{ color: BRAND.primary }}>
          {baht(product.price)}
        </div>
      </div>
      <span
        className="flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold text-white"
        style={{ background: BRAND.accent }}
        aria-hidden
      >
        +
      </span>
    </button>
  );
}
