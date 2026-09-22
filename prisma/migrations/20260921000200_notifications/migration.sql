-- In-app notifications (the bell in the top bar): one row per recipient.
--
-- 1. The table. 2. CHECK constraints. 3. Row-Level Security (the same tenant_isolation contract as every
-- tenant table). Privacy between users of the same organization ("my notifications") is the service layer's
-- job, exactly as for ai_conversations; the database guarantees the organization boundary.

-- CreateEnum
CREATE TYPE "notification_kind" AS ENUM ('lead', 'price', 'ai', 'deal', 'inspection', 'document', 'inventory', 'system');

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" "notification_kind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "link" TEXT,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_organization_id_user_id_read_at_created_at_idx" ON "notifications"("organization_id", "user_id", "read_at", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_id_organization_id_key" ON "notifications"("id", "organization_id");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_organization_id_fkey" FOREIGN KEY ("user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---- CHECK constraints ----

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_title_chk" CHECK (length("title") BETWEEN 1 AND 200),
  ADD CONSTRAINT "notifications_description_chk" CHECK (length("description") BETWEEN 1 AND 1000),
  -- The link is an in-app path ("/leads/abc"): "//host", "/\host" and absolute URLs would send a user off-site.
  ADD CONSTRAINT "notifications_link_chk" CHECK (
    "link" IS NULL OR ("link" ~ '^/([^/\\].*)?$' AND length("link") <= 300)
  );

-- ---- Row-Level Security ----

ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "notifications"
  USING ("organization_id" = current_setting('app.org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.org_id', true));
