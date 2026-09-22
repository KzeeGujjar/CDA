-- Guarantees for the files table (metadata of objects kept in private Supabase Storage buckets).
--
-- 1. CHECK constraints: the database itself refuses a file that has the wrong parent, sits in the wrong
--    bucket, points outside its own organization's folder, or has an inconsistent lifecycle.
-- 2. One primary photo per vehicle.
-- 3. Row-Level Security: the same tenant_isolation contract as every other tenant table.

-- ---- 1. CHECK constraints ----

ALTER TABLE "files"
  -- Exactly one parent, and it matches the kind.
  ADD CONSTRAINT "files_parent_chk" CHECK (
    (
      "kind" IN ('vehicle_photo', 'vehicle_document')
      AND "vehicle_id" IS NOT NULL AND "customer_id" IS NULL AND "deal_id" IS NULL
    ) OR (
      "kind" = 'customer_document'
      AND "customer_id" IS NOT NULL AND "vehicle_id" IS NULL AND "deal_id" IS NULL
    ) OR (
      "kind" = 'deal_document'
      AND "deal_id" IS NOT NULL AND "vehicle_id" IS NULL AND "customer_id" IS NULL
    )
  ),
  -- Each kind lives in exactly one bucket (names are fixed; see migration supabase_storage_policies).
  ADD CONSTRAINT "files_bucket_chk" CHECK (
    ("kind" = 'vehicle_photo' AND "bucket" = 'vehicle-photos')
    OR ("kind" = 'vehicle_document' AND "bucket" = 'vehicle-documents')
    OR ("kind" = 'customer_document' AND "bucket" = 'customer-documents')
    OR ("kind" = 'deal_document' AND "bucket" = 'deal-documents')
  ),
  -- The object key starts with the organization id and cannot climb out of it.
  ADD CONSTRAINT "files_path_tenant_chk" CHECK (
    left("object_path", length("organization_id") + 1) = "organization_id" || '/'
    AND position(chr(92) in "object_path") = 0
    AND "object_path" !~ '//'
    AND "object_path" !~ '(^|/)\.\.?(/|$)'
    AND length("object_path") <= 512
  ),
  ADD CONSTRAINT "files_size_chk" CHECK ("size_bytes" BETWEEN 1 AND 26214400),
  -- Photos have no document type; documents must have one.
  ADD CONSTRAINT "files_document_type_chk" CHECK (("kind" = 'vehicle_photo') = ("document_type" IS NULL)),
  ADD CONSTRAINT "files_primary_chk" CHECK (NOT "is_primary" OR "kind" = 'vehicle_photo'),
  -- Lifecycle: active files carry their completion time; deleted files carry their deletion time.
  ADD CONSTRAINT "files_state_chk" CHECK (
    ("status" <> 'active' OR "completed_at" IS NOT NULL)
    AND (("status" = 'deleted') = ("deleted_at" IS NOT NULL))
    AND (NOT "object_removed" OR "status" = 'deleted')
  );

-- ---- 2. One primary (live) photo per vehicle ----

CREATE UNIQUE INDEX "files_one_primary_photo"
  ON "files" ("vehicle_id") WHERE "is_primary" AND "status" <> 'deleted';

-- ---- 3. Row-Level Security ----

ALTER TABLE "files" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "files"
  USING ("organization_id" = current_setting('app.org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.org_id', true));
