-- Locks the database against Supabase's public Data API and puts row-level security on the four global tables.
--
-- WHY
--   A Supabase project exposes every table in the `public` schema to the roles `anon` and `authenticated`
--   through its REST/GraphQL Data API, and the anon key is PUBLIC (it ships in every Supabase web app). New
--   tables are granted to those roles by default privileges. This application never uses the Data API: it
--   talks to PostgreSQL only from the server, as the least-privilege role `cda_app` (tenant tables, forced by
--   RLS) or as the owner (auth flows). So `anon` and `authenticated` need NO access to anything here.
--
--   Before this migration, on a Supabase-shaped database:
--     * rate_limit_buckets, exchange_rates, currencies and permissions had no RLS at all, so the public anon
--       key could rewrite them: reset login throttling, change exchange rates, edit the permission catalog.
--     * every tenant table was guarded by its RLS policy alone.
--   After it, the two API roles have no privilege on the schema, its tables, sequences or functions, and
--   nothing created later is granted to them either. On a plain PostgreSQL (no such roles) it does nothing.
--
--   The service_role is deliberately left alone: it is the server-side key, it is never used for database
--   access by this application (only for Storage), and it must never reach a browser.
DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON SCHEMA public FROM %I', api_role);
      -- Objects created later by the migration role must not be granted to them again.
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;

-- Row-level security on the global tables, as a second layer behind the grants. The owner (migrations, seed,
-- the auth/platform client) bypasses RLS as before. The runtime role already has no write privilege on the
-- reference tables and none at all on rate_limit_buckets; RLS now makes that true even if a grant is added by
-- mistake. Reference data is not secret, so reading it is allowed for anyone who holds the SELECT privilege.
ALTER TABLE "rate_limit_buckets" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "currencies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exchange_rates" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reference_read ON "permissions";
CREATE POLICY reference_read ON "permissions" FOR SELECT USING (true);
DROP POLICY IF EXISTS reference_read ON "currencies";
CREATE POLICY reference_read ON "currencies" FOR SELECT USING (true);
DROP POLICY IF EXISTS reference_read ON "exchange_rates";
CREATE POLICY reference_read ON "exchange_rates" FOR SELECT USING (true);
