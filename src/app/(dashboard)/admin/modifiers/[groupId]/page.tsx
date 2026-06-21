import type { Metadata } from "next";
import Link from "next/link";
import { getModifierGroupDetail } from "@/server/services";
import { Card, CardContent, CardHeader, CardTitle, th } from "../../_components/ui";
import { ServiceErrorCard } from "../../_components/service-error";
import { OptionForm } from "./option-form";
import { OptionRow } from "./option-row";

export const metadata: Metadata = { title: "Modifier options · Setup", robots: { index: false } };

export default async function GroupOptionsPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const res = await getModifierGroupDetail(groupId);
  if (!res.ok) return <ServiceErrorCard error={res.error} />;
  if (!res.value) return <p className="text-sm text-muted">ไม่พบกลุ่ม · Group not found.</p>;
  const group = res.value;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">
          {group.name}{" "}
          <span className="text-sm font-normal text-muted">
            {group.selection_type} · {group.display_type} · {group.min_select}–{group.max_select}
          </span>
        </h2>
        <Link href="/admin/modifiers" className="text-sm hover:text-accent-dark">
          ← กลับ · Back
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>เพิ่มตัวเลือก · New option</CardTitle>
        </CardHeader>
        <CardContent>
          <OptionForm groupId={groupId} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ตัวเลือก · Options ({group.options.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {group.options.length === 0 ? (
            <p className="text-sm text-muted">ยังไม่มีตัวเลือก · No options yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className={th}>ชื่อ · Name</th>
                  <th className={th}>ปรับราคา · Price</th>
                  <th className={th}>รหัส · Code</th>
                  <th className={th}>สถานะ · Status</th>
                  <th className="py-2 text-right font-medium">จัดการ · Actions</th>
                </tr>
              </thead>
              <tbody>
                {group.options.map((o) => (
                  <OptionRow key={o.id} option={o} groupId={groupId} />
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
