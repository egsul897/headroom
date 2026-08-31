-- CreateEnum
CREATE TYPE "semantic_truth_kind" AS ENUM ('RULE', 'DEFINITION');

-- CreateEnum
CREATE TYPE "semantic_truth_trust_status" AS ENUM ('COMPILED', 'VERIFIED', 'REVIEW_REQUIRED', 'CONTRADICTED', 'UNSUPPORTED');

-- AlterEnum
ALTER TYPE "analysis_run_status" ADD VALUE 'PARTIAL';

-- CreateTable
CREATE TABLE "analysis_run_issues" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "instrumentKey" TEXT NOT NULL,
    "documentIds" TEXT[],
    "failedStage" TEXT NOT NULL,
    "errorClass" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analysis_run_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_failure_logs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "triggeringDocumentId" TEXT,
    "stage" TEXT NOT NULL,
    "errorClass" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analysis_failure_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "semantic_truth_records" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "packageKey" TEXT,
    "instrumentKey" TEXT NOT NULL,
    "analysisRunId" TEXT,
    "kind" "semantic_truth_kind" NOT NULL,
    "semanticObjectId" TEXT NOT NULL,
    "candidateRef" TEXT,
    "sourceDocumentId" TEXT NOT NULL,
    "sourceSectionRef" TEXT,
    "sourceCitation" TEXT,
    "sourceExcerpt" TEXT,
    "irSchemaVersion" TEXT NOT NULL,
    "compilerAlgorithmVersion" TEXT NOT NULL,
    "compilerPromptVersion" TEXT NOT NULL,
    "toolPolicyVersion" TEXT NOT NULL,
    "verifierAlgorithmVersion" TEXT,
    "verifierPromptVersion" TEXT,
    "verificationStatus" TEXT,
    "trustStatus" "semantic_truth_trust_status" NOT NULL,
    "sufficiency" TEXT NOT NULL,
    "sufficiencyReasons" TEXT[],
    "operativeLineage" JSONB,
    "findingsSummary" JSONB,
    "payloadSchemaVersion" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "semantic_truth_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "analysis_run_issues_companyId_idx" ON "analysis_run_issues"("companyId");

-- CreateIndex
CREATE INDEX "analysis_run_issues_runId_idx" ON "analysis_run_issues"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "analysis_run_issues_runId_instrumentKey_key" ON "analysis_run_issues"("runId", "instrumentKey");

-- CreateIndex
CREATE INDEX "analysis_failure_logs_companyId_createdAt_idx" ON "analysis_failure_logs"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "semantic_truth_records_companyId_trustStatus_idx" ON "semantic_truth_records"("companyId", "trustStatus");

-- CreateIndex
CREATE INDEX "semantic_truth_records_companyId_instrumentKey_idx" ON "semantic_truth_records"("companyId", "instrumentKey");

-- CreateIndex
CREATE INDEX "semantic_truth_records_analysisRunId_idx" ON "semantic_truth_records"("analysisRunId");

-- CreateIndex
CREATE UNIQUE INDEX "semantic_truth_records_companyId_instrumentKey_kind_semanti_key" ON "semantic_truth_records"("companyId", "instrumentKey", "kind", "semanticObjectId");

-- AddForeignKey
ALTER TABLE "analysis_run_issues" ADD CONSTRAINT "analysis_run_issues_runId_fkey" FOREIGN KEY ("runId") REFERENCES "analysis_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_run_issues" ADD CONSTRAINT "analysis_run_issues_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_failure_logs" ADD CONSTRAINT "analysis_failure_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semantic_truth_records" ADD CONSTRAINT "semantic_truth_records_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semantic_truth_records" ADD CONSTRAINT "semantic_truth_records_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "analysis_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
