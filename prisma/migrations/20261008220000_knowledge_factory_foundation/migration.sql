-- Covenant Knowledge Factory foundation (additive).
-- Bulk document bytes are NOT stored in Postgres; only registry metadata.

CREATE TYPE "knowledge_representation_level" AS ENUM (
  'SOURCE_ONLY',
  'STRUCTURALLY_INDEXED',
  'DISCOVERED_CANDIDATE',
  'SEMANTIC_HYPOTHESIS',
  'DETERMINISTICALLY_VALIDATED',
  'REVIEW_REQUIRED',
  'REVIEWER_VERIFIED',
  'CERTIFIED'
);

CREATE TYPE "knowledge_debt_document_class" AS ENUM (
  'CREDIT_AGREEMENT',
  'REVOLVING_CREDIT_AGREEMENT',
  'TERM_LOAN_AGREEMENT',
  'ABL_AGREEMENT',
  'INDENTURE',
  'SUPPLEMENTAL_INDENTURE',
  'AMENDMENT',
  'RESTATEMENT',
  'WAIVER',
  'CONSENT',
  'SIDE_LETTER',
  'INTERCREDITOR_AGREEMENT',
  'SECURITY_AGREEMENT',
  'GUARANTEE_AGREEMENT',
  'OTHER_DEBT_RELATED',
  'UNKNOWN'
);

CREATE TYPE "knowledge_extraction_status" AS ENUM (
  'PENDING',
  'ACQUIRED',
  'TEXT_EXTRACTED',
  'STRUCTURALLY_INDEXED',
  'CLASSIFIED',
  'CANDIDATES_DISCOVERED',
  'FAILED',
  'UNSUPPORTED_FORMAT'
);

CREATE TYPE "knowledge_usage_rights_status" AS ENUM (
  'UNREVIEWED',
  'PUBLIC_SEC_EDGAR',
  'FIXTURE_INTERNAL',
  'RESTRICTED',
  'CLEARED'
);

CREATE TYPE "knowledge_relationship_kind" AS ENUM (
  'AGREEMENT_AMENDMENT',
  'AGREEMENT_RESTATEMENT',
  'INDENTURE_SUPPLEMENTAL',
  'AGREEMENT_WAIVER',
  'AGREEMENT_CONSENT',
  'AGREEMENT_SIDE_LETTER',
  'AGREEMENT_INTERCREDITOR',
  'PROVISION_DEFINITION',
  'PROVISION_CROSS_REFERENCE',
  'PROVISION_EXCEPTION',
  'PROVISION_CONDITION',
  'PROVISION_SHARED_CAPACITY'
);

CREATE TYPE "knowledge_relationship_evidence_status" AS ENUM (
  'DISCOVERED',
  'INFERRED',
  'AUTHENTICATED',
  'REVIEWED'
);

CREATE TABLE "knowledge_sources" (
  "id" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "companyId" TEXT,
  "documentId" TEXT,
  "sourceArtifactId" TEXT,
  "issuerCik" TEXT NOT NULL,
  "issuerTicker" TEXT,
  "issuerName" TEXT,
  "accessionNumber" TEXT NOT NULL,
  "exhibitFilename" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "filingDate" TIMESTAMP(3) NOT NULL,
  "formType" TEXT NOT NULL,
  "documentTitle" TEXT NOT NULL,
  "documentClass" "knowledge_debt_document_class" NOT NULL DEFAULT 'UNKNOWN',
  "instrumentIdentity" TEXT,
  "originalBytesHash" TEXT NOT NULL,
  "normalizedTextHash" TEXT,
  "acquisitionTimestamp" TIMESTAMP(3) NOT NULL,
  "parserVersion" TEXT NOT NULL,
  "extractionStatus" "knowledge_extraction_status" NOT NULL DEFAULT 'PENDING',
  "representationLevel" "knowledge_representation_level" NOT NULL DEFAULT 'SOURCE_ONLY',
  "provenance" TEXT NOT NULL,
  "usageRightsReviewStatus" "knowledge_usage_rights_status" NOT NULL DEFAULT 'UNREVIEWED',
  "discoveryScore" DOUBLE PRECISION,
  "byteSize" INTEGER,
  "storageRef" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "knowledge_sources_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "knowledge_sources_sourceId_key" ON "knowledge_sources"("sourceId");
CREATE INDEX "knowledge_sources_issuerCik_idx" ON "knowledge_sources"("issuerCik");
CREATE INDEX "knowledge_sources_accessionNumber_idx" ON "knowledge_sources"("accessionNumber");
CREATE INDEX "knowledge_sources_originalBytesHash_idx" ON "knowledge_sources"("originalBytesHash");
CREATE INDEX "knowledge_sources_documentClass_idx" ON "knowledge_sources"("documentClass");
CREATE INDEX "knowledge_sources_representationLevel_idx" ON "knowledge_sources"("representationLevel");

ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "knowledge_relationship_edges" (
  "id" TEXT NOT NULL,
  "sourceRecordId" TEXT NOT NULL,
  "targetSourceId" TEXT NOT NULL,
  "kind" "knowledge_relationship_kind" NOT NULL,
  "evidenceStatus" "knowledge_relationship_evidence_status" NOT NULL DEFAULT 'DISCOVERED',
  "rationale" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "knowledge_relationship_edges_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "knowledge_relationship_edges_targetSourceId_idx" ON "knowledge_relationship_edges"("targetSourceId");
CREATE INDEX "knowledge_relationship_edges_kind_idx" ON "knowledge_relationship_edges"("kind");

ALTER TABLE "knowledge_relationship_edges" ADD CONSTRAINT "knowledge_relationship_edges_sourceRecordId_fkey"
  FOREIGN KEY ("sourceRecordId") REFERENCES "knowledge_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "knowledge_cost_ledger_entries" (
  "id" TEXT NOT NULL,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "category" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "unit" TEXT NOT NULL,
  "estimated" BOOLEAN NOT NULL,
  "note" TEXT,

  CONSTRAINT "knowledge_cost_ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "knowledge_cost_ledger_entries_category_estimated_idx"
  ON "knowledge_cost_ledger_entries"("category", "estimated");
