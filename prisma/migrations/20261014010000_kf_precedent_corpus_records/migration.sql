-- Precedent corpus expansion (COMPUTED_NOT_CERTIFIED / precedent-only).
-- Additive. Never production ContractRule / certification authority.
-- knowledge_sources dedupe stays application-level (sha256 + accession+filename)
-- so existing rows are not rewritten.

CREATE TABLE "kf_precedent_corpus_records" (
  "recordId" TEXT NOT NULL,
  "corpus" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "sourceId" TEXT,
  "contentHash" TEXT,
  "accessionNumber" TEXT,
  "authorityStatus" TEXT NOT NULL DEFAULT 'COMPUTED_NOT_CERTIFIED',
  "payloadJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "kf_precedent_corpus_records_pkey" PRIMARY KEY ("recordId")
);

CREATE INDEX "kf_precedent_corpus_records_corpus_idx" ON "kf_precedent_corpus_records"("corpus");
CREATE INDEX "kf_precedent_corpus_records_sourceId_idx" ON "kf_precedent_corpus_records"("sourceId");
CREATE INDEX "kf_precedent_corpus_records_contentHash_idx" ON "kf_precedent_corpus_records"("contentHash");
CREATE INDEX "kf_precedent_corpus_records_accessionNumber_idx" ON "kf_precedent_corpus_records"("accessionNumber");

CREATE INDEX "knowledge_sources_accession_exhibit_idx"
  ON "knowledge_sources"("accessionNumber", "exhibitFilename");
