"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { visibleNav, type NavModule, type Role } from "./nav-config";

/** Is `href` the active route? Module landings match exactly; deeper links by prefix. */
function isActive(pathname: string, href: string, exact: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

function PlannedDot() {
  return (
    <span
      title="ยังไม่เปิดใช้งาน · Planned"
      className="ml-auto inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-muted/50"
      aria-hidden
    />
  );
}

function Leaf({
  href,
  label,
  en,
  active,
  planned,
  external,
  depth,
}: {
  href: string;
  label: string;
  en: string;
  active: boolean;
  planned: boolean;
  external?: boolean;
  depth: number;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 rounded-md py-1.5 pr-2 text-sm transition-colors ${
        depth === 2 ? "pl-9" : "pl-8"
      } ${active ? "bg-accent font-medium text-fg" : "text-fg/70 hover:bg-bg"}`}
    >
      <span className="truncate">
        {label} <span className="text-xs text-muted">{en}</span>
        {external ? <span className="ml-1 text-xs text-muted">↗</span> : null}
      </span>
      {planned ? <PlannedDot /> : null}
    </Link>
  );
}

function Module({ mod, pathname }: { mod: NavModule; pathname: string }) {
  const moduleActive = isActive(pathname, mod.href, mod.href === "/admin");
  const childActive = mod.items?.some(
    (i) => isActive(pathname, i.href, false) || i.children?.some((c) => isActive(pathname, c.href, false)),
  );
  const [open, setOpen] = useState<boolean>(Boolean(moduleActive || childActive));
  const hasItems = (mod.items?.length ?? 0) > 0;

  return (
    <li>
      <div className="flex items-center">
        <Link
          href={mod.href}
          className={`flex flex-1 items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors ${
            moduleActive ? "bg-accent font-semibold text-fg" : "font-medium text-fg/90 hover:bg-bg"
          }`}
        >
          <span aria-hidden>{mod.icon}</span>
          <span className="truncate">
            {mod.label} <span className="text-xs font-normal text-muted">{mod.en}</span>
          </span>
          {mod.status === "planned" && !hasItems ? <PlannedDot /> : null}
        </Link>
        {hasItems ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "ย่อ · Collapse" : "ขยาย · Expand"}
            className="ml-1 rounded-md px-1.5 py-1 text-xs text-muted hover:bg-bg"
          >
            {open ? "▾" : "▸"}
          </button>
        ) : null}
      </div>

      {hasItems && open ? (
        <ul className="mt-0.5 space-y-0.5">
          {mod.items!.map((item) => (
            <li key={`${mod.key}:${item.en}`}>
              <Leaf
                href={item.href}
                label={item.label}
                en={item.en}
                active={isActive(pathname, item.href, false) && item.href !== mod.href}
                planned={item.status === "planned"}
                external={item.external}
                depth={1}
              />
              {item.children?.length ? (
                <ul className="space-y-0.5">
                  {item.children.map((c) => (
                    <Leaf
                      key={`${mod.key}:${item.en}:${c.en}`}
                      href={c.href}
                      label={c.label}
                      en={c.en}
                      active={isActive(pathname, c.href, false) && c.href !== mod.href}
                      planned={c.status === "planned"}
                      external={c.external}
                      depth={2}
                    />
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** Owner/admin console sidebar. Renders only the modules `role` may see. */
export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const modules = visibleNav(role);
  return (
    <nav className="w-60 shrink-0">
      <ul className="space-y-0.5">
        {modules.map((mod) => (
          <Module key={mod.key} mod={mod} pathname={pathname} />
        ))}
      </ul>
    </nav>
  );
}
