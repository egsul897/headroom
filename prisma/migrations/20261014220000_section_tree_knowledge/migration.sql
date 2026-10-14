-- Section-tree knowledge for the deterministic agreement pipeline. ADDITIVE ONLY: no DROP / DELETE / TRUNCATE.
-- kf_tree_parses / kf_tree_nodes / kf_tree_xrefs / kf_tree_checklist / kf_agreement_pipeline_results /
-- kf_scoreboard_runs / kf_scoreboard_findings already exist in Neon (created by the backfill script before this
-- migration); IF NOT EXISTS makes this migration a no-op for them and creates them elsewhere.
-- Customer uploads live ONLY in customer_* tables, scoped by (companyId, documentId).

CREATE TABLE IF NOT EXISTS "kf_tree_parses" (
  "textSha256" TEXT NOT NULL, "parserVersion" TEXT NOT NULL, "sourceId" TEXT NOT NULL, "basis" TEXT NOT NULL,
  "verification" TEXT, "textLength" INTEGER NOT NULL, "nodeCount" INTEGER NOT NULL, "xrefCount" INTEGER NOT NULL,
  "checklistCount" INTEGER NOT NULL, "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "kf_tree_parses_pkey" PRIMARY KEY ("textSha256", "parserVersion"));
CREATE INDEX IF NOT EXISTS "kf_tree_parses_source" ON "kf_tree_parses" ("sourceId");

CREATE TABLE IF NOT EXISTS "kf_tree_nodes" (
  "textSha256" TEXT NOT NULL, "parserVersion" TEXT NOT NULL, "nodeId" TEXT NOT NULL, "parentId" TEXT,
  "kind" TEXT NOT NULL, "label" TEXT, "path" TEXT, "sectionNumber" TEXT, "title" TEXT, "level" TEXT,
  "start" INTEGER NOT NULL, "headingEnd" INTEGER NOT NULL, "end" INTEGER NOT NULL, "depth" INTEGER NOT NULL,
  "status" TEXT NOT NULL, "role" TEXT, "issues" JSONB NOT NULL DEFAULT '[]',
  CONSTRAINT "kf_tree_nodes_pkey" PRIMARY KEY ("textSha256", "parserVersion", "nodeId"));

CREATE TABLE IF NOT EXISTS "kf_tree_xrefs" (
  "textSha256" TEXT NOT NULL, "parserVersion" TEXT NOT NULL, "ord" INTEGER NOT NULL, "fromNodeId" TEXT NOT NULL,
  "at" INTEGER NOT NULL, "raw" TEXT NOT NULL, "target" TEXT NOT NULL, "status" TEXT NOT NULL, "targetNodeId" TEXT,
  CONSTRAINT "kf_tree_xrefs_pkey" PRIMARY KEY ("textSha256", "parserVersion", "ord"));

CREATE TABLE IF NOT EXISTS "kf_tree_xref_spans" (
  "textSha256" TEXT NOT NULL, "parserVersion" TEXT NOT NULL, "spanStart" INTEGER NOT NULL, "spanEnd" INTEGER NOT NULL,
  "spanSha256" TEXT NOT NULL, "fromNodeId" TEXT NOT NULL, "raw" TEXT NOT NULL, "target" TEXT NOT NULL,
  "status" TEXT NOT NULL, "targetNodeId" TEXT,
  CONSTRAINT "kf_tree_xref_spans_pkey" PRIMARY KEY ("textSha256", "parserVersion", "spanStart", "spanEnd", "spanSha256"));

CREATE TABLE IF NOT EXISTS "kf_tree_checklist" (
  "textSha256" TEXT NOT NULL, "parserVersion" TEXT NOT NULL, "family" TEXT NOT NULL, "status" TEXT NOT NULL,
  "sectionPaths" JSONB NOT NULL, "parts" JSONB NOT NULL, "needsInputs" JSONB NOT NULL, "note" TEXT,
  CONSTRAINT "kf_tree_checklist_pkey" PRIMARY KEY ("textSha256", "parserVersion", "family"));

CREATE TABLE IF NOT EXISTS "kf_agreement_pipeline_results" (
  "textSha256" TEXT NOT NULL, "parserVersion" TEXT NOT NULL, "pipelineVersion" TEXT NOT NULL, "sourceId" TEXT NOT NULL,
  "companyId" TEXT, "documentId" TEXT, "stats" JSONB NOT NULL, "families" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "kf_agreement_pipeline_results_pkey" PRIMARY KEY ("textSha256", "parserVersion", "pipelineVersion", "sourceId"));

CREATE TABLE IF NOT EXISTS "kf_scoreboard_runs" (
  "runId" TEXT NOT NULL, "gitCommit" TEXT NOT NULL, "rulesLabel" TEXT NOT NULL, "rulesetVersion" TEXT,
  "tree" BOOLEAN NOT NULL, "snapshotSha256" TEXT NOT NULL, "totals" JSONB NOT NULL, "findingCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "kf_scoreboard_runs_pkey" PRIMARY KEY ("runId"));

CREATE TABLE IF NOT EXISTS "kf_scoreboard_findings" (
  "runId" TEXT NOT NULL, "sourceId" TEXT NOT NULL, "ord" INTEGER NOT NULL, "textSha256" TEXT, "split" TEXT NOT NULL,
  "class" TEXT NOT NULL, "key" TEXT, "family" TEXT, "sectionRef" TEXT, "excerpt" TEXT, "message" TEXT,
  CONSTRAINT "kf_scoreboard_findings_pkey" PRIMARY KEY ("runId", "sourceId", "ord"));

CREATE TABLE IF NOT EXISTS "kf_scoreboard_finding_items" (
  "runId" TEXT NOT NULL, "sourceId" TEXT NOT NULL, "findingSha" TEXT NOT NULL, "occurrence" INTEGER NOT NULL,
  "textSha256" TEXT, "split" TEXT NOT NULL, "class" TEXT NOT NULL, "key" TEXT, "family" TEXT, "sectionRef" TEXT,
  "excerpt" TEXT, "message" TEXT,
  CONSTRAINT "kf_scoreboard_finding_items_pkey" PRIMARY KEY ("runId", "sourceId", "findingSha", "occurrence"));

CREATE TABLE IF NOT EXISTS "customer_agreement_runs" (
  "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "documentId" TEXT NOT NULL, "sourceId" TEXT NOT NULL,
  "textSha256" TEXT, "parserVersion" TEXT NOT NULL, "pipelineVersion" TEXT NOT NULL, "status" TEXT NOT NULL,
  "error" TEXT, "stats" JSONB, "families" JSONB, "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "customer_agreement_runs_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "customer_agreement_runs_companyId_documentId_idx" ON "customer_agreement_runs" ("companyId", "documentId");

CREATE TABLE IF NOT EXISTS "customer_tree_nodes" (
  "runId" TEXT NOT NULL, "nodeId" TEXT NOT NULL, "parentId" TEXT, "kind" TEXT NOT NULL, "label" TEXT, "path" TEXT,
  "sectionNumber" TEXT, "title" TEXT, "level" TEXT, "start" INTEGER NOT NULL, "headingEnd" INTEGER NOT NULL,
  "end" INTEGER NOT NULL, "depth" INTEGER NOT NULL, "status" TEXT NOT NULL, "role" TEXT, "issues" JSONB NOT NULL DEFAULT '[]',
  CONSTRAINT "customer_tree_nodes_pkey" PRIMARY KEY ("runId", "nodeId"),
  CONSTRAINT "customer_tree_nodes_runId_fkey" FOREIGN KEY ("runId") REFERENCES "customer_agreement_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE);

CREATE TABLE IF NOT EXISTS "customer_tree_xrefs" (
  "runId" TEXT NOT NULL, "spanStart" INTEGER NOT NULL, "spanEnd" INTEGER NOT NULL, "spanSha256" TEXT NOT NULL,
  "fromNodeId" TEXT NOT NULL, "raw" TEXT NOT NULL, "target" TEXT NOT NULL, "status" TEXT NOT NULL, "targetNodeId" TEXT,
  CONSTRAINT "customer_tree_xrefs_pkey" PRIMARY KEY ("runId", "spanStart", "spanEnd", "spanSha256"),
  CONSTRAINT "customer_tree_xrefs_runId_fkey" FOREIGN KEY ("runId") REFERENCES "customer_agreement_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE);

CREATE TABLE IF NOT EXISTS "customer_tree_checklist" (
  "runId" TEXT NOT NULL, "family" TEXT NOT NULL, "status" TEXT NOT NULL, "sectionPaths" JSONB NOT NULL,
  "parts" JSONB NOT NULL, "needsInputs" JSONB NOT NULL, "note" TEXT,
  CONSTRAINT "customer_tree_checklist_pkey" PRIMARY KEY ("runId", "family"),
  CONSTRAINT "customer_tree_checklist_runId_fkey" FOREIGN KEY ("runId") REFERENCES "customer_agreement_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE);
