-- Guarantees for the AI tables.
--
-- 1. CHECK constraints (data quality and bounds).
-- 2. Row-Level Security: the same tenant_isolation contract as every other tenant table.
-- 3. The usage ledger (ai_usage) is append-only for the runtime role: cost and token history cannot be
--    edited or erased by application code.

-- ---- 1. CHECK constraints ----

ALTER TABLE "ai_settings"
  ADD CONSTRAINT "ai_settings_limits_chk" CHECK (
    ("monthly_token_limit" IS NULL OR "monthly_token_limit" >= 0)
    AND ("monthly_cost_limit_micros" IS NULL OR "monthly_cost_limit_micros" >= 0)
    AND "requests_per_user_per_minute" BETWEEN 1 AND 600
    AND "max_output_tokens" BETWEEN 16 AND 8192
  );

ALTER TABLE "ai_conversations"
  -- A conversation is about at most one record.
  ADD CONSTRAINT "ai_conversations_context_chk" CHECK (
    (CASE WHEN "vehicle_id" IS NULL THEN 0 ELSE 1 END)
    + (CASE WHEN "customer_id" IS NULL THEN 0 ELSE 1 END)
    + (CASE WHEN "lead_id" IS NULL THEN 0 ELSE 1 END)
    + (CASE WHEN "deal_id" IS NULL THEN 0 ELSE 1 END) <= 1
  ),
  ADD CONSTRAINT "ai_conversations_title_chk" CHECK (length("title") BETWEEN 1 AND 200),
  ADD CONSTRAINT "ai_conversations_count_chk" CHECK ("message_count" >= 0);

ALTER TABLE "ai_messages"
  ADD CONSTRAINT "ai_messages_position_chk" CHECK ("position" >= 1),
  ADD CONSTRAINT "ai_messages_content_chk" CHECK (length("content") <= 100000),
  ADD CONSTRAINT "ai_messages_tokens_chk" CHECK (
    ("input_tokens" IS NULL OR "input_tokens" >= 0) AND ("output_tokens" IS NULL OR "output_tokens" >= 0)
  ),
  -- Only assistant messages carry provider details.
  ADD CONSTRAINT "ai_messages_provider_chk" CHECK ("role" = 'assistant' OR ("provider" IS NULL AND "model" IS NULL));

ALTER TABLE "ai_usage"
  ADD CONSTRAINT "ai_usage_amounts_chk" CHECK (
    "input_tokens" >= 0 AND "output_tokens" >= 0
    AND ("cost_micros" IS NULL OR "cost_micros" >= 0)
    AND ("latency_ms" IS NULL OR "latency_ms" >= 0)
  ),
  -- A refusal made before any provider call has no tokens.
  ADD CONSTRAINT "ai_usage_blocked_chk" CHECK ("status" <> 'blocked' OR ("input_tokens" = 0 AND "output_tokens" = 0));

ALTER TABLE "ai_activity"
  ADD CONSTRAINT "ai_activity_summary_chk" CHECK (length("summary") BETWEEN 1 AND 1000),
  ADD CONSTRAINT "ai_activity_time_saved_chk" CHECK ("time_saved_seconds" BETWEEN 0 AND 86400),
  -- A review is recorded together with who did it and when.
  ADD CONSTRAINT "ai_activity_review_chk" CHECK (("reviewed_by_id" IS NULL) = ("reviewed_at" IS NULL));

-- ---- 2. Row-Level Security ----

ALTER TABLE "ai_settings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "ai_settings"
  USING ("organization_id" = current_setting('app.org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.org_id', true));

ALTER TABLE "ai_conversations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "ai_conversations"
  USING ("organization_id" = current_setting('app.org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.org_id', true));

ALTER TABLE "ai_messages" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "ai_messages"
  USING ("organization_id" = current_setting('app.org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.org_id', true));

ALTER TABLE "ai_usage" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "ai_usage"
  USING ("organization_id" = current_setting('app.org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.org_id', true));

ALTER TABLE "ai_activity" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "ai_activity"
  USING ("organization_id" = current_setting('app.org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.org_id', true));

-- ---- 3. The usage ledger is append-only for the runtime role ----
-- (When the role is created later, prisma/sql/create-app-role.sql applies the same REVOKE.)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cda_app') THEN
    REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "ai_usage" FROM cda_app;
  END IF;
END
$$;
