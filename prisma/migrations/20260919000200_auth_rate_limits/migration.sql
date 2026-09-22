-- CreateTable
CREATE TABLE "rate_limit_buckets" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "window_start" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "rate_limit_buckets_window_start_idx" ON "rate_limit_buckets"("window_start");


-- Rate-limit counters are platform-only: the RLS-restricted runtime role must never touch them.
-- (When the role is created later, prisma/sql/create-app-role.sql applies the same REVOKE.)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cda_app') THEN
    REVOKE ALL ON TABLE "rate_limit_buckets" FROM cda_app;
  END IF;
END
$$;
