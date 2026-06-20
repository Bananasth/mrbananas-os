import { site } from "@/site.config";
import { articles } from "@/lib/content";

/** RSS 2.0 feed — ช่วยให้ aggregator และบาง AI ติดตามเนื้อหาใหม่ได้ */
export const dynamic = "force-static";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function GET() {
  const items = articles
    .map(
      (a) => `    <item>
      <title>${esc(a.title)}</title>
      <link>${site.url}/knowledge/${a.slug}</link>
      <guid>${site.url}/knowledge/${a.slug}</guid>
      <description>${esc(a.summary)}</description>
      <pubDate>${new Date(a.datePublished).toUTCString()}</pubDate>
    </item>`,
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${esc(site.name)}</title>
    <link>${site.url}</link>
    <description>${esc(site.description)}</description>
    <language>${site.locale}</language>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
