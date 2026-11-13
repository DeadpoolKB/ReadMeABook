-- AlterTable
ALTER TABLE "download_history" ADD COLUMN "indexer_id" INTEGER;

-- CreateIndex
CREATE INDEX "download_history_indexer_id_idx" ON "download_history"("indexer_id");
