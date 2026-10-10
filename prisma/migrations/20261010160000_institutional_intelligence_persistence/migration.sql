-- CreateEnum
CREATE TYPE "intelligence_lifecycle_status" AS ENUM ('ACTIVE', 'STALE', 'SUPERSEDED', 'REVOKED', 'INVALIDATED');

-- CreateEnum
CREATE TYPE "intelligence_authority_class" AS ENUM ('HYPOTHETICAL', 'COMPILED_UNVERIFIED', 'PROVISIONAL', 'REVIEW_REQUIRED', 'REFUSED', 'VERIFIED_CALCULATION', 'PRODUCTION_AUTHORITATIVE');

-- CreateEnum
CREATE TYPE "institutional_audit_action" AS ENUM ('SUBMISSION', 'REVIEW', 'APPROVAL', 'REJECTION', 'SUPERSESSION', 'REVOCATION', 'RECLASSIFICATION', 'AUTHORITY_ACTIVATION', 'AUTHORITY_REFUSAL', 'DOCUMENT_REPLACEMENT', 'FINANCIAL_EVIDENCE_REVISION', 'CAPACITY_RECALCULATION', 'TRANSACTION_CONFIRMATION', 'PERSISTENCE_WRITE', 'INVALIDATION');

-- CreateTable
CREATE TABLE "operative_authority_snapshots" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "packageKey" TEXT NOT NULL,
    "asOfDate" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "authorityClassification" TEXT NOT NULL,
    "instrumentKey" TEXT,
    "provisionalIdentity" BOOLEAN NOT NULL DEFAULT false,
    "engineVersion" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "sourceFingerprint" JSONB NOT NULL,
    "status" "intelligence_lifecycle_status" NOT NULL DEFAULT 'ACTIVE',
    "supersededById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operative_authority_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "context_retrieval_manifests" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "packageKey" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "instrumentKey" TEXT,
    "originatingDocumentId" TEXT NOT NULL,
    "originatingDiscoveryId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "sufficiencyState" TEXT NOT NULL,
    "retrievalAlgorithmVersion" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "sourceFingerprint" JSONB NOT NULL,
    "status" "intelligence_lifecycle_status" NOT NULL DEFAULT 'ACTIVE',
    "supersededById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "context_retrieval_manifests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_evidence_bundles" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "bundleKey" TEXT NOT NULL,
    "asOfDate" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "verificationStatus" TEXT NOT NULL,
    "authenticity" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "sourceFingerprint" JSONB NOT NULL,
    "status" "intelligence_lifecycle_status" NOT NULL DEFAULT 'ACTIVE',
    "supersededById" TEXT,
    "claimedReviewerLabel" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_evidence_bundles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "utilization_completeness_records" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "capacityRuleId" TEXT NOT NULL,
    "asOfDate" TEXT NOT NULL,
    "certificateKind" TEXT NOT NULL,
    "authenticity" TEXT,
    "contentHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "intelligence_lifecycle_status" NOT NULL DEFAULT 'ACTIVE',
    "supersededById" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "utilization_completeness_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capacity_calculation_records" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "instrumentKey" TEXT,
    "asOfDate" TEXT NOT NULL,
    "calculationId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "authorityClass" "intelligence_authority_class" NOT NULL,
    "calculationStatus" TEXT NOT NULL,
    "operativeAuthoritySnapshotId" TEXT,
    "verifiedIrIdentity" TEXT,
    "financialSnapshotIdentity" TEXT,
    "utilizationSnapshotIdentity" TEXT,
    "capacityOutput" JSONB,
    "missingInputs" JSONB,
    "refusalReasons" JSONB,
    "reviewConditions" JSONB,
    "trace" JSONB,
    "payload" JSONB NOT NULL,
    "status" "intelligence_lifecycle_status" NOT NULL DEFAULT 'ACTIVE',
    "supersededById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "capacity_calculation_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_simulation_records" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "simulationId" TEXT NOT NULL,
    "simulationHash" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "simulationStatus" TEXT NOT NULL,
    "authorityClass" "intelligence_authority_class" NOT NULL DEFAULT 'HYPOTHETICAL',
    "mutatesActualLedger" BOOLEAN NOT NULL DEFAULT false,
    "capacityCalculationRecordId" TEXT,
    "payload" JSONB NOT NULL,
    "proposedEffects" JSONB,
    "postStateIdentity" JSONB,
    "status" "intelligence_lifecycle_status" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transaction_simulation_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institutional_audit_events" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "action" "institutional_audit_action" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "actorProvenance" TEXT NOT NULL,
    "actorLabel" TEXT,
    "priorState" JSONB,
    "newState" JSONB,
    "evidenceRefs" JSONB,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institutional_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dependency_invalidation_records" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceEntityId" TEXT NOT NULL,
    "dependentEntityType" TEXT NOT NULL,
    "dependentEntityId" TEXT NOT NULL,
    "sourceFingerprintBefore" TEXT,
    "sourceFingerprintAfter" TEXT,
    "reason" TEXT NOT NULL,
    "invalidatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dependency_invalidation_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "operative_authority_snapshots_companyId_packageKey_asOfDate_idx" ON "operative_authority_snapshots"("companyId", "packageKey", "asOfDate", "status");

-- CreateIndex
CREATE INDEX "operative_authority_snapshots_companyId_status_idx" ON "operative_authority_snapshots"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "operative_authority_snapshots_companyId_packageKey_asOfDate_key" ON "operative_authority_snapshots"("companyId", "packageKey", "asOfDate", "contentHash");

-- CreateIndex
CREATE INDEX "context_retrieval_manifests_companyId_packageKey_status_idx" ON "context_retrieval_manifests"("companyId", "packageKey", "status");

-- CreateIndex
CREATE INDEX "context_retrieval_manifests_companyId_contentHash_idx" ON "context_retrieval_manifests"("companyId", "contentHash");

-- CreateIndex
CREATE INDEX "context_retrieval_manifests_companyId_originatingDocumentId_idx" ON "context_retrieval_manifests"("companyId", "originatingDocumentId");

-- CreateIndex
CREATE UNIQUE INDEX "context_retrieval_manifests_companyId_bundleId_retrievalAlg_key" ON "context_retrieval_manifests"("companyId", "bundleId", "retrievalAlgorithmVersion", "contentHash");

-- CreateIndex
CREATE INDEX "financial_evidence_bundles_companyId_asOfDate_status_idx" ON "financial_evidence_bundles"("companyId", "asOfDate", "status");

-- CreateIndex
CREATE INDEX "financial_evidence_bundles_companyId_verificationStatus_sta_idx" ON "financial_evidence_bundles"("companyId", "verificationStatus", "status");

-- CreateIndex
CREATE UNIQUE INDEX "financial_evidence_bundles_companyId_bundleKey_contentHash_key" ON "financial_evidence_bundles"("companyId", "bundleKey", "contentHash");

-- CreateIndex
CREATE INDEX "utilization_completeness_records_companyId_capacityRuleId_s_idx" ON "utilization_completeness_records"("companyId", "capacityRuleId", "status");

-- CreateIndex
CREATE INDEX "utilization_completeness_records_companyId_asOfDate_status_idx" ON "utilization_completeness_records"("companyId", "asOfDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "utilization_completeness_records_companyId_capacityRuleId_a_key" ON "utilization_completeness_records"("companyId", "capacityRuleId", "asOfDate", "contentHash");

-- CreateIndex
CREATE INDEX "capacity_calculation_records_companyId_asOfDate_authorityCl_idx" ON "capacity_calculation_records"("companyId", "asOfDate", "authorityClass", "status");

-- CreateIndex
CREATE INDEX "capacity_calculation_records_companyId_inputHash_idx" ON "capacity_calculation_records"("companyId", "inputHash");

-- CreateIndex
CREATE INDEX "capacity_calculation_records_companyId_status_idx" ON "capacity_calculation_records"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "capacity_calculation_records_companyId_calculationId_conten_key" ON "capacity_calculation_records"("companyId", "calculationId", "contentHash");

-- CreateIndex
CREATE INDEX "transaction_simulation_records_companyId_transactionId_idx" ON "transaction_simulation_records"("companyId", "transactionId");

-- CreateIndex
CREATE INDEX "transaction_simulation_records_companyId_status_idx" ON "transaction_simulation_records"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_simulation_records_companyId_simulationId_simul_key" ON "transaction_simulation_records"("companyId", "simulationId", "simulationHash");

-- CreateIndex
CREATE UNIQUE INDEX "institutional_audit_events_eventId_key" ON "institutional_audit_events"("eventId");

-- CreateIndex
CREATE INDEX "institutional_audit_events_companyId_occurredAt_idx" ON "institutional_audit_events"("companyId", "occurredAt");

-- CreateIndex
CREATE INDEX "institutional_audit_events_companyId_entityType_entityId_idx" ON "institutional_audit_events"("companyId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "institutional_audit_events_action_idx" ON "institutional_audit_events"("action");

-- CreateIndex
CREATE INDEX "dependency_invalidation_records_companyId_dependentEntityTy_idx" ON "dependency_invalidation_records"("companyId", "dependentEntityType", "dependentEntityId");

-- CreateIndex
CREATE INDEX "dependency_invalidation_records_companyId_sourceEntityType__idx" ON "dependency_invalidation_records"("companyId", "sourceEntityType", "sourceEntityId");

-- AddForeignKey
ALTER TABLE "operative_authority_snapshots" ADD CONSTRAINT "operative_authority_snapshots_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_retrieval_manifests" ADD CONSTRAINT "context_retrieval_manifests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_evidence_bundles" ADD CONSTRAINT "financial_evidence_bundles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utilization_completeness_records" ADD CONSTRAINT "utilization_completeness_records_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capacity_calculation_records" ADD CONSTRAINT "capacity_calculation_records_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_simulation_records" ADD CONSTRAINT "transaction_simulation_records_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institutional_audit_events" ADD CONSTRAINT "institutional_audit_events_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dependency_invalidation_records" ADD CONSTRAINT "dependency_invalidation_records_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
