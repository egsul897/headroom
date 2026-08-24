-- CreateTable
CREATE TABLE "debt_tranches" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "financialSnapshotId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(18,6) NOT NULL,
    "secured" BOOLEAN NOT NULL,
    "documentName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "debt_tranches_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "debt_tranches" ADD CONSTRAINT "debt_tranches_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_tranches" ADD CONSTRAINT "debt_tranches_financialSnapshotId_fkey" FOREIGN KEY ("financialSnapshotId") REFERENCES "financial_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
