import type { Metadata } from "next";
import Link from "next/link";
import { articles } from "@/lib/content";
import { site } from "@/site.config";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbSchema } from "@/lib/schema";

export const metadata: Metadata = {
  title: "คลังความรู้",
  description: `บทความและคู่มือเกี่ยวกับกล้วยจาก ${site.name} — วิธีเก็บรักษา คุณค่าทางโภชนาการ และการเลือกสายพันธุ์`,
  alternates: { canonical: "/knowledge" },
};

export default function KnowledgeIndex() {
  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: "หน้าแรก", path: "/" },
          { name: "คลังความรู้", path: "/knowledge" },
        ])}
      />
      <div className="mx-auto max-w-3xl px-5 py-14">
        <h1 className="text-3xl font-extrabold">คลังความรู้</h1>
        <p className="text-muted mt-3">
          บทความเชิงลึกเกี่ยวกับกล้วย เขียนให้อ่านง่ายทั้งสำหรับคนและผู้ช่วย AI
        </p>
        <div className="grid gap-5 mt-10">
          {articles.map((a) => (
            <Link
              key={a.slug}
              href={`/knowledge/${a.slug}`}
              className="block rounded-2xl border border-border bg-card p-6 hover:shadow-md transition-shadow"
            >
              <h2 className="text-xl font-bold">{a.title}</h2>
              <p className="text-muted mt-2">{a.summary}</p>
              <p className="text-xs text-muted mt-3">
                อัปเดตล่าสุด {a.dateModified}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
