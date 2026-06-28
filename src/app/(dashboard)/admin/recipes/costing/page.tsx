import type { Metadata } from "next";
import { ModulePlaceholder } from "../../_components/module-placeholder";

export const metadata: Metadata = { title: "ต้นทุน · Costing", robots: { index: false } };

export default function CostingPage() {
  return <ModulePlaceholder moduleKey="recipes" />;
}
