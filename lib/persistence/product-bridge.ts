/**
 * Thin product bridge for institutional persistence (P5).
 *
 * Wraps pure builders → durable Neon writes without rewriting engines.
 * Callers that already compute OperativeHandoffBundle / CovenantContextBundle /
 * Agent #9 financial/utilization outputs / simulation results can opt into durability here.
 */
import type { PrismaClient } from "@prisma/client";
import type { OperativeHandoffBundle } from "@/lib/contract-model/compiler/package-graph/operative-handoff";
import type { CovenantContextBundle } from "@/lib/contract-model/compiler/context-retrieval/types";
import type {
  AuthenticatedFinancialSnapshotEvidence,
  FinancialMetricKey,
} from "@/lib/capacity/financial-evidence";
import type { UtilizationReconstructionResult } from "@/lib/capacity/utilization-evidence-reconstruction";
import type { TrustedIssuerAuthorizationContext } from "@/lib/capacity/completeness-issuer-auth";
import {
  buildVerifiedCapacityInputHandoff,
  mayUseAsProductionCapacityInput,
} from "@/lib/capacity/verified-input-contract";
import { persistOperativeAuthoritySnapshot } from "./operative-authority";
import { persistContextRetrievalManifest } from "./context-manifest";
import { persistTransactionSimulation } from "./simulation";
import { persistCapacityCalculation } from "./capacity-calculation";
import {
  persistFinancialEvidenceBundle,
  loadFinancialEvidenceSnapshot,
  revalidatePersistedFinancialEvidence,
  type FinancialIngestionAuditSidecar,
} from "./financial-evidence";
import {
  persistUtilizationReconstruction,
  loadUtilizationReconstructionEnvelope,
  evaluatePersistedUtilizationAuthority,
} from "./utilization-reconstruction";
import { persistVerifiedCapacityInputSnapshot } from "./verified-capacity-input";
import { invalidateDependentArtifacts } from "./invalidation";
import type { ActorProvenance } from "./types";
import type { IntelligenceAuthorityClass } from "@prisma/client";

/** Persist an already-built operative handoff (does not recompute). */
export async function durablyRememberOperativeHandoff(
  prisma: PrismaClient,
  bundle: OperativeHandoffBundle,
  actor?: ActorProvenance,
) {
  return persistOperativeAuthoritySnapshot(prisma, { bundle, actor });
}

/** Persist an already-built context bundle (does not recompute). */
export async function durablyRememberContextManifest(
  prisma: PrismaClient,
  bundle: CovenantContextBundle,
  actor?: ActorProvenance,
) {
  return persistContextRetrievalManifest(prisma, { bundle, actor });
}

/** Persist a hypothetical simulation result without ledger mutation. */
export async function durablyRememberSimulation(
  prisma: PrismaClient,
  args: {
    companyId: string;
    simulationId: string;
    simulationHash: string;
    transactionId: string;
    transactionHash: string;
    simulationStatus: string;
    result: unknown;
    proposedEffects?: unknown;
    postStateIdentity?: unknown;
    actor?: ActorProvenance;
  },
) {
  return persistTransactionSimulation(prisma, { ...args, mutatesActualLedger: false });
}

/** Persist a capacity calculation / refusal snapshot. */
export async function durablyRememberCapacityCalculation(
  prisma: PrismaClient,
  args: {
    companyId: string;
    calculationId: string;
    asOfDate: string;
    authorityClass: IntelligenceAuthorityClass;
    calculationStatus: string;
    request: unknown;
    capacityOutput?: unknown;
    missingInputs?: unknown;
    refusalReasons?: unknown;
    operativeAuthoritySnapshotId?: string | null;
    verifiedIrIdentity?: string | null;
    financialSnapshotIdentity?: string | null;
    utilizationSnapshotIdentity?: string | null;
    actor?: ActorProvenance;
  },
) {
  return persistCapacityCalculation(prisma, args);
}

/**
 * After normalizeFinancialStatementEvidence (ok), persist metrics + ingestion sidecar.
 * Stored evidence is not trusted until revalidatePersistedFinancialEvidence.
 */
export async function durablyRememberFinancialEvidence(
  prisma: PrismaClient,
  args: {
    companyId: string;
    bundleKey: string;
    snapshot: AuthenticatedFinancialSnapshotEvidence;
    ingestionAudit?: FinancialIngestionAuditSidecar;
    claimedReviewerLabel?: string | null;
    actor?: ActorProvenance;
  },
) {
  return persistFinancialEvidenceBundle(prisma, {
    companyId: args.companyId,
    bundleKey: args.bundleKey,
    asOfDate: args.snapshot.asOf,
    metrics: [...args.snapshot.metrics],
    snapshot: {
      companyId: args.snapshot.companyId,
      asOf: args.snapshot.asOf,
      reportingPeriod: args.snapshot.reportingPeriod,
      currency: args.snapshot.currency,
      provenanceId: args.snapshot.provenanceId,
    },
    ingestionAudit: args.ingestionAudit,
    claimedReviewerLabel: args.claimedReviewerLabel,
    actor: args.actor ?? { kind: "SYSTEM", component: "persistence.product-bridge.financial" },
  });
}

/**
 * Persist reconstruction envelope + project attributed usages to ContractLedgerUsage.
 * Optionally persists completeness certificate when structurally reviewer-confirmed.
 */
export async function durablyRememberUtilizationReconstruction(
  prisma: PrismaClient,
  args: {
    companyId: string;
    result: UtilizationReconstructionResult;
    instrumentKey?: string;
    persistCompletenessCertificate?: boolean;
    actor?: ActorProvenance;
  },
) {
  return persistUtilizationReconstruction(prisma, {
    companyId: args.companyId,
    result: args.result,
    instrumentKey: args.instrumentKey,
    persistCompletenessCertificate: args.persistCompletenessCertificate,
    actor: args.actor ?? { kind: "SYSTEM", component: "persistence.product-bridge.utilization" },
  });
}

/**
 * End-to-end durable pathway:
 * load financial → revalidate → load reconstruction → build handoff → persist snapshot.
 * Does not change the canonical solver.
 */
export async function durablyBuildAndRememberVerifiedCapacityInput(
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
    allowSynthetic?: boolean;
    allowCallerStipulated?: boolean;
    actor?: ActorProvenance;
  },
) {
  const revalidated = await revalidatePersistedFinancialEvidence(prisma, {
    companyId: args.companyId,
    bundleKey: args.financialBundleKey,
    requiredFinancialMetrics: args.requiredFinancialMetrics,
    evaluationAsOf: args.evaluationAsOf,
    trustedIssuerAuth: args.trustedIssuerAuth,
    allowSynthetic: args.allowSynthetic,
    allowCallerStipulated: args.allowCallerStipulated,
  });
  if (!revalidated.loaded) {
    return {
      ok: false as const,
      handoff: null,
      persisted: null,
      mayUseAsProduction: false,
      blockers: revalidated.blockers,
    };
  }

  const util = await loadUtilizationReconstructionEnvelope(
    prisma,
    args.companyId,
    args.capacityRuleId,
  );
  if (!util) {
    return {
      ok: false as const,
      handoff: null,
      persisted: null,
      mayUseAsProduction: false,
      blockers: [
        ...revalidated.blockers,
        `no durable utilization reconstruction for capacityRuleId=${args.capacityRuleId}`,
      ],
    };
  }

  // Rebuild utilization handoff from durable envelope records (not invented).
  const utilHandoff = {
    capacityRuleId: util.envelope.capacityRuleId,
    asOf: util.envelope.asOf,
    currency: util.envelope.evidenceObserved[0]?.currency ?? util.envelope.usageAttributed[0]?.currency ?? "USD",
    records: util.envelope.utilizationRecords,
    completenessCertificate: util.envelope.completenessCertificate,
  };
  const handoff = buildVerifiedCapacityInputHandoff({
    companyId: args.companyId,
    evaluationAsOf: args.evaluationAsOf,
    financial: revalidated.loaded.snapshot,
    requiredFinancialMetrics: args.requiredFinancialMetrics,
    utilization: utilHandoff,
    trustedIssuerAuth: args.trustedIssuerAuth,
    allowSynthetic: args.allowSynthetic,
    allowCallerStipulated: args.allowCallerStipulated,
  });

  const persisted = await persistVerifiedCapacityInputSnapshot(prisma, {
    companyId: args.companyId,
    handoff,
    calculationId: args.calculationId,
    operativeAuthoritySnapshotId: args.operativeAuthoritySnapshotId,
    verifiedIrIdentity: args.verifiedIrIdentity,
    financialSnapshotIdentity: revalidated.loaded.contentHash,
    utilizationSnapshotIdentity: util.envelope.contentHash,
    actor: args.actor,
  });

  return {
    ok: true as const,
    handoff,
    persisted,
    mayUseAsProduction: mayUseAsProductionCapacityInput(handoff),
    blockers: handoff.blockers,
  };
}

/**
 * Invalidate capacity calculations that depend on a revised financial bundle.
 * Historical rows retained as STALE.
 */
export async function invalidateCapacityAfterFinancialRevision(
  prisma: PrismaClient,
  args: {
    companyId: string;
    financialBundleId: string;
    dependentCapacityCalculationIds: string[];
    reason: string;
    sourceFingerprintBefore?: string | null;
    sourceFingerprintAfter?: string | null;
    actor?: ActorProvenance;
  },
) {
  return invalidateDependentArtifacts(prisma, {
    companyId: args.companyId,
    sourceEntityType: "FinancialEvidenceBundle",
    sourceEntityId: args.financialBundleId,
    dependents: args.dependentCapacityCalculationIds.map((entityId) => ({
      entityType: "CapacityCalculationRecord" as const,
      entityId,
    })),
    reason: args.reason,
    sourceFingerprintBefore: args.sourceFingerprintBefore,
    sourceFingerprintAfter: args.sourceFingerprintAfter,
    actor: args.actor,
    markAs: "STALE",
  });
}

/**
 * Invalidate capacity calculations after completeness certificate revoke.
 */
export async function invalidateCapacityAfterCompletenessRevoke(
  prisma: PrismaClient,
  args: {
    companyId: string;
    completenessRecordId: string;
    dependentCapacityCalculationIds: string[];
    reason: string;
    actor?: ActorProvenance;
  },
) {
  return invalidateDependentArtifacts(prisma, {
    companyId: args.companyId,
    sourceEntityType: "UtilizationCompletenessRecord",
    sourceEntityId: args.completenessRecordId,
    dependents: args.dependentCapacityCalculationIds.map((entityId) => ({
      entityType: "CapacityCalculationRecord" as const,
      entityId,
    })),
    reason: args.reason,
    actor: args.actor,
    markAs: "INVALIDATED",
  });
}

/** Re-export loaders used by Position / Ask / Simulate durable identity references. */
export {
  loadFinancialEvidenceSnapshot,
  revalidatePersistedFinancialEvidence,
  loadUtilizationReconstructionEnvelope,
  evaluatePersistedUtilizationAuthority,
};

export type DurableCapacityIdentityRefs = {
  companyId: string;
  financialBundleKey: string;
  financialSnapshotIdentity: string | null;
  utilizationSnapshotIdentity: string | null;
  capacityCalculationId: string | null;
  capacityInputHash: string | null;
  unknownHistoricalActivity: boolean;
  mayUseAsProduction: boolean;
};

/**
 * Maximum independently testable product wiring slice:
 * Resolve durable evidence/calculation identities for Position / Ask / Simulate
 * without changing the canonical solver. Surfaces share the same identities.
 */
export async function resolveDurableCapacityIdentitiesForProduct(
  prisma: PrismaClient,
  args: {
    companyId: string;
    financialBundleKey: string;
    capacityRuleId: string;
    capacityCalculationId?: string;
  },
): Promise<DurableCapacityIdentityRefs> {
  const fin = await loadFinancialEvidenceSnapshot(prisma, args.companyId, args.financialBundleKey);
  const utilAuth = await evaluatePersistedUtilizationAuthority(prisma, {
    companyId: args.companyId,
    capacityRuleId: args.capacityRuleId,
  });
  let capacityCalculationId: string | null = null;
  let capacityInputHash: string | null = null;
  if (args.capacityCalculationId) {
    const { getLatestAuthorizedCapacityCalculation } = await import("./capacity-calculation");
    const calc = await getLatestAuthorizedCapacityCalculation(
      prisma,
      args.companyId,
      args.capacityCalculationId,
    );
    if (calc && calc.status === "ACTIVE") {
      capacityCalculationId = calc.calculationId;
      capacityInputHash = calc.inputHash;
    }
  }
  return {
    companyId: args.companyId,
    financialBundleKey: args.financialBundleKey,
    financialSnapshotIdentity: fin?.contentHash ?? null,
    utilizationSnapshotIdentity: utilAuth.envelope?.contentHash ?? null,
    capacityCalculationId,
    capacityInputHash,
    unknownHistoricalActivity: utilAuth.unknownHistoricalActivity,
    mayUseAsProduction: false, // dual gates BLOCKED
  };
}
