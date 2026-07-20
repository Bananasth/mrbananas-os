import Link from "next/link";
import type { DeptLink, DeptStatus, VisibleDepartment } from "@/server/auth/module-routes";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "../admin/_components/ui";

/**
 * Shared department presentation for the dashboard hub and the department landing pages.
 *
 * Pure rendering — every permission decision is made server-side by `visibleDepartments`
 * before anything reaches this component, so there is no client-only hiding and no flash of
 * unauthorised content. Links that have no page yet are rendered as non-interactive cards, so
 * a "missing" entry can never look ready or navigate anywhere.
 */

const STATUS: Record<DeptStatus, { th: string; tone: "success" | "warning" | "neutral" }> = {
  ready: { th: "พร้อมใช้งาน", tone: "success" },
  partial: { th: "อยู่ระหว่างพัฒนา", tone: "warning" },
  missing: { th: "ยังไม่มีหน้ารองรับ", tone: "neutral" },
};

function LinkBody({ link }: { link: DeptLink }) {
  const status = STATUS[link.status];
  return (
    <>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{link.th}</CardTitle>
          <Badge tone={status.tone}>{status.th}</Badge>
        </div>
        <p className="text-xs text-muted">{link.en}</p>
      </CardHeader>
      <CardContent className="space-y-1">
        <p className="text-sm text-muted">{link.desc}</p>
        {link.note ? <p className="text-xs text-muted/80">⚠️ {link.note}</p> : null}
      </CardContent>
    </>
  );
}

/** The link cards of a single department. */
export function DepartmentLinks({ links }: { links: readonly DeptLink[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {links.map((link) =>
        link.href ? (
          <Link key={`${link.th}-${link.href}`} href={link.href} className="block">
            <Card className="h-full transition-colors hover:border-accent">
              <LinkBody link={link} />
            </Card>
          </Link>
        ) : (
          <Card key={link.th} className="h-full opacity-60">
            <LinkBody link={link} />
          </Card>
        ),
      )}
    </div>
  );
}

/** The hub grid: one card per department, linking to its landing page. */
export function DepartmentGrid({ departments }: { departments: readonly VisibleDepartment[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {departments.map((d) => {
        const ready = d.links.filter((l) => l.status === "ready").length;
        return (
          <Link key={d.slug} href={`/admin/departments/${d.slug}`} className="block">
            <Card className="h-full transition-colors hover:border-accent">
              <CardHeader className="flex-row items-center gap-3">
                <span className="text-2xl" aria-hidden>
                  {d.icon}
                </span>
                <span className="min-w-0">
                  <CardTitle className="text-base">{d.th}</CardTitle>
                  <p className="text-xs text-muted">{d.en}</p>
                </span>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-muted">{d.desc}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={ready > 0 ? "success" : "neutral"}>
                    พร้อมใช้งาน {ready}/{d.links.length}
                  </Badge>
                  {d.scope === "POST_LAUNCH" ? <Badge tone="neutral">หลังเปิดร้าน</Badge> : null}
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
