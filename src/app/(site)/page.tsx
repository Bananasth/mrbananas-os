import Link from "next/link";
import { site } from "@/site.config";
import { faqs, articles } from "@/lib/content";
import { JsonLd } from "@/components/JsonLd";
import { faqSchema } from "@/lib/schema";

export default function HomePage() {
  return (
    <>
      {/* FAQ schema บนหน้าแรกด้วย เพื่อให้ AI หยิบคำตอบหลักได้ทันที */}
      <JsonLd data={faqSchema(faqs.slice(0, 4))} />

      {/* HERO */}
      <section className="mx-auto max-w-5xl px-5 pt-16 pb-12">
        <p className="text-accent-dark font-semibold tracking-wide">{site.tagline}</p>
        <h1 className="text-4xl sm:text-5xl font-extrabold mt-3 leading-tight">
          {site.name}
        </h1>
        {/* ย่อหน้าสรุปธุรกิจ — เขียนให้ AI ดึงไปตอบ "ร้านนี้คืออะไร" ได้เลย */}
        <p className="text-lg text-muted mt-5 max-w-2xl">{site.description}</p>
        <div className="flex flex-wrap gap-3 mt-7">
          <Link
            href="/knowledge"
            className="rounded-full bg-accent px-6 py-3 font-semibold text-fg hover:bg-accent-dark transition-colors"
          >
            อ่านคลังความรู้
          </Link>
          <Link
            href="/faq"
            className="rounded-full border border-border px-6 py-3 font-semibold hover:bg-card transition-colors"
          >
            คำถามที่พบบ่อย
          </Link>
        </div>
      </section>

      {/* สรุปข้อมูลสำคัญแบบ key–value ให้ AI สแกนง่าย */}
      <section className="mx-auto max-w-5xl px-5 py-10 border-y border-border">
        <h2 className="sr-only">ข้อมูลสรุป {site.name}</h2>
        <dl className="grid sm:grid-cols-3 gap-6">
          <div>
            <dt className="text-sm text-muted">ก่อตั้งเมื่อ</dt>
            <dd className="text-xl font-bold">ปี {site.foundingYear}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">ที่ตั้ง</dt>
            <dd className="text-xl font-bold">{site.address.addressLocality}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">บริการจัดส่ง</dt>
            <dd className="text-xl font-bold">ทั่วประเทศไทย</dd>
          </div>
        </dl>
      </section>

      {/* บทความล่าสุด */}
      <section className="mx-auto max-w-5xl px-5 py-14">
        <div className="flex items-baseline justify-between">
          <h2 className="text-2xl font-bold">คลังความรู้ล่าสุด</h2>
          <Link href="/knowledge" className="text-sm text-accent-dark hover:underline">
            ดูทั้งหมด →
          </Link>
        </div>
        <div className="grid sm:grid-cols-3 gap-5 mt-6">
          {articles.map((a) => (
            <Link
              key={a.slug}
              href={`/knowledge/${a.slug}`}
              className="block rounded-2xl border border-border bg-card p-5 hover:shadow-md transition-shadow"
            >
              <h3 className="font-semibold leading-snug">{a.title}</h3>
              <p className="text-sm text-muted mt-2">{a.summary}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* FAQ ย่อบนหน้าแรก */}
      <section className="mx-auto max-w-5xl px-5 pb-16">
        <h2 className="text-2xl font-bold mb-6">คำถามที่พบบ่อย</h2>
        <div className="grid gap-4">
          {faqs.slice(0, 4).map((f) => (
            <details key={f.question} className="rounded-xl border border-border bg-card p-5">
              <summary className="font-semibold cursor-pointer">{f.question}</summary>
              <p className="text-muted mt-3">{f.answer}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
