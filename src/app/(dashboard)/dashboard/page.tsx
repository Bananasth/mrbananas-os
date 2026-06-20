import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/server/auth/guard";

export const metadata: Metadata = { title: "แดชบอร์ด · Dashboard", robots: { index: false } };

export default async function DashboardPage() {
  const ctx = await requireRole(["owner", "manager"]);
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const facts: { label: string; value: string }[] = [
    { label: "อีเมล · Email", value: user?.email ?? "—" },
    { label: "บทบาท · Role", value: ctx.primaryRole },
    { label: "สาขา · Branches", value: String(ctx.branchIds.length) },
    { label: "Session ver.", value: String(ctx.sessionVersion) },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">ยินดีต้อนรับ 🍌</h1>
        <p className="mt-1 text-sm text-muted">
          คุณเข้าสู่ระบบในฐานะ <span className="font-medium capitalize text-fg">{ctx.primaryRole}</span>
        </p>
      </div>

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {facts.map((f) => (
          <div key={f.label} className="rounded-xl border border-border bg-card p-4">
            <dt className="text-xs font-medium text-muted">{f.label}</dt>
            <dd className="mt-1 truncate text-sm font-semibold" title={f.value}>
              {f.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted">
        <p className="font-medium text-fg">บริบทผู้เช่า · Tenant context</p>
        <p className="mt-2 font-mono text-xs">tenant_id: {ctx.tenantId}</p>
        <p className="font-mono text-xs">user_id: {ctx.userId}</p>
      </div>
    </div>
  );
}
