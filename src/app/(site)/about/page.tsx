import type { Metadata } from "next";
import { site } from "@/site.config";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbSchema } from "@/lib/schema";

export const metadata: Metadata = {
  title: "เกี่ยวกับเรา",
  description: `${site.name} — ${site.tagline}. ก่อตั้งปี ${site.foundingYear} ที่ ${site.address.addressLocality}`,
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: "หน้าแรก", path: "/" },
          { name: "เกี่ยวกับเรา", path: "/about" },
        ])}
      />
      <article className="mx-auto max-w-3xl px-5 py-14 prose-block">
        <h1 className="text-3xl font-extrabold">เกี่ยวกับ {site.name}</h1>
        <p className="text-lg text-muted mt-4">{site.description}</p>

        <h2 className="text-xl font-bold mt-10">เราคือใคร</h2>
        <p className="text-muted">
          {site.name} ก่อตั้งขึ้นในปี {site.foundingYear} ที่{site.address.addressLocality}{" "}
          ด้วยความตั้งใจที่จะส่งมอบกล้วยคุณภาพสูงตรงจากสวนถึงมือผู้บริโภค
          เราทำงานร่วมกับสวนพันธมิตรที่ใส่ใจคุณภาพและความยั่งยืน
        </p>

        <h2 className="text-xl font-bold mt-8">เราทำอะไร</h2>
        <p className="text-muted">
          เราคัดเลือก เก็บเกี่ยว และจัดส่งกล้วยพรีเมียมหลายสายพันธุ์
          พร้อมแปรรูปเป็นของหวานจากกล้วยแท้ 100% จำหน่ายทั้งหน้าร้านและจัดส่งทั่วประเทศไทย
        </p>

        <h2 className="text-xl font-bold mt-8">ติดต่อเรา</h2>
        <ul className="text-muted mt-2 grid gap-1">
          <li>อีเมล: {site.email}</li>
          <li>โทร: {site.telephone}</li>
          <li>
            ที่อยู่: {site.address.streetAddress} {site.address.addressLocality}{" "}
            {site.address.postalCode}
          </li>
          <li>เวลาทำการ: จันทร์–ศุกร์ 09:00–18:00 น. / เสาร์–อาทิตย์ 10:00–16:00 น.</li>
        </ul>
      </article>
    </>
  );
}
