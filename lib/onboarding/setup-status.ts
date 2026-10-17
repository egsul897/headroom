/**
 * Customer setup progress — what is still required before the dashboard can
 * show engine-backed figures. Read-only; never invents numbers or implies
 * Phase 3 / 4E certification.
 */

import { prisma } from "@/lib/prisma";
import { getReviewProgress } from "@/lib/onboarding/review";
import { getAnalysisReadinessForCompany } from "@/lib/contract-model/analysis";
import { loadPhase3TrustedRulebookStatus } from "@/lib/product/customer-intelligence/phase3-trusted-rulebook";
import { loadRulebookReadiness, type RulebookStage } from "@/lib/product/customer-intelligence/rulebook-readiness";
import { listReviewerApprovals } from "@/lib/product/customer-intelligence/reviewer-approvals";
import { listCustomerDocumentIntelligence } from "@/lib/product/customer-intelligence/load";
import type { OnboardingStatus } from "@prisma/client";

export interface CompanySetupStatus {
  companyId: string;
  companyName: string;
  onboardingStatus: OnboardingStatus;
  documentsUploaded: number;
  extractedDocuments: number;
  /** Phase 3 AnalysisRun covers the current document set. */
  analysisReady: boolean;
  analysisReason: string;
  pendingReview: number;
  readyToPromote: number;
  promoted: number;
  financialSnapshots: number;
  /** NS-4 APPROVED ContractInputSnapshot count (authoritative North Star store). */
  ns4ApprovedSnapshots: number;
  /**
   * Phase 3 VERIFIED SemanticTruthRecord count (existing trust gate).
   * Eligible trusted outputs when > 0 — never implies package CERTIFIED / 4E.
   */
  phase3TrustedUnitCount: number;
  phase3TrustedRuleCount: number;
  permissions: number;
  /** Promoted Permission rows still UNVERIFIED. */
  unverifiedPermissions: number;
  /**
   * Deterministic (no-LLM) counsel-review path: documents whose
   * customer-intelligence analysis succeeded, summary items produced,
   * and reviewer decisions recorded via the Rulebook. The wizard
   * routes review through the Rulebook (not the LLM extraction
   * queue) because the Rulebook works with no LLM credential.
   */
  deterministicAnalyzed: number;
  deterministicItems: number;
  deterministicDecisions: number;
  /** Exception-based review: summary units needing a counsel decision (non-routine). */
  deterministicExceptions: number;
  /** Exception units with a counsel decision. */
  deterministicExceptionDecisions: number;
  rulebookStage: RulebookStage;
  rulebookExecutablePermissions: number;
  /**
   * True when the legacy executable path can run. Never means Phase 3 CERTIFIED
   * or Phase 4E-certified capacity.
   */
  dashboardReady: boolean;
  /** Explicit honesty flag for UI copy. */
  capacityCertified: false;
}

export async function getCompanySetupStatus(companyId: string): Promise<CompanySetupStatus | null> {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return null;

  const [
    documentsUploaded,
    extractedDocuments,
    progress,
    financialSnapshots,
    permissions,
    unverifiedPermissions,
    analysis,
    ns4ApprovedSnapshots,
    readyToPromote,
    phase3,
    rulebook,
    approvals,
    intelligence,
  ] = await Promise.all([
    prisma.document.count({ where: { companyId } }),
    prisma.extractionRun.count({ where: { companyId } }),
    getReviewProgress(companyId),
    prisma.financialState.count({ where: { companyId } }),
    prisma.permission.count({ where: { companyId } }),
    prisma.permission.count({ where: { companyId, reviewStatus: "UNVERIFIED" } }),
    getAnalysisReadinessForCompany(companyId),
    prisma.contractInputSnapshot.count({ where: { companyId, status: "APPROVED" } }).catch(() => 0),
    // Approved/edited but not yet promoted — do not count already-promoted rows.
    prisma.extractionCandidate.count({
      where: { companyId, reviewStatus: { in: ["APPROVED", "EDITED"] }, promotedAt: null },
    }),
    loadPhase3TrustedRulebookStatus(companyId).catch(() => null),
    loadRulebookReadiness(companyId).catch(() => null),
    listReviewerApprovals(companyId).catch(() => []),
    listCustomerDocumentIntelligence(companyId).catch(() => []),
  ]);

  // Integration fix: the dashboard is ready when the company is
  // ACTIVE* + financials + Permissions + EITHER the LLM analysis is
  // ready OR the deterministic review is complete (rulebook
  // EXECUTABLE, or every discovered item has a reviewer decision).
  // The old form required analysis.ready (LLM-only), so the home
  // page's setup CTA nagged forever on the deterministic path.
  const deterministicReady = rulebook?.stage === "EXECUTABLE" || rulebook?.reviewComplete === true;
  const dashboardReady =
    (company.onboardingStatus === "ACTIVE" || company.onboardingStatus === "ACTIVE_WITH_LIMITATIONS") &&
    financialSnapshots > 0 &&
    permissions > 0 &&
    (analysis.ready || deterministicReady);

  return {
    companyId,
    companyName: company.name,
    onboardingStatus: company.onboardingStatus,
    documentsUploaded,
    extractedDocuments,
    analysisReady: analysis.ready,
    analysisReason: analysis.reason,
    pendingReview: progress.pending + progress.reviewRequired,
    readyToPromote,
    promoted: progress.promoted,
    financialSnapshots,
    ns4ApprovedSnapshots,
    phase3TrustedUnitCount: phase3?.trustedUnitCount ?? 0,
    phase3TrustedRuleCount: phase3?.trustedRuleCount ?? 0,
    permissions,
    unverifiedPermissions,
    deterministicAnalyzed: intelligence.filter((i) => i.analysisOk).length,
    deterministicItems: rulebook?.discoveredSummaries ?? 0,
    deterministicDecisions: approvals.length,
    deterministicExceptions: rulebook?.exceptionItems ?? 0,
    deterministicExceptionDecisions: rulebook?.exceptionDecisions ?? 0,
    rulebookStage: rulebook?.stage ?? "DISCOVERED",
    rulebookExecutablePermissions: rulebook?.executablePermissions ?? 0,
    dashboardReady,
    capacityCertified: false,
  };
}

export function nextSetupStep(status: CompanySetupStatus): {
  href: string;
  label: string;
  detail: string;
} {
  const id = status.companyId;
  if (status.documentsUploaded === 0) {
    return {
      href: `/${id}/onboarding/documents`,
      label: "Upload documents",
      detail: "Add the credit agreement, indenture, and latest compliance certificate or financials.",
    };
  }
  // Integration fix: "read" is satisfied when EITHER the deterministic
  // analysis ran on upload (no LLM credential needed) OR the LLM
  // extraction + contract analysis ran. A no-LLM company whose upload
  // analyzed deterministically must not be told to "run extraction"
  // — that action throws without an LLM key.
  if (status.deterministicAnalyzed === 0 && (status.extractedDocuments === 0 || !status.analysisReady)) {
    return {
      href: `/${id}/onboarding/documents`,
      label: "Read documents",
      detail: status.analysisReady
        ? "Run analysis so Headroom can extract covenants and proposed financial figures."
        : `No successful analysis yet (${status.analysisReason}). Re-analyze the uploaded documents from the Documents page; LLM extraction is optional.`,
    };
  }
  // Exception-based deterministic counsel review: the Rulebook.
  // Fires when exception items (non-routine) still lack a counsel
  // decision. Routine supported interpretations auto-accept as
  // system-accepted (never counsel-verified) and do not need
  // individual approval. This is the review path that works with
  // no LLM credential — decisions here compile executable Permissions.
  if (status.deterministicExceptions > 0 && status.deterministicExceptionDecisions < status.deterministicExceptions) {
    return {
      href: `/${id}/rulebook`,
      label: "Review exceptions",
      detail: `${status.deterministicExceptionDecisions} of ${status.deterministicExceptions} exception items reviewed. Routine interpretations are already system-accepted — accept, edit, or reject the exceptions to complete the executable rulebook.`,
    };
  }
  // LLM extraction-candidate review: only when the LLM analysis is
  // ready (otherwise the review page redirects back to documents)
  // and the queue has work — or when nothing is promoted anywhere
  // yet and the LLM path is the one with a ready analysis.
  if (
    status.pendingReview > 0 ||
    (status.analysisReady &&
      status.readyToPromote === 0 &&
      status.promoted === 0 &&
      status.permissions === 0)
  ) {
    return {
      href: `/${id}/onboarding/review`,
      label: "Review findings",
      detail: "Approve, edit, or reject what the software extracted. Nothing becomes operative until you do. Phase 3 analysis findings stay separate from legacy Permission promotion.",
    };
  }
  if (status.financialSnapshots === 0) {
    return {
      href: `/${id}/onboarding/financials`,
      label: "Confirm financials",
      detail: "Promote approved facts or enter the reporting-period figures. Approved facts also write the North Star NS-4 snapshot store.",
    };
  }
  if (status.onboardingStatus === "ONBOARDING") {
    return {
      href: `/${id}/onboarding/activate`,
      label: "Activate workspace",
      detail: "Promote approved candidates. Activation enables the legacy engine path — it is not Phase 3 / 4E certification.",
    };
  }
  const phase3Detail =
    status.phase3TrustedUnitCount > 0
      ? ` Phase 3 VERIFIED semantic units: ${status.phase3TrustedUnitCount} (${status.phase3TrustedRuleCount} rules) — not package CERTIFIED.`
      : "";
  const unverifiedDetail =
    status.unverifiedPermissions > 0
      ? ` ${status.unverifiedPermissions} UNVERIFIED Permission(s) on the legacy path.`
      : "";
  return {
    href: `/${id}`,
    label: "Open dashboard",
    detail:
      status.ns4ApprovedSnapshots > 0
        ? `Legacy engine figures with NS-4 APPROVED financial snapshots on file. Not Phase 4E-certified capacity.${phase3Detail}${unverifiedDetail}`
        : `Figures come from uploaded documents and approved financials (legacy engine · not certified Phase 4E).${phase3Detail}${unverifiedDetail}`,
  };
}
