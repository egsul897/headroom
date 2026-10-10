/**
 * Durable persistence for CovenantContextBundle (recursive context manifests).
 */
import type { IntelligenceLifecycleStatus, PrismaClient } from "@prisma/client";
import type { CovenantContextBundle } from "@/lib/contract-model/compiler/context-retrieval/types";
import { contentHashOf, fingerprintParts } from "./hash";
import { appendInstitutionalAuditEvent } from "./audit";
import { assertSameTenant, requireCompanyId } from "./tenant";
import type { ActorProvenance } from "./types";

export interface PersistContextManifestInput {
  bundle: CovenantContextBundle;
  actor?: ActorProvenance;
}

export async function persistContextRetrievalManifest(
  prisma: PrismaClient,
  input: PersistContextManifestInput,
): Promise<{ id: string; contentHash: string; created: boolean; status: IntelligenceLifecycleStatus }> {
  const companyId = requireCompanyId(input.bundle.companyId, "persistContextRetrievalManifest");
  const contentHash = contentHashOf({
    bundleId: input.bundle.bundleId,
    retrievalAlgorithmVersion: input.bundle.retrievalAlgorithmVersion,
    sufficiencyState: input.bundle.sufficiencyState,
    items: input.bundle.items.map((i) => i.itemId),
    unresolved: input.bundle.unresolvedDependencies.map((u) => u.dependencyType),
    originatingDiscoveryId: input.bundle.originatingDiscoveryId,
  });
  const sourceFingerprint = {
    fingerprint: fingerprintParts({
      companyId,
      bundleId: input.bundle.bundleId,
      algorithm: input.bundle.retrievalAlgorithmVersion,
      originatingDocumentId: input.bundle.originatingDocumentId,
      contentHash,
    }),
    documentIds: [...new Set(input.bundle.items.map((i) => i.documentId).concat(input.bundle.originatingDocumentId))],
  };

  const existing = await prisma.contextRetrievalManifest.findUnique({
    where: {
      companyId_bundleId_retrievalAlgorithmVersion_contentHash: {
        companyId,
        bundleId: input.bundle.bundleId,
        retrievalAlgorithmVersion: input.bundle.retrievalAlgorithmVersion,
        contentHash,
      },
    },
  });
  if (existing) {
    return { id: existing.id, contentHash, created: false, status: existing.status };
  }

  const priorActive = await prisma.contextRetrievalManifest.findMany({
    where: {
      companyId,
      bundleId: input.bundle.bundleId,
      retrievalAlgorithmVersion: input.bundle.retrievalAlgorithmVersion,
      status: "ACTIVE",
      NOT: { contentHash },
    },
  });

  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.contextRetrievalManifest.create({
      data: {
        companyId,
        packageKey: input.bundle.packageKey,
        bundleId: input.bundle.bundleId,
        instrumentKey: input.bundle.instrumentKey,
        originatingDocumentId: input.bundle.originatingDocumentId,
        originatingDiscoveryId: input.bundle.originatingDiscoveryId,
        contentHash,
        sufficiencyState: input.bundle.sufficiencyState,
        retrievalAlgorithmVersion: input.bundle.retrievalAlgorithmVersion,
        payload: input.bundle as object,
        sourceFingerprint: sourceFingerprint as object,
        status: "ACTIVE",
      },
    });
    for (const prior of priorActive) {
      await tx.contextRetrievalManifest.update({
        where: { id: prior.id },
        data: { status: "SUPERSEDED", supersededById: created.id },
      });
    }
    return created;
  });

  await appendInstitutionalAuditEvent(prisma, {
    companyId,
    action: priorActive.length > 0 ? "SUPERSESSION" : "PERSISTENCE_WRITE",
    entityType: "ContextRetrievalManifest",
    entityId: row.id,
    actor: input.actor ?? { kind: "SYSTEM", component: "persistence.context-manifest" },
    newState: {
      id: row.id,
      contentHash,
      sufficiencyState: input.bundle.sufficiencyState,
      retrievalAlgorithmVersion: input.bundle.retrievalAlgorithmVersion,
    },
  });

  return { id: row.id, contentHash, created: true, status: row.status };
}

export async function getContextRetrievalManifest(
  prisma: PrismaClient,
  companyId: string,
  bundleId: string,
  retrievalAlgorithmVersion: string,
) {
  requireCompanyId(companyId, "getContextRetrievalManifest");
  return prisma.contextRetrievalManifest.findFirst({
    where: { companyId, bundleId, retrievalAlgorithmVersion, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
}

export async function getContextRetrievalManifestById(prisma: PrismaClient, companyId: string, id: string) {
  requireCompanyId(companyId, "getContextRetrievalManifestById");
  const row = await prisma.contextRetrievalManifest.findUnique({ where: { id } });
  if (!row) return null;
  assertSameTenant(companyId, row.companyId, "getContextRetrievalManifestById");
  return row;
}
