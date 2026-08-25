/**
 * Canonical company state (Phase B, docs/autonomous-information-retrieval-v1.md
 * "Canonical company state").
 *
 * A COMPUTED, READ-TIME AGGREGATION - deliberately NOT a new persisted table.
 * Every field below is composed from functions this codebase already has;
 * this module performs no covenant/financial arithmetic of its own (the same
 * "composition only" discipline lib/dashboard-service.ts's own header comment
 * establishes) and writes nothing to the database. A second source of truth
 * for "what does this company's state look like" would only create a new
 * staleness/drift problem this codebase does not otherwise have - see this
 * file's own `conflicts`/`staleness` fields, which RE-RUN reconciliation
 * fresh against current data every call rather than reading a possibly-stale
 * persisted IngestionJobStage.output snapshot (documented choice, §"Design
 * decisions" below).
 */

import { prisma } from "../prisma";
import type { CompanySourceConnection, OnboardingStatus } from "@prisma/client";
import { listCompanySourceConnections } from "../connectors/registry";
import { reconcileFinancialFacts, type FinancialFactCandidateWithSource, type ReconciliationGroup } from "../connectors/reconciliation";
import { getReviewProgress, getCandidatesForReview, type ReviewProgressSummary, type CandidateForReview } from "../onboarding/review";
import { getCoverageSnapshot } from "../onboarding/promotion";
import { getCompanyDashboard, getDocumentDetails, type CompanyDashboard, type DocumentDetail } from "../dashboard-service";
import type { CoverageResult } from "../solver/types";

export interface DocumentChainSummary {
  /** Documents with a real, resolved supersedesDocumentId - i.e. a confirmed amendment/base relationship. */
  supersessionPairs: number;
  /** DOCUMENT_RELATIONSHIP candidates that proposed a supersedesDocumentRef but have not yet been reviewed/promoted - a relationship the pipeline found but a human has not yet confirmed. */
  unconfirmedRelationships: number;
}

export interface StalenessEntry {
  metricName: string;
  asOfDate: string;
  ageDays: number;
  thresholdDays: number;
}

export interface CanonicalCompanyState {
  companyId: string;
  asOfDate: Date;
  sourceConnections: CompanySourceConnection[];
  documents: { total: number; byType: Record<string, number> };
  documentChain: DocumentChainSummary;
  reviewProgress: ReviewProgressSummary;
  coverage: CoverageResult[];
  /** Only MATERIAL_DIFFERENCE / CONFLICTING_SOURCE / STALE_SOURCE groups - MATCH groups are not "conflicts" and are omitted here (see reviewItems/staleness for the rest of the reconciliation picture). */
  conflicts: ReconciliationGroup[];
  reviewItems: CandidateForReview[];
  staleness: StalenessEntry[];
  onboardingStatus: OnboardingStatus;
  /** Present only when a FinancialState/FinancialSnapshot exists for this company as of `asOfDate` - absent (not fabricated) otherwise, e.g. a brand-new company with connections but no promoted financial facts yet. */
  dashboard?: CompanyDashboard;
  documentDetails: DocumentDetail[];
}

/**
 * DESIGN DECISION (documented per the task's own "your call, document it"
 * instruction): reconciliation is RE-RUN FRESH here against current
 * PENDING/REVIEW_REQUIRED FINANCIAL_FACT candidates, rather than reading back
 * the most recent RECONCILE IngestionJobStage.output. Re-running fresh is the
 * more HONEST choice for a "current state" view: a persisted stage output
 * reflects a snapshot from whenever that ingestion job's RECONCILE stage last
 * ran, which can be stale relative to review actions taken since (a
 * candidate approved/rejected after that job completed). This function is
 * the SAME pure reconcileFinancialFacts call the RECONCILE stage itself
 * makes (lib/connectors/ingestion.ts) - just invoked read-only, with no
 * writes, so calling getCanonicalCompanyState never mutates review state the
 * way running an actual ingestion job's RECONCILE stage does.
 */
async function computeReconciliation(companyId: string): Promise<{ groups: ReconciliationGroup[]; staleness: StalenessEntry[] }> {
  // Same comparison scope as lib/connectors/ingestion.ts's runReconcileStage
  // (see that function's own header comment): every non-REJECTED
  // FINANCIAL_FACT candidate, including already-decided/promoted ones, so a
  // conflict against history is still visible here - this is a read-only
  // composition, so there is no separate "write scope" to narrow.
  const pendingCandidates = await prisma.extractionCandidate.findMany({
    where: { companyId, kind: "FINANCIAL_FACT", reviewStatus: { not: "REJECTED" } },
  });
  if (pendingCandidates.length === 0) return { groups: [], staleness: [] };

  const sourceRecordRefs = pendingCandidates.map((c) => (c.proposedValue as { sourceRecordRef?: string }).sourceRecordRef).filter((v): v is string => Boolean(v));
  const [artifacts, priorityRules] = await Promise.all([
    prisma.sourceArtifact.findMany({ where: { id: { in: sourceRecordRefs } }, include: { sourceConnection: true } }),
    prisma.sourcePriorityRule.findMany({ where: { OR: [{ companyId }, { companyId: null }] } }),
  ]);
  const artifactById = new Map(artifacts.map((a) => [a.id, a]));

  const withSource: FinancialFactCandidateWithSource[] = [];
  for (const c of pendingCandidates) {
    const value = c.proposedValue as { metricName: string; value: number; asOfDate: string; unit?: string; sourceRecordRef?: string };
    const artifact = value.sourceRecordRef ? artifactById.get(value.sourceRecordRef) : undefined;
    if (!artifact) continue;
    withSource.push({
      candidateId: c.id,
      metricName: value.metricName,
      value: value.value,
      asOfDate: value.asOfDate,
      unit: value.unit,
      sourceConnectionId: artifact.sourceConnectionId,
      connectorType: artifact.sourceConnection.connectorType,
      connectionSourcePriority: artifact.sourceConnection.sourcePriority,
      reviewStatus: c.reviewStatus,
    });
  }

  const groups = reconcileFinancialFacts(withSource, priorityRules, { companyId });
  const now = new Date();
  const staleness: StalenessEntry[] = [];
  for (const g of groups) {
    if (g.classification !== "STALE_SOURCE") continue;
    for (const c of g.candidates) {
      const ageDays = (now.getTime() - new Date(c.asOfDate).getTime()) / (1000 * 60 * 60 * 24);
      staleness.push({ metricName: g.metricName, asOfDate: c.asOfDate, ageDays: Math.round(ageDays), thresholdDays: g.stalenessThresholdDays });
    }
  }
  return { groups, staleness };
}

/**
 * The single composed read for "what does this company's state look like
 * right now" - documents/document/reads from every source, review progress,
 * coverage, reconciliation conflicts/staleness, and (when available) the
 * live dashboard figures. Everything here is a REUSE of an existing function
 * (see this file's header comment); nothing is recomputed.
 */
export async function getCanonicalCompanyState(companyId: string, asOfDate?: Date): Promise<CanonicalCompanyState> {
  const resolvedAsOfDate = asOfDate ?? new Date();

  const [company, sourceConnections, documents, documentDetails, reviewProgress, allCandidates, coverage, reconciliation, docRelCandidates] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: companyId } }),
    listCompanySourceConnections(companyId),
    prisma.document.findMany({ where: { companyId } }),
    getDocumentDetails(companyId),
    getReviewProgress(companyId),
    getCandidatesForReview(companyId, { reviewStatus: ["PENDING", "REVIEW_REQUIRED"] }),
    getCoverageSnapshot(companyId, resolvedAsOfDate),
    computeReconciliation(companyId),
    prisma.extractionCandidate.findMany({ where: { companyId, kind: "DOCUMENT_RELATIONSHIP" } }),
  ]);

  const byType: Record<string, number> = {};
  for (const d of documents) byType[d.type] = (byType[d.type] ?? 0) + 1;

  const supersessionPairs = documents.filter((d) => d.supersedesDocumentId).length;
  const unconfirmedRelationships = docRelCandidates.filter((c) => {
    const v = c.proposedValue as { supersedesDocumentRef?: string };
    return Boolean(v.supersedesDocumentRef) && !c.promotedAt && c.reviewStatus !== "REJECTED";
  }).length;

  const reviewItems = Object.values(allCandidates).flat();

  let dashboard: CompanyDashboard | undefined;
  try {
    dashboard = await getCompanyDashboard(companyId, resolvedAsOfDate);
  } catch {
    // No FinancialSnapshot/FinancialState yet for this company as of this
    // date - absent, never fabricated. A brand-new connected-but-not-yet-
    // promoted company legitimately has no dashboard to show yet.
    dashboard = undefined;
  }

  return {
    companyId,
    asOfDate: resolvedAsOfDate,
    sourceConnections,
    documents: { total: documents.length, byType },
    documentChain: { supersessionPairs, unconfirmedRelationships },
    reviewProgress,
    coverage,
    conflicts: reconciliation.groups.filter((g) => g.classification !== "MATCH" && g.classification !== "MISSING_SOURCE"),
    reviewItems,
    staleness: reconciliation.staleness,
    onboardingStatus: company.onboardingStatus,
    dashboard,
    documentDetails,
  };
}
