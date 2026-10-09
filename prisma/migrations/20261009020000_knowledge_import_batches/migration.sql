-- Batch import checkpoints for canonical knowledge consolidation.
-- Additive only. Does not alter KnowledgeSource or document_byte_objects.
-- DO NOT apply until explicitly authorized (prisma migrate deploy).

CREATE TABLE "knowledge_import_batches" (
    "id" TEXT NOT NULL,
    "batchKey" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "plannedCount" INTEGER NOT NULL DEFAULT 0,
    "insertedCount" INTEGER NOT NULL DEFAULT 0,
    "reusedCount" INTEGER NOT NULL DEFAULT 0,
    "conflictCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "checkpoint" JSONB,
    "errorSummary" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_import_batches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "knowledge_import_batches_batchKey_key" ON "knowledge_import_batches"("batchKey");
CREATE INDEX "knowledge_import_batches_status_idx" ON "knowledge_import_batches"("status");
CREATE INDEX "knowledge_import_batches_family_idx" ON "knowledge_import_batches"("family");
