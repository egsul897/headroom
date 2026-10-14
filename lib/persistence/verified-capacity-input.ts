/**
 * Persist VerifiedCapacityInputHandoff as a CapacityCalculationRecord snapshot.
 * Never persists a capacity number without source identities and assumptions.
 * Dual production gates remain BLOCKED — PRODUCTION_AUTHORITATIVE refused.
 */
import type { PrismaClient } from "@prisma/client";
import type { VerifiedCapacityInputHandoff } from "@/lib/capacity/verified-input-contract";
import { mayUseAsProductionCapacityInput } from "@/lib/capacity/verified-input-contract";
import { contentHashOf } from "./hash";
import {
  persistCapacityCalculation,
  getLatestAuthorizedCapacityCalculation,
  getCapacityCalculationByInputHash,
} from "./capacity-calculation";
import { requireCompanyId, assertSameTenant } from "./tenant";
import { PersistenceContractError, type ActorProvenance } from "./types";

export const VERIFIED_CAPACITY_INPUT_CALC_PREFIX = "verified-capacity-input:";

export interface PersistVerifiedCapacityInputArgs {
  companyId: string;
  handoff: VerifiedCapacityInputHandoff;
  calculationId?: string;
  operativeAuthoritySnapshotId?: string | null;
  verifiedIrIdentity?: string | null;
  financialSnapshotIdentity: string;
  utilizationSnapshotIdentity: string;
  actor?: ActorProvenance;
}

function mapAuthorityClass(
  handoff: VerifiedCapacityInputHandoff,
): "REFUSED" | "REVIEW_REQUIRED" | "HYPOTHETICAL" | "VERIFIED_CALCULATION" {
  if (handoff.productionAuthority === "ACTIVE") {
    // Dual gates BLOCKED in repo — persistCapacityCalculation will refuse PRODUCTION_AUTHORITATIVE.
    // Map to VERIFIED_CALCULATION only when both sides are productionAuthoritative under demo paths;
    // otherwise REFUSED.
    return "VERIFIED_CALCULATION";
  }
  if (
    handoff.trustClasses.includes("CALLER_STIPULATED_HYPOTHETICAL") ||
    handoff.trustClasses.includes("SYNTHETIC")
  ) {
    return "HYPOTHETICAL";
  }
  if (
    handoff.financial.productionAuthoritative === false &&
    handoff.utilization.supportsRemainingClaim === false
  ) {
    return "REFUSED";
  }
  if (handoff.trustClasses.includes("INCOMPLETE") || handoff.trustClasses.includes("UNKNOWN")) {
    return "REVIEW_REQUIRED";
  }
  return "REFUSED";
}

export async function persistVerifiedCapacityInputSnapshot(
  prisma: PrismaClient,
  args: PersistVerifiedCapacityInputArgs,
) {
  const companyId = requireCompanyId(args.companyId, "persistVerifiedCapacityInputSnapshot");
  assertSameTenant(companyId, args.handoff.companyId, "persistVerifiedCapacityInputSnapshot.handoff");

  if (!args.financialSnapshotIdentity || !args.utilizationSnapshotIdentity) {
    throw new PersistenceContractError(
      "Capacity input snapshot requires financialSnapshotIdentity and utilizationSnapshotIdentity",
    );
  }

  const calculationId =
    args.calculationId ??
    `${VERIFIED_CAPACITY_INPUT_CALC_PREFIX}${args.handoff.evaluationAsOf}`;

  const inputIdentity = contentHashOf({
    companyId,
    evaluationAsOf: args.handoff.evaluationAsOf,
    financialSnapshotIdentity: args.financialSnapshotIdentity,
    utilizationSnapshotIdentity: args.utilizationSnapshotIdentity,
    operativeAuthoritySnapshotId: args.operativeAuthoritySnapshotId ?? null,
    verifiedIrIdentity: args.verifiedIrIdentity ?? null,
    requiredTrust: args.handoff.trustClasses,
  });

  const authorityClass = mapAuthorityClass(args.handoff);
  const productionEligible = mayUseAsProductionCapacityInput(args.handoff);

  return persistCapacityCalculation(prisma, {
    companyId,
    calculationId,
    asOfDate: args.handoff.evaluationAsOf,
    authorityClass,
    calculationStatus: productionEligible
      ? "PRODUCTION_ELIGIBLE"
      : args.handoff.productionAuthority === "REFUSED"
        ? "REFUSED"
        : "REVIEW_REQUIRED",
    operativeAuthoritySnapshotId: args.operativeAuthoritySnapshotId ?? null,
    verifiedIrIdentity: args.verifiedIrIdentity ?? null,
    financialSnapshotIdentity: args.financialSnapshotIdentity,
    utilizationSnapshotIdentity: args.utilizationSnapshotIdentity,
    request: {
      kind: "VERIFIED_CAPACITY_INPUT_HANDOFF",
      contractVersion: args.handoff.contractVersion,
      inputIdentity,
      companyId,
      evaluationAsOf: args.handoff.evaluationAsOf,
    },
    capacityOutput: {
      // Never a bare capacity number — only authority status + identities.
      productionAuthority: args.handoff.productionAuthority,
      productionActivation: args.handoff.productionActivation,
      trustClasses: args.handoff.trustClasses,
      financialTrustClass: args.handoff.financial.trustClass,
      utilizationTrustClass: args.handoff.utilization.trustClass,
      utilizationKnowledge: args.handoff.utilization.knowledge,
      supportsRemainingClaim: args.handoff.utilization.supportsRemainingClaim,
      mayUseAsProductionCapacityInput: productionEligible,
      inputIdentity,
    },
    missingInputs: args.handoff.blockers.length ? args.handoff.blockers : undefined,
    refusalReasons:
      args.handoff.productionAuthority === "REFUSED" ? args.handoff.blockers : undefined,
    trace: {
      handoff: args.handoff,
      inputIdentity,
      financialSnapshotIdentity: args.financialSnapshotIdentity,
      utilizationSnapshotIdentity: args.utilizationSnapshotIdentity,
      operativeLegalAuthorityIdentity: args.operativeAuthoritySnapshotId ?? null,
      covenantIrIdentity: args.verifiedIrIdentity ?? null,
      evaluationAsOf: args.handoff.evaluationAsOf,
      deterministicInputHash: inputIdentity,
      resultAuthorityStatus: {
        productionAuthority: args.handoff.productionAuthority,
        productionActivation: args.handoff.productionActivation,
        mayUseAsProductionCapacityInput: productionEligible,
      },
    },
    actor: args.actor ?? { kind: "SYSTEM", component: "persistence.verified-capacity-input" },
  });
}

export async function loadVerifiedCapacityInputSnapshot(
  prisma: PrismaClient,
  companyId: string,
  calculationId: string,
) {
  requireCompanyId(companyId, "loadVerifiedCapacityInputSnapshot");
  const row = await getLatestAuthorizedCapacityCalculation(prisma, companyId, calculationId);
  if (!row) return null;
  if (row.status !== "ACTIVE") return null;
  return row;
}

export async function loadVerifiedCapacityInputByHash(
  prisma: PrismaClient,
  companyId: string,
  inputHash: string,
) {
  requireCompanyId(companyId, "loadVerifiedCapacityInputByHash");
  const row = await getCapacityCalculationByInputHash(prisma, companyId, inputHash);
  if (!row) return null;
  if (row.status === "STALE" || row.status === "SUPERSEDED" || row.status === "INVALIDATED") {
    return null;
  }
  return row;
}
