import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/server/auth/guard";
import { loadUserPermissions } from "@/server/auth/permissions.load";
import { visibleDepartments } from "@/server/auth/module-routes";
import { DepartmentGrid } from "../_components/department-cards";

export const metadata: Metadata = { title: "แดชบอร์ด · Dashboard", robots: { index: false } };

export default async function DashboardPage() {
  const ctx = await requireRole(["owner", "manager"]);
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Department landings live under the /admin layout, so only show entry points to users that
  // layout actually admits — mirrors admin/layout.tsx exactly (no second rule, no weakening).
  const adminRoles = process.env.ADMIN_MANAGER_ACCESS === "true" ? ["owner", "manager"] : ["owner"];
  const canEnterAdmin = ctx.branchRoles.some((br) => adminRoles.includes(br.role));

  // Department entry points, filtered per link by the existing RBAC engine.
  // Owner fast-path (null perms) mirrors requireModule — no RBAC round-trip for the owner.
  const perms = ctx.primaryRole === "owner" ? null : await loadUserPermissions(ctx);
  const departments = canEnterAdmin
    ? visibleDepartments(perms, ctx.branchRoles.map((br) => br.role))
    : [];

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

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">
            แผนกงาน <span className="text-sm font-normal text-muted">Departments</span>
          </h2>
          {canEnterAdmin ? (
            <Link href="/admin" className="text-sm text-accent hover:underline">
              ตั้งค่าระบบ · Setup →
            </Link>
          ) : null}
        </div>
        {departments.length === 0 ? (
          <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted">
            บัญชีนี้ยังไม่มีสิทธิ์เข้าถึงแผนกงานใด · No permitted departments.
          </p>
        ) : (
          <DepartmentGrid departments={departments} />
        )}
      </section>

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
