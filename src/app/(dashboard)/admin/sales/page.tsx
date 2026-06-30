import type { Metadata } from "next";
import { ModulePlaceholder } from "../_components/module-placeholder";

export const metadata: Metadata = { title: "การขาย · Sales", robots: { index: false } };

export default function SalesPage() {
  return <ModulePlaceholder moduleKey="sales" />;
}
