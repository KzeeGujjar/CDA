-- Creates the least-privilege runtime role. Run ONCE per environment, as the database owner /
-- migration role, after the first `prisma migrate deploy`. Not a migration: roles are cluster-level
-- and the password is a secret.
--
--   psql "$DIRECT_DATABASE_URL" -v app_password="'<strong random password>'" -f prisma/sql/create-app-role.sql
--
-- The app must connect (DATABASE_URL) as `cda_app`. It is NOT the table owner and has NOBYPASSRLS, so
-- the tenant_isolation policies always apply to it.

CREATE ROLE cda_app LOGIN PASSWORD :app_password
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS INHERIT;

GRANT USAGE ON SCHEMA public TO cda_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cda_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cda_app;

-- Tables created by future migrations (run as the same owner) get the same grants automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cda_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO cda_app;

-- Audit log: insert + read only (a trigger also blocks UPDATE/DELETE for everyone).
REVOKE UPDATE, DELETE, TRUNCATE ON "audit_logs" FROM cda_app;

-- Permission catalog: read-only at runtime; changed only by the seed, which runs as the owner.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "permissions" FROM cda_app;

-- Rate-limit counters: platform (owner) client only.
REVOKE ALL ON "rate_limit_buckets" FROM cda_app;

-- Vehicle status history is written by a trigger and is append-only for the runtime role.
REVOKE UPDATE, DELETE, TRUNCATE ON "vehicle_status_events" FROM cda_app;

-- Dashboard SQL functions (SECURITY INVOKER, so RLS still applies). The migration that creates them takes
-- EXECUTE away from PUBLIC; this gives it to the runtime role when the role is created after the migration.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO cda_app;

-- AI usage ledger (tokens and cost per provider call): append-only for the runtime role.
REVOKE UPDATE, DELETE, TRUNCATE ON "ai_usage" FROM cda_app;

-- AI tool-call audit trail: never deleted by the runtime role.
REVOKE DELETE, TRUNCATE ON "ai_tool_calls" FROM cda_app;

-- Currency catalog and exchange rates: global reference data, read-only at runtime (maintained by migrations
-- and the platform, which run as the owner).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "currencies", "exchange_rates" FROM cda_app;
