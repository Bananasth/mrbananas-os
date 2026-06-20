import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Only these prefixes require a session. Everything else (the public marketing
// site: /, /about, /knowledge, /faq, …) stays public — the matcher below ensures
// this middleware never even runs on those routes, keeping them fast and cacheable.
const PRIVATE_PREFIXES = ["/dashboard", "/admin"];

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isPrivate = PRIVATE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (isPrivate && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (pathname === "/login" && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Run only on the auth-relevant routes; never on the public marketing pages.
  matcher: ["/dashboard/:path*", "/admin/:path*", "/login"],
};
