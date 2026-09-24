-- Global search (§29): substring search ("contains", case-insensitive) cannot use a plain btree index at all —
-- a sequential scan is the only option without this. pg_trgm lets a GIN index serve both LIKE/ILIKE '%term%'
-- and the Prisma `contains`/`insensitive` filters every module's existing `search` param already builds
-- (vehicles, customers, leads via the customer/vehicle relations, documents, messages) plus the two new ones
-- this section adds (tasks, ai_conversations). Purely additive: no existing query changes shape, only speed.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- pg_trgm's own functions (similarity, word_similarity, the gtrgm_*/gin_trgm_* index support functions...)
-- are created with PostgreSQL's default EXECUTE-to-PUBLIC grant — unlike tables, a new function is
-- executable by everyone (including anon/authenticated, as members of the PUBLIC pseudo-role) unless
-- revoked. 20260921000100_lock_api_roles_and_reference_rls's REVOKE ... FROM anon/authenticated does not
-- reach this: it revokes a grant made TO those roles specifically, not the one they inherit FROM PUBLIC.
-- Revoke from PUBLIC itself, and keep new functions in this schema from getting it again by default.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC;

-- A GIN trigram index's support functions (gtrgm_consistent and friends) run under the QUERYING role's own
-- privileges even when invoked internally by an index scan — so cda_app, having just lost the PUBLIC grant
-- above, needs its own explicit EXECUTE or its ILIKE queries stop being able to use these indexes at all.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cda_app') THEN
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO cda_app;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "vehicles_make_trgm_idx" ON "vehicles" USING GIN ("make" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "vehicles_model_trgm_idx" ON "vehicles" USING GIN ("model" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "vehicles_trim_trgm_idx" ON "vehicles" USING GIN ("trim" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "vehicles_vin_trgm_idx" ON "vehicles" USING GIN ("vin" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "vehicles_stock_number_trgm_idx" ON "vehicles" USING GIN ("stock_number" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "customers_name_trgm_idx" ON "customers" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "customers_email_trgm_idx" ON "customers" USING GIN ("email" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "customers_phone_trgm_idx" ON "customers" USING GIN ("phone" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "generated_documents_title_trgm_idx" ON "generated_documents" USING GIN ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "tasks_title_trgm_idx" ON "tasks" USING GIN ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "conversations_contact_name_trgm_idx" ON "conversations" USING GIN ("contact_name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "conversations_last_message_preview_trgm_idx" ON "conversations" USING GIN ("last_message_preview" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "ai_conversations_title_trgm_idx" ON "ai_conversations" USING GIN ("title" gin_trgm_ops);
