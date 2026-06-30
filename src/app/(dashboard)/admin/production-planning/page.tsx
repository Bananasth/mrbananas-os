import type { Metadata } from "next";
import { ModulePlaceholder } from "../_components/module-placeholder";

export const metadata: Metadata = { title: "วางแผนการผลิต · Production Planning", robots: { index: false } };

export default function ProductionPlanningPage() {
  return <ModulePlaceholder moduleKey="production-planning" />;
}
