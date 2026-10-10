/**
 * Versioned capacity calculation persistence.
 * Distinguishes hypothetical / verified / refused / review-required / production-authoritative.
 * Never promotes a stale stored result to current authority merely because it exists.
 */
import type { IntelligenceAuthorityClass, IntelligenceLifecycleStatus, PrismaClient } from "@prisma/client";
import { contentHashOf, fingerprintParts } from "./hash";
import { appendInstitutionalAuditEvent } from "./audit";
import { assertSameTenant, requireCompanyId } from "./tenant";
import {
  CAPACITY_CALCULATION_ENGINE_VERSION,
  PersistenceContractError,
  PRODUCTION_ACTIVATION_STATUS,
  type ActorProvenance,
} from "./types";

export interface CapacityCalculationPersistInput {
  companyId: string;
  calculationId: string;
  asOfDate: string;
  instrumentKey?: string | null;
  engineVersion?: string;
  authorityClass: IntelligenceAuthorityClass;
  calculationStatus: string;
  operativeAuthoritySnapshotId?: string | null;
  verifiedIrIdentity?: string | null;
  financialSnapshotIdentity?: string | null;
  utilizationSnapshotIdentity?: string | null;
  request: unknown;
  capacityOutput?: unknown;
  missingInputs?: unknown;
  refusalReasons?: unknown;
  reviewConditions?: unknown;
  trace?: unknown;
  actor?: ActorProvenance;
}

export async function persistCapacityCalculation(
  prisma: PrismaClient,
  input: CapacityCalculationPersistInput,
): Promise<{ id: string; contentHash: string; inputHash: string; created: boolean; status: IntelligenceLifecycleStatus }> {
  const companyId = requireCompanyId(input.companyId, "persistCapacityCalculation");

  // Dual production gates remain BLOCKED — refuse to persist PRODUCTION_AUTHORITATIVE.
  if (input.authorityClass === "PRODUCTION_AUTHORITATIVE" && PRODUCTION_ACTIVATION_STATUS === "BLOCKED") {
    throw new PersistenceContractError(
      "Refusing to persist PRODUCTION_AUTHORITATIVE calculation while production activation is BLOCKED (identity + issuer gates)",
    );
  }

  const engineVersion = input.engineVersion ?? CAPACITY_CALCULATION_ENGINE_VERSION;
  const inputHash = contentHashOf({
    request: input.request,
    operativeAuthoritySnapshotId: input.operativeAuthoritySnapshotId ?? null,
    verifiedIrIdentity: input.verifiedIrIdentity ?? null,
    financialSnapshotIdentity: input.financialSnapshotIdentity ?? null,
    utilizationSnapshotIdentity: input.utilizationSnapshotIdentity ?? null,
    engineVersion,
    asOfDate: input.asOfDate,
  });
  const contentHash = contentHashOf({
    inputHash,
    authorityClass: input.authorityClass,
    calculationStatus: input.calculationStatus,
    capacityOutput: input.capacityOutput ?? null,
    missingInputs: input.missingInputs ?? null,
    refusalReasons: input.refusalReasons ?? null,
  });

  const existing = await prisma.capacityCalculationRecord.findUnique({
    where: { companyId_calculationId_contentHash: { companyId, calculationId: input.calculationId, contentHash } },
  });
  if (existing) {
    return { id: existing.id, contentHash, inputHash, created: false, status: existing.status };
  }

  const priorActive = await prisma.capacityCalculationRecord.findMany({
    where: { companyId, calculationId: input.calculationId, status: "ACTIVE", NOT: { contentHash } },
  });

  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.capacityCalculationRecord.create({
      data: {
        companyId,
        instrumentKey: input.instrumentKey ?? null,
        asOfDate: input.asOfDate,
        calculationId: input.calculationId,
        contentHash,
        inputHash,
        engineVersion,
        authorityClass: input.authorityClass,
        calculationStatus: input.calculationStatus,
        operativeAuthoritySnapshotId: input.operativeAuthoritySnapshotId ?? null,
        verifiedIrIdentity: input.verifiedIrIdentity ?? null,
        financialSnapshotIdentity: input.financialSnapshotIdentity ?? null,
        utilizationSnapshotIdentity: input.utilizationSnapshotIdentity ?? null,
        capacityOutput: (input.capacityOutput ?? undefined) as object | undefined,
        missingInputs: (input.missingInputs ?? undefined) as object | undefined,
        refusalReasons: (input.refusalReasons ?? undefined) as object | undefined,
        reviewConditions: (input.reviewConditions ?? undefined) as object | undefined,
        trace: (input.trace ?? undefined) as object | undefined,
        payload: {
          request: input.request,
          fingerprint: fingerprintParts({ companyId, calculationId: input.calculationId, inputHash }),
        } as object,
        status: "ACTIVE",
      },
    });
    for (const prior of priorActive) {
      await tx.capacityCalculationRecord.update({
        where: { id: prior.id },
        data: { status: "SUPERSEDED", supersededById: created.id },
      });
    }
    return created;
  });

  await appendInstitutionalAuditEvent(prisma, {
    companyId,
    action: "CAPACITY_RECALCULATION",
    entityType: "CapacityCalculationRecord",
    entityId: row.id,
    actor: input.actor ?? { kind: "SYSTEM", component: "persistence.capacity-calculation" },
    newState: {
      id: row.id,
      contentHash,
      inputHash,
      authorityClass: input.authorityClass,
      calculationStatus: input.calculationStatus,
    },
  });

  return { id: row.id, contentHash, inputHash, created: true, status: row.status };
}

/** Latest ACTIVE calculation only — STALE/SUPERSEDED/INVALIDATED never returned as current. */
export async function getLatestAuthorizedCapacityCalculation(
  prisma: PrismaClient,
  companyId: string,
  calculationId: string,
) {
  requireCompanyId(companyId, "getLatestAuthorizedCapacityCalculation");
  return prisma.capacityCalculationRecord.findFirst({
    where: {
      companyId,
      calculationId,
      status: "ACTIVE",
      authorityClass: { in: ["VERIFIED_CALCULATION", "REVIEW_REQUIRED", "REFUSED", "HYPOTHETICAL", "PROVISIONAL", "COMPILED_UNVERIFIED"] },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getCapacityCalculationById(prisma: PrismaClient, companyId: string, id: string) {
  requireCompanyId(companyId, "getCapacityCalculationById");
  const row = await prisma.capacityCalculationRecord.findUnique({ where: { id } });
  if (!row) return null;
  assertSameTenant(companyId, row.companyId, "getCapacityCalculationById");
  return row;
}

export async function getCapacityCalculationByInputHash(
  prisma: PrismaClient,
  companyId: string,
  inputHash: string,
) {
  requireCompanyId(companyId, "getCapacityCalculationByInputHash");
  return prisma.capacityCalculationRecord.findFirst({
    where: { companyId, inputHash, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
}
