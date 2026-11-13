-- AlterTable
-- Remove deprecated fields from bookdate_config table
-- These fields have been migrated to per-user settings (User.bookDateLibraryScope and User.bookDateCustomPrompt)
ALTER TABLE "bookdate_config" DROP COLUMN IF EXISTS "library_scope";
ALTER TABLE "bookdate_config" DROP COLUMN IF EXISTS "custom_prompt";
