/**
 * Durable utilization completeness certificates.
 * Revoked certificates must not authorize new production calculations.
 */
import { Prisma, type IntelligenceLifecycleStatus, type PrismaClient } from "@prisma/client";
import type { UtilizationCompletenessCertificate } from "@/lib/capacity/utilization-types";
import { contentHashOf, fingerprintParts } from "./hash";
import { appendInstitutionalAuditEvent } from "./audit";
import { assertSameTenant, requireCompanyId } from "./tenant";
import { PersistenceContractError, type ActorProvenance } from "./types";

export interface PersistCompletenessInput {
  companyId: string;
  certificate: UtilizationCompletenessCertificate;
  actor?: ActorProvenance;
}

export async function persistUtilizationCompletenessRecord(
  prisma: PrismaClient,
  input: PersistCompletenessInput,
): Promise<{ id: string; contentHash: string; created: boolean; status: IntelligenceLifecycleStatus }> {
  const companyId = requireCompanyId(input.companyId, "persistUtilizationCompletenessRecord");
  const cert = input.certificate;
  const contentHash = contentHashOf(cert);

  const existing = await prisma.utilizationCompletenessRecord.findUnique({
    where: {
      companyId_capacityRuleId_asOfDate_contentHash: {
        companyId,
        capacityRuleId: cert.capacityRuleId,
        asOfDate: cert.asOf,
        contentHash,
      },
    },
  });
  if (existing) {
    return { id: existing.id, contentHash, created: false, status: existing.status };
  }

  const priorActive = await prisma.utilizationCompletenessRecord.findMany({
    where: {
      companyId,
      capacityRuleId: cert.capacityRuleId,
      asOfDate: cert.asOf,
      status: "ACTIVE",
      NOT: { contentHash },
    },
  });

  let row;
  try {
    row = await prisma.$transaction(async (tx) => {
      const created = await tx.utilizationCompletenessRecord.create({
        data: {
          companyId,
          capacityRuleId: cert.capacityRuleId,
          asOfDate: cert.asOf,
          certificateKind: cert.kind,
          authenticity: cert.authenticity ?? null,
          contentHash,
          payload: {
            certificate: cert,
            fingerprint: fingerprintParts({
              companyId,
              capacityRuleId: cert.capacityRuleId,
              asOfDate: cert.asOf,
              kind: cert.kind,
              contentHash,
            }),
          } as object,
          status: "ACTIVE",
        },
      });
      for (const prior of priorActive) {
        await tx.utilizationCompletenessRecord.update({
          where: { id: prior.id },
          data: { status: "SUPERSEDED", supersededById: created.id },
        });
      }
      return created;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const raced = await prisma.utilizationCompletenessRecord.findUnique({
        where: {
          companyId_capacityRuleId_asOfDate_contentHash: {
            companyId,
            capacityRuleId: cert.capacityRuleId,
            asOfDate: cert.asOf,
            contentHash,
          },
        },
      });
      if (raced) return { id: raced.id, contentHash, created: false, status: raced.status };
    }
    throw err;
  }

  await appendInstitutionalAuditEvent(prisma, {
    companyId,
    action: priorActive.length > 0 ? "SUPERSESSION" : "PERSISTENCE_WRITE",
    entityType: "UtilizationCompletenessRecord",
    entityId: row.id,
    actor: input.actor ?? { kind: "SYSTEM", component: "persistence.utilization-completeness" },
    newState: { id: row.id, contentHash, kind: cert.kind, authenticity: cert.authenticity ?? null },
  });

  return { id: row.id, contentHash, created: true, status: row.status };
}

export async function getActiveCompletenessRecord(
  prisma: PrismaClient,
  companyId: string,
  capacityRuleId: string,
  asOfDate: string,
) {
  requireCompanyId(companyId, "getActiveCompletenessRecord");
  return prisma.utilizationCompletenessRecord.findFirst({
    where: { companyId, capacityRuleId, asOfDate, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
}

/** ACTIVE certificates only — revoked/stale rows never authorize production. */
export async function getProductionEligibleCompletenessRecord(
  prisma: PrismaClient,
  companyId: string,
  capacityRuleId: string,
  asOfDate: string,
) {
  const row = await getActiveCompletenessRecord(prisma, companyId, capacityRuleId, asOfDate);
  if (!row) return null;
  if (row.status !== "ACTIVE") return null;
  if (row.authenticity !== "AUTHENTIC") return null;
  return row;
}

export async function revokeCompletenessRecord(
  prisma: PrismaClient,
  companyId: string,
  id: string,
  actor?: ActorProvenance,
) {
  requireCompanyId(companyId, "revokeCompletenessRecord");
  const row = await prisma.utilizationCompletenessRecord.findUnique({ where: { id } });
  if (!row) throw new PersistenceContractError(`UtilizationCompletenessRecord ${id} not found`);
  assertSameTenant(companyId, row.companyId, "revokeCompletenessRecord");
  const updated = await prisma.utilizationCompletenessRecord.update({
    where: { id },
    data: { status: "REVOKED", revokedAt: new Date() },
  });
  await appendInstitutionalAuditEvent(prisma, {
    companyId,
    action: "REVOCATION",
    entityType: "UtilizationCompletenessRecord",
    entityId: id,
    actor: actor ?? { kind: "UNAUTHENTICATED" },
    priorState: { status: row.status },
    newState: { status: "REVOKED" },
  });
  return updated;
}
