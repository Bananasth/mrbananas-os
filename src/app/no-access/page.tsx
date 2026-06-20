import type { Metadata } from "next";
import { site } from "@/site.config";
import { logout } from "@/server/auth/actions";

export const metadata: Metadata = { title: "ไม่มีสิทธิ์เข้าใช้งาน", robots: { index: false } };

export default function NoAccessPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg p-4 text-center">
      <div className="flex items-center gap-2 text-xl font-bold">
        <span aria-hidden>🍌</span>
        {site.name}
      </div>
      <p className="max-w-xs text-muted">
        บัญชีนี้ไม่มีสิทธิ์เข้าใช้งานระบบ · This account has no access to the admin area.
      </p>
      <form action={logout}>
        <button className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-fg transition-opacity hover:opacity-90">
          ออกจากระบบ · Sign out
        </button>
      </form>
    </div>
  );
}
