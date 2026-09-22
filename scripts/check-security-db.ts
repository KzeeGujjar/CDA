/**
 * Database security audit: `npm run check:security-db`, against a THROWAWAY database that has had
 * `prisma migrate deploy` + `prisma db seed` applied and (for the runtime-role checks) the `cda_app` role
 * (`CHECK_DB_BOOTSTRAP_ROLE=1 npm run check:db` creates it).
 *
 *   CHECK_DB_ALLOW_WRITES=1 DIRECT_DATABASE_URL=... npm run check:security-db
 *
 * It reads the catalogs, so it holds for every table that will ever be added, not only today's:
 *  - every table has row-level security; every tenant table has policies that use the session's organization,
 *    with a WITH CHECK, and none is "allow everything"; a table without organization_id must be on a short,
 *    reviewed list of global tables;
 *  - no SECURITY DEFINER function exists (it would run as its owner and skip RLS);
 *  - the runtime role can neither bypass RLS nor create objects, and cannot touch the tables it must not;
 *  - Supabase's public API roles (`anon`, `authenticated`, which the PUBLIC anon key acts as) hold no privilege
 *    on this schema. Those roles exist on Supabase but not on plain PostgreSQL, so when they are missing this
 *    script creates them the way Supabase does (default privileges granting everything), then replays the
 *    lock-down migration, so the migration is tested against the state it exists to repair.
 * The behavioural checks then act as each role (SET ROLE) and try to read and write.
 */
import { readFileSync } from "node:fs";
import { Client } from "pg";

try {
  process.loadEnvFile(".env");
} catch {
  // environment provided externally
}
if (process.env.CHECK_DB_ALLOW_WRITES !== "1") {
  throw new Error("Refusing to run: this check may create roles. Set CHECK_DB_ALLOW_WRITES=1 on a throwaway database.");
}
const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("Set DIRECT_DATABASE_URL.");

/** Tables that hold no tenant data. Adding a table here is a reviewed decision; anything else without an organization must fail. */
const GLOBAL_TABLES = new Set(["permissions", "currencies", "exchange_rates", "rate_limit_buckets"]);
/** Global tables that are read-only reference data (the runtime role may SELECT them). */
const REFERENCE_TABLES = new Set(["permissions", "currencies", "exchange_rates"]);
const MIGRATION = "prisma/migrations/20260921000100_lock_api_roles_and_reference_rls/migration.sql";
const API_ROLES = ["anon", "authenticated"] as const;

let passed = 0;
const failures: string[] = [];
const ok = (name: string, condition: boolean, detail = "") => {
  if (condition) passed++;
  else failures.push(`${name}${detail ? ` - ${detail}` : ""}`);
};

async function connect() {
  const client = new Client({ connectionString: url });
  await client.connect();
  return client;
}

/** Runs a statement as `role` on its own connection and reports whether the database allowed it. */
async function asRole(role: string, sql: string, settings: Record<string, string> = {}) {
  const client = await connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL ROLE ${role}`);
    for (const [key, value] of Object.entries(settings))
      await client.query("SELECT set_config($1, $2, true)", [key, value]);
    const result = await client.query(sql);
    await client.query("ROLLBACK");
    return { allowed: true as const, rows: result.rows, rowCount: result.rowCount ?? 0 };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    return { allowed: false as const, message: (error as Error).message, rows: [], rowCount: 0 };
  } finally {
    await client.end();
  }
}

async function main() {
  const db = await connect();
  const q = async <T extends Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    (await db.query(sql, params)).rows as T[];
  const roleExists = async (name: string) => (await q("SELECT 1 FROM pg_roles WHERE rolname = $1", [name])).length > 0;

  // ── Put a plain PostgreSQL into the state a Supabase project starts in, then apply the lock-down ─────────────
  let simulated = false;
  if (!(await roleExists("anon")) && !(await roleExists("authenticated"))) {
    simulated = true;
    await db.query(`
      CREATE ROLE anon NOLOGIN NOINHERIT;
      CREATE ROLE authenticated NOLOGIN NOINHERIT;
      GRANT USAGE ON SCHEMA public TO anon, authenticated;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
      GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated;
    `);
    // Proof that the state really is the dangerous one before the migration repairs it.
    const before = await asRole("anon", `UPDATE exchange_rates SET rate = rate WHERE false`);
    ok("SIMULATION: before the lock-down migration, the anon role can write exchange_rates", before.allowed);
    // Apply the migration to that state (twice: it must be safe to run again). On a real database the state is audited as it is.
    await db.query(readFileSync(MIGRATION, "utf8"));
    await db.query(readFileSync(MIGRATION, "utf8"));
  }

  // ── Row-level security on every table ───────────────────────────────────────────────────────────────────────
  const tables = await q<{ tbl: string; rls: boolean; has_org: boolean; policies: string }>(`
    SELECT c.relname AS tbl, c.relrowsecurity AS rls,
      EXISTS (SELECT 1 FROM information_schema.columns k
              WHERE k.table_schema = 'public' AND k.table_name = c.relname AND k.column_name = 'organization_id') AS has_org,
      (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname)::text AS policies
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relname NOT LIKE E'\\\\_prisma%'
    ORDER BY 1`);
  ok("there are tables to audit", tables.length >= 25, `${tables.length}`);
  for (const t of tables) {
    ok(`table ${t.tbl} has row-level security enabled`, t.rls);
    const isOrgTable = t.has_org || t.tbl === "organizations";
    if (!isOrgTable) {
      ok(`table ${t.tbl} holds no organization_id, so it must be a reviewed global table`, GLOBAL_TABLES.has(t.tbl));
    } else {
      ok(`tenant table ${t.tbl} has a policy`, Number(t.policies) >= 1);
      ok(`tenant table ${t.tbl} is not on the global list`, !GLOBAL_TABLES.has(t.tbl));
    }
  }
  for (const name of GLOBAL_TABLES)
    ok(
      `reviewed global table ${name} still exists`,
      tables.some((t) => t.tbl === name)
    );

  const policies = await q<{
    tablename: string;
    policyname: string;
    cmd: string;
    qual: string | null;
    with_check: string | null;
  }>(`SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public'`);
  for (const p of policies) {
    const label = `${p.tablename}.${p.policyname}`;
    if (REFERENCE_TABLES.has(p.tablename)) {
      ok(`policy ${label} is read-only`, p.cmd === "SELECT");
      continue;
    }
    ok(
      `policy ${label} is scoped by the session's organization`,
      /app\.org_id/.test(`${p.qual ?? ""}${p.with_check ?? ""}`),
      p.qual ?? ""
    );
    ok(`policy ${label} is not "allow everything"`, !/^\(?\s*true\s*\)?$/i.test((p.qual ?? "").trim()));
    if (p.cmd === "ALL" || p.cmd === "INSERT" || p.cmd === "UPDATE") {
      ok(`policy ${label} checks rows being written (WITH CHECK)`, !!p.with_check && /app\.org_id/.test(p.with_check));
    }
  }
  for (const name of GLOBAL_TABLES) {
    const writes = policies.filter((p) => p.tablename === name && p.cmd !== "SELECT");
    ok(`global table ${name} has no write policy`, writes.length === 0);
  }

  // ── No function may run with its owner's rights ────────────────────────────────────────────────────────────────
  const definers = await q<{ proname: string }>(
    `SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.prosecdef`
  );
  ok(
    "no SECURITY DEFINER function in the public schema (it would skip row-level security)",
    definers.length === 0,
    definers.map((d) => d.proname).join(", ")
  );
  const functions = await q<{ n: string }>(
    `SELECT count(*)::text AS n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'`
  );
  ok("the dashboard functions exist", Number(functions[0].n) >= 5);

  // ── Supabase's public API roles hold nothing ───────────────────────────────────────────────────────────────────
  for (const role of API_ROLES) {
    if (!(await roleExists(role))) continue;
    const tablePrivileges = await q<{ bad: string }>(
      `SELECT c.relname || ':' || p AS bad
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
       WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m') AND has_table_privilege($1, c.oid, p)`,
      [role]
    );
    ok(
      `${role} has no privilege on any table`,
      tablePrivileges.length === 0,
      tablePrivileges
        .slice(0, 4)
        .map((r) => r.bad)
        .join(", ")
    );
    const seqPrivileges = await q<{ bad: string }>(
      `SELECT c.relname AS bad FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'S' AND (has_sequence_privilege($1, c.oid, 'USAGE') OR has_sequence_privilege($1, c.oid, 'SELECT'))`,
      [role]
    );
    ok(`${role} has no privilege on any sequence`, seqPrivileges.length === 0);
    const fnPrivileges = await q<{ bad: string }>(
      `SELECT p.proname AS bad FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.prorettype <> 'trigger'::regtype AND has_function_privilege($1, p.oid, 'EXECUTE')`,
      [role]
    );
    ok(`${role} cannot execute any function`, fnPrivileges.length === 0, fnPrivileges.map((r) => r.bad).join(", "));
    const explicitSchemaGrant = await q<{ n: string }>(
      `SELECT count(*)::text AS n FROM pg_namespace ns, aclexplode(ns.nspacl) a WHERE ns.nspname = 'public' AND a.grantee = (SELECT oid FROM pg_roles WHERE rolname = $1)`,
      [role]
    );
    ok(
      `${role} has no explicit grant on the schema (PostgreSQL itself lets everyone see a schema, which exposes nothing)`,
      Number(explicitSchemaGrant[0].n) === 0
    );
    const defaults = await q<{ n: string }>(
      `SELECT count(*)::text AS n FROM pg_default_acl d JOIN pg_namespace n ON n.oid = d.defaclnamespace
       WHERE n.nspname = 'public' AND d.defaclacl::text LIKE $1`,
      [`%${role}=%`]
    );
    ok(`nothing created in future is granted to ${role}`, Number(defaults[0].n) === 0);

    // Behaviour, acting as the role.
    for (const [what, sql] of [
      ["read users", `SELECT * FROM users LIMIT 1`],
      ["read sessions (token hashes)", `SELECT * FROM sessions LIMIT 1`],
      ["read auth_tokens", `SELECT * FROM auth_tokens LIMIT 1`],
      ["read rate_limit_buckets", `SELECT * FROM rate_limit_buckets LIMIT 1`],
      ["read permissions", `SELECT * FROM permissions LIMIT 1`],
      ["rewrite exchange_rates", `UPDATE exchange_rates SET rate = rate`],
      ["delete rate_limit_buckets (reset login throttling)", `DELETE FROM rate_limit_buckets`],
      ["insert into audit_logs", `INSERT INTO audit_logs (id) VALUES (gen_random_uuid())`],
    ] as const) {
      const r = await asRole(role, sql);
      ok(
        `${role} cannot ${what}`,
        !r.allowed && /permission denied/i.test(r.message ?? ""),
        r.allowed ? "it was allowed" : r.message
      );
    }
    const anyOrg = await asRole(role, `SELECT 1 FROM roles LIMIT 1`, {
      "app.org_id": "00000000-0000-0000-0000-000000000000",
    });
    ok(`${role} cannot read tenant data even when it sets the tenant setting itself`, !anyOrg.allowed);
  }

  // ── The runtime role ───────────────────────────────────────────────────────────────────────────────────────
  if (!(await roleExists("cda_app"))) {
    failures.push("the cda_app role does not exist; run `CHECK_DB_BOOTSTRAP_ROLE=1 npm run check:db` first");
  } else {
    const [role] = await q<{ rolsuper: boolean; rolbypassrls: boolean; rolcreatedb: boolean; rolcreaterole: boolean }>(
      `SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = 'cda_app'`
    );
    ok("cda_app is not a superuser", !role.rolsuper);
    ok("cda_app cannot bypass row-level security", !role.rolbypassrls);
    ok("cda_app cannot create databases or roles", !role.rolcreatedb && !role.rolcreaterole);
    const owned = await q<{ n: string }>(
      `SELECT count(*)::text AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND pg_get_userbyid(c.relowner) = 'cda_app'`
    );
    ok("cda_app owns no table (an owner is not bound by RLS)", Number(owned[0].n) === 0);
    ok(
      "cda_app cannot create objects in the schema",
      !(await q<{ a: boolean }>(`SELECT has_schema_privilege('cda_app', 'public', 'CREATE') AS a`))[0].a
    );
    for (const table of REFERENCE_TABLES) {
      for (const p of ["INSERT", "UPDATE", "DELETE", "TRUNCATE"]) {
        ok(
          `cda_app cannot ${p} ${table}`,
          !(await q<{ a: boolean }>(`SELECT has_table_privilege('cda_app', $1, $2) AS a`, [`public.${table}`, p]))[0].a
        );
      }
    }
    ok(
      "cda_app has no access to rate_limit_buckets",
      !(await q<{ a: boolean }>(`SELECT has_table_privilege('cda_app', 'public.rate_limit_buckets', 'SELECT') AS a`))[0]
        .a
    );
    for (const p of ["UPDATE", "DELETE", "TRUNCATE"]) {
      ok(
        `cda_app cannot ${p} audit_logs (append-only)`,
        !(await q<{ a: boolean }>(`SELECT has_table_privilege('cda_app', 'public.audit_logs', $1) AS a`, [p]))[0].a
      );
    }
    // Behaviour: RLS filters by the session's organization, in both directions.
    const [busiest] = await q<{ id: string; n: string }>(
      `SELECT organization_id AS id, count(*)::text AS n FROM roles GROUP BY 1 ORDER BY count(*) DESC LIMIT 1`
    );
    const platform = { id: busiest.id };
    const total = (await q<{ n: string }>(`SELECT count(*)::text AS n FROM roles`))[0].n;
    ok(
      "there is tenant data to test isolation with",
      Number(busiest.n) >= 1 && Number(total) > Number(busiest.n),
      `${busiest.n} of ${total}`
    );
    const none = await asRole("cda_app", `SELECT * FROM roles`);
    ok("with no organization set, cda_app sees no rows", none.allowed && none.rowCount === 0, `${none.rowCount}`);
    const other = await asRole("cda_app", `SELECT * FROM roles`, {
      "app.org_id": "00000000-0000-0000-0000-00000000dead",
    });
    ok(
      "with another organization set, cda_app sees no rows",
      other.allowed && other.rowCount === 0,
      `${other.rowCount}`
    );
    const own = await asRole("cda_app", `SELECT * FROM roles`, { "app.org_id": platform.id });
    ok(
      "with the right organization set, cda_app sees exactly that organization's rows and no others",
      own.allowed && own.rowCount === Number(busiest.n) && own.rowCount < Number(total),
      `${own.rowCount} of ${busiest.n} (${total} in total)`
    );
    const cross = await asRole(
      "cda_app",
      `INSERT INTO roles (id, organization_id, key, name, is_system, rank, updated_at) VALUES (gen_random_uuid()::text, '${platform.id}', 'x', 'x', false, 0, now())`,
      { "app.org_id": "00000000-0000-0000-0000-00000000dead" }
    );
    ok(
      "cda_app cannot write a row into a different organization (WITH CHECK)",
      !cross.allowed && /row-level security/i.test(cross.message ?? ""),
      cross.allowed ? "it was allowed" : cross.message
    );
    for (const [what, sql] of [
      ["rewrite exchange_rates", `UPDATE exchange_rates SET rate = rate`],
      ["rewrite the permission catalog", `DELETE FROM permissions`],
      ["read rate_limit_buckets", `SELECT * FROM rate_limit_buckets`],
    ] as const) {
      const r = await asRole("cda_app", sql, { "app.org_id": platform.id });
      ok(
        `cda_app cannot ${what}`,
        !r.allowed && /permission denied/i.test(r.message ?? ""),
        r.allowed ? "it was allowed" : r.message
      );
    }
  }

  // The owner still works: migrations, seed and the auth client depend on it.
  const owner = await q<{ n: string }>(`SELECT count(*)::text AS n FROM permissions`);
  ok("the owner can still read the permission catalog", Number(owner[0].n) > 50);
  await db.end();

  console.log(
    `${simulated ? "(Supabase-style roles were simulated on this plain PostgreSQL.) " : ""}Database security audit: ${passed} checks passed, ${failures.length} failed.`
  );
  if (failures.length) {
    console.error(` - ${failures.join("\n - ")}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
