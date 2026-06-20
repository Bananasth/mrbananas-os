import type { ReactNode } from "react";
import { logout } from "@/server/auth/actions";
import { requireRole } from "@/server/auth/guard";

/** Protected admin shell. Only owner/manager may enter; others -> /no-access. */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const ctx = await requireRole(["owner", "manager"]);
  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-20 border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
          <span className="flex items-center gap-2 text-lg font-bold">
            <span aria-hidden>🍌</span>
            แดชบอร์ดผู้ดูแล
          </span>
          <div className="flex items-center gap-4">
            <span className="text-sm capitalize text-muted">{ctx.primaryRole}</span>
            <form action={logout}>
              <button className="rounded-md border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-bg">
                ออกจากระบบ
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>
    </div>
  );
}
