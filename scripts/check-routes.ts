/**
 * Static authorization audit of the whole API surface. Run with `npm run check:routes` (no database needed).
 * Fails when any endpoint is not explicitly protected, or when a declared permission does not exist.
 * Add `--markdown` to print the endpoint / permission table used in docs/BACKEND_ARCHITECTURE.md.
 */
import { allPermissions } from "@/server/auth/permission-catalog";
import { loadRouteManifest, PUBLIC_ROUTE_ALLOWLIST, routeKey } from "./lib/route-manifest";

const { entries, violations } = loadRouteManifest();
const errors = [...violations];
const known = new Set(allPermissions.map((p) => p.key));

for (const e of entries) {
  if (e.access.kind === "permission" && !known.has(`${e.access.resource}:${e.access.action}`)) {
    errors.push(`${routeKey(e)}: permission ${e.access.resource}:${e.access.action} does not exist in the catalog`);
  }
  if (e.access.kind === "permission" && e.access.also) {
    const second = `${e.access.also.resource}:${e.access.also.action}`;
    if (!known.has(second)) errors.push(`${routeKey(e)}: permission ${second} does not exist in the catalog`);
  }
  if (e.access.kind === "public" && !PUBLIC_ROUTE_ALLOWLIST.has(routeKey(e))) {
    errors.push(`${routeKey(e)}: public endpoint is not on the reviewed allowlist (scripts/lib/route-manifest.ts)`);
  }
}
const present = new Set(entries.map(routeKey));
for (const allowed of PUBLIC_ROUTE_ALLOWLIST) {
  if (!present.has(allowed)) errors.push(`allowlisted public endpoint no longer exists: ${allowed}`);
}

if (process.argv.includes("--markdown")) {
  const label = (e: (typeof entries)[number]) =>
    e.access.kind === "permission"
      ? `\`${e.access.resource}:${e.access.action}\`` +
        (e.access.also ? ` + \`${e.access.also.resource}:${e.access.also.action}\`` : "")
      : e.access.kind === "self"
        ? "signed-in user (own data only)"
        : "public (rate limited)";
  console.log("| Endpoint | Access |\n|---|---|");
  for (const e of entries) console.log(`| \`${e.method} ${e.url}\` | ${label(e)} |`);
  process.exit(0);
}

if (errors.length) {
  console.error(`Route authorization audit FAILED:\n - ${errors.join("\n - ")}`);
  process.exit(1);
}
const count = (k: string) => entries.filter((e) => e.access.kind === k).length;
console.log(
  `Route audit OK: ${entries.length} endpoints - ${count("permission")} permission-gated, ${count("self")} own-data, ${count("public")} public (allowlisted).`
);
