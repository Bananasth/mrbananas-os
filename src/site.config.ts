/**
 * ─────────────────────────────────────────────────────────────────────────
 *  SITE CONFIG — แก้ข้อมูลธุรกิจของคุณที่ไฟล์นี้ที่เดียว
 * ─────────────────────────────────────────────────────────────────────────
 *  ข้อมูลทั้งหมดนี้ถูกนำไปใช้สร้าง:
 *   - Metadata / Open Graph / Twitter Card  (SEO)
 *   - JSON-LD structured data                (GEO/AEO — ให้ AI เข้าใจบริบท)
 *   - sitemap.xml, robots.txt, llms.txt      (ให้ AI/Search crawler เก็บข้อมูล)
 *   - RSS feed
 */

export const site = {
  /** โดเมนจริงตอน production (ไม่ต้องมี / ปิดท้าย) */
  url: "https://www.misterbananas.com",

  /** ชื่อแบรนด์ */
  name: "Mister Banana's",

  /** ชื่อกฎหมาย/นิติบุคคล (ใช้ใน Organization schema) */
  legalName: "Mister Banana's Co., Ltd.",

  /** สโลแกนสั้น ๆ */
  tagline: "กล้วยพรีเมียมและของหวานจากกล้วยแท้ 100%",

  /**
   * คำอธิบายธุรกิจ 1–2 ประโยค — สำคัญมากสำหรับ AEO/GEO
   * เขียนให้ตอบคำถาม "ธุรกิจนี้คืออะไร / ทำอะไร" ได้ในประโยคเดียว
   */
  description:
    "Mister Banana's คือร้านขายกล้วยพรีเมียมและของหวานจากกล้วยแท้ 100% " +
    "ส่งตรงจากสวนในประเทศไทย จำหน่ายทั้งหน้าร้านและจัดส่งทั่วประเทศ",

  /** ภาษาเริ่มต้นของเว็บ (BCP-47) */
  locale: "th-TH",
  language: "th",

  /** อีเมลติดต่อ */
  email: "owner@misterbananas.com",

  /** เบอร์โทร (รูปแบบสากล) */
  telephone: "+66-2-000-0000",

  /** โลโก้ และรูป OG (วางไฟล์จริงไว้ใน /public) */
  logo: "/logo.png",
  ogImage: "/og-image.png",

  /** ที่อยู่ธุรกิจ — ช่วยเรื่อง Local SEO + ทำให้ AI ตอบ "อยู่ที่ไหน" ได้ */
  address: {
    streetAddress: "123 ถนนสุขุมวิท",
    addressLocality: "กรุงเทพมหานคร",
    addressRegion: "กรุงเทพฯ",
    postalCode: "10110",
    addressCountry: "TH",
  },

  /** พิกัด (ใส่ค่าจริงจาก Google Maps) */
  geo: { latitude: 13.7563, longitude: 100.5018 },

  /** ประเภทธุรกิจตาม schema.org (เช่น Store, Restaurant, LocalBusiness, Organization) */
  schemaType: "Store",

  /** เวลาทำการ — ใช้ใน LocalBusiness schema */
  openingHours: [
    { days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], opens: "09:00", closes: "18:00" },
    { days: ["Saturday", "Sunday"], opens: "10:00", closes: "16:00" },
  ],

  /** โซเชียล / โปรไฟล์อื่น — ใส่ใน sameAs เพื่อช่วยยืนยันตัวตนแบรนด์ */
  sameAs: [
    "https://www.facebook.com/misterbananas",
    "https://www.instagram.com/misterbananas",
    "https://www.tiktok.com/@misterbananas",
  ],

  /** ปีก่อตั้ง */
  foundingYear: 2020,

  /** Twitter/X handle (ไม่ต้องมี @) — ปล่อยว่างได้ */
  twitterHandle: "misterbananas",
} as const;

export type Site = typeof site;
