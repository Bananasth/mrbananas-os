/**
 * ฝัง JSON-LD ลงในหน้า — ใช้ <script type="application/ld+json">
 * วิธีนี้ render ฝั่ง server เสมอ จึงอยู่ใน HTML ตั้งแต่แรกที่ crawler เข้ามาอ่าน
 */
export function JsonLd({ data }: { data: object | object[] }) {
  const json = JSON.stringify(data);
  return (
    <script
      type="application/ld+json"
      // เนื้อหามาจากข้อมูลภายในที่เราควบคุมเอง ไม่ใช่ user input
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
