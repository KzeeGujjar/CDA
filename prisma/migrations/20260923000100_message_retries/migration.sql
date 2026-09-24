-- Background jobs (§0.28): a "last retried" mark on outbound messages, so the retry job
-- (src/server/platform/message-retries.ts) can find FAILED sends it has not yet retried, and never retries
-- one more than once automatically. Mirrors tasks.reminded_at.

-- AlterTable
ALTER TABLE "messages" ADD COLUMN "retried_at" TIMESTAMPTZ(3);
