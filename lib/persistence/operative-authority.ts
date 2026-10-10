/**
 * Durable persistence for OperativeHandoffBundle.
 * Preserves provisional identity and authority caveats; never auto-confirms.
 */
import type { IntelligenceLifecycleStatus, PrismaClient } from "@prisma/client";
import type { OperativeHandoffBundle } from "@/lib/contract-model/compiler/package-graph/operative-handoff";
import { contentHashOf, fingerprintParts } from "./hash";
import { appendInstitutionalAuditEvent } from "./audit";
import { assertSameTenant, requireCompanyId } from "./tenant";
import { OPERATIVE_AUTHORITY_ENGINE_VERSION, type ActorProvenance } from "./types";

export interface PersistOperativeAuthorityInput {
  bundle: OperativeHandoffBundle;
  actor?: ActorProvenance;
  engineVersion?: string;
}

function worstAuthority(bundle: OperativeHandoffBundle): string {
  const rank: Record<string, number> = {
    CONFIRMED_OPERATIVE: 0,
    NOT_YET_EFFECTIVE: 1,
    SUPERSEDED_SOURCE: 2,
    REVIEW_REQUIRED: 3,
    AMBIGUOUS: 4,
    CONFLICTED: 5,
    UNSUPPORTED: 6,
    PROVISIONAL_IDENTITY_BLOCKED: 7,
  };
  let worst = "CONFIRMED_OPERATIVE";
  let worstRank = -1;
  for (const p of bundle.provisions) {
    const r = rank[p.authorityClassification] ?? 5;
    if (r > worstRank) {
      worstRank = r;
      worst = p.authorityClassification;
    }
  }
  if (bundle.instruments.some((i) => i.associationKind !== "CONFIRMED" && i.provisionalDocumentIds.length > 0)) {
    if ((rank.PROVISIONAL_IDENTITY_BLOCKED ?? 7) > worstRank) {
      worst = "PROVISIONAL_IDENTITY_BLOCKED";
    }
  }
  return worst;
}

function provisionalIdentity(bundle: OperativeHandoffBundle): boolean {
  return (
    bundle.instruments.some((i) => i.provisionalDocumentIds.length > 0 || i.associationKind.includes("PROVISIONAL")) ||
    bundle.provisions.some((p) => p.authorityClassification === "PROVISIONAL_IDENTITY_BLOCKED")
  );
}

export async function persistOperativeAuthoritySnapshot(
  prisma: PrismaClient,
  input: PersistOperativeAuthorityInput,
): Promise<{ id: string; contentHash: string; created: boolean; status: IntelligenceLifecycleStatus }> {
  const companyId = requireCompanyId(input.bundle.companyId, "persistOperativeAuthoritySnapshot");
  const contentHash = contentHashOf(input.bundle);
  const sourceFingerprint = {
    fingerprint: fingerprintParts({
      companyId,
      packageKey: input.bundle.packageKey,
      asOfDate: input.bundle.asOfDate,
      provisionCount: String(input.bundle.provisions.length),
      instrumentCount: String(input.bundle.instruments.length),
      unsupported: String(input.bundle.unsupportedCases.length),
    }),
    documentIds: [
      ...new Set([
        ...input.bundle.documentRoles.map((d) => d.documentId),
        ...input.bundle.provisions.map((p) => p.sourceDocumentId).filter((x): x is string => !!x),
      ]),
    ],
  };
  const authorityClassification = worstAuthority(input.bundle);
  const isProvisional = provisionalIdentity(input.bundle);
  const engineVersion = input.engineVersion ?? OPERATIVE_AUTHORITY_ENGINE_VERSION;

  const existing = await prisma.operativeAuthoritySnapshot.findUnique({
    where: {
      companyId_packageKey_asOfDate_contentHash: {
        companyId,
        packageKey: input.bundle.packageKey,
        asOfDate: input.bundle.asOfDate,
        contentHash,
      },
    },
  });
  if (existing) {
    return { id: existing.id, contentHash, created: false, status: existing.status };
  }

  // Supersede prior ACTIVE rows for same company/package/asOf with different hash.
  const priorActive = await prisma.operativeAuthoritySnapshot.findMany({
    where: {
      companyId,
      packageKey: input.bundle.packageKey,
      asOfDate: input.bundle.asOfDate,
      status: "ACTIVE",
      NOT: { contentHash },
    },
  });

  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.operativeAuthoritySnapshot.create({
      data: {
        companyId,
        packageKey: input.bundle.packageKey,
        asOfDate: input.bundle.asOfDate,
        contentHash,
        authorityClassification,
        instrumentKey: input.bundle.instruments[0]?.instrumentKey ?? null,
        provisionalIdentity: isProvisional,
        engineVersion,
        payload: input.bundle as object,
        sourceFingerprint: sourceFingerprint as object,
        status: "ACTIVE",
      },
    });
    for (const prior of priorActive) {
      await tx.operativeAuthoritySnapshot.update({
        where: { id: prior.id },
        data: { status: "SUPERSEDED", supersededById: created.id },
      });
    }
    return created;
  });

  await appendInstitutionalAuditEvent(prisma, {
    companyId,
    action: priorActive.length > 0 ? "SUPERSESSION" : "PERSISTENCE_WRITE",
    entityType: "OperativeAuthoritySnapshot",
    entityId: row.id,
    actor: input.actor ?? { kind: "SYSTEM", component: "persistence.operative-authority" },
    priorState: priorActive.map((p) => ({ id: p.id, contentHash: p.contentHash })),
    newState: { id: row.id, contentHash, authorityClassification, provisionalIdentity: isProvisional },
  });

  return { id: row.id, contentHash, created: true, status: row.status };
}

export async function getLatestOperativeAuthoritySnapshot(
  prisma: PrismaClient,
  companyId: string,
  packageKey: string,
  asOfDate: string,
) {
  requireCompanyId(companyId, "getLatestOperativeAuthoritySnapshot");
  return prisma.operativeAuthoritySnapshot.findFirst({
    where: { companyId, packageKey, asOfDate, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
}

export async function getOperativeAuthoritySnapshotById(
  prisma: PrismaClient,
  companyId: string,
  id: string,
) {
  requireCompanyId(companyId, "getOperativeAuthoritySnapshotById");
  const row = await prisma.operativeAuthoritySnapshot.findUnique({ where: { id } });
  if (!row) return null;
  assertSameTenant(companyId, row.companyId, "getOperativeAuthoritySnapshotById");
  return row;
}

export async function listOperativeAuthorityHistory(
  prisma: PrismaClient,
  companyId: string,
  packageKey: string,
  asOfDate?: string,
) {
  requireCompanyId(companyId, "listOperativeAuthorityHistory");
  return prisma.operativeAuthoritySnapshot.findMany({
    where: { companyId, packageKey, ...(asOfDate ? { asOfDate } : {}) },
    orderBy: { createdAt: "asc" },
  });
}
