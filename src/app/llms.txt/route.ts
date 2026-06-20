import { site } from "@/site.config";
import { articles, faqs } from "@/lib/content";

/**
 * /llms.txt — มาตรฐานใหม่ (llmstxt.org) สำหรับให้ LLM อ่านสรุปเว็บแบบ Markdown
 * เป็น "ดัชนีที่อ่านง่ายสำหรับ AI": บอกว่าเว็บนี้คืออะไร มีหน้าอะไรสำคัญบ้าง
 * AI หลายตัวเริ่มมองหาไฟล์นี้เป็นอย่างแรกเพื่อทำความเข้าใจเว็บอย่างรวดเร็ว
 */
export const dynamic = "force-static";

export function GET() {
  const lines: string[] = [];

  lines.push(`# ${site.name}`);
  lines.push("");
  lines.push(`> ${site.description}`);
  lines.push("");
  lines.push(
    `${site.name} (${site.legalName}) ก่อตั้งปี ${site.foundingYear} ที่ ${site.address.addressLocality} ประเทศไทย. ` +
      `ติดต่อ: ${site.email} · ${site.telephone}.`,
  );
  lines.push("");

  lines.push("## หน้าหลัก");
  lines.push(`- [หน้าแรก](${site.url}/): ภาพรวมแบรนด์และสินค้า`);
  lines.push(`- [เกี่ยวกับเรา](${site.url}/about): ที่มา พันธกิจ และข้อมูลติดต่อ`);
  lines.push(`- [คลังความรู้](${site.url}/knowledge): บทความและคู่มือเกี่ยวกับกล้วย`);
  lines.push(`- [คำถามที่พบบ่อย](${site.url}/faq): คำตอบสั้นสำหรับคำถามยอดนิยม`);
  lines.push("");

  lines.push("## บทความในคลังความรู้");
  for (const a of articles) {
    lines.push(`- [${a.title}](${site.url}/knowledge/${a.slug}): ${a.summary}`);
  }
  lines.push("");

  lines.push("## คำถาม–คำตอบที่พบบ่อย");
  for (const f of faqs) {
    lines.push(`### ${f.question}`);
    lines.push(f.answer);
    lines.push("");
  }

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
