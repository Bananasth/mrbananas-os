import type { Metadata } from "next";
import { ModulePlaceholder } from "../_components/module-placeholder";

export const metadata: Metadata = { title: "รายงาน · Reports", robots: { index: false } };

export default function ReportsPage() {
  return <ModulePlaceholder moduleKey="reports" />;
}
