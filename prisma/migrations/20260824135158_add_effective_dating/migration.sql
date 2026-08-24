-- DropIndex
DROP INDEX "covenant_provisions_documentId_code_key";

-- AlterTable
ALTER TABLE "covenant_provisions" ADD COLUMN     "effectiveFrom" TIMESTAMP(3),
ADD COLUMN     "effectiveTo" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "effectiveFrom" TIMESTAMP(3),
ADD COLUMN     "effectiveTo" TIMESTAMP(3),
ADD COLUMN     "supersedesDocumentId" TEXT;

-- CreateIndex
CREATE INDEX "covenant_provisions_documentId_code_idx" ON "covenant_provisions"("documentId", "code");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_supersedesDocumentId_fkey" FOREIGN KEY ("supersedesDocumentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
