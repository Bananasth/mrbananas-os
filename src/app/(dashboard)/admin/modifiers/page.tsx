import type { Metadata } from "next";
import { listModifierGroups } from "@/server/services";
import { Card, CardContent, CardHeader, CardTitle, th } from "../_components/ui";
import { ServiceErrorCard } from "../_components/service-error";
import { GroupForm } from "./group-form";
import { GroupRow } from "./group-row";

export const metadata: Metadata = { title: "Modifiers · Setup", robots: { index: false } };

export default async function ModifiersPage() {
  const groups = await listModifierGroups();
  if (!groups.ok) return <ServiceErrorCard error={groups.error} />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>เพิ่มกลุ่มตัวเลือก · New modifier group</CardTitle>
        </CardHeader>
        <CardContent>
          <GroupForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>กลุ่มตัวเลือก · Modifier groups ({groups.value.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {groups.value.length === 0 ? (
            <p className="text-sm text-muted">ยังไม่มีกลุ่ม · No groups yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className={th}>ชื่อ · Name</th>
                  <th className={th}>ชนิด · Type</th>
                  <th className={th}>เลือก · Min–Max</th>
                  <th className={th}>สถานะ · Status</th>
                  <th className="py-2 text-right font-medium">จัดการ · Actions</th>
                </tr>
              </thead>
              <tbody>
                {groups.value.map((g) => (
                  <GroupRow key={g.id} group={g} />
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
