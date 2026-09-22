-- CreateEnum
CREATE TYPE "ai_provider" AS ENUM ('anthropic', 'openai', 'google');

-- CreateEnum
CREATE TYPE "ai_conversation_status" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "ai_message_role" AS ENUM ('user', 'assistant', 'system', 'tool');

-- CreateEnum
CREATE TYPE "ai_message_status" AS ENUM ('complete', 'error');

-- CreateEnum
CREATE TYPE "ai_usage_status" AS ENUM ('success', 'error', 'blocked');

-- CreateEnum
CREATE TYPE "ai_action_type" AS ENUM ('valuation', 'lead_scoring', 'marketing_content', 'document_generation', 'document_translation', 'document_summary', 'price_analysis', 'chat_response', 'follow_up_suggestion');

-- CreateEnum
CREATE TYPE "ai_activity_status" AS ENUM ('completed', 'in_progress', 'needs_review', 'failed');

-- CreateTable
CREATE TABLE "ai_settings" (
    "organization_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "default_provider" "ai_provider",
    "allowed_providers" "ai_provider"[] DEFAULT ARRAY[]::"ai_provider"[],
    "monthly_token_limit" BIGINT,
    "monthly_cost_limit_micros" BIGINT,
    "requests_per_user_per_minute" INTEGER NOT NULL DEFAULT 20,
    "max_output_tokens" INTEGER NOT NULL DEFAULT 1024,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by_id" TEXT,

    CONSTRAINT "ai_settings_pkey" PRIMARY KEY ("organization_id")
);

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ai_conversation_status" NOT NULL DEFAULT 'active',
    "vehicle_id" TEXT,
    "customer_id" TEXT,
    "lead_id" TEXT,
    "deal_id" TEXT,
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "last_message_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "role" "ai_message_role" NOT NULL,
    "status" "ai_message_status" NOT NULL DEFAULT 'complete',
    "content" TEXT NOT NULL,
    "provider" "ai_provider",
    "model" TEXT,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "finish_reason" TEXT,
    "error_code" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT,
    "conversation_id" TEXT,
    "message_id" TEXT,
    "feature" "ai_action_type" NOT NULL,
    "provider" "ai_provider" NOT NULL,
    "model" TEXT NOT NULL,
    "status" "ai_usage_status" NOT NULL,
    "error_code" TEXT,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_micros" BIGINT,
    "latency_ms" INTEGER,
    "request_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_activity" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" "ai_action_type" NOT NULL,
    "status" "ai_activity_status" NOT NULL DEFAULT 'completed',
    "summary" TEXT NOT NULL,
    "conversation_id" TEXT,
    "usage_id" TEXT,
    "vehicle_id" TEXT,
    "customer_id" TEXT,
    "time_saved_seconds" INTEGER NOT NULL DEFAULT 0,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ai_activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_conversations_organization_id_user_id_status_last_messag_idx" ON "ai_conversations"("organization_id", "user_id", "status", "last_message_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ai_conversations_id_organization_id_key" ON "ai_conversations"("id", "organization_id");

-- CreateIndex
CREATE INDEX "ai_messages_organization_id_conversation_id_idx" ON "ai_messages"("organization_id", "conversation_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_messages_conversation_id_position_key" ON "ai_messages"("conversation_id", "position");

-- CreateIndex
CREATE INDEX "ai_usage_organization_id_created_at_idx" ON "ai_usage"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_usage_organization_id_user_id_created_at_idx" ON "ai_usage"("organization_id", "user_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_activity_organization_id_created_at_idx" ON "ai_activity"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ai_activity_organization_id_status_idx" ON "ai_activity"("organization_id", "status");

-- CreateIndex
CREATE INDEX "ai_activity_organization_id_action_idx" ON "ai_activity"("organization_id", "action");

-- CreateIndex
CREATE UNIQUE INDEX "ai_activity_id_organization_id_key" ON "ai_activity"("id", "organization_id");

-- AddForeignKey
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_user_id_organization_id_fkey" FOREIGN KEY ("user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_vehicle_id_organization_id_fkey" FOREIGN KEY ("vehicle_id", "organization_id") REFERENCES "vehicles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_customer_id_organization_id_fkey" FOREIGN KEY ("customer_id", "organization_id") REFERENCES "customers"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_lead_id_organization_id_fkey" FOREIGN KEY ("lead_id", "organization_id") REFERENCES "leads"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_deal_id_organization_id_fkey" FOREIGN KEY ("deal_id", "organization_id") REFERENCES "deals"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_organization_id_fkey" FOREIGN KEY ("conversation_id", "organization_id") REFERENCES "ai_conversations"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_organization_id_fkey" FOREIGN KEY ("user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_activity" ADD CONSTRAINT "ai_activity_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_activity" ADD CONSTRAINT "ai_activity_user_id_organization_id_fkey" FOREIGN KEY ("user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_activity" ADD CONSTRAINT "ai_activity_reviewed_by_id_organization_id_fkey" FOREIGN KEY ("reviewed_by_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_activity" ADD CONSTRAINT "ai_activity_vehicle_id_organization_id_fkey" FOREIGN KEY ("vehicle_id", "organization_id") REFERENCES "vehicles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_activity" ADD CONSTRAINT "ai_activity_customer_id_organization_id_fkey" FOREIGN KEY ("customer_id", "organization_id") REFERENCES "customers"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

