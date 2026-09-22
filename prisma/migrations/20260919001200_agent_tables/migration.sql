-- CreateEnum
CREATE TYPE "task_category" AS ENUM ('follow_up', 'inspection', 'photography', 'documents', 'call', 'quotation', 'service', 'delivery');

-- CreateEnum
CREATE TYPE "task_status" AS ENUM ('open', 'completed');

-- CreateEnum
CREATE TYPE "task_priority" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "partner_request_kind" AS ENUM ('bank_evaluation', 'company_quotation');

-- CreateEnum
CREATE TYPE "partner_request_status" AS ENUM ('requested', 'in_review', 'completed', 'rejected');

-- CreateEnum
CREATE TYPE "vehicle_source_kind" AS ENUM ('inventory', 'customer_owned');

-- CreateEnum
CREATE TYPE "ai_tool_call_status" AS ENUM ('ok', 'error', 'denied', 'awaiting_confirmation', 'executed', 'rejected', 'expired');

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "task_category" NOT NULL DEFAULT 'follow_up',
    "status" "task_status" NOT NULL DEFAULT 'open',
    "priority" "task_priority" NOT NULL DEFAULT 'medium',
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "assigned_to_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "vehicle_id" TEXT,
    "customer_id" TEXT,
    "lead_id" TEXT,
    "deal_id" TEXT,
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_requests" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "kind" "partner_request_kind" NOT NULL,
    "status" "partner_request_status" NOT NULL DEFAULT 'requested',
    "vehicle_source" "vehicle_source_kind" NOT NULL,
    "vehicle_id" TEXT,
    "customer_vehicle" JSONB,
    "vehicle_label" TEXT NOT NULL,
    "customer_id" TEXT,
    "customer_name" TEXT,
    "bank_code" TEXT,
    "finance_amount" DECIMAL(14,2),
    "fee" DECIMAL(14,2),
    "fee_currency" CHAR(3),
    "notes" TEXT,
    "estimated_value" DECIMAL(14,2),
    "quoted_price" DECIMAL(14,2),
    "report_reference" TEXT,
    "requested_by_id" TEXT NOT NULL,
    "requested_via" TEXT NOT NULL DEFAULT 'manual',
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "partner_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_tool_calls" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "message_id" TEXT,
    "tool_name" TEXT NOT NULL,
    "arguments" JSONB NOT NULL,
    "status" "ai_tool_call_status" NOT NULL,
    "result_summary" TEXT,
    "error_code" TEXT,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMPTZ(3),

    CONSTRAINT "ai_tool_calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tasks_organization_id_assigned_to_id_status_due_at_idx" ON "tasks"("organization_id", "assigned_to_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "tasks_organization_id_status_due_at_idx" ON "tasks"("organization_id", "status", "due_at");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_id_organization_id_key" ON "tasks"("id", "organization_id");

-- CreateIndex
CREATE INDEX "partner_requests_organization_id_kind_status_requested_at_idx" ON "partner_requests"("organization_id", "kind", "status", "requested_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "partner_requests_id_organization_id_key" ON "partner_requests"("id", "organization_id");

-- CreateIndex
CREATE INDEX "ai_tool_calls_organization_id_conversation_id_created_at_idx" ON "ai_tool_calls"("organization_id", "conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_tool_calls_organization_id_user_id_status_created_at_idx" ON "ai_tool_calls"("organization_id", "user_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "ai_tool_calls_organization_id_tool_name_created_at_idx" ON "ai_tool_calls"("organization_id", "tool_name", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_tool_calls_id_organization_id_key" ON "ai_tool_calls"("id", "organization_id");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_to_id_organization_id_fkey" FOREIGN KEY ("assigned_to_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_id_organization_id_fkey" FOREIGN KEY ("created_by_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_vehicle_id_organization_id_fkey" FOREIGN KEY ("vehicle_id", "organization_id") REFERENCES "vehicles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_customer_id_organization_id_fkey" FOREIGN KEY ("customer_id", "organization_id") REFERENCES "customers"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_lead_id_organization_id_fkey" FOREIGN KEY ("lead_id", "organization_id") REFERENCES "leads"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_deal_id_organization_id_fkey" FOREIGN KEY ("deal_id", "organization_id") REFERENCES "deals"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_requests" ADD CONSTRAINT "partner_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_requests" ADD CONSTRAINT "partner_requests_vehicle_id_organization_id_fkey" FOREIGN KEY ("vehicle_id", "organization_id") REFERENCES "vehicles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_requests" ADD CONSTRAINT "partner_requests_customer_id_organization_id_fkey" FOREIGN KEY ("customer_id", "organization_id") REFERENCES "customers"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_requests" ADD CONSTRAINT "partner_requests_requested_by_id_organization_id_fkey" FOREIGN KEY ("requested_by_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_tool_calls" ADD CONSTRAINT "ai_tool_calls_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_tool_calls" ADD CONSTRAINT "ai_tool_calls_user_id_organization_id_fkey" FOREIGN KEY ("user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

