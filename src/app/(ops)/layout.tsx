import type { ReactNode } from "react";
import Link from "next/link";
import { logout } from "@/server/auth/actions";
import { requireRole } from "@/server/auth/guard";
import { OPS_ROLES } from "@/server/auth/module-routes";

/**
 * Operational shell — the non-admin home for cashier/barista (staff), baker, accounting-
 * permissioned users and managers. Deliberately separate from the owner-only /admin layout:
 * it never relaxes that guard, it only gives operational users a surface of their own.
 *
 * Guard mirrors the other operational shells (/pos, /bar): every internal role. "customer" has
 * no internal surface and is redirected home by requireRole, so there is no redirect loop.
 */
export default async function OpsLayout({ children }: { children: ReactNode }) {
  const ctx = await requireRole(OPS_ROLES);
  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-20 border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/ops" className="flex items-center gap-2 font-bold">
            <span aria-hidden>🍌</span> งานประจำวัน
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-sm capitalize text-muted">{ctx.primaryRole}</span>
            <form action={logout}>
              <button className="rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-bg">
                ออกจากระบบ
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
