"use client";

import { BRAND } from "./shared";

/** Sticky horizontal category chips; tapping one jumps to that section (handled by the parent). */
export function CategoryNav({
  sections,
  active,
  onSelect,
}: {
  sections: string[];
  active: string;
  onSelect: (section: string) => void;
}) {
  return (
    <nav className="sticky top-0 z-30 border-b border-border bg-bg/95 backdrop-blur">
      <div className="mx-auto flex max-w-md gap-2 overflow-x-auto px-4 py-2">
        {sections.map((s) => {
          const on = s === active;
          return (
            <button
              key={s}
              onClick={() => onSelect(s)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition-colors ${
                on ? "font-semibold" : "border border-border font-medium text-fg/70 hover:bg-card"
              }`}
              style={on ? { background: BRAND.secondary, color: "#111827" } : undefined}
            >
              {s}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
