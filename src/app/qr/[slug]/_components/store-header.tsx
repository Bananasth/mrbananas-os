import { BRAND } from "./shared";

/**
 * Mobile store header: SOLID brand-blue background, real logo, store name + "order online" text.
 * Logo: uses business_profile.logo_color_url when provided, else the local fallback asset
 * (public/brand/mrbananas-logo-color.png). No gradient.
 */
export function StoreHeader({ logoUrl, pickup }: { logoUrl?: string | null; pickup?: string | null }) {
  const src = logoUrl || "/brand/mrbananas-logo-color.png";
  return (
    <header className="text-white" style={{ background: BRAND.primary }}>
      <div className="mx-auto max-w-md px-5 pb-6 pt-8">
        <div className="flex items-center gap-3">
          {/* Logo rendered directly on the blue header — no background/border/shadow/rounding */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="Mr. Banana's" className="h-14 w-auto shrink-0 object-contain" />
          <div>
            <h1 className="text-xl font-extrabold">Mr. Banana&apos;s</h1>
            <p className="text-sm text-white/85">สั่งออนไลน์ · Order online</p>
          </div>
        </div>
        {pickup ? <p className="mt-3 rounded-lg bg-white/15 px-3 py-2 text-xs">{pickup}</p> : null}
      </div>
    </header>
  );
}
