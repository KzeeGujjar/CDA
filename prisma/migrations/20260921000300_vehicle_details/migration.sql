-- Vehicle details the Vehicles screens collect: engine, colours, seats, fuel, accident and service history
-- ("spec"), registration status / plate / expiry ("registration"), free-text notes, the "featured" flag, and where the
-- vehicle physically is when that is not just a branch ("location": a yard, a workshop).
--
-- Descriptive data that is displayed, not filtered or joined on, so it lives in two small JSON documents
-- (validated field by field by zod in the API) rather than a dozen sparse columns. Anything that later needs to
-- be queried gets a real column. The database still bounds them so a bug or a hostile client cannot store a
-- huge or non-object value.

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "registration" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "spec" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "vehicles"
  ADD CONSTRAINT "vehicles_spec_chk" CHECK (jsonb_typeof("spec") = 'object' AND pg_column_size("spec") <= 4096),
  ADD CONSTRAINT "vehicles_registration_chk" CHECK (jsonb_typeof("registration") = 'object' AND pg_column_size("registration") <= 2048),
  ADD CONSTRAINT "vehicles_location_chk" CHECK ("location" IS NULL OR length("location") <= 120),
  ADD CONSTRAINT "vehicles_notes_chk" CHECK ("notes" IS NULL OR length("notes") <= 4000);
