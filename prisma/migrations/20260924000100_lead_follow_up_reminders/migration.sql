-- Notifications (§27): the notifications table and its kind enum already exist (§0.15) — nothing to add
-- there. The one new gate needed is on leads, for the follow-up reminder job (mirrors tasks.reminded_at).

-- AlterTable
ALTER TABLE "leads" ADD COLUMN "follow_up_reminded_at" TIMESTAMPTZ(3);

ALTER TABLE "leads"
  -- A lead can only have been reminded about if a follow-up was actually scheduled for it.
  ADD CONSTRAINT "leads_follow_up_reminded_pair_chk" CHECK ("follow_up_reminded_at" IS NULL OR "next_follow_up_at" IS NOT NULL);
