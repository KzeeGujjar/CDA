/**
 * Unit check for the storage rules (no database, no Supabase): file validation, names, object paths, magic
 * bytes, configuration guards, and that the code and the SQL migration agree on buckets, limits and types.
 *
 *   npm run check:storage
 */
import { readFileSync } from "node:fs";
import { storageConfig } from "@/server/env";
import {
  ALL_BUCKETS,
  BUCKETS,
  buildObjectPath,
  CONTENT_TYPE_EXTENSIONS,
  DOCUMENT_TYPES_BY_KIND,
  KIND_RULES,
  matchesMagicBytes,
  pathBelongsTo,
  sanitizeFileName,
  validateUploadRequest,
} from "@/server/storage/file-rules";

let passed = 0;
const failures: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) passed++;
  else failures.push(`${name}${detail ? ` - ${detail}` : ""}`);
};
const same = (name: string, a: unknown, b: unknown) =>
  ok(name, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);
const bytes = (...n: number[]) => Uint8Array.from(n);
const issues = (
  kind: Parameters<typeof validateUploadRequest>[0],
  fileName: string,
  contentType: string,
  sizeBytes: number
) => validateUploadRequest(kind, { fileName, contentType, sizeBytes }).map((i) => i.path);

// ── what may be uploaded ──
same("a normal JPEG photo is accepted", issues("VEHICLE_PHOTO", "front.jpg", "image/jpeg", 2_000_000), []);
same("a PDF vehicle document is accepted", issues("VEHICLE_DOCUMENT", "mulkiya.pdf", "application/pdf", 500_000), []);
same(
  "a content type with parameters is accepted",
  issues("VEHICLE_PHOTO", "a.png", "image/png; charset=binary", 10),
  []
);
for (const bad of [
  "image/svg+xml",
  "text/html",
  "application/x-msdownload",
  "application/javascript",
  "application/zip",
  "image/gif",
  "text/plain",
  "application/octet-stream",
  "",
]) {
  ok(
    `refuses ${bad || "an empty content type"} for photos and documents`,
    issues("VEHICLE_PHOTO", "x", bad, 10).includes("contentType") &&
      issues("DEAL_DOCUMENT", "x", bad, 10).includes("contentType")
  );
}
ok(
  "no allowed type can carry script (no svg, html, js, exe, zip)",
  Object.keys(CONTENT_TYPE_EXTENSIONS).every(
    (t) => !/svg|html|javascript|msdownload|zip|xml$/.test(t) || t.includes("openxmlformats")
  )
);
ok(
  "photos accept only images",
  KIND_RULES.VEHICLE_PHOTO.contentTypes.every((t) => t.startsWith("image/"))
);
ok("a PDF is not a valid photo", issues("VEHICLE_PHOTO", "a.pdf", "application/pdf", 10).includes("contentType"));
ok(
  "photos are limited to 10 MB, documents to 25 MB",
  KIND_RULES.VEHICLE_PHOTO.maxBytes === 10 * 1048576 && KIND_RULES.CUSTOMER_DOCUMENT.maxBytes === 25 * 1048576
);
same("a photo over 10 MB is refused", issues("VEHICLE_PHOTO", "a.jpg", "image/jpeg", 10 * 1048576 + 1), ["sizeBytes"]);
same("exactly 10 MB is accepted", issues("VEHICLE_PHOTO", "a.jpg", "image/jpeg", 10 * 1048576), []);
for (const size of [0, -5, 1.5, Number.NaN])
  ok(`refuses a size of ${size}`, issues("VEHICLE_PHOTO", "a.jpg", "image/jpeg", size).includes("sizeBytes"));
same("an executable name declared as a PDF is refused", issues("DEAL_DOCUMENT", "invoice.exe", "application/pdf", 10), [
  "fileName",
]);
same(
  "a double extension that ends in .exe is refused",
  issues("DEAL_DOCUMENT", "invoice.pdf.exe", "application/pdf", 10),
  ["fileName"]
);
same("a .jpeg name with image/jpeg is fine", issues("VEHICLE_PHOTO", "a.JPEG", "image/jpeg", 10), []);
same("a name without an extension is fine", issues("VEHICLE_PHOTO", "front", "image/jpeg", 10), []);
same(
  "every problem is reported at once",
  issues("VEHICLE_PHOTO", "a.exe", "application/pdf", 0).sort(),
  ["contentType", "fileName", "sizeBytes"].sort()
);

// ── file names ──
same("path separators and wildcards are removed from a name", sanitizeFileName("../../etc/passwd"), "etc passwd");
same("a Windows path is reduced", sanitizeFileName("C:\\Users\\a\\report.pdf"), "C Users a report.pdf");
same("control characters and nulls are removed", sanitizeFileName("a\u0000b\u0007c.pdf"), "a b c.pdf");
ok(
  "a right-to-left override cannot disguise an extension",
  !/[\u202a-\u202e\u2066-\u2069]/.test(sanitizeFileName("invoice\u202Efdp.exe"))
);
same("Arabic names are kept", sanitizeFileName("عقد بيع سيارة.pdf"), "عقد بيع سيارة.pdf");
same("Hindi and Urdu names are kept", sanitizeFileName("गाड़ी.pdf"), "गाड़ी.pdf");
same(
  "an empty or dots-only name becomes a default",
  [sanitizeFileName(""), sanitizeFileName("..."), sanitizeFileName("   ")],
  ["file", "file", "file"]
);
ok("a very long name is cut to 150 characters", [...sanitizeFileName("a".repeat(500) + ".pdf")].length <= 150);
same("leading dots are stripped (no hidden files)", sanitizeFileName(".htaccess"), "htaccess");

// ── object paths ──
const path = buildObjectPath({
  organizationId: "org1",
  parentId: "veh1",
  fileId: "abc-123",
  contentType: "image/jpeg",
});
same("the path is <org>/<parent>/<file id>.<ext>", path, "org1/veh1/abc-123.jpg");
ok("a path is never built from a user-supplied name", !path.includes("front"));
for (const [label, value] of [
  ["a path traversal", "../x"],
  ["a slash", "a/b"],
  ["a backslash", "a\\b"],
  ["a space", "a b"],
  ["an empty id", ""],
  ["a null byte", "a\u0000"],
  ["a very long id", "a".repeat(65)],
] as const) {
  let threw = false;
  try {
    buildObjectPath({ organizationId: "org1", parentId: value, fileId: "f", contentType: "image/png" });
  } catch {
    threw = true;
  }
  ok(`refuses ${label} in a parent id`, threw);
}
ok(
  "refuses a content type with no extension",
  (() => {
    try {
      buildObjectPath({ organizationId: "o", parentId: "p", fileId: "f", contentType: "text/html" });
      return false;
    } catch {
      return true;
    }
  })()
);
ok("pathBelongsTo accepts the own folder", pathBelongsTo("org1", "org1/v/f.jpg"));
ok(
  "...refuses another organization, a prefix trick and traversal",
  !pathBelongsTo("org1", "org2/v/f.jpg") &&
    !pathBelongsTo("org1", "org10/v/f.jpg") &&
    !pathBelongsTo("org1", "org1/../org2/f.jpg")
);

// ── real file signatures ──
const jpeg = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1);
const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0);
const webp = bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50);
const pdf = bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0, 0, 0, 0);
const zip = bytes(0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0, 0, 0, 0, 0);
const html = new TextEncoder().encode("<html><script>");
const docx = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
same(
  "each real signature matches its own type",
  [
    matchesMagicBytes("image/jpeg", jpeg),
    matchesMagicBytes("image/png", png),
    matchesMagicBytes("image/webp", webp),
    matchesMagicBytes("application/pdf", pdf),
    matchesMagicBytes(docx, zip),
  ],
  [true, true, true, true, true]
);
same(
  "a PDF is not a JPEG, a JPEG is not a PDF, HTML is nothing",
  [
    matchesMagicBytes("image/jpeg", pdf),
    matchesMagicBytes("application/pdf", jpeg),
    matchesMagicBytes("image/png", html),
    matchesMagicBytes("application/pdf", html),
    matchesMagicBytes(docx, html),
  ],
  [false, false, false, false, false]
);
ok(
  "a RIFF file that is not WEBP (e.g. WAV) is refused",
  !matchesMagicBytes("image/webp", bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45))
);
ok("an unknown type never matches", !matchesMagicBytes("image/svg+xml", html) && !matchesMagicBytes("", jpeg));
ok(
  "an empty or truncated file never matches",
  !matchesMagicBytes("image/jpeg", bytes()) && !matchesMagicBytes("image/png", bytes(0x89, 0x50))
);
ok("parameters on the type do not defeat the check", matchesMagicBytes("image/jpeg; charset=x", jpeg));

// ── link lifetimes ──
ok(
  "document links live 5 minutes, photo links 1 hour",
  KIND_RULES.CUSTOMER_DOCUMENT.downloadUrlSeconds === 300 && KIND_RULES.VEHICLE_PHOTO.downloadUrlSeconds === 3600
);
ok(
  "only images and PDFs may render inline; Office files always download",
  KIND_RULES.DEAL_DOCUMENT.mayRenderInline("application/pdf") && !KIND_RULES.DEAL_DOCUMENT.mayRenderInline(docx)
);
ok(
  "every kind has its own bucket, and there are exactly four",
  new Set(ALL_BUCKETS).size === 4 && Object.keys(KIND_RULES).length === 4
);
ok(
  "every document kind has document types, including 'other'",
  Object.values(DOCUMENT_TYPES_BY_KIND).every((t) => (t as readonly string[]).includes("other"))
);

// ── configuration guards ──
function withEnv<T>(env: Record<string, string | undefined>, fn: () => T): T {
  const saved = { ...process.env };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    process.env = saved;
  }
}
const throws = (fn: () => unknown) => {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
};
ok(
  "storage needs both the URL and the service-role key",
  withEnv({ SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined }, () => throws(storageConfig)) &&
    withEnv({ SUPABASE_URL: "https://a.supabase.co", SUPABASE_SERVICE_ROLE_KEY: undefined }, () =>
      throws(storageConfig)
    )
);
ok(
  "a malformed URL is refused",
  withEnv({ SUPABASE_URL: "not a url", SUPABASE_SERVICE_ROLE_KEY: "k" }, () => throws(storageConfig))
);
ok(
  "http is tolerated in production only for loopback AND with the explicit test flag",
  withEnv(
    {
      NODE_ENV: "production",
      SUPABASE_URL: "http://127.0.0.1:54340",
      SUPABASE_SERVICE_ROLE_KEY: "k",
      STORAGE_ALLOW_INSECURE_URL: "1",
    },
    () => storageConfig().url === "http://127.0.0.1:54340"
  ) &&
    withEnv(
      {
        NODE_ENV: "production",
        SUPABASE_URL: "http://127.0.0.1:54340",
        SUPABASE_SERVICE_ROLE_KEY: "k",
        STORAGE_ALLOW_INSECURE_URL: undefined,
      },
      () => throws(storageConfig)
    ) &&
    withEnv(
      {
        NODE_ENV: "production",
        SUPABASE_URL: "http://evil.example.com",
        SUPABASE_SERVICE_ROLE_KEY: "k",
        STORAGE_ALLOW_INSECURE_URL: "1",
      },
      () => throws(storageConfig)
    )
);
ok(
  "production requires https",
  withEnv({ NODE_ENV: "production", SUPABASE_URL: "http://a.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" }, () =>
    throws(storageConfig)
  )
);
same(
  "a valid config is normalised to the origin",
  withEnv(
    { NODE_ENV: "production", SUPABASE_URL: "https://a.supabase.co/storage/v1/", SUPABASE_SERVICE_ROLE_KEY: "k" },
    () => storageConfig().url
  ),
  "https://a.supabase.co"
);
ok(
  "the service-role key setting is not a NEXT_PUBLIC variable",
  !readFileSync("src/server/env.ts", "utf8").includes("NEXT_PUBLIC_SUPABASE")
);

// ── the code and the SQL migration must agree ──
const sql = readFileSync("prisma/migrations/20260919000900_supabase_storage_policies/migration.sql", "utf8");
const checkSql = readFileSync("prisma/migrations/20260919000800_files_rls_and_checks/migration.sql", "utf8");
for (const [kind, bucket] of Object.entries(BUCKETS)) {
  ok(
    `SQL creates the ${bucket} bucket as PRIVATE with the code's size limit`,
    new RegExp(
      `'${bucket}',\\s+'${bucket}',\\s+false,\\s+${KIND_RULES[kind as keyof typeof KIND_RULES].maxBytes}`
    ).test(sql)
  );
  ok(`the files table CHECK ties ${kind} to ${bucket}`, checkSql.includes(`"bucket" = '${bucket}'`));
  ok(`the restrictive policy covers ${bucket}`, sql.includes(`''${bucket}''`));
}
ok("no bucket is created public in SQL", !/,\s*true,\s*\d+,\s*(photos|docs)_mime/.test(sql));
const sqlPhotoMime = [...(sql.match(/photos_mime text\[\] := ARRAY\[([^\]]*)\]/)?.[1] ?? "").matchAll(/'([^']+)'/g)]
  .map((m) => m[1])
  .sort();
const sqlDocMime = [...(sql.match(/docs_mime text\[\] := ARRAY\[([^\]]*)\]/)?.[1] ?? "").matchAll(/'([^']+)'/g)]
  .map((m) => m[1])
  .sort();
same("the SQL photo MIME allow-list equals the code", sqlPhotoMime, [...KIND_RULES.VEHICLE_PHOTO.contentTypes].sort());
same("the SQL document MIME allow-list equals the code", sqlDocMime, [...KIND_RULES.DEAL_DOCUMENT.contentTypes].sort());

if (failures.length) {
  console.error(`\nStorage check FAILED (${passed} passed, ${failures.length} failed):\n - ${failures.join("\n - ")}`);
  process.exit(1);
}
console.log(`Storage check OK: ${passed} assertions passed.`);
