-- CreateEnum
CREATE TYPE "vehicle_status" AS ENUM ('available', 'reserved', 'sold', 'purchased', 'in_transit', 'under_inspection', 'under_repair', 'archived');

-- CreateEnum
CREATE TYPE "vehicle_condition" AS ENUM ('new', 'used', 'certified_pre_owned');

-- CreateEnum
CREATE TYPE "lead_stage" AS ENUM ('new', 'contacted', 'qualified', 'viewing', 'negotiation', 'won', 'lost');

-- CreateEnum
CREATE TYPE "lead_source" AS ENUM ('website', 'walk_in', 'referral', 'social_media', 'marketplace', 'phone');

-- CreateEnum
CREATE TYPE "deal_status" AS ENUM ('draft', 'sent', 'accepted', 'converted_to_contract', 'completed', 'declined', 'cancelled');

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "stock_number" TEXT NOT NULL,
    "vin" TEXT,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "trim" TEXT,
    "year" INTEGER NOT NULL,
    "condition" "vehicle_condition" NOT NULL DEFAULT 'used',
    "mileage_km" INTEGER,
    "status" "vehicle_status" NOT NULL DEFAULT 'available',
    "list_price" DECIMAL(14,2) NOT NULL,
    "expected_selling_price" DECIMAL(14,2),
    "estimated_market_value" DECIMAL(14,2),
    "purchase_price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "repair_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "transport_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "other_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "acquired_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_status_events" (
    "seq" BIGSERIAL NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "from_status" "vehicle_status",
    "to_status" "vehicle_status" NOT NULL,
    "changed_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_status_events_pkey" PRIMARY KEY ("seq")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "assigned_to_id" TEXT,
    "interested_vehicle_id" TEXT,
    "stage" "lead_stage" NOT NULL DEFAULT 'new',
    "source" "lead_source" NOT NULL DEFAULT 'website',
    "score" INTEGER NOT NULL DEFAULT 0,
    "budget" DECIMAL(14,2),
    "last_contact_at" TIMESTAMPTZ(3),
    "next_follow_up_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deals" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "salesperson_id" TEXT,
    "status" "deal_status" NOT NULL DEFAULT 'draft',
    "sale_price" DECIMAL(14,2) NOT NULL,
    "vat_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cost_of_sale" DECIMAL(14,2),
    "completed_at" TIMESTAMPTZ(3),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customers_organization_id_name_idx" ON "customers"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "customers_id_organization_id_key" ON "customers"("id", "organization_id");

-- CreateIndex
CREATE INDEX "vehicles_organization_id_status_idx" ON "vehicles"("organization_id", "status");

-- CreateIndex
CREATE INDEX "vehicles_organization_id_branch_id_idx" ON "vehicles"("organization_id", "branch_id");

-- CreateIndex
CREATE INDEX "vehicles_organization_id_acquired_at_idx" ON "vehicles"("organization_id", "acquired_at");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_id_organization_id_key" ON "vehicles"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_organization_id_stock_number_key" ON "vehicles"("organization_id", "stock_number");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_organization_id_vin_key" ON "vehicles"("organization_id", "vin");

-- CreateIndex
CREATE INDEX "vehicle_status_events_organization_id_vehicle_id_changed_at_idx" ON "vehicle_status_events"("organization_id", "vehicle_id", "changed_at" DESC);

-- CreateIndex
CREATE INDEX "vehicle_status_events_organization_id_changed_at_idx" ON "vehicle_status_events"("organization_id", "changed_at");

-- CreateIndex
CREATE INDEX "leads_organization_id_created_at_idx" ON "leads"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "leads_organization_id_stage_idx" ON "leads"("organization_id", "stage");

-- CreateIndex
CREATE INDEX "leads_organization_id_assigned_to_id_idx" ON "leads"("organization_id", "assigned_to_id");

-- CreateIndex
CREATE INDEX "leads_organization_id_branch_id_idx" ON "leads"("organization_id", "branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "leads_id_organization_id_key" ON "leads"("id", "organization_id");

-- CreateIndex
CREATE INDEX "deals_organization_id_status_completed_at_idx" ON "deals"("organization_id", "status", "completed_at");

-- CreateIndex
CREATE INDEX "deals_organization_id_vehicle_id_idx" ON "deals"("organization_id", "vehicle_id");

-- CreateIndex
CREATE INDEX "deals_organization_id_salesperson_id_idx" ON "deals"("organization_id", "salesperson_id");

-- CreateIndex
CREATE INDEX "deals_organization_id_customer_id_idx" ON "deals"("organization_id", "customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "deals_id_organization_id_key" ON "deals"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "deals_organization_id_reference_key" ON "deals"("organization_id", "reference");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_status_events" ADD CONSTRAINT "vehicle_status_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_status_events" ADD CONSTRAINT "vehicle_status_events_vehicle_id_organization_id_fkey" FOREIGN KEY ("vehicle_id", "organization_id") REFERENCES "vehicles"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_customer_id_organization_id_fkey" FOREIGN KEY ("customer_id", "organization_id") REFERENCES "customers"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_to_id_organization_id_fkey" FOREIGN KEY ("assigned_to_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_interested_vehicle_id_organization_id_fkey" FOREIGN KEY ("interested_vehicle_id", "organization_id") REFERENCES "vehicles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_customer_id_organization_id_fkey" FOREIGN KEY ("customer_id", "organization_id") REFERENCES "customers"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_vehicle_id_organization_id_fkey" FOREIGN KEY ("vehicle_id", "organization_id") REFERENCES "vehicles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_salesperson_id_organization_id_fkey" FOREIGN KEY ("salesperson_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

