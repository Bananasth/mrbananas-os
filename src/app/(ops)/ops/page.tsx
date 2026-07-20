import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/server/auth/guard";
import { loadUserPermissions } from "@/server/auth/permissions.load";
import { opsDepartments, OPS_ROLES, POS_ROLES, BAR_ROLES } from "@/server/auth/module-routes";
import { DepartmentGrid } from "../../(dashboard)/_components/department-cards";

export const metadata: Metadata = { title: "งานประจำวัน · Operations", robots: { index: false } };

export default async function OpsHubPage() {
  const ctx = await requireRole(OPS_ROLES);
  const roles = ctx.branchRoles.map((br) => br.role);

  // Owner fast-path (null perms) mirrors requireModule — no RBAC round-trip for the owner.
  const perms = ctx.primaryRole === "owner" ? null : await loadUserPermissions(ctx);
  // Read-only mirror of the existing admin-layout flag; this shell never changes it.
  const adminRoles = process.env.ADMIN_MANAGER_ACCESS === "true" ? ["owner", "manager"] : ["owner"];
  const canEnterAdmin = roles.some((r) => adminRoles.includes(r));

  const departments = opsDepartments(perms, roles, { canEnterAdmin });

  // The two production surfaces, shown up-front because they are the daily work.
  const shortcuts = [
    { href: "/pos", th: "ขายหน้าร้าน", en: "POS", icon: "🧾", allow: POS_ROLES },
    { href: "/bar", th: "กระดานผลิต", en: "Station board", icon: "🥤", allow: BAR_ROLES },
  ].filter((s) => s.allow.some((r) => roles.includes(r)));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">งานประจำวัน 🍌</h1>
        <p className="mt-1 text-sm text-muted">
          เข้าสู่ระบบในฐานะ <span className="font-medium capitalize text-fg">{ctx.primaryRole}</span>
        </p>
      </div>

      {shortcuts.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">
            เริ่มทำงาน <span className="text-sm font-normal text-muted">Start work</span>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {shortcuts.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-5 transition-colors hover:border-accent"
              >
                <span className="text-3xl" aria-hidden>
                  {s.icon}
                </span>
                <span>
                  <span className="block font-bold">{s.th}</span>
                  <span className="block text-xs text-muted">{s.en}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-bold">
          แผนกงานของคุณ <span className="text-sm font-normal text-muted">Your departments</span>
        </h2>
        {departments.length === 0 ? (
          <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted">
            บัญชีนี้ยังไม่มีสิทธิ์เข้าถึงแผนกงานใด · No permitted departments. กรุณาติดต่อผู้ดูแลระบบ
          </p>
        ) : (
          <DepartmentGrid departments={departments} basePath="/ops" />
        )}
      </section>

      {canEnterAdmin ? (
        <Link href="/dashboard" className="inline-block text-sm text-accent hover:underline">
          แดชบอร์ดผู้ดูแล · Admin dashboard →
        </Link>
      ) : null}
    </div>
  );
}
