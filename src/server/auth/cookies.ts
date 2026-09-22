import { cookieSecure } from "@/server/env";
import { SESSION_ABSOLUTE_TTL_MS } from "./session-config";

/**
 * The session cookie is the only credential the browser holds, and JavaScript can never read it:
 *  - HttpOnly    (no script access, so XSS cannot steal it)
 *  - Secure      (HTTPS only) + the `__Host-` prefix, which makes browsers refuse a cookie that is not
 *                Secure, has a Domain, or is not Path=/ (blocks subdomain cookie injection)
 *  - SameSite=Lax (not sent on cross-site POSTs; combined with the Origin check on unsafe methods)
 */
export function sessionCookieName(): string {
  return cookieSecure() ? "__Host-cda_session" : "cda_session";
}

function attributes(maxAgeSeconds: number): string {
  return ["Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAgeSeconds}`, ...(cookieSecure() ? ["Secure"] : [])].join(
    "; "
  );
}

export function serializeSessionCookie(token: string): string {
  return `${sessionCookieName()}=${encodeURIComponent(token)}; ${attributes(Math.floor(SESSION_ABSOLUTE_TTL_MS / 1000))}`;
}

export function serializeClearedSessionCookie(): string {
  return `${sessionCookieName()}=; ${attributes(0)}`;
}

export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}
