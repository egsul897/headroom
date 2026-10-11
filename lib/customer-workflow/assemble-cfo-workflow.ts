/**
 * Server-side assembler for the CFO product workflow.
 * Loads existing services and projects truthful presentation models.
 * No issuer-specific companyId branches. No fixture fill for missing capacity.
 */

import { getCompanyDashboard, getDocumentDetails } from "@/lib/dashboard-service";
import { FinancialIdentityError } from "@/lib/financial-identity";
import {
  getLatestAmendmentPackage,
  listCustomerDocumentIntelligence,
} from "@/lib/product/customer-intelligence/load";
import { loadCapacityReadiness } from "@/lib/product/customer-intelligence/capacity-readiness";
import { loadRulebookReadiness } from "@/lib/product/customer-intelligence/rulebook-readiness";
import { loadCovenantReviewWorkspace } from "@/lib/product/customer-intelligence/covenant-review";
import { listReviewerApprovals } from "@/lib/product/customer-intelligence/reviewer-approvals";
import {
  attemptVerifiedSimulate,
  type UnifiedTxnKind,
} from "@/lib/product/unified-position/certified-simulate-bridge";
import { TRUSTED_IDENTITY_PRODUCTION_ACTIVATION } from "@/lib/capacity/identity/activation";
import { buildUploadPackageView, type UploadPackageView } from "./upload-view";
import { buildAnalyzeView, type AnalyzeViewModel } from "./analyze-view";
import { buildEvidenceReviewView } from "./evidence-view";
import { buildReviewView, type ReviewViewModel } from "./review-view";
import { buildPositionView, type PositionViewModel } from "./position-view";
import { buildSimulateView, type SimulateViewModel } from "./simulate-view";
import { buildAuditView, type AuditViewModel } from "./audit-view";
import {
  separateCapacityClaimsFromProductView,
  type SeparatedCapacityClaims,
} from "./capacity-state";
import { buildCfoWorkflowState, type CfoWorkflowState } from "./workflow-state";
import { gateWorkspaceAccess } from "./workspace-access";
import type { ProductCapacityView } from "@/lib/capacity/product-capacity-view";

export interface AssembledCfoWorkflow {
  companyId: string;
  accessAllowed: boolean;
  accessBlockers: string[];
  upload: UploadPackageView;
  analyze: AnalyzeViewModel;
  review: ReviewViewModel;
  position: PositionViewModel;
  simulate: SimulateViewModel;
  audit: AuditViewModel;
  capacityBySide: {
    secured: SeparatedCapacityClaims;
    unsecured: SeparatedCapacityClaims;
  };
  workflow: CfoWorkflowState;
  trustedIdentityStatus: typeof TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status;
}

function claimsFromDashboardSide(args: {
  modeledRemaining: number | null | undefined;
  productionAuthoritative: boolean;
  binding: string[];
  missing: string[];
  productView?: ProductCapacityView | null;
}): SeparatedCapacityClaims {
  if (args.productView) {
    return separateCapacityClaimsFromProductView(args.productView, {
      modeledAmountMillions: args.modeledRemaining ?? null,
      bindingRestrictions: args.binding,
      missingInputs: args.missing,
    });
  }
  // Synthesize a minimal product view only when production-authoritative remaining
  // is already stamped by the shared engine — never invent figures from null.
  if (
    args.productionAuthoritative &&
    args.modeledRemaining != null &&
    Number.isFinite(args.modeledRemaining)
  ) {
    const synthetic: ProductCapacityView = {
      surface: "POSITION",
      capacityRuleId: "dashboard-shared-engine",
      asOf: "",
      grossCapacity: null,
      grossUnlimited: false,
      knownUtilization: null,
      unknownUtilization: false,
      utilizationKnowledge: "COMPLETE",
      supportedRemainingCapacity: args.modeledRemaining,
      governingConditions: args.binding,
      crossDocumentConstraints: [],
      sourceCitations: [],
      certificationStatus: "PRODUCTION_AUTHORITATIVE",
      publicationLabel: "AVAILABLE",
      remainingStatus: "REMAINING_SUPPORTED",
      mayPublishAvailable: true,
      blockers: args.missing,
      note: "Production-authoritative remaining from shared dashboard engine.",
      authenticityOfUtilization: "AUTHENTIC",
    };
    return separateCapacityClaimsFromProductView(synthetic, {
      modeledAmountMillions: args.modeledRemaining,
      bindingRestrictions: args.binding,
      missingInputs: args.missing,
    });
  }
  return separateCapacityClaimsFromProductView(null, {
    modeledAmountMillions: args.modeledRemaining ?? null,
    bindingRestrictions: args.binding,
    missingInputs: [
      ...args.missing,
      "Shared ProductCapacityView not supplied — verified remaining withheld (not invented).",
    ],
  });
}

export async function assembleCfoWorkflow(args: {
  companyId: string;
  principal?: unknown;
  simulateAmountMillions?: number;
  simulateKind?: UnifiedTxnKind;
  evaluationDate?: string;
}): Promise<AssembledCfoWorkflow> {
  const companyId = args.companyId;
  const access = await gateWorkspaceAccess({
    companyId,
    principal: args.principal,
  });

  const [
    readiness,
    rulebook,
    documents,
    intelligence,
    amendment,
    reviewWs,
    approvals,
  ] = await Promise.all([
    loadCapacityReadiness(companyId),
    loadRulebookReadiness(companyId),
    getDocumentDetails(companyId),
    listCustomerDocumentIntelligence(companyId),
    getLatestAmendmentPackage(companyId),
    loadCovenantReviewWorkspace(companyId).catch(() => null),
    listReviewerApprovals(companyId).catch(() => []),
  ]);

  const intelByDoc = new Map(intelligence.map((i) => [i.documentId, i]));

  const upload = buildUploadPackageView({
    companyId,
    documents: documents.map((d) => {
      const intel = intelByDoc.get(d.id);
      return {
        id: d.id,
        name: d.name,
        type: d.type,
        role: d.type,
        analysisOk: intel?.analysisOk,
        processingStatus: intel?.processingStatus,
        extractionStatus: intel?.extractionStatus ?? null,
        analysisError: intel?.analysisError ?? null,
        covenantItemCount: intel?.covenantItemCount,
      };
    }),
    operativeAuthorityUncertainty: amendment?.unresolvedReasons ?? [],
    amendmentUnresolved: amendment?.operativeResolution === "UNRESOLVED_PRECEDENCE",
  });

  const analyze = buildAnalyzeView({
    companyId,
    upload,
    canEvaluateExecutableCapacity: readiness.canEvaluateExecutableCapacity,
    compilationLimitation: readiness.canEvaluateExecutableCapacity
      ? null
      : readiness.headline,
  });

  const decisionByKey = new Map(approvals.map((a) => [`${a.sourceId}|${a.sectionRef}`, a]));
  const clauses =
    reviewWs?.categories.flatMap((c) =>
      c.items.slice(0, 12).map((item) => {
        const decision = decisionByKey.get(`${item.sourceId}|${item.sectionRef}`);
        return {
          sourceId: item.sourceId,
          sectionRef: item.sectionRef,
          heading: item.heading,
          posture: item.posture,
          documentTitle: item.documentTitle,
          citation: item.sourceCitation ?? null,
          unresolvedQuestions: item.unresolvedQuestions ?? [],
          decision:
            (decision?.decision as "ACCEPTED" | "EDITED" | "REJECTED" | "PENDING" | undefined) ??
            null,
        };
      }),
    ) ?? [];

  const evidence = buildEvidenceReviewView({
    companyId,
    documents: documents.map((d) => {
      const intel = intelByDoc.get(d.id);
      return {
        id: d.id,
        name: d.name,
        type: d.type,
        analysisOk: intel?.analysisOk,
        processingStatus: intel?.processingStatus,
        covenantItemCount: intel?.covenantItemCount,
        extractionStatus: intel?.extractionStatus ?? null,
        provisionalIdentity:
          intel?.extractionStatus === "PROVISIONAL" ||
          /provisional|ambiguous|unresolved.?identity/i.test(String(intel?.processingStatus ?? "")),
      };
    }),
    clauses,
    amendment: amendment
      ? {
          operativeResolution: amendment.operativeResolution,
          unresolvedReasons: amendment.unresolvedReasons,
          askGuidance: amendment.askGuidance,
        }
      : null,
    verificationEvidence: [
      `Capacity authority: ${readiness.capacityAuthority}`,
      `Phase 3 trusted units: ${readiness.phase3TrustedUnitCount}`,
      `NS-4 APPROVED snapshots: ${readiness.approvedNorthStarSnapshotCount}`,
      `Active 4C ledger usages: ${readiness.contractLedgerActiveCount}`,
      `Trusted identity: ${TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status}`,
    ],
    readinessBlockers: readiness.blockers,
  });

  const review = buildReviewView({
    companyId,
    evidence,
    rulebook,
    readiness,
  });

  let dashboard = null;
  let dashboardError: string | null = null;
  try {
    dashboard = await getCompanyDashboard(companyId);
  } catch (err) {
    if (err instanceof FinancialIdentityError) {
      dashboardError =
        err.code === "AMBIGUOUS"
          ? "Financial identity AMBIGUOUS — competing same-date snapshots; capacity withheld."
          : "No authenticated financial snapshot — engine position unavailable (not zero).";
    } else {
      dashboardError = "Position dashboard unavailable — fail closed; no invented figures.";
    }
  }

  const missingBase = [
    ...readiness.blockers,
    ...(dashboardError ? [dashboardError] : []),
  ];

  const securedClaims = claimsFromDashboardSide({
    modeledRemaining: dashboard?.capacity.secured.remainingCapacity,
    productionAuthoritative:
      dashboard?.capacity.secured.utilizationRemainingAuthority === "PRODUCTION_AUTHORITATIVE",
    binding: [
      dashboard?.capacity.secured.packageAuthoritative?.bindingProvisionCode,
      dashboard?.capacity.secured.binding?.documentName,
    ].filter((x): x is string => Boolean(x)),
    missing: missingBase,
  });

  const unsecuredClaims = claimsFromDashboardSide({
    modeledRemaining: dashboard?.capacity.unsecured.remainingCapacity,
    productionAuthoritative:
      dashboard?.capacity.unsecured.utilizationRemainingAuthority === "PRODUCTION_AUTHORITATIVE",
    binding: [
      dashboard?.capacity.unsecured.packageAuthoritative?.bindingProvisionCode,
      dashboard?.capacity.unsecured.binding?.documentName,
    ].filter((x): x is string => Boolean(x)),
    missing: missingBase,
  });

  const position = buildPositionView({
    companyId,
    dashboard,
    readiness,
    rulebook,
    dashboardError,
    separatedClaims: { secured: securedClaims, unsecured: unsecuredClaims },
  });

  const evaluationDate =
    args.evaluationDate ??
    (dashboard?.asOfDate ? dashboard.asOfDate.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
  const amountMillions = args.simulateAmountMillions ?? 0;
  const kind = args.simulateKind ?? "SECURED_DEBT";

  const verified = await attemptVerifiedSimulate({
    companyId,
    evaluationDate,
    amountMillions,
    kind,
    verifiedPackage: null,
  });

  const simulate = buildSimulateView({
    companyId,
    amountMillions,
    currency: "USD",
    verified,
    effects: null,
    preCapacity: securedClaims,
    postCapacity: null,
    readinessBlockers: readiness.blockers,
  });

  const audit = buildAuditView({
    companyId,
    analyze,
    review,
    capacity: securedClaims,
    asOfDate: position.asOfDate,
  });

  const workflow = buildCfoWorkflowState({
    companyId,
    upload,
    analyze,
    review,
    position,
    simulate,
    audit,
    capacity: securedClaims,
  });

  return {
    companyId,
    accessAllowed: access.allowed,
    accessBlockers: access.allowed ? [] : access.blockers,
    upload,
    analyze,
    review,
    position,
    simulate,
    audit,
    capacityBySide: { secured: securedClaims, unsecured: unsecuredClaims },
    workflow,
    trustedIdentityStatus: TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status,
  };
}
