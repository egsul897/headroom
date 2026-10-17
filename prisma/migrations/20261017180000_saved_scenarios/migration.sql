-- Grok: saved Simulate scenarios (PR 414 SavedScenario). Additive only.
-- NOT applied to Neon by this PR; Egzon applies migrations.
-- CreateTable
CREATE TABLE "saved_scenarios" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lines" JSONB NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "asOfDate" TIMESTAMP(3),
    "financialStateId" TEXT,
    "financialStateUpdatedAt" TIMESTAMP(3),
    "engineVersion" TEXT,

    CONSTRAINT "saved_scenarios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_scenarios_companyId_savedAt_idx" ON "saved_scenarios"("companyId", "savedAt");

