"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/admin", label: "ภาพรวม", en: "Overview", exact: true },
  { href: "/admin/products", label: "สินค้า", en: "Products" },
  { href: "/admin/categories", label: "หมวดหมู่", en: "Categories" },
  { href: "/admin/pricing", label: "ราคาสาขา", en: "Pricing" },
  { href: "/admin/recipes", label: "สูตร", en: "Recipes" },
  { href: "/admin/modifiers", label: "ตัวเลือก", en: "Modifiers" },
  { href: "/admin/inventory/items", label: "วัตถุดิบ", en: "Items" },
  { href: "/admin/inventory/receive", label: "รับสต๊อก", en: "Receive" },
  { href: "/admin/inventory/stock", label: "สต๊อกคงเหลือ", en: "Stock" },
  { href: "/admin/inventory/adjust", label: "ปรับสต๊อก", en: "Adjust" },
  { href: "/admin/inventory/movements", label: "ประวัติ", en: "Movements" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 border-b border-border pb-2">
      {tabs.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              active ? "bg-accent font-medium text-fg" : "text-fg/70 hover:bg-bg"
            }`}
          >
            {t.label} <span className="text-xs text-muted">{t.en}</span>
          </Link>
        );
      })}
    </nav>
  );
}
