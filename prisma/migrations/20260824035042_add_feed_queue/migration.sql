-- CreateEnum
CREATE TYPE "feed_queue_kind" AS ENUM ('SNAPSHOT_UPDATE', 'LEDGER_ENTRY');

-- CreateEnum
CREATE TYPE "feed_queue_status" AS ENUM ('PENDING', 'APPLIED', 'DISMISSED');

-- CreateTable
CREATE TABLE "feed_queue_items" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "filedDate" TIMESTAMP(3) NOT NULL,
    "kind" "feed_queue_kind" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "feed_queue_status" NOT NULL DEFAULT 'PENDING',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feed_queue_items_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "feed_queue_items" ADD CONSTRAINT "feed_queue_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
