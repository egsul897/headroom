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
  claim: CapacityClaimView;
  operativeSection: string;
  authorityStatus: VerifiedCovenantCalculation["authorityStatus"];
  refusalReason: string | null;
  /** True when claim is gross/modeled — never customer AVAILABLE. */
  mayPublishAvailable: boolean;
  /**
   * Provenance of the numeric figure:
   * - MODELED_LEAF: evaluateProvision over hand-encoded CovenantProvisionInput
   * - SOURCE_BACKED_COMPILED_GROSS: verified fixed-dollar IR gross from operative text
   */
  valueProvenance: "MODELED_LEAF" | "SOURCE_BACKED_COMPILED_GROSS";
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
    status: "EXECUTABLE_PATH_AVAILABLE",
    canEvaluateExecutableCapacity: true,
    capacityAuthority: "LEGACY_ENGINE",
    analyzedDocumentCount: 2,
    summaryCount: slice.covenants.length,
    permissionCount: slice.covenants.length,
    unverifiedPermissionCount: 0,
    provisionCount: slice.covenants.length,
    hasFinancialSnapshot: slice.financialEvidence.metricsPresent.length > 0,
    ns4ApprovedSnapshotCount: 0,
    approvedNorthStarSnapshotCount: 0,
    contractLedgerActiveCount: 0,
    phase3TrustedUnitCount: 0,
    phase3TrustedRuleCount: 0,
    headline: "Authentic Matthews evidence — modeled capacity via shared covenant-engine",
    blockers: [
      "No NS-4 APPROVED financial snapshot — production remaining unavailable.",
      "No reviewer-confirmed utilization completeness certificate.",
      `Trusted-issuer activation: ${slice.utilization.trustedIssuerActivation}.`,
    ],
    guidance:
      "Show modeled authentic numbers with MODELED / NOT_PRODUCTION_AUTHORITATIVE labels. Refuse AVAILABLE remaining.",
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
  // Secured Indenture composition must not be posted as remainingCapacity when
  // acceptance labels it HYPOTHETICAL_UNVERIFIED_SECURED_COMPOSITION (PR #304 D4).
  const publish = opts?.publishRemaining !== false;
  return {
    amount: 0,
    secured,
    remainingCapacity: publish ? remaining ?? undefined : undefined,
    packageAuthoritative: {
      remainingCapacity: publish ? remaining ?? null : null,
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
      // D4: do not publish hypothetical secured composition as remainingCapacity.
      secured: capacitySide(
        modeledSecured,
        true,
        flat?.governingDocumentName ?? null,
        flat?.code ?? null,
        {
          publishRemaining:
            slice.securedCompositionAuthority !== "HYPOTHETICAL_UNVERIFIED_SECURED_COMPOSITION",
        },
      ),
      unsecured: capacitySide(undefined, false, null, null),
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

  // Publication honesty (D3a/D3b):
  // - Never convert null remaining into a REMAINING/AVAILABLE claim via modeledCapacityMm.
  // - When remaining is null, publish modeledCapacityMm only as GROSS_CONTRACTUAL.
  // - When remaining is explicit (structural NEW=0 / attributed), still never AVAILABLE —
  //   publish GROSS_CONTRACTUAL / MODELED. Ratio modeled rooms are gross/modeled, not remaining.
  const hasExplicitRemaining = c.remainingCapacityMm != null;
  const amount = hasExplicitRemaining ? c.remainingCapacityMm : c.modeledCapacityMm;

  const claimKind =
    amount == null
      ? ("UNAVAILABLE" as const)
      : ("GROSS_CONTRACTUAL" as const); // restricted slice: never REMAINING/AVAILABLE

  const claim = presentCapacityClaim({
    claimKind,
    amountMillions: amount,
    remainingIsAuthoritative: false,
    publicationLabel: "NOT_PRODUCTION_AUTHORITATIVE",
    unavailableReason: amount == null ? c.confidenceNote : null,
  });

  return {
    label: c.basketName,
    code: c.code,
    amountMillions: amount,
    claim,
    operativeSection: c.operativeSection,
    authorityStatus: c.authorityStatus,
    refusalReason: isProductionRefused
      ? "Production remaining refused — incomplete utilization completeness / trusted-issuer BLOCKED."
      : !hasExplicitRemaining
        ? "Modeled capacity published as GROSS/MODELED only — remaining unknown (no modeled→remaining fallback)."
        : null,
    mayPublishAvailable: false, // authentic slice never publishes customer AVAILABLE
    valueProvenance: "MODELED_LEAF",
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
        ? `Verified executable compile refused (${u.valueClass}).`
        : null,
  });

  return {
    label: `VE compiled gross — ${u.sourceSectionRef}`,
    code: `ve:${u.candidateId}`,
    amountMillions: amount,
    claim,
    operativeSection: u.sourceSectionRef,
    authorityStatus: "GROSS_ONLY_UTILIZATION_INCOMPLETE",
    refusalReason:
      "SOURCE_BACKED_COMPILED_GROSS via fixed-dollar VE IR — production remaining refused; not netted modeled room.",
    mayPublishAvailable: false,
    valueProvenance: "SOURCE_BACKED_COMPILED_GROSS",
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

  // Harden: no metric on this authentic slice may publish AVAILABLE.
  for (const m of [...connectedMetrics, ...verifiedExecutableMetrics]) {
    if (m.claim.claimLabel.includes("AVAILABLE") || m.mayPublishAvailable) {
      throw new Error(`False favorable AVAILABLE publication blocked for ${m.code}`);
    }
    if (m.claim.status === "VERIFIED_EXECUTABLE") {
      throw new Error(`Customer VERIFIED_EXECUTABLE status blocked for ${m.code} (gross/modeled only)`);
    }
  }

  if (verifiedExecutableCompile.productionCapacityPublished) {
    throw new Error("Production capacity publication blocked on authentic Matthews slice");
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

/** Registry: only packages with authentic evidence may return a slice for Position. */
export function hasAuthenticPositionSlice(companyId: string): boolean {
  return companyId === MATTHEWS_POSITION_COMPANY_ID;
}
