"use client";

import { useMemo, useState } from "react";
import type { QrProduct } from "@/server/services/qr-public";
import { Sheet } from "./sheet";
import { baht, BRAND, type CartItem, type QrGroup } from "./shared";

/** Product detail bottom sheet: image placeholder, description fallback, option selectors, qty, add. */
export function ProductDetailSheet({
  product,
  onClose,
  onAdd,
}: {
  product: QrProduct | null;
  onClose: () => void;
  onAdd: (item: Omit<CartItem, "qty">, qty: number) => void;
}) {
  if (!product) return null;
  return <Inner key={product.product_id} product={product} onClose={onClose} onAdd={onAdd} />;
}

/**
 * Normalise a modifier group's selection rules from its settings (never hard-coded).
 * Defensive defaults so a missing/null field can never silently disable validation:
 *  - selection_type is authoritative; if absent, inferred from max_select.
 *  - required groups always demand at least 1 selection.
 *  - single-select is always capped at 1; multi-select respects max_select (else unbounded).
 */
function groupRules(g: QrGroup) {
  const isRequired = !!g.is_required;
  const type: "single" | "multiple" =
    g.selection_type === "single" || g.selection_type === "multiple"
      ? g.selection_type
      : Number(g.max_select) > 1
        ? "multiple"
        : "single";
  const rawMin = Number.isFinite(g.min_select) ? Number(g.min_select) : 0;
  const min = isRequired ? Math.max(rawMin, 1) : Math.max(rawMin, 0);
  const max =
    type === "single"
      ? 1
      : Number.isFinite(g.max_select) && Number(g.max_select) > 0
        ? Math.max(Number(g.max_select), min)
        : Infinity;
  return { isRequired, type, min, max };
}

function Inner({
  product,
  onClose,
  onAdd,
}: {
  product: QrProduct;
  onClose: () => void;
  onAdd: (item: Omit<CartItem, "qty">, qty: number) => void;
}) {
  const groups = product.modifier_groups ?? [];
  const [qty, setQty] = useState(1);
  const [touched, setTouched] = useState(false);
  const [sel, setSel] = useState<Record<string, string[]>>(() => {
    const init: Record<string, string[]> = {};
    for (const g of groups) {
      const def = g.options.find((o) => o.is_default);
      init[g.group_id] = g.is_required && def ? [def.option_id] : [];
    }
    return init;
  });

  function toggle(g: QrGroup, optId: string) {
    setTouched(true);
    const { type, isRequired, max } = groupRules(g);
    setSel((prev) => {
      const cur = prev[g.group_id] ?? [];
      if (type === "single") {
        // Selecting an option deselects the previous one; only one may be selected.
        if (cur[0] === optId) return { ...prev, [g.group_id]: isRequired ? cur : [] };
        return { ...prev, [g.group_id]: [optId] };
      }
      // multiple: toggle on/off, but never exceed max_select.
      if (cur.includes(optId)) return { ...prev, [g.group_id]: cur.filter((x) => x !== optId) };
      if (cur.length >= max) return prev;
      return { ...prev, [g.group_id]: [...cur, optId] };
    });
  }

  // Validate every group against its own rules.
  const groupState = useMemo(
    () =>
      groups.map((g) => {
        const r = groupRules(g);
        const count = (sel[g.group_id] ?? []).length;
        // Required groups must meet their minimum; optional multi-select groups, once
        // started, must also reach their minimum (respects min_select for rule 4).
        const invalid = r.isRequired ? count < r.min : count > 0 && count < r.min;
        return { g, r, count, invalid };
      }),
    [groups, sel],
  );

  const firstInvalid = groupState.find((s) => s.invalid);
  const canAdd = !firstInvalid;

  const optionIds = groups.flatMap((g) => sel[g.group_id] ?? []);
  const adjust = groups.reduce(
    (s, g) => s + (sel[g.group_id] ?? []).reduce((a, id) => a + (g.options.find((o) => o.option_id === id)?.price_adjustment ?? 0), 0),
    0,
  );
  const unitPrice = product.price + adjust;
  const optionLabel = groups
    .flatMap((g) => (sel[g.group_id] ?? []).map((id) => g.options.find((o) => o.option_id === id)?.name).filter(Boolean))
    .join(", ");

  return (
    <Sheet open onClose={onClose} title={product.name}>
      {/* Image placeholder + description fallback (real content arrives with the future menu DB step) */}
      <div
        className="mb-3 flex h-40 w-full items-center justify-center rounded-xl text-5xl"
        style={{ background: `${BRAND.secondary}33` }}
        aria-hidden
      >
        🍌
      </div>
      <div className="mb-1 text-lg font-bold tabular-nums" style={{ color: BRAND.primary }}>
        {baht(product.price)}
      </div>
      <p className="text-sm text-muted">ทำสดใหม่ทุกออเดอร์ · Freshly made to order.</p>

      {groupState.map(({ g, r, count, invalid }) => {
        const showError = invalid && touched;
        const atMax = r.type === "multiple" && Number.isFinite(r.max) && count >= r.max;
        const hint =
          r.type === "single"
            ? r.isRequired
              ? "เลือก 1 · pick one"
              : "ไม่บังคับ · optional"
            : `เลือกได้${r.min > 0 ? ` ${r.min}` : ""}${Number.isFinite(r.max) ? `–${r.max}` : "+"} · pick${r.min > 0 ? ` ${r.min}` : ""}${Number.isFinite(r.max) ? `–${r.max}` : "+"}`;
        return (
          <div key={g.group_id} className="mt-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs font-medium text-muted">
                {g.name}
                {r.isRequired ? <span style={{ color: BRAND.accent }}> *</span> : null}
              </p>
              <span className="text-[11px]" style={showError ? { color: BRAND.accent } : undefined}>
                {showError ? "กรุณาเลือก · required" : hint}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {g.options.map((o) => {
                const on = (sel[g.group_id] ?? []).includes(o.option_id);
                const blocked = !on && atMax; // multi-select max reached
                return (
                  <button
                    key={o.option_id}
                    onClick={() => toggle(g, o.option_id)}
                    disabled={blocked}
                    className={`rounded-full border px-3 py-1.5 text-sm ${on ? "font-medium text-white" : "border-border"} ${
                      blocked ? "opacity-40" : ""
                    }`}
                    style={on ? { background: BRAND.primary, borderColor: BRAND.primary } : undefined}
                  >
                    {o.name}
                    {o.price_adjustment ? ` (+${baht(o.price_adjustment)})` : ""}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="mt-5 flex items-center justify-center gap-4">
        <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="h-10 w-10 rounded-full border border-border text-xl">−</button>
        <span className="w-8 text-center text-lg font-semibold tabular-nums">{qty}</span>
        <button onClick={() => setQty((q) => q + 1)} className="h-10 w-10 rounded-full border border-border text-xl">+</button>
      </div>

      {!canAdd && touched && firstInvalid ? (
        <p className="mt-3 text-center text-sm" style={{ color: BRAND.accent }}>
          กรุณาเลือก {firstInvalid.g.name} · Please choose {firstInvalid.g.name}
        </p>
      ) : null}

      <button
        disabled={!canAdd}
        onClick={() => {
          if (!canAdd) {
            setTouched(true);
            return;
          }
          onAdd(
            { key: `${product.product_id}|${[...optionIds].sort().join(",")}`, productId: product.product_id, name: product.name, optionIds, optionLabel, unitPrice },
            qty,
          );
          onClose();
        }}
        className="mt-4 flex w-full items-center justify-between rounded-xl px-4 py-3 font-semibold text-white disabled:opacity-40"
        style={{ background: BRAND.accent }}
      >
        <span>{canAdd ? "เพิ่มลงตะกร้า · Add to cart" : "เลือกตัวเลือก · Choose options"}</span>
        {canAdd ? <span className="tabular-nums">{baht(unitPrice * qty)}</span> : null}
      </button>
    </Sheet>
  );
}
