/**
 * Bridge authentic vertical-slice outputs into the existing Position architecture.
 *
 * Uses buildPositionView + presentCapacityClaim — never invents AVAILABLE or
 * hardcodes issuer arithmetic in the UI layer. When Neon/dashboard is unavailable,
 * assembles a presentation model from the in-memory slice evaluation.
 */

import { buildPositionView, type PositionViewModel } from "@/lib/customer-workflow/position-view";
import { presentCapacityClaim, type CapacityClaimView } from "@/lib/customer-workflow/status-contract";
import type { CapacityReadiness } from "@/lib/product/customer-intelligence/capacity-readiness";
import type { RulebookReadiness } from "@/lib/product/customer-intelligence/rulebook-readiness";
import type { CompanyDashboard } from "@/lib/dashboard-service";
import type { PostTransactionCapacitySimulation } from "@/lib/covenant-engine";
import type { VerticalSliceEvaluation, VerifiedCovenantCalculation } from "./evaluate-covenants";
import {
  compileMatthewsPhase3DashboardBridge,
  type Phase3CompileBridgeResult,
} from "./phase3-compile-bridge";
import {
  compileMatthewsVerifiedExecutableBridge,
  type VerifiedExecutableCompileBridgeResult,
  type VerifiedExecutableCompileUnit,
} from "./verified-executable-compile-bridge";
import { MATTHEWS_POSITION_COMPANY_ID } from "./package-matthews";

export interface DashboardConnectedMetric {
  label: string;
  code: string;
  amountMillions: number | null;
  /** Explicit modeled capacity — never coalesced from remaining. */
  modeledCapacityMm: number | null;
  /** Explicit remaining — null means UNKNOWN/NOT_VERIFIED, never invent zero. */
  remainingCapacityMm: number | null;
  claim: CapacityClaimView;
  remainingClaim: CapacityClaimView;
  operativeSection: string;
  authorityStatus: VerifiedCovenantCalculation["authorityStatus"];
  refusalReason: string | null;
  /** True when claim is gross/modeled — never customer AVAILABLE. */
  mayPublishAvailable: boolean;
  /**
   * Provenance of the numeric figure:
   * - MODELED_LEAF: evaluateProvision over hand-encoded CovenantProvisionInput (quarantined)
   * - SOURCE_BACKED_COMPILED_GROSS: verified fixed-dollar IR gross from operative text
   */
  valueProvenance: "MODELED_LEAF" | "SOURCE_BACKED_COMPILED_GROSS";
  /** Leaf fixtures are quarantined from production calculation / publication authority. */
  quarantinedFromProductionCalculation: boolean;
}

export interface AuthenticPositionSlice {
  companyId: string;
  packageKey: string;
  asOf: string;
  positionView: PositionViewModel;
  connectedMetrics: DashboardConnectedMetric[];
  /**
   * Verified-executable compiled gross metrics feeding Position (subset).
   * Separate from leaf-modeled connectedMetrics for honesty labeling.
   */
  verifiedExecutableMetrics: DashboardConnectedMetric[];
  missingInputs: string[];
  productionRemainingPublished: boolean;
  /** Autonomous Phase 3 compile (source → OA → deterministic extraction). */
  phase3Compile: Phase3CompileBridgeResult;
  autonomouslyCompiledDisplayedCount: number;
  /** Verified fixed-dollar compile → evaluateVerifiedCapacity → Position (gross only). */
  verifiedExecutableCompile: VerifiedExecutableCompileBridgeResult;
  verifiedExecutableUnitsFeedingPosition: number;
}

function readinessFromSlice(slice: VerticalSliceEvaluation): CapacityReadiness {
  return {
    companyId: slice.companyId,
    // Restricted fixture slice: modeled/gross arithmetic only — not production-executable.
    status: "DISCOVERY_ONLY",
    canEvaluateExecutableCapacity: false,
    capacityAuthority: "LEGACY_ENGINE",
    analyzedDocumentCount: 2,
    summaryCount: slice.covenants.length,
    permissionCount: 0,
    unverifiedPermissionCount: 0,
    provisionCount: slice.covenants.length,
    hasFinancialSnapshot: slice.financialEvidence.metricsPresent.length > 0,
    financialSnapshotStatus: "UNKNOWN",
    ns4ApprovedSnapshotCount: 0,
    approvedNorthStarSnapshotCount: 0,
    contractLedgerActiveCount: 0,
    phase3TrustedUnitCount: 0,
    phase3TrustedRuleCount: 0,
    headline: "Authentic Matthews evidence — modeled/gross fixture capacity (not production-executable)",
    blockers: [
      "No NS-4 APPROVED financial snapshot — production remaining unavailable.",
      "No reviewer-confirmed utilization completeness certificate.",
      "No Permission / executable compiler rows for this restricted slice.",
      `Trusted-issuer activation: ${slice.utilization.trustedIssuerActivation}.`,
    ],
    guidance:
      "Show modeled authentic numbers with MODELED / GROSS_CONTRACTUAL labels. Refuse AVAILABLE remaining.",
  };
}

function rulebookFromSlice(slice: VerticalSliceEvaluation): RulebookReadiness {
  // D3c: do not fabricate REVIEWED / executable counts — leaf modeled rows are
  // INTERPRETED engineering artifacts, not counsel-reviewed permissions.
  return {
    companyId: slice.companyId,
    stage: "INTERPRETED",
    discoveredSummaries: slice.covenants.length,
    interpretedProvisions: slice.covenants.length,
    reviewedPermissions: 0,
    executablePermissions: 0,
    provisionRows: slice.covenants.length,
    blockers: [
      "No counsel REVIEWED permissions — leaf evaluateProvision path only.",
      "Phase-3 certified executable IR not bound for this package.",
      "Fixed-dollar VE compile feeds GROSS only; ratio/structural rows remain modeled leaves.",
    ],
    headline: "Engineering-interpreted Matthews permissions (not counsel-reviewed)",
    note: "PROVISIONAL — ENGINEERING-INTERPRETED ONLY; stage is INTERPRETED not REVIEWED.",
  };
}

function capacitySide(
  remaining: number | null | undefined,
  secured: boolean,
  bindingName: string | null,
  bindingCode: string | null,
  opts?: { publishRemaining?: boolean },
): PostTransactionCapacitySimulation {
  // Priority A: remaining is published only when explicitly opted in.
  // Null/undefined never becomes zero or modeled remaining.
  const publish = opts?.publishRemaining === true && remaining != null;
  return {
    amount: 0,
    secured,
    remainingCapacity: publish ? remaining : undefined,
    packageAuthoritative: {
      remainingCapacity: publish ? remaining : null,
      bindingDocumentName: bindingName,
      bindingProvisionCode: bindingCode,
      authority: "MODELED_CROSS_DOCUMENT",
      label: "MODELED / EVALUATION_SEED_NOT_NS4_APPROVED",
      solverNativeRemaining: null,
      solverAuthority: "NON_AUTHORITATIVE_DIAGNOSTIC",
      solverIsFalseFavorable: false,
    },
    utilizationRemainingAuthority: "NOT_PRODUCTION_AUTHORITATIVE",
    perDocument: [],
  };
}

/**
 * Minimal dashboard stub so buildPositionView can assemble instruments/sides.
 * Only fields consumed by buildPositionView / Position page are populated.
 */
function dashboardStubFromSlice(slice: VerticalSliceEvaluation): CompanyDashboard {
  const flat = slice.covenants.find((c) => c.code === "ind_permitted_debt_1a_flat");
  const modeledSecured = slice.indentureSecuredCompositionMm;
  const asOf = new Date(`${slice.asOf}T00:00:00.000Z`);

  return {
    company: {
      id: MATTHEWS_POSITION_COMPANY_ID,
      name: "Matthews International Corporation",
      ticker: "MATW",
      onboardingStatus: "ACTIVE",
      tenantKind: "EVALUATION",
    },
    asOfDate: asOf,
    // buildPositionView only reads capitalStructure.facilities (+ asOfDate/capacity/legalReview).
    // Full Facility / FinancialPosition graphs are not reconstructed here.
    financialPosition: {
      companyId: MATTHEWS_POSITION_COMPANY_ID,
      asOfDate: asOf,
      capitalStructure: {
        companyId: MATTHEWS_POSITION_COMPANY_ID,
        asOfDate: asOf,
        facilities: [
          {
            facility: {
              id: "matw-revolver",
              name: "Revolving credit facility",
              facilityType: "REVOLVER",
              secured: true,
              governingDocumentId: "matw-credit-agreement-2020",
            },
            outstandingPrincipal: 484.083,
          },
          {
            facility: {
              id: "matw-2027-notes",
              name: "8.625% Senior Secured Second Lien Notes due 2027",
              facilityType: "NOTES",
              secured: true,
              governingDocumentId: "matw-2027-second-lien-notes-indenture",
            },
            outstandingPrincipal: 294.799,
          },
        ],
      },
    } as CompanyDashboard["financialPosition"],
    capacity: {
      // D4 / Priority A.5: hypothetical secured composition never published as remaining.
      secured: capacitySide(modeledSecured, true, flat?.governingDocumentName ?? null, flat?.code ?? null, {
        publishRemaining: false,
      }),
      unsecured: capacitySide(null, false, null, null, { publishRemaining: false }),
    },
    documents: [
      {
        id: "matw-2027-second-lien-notes-indenture",
        name: "Indenture — 2027 Second Lien Notes",
        type: "INDENTURE",
        governs: "Notes",
        effectiveFrom: null,
        effectiveTo: null,
      },
      {
        id: "matw-credit-agreement-2020",
        name: "Third A&R Credit Agreement",
        type: "CREDIT_AGREEMENT",
        governs: "Revolver",
        effectiveFrom: null,
        effectiveTo: null,
      },
    ],
    legalReview: {
      goldenTestsTotal: 18,
      goldenTestsVerified: 0,
      permissionsTotal: slice.covenants.length,
      // D3c: do not claim permissionsVerified without counsel review evidence.
      permissionsVerified: 0,
    },
  };
}

function metricFromCovenant(c: VerifiedCovenantCalculation): DashboardConnectedMetric {
  const isProductionRefused =
    c.authorityStatus === "GROSS_ONLY_UTILIZATION_INCOMPLETE" ||
    c.authorityStatus === "PRODUCTION_REMAINING_REFUSED";

  // Priority A: never coalesce null remaining into modeled remaining.
  // Primary display uses modeledCapacityMm as GROSS_CONTRACTUAL; remaining stays separate.
  const modeled = c.modeledCapacityMm;
  const remaining = c.remainingCapacityMm;

  const claim = presentCapacityClaim({
    claimKind: modeled == null ? "UNAVAILABLE" : "GROSS_CONTRACTUAL",
    amountMillions: modeled,
    remainingIsAuthoritative: false,
    publicationLabel: "NOT_PRODUCTION_AUTHORITATIVE",
    unavailableReason: modeled == null ? c.confidenceNote : null,
  });

  const remainingClaim = presentCapacityClaim({
    claimKind: remaining == null ? "UNAVAILABLE" : "GROSS_CONTRACTUAL",
    amountMillions: remaining,
    remainingIsAuthoritative: false,
    publicationLabel: "NOT_PRODUCTION_AUTHORITATIVE",
    unavailableReason:
      remaining == null
        ? "Remaining capacity UNKNOWN / NOT_VERIFIED — missing utilization completeness, financial approval, or trusted-issuer (not zero)."
        : null,
  });

  return {
    label: c.basketName,
    code: c.code,
    amountMillions: modeled,
    modeledCapacityMm: modeled,
    remainingCapacityMm: remaining,
    claim,
    remainingClaim,
    operativeSection: c.operativeSection,
    authorityStatus: c.authorityStatus,
    refusalReason: isProductionRefused || remaining == null
      ? "Remaining UNKNOWN/NOT_VERIFIED — incomplete utilization / trusted-issuer BLOCKED (leaf quarantined)."
      : null,
    mayPublishAvailable: false,
    valueProvenance: "MODELED_LEAF",
    quarantinedFromProductionCalculation: true,
  };
}

function metricFromVerifiedExecutable(u: VerifiedExecutableCompileUnit): DashboardConnectedMetric {
  const amount = u.sourceBackedGrossCapacityMm;
  const claim = presentCapacityClaim({
    claimKind: amount != null ? "GROSS_CONTRACTUAL" : "UNAVAILABLE",
    amountMillions: amount,
    remainingIsAuthoritative: false,
    publicationLabel: "NOT_PRODUCTION_AUTHORITATIVE",
    unavailableReason:
      amount == null
        ? u.missingLegalStructure
          ? `UNSUPPORTED: ${u.missingLegalStructure}`
          : `Verified executable compile refused (${u.valueClass}).`
        : null,
  });
  const remainingClaim = presentCapacityClaim({
    claimKind: "UNAVAILABLE",
    amountMillions: null,
    remainingIsAuthoritative: false,
    publicationLabel: "NOT_PRODUCTION_AUTHORITATIVE",
    unavailableReason:
      "VE path publishes GROSS only — remaining requires completeness + trusted-issuer (UNKNOWN, not zero).",
  });

  return {
    label: `VE compiled gross — ${u.sourceSectionRef}`,
    code: `ve:${u.candidateId}`,
    amountMillions: amount,
    modeledCapacityMm: amount,
    remainingCapacityMm: null,
    claim,
    remainingClaim,
    operativeSection: u.sourceSectionRef,
    authorityStatus: "GROSS_ONLY_UTILIZATION_INCOMPLETE",
    refusalReason:
      u.missingLegalStructure != null
        ? `UNSUPPORTED — ${u.missingLegalStructure}`
        : "SOURCE_BACKED_COMPILED_GROSS via fixed-dollar VE IR — production remaining refused; not netted modeled room.",
    mayPublishAvailable: false,
    valueProvenance: "SOURCE_BACKED_COMPILED_GROSS",
    quarantinedFromProductionCalculation: false,
  };
}

/**
 * Connect slice evaluation → Position view model + per-covenant dashboard metrics.
 */
export function connectSliceToPosition(slice: VerticalSliceEvaluation): AuthenticPositionSlice {
  const readiness = readinessFromSlice(slice);
  const rulebook = rulebookFromSlice(slice);
  const dashboard = dashboardStubFromSlice(slice);
  const phase3Compile = compileMatthewsPhase3DashboardBridge(slice.asOf);
  const verifiedExecutableCompile = compileMatthewsVerifiedExecutableBridge(slice.asOf);

  const positionView = buildPositionView({
    companyId: MATTHEWS_POSITION_COMPANY_ID,
    dashboard,
    readiness,
    rulebook,
    dashboardError: null,
  });

  const connectedMetrics = slice.covenants.map(metricFromCovenant);
  const verifiedExecutableMetrics = verifiedExecutableCompile.verifiedExecutableUnits
    .filter((u) => u.feedsPosition)
    .map(metricFromVerifiedExecutable);

  for (const m of [...connectedMetrics, ...verifiedExecutableMetrics]) {
    if (m.claim.claimLabel.toLowerCase().includes("available (verified)") || m.mayPublishAvailable) {
      throw new Error(`False favorable AVAILABLE publication blocked for ${m.code}`);
    }
    if (m.claim.status === "VERIFIED_EXECUTABLE") {
      throw new Error(`Customer VERIFIED_EXECUTABLE status blocked for ${m.code} (gross/modeled only)`);
    }
    if (m.claim.claimKind === "REMAINING") {
      throw new Error(`REMAINING claimKind blocked on restricted slice for ${m.code}`);
    }
    // Priority A.1: null remaining must not appear as a numeric remainingClaim.
    if (m.remainingCapacityMm == null && m.remainingClaim.amountMillions != null) {
      throw new Error(`Null remaining coalesced into remainingClaim for ${m.code}`);
    }
  }

  if (verifiedExecutableCompile.productionCapacityPublished) {
    throw new Error("Production capacity publication blocked on authentic Matthews slice");
  }
  if (rulebook.stage === "REVIEWED" || rulebook.stage === "EXECUTABLE") {
    throw new Error("Fabricated REVIEWED/EXECUTABLE rulebook stage blocked");
  }

  return {
    companyId: MATTHEWS_POSITION_COMPANY_ID,
    packageKey: slice.packageKey,
    asOf: slice.asOf,
    positionView,
    connectedMetrics,
    verifiedExecutableMetrics,
    missingInputs: [
      ...positionView.missingInputs,
      ...slice.missingEvidence,
      ...verifiedExecutableCompile.limitations,
    ],
    productionRemainingPublished: false,
    phase3Compile,
    autonomouslyCompiledDisplayedCount: phase3Compile.autonomouslyCompiledDisplayedCount,
    verifiedExecutableCompile,
    verifiedExecutableUnitsFeedingPosition:
      verifiedExecutableCompile.verifiedExecutableUnitsFeedingPosition,
  };
}

/**
 * @deprecated Prefer `hasAuthenticPositionSlice` from `./run-slice` (Matthews leaf
 * + multipackage VE registry). Kept as Matthews-only predicate for callers that
 * specifically mean the full leaf dashboard path.
 */
export function hasMatthewsLeafPositionSlice(companyId: string): boolean {
  return companyId === MATTHEWS_POSITION_COMPANY_ID;
}

/** @deprecated Use run-slice.hasAuthenticPositionSlice (includes MHK VE feed). */
export function hasAuthenticPositionSlice(companyId: string): boolean {
  return companyId === MATTHEWS_POSITION_COMPANY_ID;
}
