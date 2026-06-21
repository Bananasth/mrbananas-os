"use client";

import { useMemo, useState } from "react";
import type { GroupWithOptions, MenuItem, OptionWithEffects } from "@/server/services/types";

export type CartLine = {
  lineId: string;
  productId: string;
  name: string;
  recipeVersionId: string;
  qty: number;
  unitPrice: number; // base + selected price adjustments (satang)
  optionIds: string[];
  optionLabels: { name: string; priceAdjustment: number }[];
};

const fmt = (n: number) => (n / 100).toLocaleString("th-TH", { style: "currency", currency: "THB" });
const adj = (n: number) => (n > 0 ? ` (+${(n / 100).toLocaleString("th-TH")})` : n < 0 ? ` (${(n / 100).toLocaleString("th-TH")})` : "");

let SEQ = 0;
const nextId = () => `line-${Date.now()}-${SEQ++}`;

export function ModifierModal({
  item,
  groups,
  onAdd,
  onClose,
}: {
  item: MenuItem;
  groups: GroupWithOptions[];
  onAdd: (line: CartLine) => void;
  onClose: () => void;
}) {
  // selections: groupId -> selected option ids
  const [sel, setSel] = useState<Record<string, string[]>>(() => {
    const init: Record<string, string[]> = {};
    for (const g of groups) {
      const defaults = g.options.filter((o) => o.is_default).map((o) => o.id);
      init[g.id] = g.selection_type === "single" ? defaults.slice(0, 1) : defaults;
    }
    return init;
  });
  const [error, setError] = useState<string | null>(null);

  const optById = useMemo(() => {
    const m = new Map<string, OptionWithEffects>();
    for (const g of groups) for (const o of g.options) m.set(o.id, o);
    return m;
  }, [groups]);

  const chosen = useMemo(() => Object.values(sel).flat(), [sel]);
  const priceAdj = chosen.reduce((s, id) => s + (optById.get(id)?.price_adjustment ?? 0), 0);
  const unitPrice = item.unitPrice + priceAdj;

  function toggle(g: GroupWithOptions, optionId: string) {
    setError(null);
    setSel((prev) => {
      const cur = prev[g.id] ?? [];
      if (g.selection_type === "single") return { ...prev, [g.id]: [optionId] };
      // multiple
      if (cur.includes(optionId)) return { ...prev, [g.id]: cur.filter((x) => x !== optionId) };
      if (cur.length >= g.max_select) return prev; // respect max
      return { ...prev, [g.id]: [...cur, optionId] };
    });
  }

  function validateAndAdd() {
    for (const g of groups) {
      const n = (sel[g.id] ?? []).length;
      const min = Math.max(g.min_select, g.is_required ? 1 : 0);
      if (n < min) {
        setError(`เลือก "${g.name}" อย่างน้อย ${min} · choose at least ${min} for ${g.name}`);
        return;
      }
      if (n > g.max_select) {
        setError(`"${g.name}" เลือกได้ไม่เกิน ${g.max_select} · max ${g.max_select}`);
        return;
      }
    }
    onAdd({
      lineId: nextId(),
      productId: item.productId,
      name: item.name,
      recipeVersionId: item.recipeVersionId,
      qty: 1,
      unitPrice,
      optionIds: chosen,
      optionLabels: chosen.map((id) => {
        const o = optById.get(id);
        return { name: o?.name ?? "", priceAdjustment: o?.price_adjustment ?? 0 };
      }),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{item.name}</h2>
          <button onClick={onClose} className="text-muted hover:text-fg" aria-label="close">
            ✕
          </button>
        </div>

        <div className="space-y-4">
          {groups.map((g) => (
            <fieldset key={g.id} className="space-y-1">
              <legend className="text-sm font-semibold">
                {g.name}{" "}
                <span className="text-xs font-normal text-muted">
                  {g.is_required ? "(required)" : "(optional)"}
                  {g.selection_type === "multiple" ? ` · max ${g.max_select}` : ""}
                </span>
              </legend>

              {g.display_type === "dropdown" ? (
                <select
                  value={(sel[g.id] ?? [])[0] ?? ""}
                  onChange={(e) => toggle(g, e.target.value)}
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
                >
                  <option value="" disabled>
                    — choose —
                  </option>
                  {g.options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                      {adj(o.price_adjustment)}
                    </option>
                  ))}
                </select>
              ) : g.display_type === "button" ? (
                <div className="flex flex-wrap gap-2">
                  {g.options.map((o) => {
                    const on = (sel[g.id] ?? []).includes(o.id);
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => toggle(g, o.id)}
                        className={`rounded-md border px-3 py-1.5 text-sm ${on ? "border-accent bg-accent/20 font-medium" : "border-border hover:bg-bg"}`}
                      >
                        {o.name}
                        {adj(o.price_adjustment)}
                      </button>
                    );
                  })}
                </div>
              ) : (
                // radio (single) or checkbox (multiple)
                <div className="space-y-1">
                  {g.options.map((o) => {
                    const on = (sel[g.id] ?? []).includes(o.id);
                    const multi = g.selection_type === "multiple";
                    return (
                      <label key={o.id} className="flex items-center gap-2 text-sm">
                        <input
                          type={multi ? "checkbox" : "radio"}
                          name={g.id}
                          checked={on}
                          onChange={() => toggle(g, o.id)}
                          className="h-4 w-4"
                        />
                        <span>
                          {o.name}
                          <span className="text-muted">{adj(o.price_adjustment)}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </fieldset>
          ))}
        </div>

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
          <span className="font-bold tabular-nums">{fmt(unitPrice)}</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-bg">
              ยกเลิก · Cancel
            </button>
            <button
              onClick={validateAndAdd}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-fg hover:opacity-90"
            >
              เพิ่มลงตะกร้า · Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
