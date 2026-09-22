-- Dashboard aggregations, computed inside PostgreSQL so the application never downloads rows to count them.
--
-- Contract shared by every function below
--   * SECURITY INVOKER (the default): they run with the caller's privileges, so Row-Level Security applies.
--     They ALSO filter on the tenant explicitly and refuse to run at all when no tenant is set
--     (cda_current_org raises), so a missing tenant is a loud error, never a silent empty result.
--   * The tenant is read from app.org_id (set by the application from the authenticated session). It is
--     never a parameter, so a caller cannot ask for another organization.
--   * Row scoping is passed in by the application from the caller's role:
--       p_branch_ids  NULL = all branches, an array = only these branches (empty array = nothing);
--       p_owner_id    NULL = everyone, otherwise only rows owned by / assigned to that user.
--   * Monetary and cost-based figures are NULL unless the caller explicitly asks (p_include_cost /
--     p_include_profit), so sensitive numbers are never computed for roles that may not see them.
--   * Results come back as rows of (metric, value, previous). "previous" is the same measure for the
--     comparison period, so the application only has to turn the pair into a delta.
--
-- Definitions
--   total_vehicles      vehicles that are not archived (sold ones included), as at the END of the period
--   available_vehicles  vehicles with status available, as at the end of the period
--   vehicles_purchased  vehicles acquired (bought) during the period
--   inventory_value     COST of the stock on hand (purchase + repair + transport + other costs) at the end of the
--                       period. Stock = not sold, not archived. Past values use TODAY's costs, so a delta
--                       measures stock movement, not re-costing.
--   expected_revenue    what the stock on hand is expected to sell for (expected_selling_price, else list_price)
--   vehicles_sold       deals completed during the period (one vehicle per completed deal)
--   sales_revenue       sum of sale_price (excluding VAT) of deals completed during the period
--   gross_profit        sum of (sale_price - cost_of_sale) of deals completed during the period; cost_of_sale is
--                       the cost snapshot taken when the deal was completed
--   new_leads           leads created during the period
--   conversion_rate     % of those leads that are now WON (cohort); NULL when there were no new leads

-- ---- tenant helper ----

CREATE FUNCTION "cda_current_org"() RETURNS text
LANGUAGE plpgsql STABLE AS $$
DECLARE
  org text := NULLIF(current_setting('app.org_id', true), '');
BEGIN
  IF org IS NULL THEN
    RAISE EXCEPTION 'no tenant context: app.org_id is not set' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN org;
END;
$$;

-- ---- period boundaries (pure computation, no table access) ----
-- Presets are evaluated in the organization time zone. The comparison period is the same span one period back:
--   month  this calendar month to date            vs  the same number of days of the previous month
--   last30 / last90  the last 30 / 90 days         vs  the 30 / 90 days before that
--   ytd    this calendar year to date              vs  the same span of the previous year
--   custom p_from..p_to inclusive (max 731 days)   vs  the equal-length span immediately before

CREATE FUNCTION "dashboard_period_bounds"(
  p_preset text,
  p_tz text,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL
) RETURNS TABLE ("period_start" timestamptz, "period_end" timestamptz, "prev_start" timestamptz, "prev_end" timestamptz)
LANGUAGE plpgsql STABLE AS $$
#variable_conflict use_column
DECLARE
  now_local timestamp := now() AT TIME ZONE p_tz;
  s timestamptz;
  e timestamptz;
  ps timestamptz;
  pe timestamptz;
BEGIN
  IF p_preset = 'month' THEN
    s := date_trunc('month', now_local) AT TIME ZONE p_tz;
    e := GREATEST(now(), s + interval '1 minute');
    ps := (date_trunc('month', now_local) - interval '1 month') AT TIME ZONE p_tz;
    pe := LEAST(ps + (e - s), s);
  ELSIF p_preset = 'ytd' THEN
    s := date_trunc('year', now_local) AT TIME ZONE p_tz;
    e := GREATEST(now(), s + interval '1 minute');
    ps := (date_trunc('year', now_local) - interval '1 year') AT TIME ZONE p_tz;
    pe := LEAST(ps + (e - s), s);
  ELSIF p_preset = 'last30' THEN
    e := now();
    s := e - interval '30 days';
    ps := s - interval '30 days';
    pe := s;
  ELSIF p_preset = 'last90' THEN
    e := now();
    s := e - interval '90 days';
    ps := s - interval '90 days';
    pe := s;
  ELSIF p_preset = 'custom' THEN
    IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
      RAISE EXCEPTION 'a custom period needs from <= to' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF p_to - p_from > 730 THEN
      RAISE EXCEPTION 'a custom period cannot exceed 731 days' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    s := p_from::timestamp AT TIME ZONE p_tz;
    e := (p_to + 1)::timestamp AT TIME ZONE p_tz;
    ps := s - (e - s);
    pe := s;
  ELSE
    RAISE EXCEPTION 'unknown period preset %', p_preset USING ERRCODE = 'invalid_parameter_value';
  END IF;

  RETURN QUERY SELECT s, e, ps, pe;
END;
$$;

-- ---- inventory ----

CREATE FUNCTION "dashboard_stock_kpis"(
  p_from timestamptz,
  p_to timestamptz,
  p_prev_from timestamptz,
  p_prev_to timestamptz,
  p_branch_ids text[] DEFAULT NULL,
  p_include_cost boolean DEFAULT false
) RETURNS TABLE ("metric" text, "value" double precision, "previous" double precision)
LANGUAGE plpgsql STABLE AS $$
#variable_conflict use_column
DECLARE
  org text := cda_current_org();
BEGIN
  IF p_to <= p_from OR p_prev_to <= p_prev_from THEN
    RAISE EXCEPTION 'invalid period' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT v."id", v."status", v."acquired_at",
           COALESCE(v."expected_selling_price", v."list_price") AS expected_price,
           v."purchase_price" + v."repair_cost" + v."transport_cost" + v."other_cost" AS cost
    FROM "vehicles" v
    WHERE v."organization_id" = org
      AND (p_branch_ids IS NULL OR v."branch_id" = ANY (p_branch_ids))
  ),
  -- status of every scoped vehicle as at each instant: the latest history event at or before it, in ONE pass
  state AS (
    SELECT e."vehicle_id",
           (array_agg(e."to_status" ORDER BY e."changed_at" DESC, e."seq" DESC) FILTER (WHERE e."changed_at" <= p_to))[1] AS status_cur,
           (array_agg(e."to_status" ORDER BY e."changed_at" DESC, e."seq" DESC) FILTER (WHERE e."changed_at" <= p_prev_to))[1] AS status_prev
    FROM "vehicle_status_events" e
    JOIN scoped s ON s."id" = e."vehicle_id"
    WHERE e."organization_id" = org
    GROUP BY e."vehicle_id"
  ),
  piv AS (
    SELECT
      count(*) FILTER (WHERE st.status_cur <> 'archived') AS total_cur,
      count(*) FILTER (WHERE st.status_prev <> 'archived') AS total_prev,
      count(*) FILTER (WHERE st.status_cur = 'available') AS avail_cur,
      count(*) FILTER (WHERE st.status_prev = 'available') AS avail_prev,
      COALESCE(sum(s.expected_price) FILTER (WHERE st.status_cur NOT IN ('sold', 'archived')), 0) AS rev_cur,
      COALESCE(sum(s.expected_price) FILTER (WHERE st.status_prev NOT IN ('sold', 'archived')), 0) AS rev_prev,
      COALESCE(sum(s.cost) FILTER (WHERE st.status_cur NOT IN ('sold', 'archived')), 0) AS inv_cur,
      COALESCE(sum(s.cost) FILTER (WHERE st.status_prev NOT IN ('sold', 'archived')), 0) AS inv_prev
    FROM state st
    JOIN scoped s ON s."id" = st."vehicle_id"
  ),
  pur AS (
    SELECT
      count(*) FILTER (WHERE s."acquired_at" >= p_from AND s."acquired_at" < p_to) AS cur,
      count(*) FILTER (WHERE s."acquired_at" >= p_prev_from AND s."acquired_at" < p_prev_to) AS prev
    FROM scoped s
    WHERE s."status" <> 'archived'
  )
  SELECT 'total_vehicles'::text, piv.total_cur::double precision, piv.total_prev::double precision FROM piv
  UNION ALL
  SELECT 'available_vehicles', piv.avail_cur::double precision, piv.avail_prev::double precision FROM piv
  UNION ALL
  SELECT 'vehicles_purchased', pur.cur::double precision, pur.prev::double precision FROM pur
  UNION ALL
  SELECT 'expected_revenue', piv.rev_cur::double precision, piv.rev_prev::double precision FROM piv
  UNION ALL
  SELECT 'inventory_value',
         (CASE WHEN p_include_cost THEN piv.inv_cur END)::double precision,
         (CASE WHEN p_include_cost THEN piv.inv_prev END)::double precision
  FROM piv;
END;
$$;

-- ---- sales ----

CREATE FUNCTION "dashboard_sales_kpis"(
  p_from timestamptz,
  p_to timestamptz,
  p_prev_from timestamptz,
  p_prev_to timestamptz,
  p_branch_ids text[] DEFAULT NULL,
  p_owner_id text DEFAULT NULL,
  p_include_profit boolean DEFAULT false
) RETURNS TABLE ("metric" text, "value" double precision, "previous" double precision)
LANGUAGE plpgsql STABLE AS $$
#variable_conflict use_column
DECLARE
  org text := cda_current_org();
BEGIN
  IF p_to <= p_from OR p_prev_to <= p_prev_from THEN
    RAISE EXCEPTION 'invalid period' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  RETURN QUERY
  WITH d AS (
    SELECT x."completed_at", x."sale_price", x."cost_of_sale"
    FROM "deals" x
    WHERE x."organization_id" = org
      AND x."status" = 'completed'
      AND ((x."completed_at" >= p_from AND x."completed_at" < p_to)
        OR (x."completed_at" >= p_prev_from AND x."completed_at" < p_prev_to))
      AND (p_branch_ids IS NULL OR x."branch_id" = ANY (p_branch_ids))
      AND (p_owner_id IS NULL OR x."salesperson_id" = p_owner_id)
  ),
  a AS (
    SELECT
      count(*) FILTER (WHERE d."completed_at" >= p_from AND d."completed_at" < p_to) AS n_cur,
      count(*) FILTER (WHERE d."completed_at" >= p_prev_from AND d."completed_at" < p_prev_to) AS n_prev,
      COALESCE(sum(d."sale_price") FILTER (WHERE d."completed_at" >= p_from AND d."completed_at" < p_to), 0) AS rev_cur,
      COALESCE(sum(d."sale_price") FILTER (WHERE d."completed_at" >= p_prev_from AND d."completed_at" < p_prev_to), 0) AS rev_prev,
      COALESCE(sum(d."sale_price" - d."cost_of_sale") FILTER (WHERE d."completed_at" >= p_from AND d."completed_at" < p_to), 0) AS gp_cur,
      COALESCE(sum(d."sale_price" - d."cost_of_sale") FILTER (WHERE d."completed_at" >= p_prev_from AND d."completed_at" < p_prev_to), 0) AS gp_prev
    FROM d
  )
  SELECT 'vehicles_sold'::text, a.n_cur::double precision, a.n_prev::double precision FROM a
  UNION ALL
  SELECT 'sales_revenue', a.rev_cur::double precision, a.rev_prev::double precision FROM a
  UNION ALL
  SELECT 'gross_profit',
         (CASE WHEN p_include_profit THEN a.gp_cur END)::double precision,
         (CASE WHEN p_include_profit THEN a.gp_prev END)::double precision
  FROM a;
END;
$$;

-- ---- leads ----

CREATE FUNCTION "dashboard_lead_kpis"(
  p_from timestamptz,
  p_to timestamptz,
  p_prev_from timestamptz,
  p_prev_to timestamptz,
  p_branch_ids text[] DEFAULT NULL,
  p_owner_id text DEFAULT NULL
) RETURNS TABLE ("metric" text, "value" double precision, "previous" double precision)
LANGUAGE plpgsql STABLE AS $$
#variable_conflict use_column
DECLARE
  org text := cda_current_org();
BEGIN
  IF p_to <= p_from OR p_prev_to <= p_prev_from THEN
    RAISE EXCEPTION 'invalid period' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  RETURN QUERY
  WITH l AS (
    SELECT x."created_at", x."stage"
    FROM "leads" x
    WHERE x."organization_id" = org
      AND ((x."created_at" >= p_from AND x."created_at" < p_to)
        OR (x."created_at" >= p_prev_from AND x."created_at" < p_prev_to))
      AND (p_branch_ids IS NULL OR x."branch_id" = ANY (p_branch_ids))
      AND (p_owner_id IS NULL OR x."assigned_to_id" = p_owner_id)
  ),
  a AS (
    SELECT
      count(*) FILTER (WHERE l."created_at" >= p_from AND l."created_at" < p_to) AS n_cur,
      count(*) FILTER (WHERE l."created_at" >= p_prev_from AND l."created_at" < p_prev_to) AS n_prev,
      count(*) FILTER (WHERE l."stage" = 'won' AND l."created_at" >= p_from AND l."created_at" < p_to) AS w_cur,
      count(*) FILTER (WHERE l."stage" = 'won' AND l."created_at" >= p_prev_from AND l."created_at" < p_prev_to) AS w_prev
    FROM l
  )
  SELECT 'new_leads'::text, a.n_cur::double precision, a.n_prev::double precision FROM a
  UNION ALL
  SELECT 'won_leads', a.w_cur::double precision, a.w_prev::double precision FROM a
  UNION ALL
  SELECT 'conversion_rate',
         (CASE WHEN a.n_cur = 0 THEN NULL ELSE round(a.w_cur * 100.0 / a.n_cur, 2) END)::double precision,
         (CASE WHEN a.n_prev = 0 THEN NULL ELSE round(a.w_prev * 100.0 / a.n_prev, 2) END)::double precision
  FROM a;
END;
$$;

-- ---- monthly sales series (zero-filled, oldest first) ----

CREATE FUNCTION "dashboard_monthly_sales"(
  p_months integer,
  p_tz text,
  p_branch_ids text[] DEFAULT NULL,
  p_owner_id text DEFAULT NULL,
  p_include_profit boolean DEFAULT false
) RETURNS TABLE ("month_start" date, "vehicles_sold" integer, "revenue" double precision, "gross_profit" double precision)
LANGUAGE plpgsql STABLE AS $$
#variable_conflict use_column
DECLARE
  org text := cda_current_org();
  first_month date;
BEGIN
  IF p_months IS NULL OR p_months < 1 OR p_months > 36 THEN
    RAISE EXCEPTION 'months must be between 1 and 36' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  first_month := (date_trunc('month', now() AT TIME ZONE p_tz) - make_interval(months => p_months - 1))::date;

  RETURN QUERY
  WITH series AS (
    SELECT g::date AS m
    FROM generate_series(first_month::timestamp, first_month::timestamp + make_interval(months => p_months - 1), interval '1 month') g
  ),
  sales AS (
    SELECT date_trunc('month', x."completed_at" AT TIME ZONE p_tz)::date AS m,
           count(*) AS n,
           sum(x."sale_price") AS rev,
           sum(x."sale_price" - x."cost_of_sale") AS gp
    FROM "deals" x
    WHERE x."organization_id" = org
      AND x."status" = 'completed'
      AND x."completed_at" >= (first_month::timestamp AT TIME ZONE p_tz)
      AND (p_branch_ids IS NULL OR x."branch_id" = ANY (p_branch_ids))
      AND (p_owner_id IS NULL OR x."salesperson_id" = p_owner_id)
    GROUP BY 1
  )
  SELECT s.m,
         COALESCE(z.n, 0)::integer,
         COALESCE(z.rev, 0)::double precision,
         (CASE WHEN p_include_profit THEN COALESCE(z.gp, 0) END)::double precision
  FROM series s
  LEFT JOIN sales z ON z.m = s.m
  ORDER BY s.m;
END;
$$;

-- ---- who may execute them ----
-- PostgreSQL grants EXECUTE to PUBLIC by default. Take that away and give it to the runtime role only
-- (also matters on Supabase, where PUBLIC includes the anon/authenticated API roles).
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p."oid"::regprocedure AS sig
    FROM pg_proc p
    WHERE p."pronamespace" = 'public'::regnamespace
      AND (p."proname" LIKE 'dashboard\_%' OR p."proname" = 'cda_current_org')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn.sig);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cda_app') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO cda_app', fn.sig);
    END IF;
  END LOOP;
END
$$;
