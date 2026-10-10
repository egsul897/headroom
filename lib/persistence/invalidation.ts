/**
 * Dependency fingerprint invalidation.
 * Marks dependent ACTIVE artifacts STALE/INVALIDATED while preserving historical rows.
 */
import type { PrismaClient } from "@prisma/client";
import { appendInstitutionalAuditEvent } from "./audit";
import { requireCompanyId } from "./tenant";
import type { ActorProvenance } from "./types";

export type InvalidatableEntityType =
  | "OperativeAuthoritySnapshot"
  | "ContextRetrievalManifest"
  | "FinancialEvidenceBundle"
  | "UtilizationCompletenessRecord"
  | "CapacityCalculationRecord"
  | "TransactionSimulationRecord";

export interface InvalidateDependentsInput {
  companyId: string;
  sourceEntityType: string;
  sourceEntityId: string;
  dependents: Array<{ entityType: InvalidatableEntityType; entityId: string }>;
  reason: string;
  sourceFingerprintBefore?: string | null;
  sourceFingerprintAfter?: string | null;
  actor?: ActorProvenance;
  /** STALE preserves audit reuse; INVALIDATED blocks current authority more strongly. */
  markAs?: "STALE" | "INVALIDATED";
}

export async function invalidateDependentArtifacts(
  prisma: PrismaClient,
  input: InvalidateDependentsInput,
): Promise<{ invalidated: number }> {
  const companyId = requireCompanyId(input.companyId, "invalidateDependentArtifacts");
  const markAs = input.markAs ?? "STALE";
  let invalidated = 0;

  for (const dep of input.dependents) {
    const updated = await markEntity(prisma, companyId, dep.entityType, dep.entityId, markAs);
    if (!updated) continue;
    invalidated += 1;
    await prisma.dependencyInvalidationRecord.create({
      data: {
        companyId,
        sourceEntityType: input.sourceEntityType,
        sourceEntityId: input.sourceEntityId,
        dependentEntityType: dep.entityType,
        dependentEntityId: dep.entityId,
        sourceFingerprintBefore: input.sourceFingerprintBefore ?? null,
        sourceFingerprintAfter: input.sourceFingerprintAfter ?? null,
        reason: input.reason,
      },
    });
    await appendInstitutionalAuditEvent(prisma, {
      companyId,
      action: "INVALIDATION",
      entityType: dep.entityType,
      entityId: dep.entityId,
      actor: input.actor ?? { kind: "SYSTEM", component: "persistence.invalidation" },
      priorState: { status: "ACTIVE" },
      newState: { status: markAs },
      payload: {
        sourceEntityType: input.sourceEntityType,
        sourceEntityId: input.sourceEntityId,
        reason: input.reason,
      },
    });
  }

  return { invalidated };
}

async function markEntity(
  prisma: PrismaClient,
  companyId: string,
  entityType: InvalidatableEntityType,
  entityId: string,
  status: "STALE" | "INVALIDATED",
): Promise<boolean> {
  switch (entityType) {
    case "OperativeAuthoritySnapshot": {
      const r = await prisma.operativeAuthoritySnapshot.updateMany({
        where: { id: entityId, companyId, status: "ACTIVE" },
        data: { status },
      });
      return r.count > 0;
    }
    case "ContextRetrievalManifest": {
      const r = await prisma.contextRetrievalManifest.updateMany({
        where: { id: entityId, companyId, status: "ACTIVE" },
        data: { status },
      });
      return r.count > 0;
    }
    case "FinancialEvidenceBundle": {
      const r = await prisma.financialEvidenceBundle.updateMany({
        where: { id: entityId, companyId, status: "ACTIVE" },
        data: { status },
      });
      return r.count > 0;
    }
    case "UtilizationCompletenessRecord": {
      const r = await prisma.utilizationCompletenessRecord.updateMany({
        where: { id: entityId, companyId, status: "ACTIVE" },
        data: { status },
      });
      return r.count > 0;
    }
    case "CapacityCalculationRecord": {
      const r = await prisma.capacityCalculationRecord.updateMany({
        where: { id: entityId, companyId, status: "ACTIVE" },
        data: { status },
      });
      return r.count > 0;
    }
    case "TransactionSimulationRecord": {
      // Simulations remain historical; mark STALE for input drift but never delete.
      const r = await prisma.transactionSimulationRecord.updateMany({
        where: { id: entityId, companyId, status: "ACTIVE" },
        data: { status },
      });
      return r.count > 0;
    }
  }
}

export async function listInvalidationsForDependent(
  prisma: PrismaClient,
  companyId: string,
  dependentEntityType: string,
  dependentEntityId: string,
) {
  requireCompanyId(companyId, "listInvalidationsForDependent");
  return prisma.dependencyInvalidationRecord.findMany({
    where: { companyId, dependentEntityType, dependentEntityId },
    orderBy: { invalidatedAt: "asc" },
  });
}
