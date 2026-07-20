"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/server/auth/module-routes";

/**
 * Permission-filtered admin nav. Items are resolved server-side (RBAC) in the admin layout and
 * passed in; this component only renders + tracks the active tab. Order is preserved by the
 * server. `import type` keeps this a client-safe (server-only module is erased at build).
 */
export function AdminNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 border-b border-border pb-2">
      {items.map((t) => {
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
