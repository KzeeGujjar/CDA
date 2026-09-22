/**
 * Tests the SQL in migration supabase_storage_policies against a SIMULATED Supabase `storage` schema
 * (buckets + objects with Row-Level Security, and the anon / authenticated / service_role roles), in a
 * scratch database created on the test server. It proves the policy logic; it cannot prove what a real
 * Supabase project does (run `npm run storage:check` against yours for that).
 *
 *   CHECK_DB_ALLOW_WRITES=1 DIRECT_DATABASE_URL=... npm run check:storage-policies
 */
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { KIND_RULES } from "@/server/storage/file-rules";

try {
  process.loadEnvFile(".env");
} catch {
  // environment provided externally
}
if (process.env.CHECK_DB_ALLOW_WRITES !== "1")
  throw new Error("Set CHECK_DB_ALLOW_WRITES=1 (creates a scratch database).");
const ownerUrl = process.env.DIRECT_DATABASE_URL;
if (!ownerUrl) throw new Error("Set DIRECT_DATABASE_URL.");

let passed = 0;
const failures: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) passed++;
  else failures.push(`${name}${detail ? ` - ${detail}` : ""}`);
};
const same = (name: string, a: unknown, b: unknown) =>
  ok(name, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);

const migration = readFileSync("prisma/migrations/20260919000900_supabase_storage_policies/migration.sql", "utf8");
const OURS = ["vehicle-photos", "vehicle-documents", "customer-documents", "deal-documents"];

async function main() {
  const adminUrl = new URL(ownerUrl!);
  const scratchName = `storage_sim_${Date.now().toString(36)}`;
  const admin = new Client({ connectionString: ownerUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${scratchName}`);
  adminUrl.pathname = `/${scratchName}`;
  const db = new Client({ connectionString: adminUrl.toString() });
  await db.connect();
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
  const asRole = async <T>(role: string, fn: () => Promise<T>): Promise<T> => {
    await q("BEGIN");
    try {
      await q(`SET LOCAL ROLE ${role}`);
      return await fn();
    } finally {
      await q("ROLLBACK");
    }
  };
  const tryRole = async (role: string, sql: string) => {
    try {
      const r = await asRole(role, () => q(sql));
      return { ok: true as const, rows: r.rows, count: r.rowCount ?? 0 };
    } catch (e) {
      return { ok: false as const, error: String((e as Error).message) };
    }
  };

  try {
    // ── a minimal imitation of Supabase's storage schema and roles ──
    for (const role of ["anon", "authenticated", "service_role"]) {
      await admin.query(
        `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN CREATE ROLE ${role} NOLOGIN${role === "service_role" ? " BYPASSRLS" : ""}; END IF; END $$`
      );
    }
    await q(`
      CREATE SCHEMA storage;
      CREATE TABLE storage.buckets (id text PRIMARY KEY, name text NOT NULL, public boolean DEFAULT false, file_size_limit bigint, allowed_mime_types text[]);
      CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text REFERENCES storage.buckets(id), name text, owner uuid);
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
      GRANT ALL ON storage.objects, storage.buckets TO anon, authenticated, service_role;
    `);
    await q("INSERT INTO storage.buckets (id, name, public) VALUES ('other-bucket', 'other-bucket', true)");

    // ── run the real migration ──
    await q(migration);
    const buckets = (
      await q(
        "SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id <> 'other-bucket' ORDER BY id"
      )
    ).rows;
    same(
      "the migration creates exactly the four buckets",
      buckets.map((b) => b.id),
      [...OURS].sort()
    );
    ok(
      "every bucket is PRIVATE",
      buckets.every((b) => b.public === false)
    );
    ok(
      "size limits match the code",
      buckets.every(
        (b) =>
          Number(b.file_size_limit) ===
          (b.id === "vehicle-photos" ? KIND_RULES.VEHICLE_PHOTO.maxBytes : KIND_RULES.DEAL_DOCUMENT.maxBytes)
      )
    );
    same(
      "the photo bucket accepts only images",
      [...buckets.find((b) => b.id === "vehicle-photos").allowed_mime_types].sort(),
      [...KIND_RULES.VEHICLE_PHOTO.contentTypes].sort()
    );
    same(
      "the document buckets accept the document types",
      [...buckets.find((b) => b.id === "deal-documents").allowed_mime_types].sort(),
      [...KIND_RULES.DEAL_DOCUMENT.contentTypes].sort()
    );
    const untouched = (await q("SELECT public FROM storage.buckets WHERE id = 'other-bucket'")).rows[0];
    ok("a bucket that is not ours is left alone", untouched.public === true);
    same(
      "one restrictive policy per client role",
      (
        await q(
          "SELECT policyname, permissive, roles::text FROM pg_policies WHERE schemaname='storage' AND tablename='objects' ORDER BY policyname"
        )
      ).rows.map((p) => [p.policyname, p.permissive]),
      [
        ["cda_deny_anon", "RESTRICTIVE"],
        ["cda_deny_authenticated", "RESTRICTIVE"],
      ]
    );

    // ── seed one object per bucket (owner bypasses RLS) ──
    for (const b of [...OURS, "other-bucket"])
      await q("INSERT INTO storage.objects (bucket_id, name) VALUES ($1, 'org1/thing.pdf')", [b]);

    const inOurs = `bucket_id IN (${OURS.map((b) => `'${b}'`).join(",")})`;
    // ── client roles are locked out ──
    for (const role of ["anon", "authenticated"]) {
      const sel = await tryRole(role, `SELECT * FROM storage.objects WHERE ${inOurs}`);
      ok(`${role} cannot read any object in our buckets`, sel.ok && sel.rows.length === 0, JSON.stringify(sel));
      const insert = await tryRole(
        role,
        `INSERT INTO storage.objects (bucket_id, name) VALUES ('deal-documents', 'org1/x.pdf')`
      );
      ok(`${role} cannot write into our buckets`, !insert.ok && /row-level security/i.test(insert.error));
      const upd = await tryRole(role, `UPDATE storage.objects SET name = 'hacked' WHERE ${inOurs}`);
      ok(`${role} cannot update objects in our buckets`, upd.ok && upd.count === 0);
      const del = await tryRole(role, `DELETE FROM storage.objects WHERE ${inOurs}`);
      ok(`${role} cannot delete objects in our buckets`, del.ok && del.count === 0);
    }
    same(
      "nothing was changed by those attempts",
      (await q(`SELECT count(*)::int AS n FROM storage.objects WHERE ${inOurs}`)).rows[0].n,
      4
    );
    const service = await tryRole("service_role", `SELECT * FROM storage.objects WHERE ${inOurs}`);
    ok("the service role (used only by our server) still sees them", service.ok && service.rows.length === 4);

    // ── a careless permissive policy cannot open our buckets ──
    await q(
      `CREATE POLICY careless_allow_all ON storage.objects FOR ALL TO authenticated USING (true) WITH CHECK (true)`
    );
    const afterCareless = await tryRole("authenticated", "SELECT bucket_id FROM storage.objects ORDER BY 1");
    same(
      "even with 'authenticated may read everything', only the non-private bucket is visible",
      afterCareless.ok ? afterCareless.rows.map((r) => r.bucket_id) : afterCareless,
      ["other-bucket"]
    );
    const carelessInsert = await tryRole(
      "authenticated",
      `INSERT INTO storage.objects (bucket_id, name) VALUES ('customer-documents', 'org1/x.pdf')`
    );
    ok(
      "...and it still cannot write into a private bucket",
      !carelessInsert.ok && /row-level security/i.test(carelessInsert.error)
    );
    const otherInsert = await tryRole(
      "authenticated",
      `INSERT INTO storage.objects (bucket_id, name) VALUES ('other-bucket', 'x')`
    );
    ok(
      "...while the permissive policy still works for buckets outside the list (the restriction is scoped)",
      otherInsert.ok
    );
    await q("DROP POLICY careless_allow_all ON storage.objects");

    // ── re-running repairs drift ──
    await q("UPDATE storage.buckets SET public = true, file_size_limit = 999999999999 WHERE id = 'vehicle-photos'");
    await q(migration);
    const repaired = (await q("SELECT public, file_size_limit FROM storage.buckets WHERE id = 'vehicle-photos'"))
      .rows[0];
    ok(
      "re-running the migration makes a bucket private again and restores its limit",
      repaired.public === false && Number(repaired.file_size_limit) === KIND_RULES.VEHICLE_PHOTO.maxBytes
    );
    same(
      "...without duplicating policies",
      (await q("SELECT count(*)::int AS n FROM pg_policies WHERE schemaname='storage' AND tablename='objects'")).rows[0]
        .n,
      2
    );
  } finally {
    await db.end();
    await admin.query(`DROP DATABASE IF EXISTS ${scratchName}`).catch(() => undefined);
    await admin.end();
  }

  // ── on a database WITHOUT a storage schema the migration does nothing and does not fail ──
  const plain = new Client({ connectionString: ownerUrl });
  await plain.connect();
  try {
    ok(
      "the test database has no storage schema",
      (await plain.query("SELECT to_regclass('storage.objects') AS t")).rows[0].t === null
    );
    let threw = false;
    try {
      await plain.query(migration);
    } catch {
      threw = true;
    }
    ok("the migration is a harmless no-op on plain PostgreSQL", !threw);
  } finally {
    await plain.end();
  }
}

main()
  .catch((error) => failures.push(`unexpected error: ${(error as Error).stack ?? error}`))
  .finally(() => {
    if (failures.length) {
      console.error(
        `\nStorage policy check FAILED (${passed} passed, ${failures.length} failed):\n - ${failures.join("\n - ")}`
      );
      process.exit(1);
    }
    console.log(`Storage policy check OK: ${passed} assertions passed.`);
  });
