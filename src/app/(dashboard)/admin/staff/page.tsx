import type { Metadata } from "next";
import { ModulePlaceholder } from "../_components/module-placeholder";

export const metadata: Metadata = { title: "พนักงาน / KPI · Staff", robots: { index: false } };

export default function StaffPage() {
  return <ModulePlaceholder moduleKey="staff" />;
}
