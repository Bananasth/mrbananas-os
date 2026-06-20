import { site } from "@/site.config";

export function Footer() {
  return (
    <footer className="border-t border-border mt-20">
      <div className="mx-auto max-w-5xl px-5 py-10 text-sm text-muted grid gap-2">
        <p className="font-semibold text-fg">{site.legalName}</p>
        <p>
          {site.address.streetAddress} {site.address.addressLocality}{" "}
          {site.address.postalCode}
        </p>
        <p>
          <a href={`mailto:${site.email}`} className="hover:text-accent-dark">
            {site.email}
          </a>{" "}
          · {site.telephone}
        </p>
        <div className="flex gap-4 mt-2">
          {site.sameAs.map((url) => (
            <a key={url} href={url} className="hover:text-accent-dark" rel="me">
              {new URL(url).hostname.replace("www.", "")}
            </a>
          ))}
        </div>
        <p className="mt-3 text-xs">
          © {site.foundingYear}–ปัจจุบัน {site.name}. สงวนลิขสิทธิ์.
        </p>
      </div>
    </footer>
  );
}
