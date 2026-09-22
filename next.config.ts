import type { NextConfig } from "next";
import { API_CSP } from "./src/lib/security/csp";
import { assertPublicEnv } from "./public-env-guard";

// Fail closed if a secret has been put in a NEXT_PUBLIC_ variable (those are sent to every browser).
assertPublicEnv(process.env);

/**
 * Headers every response carries. The Content-Security-Policy for pages is per request (it holds a nonce), so it is
 * set in src/proxy.ts; API responses get a fixed one here. See docs/BACKEND_ARCHITECTURE.md section 0.14.
 */
const baseSecurityHeaders = [
  // HTTPS only, for two years, subdomains included. (No "preload": that is a one-way commitment for the owner of the domain to make.)
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  // Do not announce the framework and version in every response.
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos" },
      // picsum.photos redirects the actual bytes here; see src/lib/security/csp.ts.
      { protocol: "https", hostname: "fastly.picsum.photos" },
      { protocol: "https", hostname: "i.pravatar.cc" },
    ],
  },
  async headers() {
    return [
      { source: "/:path*", headers: baseSecurityHeaders },
      {
        source: "/api/:path*",
        headers: [
          { key: "Content-Security-Policy", value: API_CSP },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
