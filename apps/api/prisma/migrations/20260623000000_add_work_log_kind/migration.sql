-- Add an explicit daily/plan type to work logs.
-- Production backfill policy:
-- 1. Existing rows default to DAILY so historical reports keep their previous behavior.
-- 2. Rows whose work date is still in the future are definitely old "plan" records.
-- 3. Rows created or submitted before their work date are treated as historical plans.
--    This recovers most old future-plan records after the date has passed without
--    guessing from loose text content.

DO $$
BEGIN
  CREATE TYPE "WorkLogKind" AS ENUM ('DAILY', 'PLAN');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "kind" "WorkLogKind";

UPDATE "work_logs"
SET "kind" = 'DAILY'
WHERE "kind" IS NULL;

UPDATE "work_logs"
SET "kind" = 'PLAN'
WHERE "kind" = 'DAILY'
  AND "deleted_at" IS NULL
  AND (
    "date" > CURRENT_DATE
    OR "created_at"::date < "date"
    OR ("submitted_at" IS NOT NULL AND "submitted_at"::date < "date")
  );

ALTER TABLE "work_logs" ALTER COLUMN "kind" SET DEFAULT 'DAILY';
ALTER TABLE "work_logs" ALTER COLUMN "kind" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "work_logs_tenant_id_kind_date_idx" ON "work_logs"("tenant_id", "kind", "date");
