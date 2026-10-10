/**
 * Server-only Phase 4C attribution loader (Prisma).
 * Do not import from client components.
 */
import { prisma } from "@/lib/prisma";
import { loadLedgerUsagesFromPrisma } from "@/lib/contract-model/north-star-bridge";
import {
  indexAttributedUsages,
  type AttributedUtilizationIndex,
} from "@/lib/product/unified-position/attributed-utilization";

export async function loadAttributedUtilization(companyId: string): Promise<AttributedUtilizationIndex> {
  const usages = await loadLedgerUsagesFromPrisma(prisma, companyId);
  return indexAttributedUsages(companyId, usages);
}
