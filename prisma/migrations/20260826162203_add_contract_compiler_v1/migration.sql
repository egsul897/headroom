-- CreateEnum
CREATE TYPE "contract_compiler_stage_kind" AS ENUM ('STRUCTURE', 'DEFINITIONS', 'INVENTORY', 'RULE_EXTRACTION', 'DEPENDENCY_RESOLUTION', 'RELATIONSHIPS', 'AMENDMENTS', 'VERIFICATION', 'VALIDATION', 'COVERAGE', 'PROMOTION');

-- CreateEnum
CREATE TYPE "contract_compiler_stage_status" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'BLOCKED', 'REVIEW_REQUIRED');

-- CreateTable
CREATE TABLE "contract_compiler_runs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "packageKey" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "contract_compiler_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_compiler_run_documents" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,

    CONSTRAINT "contract_compiler_run_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_compiler_stages" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stage" "contract_compiler_stage_kind" NOT NULL,
    "status" "contract_compiler_stage_status" NOT NULL DEFAULT 'PENDING',
    "inputHash" TEXT,
    "outputHash" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "telemetry" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "contract_compiler_stages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contract_compiler_runs_companyId_idx" ON "contract_compiler_runs"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_compiler_runs_companyId_packageKey_key" ON "contract_compiler_runs"("companyId", "packageKey");

-- CreateIndex
CREATE UNIQUE INDEX "contract_compiler_run_documents_runId_documentId_key" ON "contract_compiler_run_documents"("runId", "documentId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_compiler_stages_runId_stage_key" ON "contract_compiler_stages"("runId", "stage");

-- AddForeignKey
ALTER TABLE "contract_compiler_runs" ADD CONSTRAINT "contract_compiler_runs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_compiler_run_documents" ADD CONSTRAINT "contract_compiler_run_documents_runId_fkey" FOREIGN KEY ("runId") REFERENCES "contract_compiler_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_compiler_run_documents" ADD CONSTRAINT "contract_compiler_run_documents_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_compiler_stages" ADD CONSTRAINT "contract_compiler_stages_runId_fkey" FOREIGN KEY ("runId") REFERENCES "contract_compiler_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
