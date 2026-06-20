# Mister Banana's — เว็บไซต์ Next.js สำหรับ SEO / GEO / AEO

เว็บไซต์ที่ออกแบบมาให้ทั้ง Search Engine และ **AI (ChatGPT, Perplexity, Google AI Overviews, Claude, Gemini)**
ดึงข้อมูลไปตอบผู้ใช้ได้ง่ายและถูกต้อง

## คำศัพท์

| คำ | ความหมาย |
|----|----------|
| **SEO** | Search Engine Optimization — ติดอันดับใน Google/Bing |
| **GEO** | Generative Engine Optimization — ให้ AI ที่สร้างคำตอบ "หยิบเว็บเราไปอ้างอิง" |
| **AEO** | Answer Engine Optimization — จัดเนื้อหาแบบถาม-ตอบให้ AI ตอบได้ทันที |

## เริ่มใช้งาน

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # สร้าง production build
npm run start    # รัน production
```

## ปรับแต่ง (สำคัญ)

1. **ข้อมูลธุรกิจทั้งหมด** → แก้ไฟล์เดียว: [`src/site.config.ts`](src/site.config.ts)
   เปลี่ยน `url` ให้เป็นโดเมนจริงก่อน deploy (มีผลกับ sitemap, canonical, JSON-LD ทั้งหมด)
2. **เนื้อหา FAQ + บทความ** → [`src/lib/content.ts`](src/lib/content.ts)
3. **รูปภาพ** → วางไฟล์จริงใน `public/`: `logo.png`, `og-image.png`, `favicon.ico`,
   `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`

## สิ่งที่ติดตั้งให้แล้ว (เช็กลิสต์ AI-readiness)

- ✅ **Server-rendered HTML** — AI crawler อ่านเนื้อหาได้โดยไม่ต้องรัน JS
- ✅ **JSON-LD structured data** — Organization, WebSite, FAQPage, Article, BreadcrumbList
- ✅ **Metadata API** เต็มรูปแบบ — title template, Open Graph, Twitter Card, canonical
- ✅ **`/robots.txt`** — อนุญาต AI bot อย่างชัดเจน (GPTBot, ClaudeBot, PerplexityBot, Google-Extended ฯลฯ)
- ✅ **`/sitemap.xml`** — สร้างอัตโนมัติจากเนื้อหา
- ✅ **`/llms.txt`** — ดัชนีเว็บแบบ Markdown สำหรับ LLM ([llmstxt.org](https://llmstxt.org))
- ✅ **`/feed.xml`** — RSS feed
- ✅ **`/manifest.webmanifest`** — PWA metadata
- ✅ **เนื้อหารูปแบบ Q&A** — คำตอบสั้น self-contained ที่ AI หยิบไปตอบได้เลย

## หลักการเขียนเนื้อหาให้ AI ชอบ (AEO)

1. ตอบคำถามใน **2–4 ประโยคแรก** อย่าให้ AI ต้องเดา
2. หนึ่งหัวข้อ = หนึ่งคำถาม/หนึ่งประเด็น
3. ใช้ heading (`h2`, `h3`) เป็นคำถามจริงที่คนค้นหา
4. ใส่ตัวเลข/ข้อเท็จจริงชัดเจน (ราคา เวลา ปริมาณ) — AI ชอบข้อมูลที่อ้างอิงได้
5. อัปเดต `dateModified` ทุกครั้งที่แก้เนื้อหา
