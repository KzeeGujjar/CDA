import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, newNonce, originOf } from "@/lib/security/csp";

/**
 * Runs before routing, for pages and for the API (not static files or images):
 *
 *  1. A path with broken percent-encoding (`/x/%E0%A4%A`) is answered with 400. Left alone, Next.js's own router
 *     fails to decode it and answers 500 for every dynamic route, which looks like a server fault and is noise in
 *     monitoring.
 *  2. For pages, it attaches a per-request nonce and the Content-Security-Policy that goes with it. Next.js reads the
 *     nonce from the request header below and stamps it on its own scripts (the root layout stamps the theme script),
 *     which is why every page renders dynamically (the root layout already reads the locale cookie). The policy itself
 *     lives in src/lib/security/csp.ts. API responses get their fixed policy from next.config.ts.
 */
export function proxy(request: NextRequest) {
  const { pathname } = new URL(request.url);
  const isApi = pathname === "/api" || pathname.startsWith("/api/");

  try {
    decodeURIComponent(pathname);
  } catch {
    return isApi
      ? NextResponse.json({ message: "Malformed URL.", code: "bad_request", status: 400 }, { status: 400 })
      : new NextResponse("Bad request", { status: 400 });
  }
  if (isApi) return NextResponse.next();

  const nonce = newNonce();
  const csp = buildCsp({
    nonce,
    development: process.env.NODE_ENV === "development",
    storageOrigin: originOf(process.env.SUPABASE_URL),
    // Upgrading http to https would break local testing over plain http; production is https (cookies are Secure there too).
    upgradeInsecure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false",
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: [
    // The API: only the malformed-URL guard applies.
    "/api/:path*",
    // Pages, except prefetches and static files.
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
