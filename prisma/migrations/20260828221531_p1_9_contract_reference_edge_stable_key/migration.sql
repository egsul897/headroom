-- Phase 3F.1.4 (P1-9 remediation): content-derived identity for
-- ContractReferenceEdge, populated only by persistStructuralReferences
-- (lib/contract-model/compiler/persistence.ts). Nullable - the LLM-candidate
-- path (persistReferences) is out of this remediation's scope and never
-- sets it; Postgres treats multiple NULLs as non-colliding under a unique
-- index, so this never constrains that other path.
-- AlterTable
ALTER TABLE "contract_reference_edges" ADD COLUMN     "stableKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "contract_reference_edges_companyId_stableKey_key" ON "contract_reference_edges"("companyId", "stableKey");
