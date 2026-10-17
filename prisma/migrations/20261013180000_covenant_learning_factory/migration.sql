-- Covenant Learning Factory — additive knowledge / evaluation tables.
-- Automated writers: PROPOSED | REVIEW_REQUIRED only.
-- Never auto-promotes production capacity / APPROVED snapshots / ledger authority.

CREATE TYPE "learning_knowledge_state" AS ENUM (
  'PROPOSED',
  'REVIEW_REQUIRED',
  'VERIFIED',
  'REJECTED',
  'SUPERSEDED'
);

CREATE TYPE "learning_cohort" AS ENUM (
  'TRAIN_DEV',
  'HELD_OUT'
);

CREATE TABLE "learning_packages" (
  "id" TEXT NOT NULL,
  "packageKey" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "issuerCik" TEXT NOT NULL,
  "issuerTicker" TEXT,
  "issuerName" TEXT,
  "cohort" "learning_cohort" NOT NULL,
  "provenance" TEXT NOT NULL,
  "usageRights" TEXT NOT NULL,
  "evaluationOnly" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "learning_packages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "learning_packages_packageKey_key" ON "learning_packages"("packageKey");
CREATE INDEX "learning_packages_issuerCik_idx" ON "learning_packages"("issuerCik");
CREATE INDEX "learning_packages_cohort_idx" ON "learning_packages"("cohort");

CREATE TABLE "learning_runs" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "packageKey" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "codeSha" TEXT NOT NULL,
  "factoryVersion" TEXT NOT NULL,
  "compilerVersion" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "finishedAt" TIMESTAMP(3),
  "manifestJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "learning_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "learning_runs_runId_key" ON "learning_runs"("runId");
CREATE INDEX "learning_runs_packageKey_idx" ON "learning_runs"("packageKey");
CREATE INDEX "learning_runs_status_idx" ON "learning_runs"("status");

ALTER TABLE "learning_runs"
  ADD CONSTRAINT "learning_runs_packageKey_fkey"
  FOREIGN KEY ("packageKey") REFERENCES "learning_packages"("packageKey")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "learning_artifacts" (
  "id" TEXT NOT NULL,
  "artifactId" TEXT NOT NULL,
  "packageKey" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "state" "learning_knowledge_state" NOT NULL,
  "family" TEXT,
  "sourceRefsJson" JSONB NOT NULL,
  "payloadJson" JSONB NOT NULL,
  "compilerVersion" TEXT NOT NULL,
  "modelOrPromptVersion" TEXT,
  "supersedesArtifactId" TEXT,
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "learning_artifacts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "learning_artifacts_artifactId_key" ON "learning_artifacts"("artifactId");
CREATE INDEX "learning_artifacts_packageKey_state_idx" ON "learning_artifacts"("packageKey", "state");
CREATE INDEX "learning_artifacts_runId_idx" ON "learning_artifacts"("runId");
CREATE INDEX "learning_artifacts_kind_idx" ON "learning_artifacts"("kind");

CREATE TABLE "learning_error_ledger_entries" (
  "id" TEXT NOT NULL,
  "errorId" TEXT NOT NULL,
  "packageKey" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "class" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "stage" TEXT NOT NULL,
  "evidenceJson" JSONB,
  "correctiveHistoryJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "learning_error_ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "learning_error_ledger_entries_errorId_key" ON "learning_error_ledger_entries"("errorId");
CREATE INDEX "learning_error_ledger_entries_packageKey_idx" ON "learning_error_ledger_entries"("packageKey");
CREATE INDEX "learning_error_ledger_entries_class_idx" ON "learning_error_ledger_entries"("class");
CREATE INDEX "learning_error_ledger_entries_runId_idx" ON "learning_error_ledger_entries"("runId");

CREATE TABLE "learning_evaluation_outcomes" (
  "id" TEXT NOT NULL,
  "evaluationId" TEXT NOT NULL,
  "packageKey" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "cohort" "learning_cohort" NOT NULL,
  "sourceFidelityPass" BOOLEAN,
  "coverageScore" DOUBLE PRECISION,
  "calculationCorrectness" BOOLEAN,
  "dangerousOmissionCount" INTEGER NOT NULL DEFAULT 0,
  "abstentionCount" INTEGER NOT NULL DEFAULT 0,
  "supportedStructureUnits" INTEGER NOT NULL DEFAULT 0,
  "verifiedExecutableUnits" INTEGER NOT NULL DEFAULT 0,
  "unsupportedUnits" INTEGER NOT NULL DEFAULT 0,
  "refusedExecutableUnits" INTEGER NOT NULL DEFAULT 0,
  "independent" BOOLEAN NOT NULL DEFAULT true,
  "notesJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "learning_evaluation_outcomes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "learning_evaluation_outcomes_evaluationId_key" ON "learning_evaluation_outcomes"("evaluationId");
CREATE INDEX "learning_evaluation_outcomes_packageKey_idx" ON "learning_evaluation_outcomes"("packageKey");
CREATE INDEX "learning_evaluation_outcomes_cohort_idx" ON "learning_evaluation_outcomes"("cohort");

CREATE TABLE "learning_improvement_proposals" (
  "id" TEXT NOT NULL,
  "proposalId" TEXT NOT NULL,
  "packageKey" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "lever" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "bounded" BOOLEAN NOT NULL DEFAULT true,
  "autoApply" BOOLEAN NOT NULL DEFAULT false,
  "evidenceJson" JSONB NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'PROPOSED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "learning_improvement_proposals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "learning_improvement_proposals_proposalId_key" ON "learning_improvement_proposals"("proposalId");
CREATE INDEX "learning_improvement_proposals_packageKey_idx" ON "learning_improvement_proposals"("packageKey");
CREATE INDEX "learning_improvement_proposals_state_idx" ON "learning_improvement_proposals"("state");
