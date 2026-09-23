-- Task reminders (§0.23): a real due time for a reminder notification, and when it was actually sent (so a
-- maintenance run started twice, or concurrently, never double-notifies — see tasks-remind.ts).

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN "remind_at" TIMESTAMPTZ(3),
                    ADD COLUMN "reminded_at" TIMESTAMPTZ(3);

ALTER TABLE "tasks"
  -- A task can only have been reminded about if a reminder was actually set for it.
  ADD CONSTRAINT "tasks_reminded_pair_chk" CHECK ("reminded_at" IS NULL OR "remind_at" IS NOT NULL);
