/**
 * End-to-end check of the file endpoints over real HTTP, against the app AND a fake Supabase Storage server
 * (scripts/lib/fake-supabase-storage.ts). Needs, on a THROWAWAY migrated + seeded database:
 *   - the fake storage server:  tsx scripts/fake-supabase-storage.ts 54340
 *   - the app started with SUPABASE_URL=http://127.0.0.1:54340 SUPABASE_SERVICE_ROLE_KEY=<same key as the fake>
 *     STORAGE_PRIVATE_CHECK_TTL_SECONDS=1 COOKIE_SECURE=false (as the RLS-restricted cda_app role)
 *   - the same SUPABASE_* variables in this script's environment (it also runs the maintenance job).
 *
 *   CHECK_DB_ALLOW_WRITES=1 DIRECT_DATABASE_URL=... DATABASE_URL=... npm run check:storage-http
 */
import { createPrismaClient } from "@/server/db/client";
import { sessionCookieName } from "@/server/auth/cookies";
import { createSession } from "@/server/auth/session";
import { provisionOrganizationRoles } from "@/server/modules/rbac/apply-role-template";
import { runStorageMaintenance } from "@/server/platform/storage-maintenance";
import { seedDashboardFixture } from "./lib/dashboard-fixture";

try {
  process.loadEnvFile(".env");
} catch {
  // environment provided externally
}
if (process.env.CHECK_DB_ALLOW_WRITES !== "1") throw new Error("Set CHECK_DB_ALLOW_WRITES=1 (writes test data).");
const ownerUrl = process.env.DIRECT_DATABASE_URL;
if (!ownerUrl) throw new Error("Set DIRECT_DATABASE_URL.");
const BASE = process.env.CHECK_BASE_URL ?? "http://localhost:3100";
const FAKE = process.env.SUPABASE_URL ?? "http://127.0.0.1:54340";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const db = createPrismaClient(ownerUrl, { maxConnections: 2 });
const suffix = Date.now().toString(36);
let passed = 0;
const failures: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) passed++;
  else failures.push(`${name}${detail ? ` - ${detail}` : ""}`);
};
const same = (name: string, a: unknown, b: unknown) =>
  ok(name, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);

interface Res {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any;
  raw: string;
}
const allResponses: string[] = [];
let ipCounter = 0;
const runOctets = [1 + Math.floor(Math.random() * 200), Math.floor(Math.random() * 250)];
const nextIp = () => `10.${runOctets[0]}.${runOctets[1] + Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

async function call(method: string, path: string, token?: string, body?: unknown, rawBody?: string): Promise<Res> {
  const headers: Record<string, string> = { "x-real-ip": nextIp() };
  if (token) headers.cookie = `${sessionCookieName()}=${token}`;
  if (body !== undefined || rawBody !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const raw = await res.text();
  allResponses.push(raw);
  let json: unknown = null;
  try {
    json = JSON.parse(raw);
  } catch {
    // no body
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, json: json as any, raw };
}
const get = (p: string, t?: string) => call("GET", p, t);
const post = (p: string, t: string | undefined, b: unknown = {}) => call("POST", p, t, b);

const admin = async (path: string, body: unknown = {}) =>
  (await fetch(`${FAKE}/__admin/${path}`, { method: "POST", body: JSON.stringify(body) })).json();
const fakeState = async () =>
  (await (await fetch(`${FAKE}/__admin/state`)).json()) as {
    buckets: { id: string; public: boolean }[];
    objects: { key: string; size: number; contentType: string }[];
    signLog: { kind: string; bucket: string; path: string; expiresIn: number }[];
  };
const objectExists = async (bucket: string, path: string) =>
  (await fakeState()).objects.some((o) => o.key === `${bucket}/${path}`);

// ── file bytes with real signatures ──
const fill = (head: number[], size: number) => {
  const b = Buffer.alloc(size, 0x41);
  Buffer.from(head).copy(b);
  return b;
};
const jpeg = (size = 2048) => fill([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1], size);
const png = (size = 1024) => fill([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], size);
const pdf = (size = 4096) => fill([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37], size);
const docxBytes = (size = 3000) => fill([0x50, 0x4b, 0x03, 0x04], size);
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

interface Ticket {
  file: { id: string; status: string; isPrimary: boolean; fileName: string };
  upload: { url: string; token: string; bucket: string; path: string; headers: Record<string, string> };
}
/** What the browser does with the ticket: PUT the bytes straight to the signed URL. */
async function putBytes(ticket: Ticket, bytes: Buffer, contentType?: string) {
  const res = await fetch(ticket.upload.url, {
    method: "PUT",
    headers: { ...ticket.upload.headers, ...(contentType ? { "content-type": contentType } : {}) },
    body: new Uint8Array(bytes),
  });
  return res.status;
}

async function makeOrg(label: string) {
  const org = await db.organization.create({
    data: { name: `${label} ${suffix}`, email: `${label.toLowerCase()}-${suffix}@example.com` },
  });
  const roles = await db.$transaction((tx) => provisionOrganizationRoles(tx, org.id));
  const downtown = await db.branch.create({ data: { organizationId: org.id, name: "Downtown" } });
  const airport = await db.branch.create({ data: { organizationId: org.id, name: "Airport" } });
  const users: Record<string, { id: string; token: string }> = {};
  const mk = async (key: string, roleId: string, branchIds: string[] = []) => {
    const user = await db.user.create({
      data: {
        organizationId: org.id,
        roleId,
        name: key,
        email: `${key}-${label}-${suffix}@example.com`.toLowerCase(),
        status: "ACTIVE",
      },
    });
    for (const branchId of branchIds)
      await db.userBranch.create({ data: { userId: user.id, branchId, organizationId: org.id } });
    const token = (await createSession(db, { organizationId: org.id, userId: user.id })).token;
    return (users[key] = { id: user.id, token });
  };
  for (const key of [
    "dealerOwner",
    "manager",
    "salesperson",
    "buyer",
    "accountant",
    "marketingManager",
    "viewer",
  ] as const)
    await mk(key, roles[key], key === "salesperson" ? [downtown.id] : []);
  await mk("sales2", roles.salesperson, [airport.id]);
  return { org, roles, downtown, airport, users, mk };
}

async function main() {
  ok("the environment carries the fake storage settings", !!SERVICE_KEY && FAKE.startsWith("http://127.0.0.1"));
  for (const id of ["vehicle-photos", "vehicle-documents", "customer-documents", "deal-documents"])
    await admin("bucket", {
      id,
      public: false,
      file_size_limit: id === "vehicle-photos" ? 10485760 : 26214400,
      allowed_mime_types: null,
    });
  await admin("reset");

  const X = await makeOrg("Xray");
  const Y = await makeOrg("Yankee");
  const fx = await seedDashboardFixture(
    db,
    {
      organizationId: X.org.id,
      downtownId: X.downtown.id,
      airportId: X.airport.id,
      ownerId: X.users.dealerOwner.id,
      sp1Id: X.users.salesperson.id,
      sp2Id: X.users.sales2.id,
    },
    `x${suffix}`
  );
  const V = fx.vehicles;
  const custId = fx.customer.id;
  const tok = (k: string) => X.users[k].token;
  const yFx = await seedDashboardFixture(
    db,
    {
      organizationId: Y.org.id,
      downtownId: Y.downtown.id,
      airportId: Y.airport.id,
      ownerId: Y.users.dealerOwner.id,
      sp1Id: Y.users.salesperson.id,
      sp2Id: Y.users.sales2.id,
    },
    `y${suffix}`
  );
  const photoUrl = (vehicleId: string, rest = "") => `/api/v1/vehicles/${vehicleId}/photos${rest}`;

  // ═════════ 1. who may call what ═════════
  const photoBody = { fileName: "front.jpg", contentType: "image/jpeg", sizeBytes: 2048 };
  const rolesTable: [string, number, number][] = [
    // role, list photos, upload a photo
    ["dealerOwner", 200, 201],
    ["manager", 200, 201],
    ["buyer", 200, 201],
    ["salesperson", 200, 403],
    ["viewer", 200, 403],
    ["accountant", 403, 403],
    ["marketingManager", 403, 403],
  ];
  for (const [role, listStatus, uploadStatus] of rolesTable) {
    same(`${role}: list photos -> ${listStatus}`, (await get(photoUrl(V.v1.id), tok(role))).status, listStatus);
    same(
      `${role}: request a photo upload -> ${uploadStatus}`,
      (await post(photoUrl(V.v1.id, "/upload-url"), tok(role), photoBody)).status,
      uploadStatus
    );
  }
  const docReq = (
    parent: { type: string; id: string },
    documentType: string,
    name = "doc.pdf",
    type = "application/pdf",
    size = 4096
  ) => ({ parent, documentType, fileName: name, contentType: type, sizeBytes: size });
  const vehParent = { type: "vehicle", id: V.v1.id };
  const custParent = { type: "customer", id: custId };
  const dealMine = { type: "deal", id: fx.deals.d4.id }; // sp1's deal (Downtown)
  const dealOther = { type: "deal", id: fx.deals.d5.id }; // sp2's deal (Airport)
  // role, vehicle doc, customer doc, deal doc (own), deal doc (someone else's)
  const docTable: [string, number, number, number, number][] = [
    ["dealerOwner", 201, 201, 201, 201],
    ["manager", 201, 201, 201, 201],
    ["salesperson", 201, 201, 201, 404],
    ["buyer", 201, 403, 403, 403],
    ["accountant", 403, 403, 403, 403],
    ["viewer", 403, 403, 403, 403],
    ["marketingManager", 403, 403, 403, 403],
  ];
  for (const [role, v, c, d1, d2] of docTable) {
    const statuses = [
      (await post("/api/v1/documents/upload-url", tok(role), docReq(vehParent, "registration"))).status,
      (await post("/api/v1/documents/upload-url", tok(role), docReq(custParent, "passport"))).status,
      (await post("/api/v1/documents/upload-url", tok(role), docReq(dealMine, "contract"))).status,
      (await post("/api/v1/documents/upload-url", tok(role), docReq(dealOther, "invoice"))).status,
    ];
    same(`${role}: upload documents for vehicle / customer / own deal / other deal`, statuses, [v, c, d1, d2]);
  }
  same(
    "no session -> 401 on upload, list and download",
    [
      (await post("/api/v1/documents/upload-url", undefined, docReq(vehParent, "other"))).status,
      (await get(photoUrl(V.v1.id))).status,
      (await get("/api/v1/documents/x/download-url")).status,
    ],
    [401, 401, 401]
  );
  await admin("reset");
  await db.storedFile.deleteMany({ where: { organizationId: X.org.id } }); // tidy the pending rows created by the matrix

  // ═════════ 2. photo flow with real bytes ═════════
  same(
    "a vehicle with no photos yet has no thumbnail, on both the detail and the list endpoint",
    [
      (await get(`/api/v1/vehicles/${V.v1.id}`, tok("dealerOwner"))).json.primaryPhotoUrl,
      (await get(`/api/v1/vehicles?search=${V.v1.stockNumber}`, tok("dealerOwner"))).json.items[0]?.primaryPhotoUrl,
    ],
    [null, null]
  );
  const t1 = (
    await post(photoUrl(V.v1.id, "/upload-url"), tok("dealerOwner"), {
      fileName: "front.jpg",
      contentType: "image/jpeg",
      sizeBytes: 2048,
    })
  ).json as Ticket;
  ok(
    "an upload ticket names a signed Storage URL inside this organization's folder",
    t1.upload.url.startsWith(`${FAKE}/storage/v1/object/upload/sign/vehicle-photos/${X.org.id}/${V.v1.id}/`) &&
      t1.upload.url.includes("token=") &&
      t1.upload.path.startsWith(`${X.org.id}/`)
  );
  ok("the file name never appears in the object path", !t1.upload.path.includes("front"));
  same("the ticket starts the file as pending", [t1.file.status, t1.file.isPrimary], ["pending", false]);
  ok("the ticket exposes no service key", !JSON.stringify(t1).includes(SERVICE_KEY));
  const early = await post(photoUrl(V.v1.id, `/${t1.file.id}/complete`), tok("dealerOwner"));
  ok("completing before uploading is a 409", early.status === 409 && early.json.code === "upload_not_found");
  same("the browser PUTs the bytes straight to Storage", await putBytes(t1, jpeg(2048)), 200);
  const done1 = await post(photoUrl(V.v1.id, `/${t1.file.id}/complete`), tok("dealerOwner"));
  same(
    "complete verifies and activates; the first photo becomes the primary",
    [done1.status, done1.json.status, done1.json.isPrimary, done1.json.sortOrder],
    [200, "active", true, 0]
  );
  ok(
    "the photo comes with a SIGNED url (never a public one)",
    done1.json.url.startsWith(`${FAKE}/storage/v1/object/sign/vehicle-photos/`) &&
      done1.json.url.includes("token=") &&
      !done1.json.url.includes("/object/public/")
  );
  const img = await fetch(done1.json.url);
  ok(
    "the signed url serves the photo",
    img.status === 200 &&
      img.headers.get("content-type") === "image/jpeg" &&
      (await img.arrayBuffer()).byteLength === 2048
  );
  const again = await post(photoUrl(V.v1.id, `/${t1.file.id}/complete`), tok("dealerOwner"));
  ok("completing twice is harmless", again.status === 200 && again.json.isPrimary === true);
  ok(
    "the vehicle's thumbnail (detail and list) now points at the primary photo's own object",
    (await get(`/api/v1/vehicles/${V.v1.id}`, tok("dealerOwner"))).json.primaryPhotoUrl?.includes(
      `/${t1.file.id}.`
    ) &&
      (await get(`/api/v1/vehicles?search=${V.v1.stockNumber}`, tok("dealerOwner"))).json.items[0]?.primaryPhotoUrl?.includes(
        `/${t1.file.id}.`
      )
  );
  const t2 = (
    await post(photoUrl(V.v1.id, "/upload-url"), tok("dealerOwner"), {
      fileName: "side.png",
      contentType: "image/png",
      sizeBytes: 1024,
    })
  ).json as Ticket;
  await putBytes(t2, png(1024));
  const done2 = await post(photoUrl(V.v1.id, `/${t2.file.id}/complete`), tok("dealerOwner"));
  same("a second photo is not primary and sorts after", [done2.json.isPrimary, done2.json.sortOrder], [false, 1]);
  const list1 = (await get(photoUrl(V.v1.id), tok("salesperson"))).json;
  same(
    "a salesperson (vehicles:read) lists both photos, primary first, each with a signed url",
    [list1.map((p: { id: string }) => p.id), list1.every((p: { url: string }) => p.url?.includes("/object/sign/"))],
    [[t1.file.id, t2.file.id], true]
  );
  const patch = await call("PATCH", photoUrl(V.v1.id, `/${t2.file.id}`), tok("dealerOwner"), { isPrimary: true });
  same(
    "making another photo primary swaps it",
    [patch.status, (await get(photoUrl(V.v1.id), tok("dealerOwner"))).json.map((p: { id: string }) => p.id)],
    [200, [t2.file.id, t1.file.id]]
  );
  ok(
    "...and the vehicle's thumbnail follows the new primary",
    (await get(`/api/v1/vehicles/${V.v1.id}`, tok("dealerOwner"))).json.primaryPhotoUrl?.includes(`/${t2.file.id}.`)
  );
  same(
    "reordering validates its input (400 for a bad sortOrder or empty body)",
    [
      (await call("PATCH", photoUrl(V.v1.id, `/${t2.file.id}`), tok("dealerOwner"), { sortOrder: -1 })).status,
      (await call("PATCH", photoUrl(V.v1.id, `/${t2.file.id}`), tok("dealerOwner"), {})).status,
      (await call("PATCH", photoUrl(V.v1.id, `/${t2.file.id}`), tok("dealerOwner"), { isPrimary: false })).status,
    ],
    [400, 400, 400]
  );
  same(
    "a salesperson cannot edit or delete photos (403)",
    [
      (await call("PATCH", photoUrl(V.v1.id, `/${t1.file.id}`), tok("salesperson"), { sortOrder: 3 })).status,
      (await call("DELETE", photoUrl(V.v1.id, `/${t1.file.id}`), tok("salesperson"))).status,
    ],
    [403, 403]
  );
  const photoRow = await db.storedFile.findUniqueOrThrow({ where: { id: t2.file.id } });
  await call("DELETE", photoUrl(V.v1.id, `/${t2.file.id}`), tok("dealerOwner"));
  same(
    "deleting the primary promotes the next photo",
    (await get(photoUrl(V.v1.id), tok("dealerOwner"))).json.map((p: { id: string; isPrimary: boolean }) => [
      p.id,
      p.isPrimary,
    ]),
    [[t1.file.id, true]]
  );
  ok(
    "...and the vehicle's thumbnail falls back to the promoted photo",
    (await get(`/api/v1/vehicles/${V.v1.id}`, tok("dealerOwner"))).json.primaryPhotoUrl?.includes(`/${t1.file.id}.`)
  );
  ok("...and the object is really gone from storage", !(await objectExists("vehicle-photos", photoRow.objectPath)));
  const deletedRow = await db.storedFile.findUniqueOrThrow({ where: { id: t2.file.id } });
  ok(
    "the row is kept as a tombstone with the removal recorded",
    deletedRow.status === "DELETED" && deletedRow.objectRemoved === true && !!deletedRow.deletedAt
  );
  ok(
    "gallery links are signed for 1 hour",
    (await fakeState()).signLog.some(
      (s) => s.kind === "download" && s.bucket === "vehicle-photos" && s.expiresIn === 3600
    )
  );

  // ═════════ 3. documents: vehicle, customer, deal ═════════
  async function uploadDoc(
    role: string,
    parent: { type: string; id: string },
    documentType: string,
    name: string,
    type: string,
    bytes: Buffer
  ) {
    const t = (
      await post("/api/v1/documents/upload-url", tok(role), docReq(parent, documentType, name, type, bytes.length))
    ).json as Ticket;
    const putStatus = await putBytes(t, bytes);
    const done = await post(`/api/v1/documents/${t.file.id}/complete`, tok(role));
    return { t, putStatus, done };
  }
  const vDoc = await uploadDoc("dealerOwner", vehParent, "registration", "mulkiya.pdf", "application/pdf", pdf());
  const cDoc = await uploadDoc("dealerOwner", custParent, "emirates_id", "عقد هوية.png", "image/png", png(2000));
  const dDoc = await uploadDoc("dealerOwner", dealMine, "contract", "contract.pdf", "application/pdf", pdf(5000));
  const dDocx = await uploadDoc("dealerOwner", dealMine, "quotation", "quote.docx", DOCX, docxBytes());
  same(
    "all four documents upload and activate",
    [vDoc, cDoc, dDoc, dDocx].map((d) => [d.putStatus, d.done.status, d.done.json.status]),
    [
      [200, 200, "active"],
      [200, 200, "active"],
      [200, 200, "active"],
      [200, 200, "active"],
    ]
  );
  ok(
    "the object keys live in the right buckets under <org>/<parent>/",
    vDoc.t.upload.bucket === "vehicle-documents" &&
      cDoc.t.upload.bucket === "customer-documents" &&
      dDoc.t.upload.bucket === "deal-documents" &&
      cDoc.t.upload.path.startsWith(`${X.org.id}/${custId}/`)
  );
  same("an Arabic file name is kept for display", cDoc.done.json.fileName, "عقد هوية.png");
  same(
    "listing a deal shows its documents, newest first",
    (await get(`/api/v1/documents?dealId=${fx.deals.d4.id}`, tok("dealerOwner"))).json.map((d: { id: string }) => d.id),
    [dDocx.t.file.id, dDoc.t.file.id]
  );
  ok(
    "a document listing has no URLs and no storage details",
    !/https?:\/\/|objectPath|bucket/.test((await get(`/api/v1/documents?customerId=${custId}`, tok("dealerOwner"))).raw)
  );
  const dl = (await get(`/api/v1/documents/${dDoc.t.file.id}/download-url`, tok("dealerOwner"))).json;
  ok(
    "a download link is a short-lived SIGNED url",
    dl.url.startsWith(`${FAKE}/storage/v1/object/sign/deal-documents/`) &&
      dl.url.includes("token=") &&
      dl.expiresInSeconds === 300 &&
      dl.disposition === "attachment"
  );
  const dlRes = await fetch(dl.url);
  ok(
    "it downloads the file as an attachment with its display name",
    dlRes.status === 200 &&
      (dlRes.headers.get("content-disposition") ?? "").startsWith("attachment") &&
      (await dlRes.arrayBuffer()).byteLength === 5000
  );
  ok(
    "document links are signed for 5 minutes",
    (await fakeState()).signLog.some(
      (s) => s.kind === "download" && s.bucket === "deal-documents" && s.expiresIn === 300
    )
  );
  const inlinePdf = (
    await get(`/api/v1/documents/${dDoc.t.file.id}/download-url?disposition=inline`, tok("dealerOwner"))
  ).json;
  ok(
    "a PDF may be shown inline",
    inlinePdf.disposition === "inline" &&
      !(await fetch(inlinePdf.url).then((r) => r.headers.get("content-disposition")))
  );
  const inlineDocx = await get(
    `/api/v1/documents/${dDocx.t.file.id}/download-url?disposition=inline`,
    tok("dealerOwner")
  );
  ok(
    "an Office file may not be shown inline",
    inlineDocx.status === 400 && inlineDocx.json.code === "inline_not_allowed"
  );
  same(
    "an unknown download option is a 400",
    (await get(`/api/v1/documents/${dDoc.t.file.id}/download-url?public=true`, tok("dealerOwner"))).status,
    400
  );
  ok(
    "the public URL of a private object does not work",
    (await fetch(`${FAKE}/storage/v1/object/public/deal-documents/${dDoc.t.upload.path}`)).status !== 200
  );
  ok(
    "a tampered signed link is refused",
    (await fetch(dl.url.replace(/token=[^&]+/, "token=1.forged"))).status !== 200
  );
  const audited = await db.auditLog.findMany({
    where: {
      organizationId: X.org.id,
      action: { in: ["file.download_url_issued", "file.uploaded", "file.upload_requested"] },
    },
  });
  ok(
    "uploads and download-link requests are audited",
    ["file.download_url_issued", "file.uploaded", "file.upload_requested"].every((a) =>
      audited.some((r) => r.action === a)
    )
  );
  ok(
    "audit entries never contain a link or token",
    audited.every((r) => !/token=|https?:\/\//.test(JSON.stringify(r.metadata)))
  );
  const salesSeen = (await get(`/api/v1/documents?vehicleId=${V.v1.id}`, tok("salesperson"))).json;
  same("a salesperson (documents scope: own) does not see documents someone else uploaded", salesSeen, []);
  const spDoc = await uploadDoc(
    "salesperson",
    vehParent,
    "inspection_report",
    "inspection.pdf",
    "application/pdf",
    pdf(1500)
  );
  same(
    "...but sees their own",
    (await get(`/api/v1/documents?vehicleId=${V.v1.id}`, tok("salesperson"))).json.map((d: { id: string }) => d.id),
    [spDoc.t.file.id]
  );
  same(
    "...and cannot get a link to someone else's document (404, like a missing one)",
    [
      (await get(`/api/v1/documents/${vDoc.t.file.id}/download-url`, tok("salesperson"))).status,
      (await get(`/api/v1/documents/${vDoc.t.file.id}/download-url`, tok("salesperson"))).json.code,
    ],
    [404, "not_found"]
  );
  same(
    "the accountant can read customer and deal documents but not vehicle documents",
    [
      (await get(`/api/v1/documents?customerId=${custId}`, tok("accountant"))).status,
      (await get(`/api/v1/documents?dealId=${fx.deals.d4.id}`, tok("accountant"))).status,
      (await get(`/api/v1/documents?vehicleId=${V.v1.id}`, tok("accountant"))).status,
    ],
    [200, 200, 403]
  );
  same(
    "...and can download a deal document",
    (await get(`/api/v1/documents/${dDoc.t.file.id}/download-url`, tok("accountant"))).status,
    200
  );
  same(
    "the buyer sees vehicle documents but not customer or deal documents",
    [
      (await get(`/api/v1/documents?vehicleId=${V.v1.id}`, tok("buyer"))).status,
      (await get(`/api/v1/documents?customerId=${custId}`, tok("buyer"))).status,
      (await get(`/api/v1/documents?dealId=${fx.deals.d4.id}`, tok("buyer"))).status,
    ],
    [200, 403, 403]
  );
  same(
    "a document list needs exactly one parent filter",
    [
      (await get("/api/v1/documents", tok("dealerOwner"))).status,
      (await get(`/api/v1/documents?vehicleId=${V.v1.id}&customerId=${custId}`, tok("dealerOwner"))).status,
    ],
    [400, 400]
  );

  // ═════════ 4. what is refused ═════════
  const refuse = async (name: string, body: unknown, path = "/api/v1/documents/upload-url") => {
    const r = await post(path, tok("dealerOwner"), body);
    ok(
      `400 for: ${name}`,
      r.status === 400 && ["validation_error", "tenant_field_not_allowed"].includes(r.json?.code),
      `status ${r.status} ${r.raw.slice(0, 120)}`
    );
  };
  await refuse("an HTML file", docReq(vehParent, "other", "x.html", "text/html"));
  await refuse("an SVG image", docReq(vehParent, "other", "x.svg", "image/svg+xml"));
  await refuse("an executable", docReq(vehParent, "other", "x.exe", "application/x-msdownload"));
  await refuse("an .exe named like a PDF", docReq(vehParent, "other", "invoice.exe", "application/pdf"));
  await refuse(
    "a right-to-left-override disguise",
    docReq(vehParent, "other", `invoice${String.fromCharCode(0x202e)}fdp.exe`, "application/pdf")
  );
  await refuse("a document over 25 MB", docReq(vehParent, "other", "big.pdf", "application/pdf", 25 * 1048576 + 1));
  await refuse("an empty file", docReq(vehParent, "other", "e.pdf", "application/pdf", 0));
  await refuse("a document type that does not fit the parent", docReq(dealMine, "emirates_id"));
  await refuse("a missing document type", { ...docReq(vehParent, "other"), documentType: "" });
  await refuse("a client-chosen bucket", { ...docReq(vehParent, "other"), bucket: "deal-documents" });
  await refuse("a client-chosen object path", { ...docReq(vehParent, "other"), objectPath: "../../x" });
  await refuse("a client-chosen organization", { ...docReq(vehParent, "other"), organizationId: Y.org.id });
  await refuse("a parent id with path characters", docReq({ type: "vehicle", id: "../x" }, "other"));
  await refuse("an unknown parent type", docReq({ type: "organization", id: "abc" }, "other"));
  await refuse(
    "a photo over 10 MB",
    { fileName: "a.jpg", contentType: "image/jpeg", sizeBytes: 10 * 1048576 + 1 },
    photoUrl(V.v1.id, "/upload-url")
  );
  await refuse(
    "a PDF as a photo",
    { fileName: "a.pdf", contentType: "application/pdf", sizeBytes: 100 },
    photoUrl(V.v1.id, "/upload-url")
  );
  ok(
    "a body containing a tenant key is refused",
    (
      await post("/api/v1/documents/upload-url", tok("dealerOwner"), {
        ...docReq(vehParent, "other"),
        dealershipId: Y.org.id,
      })
    ).json?.code === "tenant_field_not_allowed"
  );

  // spoofed content: declared as a JPEG, actually a PDF
  const spoof = (
    await post(photoUrl(V.v3.id, "/upload-url"), tok("dealerOwner"), {
      fileName: "fake.jpg",
      contentType: "image/jpeg",
      sizeBytes: 3000,
    })
  ).json as Ticket;
  await putBytes(spoof, pdf(3000), "image/jpeg");
  const spoofDone = await post(photoUrl(V.v3.id, `/${spoof.file.id}/complete`), tok("dealerOwner"));
  ok(
    "a PDF disguised as a JPEG is rejected at completion",
    spoofDone.status === 400 && spoofDone.json.code === "invalid_upload"
  );
  ok(
    "...its object is deleted from storage and its row retired",
    !(await objectExists("vehicle-photos", spoof.upload.path)) &&
      (await db.storedFile.findUniqueOrThrow({ where: { id: spoof.file.id } })).status === "DELETED"
  );
  ok(
    "...and the rejection is audited",
    !!(await db.auditLog.findFirst({
      where: { organizationId: X.org.id, action: "file.upload_rejected", entityId: spoof.file.id },
    }))
  );
  same(
    "a rejected file can no longer be completed",
    (await post(photoUrl(V.v3.id, `/${spoof.file.id}/complete`), tok("dealerOwner"))).status,
    404
  );
  // wrong size
  const wrongSize = (
    await post(photoUrl(V.v3.id, "/upload-url"), tok("dealerOwner"), {
      fileName: "s.jpg",
      contentType: "image/jpeg",
      sizeBytes: 5000,
    })
  ).json as Ticket;
  await putBytes(wrongSize, jpeg(1234));
  same(
    "an upload whose size differs from the declared size is rejected",
    (await post(photoUrl(V.v3.id, `/${wrongSize.file.id}/complete`), tok("dealerOwner"))).json.code,
    "invalid_upload"
  );
  // wrong uploader
  const mine = (await post("/api/v1/documents/upload-url", tok("salesperson"), docReq(vehParent, "other")))
    .json as Ticket;
  await putBytes(mine, pdf());
  same(
    "only the uploader can complete an upload (even the owner gets 404)",
    (await post(`/api/v1/documents/${mine.file.id}/complete`, tok("dealerOwner"))).status,
    404
  );
  same(
    "a photo cannot be completed through the documents route, nor a document through photos",
    [
      (await post(`/api/v1/documents/${t1.file.id}/complete`, tok("dealerOwner"))).status,
      (await post(photoUrl(V.v1.id, `/${mine.file.id}/complete`), tok("salesperson"))).status,
    ],
    [404, 403]
  );
  same(
    "a photo cannot be completed under a different vehicle",
    (await post(photoUrl(V.v3.id, `/${t1.file.id}/complete`), tok("dealerOwner"))).status,
    404
  );

  // ═════════ 5. other organizations ═════════
  const yo = Y.users.dealerOwner.token;
  const missing = await get("/api/v1/documents/does-not-exist/download-url", yo);
  const crossDl = await get(`/api/v1/documents/${dDoc.t.file.id}/download-url`, yo);
  same(
    "another organization's document: 404, indistinguishable from a missing one",
    [crossDl.status, crossDl.json.message, crossDl.json.code],
    [missing.status, missing.json.message, missing.json.code]
  );
  same(
    "another organization cannot list, request uploads for, or delete our things",
    [
      (await get(photoUrl(V.v1.id), yo)).status,
      (await post(photoUrl(V.v1.id, "/upload-url"), yo, photoBody)).status,
      (await get(`/api/v1/documents?customerId=${custId}`, yo)).status,
      (await post("/api/v1/documents/upload-url", yo, docReq(custParent, "passport"))).status,
      (await call("DELETE", `/api/v1/documents/${dDoc.t.file.id}`, yo)).status,
      (await post(`/api/v1/documents/${mine.file.id}/complete`, yo)).status,
      (await call("DELETE", photoUrl(V.v1.id, `/${t1.file.id}`), yo)).status,
    ],
    [404, 404, 404, 404, 404, 404, 404]
  );
  const yTicket = (
    await post("/api/v1/documents/upload-url", yo, docReq({ type: "vehicle", id: yFx.vehicles.v1.id }, "registration"))
  ).json as Ticket;
  await putBytes(yTicket, pdf());
  await post(`/api/v1/documents/${yTicket.file.id}/complete`, yo);
  const keys = (await fakeState()).objects.map((o) => o.key);
  ok(
    "every stored object sits under its own organization's folder",
    keys.every((k) => {
      const [, org] = k.split("/");
      return [X.org.id, Y.org.id].includes(org);
    }) && keys.some((k) => k.split("/")[1] === Y.org.id)
  );
  ok(
    "...and the database agrees: no file row points outside its organization",
    (await db.storedFile.findMany()).every((f) => f.objectPath.startsWith(`${f.organizationId}/`))
  );

  // ═════════ 6. branch scope for photos ═════════
  const permId = async (key: string) => (await db.permission.findUniqueOrThrow({ where: { key } })).id;
  const role = await db.role.create({
    data: { organizationId: X.org.id, key: `branch_photos_${suffix}`, name: "Branch photographer", rank: 20 },
  });
  for (const key of ["vehicles:read", "vehicles:update"])
    await db.rolePermission.create({
      data: { roleId: role.id, organizationId: X.org.id, permissionId: await permId(key), scope: "BRANCH" },
    });
  const airportUser = await X.mk("airportPhotographer", role.id, [X.airport.id]);
  const lonely = await X.mk("lonelyPhotographer", role.id, []);
  same(
    "branch scope: photos for a vehicle in my branch work, in another branch 404",
    [
      (await post(photoUrl(V.v3.id, "/upload-url"), airportUser.token, photoBody)).status,
      (await post(photoUrl(V.v1.id, "/upload-url"), airportUser.token, photoBody)).status,
      (await get(photoUrl(V.v1.id), airportUser.token)).status,
    ],
    [201, 404, 404]
  );
  same(
    "branch scope with no branch assigned fails closed",
    [
      (await get(photoUrl(V.v3.id), lonely.token)).status,
      (await post(photoUrl(V.v3.id, "/upload-url"), lonely.token, photoBody)).status,
    ],
    [404, 404]
  );

  // ═════════ 7. deleting documents, failed removals, and the cleanup job ═════════
  same(
    "a salesperson cannot delete documents (no documents:delete)",
    (await call("DELETE", `/api/v1/documents/${spDoc.t.file.id}`, tok("salesperson"))).status,
    403
  );
  const delPath = cDoc.t.upload.path;
  same(
    "the owner deletes a customer document",
    (await call("DELETE", `/api/v1/documents/${cDoc.t.file.id}`, tok("dealerOwner"))).json,
    { deleted: true }
  );
  ok(
    "it disappears from lists and links, and from storage",
    (await get(`/api/v1/documents?customerId=${custId}`, tok("dealerOwner"))).json.length === 0 &&
      (await get(`/api/v1/documents/${cDoc.t.file.id}/download-url`, tok("dealerOwner"))).status === 404 &&
      !(await objectExists("customer-documents", delPath))
  );
  ok(
    "the deletion is audited",
    !!(await db.auditLog.findFirst({
      where: { organizationId: X.org.id, action: "file.deleted", entityId: cDoc.t.file.id },
    }))
  );
  same(
    "deleting twice is a 404",
    (await call("DELETE", `/api/v1/documents/${cDoc.t.file.id}`, tok("dealerOwner"))).status,
    404
  );

  await admin("fail-remove", { fail: true });
  const stuck = await call("DELETE", `/api/v1/documents/${dDocx.t.file.id}`, tok("dealerOwner"));
  const stuckRow = await db.storedFile.findUniqueOrThrow({ where: { id: dDocx.t.file.id } });
  ok(
    "if Storage cannot remove the object the file is still revoked at once",
    stuck.status === 200 &&
      stuckRow.status === "DELETED" &&
      stuckRow.objectRemoved === false &&
      (await get(`/api/v1/documents/${dDocx.t.file.id}/download-url`, tok("dealerOwner"))).status === 404
  );
  ok("...while the object waits in storage", await objectExists("deal-documents", dDocx.t.upload.path));
  const failedRun = await runStorageMaintenance();
  ok(
    "the cleanup job reports failures while Storage is down",
    failedRun.failures >= 1 && (await objectExists("deal-documents", dDocx.t.upload.path))
  );
  await admin("fail-remove", { fail: false });
  const abandoned = (await post(photoUrl(V.v3.id, "/upload-url"), tok("dealerOwner"), photoBody)).json as Ticket;
  await putBytes(abandoned, jpeg(2048));
  await db.storedFile.update({
    where: { id: abandoned.file.id },
    data: { createdAt: new Date(Date.now() - 25 * 3_600_000) },
  });
  const cleanRun = await runStorageMaintenance();
  ok(
    "once Storage is back the job retries the removal",
    cleanRun.retriedRemovals >= 1 &&
      !(await objectExists("deal-documents", dDocx.t.upload.path)) &&
      (await db.storedFile.findUniqueOrThrow({ where: { id: dDocx.t.file.id } })).objectRemoved === true
  );
  ok(
    "...and retires an upload abandoned for over 24 hours, removing whatever arrived",
    cleanRun.abandonedUploads >= 1 &&
      (await db.storedFile.findUniqueOrThrow({ where: { id: abandoned.file.id } })).status === "DELETED" &&
      !(await objectExists("vehicle-photos", abandoned.upload.path))
  );
  const noop = await runStorageMaintenance();
  same("running the job again does nothing", [noop.abandonedUploads, noop.retriedRemovals, noop.failures], [0, 0, 0]);

  // ═════════ 8. limits ═════════
  const limitVehicle = V.v8;
  await db.storedFile.createMany({
    data: Array.from({ length: 40 }, (_, i) => ({
      organizationId: X.org.id,
      kind: "VEHICLE_PHOTO" as const,
      status: "ACTIVE" as const,
      bucket: "vehicle-photos",
      objectPath: `${X.org.id}/${limitVehicle.id}/limit-${i}-${suffix}.jpg`,
      vehicleId: limitVehicle.id,
      originalName: `p${i}.jpg`,
      contentType: "image/jpeg",
      sizeBytes: 100,
      sortOrder: i,
      uploadedById: X.users.dealerOwner.id,
      completedAt: new Date(),
    })),
  });
  const capped = await post(photoUrl(limitVehicle.id, "/upload-url"), tok("dealerOwner"), photoBody);
  ok("a vehicle holds at most 40 photos (409)", capped.status === 409 && capped.json.code === "file_limit_reached");
  await db.storedFile.createMany({
    data: Array.from({ length: 50 }, (_, i) => ({
      organizationId: X.org.id,
      kind: "VEHICLE_DOCUMENT" as const,
      status: "PENDING" as const,
      bucket: "vehicle-documents",
      objectPath: `${X.org.id}/${V.v2.id}/pending-${i}-${suffix}.pdf`,
      vehicleId: V.v2.id,
      documentType: "other",
      originalName: `d${i}.pdf`,
      contentType: "application/pdf",
      sizeBytes: 100,
      uploadedById: X.users.manager.id,
    })),
  });
  const tooMany = await post(
    "/api/v1/documents/upload-url",
    tok("manager"),
    docReq({ type: "vehicle", id: V.v2.id }, "other")
  );
  ok("a user can have at most 50 unfinished uploads (429)", tooMany.status === 429 && !!tooMany.json.code);

  // ═════════ 9. the kill switch: a bucket made public is refused ═════════
  await admin("bucket", { id: "vehicle-photos", public: true, file_size_limit: 10485760, allowed_mime_types: null });
  await new Promise((r) => setTimeout(r, 1300));
  const publicUpload = await post(photoUrl(V.v1.id, "/upload-url"), tok("dealerOwner"), photoBody);
  const publicList = await get(photoUrl(V.v1.id), tok("dealerOwner"));
  ok(
    "if a bucket is switched to public, no upload link is issued (503)",
    publicUpload.status === 503 && publicUpload.json.code === "storage_misconfigured"
  );
  ok("...and no photo link is issued either", publicList.status === 503);
  ok(
    "...and the error says nothing about the bucket or the key",
    !/vehicle-photos|supabase|key/i.test(publicUpload.raw)
  );
  await admin("bucket", { id: "vehicle-photos", public: false, file_size_limit: 10485760, allowed_mime_types: null });
  await new Promise((r) => setTimeout(r, 1300));
  same(
    "once it is private again, uploads resume",
    (await post(photoUrl(V.v1.id, "/upload-url"), tok("dealerOwner"), photoBody)).status,
    201
  );

  // ═════════ 10. hygiene ═════════
  ok(
    "no response ever contained the service-role key",
    allResponses.every((r) => !r.includes(SERVICE_KEY))
  );
  ok(
    "no API response contains a direct storage path or bucket name outside upload tickets",
    allResponses
      .filter((r) => !r.includes('"upload"') && !r.includes("validation_error"))
      .every((r) => !/objectPath|"bucket"/.test(r))
  );
}

main()
  .catch((error) => failures.push(`unexpected error: ${(error as Error).stack ?? error}`))
  .finally(async () => {
    await db.$disconnect();
    if (failures.length) {
      console.error(
        `\nStorage HTTP check FAILED (${passed} passed, ${failures.length} failed):\n - ${failures.join("\n - ")}`
      );
      process.exit(1);
    }
    console.log(`Storage HTTP check OK: ${passed} assertions passed.`);
  });
