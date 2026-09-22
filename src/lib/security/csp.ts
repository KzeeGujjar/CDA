/**
 * Content-Security-Policy for pages. Built per request by src/proxy.ts (each response gets its own nonce), and kept
 * here as a pure function so a check can assert the exact policy without a browser.
 *
 * What it does, in plain terms: the browser may run a script only if it is ours (same origin) or carries this
 * request's random nonce, so a script injected through a stored or reflected value cannot execute. It may not
 * embed the app in a frame (clickjacking), open plugins, change the base URL, post a form to another site, or
 * talk to any server except this one and (when configured) Supabase Storage, which receives direct uploads on
 * short-lived signed URLs and serves signed downloads.
 *
 * Styles allow 'unsafe-inline' on purpose: React, Radix, Recharts and Sonner set style attributes at runtime, and
 * a style attribute cannot carry a nonce. That is the accepted trade-off for a component-library app; the
 * protection that matters (no script execution) is unaffected.
 */
export interface CspOptions {
  nonce: string;
  /** Development needs 'unsafe-eval' (React debugging) and a websocket for hot reload. Never true in production. */
  development: boolean;
  /** Origin (scheme + host) of Supabase Storage, e.g. https://abc.supabase.co. Omitted when storage is not configured. */
  storageOrigin?: string;
  /** Tells browsers to upgrade any http subresource to https. Only when the site itself is served over https. */
  upgradeInsecure: boolean;
}

/**
 * Hosts the frontend loads sample images from (see next.config.ts `images.remotePatterns`).
 * picsum.photos redirects the actual image bytes to its CDN subdomain, fastly.picsum.photos; the browser
 * re-checks img-src against that final URL after following the redirect, so both hosts must be listed or
 * every vehicle photo in the demo data is silently blocked.
 */
export const IMAGE_HOSTS = ["https://picsum.photos", "https://fastly.picsum.photos", "https://i.pravatar.cc"] as const;

/** The origin of a URL, or undefined when it is not a valid http(s) URL. Never throws. */
export function originOf(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

export function buildCsp({ nonce, development, storageOrigin, upgradeInsecure }: CspOptions): string {
  const storage = storageOrigin ? [storageOrigin] : [];
  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(development ? ["'unsafe-eval'"] : [])]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:", ...IMAGE_HOSTS, ...storage]],
    ["font-src", ["'self'", "data:"]],
    ["connect-src", ["'self'", ...storage, ...(development ? ["ws:", "wss:"] : [])]],
    ["media-src", ["'self'", ...storage]],
    ["worker-src", ["'self'", "blob:"]],
    ["manifest-src", ["'self'"]],
    ["frame-src", ["'none'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
  ];
  const text = directives.map(([name, values]) => `${name} ${values.join(" ")}`);
  if (upgradeInsecure) text.push("upgrade-insecure-requests");
  return text.join("; ");
}

/** A fresh, unguessable nonce for one response (128 bits from the platform's CSPRNG, base64). */
export function newNonce(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
}

/** Headers for every API response: a JSON API never needs to load or run anything. */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'";
