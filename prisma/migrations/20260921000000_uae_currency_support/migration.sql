-- UAE support: emirate + vehicle type on vehicles, and a currency catalog with exchange rates.
--
-- 1. Currency catalog and exchange rates (global reference data, seeded with AED and USD).
-- 2. Foreign keys from the places that hold a currency code.
-- 3. Vehicles: emirate, specification (GCC / UAE / imported), source (auction, dealer, ...), and the purchase
--    price as originally agreed when it was not in the base currency.
-- 4. Guards: CHECK constraints, and the runtime role can only READ the reference tables.

-- CreateEnum
CREATE TYPE "vehicle_import_spec" AS ENUM ('gcc', 'uae', 'imported');

-- CreateEnum
CREATE TYPE "vehicle_source_type" AS ENUM ('export', 'import', 'auction', 'dealer', 'private');

-- ---- 1. Currencies and exchange rates ----

CREATE TABLE "currencies" (
    "code" CHAR(3) NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "minor_units" SMALLINT NOT NULL DEFAULT 2,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "currencies_pkey" PRIMARY KEY ("code"),
    CONSTRAINT "currencies_code_chk" CHECK ("code" ~ '^[A-Z]{3}$'),
    CONSTRAINT "currencies_text_chk" CHECK (length("name") BETWEEN 1 AND 80 AND length("symbol") BETWEEN 1 AND 8),
    -- Money columns hold 2 decimals. A currency with 3 (KWD, BHD, OMR) needs a column change first, so the
    -- catalog refuses it instead of letting the third decimal be rounded away silently.
    CONSTRAINT "currencies_minor_units_chk" CHECK ("minor_units" BETWEEN 0 AND 2)
);

CREATE TABLE "exchange_rates" (
    "base_currency" CHAR(3) NOT NULL,
    "quote_currency" CHAR(3) NOT NULL,
    "effective_from" TIMESTAMPTZ(3) NOT NULL,
    "rate" DECIMAL(20,10) NOT NULL,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("base_currency", "quote_currency", "effective_from"),
    CONSTRAINT "exchange_rates_pair_chk" CHECK ("base_currency" <> "quote_currency"),
    CONSTRAINT "exchange_rates_rate_chk" CHECK ("rate" > 0),
    CONSTRAINT "exchange_rates_source_chk" CHECK (length("source") BETWEEN 1 AND 120)
);

-- A pair holds one rate per instant whichever direction it is stored in (USD->AED and AED->USD at the same
-- time would be two answers to one question).
CREATE UNIQUE INDEX "exchange_rates_pair_time_key"
  ON "exchange_rates" (LEAST("base_currency", "quote_currency"), GREATEST("base_currency", "quote_currency"), "effective_from");

ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_base_currency_fkey"
  FOREIGN KEY ("base_currency") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_quote_currency_fkey"
  FOREIGN KEY ("quote_currency") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "currencies" ("code", "name", "symbol", "minor_units", "is_enabled") VALUES
  ('AED', 'UAE Dirham', 'AED', 2, true),
  ('USD', 'US Dollar', '$', 2, true);

-- The dirham has been pegged to the dollar at 3.6725 by the UAE Central Bank since November 1997.
INSERT INTO "exchange_rates" ("base_currency", "quote_currency", "effective_from", "rate", "source") VALUES
  ('USD', 'AED', '1997-11-01T00:00:00Z', 3.6725, 'UAE Central Bank peg');

-- ---- 2. Every stored currency code must be in the catalog ----

ALTER TABLE "organizations" ADD CONSTRAINT "organizations_currency_fkey"
  FOREIGN KEY ("currency") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "partner_requests" ADD CONSTRAINT "partner_requests_fee_currency_fkey"
  FOREIGN KEY ("fee_currency") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- An emirate only makes sense for a UAE organization.
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_emirate_chk" CHECK ("emirate" IS NULL OR "country" = 'AE');

-- ---- 3. Vehicles ----

ALTER TABLE "vehicles"
  ADD COLUMN "emirate" "emirate",
  ADD COLUMN "import_spec" "vehicle_import_spec",
  ADD COLUMN "source_type" "vehicle_source_type",
  ADD COLUMN "purchase_currency" CHAR(3),
  ADD COLUMN "purchase_amount_original" DECIMAL(14,2),
  ADD COLUMN "purchase_fx_rate" DECIMAL(20,10);

ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_purchase_currency_fkey"
  FOREIGN KEY ("purchase_currency") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- What was agreed, in what currency, at what rate: all three or none, and purchase_price (base currency) is
-- exactly that amount converted at that rate, rounded to 2 decimals. Changing one without the others fails.
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_purchase_original_chk" CHECK (
  (
    "purchase_currency" IS NULL AND "purchase_amount_original" IS NULL AND "purchase_fx_rate" IS NULL
  ) OR (
    "purchase_currency" IS NOT NULL AND "purchase_amount_original" IS NOT NULL AND "purchase_fx_rate" IS NOT NULL
    AND "purchase_amount_original" >= 0 AND "purchase_fx_rate" > 0
    AND "purchase_price" = ROUND("purchase_amount_original" * "purchase_fx_rate", 2)
  )
);

CREATE INDEX "vehicles_organization_id_emirate_idx" ON "vehicles"("organization_id", "emirate");

-- ---- 4. Reference data is read-only for the runtime role ----
-- (When the role is created later, prisma/sql/create-app-role.sql applies the same REVOKE.)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cda_app') THEN
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE "currencies", "exchange_rates" FROM cda_app;
  END IF;
END
$$;
