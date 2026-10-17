-- Dashboard EBITDA box snapshots + CFO-confirmed add-back figures. ADDITIVE ONLY: no DROP / DELETE / TRUNCATE.
CREATE TABLE IF NOT EXISTS "customer_ebitda_boxes" (
  "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "documentId" TEXT NOT NULL, "status" TEXT NOT NULL, "version" TEXT NOT NULL,
  "payload" JSONB NOT NULL, "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_ebitda_boxes_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "customer_ebitda_boxes_companyId_documentId_createdAt_idx" ON "customer_ebitda_boxes" ("companyId", "documentId", "createdAt");

CREATE TABLE IF NOT EXISTS "customer_ebitda_confirmations" (
  "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "documentId" TEXT NOT NULL, "inputKey" TEXT NOT NULL, "value" TEXT NOT NULL,
  "source" TEXT NOT NULL, "confirmedBy" TEXT, "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "customer_ebitda_confirmations_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "customer_ebitda_confirmations_companyId_documentId_inputKey_key" ON "customer_ebitda_confirmations" ("companyId", "documentId", "inputKey");
