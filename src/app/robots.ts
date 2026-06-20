import type { MetadataRoute } from "next";
import { site } from "@/site.config";

/**
 * robots.txt — อนุญาต AI crawler อย่างชัดเจน
 * นี่คือ "สวิตช์" สำคัญของ GEO: ถ้าไม่อนุญาตบอทเหล่านี้
 * เนื้อหาของเราจะไม่ถูกนำไปใช้ตอบใน AI เลย
 */
const aiBots = [
  "GPTBot", // OpenAI – ใช้เทรน/ตอบใน ChatGPT
  "OAI-SearchBot", // OpenAI – ChatGPT Search
  "ChatGPT-User", // OpenAI – เวลาผู้ใช้ให้ ChatGPT เปิดลิงก์
  "ClaudeBot", // Anthropic – Claude
  "Claude-Web",
  "anthropic-ai",
  "PerplexityBot", // Perplexity
  "Perplexity-User",
  "Google-Extended", // Google Gemini / AI Overviews
  "Applebot-Extended", // Apple Intelligence
  "Amazonbot",
  "Bytespider", // TikTok/ByteDance
  "CCBot", // Common Crawl (ป้อนหลายโมเดล)
  "cohere-ai",
  "Meta-ExternalAgent", // Meta AI
  "DuckAssistBot", // DuckDuckGo AI
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // search engine + ผู้ใช้ทั่วไป
      { userAgent: "*", allow: "/" },
      // อนุญาต AI bot ทุกตัวเข้าถึงทั้งเว็บอย่างชัดเจน
      ...aiBots.map((bot) => ({ userAgent: bot, allow: "/" })),
    ],
    sitemap: `${site.url}/sitemap.xml`,
    host: site.url,
  };
}
