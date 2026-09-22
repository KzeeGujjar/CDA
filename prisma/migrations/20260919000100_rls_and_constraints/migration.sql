-- Database-level guarantees that Prisma's schema language cannot express.
--
-- 1. Data-quality CHECK constraints.
-- 2. Append-only audit log.
-- 3. Row-Level Security: tenant isolation on every tenant-owned table.
--
-- RLS contract
--   Each request runs in a transaction that first executes
--       SELECT set_config('app.org_id', '<organization id>', true);
--   Every policy compares organization_id to that setting. If the setting is missing the comparison
--   is NULL and NO rows are visible or writable (fail closed).
--
--   RLS is ENABLED (not FORCED): the table owner (the role that runs migrations, seeds and the
--   platform/auth client) bypasses it by design. The runtime application connects as the separate
--   `cda_app` role created by prisma/sql/create-app-role.sql, which must never own tables and must
--   never have BYPASSRLS. Lookups that happen before a tenant is known (login by email, session by
--   token hash) go through the platform client, never the tenant client.

-- ---- 1. CHECK constraints ----

ALTER TABLE "users"
  ADD CONSTRAINT "users_email_lowercase_chk" CHECK ("email" = lower("email"));

ALTER TABLE "invitations"
  ADD CONSTRAINT "invitations_email_lowercase_chk" CHECK ("email" = lower("email"));

ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_country_chk" CHECK ("country" ~ '^[A-Z]{2}$'),
  ADD CONSTRAINT "organizations_currency_chk" CHECK ("currency" ~ '^[A-Z]{3}$');

ALTER TABLE "roles"
  ADD CONSTRAINT "roles_rank_chk" CHECK ("rank" >= 0);

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_expiry_chk" CHECK ("expires_at" > "created_at");

-- ---- 2. Append-only audit log ----

CREATE FUNCTION "audit_logs_reject_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only (% is not allowed)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER "audit_logs_no_update_delete"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "audit_logs_reject_mutation"();

CREATE TRIGGER "audit_logs_no_truncate"
  BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION "audit_logs_reject_mutation"();

-- ---- 3. Row-Level Security (tenants) ----

ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "organizations"
  USING ("id" = current_setting('app.org_id', true))
  WITH CHECK ("id" = current_setting('app.org_id', true));

ALTER TABLE "branches" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "branches"
  USING ("organization_id" = current_setting('app.org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.org_id', true));

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "users"
  USING ("organization_id" = current_setting('app.org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.org_id', true));

ALTER TABLE "user_branches" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "user_branches"
  USING ("organization_id" = current_setting('app.org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.org_id', true));

ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "roles"
  USING ("organization_id" = current_setting('app.org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.org_id', true));

ALTER TABLE "role_permissions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "role_permissions"
  USING ("organization_id" = current_setting('app.org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.org_id', true));

ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "sessions"
  USING ("organization_id" = current_setting('app.org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.org_id', true));

ALTER TABLE "auth_tokens" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "auth_tokens"
  USING ("organization_id" = current_setting('app.org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.org_id', true));

ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "invitations"
  USING ("organization_id" = current_setting('app.org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.org_id', true));

ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "api_keys"
  USING ("organization_id" = current_setting('app.org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.org_id', true));

ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "audit_logs"
  USING ("organization_id" = current_setting('app.org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.org_id', true));

-- "permissions" is the global, read-only catalog and intentionally has no RLS.
