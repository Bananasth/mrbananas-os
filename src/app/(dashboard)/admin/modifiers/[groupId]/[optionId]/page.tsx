import type { Metadata } from "next";
import Link from "next/link";
import { getModifierGroupDetail, listInventoryItems } from "@/server/services";
import { Card, CardContent, CardHeader, CardTitle, th } from "../../../_components/ui";
import { ServiceErrorCard } from "../../../_components/service-error";
import { deleteEffectAction } from "../../actions";
import { EffectForm } from "./effect-form";

export const metadata: Metadata = { title: "Option effects · Setup", robots: { index: false } };

export default async function OptionEffectsPage({
  params,
}: {
  params: Promise<{ groupId: string; optionId: string }>;
}) {
  const { groupId, optionId } = await params;
  const [detail, items] = await Promise.all([getModifierGroupDetail(groupId), listInventoryItems()]);
  if (!detail.ok) return <ServiceErrorCard error={detail.error} />;
  if (!detail.value) return <p className="text-sm text-muted">ไม่พบกลุ่ม · Group not found.</p>;
  const option = detail.value.options.find((o) => o.id === optionId);
  if (!option) return <p className="text-sm text-muted">ไม่พบตัวเลือก · Option not found.</p>;
  const itemName = new Map(
    (items.ok ? items.value : []).map((it) => [it.id, it.name ?? it.item_kind]),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">
          {detail.value.name} / {option.name}{" "}
          <span className="text-sm font-normal text-muted">ผลต่อสต๊อก · Stock effects</span>
        </h2>
        <Link href={`/admin/modifiers/${groupId}`} className="text-sm hover:text-accent-dark">
          ← กลับ · Back
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>เพิ่มผลต่อสต๊อก · New effect</CardTitle>
        </CardHeader>
        <CardContent>
          <EffectForm groupId={groupId} optionId={optionId} items={items.ok ? items.value : []} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ผลต่อสต๊อก · Effects ({option.effects.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {option.effects.length === 0 ? (
            <p className="text-sm text-muted">
              ยังไม่มีผล (ออปชันนี้ไม่กระทบสต๊อก) · No effects (this option does not change stock).
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className={th}>ชนิด · Type</th>
                  <th className={th}>เป้าหมาย · Target</th>
                  <th className={th}>แทนด้วย · New</th>
                  <th className={th}>จำนวน · Qty</th>
                  <th className="py-2 text-right font-medium">จัดการ · Actions</th>
                </tr>
              </thead>
              <tbody>
                {option.effects.map((e) => (
                  <tr key={e.id} className="border-b border-border/60">
                    <td className="py-2 pr-3 font-mono text-xs">{e.effect_type}</td>
                    <td className="py-2 pr-3">{e.target_item_id ? (itemName.get(e.target_item_id) ?? "—") : "—"}</td>
                    <td className="py-2 pr-3">{e.new_item_id ? (itemName.get(e.new_item_id) ?? "—") : "—"}</td>
                    <td className="py-2 pr-3 tabular-nums">
                      {e.quantity ?? "—"} {e.unit ?? ""}
                    </td>
                    <td className="py-2 text-right">
                      <form action={deleteEffectAction}>
                        <input type="hidden" name="id" value={e.id} />
                        <input type="hidden" name="groupId" value={groupId} />
                        <input type="hidden" name="optionId" value={optionId} />
                        <button
                          type="submit"
                          className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                        >
                          ลบ · Delete
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
