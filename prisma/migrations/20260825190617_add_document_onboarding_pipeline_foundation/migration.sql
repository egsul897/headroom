-- Document onboarding pipeline - Phase 1 foundation
-- (docs/document-onboarding-pipeline-foundation.md).
--
-- UPLOAD -> PARSE -> EXTRACT -> REVIEW -> APPROVE -> PROMOTE -> ACTIVATE.
-- This migration is additive only and touches zero existing rows' data
-- except where noted (Document.source / typeConfirmedByUser /
-- amendmentRelationshipConfirmedByUser get an explicit backward-compatible
-- default for every pre-existing row - see the comments at each ALTER TABLE
-- below and prisma/schema.prisma's own comments on Company/Document for the
-- full rationale). Coherent's and Matthews' `Permission`/
-- `PermissionRelationship`/`SharedCapacityConstraint`/`GoldenTest`/
-- `LegalReviewRecord` rows are not referenced by anything in this migration.

-- =============================================================================
-- 1. Additive DocumentType enum values (same pattern as
--    20260825041936_add_public_filing_reconstruction_input_kind's
--    ExternalInputKind addition - Postgres ALTER TYPE ADD VALUE is additive
--    only, no existing row affected). Each value needs its own statement.
-- =============================================================================

ALTER TYPE "document_type" ADD VALUE 'AMENDMENT';
ALTER TYPE "document_type" ADD VALUE 'INTERCREDITOR_AGREEMENT';
ALTER TYPE "document_type" ADD VALUE 'COMPLIANCE_CERTIFICATE';

-- =============================================================================
-- 2. Company: coarse onboarding lifecycle + currency/asOfDate defaults.
--    onboardingStatus defaults to ACTIVE so Coherent/Matthews (already fully
--    active, engineer-populated companies) are left alone - a new company
--    created through the pipeline will explicitly pass ONBOARDING.
-- =============================================================================

-- CreateEnum
CREATE TYPE "onboarding_status" AS ENUM ('ONBOARDING', 'ACTIVE_WITH_LIMITATIONS', 'ACTIVE');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "onboardingStatus" "onboarding_status" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "currency" TEXT DEFAULT 'USD',
ADD COLUMN     "asOfDate" TIMESTAMP(3);

-- =============================================================================
-- 3. Document: upload/storage/review-provenance fields. None of these feed
--    loadCompanyCovenantData's effective-dating filter - see the field
--    comments in prisma/schema.prisma.
--
--    `source` defaults to 'engineer-authored' for every pre-existing row
--    (Coherent/Matthews were populated by hand-written scripts, not this
--    pipeline); the upload flow will explicitly pass 'user-upload' for new
--    rows going forward.
--
--    `typeConfirmedByUser`/`amendmentRelationshipConfirmedByUser` default to
--    true for every pre-existing row: Coherent/Matthews' `type` and
--    `supersedesDocumentId` were set directly by an engineer reading the
--    executed document, not proposed-then-reviewed by this pipeline, so they
--    are already "confirmed" in the sense these flags record. A new
--    AI-proposed document (STRUCTURE-stage ExtractionCandidate.kind =
--    DOCUMENT_RELATIONSHIP) leaves both false until a human reviews it.
-- =============================================================================

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "storageRef" TEXT,
ADD COLUMN     "storageProvider" TEXT,
ADD COLUMN     "originalFilename" TEXT,
ADD COLUMN     "uploadedAt" TIMESTAMP(3),
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'engineer-authored',
ADD COLUMN     "typeConfirmedByUser" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "amendmentRelationshipConfirmedByUser" BOOLEAN NOT NULL DEFAULT true;

-- =============================================================================
-- 4. DocumentChunk - section/heading-scoped slices of a parsed document
--    (lib/extraction/chunk.ts). Not a vector-embeddings/retrieval-index
--    table - chunkIndex gives stable ordering, nothing more.
-- =============================================================================

-- CreateTable
CREATE TABLE "document_chunks" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "page" INTEGER,
    "articleRef" TEXT,
    "sectionRef" TEXT,
    "heading" TEXT,
    "text" TEXT NOT NULL,
    "charStart" INTEGER,
    "charEnd" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_chunks_documentId_idx" ON "document_chunks"("documentId");

-- AddForeignKey
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- 5. Staged extraction pipeline: ExtractionRun / ExtractionStage /
--    ExtractionCandidate (lib/extraction/**). See prisma/schema.prisma's own
--    header comment above these models for the stage -> candidate-kind
--    mapping and the partial-failure/retry contract
--    (ExtractionStage's (extractionRunId, stage) unique constraint).
-- =============================================================================

-- CreateEnum
CREATE TYPE "extraction_stage_kind" AS ENUM ('STRUCTURE', 'DEFINITIONS', 'PERMISSIONS', 'RELATIONSHIPS', 'COVERAGE', 'FINANCIAL_INPUTS');

-- CreateEnum
CREATE TYPE "extraction_stage_status" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "extraction_candidate_kind" AS ENUM ('DEFINED_TERM', 'PERMISSION', 'RELATIONSHIP', 'SHARED_CONSTRAINT', 'COLLATERAL_SCOPE', 'ACTIVATION_CONDITION', 'DOCUMENT_RELATIONSHIP', 'EXTERNAL_INPUT_REQUIREMENT');

-- CreateEnum
CREATE TYPE "extraction_candidate_review_status" AS ENUM ('PENDING', 'APPROVED', 'EDITED', 'REJECTED', 'REVIEW_REQUIRED');

-- CreateTable
CREATE TABLE "extraction_runs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "extraction_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extraction_stages" (
    "id" TEXT NOT NULL,
    "extractionRunId" TEXT NOT NULL,
    "stage" "extraction_stage_kind" NOT NULL,
    "status" "extraction_stage_status" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "extraction_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extraction_candidates" (
    "id" TEXT NOT NULL,
    "extractionRunId" TEXT NOT NULL,
    "extractionStageId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" "extraction_candidate_kind" NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "sourceChunkIds" TEXT[],
    "sourcePage" INTEGER,
    "sourceSectionRef" TEXT,
    "sourceExcerpt" TEXT,
    "proposedValue" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION,
    "rationale" TEXT,
    "reviewStatus" "extraction_candidate_review_status" NOT NULL DEFAULT 'PENDING',
    "reviewerEditedValue" JSONB,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "promotedAt" TIMESTAMP(3),
    "promotedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "extraction_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "extraction_runs_companyId_idx" ON "extraction_runs"("companyId");

-- CreateIndex
CREATE INDEX "extraction_runs_documentId_idx" ON "extraction_runs"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "extraction_stages_extractionRunId_stage_key" ON "extraction_stages"("extractionRunId", "stage");

-- CreateIndex
CREATE INDEX "extraction_candidates_companyId_idx" ON "extraction_candidates"("companyId");

-- CreateIndex
CREATE INDEX "extraction_candidates_extractionRunId_idx" ON "extraction_candidates"("extractionRunId");

-- CreateIndex
CREATE INDEX "extraction_candidates_extractionStageId_idx" ON "extraction_candidates"("extractionStageId");

-- CreateIndex
CREATE INDEX "extraction_candidates_sourceDocumentId_idx" ON "extraction_candidates"("sourceDocumentId");

-- CreateIndex
CREATE INDEX "extraction_candidates_kind_reviewStatus_idx" ON "extraction_candidates"("kind", "reviewStatus");

-- AddForeignKey
ALTER TABLE "extraction_runs" ADD CONSTRAINT "extraction_runs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extraction_runs" ADD CONSTRAINT "extraction_runs_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extraction_stages" ADD CONSTRAINT "extraction_stages_extractionRunId_fkey" FOREIGN KEY ("extractionRunId") REFERENCES "extraction_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extraction_candidates" ADD CONSTRAINT "extraction_candidates_extractionRunId_fkey" FOREIGN KEY ("extractionRunId") REFERENCES "extraction_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extraction_candidates" ADD CONSTRAINT "extraction_candidates_extractionStageId_fkey" FOREIGN KEY ("extractionStageId") REFERENCES "extraction_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extraction_candidates" ADD CONSTRAINT "extraction_candidates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extraction_candidates" ADD CONSTRAINT "extraction_candidates_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
