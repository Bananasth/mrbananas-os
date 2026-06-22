import type { ReactNode } from "react";
import { logout } from "@/server/auth/actions";
import { requireRole } from "@/server/auth/guard";

/** Station-board shell — owner / manager / staff / baker. */
export default async function BarLayout({ children }: { children: ReactNode }) {
  const ctx = await requireRole(["owner", "manager", "staff", "baker"]);
  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-20 border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <span className="flex items-center gap-2 font-bold">
            <span aria-hidden>🍌</span> Bar Station
          </span>
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
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
