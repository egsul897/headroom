-- Autonomous information retrieval - Phase A foundation
-- (docs/autonomous-retrieval-phase-a-foundation.md).
--
-- Additive only - zero existing rows/columns touched, zero rows for
-- Coherent/Matthews as of this migration. Builds the connector/registry/
-- ingestion foundation (CompanySourceConnection, SourceArtifact, IngestionJob/
-- IngestionJobStage, SourcePriorityRule) plus one additive enum value
-- (ExtractionCandidateKind.FINANCIAL_FACT) that lets a connector-discovered
-- financial fact reuse the EXISTING ExtractionCandidate/CandidateReviewEvent
-- review machinery, per the task's own "reuse the ontology, don't build a
-- parallel one" instruction.

-- =============================================================================
-- 1. Additive ExtractionCandidateKind enum value (same pattern as every prior
--    enum extension in this codebase - Postgres ALTER TYPE ADD VALUE is
--    additive only, no existing row affected). See prisma/schema.prisma's own
--    comment on this enum member for why no parallel review system exists.
-- =============================================================================

ALTER TYPE "extraction_candidate_kind" ADD VALUE 'FINANCIAL_FACT';

-- =============================================================================
-- 2. Connector/source-connection registry.
-- =============================================================================

-- CreateEnum
CREATE TYPE "connector_type" AS ENUM ('EDGAR', 'CSV_FINANCIAL', 'DOCUMENT_UPLOAD');

-- CreateEnum
CREATE TYPE "connection_status" AS ENUM ('CONNECTED', 'ERROR', 'DISCONNECTED');

-- CreateTable
CREATE TABLE "company_source_connections" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "connectorType" "connector_type" NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "connection_status" NOT NULL DEFAULT 'CONNECTED',
    "capabilities" TEXT[],
    "sourcePriority" INTEGER NOT NULL DEFAULT 0,
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "cursor" TEXT,
    "errorState" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "credentialRef" TEXT,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_source_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "company_source_connections_companyId_idx" ON "company_source_connections"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "company_source_connections_companyId_connectorType_key" ON "company_source_connections"("companyId", "connectorType");

-- AddForeignKey
ALTER TABLE "company_source_connections" ADD CONSTRAINT "company_source_connections_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- 3. SourceArtifact - the dedup ledger. (companyId, contentHash) uniqueness
--    IS the dedup mechanism (lib/connectors/dedup.ts).
-- =============================================================================

-- CreateEnum
CREATE TYPE "source_artifact_type" AS ENUM ('DOCUMENT', 'FINANCIAL_RECORD');

-- CreateTable
CREATE TABLE "source_artifacts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sourceConnectionId" TEXT NOT NULL,
    "artifactType" "source_artifact_type" NOT NULL,
    "sourceIdentifier" TEXT,
    "sourceUri" TEXT,
    "retrievedAt" TIMESTAMP(3) NOT NULL,
    "effectiveDate" TIMESTAMP(3),
    "contentHash" TEXT NOT NULL,
    "mimeType" TEXT,
    "storageRef" TEXT,
    "rawPayload" JSONB,
    "provenanceMetadata" JSONB,
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "source_artifacts_companyId_idx" ON "source_artifacts"("companyId");

-- CreateIndex
CREATE INDEX "source_artifacts_sourceConnectionId_idx" ON "source_artifacts"("sourceConnectionId");

-- CreateIndex
CREATE INDEX "source_artifacts_documentId_idx" ON "source_artifacts"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "source_artifacts_companyId_contentHash_key" ON "source_artifacts"("companyId", "contentHash");

-- AddForeignKey
ALTER TABLE "source_artifacts" ADD CONSTRAINT "source_artifacts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_artifacts" ADD CONSTRAINT "source_artifacts_sourceConnectionId_fkey" FOREIGN KEY ("sourceConnectionId") REFERENCES "company_source_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_artifacts" ADD CONSTRAINT "source_artifacts_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================
-- 4. IngestionJob / IngestionJobStage - mirrors ExtractionRun/ExtractionStage's
--    exact proven partial-failure/retry discipline (lib/extraction/run-stage.ts).
--    IngestionJobStage's own (ingestionJobId, stage) unique constraint is the
--    retry/resume unit, same contract as ExtractionStage's.
-- =============================================================================

-- CreateEnum
CREATE TYPE "ingestion_job_kind" AS ENUM ('INITIALIZE', 'SYNC', 'AMENDMENT_PROCESS');

-- CreateEnum
CREATE TYPE "ingestion_stage_kind" AS ENUM ('DISCOVER', 'FETCH', 'CLASSIFY_DEDUPE', 'EXTRACT', 'RECONCILE', 'COMPLETE');

-- CreateEnum
CREATE TYPE "ingestion_stage_status" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETE', 'FAILED');

-- CreateTable
CREATE TABLE "ingestion_jobs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sourceConnectionId" TEXT,
    "kind" "ingestion_job_kind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingestion_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_job_stages" (
    "id" TEXT NOT NULL,
    "ingestionJobId" TEXT NOT NULL,
    "stage" "ingestion_stage_kind" NOT NULL,
    "status" "ingestion_stage_status" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "recordsDiscovered" INTEGER NOT NULL DEFAULT 0,
    "recordsChanged" INTEGER NOT NULL DEFAULT 0,
    "output" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ingestion_job_stages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ingestion_jobs_companyId_idx" ON "ingestion_jobs"("companyId");

-- CreateIndex
CREATE INDEX "ingestion_jobs_sourceConnectionId_idx" ON "ingestion_jobs"("sourceConnectionId");

-- CreateIndex
CREATE UNIQUE INDEX "ingestion_job_stages_ingestionJobId_stage_key" ON "ingestion_job_stages"("ingestionJobId", "stage");

-- AddForeignKey
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_sourceConnectionId_fkey" FOREIGN KEY ("sourceConnectionId") REFERENCES "company_source_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_job_stages" ADD CONSTRAINT "ingestion_job_stages_ingestionJobId_fkey" FOREIGN KEY ("ingestionJobId") REFERENCES "ingestion_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- 5. SourcePriorityRule - table only, Phase B implements the reconciliation
--    logic that reads it. Seeded with a few sensible global defaults below.
-- =============================================================================

-- CreateTable
CREATE TABLE "source_priority_rules" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "metricName" TEXT NOT NULL,
    "connectorType" "connector_type" NOT NULL,
    "priority" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_priority_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "source_priority_rules_companyId_metricName_idx" ON "source_priority_rules"("companyId", "metricName");

-- AddForeignKey
ALTER TABLE "source_priority_rules" ADD CONSTRAINT "source_priority_rules_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed a few sensible GLOBAL default rules (companyId NULL) - lower priority
-- number wins. Compliance-certificate-derived facts arrive as DOCUMENT
-- artifacts extracted via the existing LLM/synthetic extraction pipeline, not
-- via a connector of their own; the connector-level defaults this table can
-- express for Phase A are the ones that actually correspond to a
-- ConnectorType: a manually-reviewed document upload (compliance certificates,
-- board-approved figures) outranks an EDGAR-derived figure, which in turn
-- outranks a bulk CSV import for the same metric - CSV imports are convenient
-- but the least independently-verified of the three source kinds. Phase B is
-- free to add/adjust rows; these just need to exist so the table is non-empty
-- and the convention (lower = higher priority) is demonstrated.
INSERT INTO "source_priority_rules" ("id", "companyId", "metricName", "connectorType", "priority", "createdAt") VALUES
    ('seed-priority-ebitda-upload', NULL, 'covenant_ebitda', 'DOCUMENT_UPLOAD', 0, CURRENT_TIMESTAMP),
    ('seed-priority-ebitda-edgar', NULL, 'covenant_ebitda', 'EDGAR', 10, CURRENT_TIMESTAMP),
    ('seed-priority-ebitda-csv', NULL, 'covenant_ebitda', 'CSV_FINANCIAL', 20, CURRENT_TIMESTAMP),
    ('seed-priority-cash-upload', NULL, 'cash', 'DOCUMENT_UPLOAD', 0, CURRENT_TIMESTAMP),
    ('seed-priority-cash-edgar', NULL, 'cash', 'EDGAR', 10, CURRENT_TIMESTAMP),
    ('seed-priority-cash-csv', NULL, 'cash', 'CSV_FINANCIAL', 20, CURRENT_TIMESTAMP),
    ('seed-priority-totaldebt-upload', NULL, 'total_debt', 'DOCUMENT_UPLOAD', 0, CURRENT_TIMESTAMP),
    ('seed-priority-totaldebt-edgar', NULL, 'total_debt', 'EDGAR', 10, CURRENT_TIMESTAMP),
    ('seed-priority-totaldebt-csv', NULL, 'total_debt', 'CSV_FINANCIAL', 20, CURRENT_TIMESTAMP);
