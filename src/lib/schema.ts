/**
 * ─────────────────────────────────────────────────────────────────────────
 *  JSON-LD SCHEMA BUILDERS (schema.org)
 * ─────────────────────────────────────────────────────────────────────────
 *  Structured data คือสิ่งที่ทำให้ AI / Search "เข้าใจ" ว่าข้อมูลแต่ละชิ้น
 *  คืออะไร (องค์กร, คำถาม-คำตอบ, บทความ, เส้นทางหน้า) แทนการเดาจากข้อความ
 *  → เพิ่มโอกาสถูกหยิบไปตอบใน AI Overviews, ChatGPT, Perplexity ฯลฯ
 */
import { site } from "@/site.config";
import type { Article, Faq } from "@/lib/content";

const abs = (path: string) => `${site.url}${path.startsWith("/") ? path : `/${path}`}`;

/** Organization / LocalBusiness — ตัวตนของแบรนด์ */
export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": ["Organization", site.schemaType],
    "@id": `${site.url}/#organization`,
    name: site.name,
    legalName: site.legalName,
    url: site.url,
    logo: abs(site.logo),
    image: abs(site.ogImage),
    description: site.description,
    email: site.email,
    telephone: site.telephone,
    foundingDate: String(site.foundingYear),
    address: {
      "@type": "PostalAddress",
      streetAddress: site.address.streetAddress,
      addressLocality: site.address.addressLocality,
      addressRegion: site.address.addressRegion,
      postalCode: site.address.postalCode,
      addressCountry: site.address.addressCountry,
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: site.geo.latitude,
      longitude: site.geo.longitude,
    },
    openingHoursSpecification: site.openingHours.map((h) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: h.days,
      opens: h.opens,
      closes: h.closes,
    })),
    sameAs: site.sameAs,
  };
}

/** WebSite — ช่วยให้ search เข้าใจโครงสร้างเว็บ + sitelinks search box */
export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${site.url}/#website`,
    url: site.url,
    name: site.name,
    description: site.description,
    inLanguage: site.locale,
    publisher: { "@id": `${site.url}/#organization` },
  };
}

/** FAQPage — รูปแบบที่ AI ดึงไปตอบได้ตรงที่สุด */
export function faqSchema(items: Faq[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };
}

/** Article — สำหรับหน้า Knowledge Base */
export function articleSchema(a: Article) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: a.title,
    description: a.summary,
    datePublished: a.datePublished,
    dateModified: a.dateModified,
    inLanguage: site.locale,
    author: { "@type": "Organization", name: a.author, url: site.url },
    publisher: { "@id": `${site.url}/#organization` },
    mainEntityOfPage: { "@type": "WebPage", "@id": abs(`/knowledge/${a.slug}`) },
    articleBody: a.sections.map((s) => `${s.heading}. ${s.body}`).join("\n\n"),
  };
}

/** BreadcrumbList — ช่วยให้ AI/Search เข้าใจลำดับชั้นของหน้า */
export function breadcrumbSchema(trail: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.name,
      item: abs(t.path),
    })),
  };
}
