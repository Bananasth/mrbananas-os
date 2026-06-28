import type { Metadata } from "next";
import { ModulePlaceholder } from "../_components/module-placeholder";

export const metadata: Metadata = { title: "การแจ้งเตือน · Notifications", robots: { index: false } };

export default function NotificationsPage() {
  return <ModulePlaceholder moduleKey="notifications" />;
}
