-- Internal conversation/message model for the unified inbox (whatsapp, email, sms, website_chat, ai_agent).
-- External providers are adapters (src/server/messaging/providers/*), never referenced from this schema: a
-- provider is identified only by messages.provider_message_id, an opaque string, so swapping WhatsApp Cloud
-- API for a different vendor (or adding a sixth channel) never touches these tables.

-- CreateEnum
CREATE TYPE "message_channel" AS ENUM ('whatsapp', 'email', 'sms', 'website_chat', 'ai_agent');

-- CreateEnum
CREATE TYPE "message_direction" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "message_status" AS ENUM ('queued', 'sent', 'delivered', 'read', 'failed');

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "channel" "message_channel" NOT NULL,
    "customer_id" TEXT,
    "branch_id" TEXT,
    "assigned_to_id" TEXT,
    "contact_name" TEXT NOT NULL,
    "contact_handle" TEXT NOT NULL,
    "ai_handling" BOOLEAN NOT NULL DEFAULT false,
    "unread_count" INTEGER NOT NULL DEFAULT 0,
    "last_message_preview" TEXT,
    "last_message_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "direction" "message_direction" NOT NULL,
    "status" "message_status" NOT NULL DEFAULT 'sent',
    "body" TEXT NOT NULL,
    "sent_by_id" TEXT,
    "provider_message_id" TEXT,
    "error_code" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conversations_id_organization_id_key" ON "conversations"("id", "organization_id");

-- CreateIndex
CREATE INDEX "conversations_organization_id_channel_last_message_at_idx" ON "conversations"("organization_id", "channel", "last_message_at" DESC);

-- CreateIndex
CREATE INDEX "conversations_organization_id_assigned_to_id_idx" ON "conversations"("organization_id", "assigned_to_id");

-- CreateIndex
CREATE INDEX "conversations_organization_id_customer_id_idx" ON "conversations"("organization_id", "customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "messages_id_organization_id_key" ON "messages"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "messages_organization_id_provider_message_id_key" ON "messages"("organization_id", "provider_message_id");

-- CreateIndex
CREATE INDEX "messages_organization_id_conversation_id_created_at_idx" ON "messages"("organization_id", "conversation_id", "created_at");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_customer_id_organization_id_fkey" FOREIGN KEY ("customer_id", "organization_id") REFERENCES "customers"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assigned_to_id_organization_id_fkey" FOREIGN KEY ("assigned_to_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_organization_id_fkey" FOREIGN KEY ("conversation_id", "organization_id") REFERENCES "conversations"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sent_by_id_organization_id_fkey" FOREIGN KEY ("sent_by_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---- CHECK constraints ----

ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_contact_name_chk" CHECK (length("contact_name") BETWEEN 1 AND 200),
  ADD CONSTRAINT "conversations_contact_handle_chk" CHECK (length("contact_handle") BETWEEN 1 AND 320),
  ADD CONSTRAINT "conversations_last_message_preview_chk" CHECK (
    "last_message_preview" IS NULL OR length("last_message_preview") <= 300
  ),
  ADD CONSTRAINT "conversations_unread_count_chk" CHECK ("unread_count" >= 0);

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_body_chk" CHECK (length("body") BETWEEN 1 AND 8000),
  ADD CONSTRAINT "messages_error_code_chk" CHECK ("error_code" IS NULL OR length("error_code") <= 80),
  -- error_code is meaningful only once a send has actually failed.
  ADD CONSTRAINT "messages_error_code_status_chk" CHECK ("error_code" IS NULL OR "status" = 'failed');

-- ---- Row-Level Security ----

ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "conversations"
  USING ("organization_id" = current_setting('app.org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.org_id', true));

ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "messages"
  USING ("organization_id" = current_setting('app.org_id', true))
  WITH CHECK ("organization_id" = current_setting('app.org_id', true));
