-- Track whether the first-login guide has already been handled.
--
-- Existing users are backfilled as already handled so historical accounts do
-- not see onboarding just because old data lacks last_login_at.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "first_login_guide_shown_at" TIMESTAMP(3);

UPDATE "users"
SET "first_login_guide_shown_at" = COALESCE("last_login_at", "created_at", CURRENT_TIMESTAMP)
WHERE "first_login_guide_shown_at" IS NULL;
