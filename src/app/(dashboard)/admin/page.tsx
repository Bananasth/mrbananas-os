import type { Metadata } from "next";
import Link from "next/link";
import { requireModule } from "@/server/auth/guard";
import { loadUserPermissions } from "@/server/auth/permissions.load";
import { canSeeDeptLink, departmentBySlug } from "@/server/auth/module-routes";
import { DepartmentLinks } from "../_components/department-cards";

export const metadata: Metadata = { title: "Setup", robots: { index: false } };

/**
 * Setup hub. The quick-links are now derived from the department registry (the same source the
 * nav and the department landing pages use) instead of a private hardcoded list, so there is one
 * navigation definition and the cards respect RBAC. Every destination the page showed before —
 * products, categories, pricing, recipes, receive stock, stock — is still here.
 */
const SETUP_SLUGS = ["catalog", "inventory", "settings"] as const;

export default async function AdminHubPage() {
  // Phase 2A: RBAC module gate (owner fast-paths through; layout remains owner-only).
  const ctx = await requireModule("dashboard");
  // Owner fast-path (null perms) mirrors requireModule — no RBAC round-trip for the owner.
  const perms = ctx.primaryRole === "owner" ? null : await loadUserPermissions(ctx);
  const roles = ctx.branchRoles.map((br) => br.role);

  const groups = SETUP_SLUGS.map((slug) => departmentBySlug(slug)).flatMap((d) =>
    d ? [{ dept: d, links: d.links.filter((l) => canSeeDeptLink(perms, roles, l)) }] : [],
  );

  return (
    <div className="space-y-8">
      <Link href="/dashboard" className="block text-sm text-accent hover:underline">
        ← แดชบอร์ดและแผนกงาน · Dashboard &amp; departments
      </Link>
      {groups.map(({ dept, links }) =>
        links.length === 0 ? null : (
          <section key={dept.slug} className="space-y-3">
            <h2 className="text-lg font-bold">
              {dept.th} <span className="text-sm font-normal text-muted">{dept.en}</span>
            </h2>
            <DepartmentLinks links={links} />
          </section>
        ),
      )}
    </div>
  );
}
