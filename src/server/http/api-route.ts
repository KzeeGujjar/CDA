import { randomUUID } from "node:crypto";
import { ZodError, type ZodType } from "zod";
import type { AuthContext } from "@/server/auth/context";
import { requirePermission } from "@/server/auth/authorize";
import { readCookie, sessionCookieName } from "@/server/auth/cookies";
import type { PermissionAction, PermissionResource } from "@/server/auth/permission-catalog";
import { resolveSessionContext } from "@/server/auth/session";
import { auditAuth } from "@/server/auth/flows/common";
import { hit } from "@/server/auth/rate-limit";
import { getPlatformDb } from "@/server/db/clients";
import { ServerNotConfiguredError } from "@/server/env";
import { describeDatabaseError, mapDatabaseError } from "@/server/lib/db-errors";
import {
  AppError,
  badRequest,
  forbidden,
  payloadTooLarge,
  TenancyViolationError,
  unauthorized,
  unsupportedMediaType,
} from "@/server/lib/errors";

/**
 * Keys a client may NEVER use to influence which organization a request acts on. The organization is
 * derived from the session; a request that even tries to name one is rejected, not silently ignored,
 * so a buggy or malicious client is visible in logs rather than "working by accident".
 */
const FORBIDDEN_TENANT_KEYS = new Set([
  "organizationid",
  "organization_id",
  "dealershipid",
  "dealership_id",
  "tenantid",
  "tenant_id",
  "orgid",
  "org_id",
  "organization",
  "dealership",
  "tenant",
]);

function findForbiddenKey(value: unknown, depth = 0): string | null {
  if (depth > 12 || value === null || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = findForbiddenKey(item, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_TENANT_KEYS.has(key.toLowerCase())) return key;
    const hit = findForbiddenKey(child, depth + 1);
    if (hit) return hit;
  }
  return null;
}

function tenantFieldError(key: string) {
  return badRequest(
    `"${key}" cannot be sent by the client. The organization is determined from your session.`,
    "tenant_field_not_allowed"
  );
}

export interface RequestMeta {
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
}

/** Best-effort client address. On Vercel these headers are set by the platform, not the client. */
export function clientIp(req: Request): string | undefined {
  const h = req.headers;
  return (
    h.get("x-real-ip") ??
    h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    undefined
  );
}

interface BaseArgs<P> {
  req: Request;
  params: P;
  query: URLSearchParams;
  meta: RequestMeta;
  /** Parses the JSON body, rejects tenant-selecting keys, then validates against `schema` (use z.strictObject). */
  body: <T>(schema: ZodType<T>) => Promise<T>;
}

export interface RouteArgs<P> extends BaseArgs<P> {
  ctx: AuthContext;
}
export type PublicRouteArgs<P> = BaseArgs<P>;

/**
 * Every authenticated route MUST declare how it is authorized; there is no way to write one without.
 *  - permission: [resource, action]  the caller must hold that permission (checked before the handler runs);
 *    also: [resource, action]        optional second permission that must ALSO be held (both are required);
 *  - self: true                      the route only ever touches the caller's OWN data (own profile,
 *                                    own sessions, own password), so any signed-in user may call it.
 */
type PermissionPair = readonly [PermissionResource, PermissionAction];
export type RouteAccess =
  | { permission: PermissionPair; also?: PermissionPair; self?: never }
  | { self: true; permission?: never; also?: never };
type Options = RouteAccess;

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Largest JSON body any endpoint accepts. Files never come through the API (they go to storage on a signed URL). */
export const MAX_BODY_BYTES = 1_000_000;

/**
 * Cross-site request forgery guard for anything that changes state. The session cookie is SameSite=Lax, and on top of
 * that a browser-made write must come from this site:
 *  - Sec-Fetch-Site (sent by every current browser, and not settable by page script) must be same-origin;
 *  - Origin, when present, must be this host. "null" (sandboxed frames, some redirects) and unparsable values are refused.
 * Requests with neither header (curl, server-to-server) carry no ambient browser credentials, so they pass to normal
 * authentication.
 */
function assertSameSite(req: Request, url: URL): void {
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") throw forbidden("Cross-site request blocked.");
  const origin = req.headers.get("origin");
  if (origin === null) return;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw forbidden("Cross-site request blocked.");
  }
  if (originHost !== (req.headers.get("host") ?? url.host)) throw forbidden("Cross-site request blocked.");
}

/** Reads the body as JSON: application/json only, and never more than MAX_BODY_BYTES, whatever the client claims. */
async function readJsonBody(req: Request): Promise<unknown> {
  const contentType = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") throw unsupportedMediaType();
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw payloadTooLarge();
  const reader = req.body?.getReader();
  if (!reader) throw badRequest("Request body must be valid JSON.", "invalid_json");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw payloadTooLarge();
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw badRequest("Request body must be valid JSON.", "invalid_json");
  }
}

/**
 * Permission gate for a route. A refusal is written to the audit log (outcome DENIED) so attempts to
 * exceed one's role are visible to the dealership owner. Writing is rate-limited per user so a signed-in
 * user cannot flood the log by hammering a forbidden endpoint, and can never make the 403 itself fail.
 */
async function authorizeRoute(
  ctx: AuthContext,
  permission: readonly [PermissionResource, PermissionAction],
  req: Request,
  requestId: string
): Promise<void> {
  try {
    requirePermission(ctx, permission[0], permission[1]);
  } catch (error) {
    try {
      const db = getPlatformDb();
      const budget = await hit(db, {
        scope: "authz-denied:user",
        identifier: ctx.userId,
        limit: 30,
        windowSeconds: 3600,
      });
      if (budget.allowed) {
        await auditAuth(db, {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          userName: ctx.userName,
          action: "authz.denied",
          outcome: "DENIED",
          metadata: {
            permission: `${permission[0]}:${permission[1]}`,
            method: req.method,
            path: new URL(req.url).pathname,
            role: ctx.roleKey,
          },
          meta: { requestId, ipAddress: clientIp(req), userAgent: req.headers.get("user-agent") ?? undefined },
        });
      }
    } catch {
      // auditing must never change the outcome of the authorization decision
    }
    throw error;
  }
}

export interface ResponseOptions {
  status?: number;
  cookies?: string[];
}

/** JSON response that may also set cookies (Set-Cookie must be appended, one header per cookie). */
export function jsonResponse(body: unknown, options: ResponseOptions = {}): Response {
  const headers = new Headers({ "content-type": "application/json" });
  for (const cookie of options.cookies ?? []) headers.append("set-cookie", cookie);
  return new Response(JSON.stringify(body), { status: options.status ?? 200, headers });
}

async function execute<P>(
  req: Request,
  routeContext: { params: Promise<P> } | undefined,
  options: { authenticated: boolean; permission?: PermissionPair; also?: PermissionPair },
  handler: (args: BaseArgs<P> & { ctx: AuthContext | null }) => Promise<unknown>
): Promise<Response> {
  const incomingId = req.headers.get("x-request-id");
  // Echoed into logs and responses, so accept only a plain token (no log/header injection).
  const requestId = incomingId && /^[\w-]{8,64}$/.test(incomingId) ? incomingId : randomUUID();
  const baseHeaders = { "x-request-id": requestId, "cache-control": "no-store" };
  const finish = (response: Response) => {
    for (const [k, v] of Object.entries(baseHeaders)) response.headers.set(k, v);
    return response;
  };
  const json = (status: number, payload: unknown, extra: Record<string, string> = {}) =>
    finish(Response.json(payload, { status, headers: extra }));

  try {
    const url = new URL(req.url);

    if (!SAFE_METHODS.has(req.method)) assertSameSite(req, url);

    for (const key of url.searchParams.keys()) {
      if (FORBIDDEN_TENANT_KEYS.has(key.toLowerCase())) throw tenantFieldError(key);
    }

    let ctx: AuthContext | null = null;
    if (options.authenticated) {
      const token = readCookie(req.headers.get("cookie"), sessionCookieName());
      ctx = await resolveSessionContext(getPlatformDb(), token);
      if (!ctx) throw unauthorized();
      if (options.permission) await authorizeRoute(ctx, options.permission, req, requestId);
      if (options.also) await authorizeRoute(ctx, options.also, req, requestId);
    }

    const params = (routeContext?.params ? await routeContext.params : {}) as P;
    const meta: RequestMeta = {
      requestId,
      ipAddress: clientIp(req),
      userAgent: req.headers.get("user-agent") ?? undefined,
    };

    const result = await handler({
      req,
      ctx,
      params,
      query: url.searchParams,
      meta,
      body: async (schema) => {
        const raw = await readJsonBody(req);
        const forbiddenKey = findForbiddenKey(raw);
        if (forbiddenKey) throw tenantFieldError(forbiddenKey);
        return schema.parse(raw);
      },
    });

    if (result instanceof Response) return finish(result);
    return json(200, result);
  } catch (error) {
    if (error instanceof AppError) {
      const body = {
        ...error.toApiError(),
        ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
        requestId,
      };
      return json(error.status, body, error.headers);
    }
    if (error instanceof ZodError) {
      return json(400, {
        message: "Invalid request.",
        code: "validation_error",
        status: 400,
        fieldErrors: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        requestId,
      });
    }
    if (error instanceof ServerNotConfiguredError) {
      return json(503, {
        message: "This deployment has no backend configured.",
        code: "backend_not_configured",
        status: 503,
        requestId,
      });
    }
    // Database failures become a safe, classified answer (never the raw error: it holds host, SQL and constraint names).
    const dbError = mapDatabaseError(error);
    if (dbError) {
      const info = describeDatabaseError(error);
      console.error(
        `[${requestId}] Database error ${dbError.code} (prisma=${info?.prismaCode ?? "-"} sqlstate=${info?.sqlState ?? "-"} kind=${info?.kind ?? "-"})`
      );
      return json(dbError.status, { ...dbError.toApiError(), requestId }, dbError.headers);
    }
    if (error instanceof TenancyViolationError) {
      console.error(`[${requestId}] ${error.message}`);
      return json(403, { message: "Forbidden.", code: "forbidden", status: 403, requestId });
    }
    console.error(`[${requestId}] Unhandled error`, error);
    return json(500, { message: "Something went wrong.", code: "internal_error", status: 500, requestId });
  }
}

/**
 * Wraps a Route Handler with the full security pipeline:
 *   request id -> cross-site write check -> reject client tenant keys -> session -> AuthContext
 *   (tenant comes from HERE) -> permission check -> handler -> uniform error mapping.
 * Feature handlers only ever see an authenticated AuthContext.
 */
export function apiRoute<P = Record<string, never>>(
  options: Options,
  handler: (args: RouteArgs<P>) => Promise<unknown>
) {
  return (req: Request, routeContext?: { params: Promise<P> }): Promise<Response> =>
    execute(req, routeContext, { ...options, authenticated: true }, (args) => handler(args as RouteArgs<P>));
}

/**
 * For the few endpoints that must work without a session (login, registration, verify email, password
 * reset, accept invitation). Same protections as apiRoute (origin check, tenant-key rejection, uniform
 * errors) but no AuthContext. Public handlers must apply rate limiting themselves.
 */
export function publicRoute<P = Record<string, never>>(handler: (args: PublicRouteArgs<P>) => Promise<unknown>) {
  return (req: Request, routeContext?: { params: Promise<P> }): Promise<Response> =>
    execute(req, routeContext, { authenticated: false }, (args) => handler(args));
}
