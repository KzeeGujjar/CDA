-- Document generation (§0.22): versioned templates + generated documents. Rendered content is plain text
-- (the frontend has always shown documents as preformatted text), stored on generated_documents itself, never
-- in the files table: a generated document routinely names a vehicle AND a customer AND a deal at once, which
-- files.files_parent_chk (exactly one parent) cannot represent.

-- CreateEnum
CREATE TYPE "document_type" AS ENUM ('quotation', 'invoice', 'receipt', 'purchase_agreement', 'sales_agreement', 'inspection_report', 'delivery_form', 'customer_agreement');

-- CreateEnum
CREATE TYPE "document_status" AS ENUM ('draft', 'pending_signature', 'signed', 'completed');

-- CreateTable
CREATE TABLE "document_templates" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "type" "document_type" NOT NULL,
    "language" CHAR(2) NOT NULL DEFAULT 'en',
    "version" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "variables" JSONB NOT NULL DEFAULT '[]',
    "created_by_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_documents" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "type" "document_type" NOT NULL,
    "title" TEXT NOT NULL,
    "status" "document_status" NOT NULL DEFAULT 'draft',
    "language" CHAR(2) NOT NULL DEFAULT 'en',
    "template_id" TEXT,
    "template_version" INTEGER,
    "vehicle_id" TEXT,
    "customer_id" TEXT,
    "deal_id" TEXT,
    "variables" JSONB NOT NULL,
    "content" TEXT NOT NULL,
    "created_by_id" TEXT,
    "share_token" TEXT,
    "share_expires_at" TIMESTAMPTZ(3),
    "signed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "generated_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_templates_id_organization_id_key" ON "document_templates"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_templates_organization_id_type_language_version_key" ON "document_templates"("organization_id", "type", "language", "version");

-- CreateIndex
CREATE INDEX "document_templates_organization_id_type_language_idx" ON "document_templates"("organization_id", "type", "language");

-- CreateIndex: at most one active version per (organization, type, language) — mirrors files_one_primary_photo.
CREATE UNIQUE INDEX "document_templates_one_active_idx" ON "document_templates"("organization_id", "type", "language") WHERE "is_active";

-- CreateIndex
CREATE UNIQUE INDEX "generated_documents_id_organization_id_key" ON "generated_documents"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "generated_documents_share_token_key" ON "generated_documents"("share_token");

-- CreateIndex
CREATE INDEX "generated_documents_organization_id_type_created_at_idx" ON "generated_documents"("organization_id", "type", "created_at" DESC);

-- CreateIndex
CREATE INDEX "generated_documents_organization_id_vehicle_id_idx" ON "generated_documents"("organization_id", "vehicle_id");

-- CreateIndex
CREATE INDEX "generated_documents_organization_id_customer_id_idx" ON "generated_documents"("organization_id", "customer_id");

-- CreateIndex
CREATE INDEX "generated_documents_organization_id_deal_id_idx" ON "generated_documents"("organization_id", "deal_id");

-- AddForeignKey
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_created_by_id_organization_id_fkey" FOREIGN KEY ("created_by_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_template_id_organization_id_fkey" FOREIGN KEY ("template_id", "organization_id") REFERENCES "document_templates"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_vehicle_id_organization_id_fkey" FOREIGN KEY ("vehicle_id", "organization_id") REFERENCES "vehicles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_customer_id_organization_id_fkey" FOREIGN KEY ("customer_id", "organization_id") REFERENCES "customers"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_deal_id_organization_id_fkey" FOREIGN KEY ("deal_id", "organization_id") REFERENCES "deals"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_created_by_id_organization_id_fkey" FOREIGN KEY ("created_by_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---- CHECK constraints ----

ALTER TABLE "document_templates"
  ADD CONSTRAINT "document_templates_version_chk" CHECK ("version" >= 1),
  ADD CONSTRAINT "document_templates_language_chk" CHECK ("language" ~ '^[a-z]{2}$'),
  ADD CONSTRAINT "document_templates_name_chk" CHECK (length("name") BETWEEN 1 AND 200),
  ADD CONSTRAINT "document_templates_content_chk" CHECK (length("content") BETWEEN 1 AND 20000);

ALTER TABLE "generated_documents"
  ADD CONSTRAINT "generated_documents_language_chk" CHECK ("language" ~ '^[a-z]{2}$'),
  ADD CONSTRAINT "generated_documents_title_chk" CHECK (length("title") BETWEEN 1 AND 200),
  ADD CONSTRAINT "generated_documents_content_chk" CHECK (length("content") BETWEEN 1 AND 20000),
  -- A template version is meaningful only alongside the template it names.
  ADD CONSTRAINT "generated_documents_template_pair_chk" CHECK (("template_id" IS NULL) = ("template_version" IS NULL)),
  -- A share link is only ever live with both a token and an expiry, or neither.
  ADD CONSTRAINT "generated_documents_share_pair_chk" CHECK (("share_token" IS NULL) = ("share_expires_at" IS NULL));

-- ---- Row-Level Security ----

ALTER TABLE "document_templates" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "document_templates"
  USING ("organization_id" = current_setting('app.org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.org_id', true));

ALTER TABLE "generated_documents" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "generated_documents"
  USING ("organization_id" = current_setting('app.org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.org_id', true));
