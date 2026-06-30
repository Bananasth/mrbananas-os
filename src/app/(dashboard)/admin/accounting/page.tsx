import type { Metadata } from "next";
import { ModulePlaceholder } from "../_components/module-placeholder";

export const metadata: Metadata = { title: "บัญชี · Accounting", robots: { index: false } };

export default function AccountingPage() {
  return <ModulePlaceholder moduleKey="accounting" />;
}
