-- CreateEnum
CREATE TYPE "claim_review_status" AS ENUM ('OPEN_REVIEW', 'RESOLVED_ACCEPTED', 'RESOLVED_REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "claim_review_reason_code" AS ENUM ('SEMANTIC_AMBIGUITY', 'INSUFFICIENT_CONTEXT', 'UNSUPPORTED_EXPRESSION', 'CONFLICTING_SOURCE_EVIDENCE', 'UNRESOLVED_CROSS_REFERENCE', 'OPERATIVE_STATE_UNCERTAIN', 'STRUCTURAL_INTEGRITY_RISK', 'VERIFICATION_CONTRADICTION', 'MISSING_REQUIRED_SEMANTIC_DIMENSION', 'COMPILATION_FAILURE', 'OTHER_REVIEW_REQUIRED');

-- CreateEnum
CREATE TYPE "claim_review_pipeline_stage" AS ENUM ('DISCOVERY', 'CONTEXT_RETRIEVAL', 'AMENDMENT_OPERATIVE_STATE', 'SEMANTIC_COMPILER', 'SEMANTIC_VERIFIER', 'COVERAGE_AUDITOR', 'UNSUPPORTED_EXPRESSION_HANDLING', 'HUMAN_REVIEWER', 'OTHER');

-- CreateEnum
CREATE TYPE "claim_review_decision_action" AS ENUM ('ACCEPT', 'REJECT', 'SUPERSEDE', 'REOPEN');

-- CreateTable
CREATE TABLE "claim_review_items" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "packageKey" TEXT,
    "instrumentKey" TEXT,
    "documentId" TEXT NOT NULL,
    "claimKey" TEXT NOT NULL,
    "structuralNodeId" TEXT,
    "sectionRef" TEXT,
    "charStart" INTEGER,
    "charEnd" INTEGER,
    "covenantFamily" TEXT,
    "materiality" TEXT NOT NULL,
    "status" "claim_review_status" NOT NULL DEFAULT 'OPEN_REVIEW',
    "reasonCode" "claim_review_reason_code" NOT NULL,
    "unresolvedDimensions" TEXT[],
    "originStage" "claim_review_pipeline_stage" NOT NULL,
    "sourceEvidence" TEXT NOT NULL,
    "sourceCitation" TEXT,
    "relatedSemanticObjectId" TEXT,
    "operativeVersionRef" TEXT,
    "rationale" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolutionNote" TEXT,
    "algorithmVersion" TEXT NOT NULL,

    CONSTRAINT "claim_review_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_review_observations" (
    "id" TEXT NOT NULL,
    "reviewItemId" TEXT NOT NULL,
    "stage" "claim_review_pipeline_stage" NOT NULL,
    "reasonCode" "claim_review_reason_code" NOT NULL,
    "detail" TEXT NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claim_review_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_review_decisions" (
    "id" TEXT NOT NULL,
    "reviewItemId" TEXT NOT NULL,
    "action" "claim_review_decision_action" NOT NULL,
    "previousStatus" "claim_review_status" NOT NULL,
    "newStatus" "claim_review_status" NOT NULL,
    "note" TEXT,
    "decidedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claim_review_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "claim_review_items_companyId_status_idx" ON "claim_review_items"("companyId", "status");

-- CreateIndex
CREATE INDEX "claim_review_items_documentId_idx" ON "claim_review_items"("documentId");

-- CreateIndex
CREATE INDEX "claim_review_items_companyId_materiality_status_idx" ON "claim_review_items"("companyId", "materiality", "status");

-- CreateIndex
CREATE UNIQUE INDEX "claim_review_items_companyId_claimKey_key" ON "claim_review_items"("companyId", "claimKey");

-- CreateIndex
CREATE INDEX "claim_review_observations_reviewItemId_idx" ON "claim_review_observations"("reviewItemId");

-- CreateIndex
CREATE INDEX "claim_review_decisions_reviewItemId_idx" ON "claim_review_decisions"("reviewItemId");

-- AddForeignKey
ALTER TABLE "claim_review_items" ADD CONSTRAINT "claim_review_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_review_items" ADD CONSTRAINT "claim_review_items_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_review_observations" ADD CONSTRAINT "claim_review_observations_reviewItemId_fkey" FOREIGN KEY ("reviewItemId") REFERENCES "claim_review_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_review_decisions" ADD CONSTRAINT "claim_review_decisions_reviewItemId_fkey" FOREIGN KEY ("reviewItemId") REFERENCES "claim_review_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
