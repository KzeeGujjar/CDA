-- Guarantees for tasks, partner requests and the AI tool-call audit table.
-- 1. CHECK constraints. 2. Row-Level Security (same tenant_isolation contract as every tenant table).
-- 3. ai_tool_calls: rows are never deleted by the runtime role (the audit trail of what the AI did).

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_title_chk" CHECK (length("title") BETWEEN 1 AND 200),
  ADD CONSTRAINT "tasks_description_chk" CHECK ("description" IS NULL OR length("description") <= 4000),
  ADD CONSTRAINT "tasks_source_chk" CHECK ("source" IN ('manual', 'ai_agent')),
  -- A task is about at most one record.
  ADD CONSTRAINT "tasks_context_chk" CHECK (
    (CASE WHEN "vehicle_id" IS NULL THEN 0 ELSE 1 END)
    + (CASE WHEN "customer_id" IS NULL THEN 0 ELSE 1 END)
    + (CASE WHEN "lead_id" IS NULL THEN 0 ELSE 1 END)
    + (CASE WHEN "deal_id" IS NULL THEN 0 ELSE 1 END) <= 1
  ),
  ADD CONSTRAINT "tasks_completed_chk" CHECK (("status" = 'completed') = ("completed_at" IS NOT NULL));

ALTER TABLE "partner_requests"
  ADD CONSTRAINT "partner_requests_source_chk" CHECK (
    ("vehicle_source" = 'inventory' AND "vehicle_id" IS NOT NULL AND "customer_vehicle" IS NULL)
    OR ("vehicle_source" = 'customer_owned' AND "vehicle_id" IS NULL AND "customer_vehicle" IS NOT NULL)
  ),
  -- Only a bank evaluation has a bank and a finance amount.
  ADD CONSTRAINT "partner_requests_kind_chk" CHECK (
    ("kind" = 'bank_evaluation' AND "bank_code" IS NOT NULL AND "finance_amount" IS NOT NULL)
    OR ("kind" = 'company_quotation' AND "bank_code" IS NULL AND "finance_amount" IS NULL)
  ),
  ADD CONSTRAINT "partner_requests_amounts_chk" CHECK (
    ("finance_amount" IS NULL OR "finance_amount" > 0) AND ("fee" IS NULL OR "fee" >= 0)
    AND ("estimated_value" IS NULL OR "estimated_value" >= 0) AND ("quoted_price" IS NULL OR "quoted_price" >= 0)
  ),
  ADD CONSTRAINT "partner_requests_via_chk" CHECK ("requested_via" IN ('manual', 'ai_agent')),
  ADD CONSTRAINT "partner_requests_completed_chk" CHECK (("status" IN ('completed', 'rejected')) = ("completed_at" IS NOT NULL));

ALTER TABLE "ai_tool_calls"
  ADD CONSTRAINT "ai_tool_calls_duration_chk" CHECK ("duration_ms" IS NULL OR "duration_ms" >= 0),
  ADD CONSTRAINT "ai_tool_calls_name_chk" CHECK ("tool_name" ~ '^[A-Za-z][A-Za-z0-9_]{0,63}$');

ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "tasks"
  USING ("organization_id" = current_setting('app.org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.org_id', true));

ALTER TABLE "partner_requests" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "partner_requests"
  USING ("organization_id" = current_setting('app.org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.org_id', true));

ALTER TABLE "ai_tool_calls" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "ai_tool_calls"
  USING ("organization_id" = current_setting('app.org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.org_id', true));

-- (When the role is created later, prisma/sql/create-app-role.sql applies the same REVOKE.)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cda_app') THEN
    REVOKE DELETE, TRUNCATE ON TABLE "ai_tool_calls" FROM cda_app;
  END IF;
END
$$;
