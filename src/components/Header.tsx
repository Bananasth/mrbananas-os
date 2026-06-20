import Link from "next/link";
import { site } from "@/site.config";

const nav = [
  { href: "/", label: "หน้าแรก" },
  { href: "/about", label: "เกี่ยวกับเรา" },
  { href: "/knowledge", label: "คลังความรู้" },
  { href: "/faq", label: "คำถามที่พบบ่อย" },
];

export function Header() {
  return (
    <header className="border-b border-border bg-card/80 backdrop-blur sticky top-0 z-20">
      <div className="mx-auto max-w-5xl px-5 h-16 flex items-center justify-between">
        <Link href="/" className="font-bold text-lg flex items-center gap-2">
          <span aria-hidden>🍌</span>
          {site.name}
        </Link>
        <nav aria-label="เมนูหลัก">
          <ul className="flex gap-5 text-sm font-medium">
            {nav.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="hover:text-accent-dark transition-colors">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
