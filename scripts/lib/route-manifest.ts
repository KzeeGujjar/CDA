import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Reads every `src/app/api/**\/route.ts` and reports, per HTTP method, how the endpoint is protected.
 * It is deliberately strict: a route file may only export HTTP handlers created with `apiRoute(...)` (which
 * REQUIRES a `permission` or `self: true` declaration, enforced by the type system) or `publicRoute(...)`
 * (which must be on the explicit allowlist below). Anything else is reported as a violation, so an
 * endpoint cannot be added that quietly skips authorization.
 */
export type Access =
  | { kind: "permission"; resource: string; action: string; also?: { resource: string; action: string } }
  | { kind: "self" }
  | { kind: "public" };

export interface RouteEntry {
  file: string;
  /** e.g. /api/v1/users/:id/status */
  url: string;
  method: string;
  access: Access;
}

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
const ALLOWED_CONFIG_EXPORTS = new Set([
  "dynamic",
  "revalidate",
  "runtime",
  "maxDuration",
  "preferredRegion",
  "fetchCache",
]);

/** Endpoints that intentionally work without a session. Adding one here is a conscious, reviewed decision. */
export const PUBLIC_ROUTE_ALLOWLIST = new Set([
  "POST /api/v1/auth/register",
  "POST /api/v1/auth/verify-email",
  "POST /api/v1/auth/resend-verification",
  "POST /api/v1/auth/login",
  "POST /api/v1/auth/logout",
  "POST /api/v1/auth/password/forgot",
  "POST /api/v1/auth/password/reset",
  "POST /api/v1/auth/invitations/accept",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name === "route.ts") out.push(full);
  }
  return out;
}

export function loadRouteManifest(root = "src/app/api"): { entries: RouteEntry[]; violations: string[] } {
  const entries: RouteEntry[] = [];
  const violations: string[] = [];

  for (const file of walk(root).sort()) {
    const rel = relative("src/app", file).split(sep).slice(0, -1).join("/");
    const url = "/" + rel.replace(/\[(\w+)\]/g, ":$1");
    const src = readFileSync(file, "utf8");

    // Routes must not roll their own authentication or reach the database directly.
    for (const bad of ["@/server/db/", "@/server/auth/session", "@/generated/"]) {
      if (src.includes(`"${bad}`))
        violations.push(`${file}: route files must not import ${bad}* (use apiRoute/publicRoute and a service)`);
    }
    if (/export\s*\{/.test(src) || /export\s+default/.test(src)) {
      violations.push(`${file}: re-exports and default exports are not allowed in route files`);
    }

    const exported = [...src.matchAll(/^export\s+(?:async\s+)?(?:const|function|let|var)\s+(\w+)/gm)].map((m) => m[1]);
    for (const name of exported) {
      if (!HTTP_METHODS.includes(name) && !ALLOWED_CONFIG_EXPORTS.has(name)) {
        violations.push(`${file}: unexpected export "${name}"`);
      }
    }

    for (const method of HTTP_METHODS) {
      if (!exported.includes(method)) continue;
      const decl = new RegExp(`^export\\s+const\\s+${method}\\s*=\\s*(apiRoute|publicRoute)\\b`, "m").exec(src);
      if (!decl) {
        violations.push(`${file}: ${method} is not wrapped in apiRoute()/publicRoute()`);
        continue;
      }
      if (decl[1] === "publicRoute") {
        entries.push({ file, url, method, access: { kind: "public" } });
        continue;
      }
      // apiRoute<...>({ ...options }, handler)
      const after = src.slice(decl.index + decl[0].length);
      const options = /^(?:<[^>]*>)?\(\s*\{([^}]*)\}/.exec(after)?.[1] ?? "";
      const perm = /permission:\s*\[\s*"(\w+)"\s*,\s*"(\w+)"\s*\]/.exec(options);
      const also = /also:\s*\[\s*"(\w+)"\s*,\s*"(\w+)"\s*\]/.exec(options);
      if (perm)
        entries.push({
          file,
          url,
          method,
          access: {
            kind: "permission",
            resource: perm[1],
            action: perm[2],
            ...(also ? { also: { resource: also[1], action: also[2] } } : {}),
          },
        });
      else if (/self:\s*true/.test(options)) entries.push({ file, url, method, access: { kind: "self" } });
      else violations.push(`${file}: ${method} declares neither permission: [resource, action] nor self: true`);
    }
  }
  return { entries, violations };
}

export const routeKey = (e: RouteEntry) => `${e.method} ${e.url}`;
