-- Add files_hash field to audiobooks table for accurate library matching
-- SHA256 hash of sorted audio filenames used to match RMAB-organized content with ABS library items

-- AlterTable
ALTER TABLE "audiobooks" ADD COLUMN "files_hash" TEXT;

-- CreateIndex
CREATE INDEX "audiobooks_files_hash_idx" ON "audiobooks"("files_hash");
