-- CreateEnum
CREATE TYPE "analysis_run_status" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'COMPLETED_WITH_REVIEW', 'FAILED');

-- CreateTable
CREATE TABLE "analysis_runs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "packageKey" TEXT NOT NULL,
    "documentIds" TEXT[],
    "analysisAlgorithmVersion" TEXT NOT NULL,
    "status" "analysis_run_status" NOT NULL DEFAULT 'PENDING',
    "currentStage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "fatalError" JSONB,
    "reviewItemCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analysis_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "analysis_runs_companyId_status_idx" ON "analysis_runs"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "analysis_runs_companyId_packageKey_analysisAlgorithmVersion_key" ON "analysis_runs"("companyId", "packageKey", "analysisAlgorithmVersion");

-- AddForeignKey
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
