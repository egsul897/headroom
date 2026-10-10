/**
 * Durable FinancialMetricEvidence bundles.
 * Never silently substitutes GAAP Total Assets for covenant Total Consolidated Assets —
 * accounting definitions live in the payload and are preserved verbatim.
 */
import type { IntelligenceLifecycleStatus, PrismaClient } from "@prisma/client";
import type { FinancialMetricEvidence } from "@/lib/capacity/financial-evidence";
import { contentHashOf, fingerprintParts } from "./hash";
import { appendInstitutionalAuditEvent } from "./audit";
import { assertSameTenant, requireCompanyId } from "./tenant";
import { PersistenceContractError, type ActorProvenance } from "./types";

export interface PersistFinancialEvidenceInput {
  companyId: string;
  bundleKey: string;
  asOfDate: string;
  metrics: FinancialMetricEvidence[];
  claimedReviewerLabel?: string | null;
  actor?: ActorProvenance;
}

function worstVerification(metrics: FinancialMetricEvidence[]): string {
  const rank: Record<string, number> = {
    VERIFIED: 0,
    REVIEW_REQUIRED: 1,
    UNVERIFIED_EXTRACTION: 2,
    REJECTED: 3,
  };
  let worst = "VERIFIED";
  let worstRank = -1;
  for (const m of metrics) {
    const r = rank[m.verificationStatus] ?? 2;
    if (r > worstRank) {
      worstRank = r;
      worst = m.verificationStatus;
    }
  }
  return worst;
}

function worstAuthenticity(metrics: FinancialMetricEvidence[]): string {
  if (metrics.some((m) => m.authenticity === "SYNTHETIC_LABELED")) return "SYNTHETIC_LABELED";
  if (metrics.some((m) => m.authenticity === "CALLER_STIPULATED_HYPOTHETICAL")) return "CALLER_STIPULATED_HYPOTHETICAL";
  return "AUTHENTIC";
}

export async function persistFinancialEvidenceBundle(
  prisma: PrismaClient,
  input: PersistFinancialEvidenceInput,
): Promise<{ id: string; contentHash: string; created: boolean; status: IntelligenceLifecycleStatus }> {
  const companyId = requireCompanyId(input.companyId, "persistFinancialEvidenceBundle");
  for (const m of input.metrics) {
    assertSameTenant(companyId, m.entity.companyId, "persistFinancialEvidenceBundle.metric");
  }
  if (input.metrics.length === 0) {
    throw new PersistenceContractError("Financial evidence bundle requires at least one metric");
  }

  const contentHash = contentHashOf(input.metrics);
  const verificationStatus = worstVerification(input.metrics);
  const authenticity = worstAuthenticity(input.metrics);
  const sourceFingerprint = {
    fingerprint: fingerprintParts({
      companyId,
      bundleKey: input.bundleKey,
      asOfDate: input.asOfDate,
      contentHash,
    }),
    documentIds: [...new Set(input.metrics.map((m) => m.sourceDocument.documentId))],
    accountingDefinitions: input.metrics.map((m) => ({
      metricKey: m.metricKey,
      accountingDefinition: m.accountingDefinition,
      provenanceId: m.provenanceId,
    })),
  };

  const existing = await prisma.financialEvidenceBundle.findUnique({
    where: { companyId_bundleKey_contentHash: { companyId, bundleKey: input.bundleKey, contentHash } },
  });
  if (existing) {
    return { id: existing.id, contentHash, created: false, status: existing.status };
  }

  const priorActive = await prisma.financialEvidenceBundle.findMany({
    where: { companyId, bundleKey: input.bundleKey, status: "ACTIVE", NOT: { contentHash } },
  });

  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.financialEvidenceBundle.create({
      data: {
        companyId,
        bundleKey: input.bundleKey,
        asOfDate: input.asOfDate,
        contentHash,
        verificationStatus,
        authenticity,
        payload: { metrics: input.metrics } as object,
        sourceFingerprint: sourceFingerprint as object,
        claimedReviewerLabel: input.claimedReviewerLabel ?? null,
        approvedAt: verificationStatus === "VERIFIED" ? new Date() : null,
        status: "ACTIVE",
      },
    });
    for (const prior of priorActive) {
      await tx.financialEvidenceBundle.update({
        where: { id: prior.id },
        data: { status: "SUPERSEDED", supersededById: created.id },
      });
    }
    return created;
  });

  await appendInstitutionalAuditEvent(prisma, {
    companyId,
    action: priorActive.length > 0 ? "FINANCIAL_EVIDENCE_REVISION" : "PERSISTENCE_WRITE",
    entityType: "FinancialEvidenceBundle",
    entityId: row.id,
    actor: input.actor ?? { kind: "SYSTEM", component: "persistence.financial-evidence" },
    actorLabel: input.claimedReviewerLabel ?? null,
    priorState: priorActive.map((p) => ({ id: p.id, contentHash: p.contentHash })),
    newState: { id: row.id, contentHash, verificationStatus, authenticity },
  });

  return { id: row.id, contentHash, created: true, status: row.status };
}

export async function getLatestFinancialEvidenceBundle(prisma: PrismaClient, companyId: string, bundleKey: string) {
  requireCompanyId(companyId, "getLatestFinancialEvidenceBundle");
  return prisma.financialEvidenceBundle.findFirst({
    where: { companyId, bundleKey, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
}

export async function getFinancialEvidenceBundleById(prisma: PrismaClient, companyId: string, id: string) {
  requireCompanyId(companyId, "getFinancialEvidenceBundleById");
  const row = await prisma.financialEvidenceBundle.findUnique({ where: { id } });
  if (!row) return null;
  assertSameTenant(companyId, row.companyId, "getFinancialEvidenceBundleById");
  return row;
}

export async function revokeFinancialEvidenceBundle(
  prisma: PrismaClient,
  companyId: string,
  id: string,
  actor?: ActorProvenance,
) {
  requireCompanyId(companyId, "revokeFinancialEvidenceBundle");
  const row = await getFinancialEvidenceBundleById(prisma, companyId, id);
  if (!row) throw new PersistenceContractError(`FinancialEvidenceBundle ${id} not found`);
  const updated = await prisma.financialEvidenceBundle.update({
    where: { id: row.id },
    data: { status: "REVOKED" },
  });
  await appendInstitutionalAuditEvent(prisma, {
    companyId,
    action: "REVOCATION",
    entityType: "FinancialEvidenceBundle",
    entityId: id,
    actor: actor ?? { kind: "UNAUTHENTICATED" },
    priorState: { status: row.status },
    newState: { status: "REVOKED" },
  });
  return updated;
}
