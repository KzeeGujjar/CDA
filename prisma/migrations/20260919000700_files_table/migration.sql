-- CreateEnum
CREATE TYPE "file_kind" AS ENUM ('vehicle_photo', 'vehicle_document', 'customer_document', 'deal_document');

-- CreateEnum
CREATE TYPE "file_status" AS ENUM ('pending', 'active', 'deleted');

-- CreateTable
CREATE TABLE "files" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "kind" "file_kind" NOT NULL,
    "status" "file_status" NOT NULL DEFAULT 'pending',
    "bucket" TEXT NOT NULL,
    "object_path" TEXT NOT NULL,
    "vehicle_id" TEXT,
    "customer_id" TEXT,
    "deal_id" TEXT,
    "document_type" TEXT,
    "original_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "uploaded_by_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    "object_removed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "files_organization_id_vehicle_id_kind_status_idx" ON "files"("organization_id", "vehicle_id", "kind", "status");

-- CreateIndex
CREATE INDEX "files_organization_id_customer_id_status_idx" ON "files"("organization_id", "customer_id", "status");

-- CreateIndex
CREATE INDEX "files_organization_id_deal_id_status_idx" ON "files"("organization_id", "deal_id", "status");

-- CreateIndex
CREATE INDEX "files_status_created_at_idx" ON "files"("status", "created_at");

-- CreateIndex
CREATE INDEX "files_organization_id_uploaded_by_id_status_idx" ON "files"("organization_id", "uploaded_by_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "files_id_organization_id_key" ON "files"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "files_bucket_object_path_key" ON "files"("bucket", "object_path");

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_vehicle_id_organization_id_fkey" FOREIGN KEY ("vehicle_id", "organization_id") REFERENCES "vehicles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_customer_id_organization_id_fkey" FOREIGN KEY ("customer_id", "organization_id") REFERENCES "customers"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_deal_id_organization_id_fkey" FOREIGN KEY ("deal_id", "organization_id") REFERENCES "deals"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_id_organization_id_fkey" FOREIGN KEY ("uploaded_by_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

