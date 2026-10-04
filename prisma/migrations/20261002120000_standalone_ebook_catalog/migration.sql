ALTER TABLE "audiobooks"
  ADD COLUMN "catalog_provider" TEXT,
  ADD COLUMN "catalog_id" TEXT,
  ADD COLUMN "isbn" TEXT;

CREATE UNIQUE INDEX "audiobooks_catalog_provider_catalog_id_key"
  ON "audiobooks"("catalog_provider", "catalog_id");

CREATE INDEX "audiobooks_isbn_idx"
  ON "audiobooks"("isbn");
