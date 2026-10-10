/**
 * Durable FinancialMetricEvidence bundles.
 * Never silently substitutes GAAP Total Assets for covenant Total Consolidated Assets —
 * accounting definitions live in the payload and are preserved verbatim.
 *
 * Stored evidence is NOT automatically trusted — callers must revalidate via
 * validateAuthenticatedFinancialSnapshot before any capacity handoff.
 */
import { Prisma, type IntelligenceLifecycleStatus, type PrismaClient } from "@prisma/client";
import type {
  AuthenticatedFinancialSnapshotEvidence,
  FinancialMetricEvidence,
  FinancialMetricKey,
} from "@/lib/capacity/financial-evidence";
import { validateAuthenticatedFinancialSnapshot } from "@/lib/capacity/financial-evidence";
import type { TrustedIssuerAuthorizationContext } from "@/lib/capacity/completeness-issuer-auth";
import type {
  StatementCapacityMetricKey,
  StatementIngestionRefusalReason,
  StatementNormalizationTraceEntry,
} from "@/lib/capacity/financial-statement-ingestion";
import { contentHashOf, fingerprintParts } from "./hash";
import { appendInstitutionalAuditEvent } from "./audit";
import { assertSameTenant, requireCompanyId } from "./tenant";
import { PersistenceContractError, type ActorProvenance } from "./types";

/** Ingestion audit sidecar — raw mapping/trace retained without a new table. */
export interface FinancialIngestionAuditSidecar {
  provenanceId?: string;
  reportingPeriod?: string;
  currency?: string;
  entityName?: string | null;
  mappedRoles?: readonly StatementCapacityMetricKey[];
  unmappedLineIds?: readonly string[];
  refusalReasons?: readonly StatementIngestionRefusalReason[];
  trace?: readonly StatementNormalizationTraceEntry[];
  sourceDocumentRefs?: readonly { documentId: string; exactLocation?: string }[];
  version?: string;
  supersessionNote?: string | null;
}

export interface FinancialEvidenceBundlePayload {
  metrics: FinancialMetricEvidence[];
  snapshot?: {
    companyId: string;
    asOf: string;
    reportingPeriod: string;
    currency: string;
    provenanceId: string;
  };
  ingestionAudit?: FinancialIngestionAuditSidecar;
}

export interface PersistFinancialEvidenceInput {
  companyId: string;
  bundleKey: string;
  asOfDate: string;
  metrics: FinancialMetricEvidence[];
  /** Optional full snapshot envelope (company/asOf/period/currency/provenance). */
  snapshot?: Omit<AuthenticatedFinancialSnapshotEvidence, "metrics">;
  /** Optional Agent #9 ingestion audit sidecar (trace, unmapped lines, mapped roles). */
  ingestionAudit?: FinancialIngestionAuditSidecar;
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
  if (metrics.some((m) => m.authenticity === "CALLER_STIPULATED_HYPOTHETICAL")) {
    return "CALLER_STIPULATED_HYPOTHETICAL";
  }
  return "AUTHENTIC";
}

function buildPayload(input: PersistFinancialEvidenceInput): FinancialEvidenceBundlePayload {
  const payload: FinancialEvidenceBundlePayload = { metrics: input.metrics };
  if (input.snapshot) {
    payload.snapshot = {
      companyId: input.snapshot.companyId,
      asOf: input.snapshot.asOf,
      reportingPeriod: input.snapshot.reportingPeriod,
      currency: input.snapshot.currency,
      provenanceId: input.snapshot.provenanceId,
    };
  }
  if (input.ingestionAudit) {
    payload.ingestionAudit = input.ingestionAudit;
  }
  return payload;
}

export async function persistFinancialEvidenceBundle(
  prisma: PrismaClient,
  input: PersistFinancialEvidenceInput,
): Promise<{ id: string; contentHash: string; created: boolean; status: IntelligenceLifecycleStatus }> {
  const companyId = requireCompanyId(input.companyId, "persistFinancialEvidenceBundle");
  for (const m of input.metrics) {
    assertSameTenant(companyId, m.entity.companyId, "persistFinancialEvidenceBundle.metric");
  }
  if (input.snapshot) {
    assertSameTenant(companyId, input.snapshot.companyId, "persistFinancialEvidenceBundle.snapshot");
  }
  if (input.metrics.length === 0) {
    throw new PersistenceContractError("Financial evidence bundle requires at least one metric");
  }

  const payload = buildPayload(input);
  // Metric-addressed hash — compatible with VTE financialSnapshotIdentity lookup.
  // Sidecar is stored in payload; metric value/definition changes create a new hash.
  const contentHash = contentHashOf(input.metrics);
  const verificationStatus = worstVerification(input.metrics);
  const authenticity = worstAuthenticity(input.metrics);
  const provenanceId =
    input.snapshot?.provenanceId ??
    input.ingestionAudit?.provenanceId ??
    input.metrics[0]?.provenanceId ??
    null;
  const sourceFingerprint = {
    fingerprint: fingerprintParts({
      companyId,
      bundleKey: input.bundleKey,
      asOfDate: input.asOfDate,
      contentHash,
      provenanceId: provenanceId ?? undefined,
    }),
    documentIds: [...new Set(input.metrics.map((m) => m.sourceDocument.documentId))],
    accountingDefinitions: input.metrics.map((m) => ({
      metricKey: m.metricKey,
      accountingDefinition: m.accountingDefinition,
      provenanceId: m.provenanceId,
    })),
    provenanceId,
    reportingPeriod: input.snapshot?.reportingPeriod ?? input.ingestionAudit?.reportingPeriod ?? null,
    verificationStatus,
    authenticity,
    claimedReviewerLabel: input.claimedReviewerLabel ?? null,
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

  let row;
  try {
    row = await prisma.$transaction(async (tx) => {
      const created = await tx.financialEvidenceBundle.create({
        data: {
          companyId,
          bundleKey: input.bundleKey,
          asOfDate: input.asOfDate,
          contentHash,
          verificationStatus,
          authenticity,
          payload: payload as object,
          sourceFingerprint: sourceFingerprint as object,
          claimedReviewerLabel: input.claimedReviewerLabel ?? null,
          // VERIFIED metrics do not mint production trust — approvedAt is audit-only.
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
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const raced = await prisma.financialEvidenceBundle.findUnique({
        where: { companyId_bundleKey_contentHash: { companyId, bundleKey: input.bundleKey, contentHash } },
      });
      if (raced) return { id: raced.id, contentHash, created: false, status: raced.status };
    }
    throw err;
  }

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

/**
 * Rehydrate an AuthenticatedFinancialSnapshotEvidence from a durable bundle.
 * Does NOT grant trust — call revalidatePersistedFinancialEvidence.
 */
export function rehydrateFinancialSnapshotFromBundle(row: {
  companyId: string;
  asOfDate: string;
  payload: unknown;
}): AuthenticatedFinancialSnapshotEvidence {
  const payload = row.payload as unknown as FinancialEvidenceBundlePayload;
  if (!payload?.metrics?.length) {
    throw new PersistenceContractError("FinancialEvidenceBundle payload missing metrics");
  }
  const snap = payload.snapshot;
  const first = payload.metrics[0]!;
  return {
    companyId: snap?.companyId ?? row.companyId,
    asOf: snap?.asOf ?? row.asOfDate,
    reportingPeriod: snap?.reportingPeriod ?? first.reportingPeriod,
    currency: snap?.currency ?? first.currency,
    provenanceId: snap?.provenanceId ?? payload.ingestionAudit?.provenanceId ?? first.provenanceId,
    metrics: payload.metrics,
  };
}

/** Load latest ACTIVE bundle and rehydrate snapshot + sidecar. */
export async function loadFinancialEvidenceSnapshot(
  prisma: PrismaClient,
  companyId: string,
  bundleKey: string,
): Promise<{
  row: NonNullable<Awaited<ReturnType<typeof getLatestFinancialEvidenceBundle>>>;
  snapshot: AuthenticatedFinancialSnapshotEvidence;
  ingestionAudit: FinancialIngestionAuditSidecar | null;
  contentHash: string;
} | null> {
  const row = await getLatestFinancialEvidenceBundle(prisma, companyId, bundleKey);
  if (!row) return null;
  const payload = row.payload as unknown as FinancialEvidenceBundlePayload;
  return {
    row,
    snapshot: rehydrateFinancialSnapshotFromBundle(row),
    ingestionAudit: payload.ingestionAudit ?? null,
    contentHash: row.contentHash,
  };
}

/**
 * Fresh-DB read → revalidate. Stored VERIFIED / claimed reviewer never bypass host gates.
 */
export async function revalidatePersistedFinancialEvidence(
  prisma: PrismaClient,
  args: {
    companyId: string;
    bundleKey: string;
    requiredFinancialMetrics: readonly FinancialMetricKey[];
    evaluationAsOf: string;
    trustedIssuerAuth?: TrustedIssuerAuthorizationContext | null;
    expectedProvenanceId?: string | null;
    allowSynthetic?: boolean;
    allowCallerStipulated?: boolean;
  },
) {
  const loaded = await loadFinancialEvidenceSnapshot(prisma, args.companyId, args.bundleKey);
  if (!loaded) {
    return {
      ok: false as const,
      loaded: null,
      validation: null,
      blockers: [`no ACTIVE FinancialEvidenceBundle for bundleKey=${args.bundleKey}`],
    };
  }
  if (loaded.row.status !== "ACTIVE") {
    return {
      ok: false as const,
      loaded,
      validation: null,
      blockers: [`FinancialEvidenceBundle status ${loaded.row.status} is not usable as current evidence`],
    };
  }
  const validation = validateAuthenticatedFinancialSnapshot(loaded.snapshot, {
    requiredMetrics: args.requiredFinancialMetrics,
    evaluationAsOf: args.evaluationAsOf,
    trustedIssuerAuth: args.trustedIssuerAuth,
    expectedProvenanceId: args.expectedProvenanceId ?? loaded.snapshot.provenanceId,
    allowSynthetic: args.allowSynthetic,
    allowCallerStipulated: args.allowCallerStipulated,
  });
  return {
    ok: validation.ok,
    loaded,
    validation,
    blockers: validation.blockers,
  };
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
