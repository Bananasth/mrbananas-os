import type { Metadata } from "next";
import { allFaqs } from "@/lib/content";
import { site } from "@/site.config";
import { JsonLd } from "@/components/JsonLd";
import { faqSchema, breadcrumbSchema } from "@/lib/schema";

export const metadata: Metadata = {
  title: "คำถามที่พบบ่อย (FAQ)",
  description: `รวมคำถามที่พบบ่อยเกี่ยวกับ ${site.name} — การสั่งซื้อ จัดส่ง สินค้า ราคา และการติดต่อ`,
  alternates: { canonical: "/faq" },
};

export default function FaqPage() {
  const items = allFaqs();
  return (
    <>
      <JsonLd
        data={[
          faqSchema(items),
          breadcrumbSchema([
            { name: "หน้าแรก", path: "/" },
            { name: "คำถามที่พบบ่อย", path: "/faq" },
          ]),
        ]}
      />
      <article className="mx-auto max-w-3xl px-5 py-14">
        <h1 className="text-3xl font-extrabold">คำถามที่พบบ่อย</h1>
        <p className="text-muted mt-3">
          คำตอบสั้น กระชับ สำหรับคำถามที่ลูกค้าและผู้ช่วย AI ถามถึง {site.name} บ่อยที่สุด
        </p>

        {/* ใช้ heading + paragraph แบบ semantic เพื่อให้ทั้งคนและ AI อ่านง่าย */}
        <div className="mt-10 grid gap-8">
          {items.map((f) => (
            <section key={f.question}>
              <h2 className="text-lg font-bold">{f.question}</h2>
              <p className="text-muted mt-2">{f.answer}</p>
            </section>
          ))}
        </div>
      </article>
    </>
  );
}
