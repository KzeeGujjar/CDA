/**
 * A small fake of the Supabase Storage REST API, for tests only. There is no Docker or Supabase project in
 * the test environment, so this stands in for the server side of the calls @supabase/supabase-js makes:
 * bucket lookup, signed upload / download URLs (HMAC tokens with an expiry), raw uploads with bucket size
 * and MIME limits, ranged downloads, object info and removal.
 *
 * It is NOT proof that real Supabase behaves the same. It exists so the application's own behaviour (which
 * URLs it asks for, what it checks before and after an upload, what it refuses) is tested end to end.
 * `npm run storage:check` runs the equivalent probes against a real project.
 *
 * Admin endpoints (/__admin/*) let a test inspect stored objects, flip a bucket public, make removals fail,
 * and move the clock so expiry can be tested without waiting.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

interface Bucket {
  id: string;
  public: boolean;
  file_size_limit: number | null;
  allowed_mime_types: string[] | null;
}
interface StoredObject {
  bytes: Buffer;
  contentType: string;
  createdAt: string;
}

export interface FakeSupabase {
  server: Server;
  url: string;
  close(): Promise<void>;
}

export function startFakeSupabase(port: number, serviceKey: string): Promise<FakeSupabase> {
  const secret = "fake-storage-signing-secret";
  const buckets = new Map<string, Bucket>();
  const objects = new Map<string, StoredObject>();
  const signLog: { kind: string; bucket: string; path: string; expiresIn: number }[] = [];
  let clockOffsetMs = 0;
  let failRemove = false;
  const now = () => Date.now() + clockOffsetMs;

  const sign = (kind: string, bucket: string, path: string, exp: number) =>
    createHmac("sha256", secret).update(`${kind}|${bucket}|${path}|${exp}`).digest("base64url");
  const makeToken = (kind: string, bucket: string, path: string, expiresInSeconds: number) => {
    const exp = Math.floor(now() / 1000) + expiresInSeconds;
    return `${exp}.${sign(kind, bucket, path, exp)}`;
  };
  const checkToken = (kind: string, bucket: string, path: string, token: string | null): boolean => {
    if (!token) return false;
    const [expText, sig] = token.split(".");
    const exp = Number(expText);
    if (!Number.isFinite(exp) || exp * 1000 < now() || !sig) return false;
    const expected = Buffer.from(sign(kind, bucket, path, exp));
    const given = Buffer.from(sig);
    return expected.length === given.length && timingSafeEqual(expected, given);
  };

  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const apiError = (res: ServerResponse, status: number, message: string) =>
    json(res, status, { statusCode: String(status), error: message, message });
  const readBody = (req: IncomingMessage) =>
    new Promise<Buffer>((resolve) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => resolve(Buffer.concat(chunks)));
    });
  const isService = (req: IncomingMessage) => req.headers.authorization === `Bearer ${serviceKey}`;

  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://fake");
    const path = decodeURIComponent(url.pathname);
    const method = req.method ?? "GET";

    // ── test-only admin API ──
    if (path.startsWith("/__admin/")) {
      if (path === "/__admin/state") {
        return json(res, 200, {
          buckets: [...buckets.values()],
          objects: [...objects.entries()].map(([key, o]) => ({
            key,
            size: o.bytes.length,
            contentType: o.contentType,
          })),
          signLog,
        });
      }
      const body = JSON.parse((await readBody(req)).toString() || "{}");
      if (path === "/__admin/bucket") {
        buckets.set(body.id, {
          id: body.id,
          public: !!body.public,
          file_size_limit: body.file_size_limit ?? null,
          allowed_mime_types: body.allowed_mime_types ?? null,
        });
        return json(res, 200, {});
      }
      if (path === "/__admin/fail-remove") return ((failRemove = !!body.fail), json(res, 200, {}));
      if (path === "/__admin/clock") return ((clockOffsetMs += (body.seconds ?? 0) * 1000), json(res, 200, {}));
      if (path === "/__admin/reset") return (objects.clear(), (signLog.length = 0), json(res, 200, {}));
      return apiError(res, 404, "unknown admin call");
    }

    const m = /^\/storage\/v1\/(.*)$/.exec(path);
    if (!m) return apiError(res, 404, "not found");
    const route = m[1];

    // ── buckets ──
    const bucketMatch = /^bucket\/([^/]+)$/.exec(route);
    if (bucketMatch && method === "GET") {
      if (!isService(req)) return apiError(res, 403, "Unauthorized");
      const b = buckets.get(bucketMatch[1]);
      return b ? json(res, 200, { ...b, name: b.id }) : apiError(res, 404, "Bucket not found");
    }

    // ── signed upload URL: create ──
    let r = /^object\/upload\/sign\/([^/]+)\/(.+)$/.exec(route);
    if (r && method === "POST") {
      if (!isService(req)) return apiError(res, 403, "Unauthorized");
      const [, bucket, objectPath] = r;
      if (!buckets.has(bucket)) return apiError(res, 404, "Bucket not found");
      if (objects.has(`${bucket}/${objectPath}`) && req.headers["x-upsert"] !== "true")
        return apiError(res, 409, "The resource already exists");
      signLog.push({ kind: "upload", bucket, path: objectPath, expiresIn: 7200 });
      return json(res, 200, {
        url: `/object/upload/sign/${bucket}/${objectPath}?token=${makeToken("upload", bucket, objectPath, 7200)}`,
      });
    }
    // ── signed upload URL: use (no auth header: the token is the credential) ──
    if (r && method === "PUT") {
      const [, bucket, objectPath] = r;
      if (!checkToken("upload", bucket, objectPath, url.searchParams.get("token")))
        return apiError(res, 400, "Invalid or expired token");
      const b = buckets.get(bucket);
      if (!b) return apiError(res, 404, "Bucket not found");
      const bytes = await readBody(req);
      const contentType = String(req.headers["content-type"] ?? "application/octet-stream")
        .split(";")[0]
        .trim();
      if (b.allowed_mime_types && !b.allowed_mime_types.includes(contentType))
        return apiError(res, 415, "mime type not supported");
      if (b.file_size_limit && bytes.length > b.file_size_limit)
        return apiError(res, 413, "The object exceeded the maximum allowed size");
      if (objects.has(`${bucket}/${objectPath}`) && req.headers["x-upsert"] !== "true")
        return apiError(res, 409, "The resource already exists");
      objects.set(`${bucket}/${objectPath}`, { bytes, contentType, createdAt: new Date(now()).toISOString() });
      return json(res, 200, { Key: `${bucket}/${objectPath}` });
    }

    // ── signed download URLs: create (single and batch) ──
    r = /^object\/sign\/([^/]+)\/(.+)$/.exec(route);
    if (r && method === "POST") {
      if (!isService(req)) return apiError(res, 403, "Unauthorized");
      const [, bucket, objectPath] = r;
      const { expiresIn } = JSON.parse((await readBody(req)).toString() || "{}");
      if (!objects.has(`${bucket}/${objectPath}`)) return apiError(res, 400, "Object not found");
      signLog.push({ kind: "download", bucket, path: objectPath, expiresIn });
      return json(res, 200, {
        signedURL: `/object/sign/${bucket}/${objectPath}?token=${makeToken("download", bucket, objectPath, expiresIn)}`,
      });
    }
    r = /^object\/sign\/([^/]+)$/.exec(route);
    if (r && method === "POST") {
      if (!isService(req)) return apiError(res, 403, "Unauthorized");
      const bucket = r[1];
      const { expiresIn, paths } = JSON.parse((await readBody(req)).toString() || "{}") as {
        expiresIn: number;
        paths: string[];
      };
      return json(
        res,
        200,
        paths.map((p) => {
          if (!objects.has(`${bucket}/${p}`))
            return {
              error: "Either the object does not exist or you do not have access to it",
              path: p,
              signedURL: null,
            };
          signLog.push({ kind: "download", bucket, path: p, expiresIn });
          return {
            error: null,
            path: p,
            signedURL: `/object/sign/${bucket}/${p}?token=${makeToken("download", bucket, p, expiresIn)}`,
          };
        })
      );
    }
    // ── signed download URL: use ──
    if (r === null) {
      const use = /^object\/sign\/([^/]+)\/(.+)$/.exec(route);
      if (use && method === "GET") {
        const [, bucket, objectPath] = use;
        if (!checkToken("download", bucket, objectPath, url.searchParams.get("token")))
          return apiError(res, 400, "Invalid or expired token");
        const o = objects.get(`${bucket}/${objectPath}`);
        if (!o) return apiError(res, 404, "Object not found");
        const headers: Record<string, string | number> = { "content-type": o.contentType, "accept-ranges": "bytes" };
        if (url.searchParams.has("download"))
          headers["content-disposition"] = `attachment; filename="${url.searchParams.get("download") || objectPath}"`;
        const range = /^bytes=(\d+)-(\d+)?$/.exec(String(req.headers.range ?? ""));
        if (range) {
          const start = Number(range[1]);
          const end = Math.min(o.bytes.length - 1, range[2] ? Number(range[2]) : o.bytes.length - 1);
          const part = o.bytes.subarray(start, end + 1);
          res.writeHead(206, {
            ...headers,
            "content-range": `bytes ${start}-${end}/${o.bytes.length}`,
            "content-length": part.length,
          });
          return res.end(part);
        }
        res.writeHead(200, { ...headers, "content-length": o.bytes.length });
        return res.end(o.bytes);
      }
    }

    // ── object info / remove ──
    r = /^object\/info\/([^/]+)\/(.+)$/.exec(route);
    if (r && method === "GET") {
      if (!isService(req)) return apiError(res, 403, "Unauthorized");
      const o = objects.get(`${r[1]}/${r[2]}`);
      if (!o) return apiError(res, 404, "Object not found");
      return json(res, 200, {
        id: "obj",
        version: "1",
        name: r[2],
        bucket_id: r[1],
        size: o.bytes.length,
        content_type: o.contentType,
        cache_control: "max-age=3600",
        etag: "x",
        created_at: o.createdAt,
        last_modified: o.createdAt,
        metadata: { size: o.bytes.length, mimetype: o.contentType },
      });
    }
    r = /^object\/([^/]+)$/.exec(route);
    if (r && method === "DELETE") {
      if (!isService(req)) return apiError(res, 403, "Unauthorized");
      if (failRemove) return apiError(res, 500, "internal error");
      const { prefixes } = JSON.parse((await readBody(req)).toString() || "{}") as { prefixes: string[] };
      const removed = [];
      for (const p of prefixes) if (objects.delete(`${r[1]}/${p}`)) removed.push({ name: p, bucket_id: r[1] });
      return json(res, 200, removed);
    }

    // ── direct access paths that must NOT work for private buckets ──
    r = /^object\/(public|authenticated)\/([^/]+)\/(.+)$/.exec(route);
    if (r && method === "GET") {
      const [, mode, bucket, objectPath] = r;
      const b = buckets.get(bucket);
      const o = objects.get(`${bucket}/${objectPath}`);
      if (mode === "public" && b?.public && o) {
        res.writeHead(200, { "content-type": o.contentType });
        return res.end(o.bytes);
      }
      if (mode === "authenticated" && isService(req) && o) {
        res.writeHead(200, { "content-type": o.contentType });
        return res.end(o.bytes);
      }
      return apiError(res, 400, "Bucket not found"); // real Storage answers private/RLS-denied reads like this
    }
    return apiError(res, 404, "not found");
  };

  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      handler(req, res).catch((error) => {
        console.error("fake supabase error", error);
        if (!res.headersSent) apiError(res, 500, "fake server error");
      });
    });
    server.listen(port, "127.0.0.1", () =>
      resolve({
        server,
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((r2) => server.close(() => r2())),
      })
    );
  });
}
