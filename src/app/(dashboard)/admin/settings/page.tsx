import type { Metadata } from "next";
import { ModulePlaceholder } from "../_components/module-placeholder";

export const metadata: Metadata = { title: "ตั้งค่า · Settings", robots: { index: false } };

export default function SettingsPage() {
  return <ModulePlaceholder moduleKey="settings" />;
}
