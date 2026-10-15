-- Standalone Headroom flywheel: Neon source-of-record for learned rulesets,
-- distributed run lock, run history, and fail-closed alerts.
-- Additive only. Never ContractRule / certification.

CREATE TABLE "learning_rulesets" (
  "id" TEXT NOT NULL,
  "rulesetVersion" INTEGER NOT NULL,
  "authorityStatus" TEXT NOT NULL DEFAULT 'COMPUTED_NOT_CERTIFIED',
  "schemaVersion" TEXT NOT NULL,
  "payloadJson" JSONB NOT NULL,
  "acceptedCount" INTEGER NOT NULL DEFAULT 0,
  "writtenFromEpoch" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "learning_rulesets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "learning_rulesets_rulesetVersion_key" ON "learning_rulesets"("rulesetVersion");
CREATE INDEX "learning_rulesets_updatedAt_idx" ON "learning_rulesets"("updatedAt");

CREATE TABLE "learning_ruleset_partial_accepts" (
  "id" TEXT NOT NULL,
  "targetRulesetVersion" INTEGER NOT NULL,
  "ruleId" TEXT NOT NULL,
  "candidateIndex" INTEGER NOT NULL,
  "epoch" INTEGER NOT NULL,
  "epochRunId" TEXT NOT NULL,
  "payloadJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "learning_ruleset_partial_accepts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "learning_ruleset_partial_accepts_target_rule_key"
  ON "learning_ruleset_partial_accepts"("targetRulesetVersion", "ruleId");
CREATE INDEX "learning_ruleset_partial_accepts_target_idx"
  ON "learning_ruleset_partial_accepts"("targetRulesetVersion");

CREATE TABLE "flywheel_locks" (
  "lockName" TEXT NOT NULL,
  "holderId" TEXT NOT NULL,
  "acquiredAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "heartbeatAt" TIMESTAMP(3) NOT NULL,
  "metaJson" JSONB,

  CONSTRAINT "flywheel_locks_pkey" PRIMARY KEY ("lockName")
);

CREATE TABLE "flywheel_runs" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "slice" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "finishedAt" TIMESTAMP(3),
  "epoch" INTEGER,
  "sourcesProcessed" INTEGER NOT NULL DEFAULT 0,
  "candidatesEvaluated" INTEGER NOT NULL DEFAULT 0,
  "proposalsAccepted" INTEGER NOT NULL DEFAULT 0,
  "proposalsRejected" INTEGER NOT NULL DEFAULT 0,
  "errorRateByClassJson" JSONB,
  "detailJson" JSONB,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "flywheel_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "flywheel_runs_runId_key" ON "flywheel_runs"("runId");
CREATE INDEX "flywheel_runs_startedAt_idx" ON "flywheel_runs"("startedAt");
CREATE INDEX "flywheel_runs_status_idx" ON "flywheel_runs"("status");
CREATE INDEX "flywheel_runs_slice_idx" ON "flywheel_runs"("slice");

CREATE TABLE "flywheel_alerts" (
  "id" TEXT NOT NULL,
  "alertId" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "runId" TEXT,
  "detailJson" JSONB,
  "ackedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "flywheel_alerts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "flywheel_alerts_alertId_key" ON "flywheel_alerts"("alertId");
CREATE INDEX "flywheel_alerts_createdAt_idx" ON "flywheel_alerts"("createdAt");
CREATE INDEX "flywheel_alerts_kind_idx" ON "flywheel_alerts"("kind");
