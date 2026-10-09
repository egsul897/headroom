-- Phase 4C: append-only contract ledger (capacity usage). Distinct from ledger_entries.

CREATE TABLE "contract_ledger_usages" (
    "id" TEXT NOT NULL,
    "usageId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "instrumentKey" TEXT NOT NULL,
    "effectiveAsOf" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "capacityPathJson" JSONB NOT NULL,
    "transactionRef" TEXT,
    "status" TEXT NOT NULL,
    "supersededByUsageId" TEXT,
    "provenanceJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_ledger_usages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contract_ledger_usages_usageId_key" ON "contract_ledger_usages"("usageId");
CREATE INDEX "contract_ledger_usages_companyId_status_idx" ON "contract_ledger_usages"("companyId", "status");
CREATE INDEX "contract_ledger_usages_companyId_effectiveAsOf_idx" ON "contract_ledger_usages"("companyId", "effectiveAsOf");

CREATE TABLE "contract_ledger_usage_events" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "usageId" TEXT,
    "type" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_ledger_usage_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contract_ledger_usage_events_eventId_key" ON "contract_ledger_usage_events"("eventId");
CREATE INDEX "contract_ledger_usage_events_companyId_at_idx" ON "contract_ledger_usage_events"("companyId", "at");
CREATE INDEX "contract_ledger_usage_events_usageId_idx" ON "contract_ledger_usage_events"("usageId");
