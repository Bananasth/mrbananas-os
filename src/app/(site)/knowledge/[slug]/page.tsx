import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { articles, getArticle } from "@/lib/content";
import { JsonLd } from "@/components/JsonLd";
import { articleSchema, faqSchema, breadcrumbSchema } from "@/lib/schema";

// สร้างทุกหน้าแบบ static ตอน build → เร็วและ crawl ง่ายที่สุด
export function generateStaticParams() {
  return articles.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const a = getArticle(slug);
  if (!a) return {};
  return {
    title: a.title,
    description: a.summary,
    alternates: { canonical: `/knowledge/${a.slug}` },
    openGraph: {
      type: "article",
      title: a.title,
      description: a.summary,
      publishedTime: a.datePublished,
      modifiedTime: a.dateModified,
    },
  };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const a = getArticle(slug);
  if (!a) notFound();

  const schemas: object[] = [
    articleSchema(a),
    breadcrumbSchema([
      { name: "หน้าแรก", path: "/" },
      { name: "คลังความรู้", path: "/knowledge" },
      { name: a.title, path: `/knowledge/${a.slug}` },
    ]),
  ];
  if (a.faqs?.length) schemas.push(faqSchema(a.faqs));

  return (
    <>
      <JsonLd data={schemas} />
      <article className="mx-auto max-w-3xl px-5 py-14 prose-block">
        <nav className="text-sm text-muted mb-4" aria-label="breadcrumb">
          <Link href="/knowledge" className="hover:text-accent-dark">
            คลังความรู้
          </Link>{" "}
          / <span>{a.title}</span>
        </nav>

        <h1 className="text-3xl font-extrabold leading-tight">{a.title}</h1>
        {/* สรุปขึ้นต้น (TL;DR) — AI มักหยิบย่อหน้าแรกไปตอบ */}
        <p className="text-lg text-muted mt-4">{a.summary}</p>
        <p className="text-xs text-muted mt-2">
          เผยแพร่ {a.datePublished} · อัปเดต {a.dateModified} · โดย {a.author}
        </p>

        <div className="mt-10 grid gap-8">
          {a.sections.map((s) => (
            <section key={s.heading}>
              <h2 className="text-xl font-bold">{s.heading}</h2>
              <p className="text-muted mt-2">{s.body}</p>
            </section>
          ))}
        </div>

        {a.faqs?.length ? (
          <section className="mt-12">
            <h2 className="text-2xl font-bold mb-5">คำถามที่เกี่ยวข้อง</h2>
            <div className="grid gap-4">
              {a.faqs.map((f) => (
                <div key={f.question} className="rounded-xl border border-border bg-card p-5">
                  <h3 className="font-semibold">{f.question}</h3>
                  <p className="text-muted mt-2">{f.answer}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </article>
    </>
  );
}
