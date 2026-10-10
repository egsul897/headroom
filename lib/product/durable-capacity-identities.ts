/**
 * Product-surface durable capacity identity wiring (P5 slice).
 *
 * Position / Ask / Simulate may share the same durable financial evidence,
 * utilization reconstruction, and capacity calculation identities without
 * changing the canonical solver.
 *
 * This is the maximum independently testable product integration slice —
 * call sites still need to pass these refs into VTE / capacity views.
 * Dual production activation gates remain BLOCKED.
 */
import type { PrismaClient } from "@prisma/client";
import {
  resolveDurableCapacityIdentitiesForProduct,
  durablyBuildAndRememberVerifiedCapacityInput,
  type DurableCapacityIdentityRefs,
} from "@/lib/persistence";
import type { FinancialMetricKey } from "@/lib/capacity/financial-evidence";
import type { TrustedIssuerAuthorizationContext } from "@/lib/capacity/completeness-issuer-auth";
import type { ActorProvenance } from "@/lib/persistence";

export type { DurableCapacityIdentityRefs };

/** Resolve shared durable identities for Position / Ask / Simulate. */
export async function loadSharedDurableCapacityIdentities(
  prisma: PrismaClient,
  args: {
    companyId: string;
    financialBundleKey: string;
    capacityRuleId: string;
    capacityCalculationId?: string;
  },
): Promise<DurableCapacityIdentityRefs> {
  return resolveDurableCapacityIdentitiesForProduct(prisma, args);
}

/**
 * Build verified capacity input from durable stores and remember the snapshot.
 * Surfaces should reference the returned calculation identities — not invent capacity.
 */
export async function buildSharedVerifiedCapacityInputFromDurable(
  prisma: PrismaClient,
  args: {
    companyId: string;
    financialBundleKey: string;
    capacityRuleId: string;
    requiredFinancialMetrics: readonly FinancialMetricKey[];
    evaluationAsOf: string;
    trustedIssuerAuth?: TrustedIssuerAuthorizationContext | null;
    operativeAuthoritySnapshotId?: string | null;
    verifiedIrIdentity?: string | null;
    calculationId?: string;
    actor?: ActorProvenance;
  },
) {
  return durablyBuildAndRememberVerifiedCapacityInput(prisma, args);
}

/** Remaining call sites for full product integration (documented, not claimed done). */
export const REMAINING_PRODUCT_DURABLE_WIRING_CALL_SITES = [
  "lib/product/unified-position/* — Position capacity row loaders should accept DurableCapacityIdentityRefs",
  "lib/product/north-star-workflow/transaction-analysis.ts — Ask should reference shared calculationId/inputHash",
  "lib/product/verified-transaction-execution/execute.ts — VTE should load financial/utilization identities from Neon before handoff",
  "app/(product) Position/Ask/Simulate route loaders — pass companyId + bundleKey + capacityRuleId into loadSharedDurableCapacityIdentities",
] as const;
