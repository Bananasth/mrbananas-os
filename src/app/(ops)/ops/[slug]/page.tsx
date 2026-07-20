import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/server/auth/guard";
import { loadUserPermissions } from "@/server/auth/permissions.load";
import { departmentBySlug, opsDepartments, OPS_ROLES } from "@/server/auth/module-routes";
import { Badge } from "../../../(dashboard)/admin/_components/ui";
import { DepartmentLinks } from "../../../(dashboard)/_components/department-cards";

export const metadata: Metadata = { title: "แผนกงาน · Department", robots: { index: false } };

/**
 * Operational department landing — the non-admin twin of /admin/departments/[slug].
 * Same registry, same permission engine; the only difference is that links hosted by the
 * owner-only /admin layout are shown as disabled instead of as dead links.
 */
export default async function OpsDepartmentPage({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireRole(OPS_ROLES);
  const { slug } = await params;
  const dept = departmentBySlug(slug);
  if (!dept) notFound();

  const roles = ctx.branchRoles.map((br) => br.role);
  // Owner fast-path (null perms) mirrors requireModule — no RBAC round-trip for the owner.
  const perms = ctx.primaryRole === "owner" ? null : await loadUserPermissions(ctx);
  // Read-only mirror of the existing admin-layout flag; this shell never changes it.
  const adminRoles = process.env.ADMIN_MANAGER_ACCESS === "true" ? ["owner", "manager"] : ["owner"];
  const canEnterAdmin = roles.some((r) => adminRoles.includes(r));

  // Reuse the shell's own filter so the hub and this page can never disagree.
  const links = opsDepartments(perms, roles, { canEnterAdmin }).find((d) => d.slug === slug)?.links ?? [];

  return (
    <div className="space-y-6">
      <Link href="/ops" className="text-sm text-accent hover:underline">
        ← งานประจำวัน · Operations
      </Link>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-3xl" aria-hidden>
            {dept.icon}
          </span>
          <h2 className="text-xl font-bold">
            {dept.th} <span className="text-base font-normal text-muted">{dept.en}</span>
          </h2>
          {dept.scope === "POST_LAUNCH" ? <Badge tone="neutral">หลังเปิดร้าน · Post-launch</Badge> : null}
        </div>
        <p className="text-sm text-muted">{dept.desc}</p>
      </div>

      {links.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted">
          บัญชีนี้ยังไม่มีสิทธิ์เข้าถึงงานในแผนกนี้ · No permitted pages in this department.
        </p>
      ) : (
        <DepartmentLinks links={links} />
      )}
    </div>
  );
}
