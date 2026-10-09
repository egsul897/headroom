-- NS-4: Phase 4B-compatible append-only approved financial snapshot store.
-- Distinct from legacy financial_snapshots. Additive only.

CREATE TABLE "contract_input_snapshots" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "asOf" TEXT,
    "reportingPeriod" TEXT,
    "status" TEXT NOT NULL,
    "supersedesSnapshotId" TEXT,
    "provenanceJson" JSONB NOT NULL,
    "reviewedBy" TEXT,
    "reviewedAt" TEXT,
    "approvalRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_input_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contract_input_snapshots_snapshotId_key" ON "contract_input_snapshots"("snapshotId");
CREATE INDEX "contract_input_snapshots_companyId_status_idx" ON "contract_input_snapshots"("companyId", "status");
CREATE INDEX "contract_input_snapshots_companyId_reportingPeriod_idx" ON "contract_input_snapshots"("companyId", "reportingPeriod");

CREATE TABLE "contract_input_facts" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "identityJson" JSONB NOT NULL,
    "valueJson" JSONB NOT NULL,
    "displayName" TEXT,
    "sourceVersion" TEXT,
    "overridesDefinitionId" TEXT,
    "note" TEXT,

    CONSTRAINT "contract_input_facts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "contract_input_facts_snapshotId_idx" ON "contract_input_facts"("snapshotId");

CREATE TABLE "contract_input_fact_locators" (
    "id" TEXT NOT NULL,
    "factId" TEXT NOT NULL,
    "sourceDocumentId" TEXT,
    "sourceVersionHash" TEXT,
    "locatorJson" JSONB,

    CONSTRAINT "contract_input_fact_locators_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "contract_input_fact_locators_factId_idx" ON "contract_input_fact_locators"("factId");
CREATE INDEX "contract_input_fact_locators_sourceDocumentId_idx" ON "contract_input_fact_locators"("sourceDocumentId");

CREATE TABLE "contract_input_snapshot_events" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "snapshotId" TEXT,
    "companyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_input_snapshot_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contract_input_snapshot_events_eventId_key" ON "contract_input_snapshot_events"("eventId");
CREATE INDEX "contract_input_snapshot_events_companyId_at_idx" ON "contract_input_snapshot_events"("companyId", "at");
CREATE INDEX "contract_input_snapshot_events_snapshotId_idx" ON "contract_input_snapshot_events"("snapshotId");

ALTER TABLE "contract_input_facts" ADD CONSTRAINT "contract_input_facts_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "contract_input_snapshots"("snapshotId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contract_input_fact_locators" ADD CONSTRAINT "contract_input_fact_locators_factId_fkey" FOREIGN KEY ("factId") REFERENCES "contract_input_facts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contract_input_snapshot_events" ADD CONSTRAINT "contract_input_snapshot_events_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "contract_input_snapshots"("snapshotId") ON DELETE SET NULL ON UPDATE CASCADE;
