import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "./_components/ui";

export const metadata: Metadata = { title: "Setup", robots: { index: false } };

const sections = [
  { href: "/admin/products", icon: "📦", th: "สินค้า", en: "Products", desc: "เพิ่ม/แก้ไขเมนูสินค้า" },
  { href: "/admin/categories", icon: "🏷️", th: "หมวดหมู่", en: "Categories", desc: "beverage · bakery" },
  { href: "/admin/pricing", icon: "💵", th: "ราคาสาขา", en: "Branch pricing", desc: "ตั้งราคาต่อสาขา" },
  { href: "/admin/recipes", icon: "📖", th: "สูตร", en: "Recipes", desc: "สูตรและเวอร์ชัน" },
  { href: "/admin/inventory/receive", icon: "➕", th: "รับสต๊อก", en: "Receive", desc: "รับวัตถุดิบเข้าคลัง" },
  { href: "/admin/inventory/stock", icon: "🏬", th: "สต๊อกคงเหลือ", en: "Stock", desc: "ยอดคงเหลือปัจจุบัน" },
];

export default function AdminHubPage() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {sections.map((s) => (
        <Link key={s.href} href={s.href} className="block">
          <Card className="h-full transition-colors hover:border-accent">
            <CardHeader className="flex-row items-center gap-3">
              <span className="text-2xl" aria-hidden>
                {s.icon}
              </span>
              <span>
                <CardTitle>{s.th}</CardTitle>
                <p className="text-sm text-muted">{s.en}</p>
              </span>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted">{s.desc}</p>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
