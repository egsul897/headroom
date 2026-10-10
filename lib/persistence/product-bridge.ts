/**
 * Thin product bridge for institutional persistence (P5 starter).
 *
 * Wraps pure builders → durable Neon writes without rewriting engines.
 * Callers that already compute OperativeHandoffBundle / CovenantContextBundle /
 * simulation results can opt into durability here.
 */
import type { PrismaClient } from "@prisma/client";
import type { OperativeHandoffBundle } from "@/lib/contract-model/compiler/package-graph/operative-handoff";
import type { CovenantContextBundle } from "@/lib/contract-model/compiler/context-retrieval/types";
import { persistOperativeAuthoritySnapshot } from "./operative-authority";
import { persistContextRetrievalManifest } from "./context-manifest";
import { persistTransactionSimulation } from "./simulation";
import { persistCapacityCalculation } from "./capacity-calculation";
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
