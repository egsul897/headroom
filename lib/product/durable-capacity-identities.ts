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

/**
 * Remaining call sites for full product integration.
 * Gate: assessSsrPersistedExecutionReadiness / assessCurrentSsrEntrypointShape.
 */
export const REMAINING_PRODUCT_DURABLE_WIRING_CALL_SITES = [
  "MISSING_TENANT_AUTH — no lib/auth / session / companyScope (app/page.tsx documents this)",
  "MISSING_VERIFIED_EXECUTION_PACKAGE — SSR passes verifiedPackage: null today",
  "app/[companyId]/position/page.tsx — still getCompanyDashboard/buildPositionView",
  "lib/ask/shell-runner.ts + app/api/ask/route.ts — attemptCertifiedTransaction only",
  "app/[companyId]/simulate/page.tsx — attemptVerifiedSimulate(verifiedPackage:null)",
  "Assemble UnifiedTransactionExecutionRequest then executeAndPersist only when gate.mayCallExecuteAndPersist",
] as const;
