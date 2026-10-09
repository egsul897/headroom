-- Cursor-first durable document bytes in PostgreSQL (BYTEA).
-- Content-addressed by SHA-256; opaque storageRef = pgbytea:v1:<hash>.
-- Additive only. Does not alter KnowledgeSource registry semantics.
-- DO NOT apply until explicitly authorized (prisma migrate deploy).

CREATE TABLE "document_byte_objects" (
    "id" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "contentType" TEXT NOT NULL,
    "namespace" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_byte_objects_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_byte_objects_contentHash_key" ON "document_byte_objects"("contentHash");
CREATE INDEX "document_byte_objects_namespace_idx" ON "document_byte_objects"("namespace");
CREATE INDEX "document_byte_objects_byteSize_idx" ON "document_byte_objects"("byteSize");
