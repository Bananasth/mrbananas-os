import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { JsonLd } from "@/components/JsonLd";
import { organizationSchema, websiteSchema } from "@/lib/schema";

/** Public marketing shell — site-wide structured data + Header/Footer chrome. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Structured data ระดับเว็บ — ฝังในทุกหน้าการตลาด */}
      <JsonLd data={[organizationSchema(), websiteSchema()]} />
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
