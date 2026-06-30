import type { Metadata } from "next";
import { ModulePlaceholder } from "../_components/module-placeholder";

export const metadata: Metadata = { title: "การผลิต · Production", robots: { index: false } };

export default function ProductionPage() {
  return <ModulePlaceholder moduleKey="production" />;
}
