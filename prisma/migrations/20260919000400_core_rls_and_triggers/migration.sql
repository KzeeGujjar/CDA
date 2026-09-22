-- Database-level guarantees for customers, vehicles, vehicle status history, leads and deals.
--
-- 1. CHECK constraints (data quality).
-- 2. Row-Level Security: the same tenant_isolation contract as the identity tables (see migration
--    rls_and_constraints). No app.org_id setting => no rows visible or writable.
-- 3. Triggers that keep the dashboard numbers trustworthy no matter which code path writes the data:
--      a. vehicle status history (vehicle_status_events) is written by the database itself;
--      b. a vehicle becomes SOLD only by completing a deal, and SOLD is terminal;
--      c. completing a deal snapshots cost_of_sale from the vehicle, stamps completed_at, and freezes the deal.
--    These are integrity guards against application bugs, not a security boundary (row isolation between
--    tenants is enforced by RLS and composite foreign keys).
-- 4. Append-only history for the runtime role.

-- ---- 1. CHECK constraints ----

ALTER TABLE "vehicles"
  ADD CONSTRAINT "vehicles_amounts_chk" CHECK (
    "list_price" >= 0 AND "purchase_price" >= 0 AND "repair_cost" >= 0
    AND "transport_cost" >= 0 AND "other_cost" >= 0
    AND ("expected_selling_price" IS NULL OR "expected_selling_price" >= 0)
    AND ("estimated_market_value" IS NULL OR "estimated_market_value" >= 0)
  ),
  ADD CONSTRAINT "vehicles_year_chk" CHECK ("year" BETWEEN 1900 AND 2100),
  ADD CONSTRAINT "vehicles_mileage_chk" CHECK ("mileage_km" IS NULL OR "mileage_km" >= 0);

ALTER TABLE "leads"
  ADD CONSTRAINT "leads_score_chk" CHECK ("score" BETWEEN 0 AND 100),
  ADD CONSTRAINT "leads_budget_chk" CHECK ("budget" IS NULL OR "budget" >= 0);

ALTER TABLE "deals"
  ADD CONSTRAINT "deals_amounts_chk" CHECK ("sale_price" >= 0 AND "vat_amount" >= 0),
  -- A completed deal always carries its completion time and cost snapshot; nothing else may.
  ADD CONSTRAINT "deals_completed_chk" CHECK (
    ("status" = 'completed') = ("completed_at" IS NOT NULL)
    AND ("status" = 'completed') = ("cost_of_sale" IS NOT NULL)
  );

-- ---- 2. Row-Level Security ----

ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "customers"
  USING ("organization_id" = current_setting('app.org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.org_id', true));

ALTER TABLE "vehicles" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "vehicles"
  USING ("organization_id" = current_setting('app.org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.org_id', true));

ALTER TABLE "vehicle_status_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "vehicle_status_events"
  USING ("organization_id" = current_setting('app.org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.org_id', true));

ALTER TABLE "leads" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "leads"
  USING ("organization_id" = current_setting('app.org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.org_id', true));

ALTER TABLE "deals" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "deals"
  USING ("organization_id" = current_setting('app.org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.org_id', true));

-- ---- 3a. Vehicle status history ----
-- The first event records the status the vehicle started in, dated at acquisition (so history is right
-- for vehicles imported with an old acquired_at). Later events are dated when the change happens, or at
-- the sale date when a deal is completed (app.status_event_at, set by the deals trigger below).

CREATE FUNCTION "vehicles_record_status_event"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  event_at timestamptz;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO "vehicle_status_events" ("organization_id", "vehicle_id", "from_status", "to_status", "changed_at")
    VALUES (NEW."organization_id", NEW."id", NULL, NEW."status", LEAST(NEW."acquired_at", clock_timestamp()));
  ELSIF NEW."status" IS DISTINCT FROM OLD."status" THEN
    event_at := COALESCE(NULLIF(current_setting('app.status_event_at', true), '')::timestamptz, clock_timestamp());
    INSERT INTO "vehicle_status_events" ("organization_id", "vehicle_id", "from_status", "to_status", "changed_at")
    VALUES (NEW."organization_id", NEW."id", OLD."status", NEW."status", event_at);
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER "vehicles_status_history"
  AFTER INSERT OR UPDATE OF "status" ON "vehicles"
  FOR EACH ROW EXECUTE FUNCTION "vehicles_record_status_event"();

-- ---- 3b. SOLD only through a completed deal, and SOLD is terminal ----

CREATE FUNCTION "vehicles_guard_status"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" = 'sold' AND current_setting('app.deal_completing', true) IS DISTINCT FROM NEW."id" THEN
      RAISE EXCEPTION 'a vehicle becomes sold only by completing a deal'
        USING ERRCODE = 'restrict_violation';
    END IF;
  ELSIF NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF OLD."status" = 'sold' THEN
      RAISE EXCEPTION 'a sold vehicle cannot change status'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW."status" = 'sold' AND current_setting('app.deal_completing', true) IS DISTINCT FROM NEW."id" THEN
      RAISE EXCEPTION 'a vehicle becomes sold only by completing a deal'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "vehicles_status_guard"
  BEFORE INSERT OR UPDATE OF "status" ON "vehicles"
  FOR EACH ROW EXECUTE FUNCTION "vehicles_guard_status"();

-- ---- 3c. Completing a deal ----

CREATE FUNCTION "deals_on_write"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_status "vehicle_status";
  v_cost numeric;
  v_acquired timestamptz;
BEGIN
  -- A completed deal is a financial record: it can no longer be edited or reversed.
  IF TG_OP = 'UPDATE' AND OLD."status" = 'completed' THEN
    IF NEW."status" <> 'completed'
       OR NEW."vehicle_id" <> OLD."vehicle_id"
       OR NEW."sale_price" <> OLD."sale_price"
       OR NEW."cost_of_sale" IS DISTINCT FROM OLD."cost_of_sale"
       OR NEW."completed_at" IS DISTINCT FROM OLD."completed_at"
       OR NEW."salesperson_id" IS DISTINCT FROM OLD."salesperson_id"
       OR NEW."branch_id" IS DISTINCT FROM OLD."branch_id" THEN
      RAISE EXCEPTION 'a completed deal is a financial record and cannot be changed'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."status" = 'completed' THEN
    SELECT "status", "purchase_price" + "repair_cost" + "transport_cost" + "other_cost", "acquired_at"
      INTO v_status, v_cost, v_acquired
    FROM "vehicles"
    WHERE "id" = NEW."vehicle_id" AND "organization_id" = NEW."organization_id"
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'the vehicle of this deal does not exist' USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_status = 'sold' THEN
      RAISE EXCEPTION 'this vehicle has already been sold' USING ERRCODE = 'restrict_violation';
    END IF;
    IF v_status = 'archived' THEN
      RAISE EXCEPTION 'an archived vehicle cannot be sold' USING ERRCODE = 'restrict_violation';
    END IF;

    -- Computed here, never trusted from the caller.
    NEW."cost_of_sale" := v_cost;
    NEW."completed_at" := COALESCE(NEW."completed_at", now());
    IF NEW."completed_at" < v_acquired THEN
      RAISE EXCEPTION 'a vehicle cannot be sold before it was acquired' USING ERRCODE = 'check_violation';
    END IF;

    PERFORM set_config('app.deal_completing', NEW."vehicle_id", true);
    PERFORM set_config('app.status_event_at', NEW."completed_at"::text, true);
    UPDATE "vehicles" SET "status" = 'sold'
    WHERE "id" = NEW."vehicle_id" AND "organization_id" = NEW."organization_id";
    PERFORM set_config('app.deal_completing', '', true);
    PERFORM set_config('app.status_event_at', '', true);
  ELSE
    -- Only completion may set these; any other status clears them.
    NEW."cost_of_sale" := NULL;
    NEW."completed_at" := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "deals_completion"
  BEFORE INSERT OR UPDATE ON "deals"
  FOR EACH ROW EXECUTE FUNCTION "deals_on_write"();

-- ---- 4. History is append-only for the runtime role ----
-- (When the role is created later, prisma/sql/create-app-role.sql applies the same REVOKE.)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cda_app') THEN
    REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "vehicle_status_events" FROM cda_app;
  END IF;
END
$$;
