import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/server/auth/guard";
import { loadUserPermissions } from "@/server/auth/permissions.load";
import { canSeeDeptLink, departmentBySlug } from "@/server/auth/module-routes";
import { Badge } from "../../_components/ui";
import { DepartmentLinks } from "../../../_components/department-cards";

export const metadata: Metadata = { title: "แผนกงาน · Department", robots: { index: false } };

/**
 * One route serves every department — the registry is the single source of truth. Deliberately
 * NOT prerendered (no generateStaticParams): the page is behind an auth/RBAC guard and must be
 * rendered per request.
 */
export default async function DepartmentPage({ params }: { params: Promise<{ slug: string }> }) {
  // Same module gate the /admin hub uses; per-link RBAC below is the real authority.
  const ctx = await requireModule("dashboard");
  const { slug } = await params;
  const dept = departmentBySlug(slug);
  if (!dept) notFound();

  // Owner fast-path (null perms) mirrors requireModule — no RBAC round-trip for the owner.
  const perms = ctx.primaryRole === "owner" ? null : await loadUserPermissions(ctx);
  const roles = ctx.branchRoles.map((br) => br.role);
  const links = dept.links.filter((l) => canSeeDeptLink(perms, roles, l));

  return (
    <div className="space-y-6">
      <Link href="/dashboard" className="text-sm text-accent hover:underline">
        ← แดชบอร์ด · Dashboard
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
