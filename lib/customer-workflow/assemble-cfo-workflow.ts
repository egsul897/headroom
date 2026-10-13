/**
 * Server-side assembler for the CFO product workflow.
 *
 * Authorization runs BEFORE any sensitive loader. On denial, returns immediately
 * without loading documents, financials, approvals, or covenant intelligence.
 *
 * Capacity: consumes a real ProductCapacityView (or VerifiedRemainingResult →
 * toProductCapacityView) when supplied. Never manufactures PRODUCTION_AUTHORITATIVE /
 * AVAILABLE / COMPLETE / AUTHENTIC from a dashboard boolean.
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
import {
  toProductCapacityView,
  type ProductCapacityView,
} from "@/lib/capacity/product-capacity-view";
import type { VerifiedRemainingResult } from "@/lib/capacity/verified-remaining";
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
import {
  gateWorkspaceAccess,
  loadWorkspaceCompanyIdentity,
  type WorkspaceCompanyIdentityLoader,
} from "./workspace-access";

export interface AssembledCfoWorkflowOk {
  ok: true;
  accessAllowed: true;
  companyId: string;
  accessBlockers: [];
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
  /** Shared capacity identity used by Position and Simulate. */
  sharedCapacityIdentity: {
    securedProductView: ProductCapacityView | null;
    unsecuredProductView: ProductCapacityView | null;
  };
  workflow: CfoWorkflowState;
  trustedIdentityStatus: typeof TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status;
}

export interface AssembledCfoWorkflowDenied {
  ok: false;
  accessAllowed: false;
  companyId: string;
  accessBlockers: string[];
  trustedIdentityStatus: typeof TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status;
}

export type AssembledCfoWorkflow = AssembledCfoWorkflowOk | AssembledCfoWorkflowDenied;

/** Injectable loaders — used to prove denial prevents invocation. */
export interface CfoWorkflowSensitiveLoaders {
  loadCapacityReadiness: typeof loadCapacityReadiness;
  loadRulebookReadiness: typeof loadRulebookReadiness;
  getDocumentDetails: typeof getDocumentDetails;
  listCustomerDocumentIntelligence: typeof listCustomerDocumentIntelligence;
  getLatestAmendmentPackage: typeof getLatestAmendmentPackage;
  loadCovenantReviewWorkspace: typeof loadCovenantReviewWorkspace;
  listReviewerApprovals: typeof listReviewerApprovals;
  getCompanyDashboard: typeof getCompanyDashboard;
  attemptVerifiedSimulate: typeof attemptVerifiedSimulate;
}

const defaultLoaders: CfoWorkflowSensitiveLoaders = {
  loadCapacityReadiness,
  loadRulebookReadiness,
  getDocumentDetails,
  listCustomerDocumentIntelligence,
  getLatestAmendmentPackage,
  loadCovenantReviewWorkspace,
  listReviewerApprovals,
  getCompanyDashboard,
  attemptVerifiedSimulate,
};

/**
 * Project dashboard modeled figures without upgrading authority.
 * Dashboard `utilizationRemainingAuthority` alone never certifies AVAILABLE.
 */
export function claimsFromDashboardSide(args: {
  modeledRemaining: number | null | undefined;
  binding: string[];
  missing: string[];
  /** Real shared product view only — never synthesized from dashboard flags. */
  productView?: ProductCapacityView | null;
  /**
   * @deprecated Ignored. Kept so call-sites that previously passed a dashboard
   * boolean cannot accidentally restore synthetic authority via typo reuse.
   */
  productionAuthoritative?: boolean;
}): SeparatedCapacityClaims {
  void args.productionAuthoritative;
  if (args.productView) {
    return separateCapacityClaimsFromProductView(args.productView, {
      modeledAmountMillions: args.modeledRemaining ?? null,
      bindingRestrictions: args.binding,
      missingInputs: args.missing,
    });
  }
  return separateCapacityClaimsFromProductView(null, {
    modeledAmountMillions: args.modeledRemaining ?? null,
    bindingRestrictions: args.binding,
    missingInputs: [
      ...args.missing,
      "No verified ProductCapacityView supplied — verified remaining refused. Dashboard authority flags do not certify AVAILABLE.",
    ],
  });
}

/** True when a dashboard-looking flag alone must not publish AVAILABLE. */
export function dashboardFlagAloneCannotPublishAvailable(args: {
  utilizationRemainingAuthority?: string | null;
  productView?: ProductCapacityView | null;
}): boolean {
  const flagLooksAuthoritative = args.utilizationRemainingAuthority === "PRODUCTION_AUTHORITATIVE";
  if (!flagLooksAuthoritative) return true;
  // Even with the flag, without a real product view that mayPublishAvailable, refuse.
  if (!args.productView || args.productView.mayPublishAvailable !== true) return true;
  return false;
}

export async function assembleCfoWorkflow(args: {
  companyId: string;
  principal?: unknown;
  simulateAmountMillions?: number;
  simulateKind?: UnifiedTxnKind;
  evaluationDate?: string;
  /**
   * Optional real capacity views from the shared verified-remaining path
   * (Agent 2 / product-capacity-view). Never invented here.
   */
  productCapacityBySide?: {
    secured?: ProductCapacityView | null;
    unsecured?: ProductCapacityView | null;
  };
  /** Optional raw verified-remaining results — projected via toProductCapacityView. */
  verifiedRemainingBySide?: {
    secured?: VerifiedRemainingResult | null;
    unsecured?: VerifiedRemainingResult | null;
  };
  loaders?: Partial<CfoWorkflowSensitiveLoaders>;
  /** Injectable company identity loader (tests / offline). */
  companyIdentityLoader?: WorkspaceCompanyIdentityLoader;
  /** Test hook: incremented only when sensitive loaders are about to run. */
  onSensitiveLoad?: () => void;
}): Promise<AssembledCfoWorkflow> {
  const companyId = args.companyId;
  const loaders = { ...defaultLoaders, ...args.loaders };
  const identityLoader = args.companyIdentityLoader ?? loadWorkspaceCompanyIdentity;

  // 1) Minimal identity for the gate (id + tenantKind only).
  const identity = await identityLoader(companyId);
  const access = await gateWorkspaceAccess({
    companyId,
    principal: args.principal,
    companyIdentity: identity,
    companyIdentityLoader: identityLoader,
  });

  // 2) Stop immediately — no documents / financials / approvals / intelligence.
  if (!access.allowed) {
    return {
      ok: false,
      accessAllowed: false,
      companyId,
      accessBlockers: access.blockers,
      trustedIdentityStatus: TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status,
    };
  }

  args.onSensitiveLoad?.();

  const [
    readiness,
    rulebook,
    documents,
    intelligence,
    amendment,
    reviewWs,
    approvals,
  ] = await Promise.all([
    loaders.loadCapacityReadiness(companyId),
    loaders.loadRulebookReadiness(companyId),
    loaders.getDocumentDetails(companyId),
    loaders.listCustomerDocumentIntelligence(companyId),
    loaders.getLatestAmendmentPackage(companyId),
    loaders.loadCovenantReviewWorkspace(companyId).catch(() => null),
    loaders.listReviewerApprovals(companyId).catch(() => []),
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
    dashboard = await loaders.getCompanyDashboard(companyId);
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

  const securedProductView =
    args.productCapacityBySide?.secured ??
    (args.verifiedRemainingBySide?.secured
      ? toProductCapacityView("POSITION", args.verifiedRemainingBySide.secured)
      : null);
  const unsecuredProductView =
    args.productCapacityBySide?.unsecured ??
    (args.verifiedRemainingBySide?.unsecured
      ? toProductCapacityView("POSITION", args.verifiedRemainingBySide.unsecured)
      : null);

  const securedClaims = claimsFromDashboardSide({
    modeledRemaining: dashboard?.capacity.secured.remainingCapacity,
    binding: [
      dashboard?.capacity.secured.packageAuthoritative?.bindingProvisionCode,
      dashboard?.capacity.secured.binding?.documentName,
    ].filter((x): x is string => Boolean(x)),
    missing: missingBase,
    productView: securedProductView,
  });

  const unsecuredClaims = claimsFromDashboardSide({
    modeledRemaining: dashboard?.capacity.unsecured.remainingCapacity,
    binding: [
      dashboard?.capacity.unsecured.packageAuthoritative?.bindingProvisionCode,
      dashboard?.capacity.unsecured.binding?.documentName,
    ].filter((x): x is string => Boolean(x)),
    missing: missingBase,
    productView: unsecuredProductView,
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

  const verified = await loaders.attemptVerifiedSimulate({
    companyId,
    evaluationDate,
    amountMillions,
    kind,
    verifiedPackage: null,
  });

  // Simulate uses the same secured capacity claims identity as Position.
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
    ok: true,
    accessAllowed: true,
    companyId,
    accessBlockers: [],
    upload,
    analyze,
    review,
    position,
    simulate,
    audit,
    capacityBySide: { secured: securedClaims, unsecured: unsecuredClaims },
    sharedCapacityIdentity: {
      securedProductView,
      unsecuredProductView,
    },
    workflow,
    trustedIdentityStatus: TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status,
  };
}
