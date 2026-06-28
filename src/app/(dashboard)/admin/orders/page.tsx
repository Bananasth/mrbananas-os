import type { Metadata } from "next";
import { ModulePlaceholder } from "../_components/module-placeholder";

export const metadata: Metadata = { title: "ออเดอร์ / คิว · Orders", robots: { index: false } };

export default function OrdersPage() {
  return <ModulePlaceholder moduleKey="orders" />;
}
