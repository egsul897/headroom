/**
 * Package-agnostic Position feed from the autonomous fixed-dollar VE pipeline.
 *
 * Candidate discovery remains package-supplied. Compilation, capacity evaluation,
 * and Position metric publication share one path (runAutonomousCompilationPipeline).
 *
 * MHK and Matthews both use this for VE→Position. Full leaf dashboard evaluation
 * (financial fixture + evaluateProvision) remains Matthews-only — that is why
 * GENERALIZED_CALCULATION_PIPELINE_PROVEN stays NOT_PROVEN.
 */

import { buildPositionView, type PositionViewModel } from "@/lib/customer-workflow/position-view";
import { presentCapacityClaim } from "@/lib/customer-workflow/status-contract";
import type { CapacityReadiness } from "@/lib/product/customer-intelligence/capacity-readiness";
import type { RulebookReadiness } from "@/lib/product/customer-intelligence/rulebook-readiness";
import type { CompanyDashboard } from "@/lib/dashboard-service";
import {
  runAutonomousCompilationPipeline,
  type AutonomousCompilationPipelineResult,
  type RunAutonomousPipelineArgs,
} from "./autonomous-compilation-pipeline";
import type {
  AuthenticPositionSlice,
  DashboardConnectedMetric,
} from "./position-bridge";
import type { Phase3CompileBridgeResult } from "./phase3-compile-bridge";
import type { VerifiedExecutableCompileBridgeResult } from "./verified-executable-compile-core";
import { MHK_VE_COMPANY_ID, mhkVerifiedExecutableCandidates } from "./package-mhk-ve-candidates";
import { matthewsVerifiedExecutableCandidates } from "./verified-executable-compile-bridge";
import { MATTHEWS_POSITION_COMPANY_ID } from "./package-matthews";

const EMPTY_PHASE3 = (asOfDate: string): Phase3CompileBridgeResult => ({
  asOfDate,
  documentsCompiled: 0,
  structuralNodeCount: 0,
  deterministicFactCount: 0,
  compiledCovenants: [],
  autonomouslyCompiledDisplayedCount: 0,
  operativeAuthorityClassifications: [],
  productionAuthorityActive: false,
  trustedIdentityActivation: "BLOCKED",
  path: ["ve-position-feed-only"],
  limitations: [
    "VE Position feed does not run Phase 3 structure/OA/extraction for this package.",
    "Full leaf dashboard + Phase 3 display bridge remains Matthews-only.",
  ],
  structuralIndexVersion: "n/a",
});

function readinessVeOnly(companyId: string, feedingCount: number): CapacityReadiness {
  return {
    companyId,
    status: "DISCOVERY_ONLY",
    canEvaluateExecutableCapacity: false,
    capacityAuthority: "LEGACY_ENGINE",
    analyzedDocumentCount: 1,
    summaryCount: feedingCount,
    permissionCount: 0,
    unverifiedPermissionCount: 0,
    provisionCount: feedingCount,
    hasFinancialSnapshot: false,
    ns4ApprovedSnapshotCount: 0,
    approvedNorthStarSnapshotCount: 0,
    contractLedgerActiveCount: 0,
    phase3TrustedUnitCount: 0,
    phase3TrustedRuleCount: 0,
    headline: "Verified fixed-dollar VE → Position (GROSS only; no financial fixture)",
    blockers: [
      "No NS-4 APPROVED financial snapshot.",
      "No utilization completeness certificate.",
      "VE feed publishes SOURCE_BACKED_COMPILED_GROSS only.",
      "Trusted-issuer activation BLOCKED.",
    ],
    guidance: "Show compiled gross from operative text. Refuse AVAILABLE remaining.",
  };
}

function rulebookVeOnly(companyId: string, feedingCount: number): RulebookReadiness {
  return {
    companyId,
    stage: "INTERPRETED",
    discoveredSummaries: feedingCount,
    interpretedProvisions: feedingCount,
    reviewedPermissions: 0,
    executablePermissions: 0,
    provisionRows: feedingCount,
    blockers: [
      "No counsel REVIEWED permissions.",
      "VE fixed-dollar IR only — ratio/complex structures unsupported on this feed.",
    ],
    headline: "Engineering VE compile feed (not counsel-reviewed)",
    note: "PROVISIONAL — VE GROSS only.",
  };
}

function dashboardStubVeOnly(
  companyId: string,
  displayName: string,
  asOf: string,
): CompanyDashboard {
  const asOfDate = new Date(`${asOf}T00:00:00.000Z`);
  return {
    company: {
      id: companyId,
      name: displayName,
      ticker: companyId === MHK_VE_COMPANY_ID ? "MHK" : companyId.toUpperCase(),
      onboardingStatus: "ACTIVE",
      tenantKind: "EVALUATION",
    },
    asOfDate,
    financialPosition: {
      companyId,
      asOfDate,
      capitalStructure: {
        companyId,
        asOfDate,
        facilities: [],
      },
    } as CompanyDashboard["financialPosition"],
    capacity: {
      secured: {
        amount: 0,
        secured: true,
        packageAuthoritative: {
          remainingCapacity: null,
          bindingDocumentName: null,
          bindingProvisionCode: null,
          authority: "MODELED_CROSS_DOCUMENT",
          label: "VE_GROSS_ONLY_NO_REMAINING",
          solverNativeRemaining: null,
          solverAuthority: "NON_AUTHORITATIVE_DIAGNOSTIC",
          solverIsFalseFavorable: false,
        },
        utilizationRemainingAuthority: "NOT_PRODUCTION_AUTHORITATIVE",
        perDocument: [],
      },
      unsecured: {
        amount: 0,
        secured: false,
        packageAuthoritative: {
          remainingCapacity: null,
          bindingDocumentName: null,
          bindingProvisionCode: null,
          authority: "MODELED_CROSS_DOCUMENT",
          label: "VE_GROSS_ONLY_NO_REMAINING",
          solverNativeRemaining: null,
          solverAuthority: "NON_AUTHORITATIVE_DIAGNOSTIC",
          solverIsFalseFavorable: false,
        },
        utilizationRemainingAuthority: "NOT_PRODUCTION_AUTHORITATIVE",
        perDocument: [],
      },
    },
    documents: [],
    legalReview: {
      goldenTestsTotal: 0,
      goldenTestsVerified: 0,
      permissionsTotal: 0,
      permissionsVerified: 0,
    },
  };
}

function metricFromPipeline(
  m: AutonomousCompilationPipelineResult["positionMetrics"][number],
): DashboardConnectedMetric {
  const remainingClaim = presentCapacityClaim({
    claimKind: "UNAVAILABLE",
    amountMillions: null,
    remainingIsAuthoritative: false,
    publicationLabel: "NOT_PRODUCTION_AUTHORITATIVE",
    unavailableReason:
      "VE path publishes GROSS only — remaining requires completeness + trusted-issuer (UNKNOWN, not zero).",
  });
  return {
    label: `VE compiled gross — ${m.sourceSectionRef}`,
    code: m.code,
    amountMillions: m.amountMillions,
    modeledCapacityMm: m.amountMillions,
    remainingCapacityMm: null,
    claim: m.claim,
    remainingClaim,
    operativeSection: m.sourceSectionRef,
    authorityStatus: "GROSS_ONLY_UTILIZATION_INCOMPLETE",
    refusalReason:
      m.unsupportedReason ??
      "SOURCE_BACKED_COMPILED_GROSS via shared VE pipeline — production remaining refused.",
    mayPublishAvailable: false,
    valueProvenance: m.amountMillions != null ? "SOURCE_BACKED_COMPILED_GROSS" : "MODELED_LEAF",
    quarantinedFromProductionCalculation: m.amountMillions == null,
  };
}

/**
 * Connect any autonomous VE pipeline result into AuthenticPositionSlice shape
 * for the Position page (VE metrics only; no leaf evaluateProvision rows).
 */
export function connectVePipelineToPosition(
  pipeline: AutonomousCompilationPipelineResult,
  opts: { displayName: string; packageKey: string },
): AuthenticPositionSlice {
  const feeding = pipeline.positionMetrics.filter((m) => m.amountMillions != null);
  const readiness = readinessVeOnly(pipeline.companyId, feeding.length);
  const rulebook = rulebookVeOnly(pipeline.companyId, feeding.length);
  const dashboard = dashboardStubVeOnly(pipeline.companyId, opts.displayName, pipeline.asOfDate);

  const positionView: PositionViewModel = buildPositionView({
    companyId: pipeline.companyId,
    dashboard,
    readiness,
    rulebook,
    dashboardError: null,
  });

  const verifiedExecutableMetrics = feeding.map(metricFromPipeline);
  const compile: VerifiedExecutableCompileBridgeResult = pipeline.compile;

  for (const m of verifiedExecutableMetrics) {
    if (m.claim.claimLabel.includes("AVAILABLE") || m.mayPublishAvailable) {
      throw new Error(`False favorable AVAILABLE publication blocked for ${m.code}`);
    }
  }
  if (compile.productionCapacityPublished || pipeline.productionAvailablePublished) {
    throw new Error("Production capacity publication blocked on VE Position feed");
  }

  return {
    companyId: pipeline.companyId,
    packageKey: opts.packageKey,
    asOf: pipeline.asOfDate,
    positionView,
    connectedMetrics: [], // no leaf evaluateProvision path on VE-only packages
    verifiedExecutableMetrics,
    missingInputs: [...positionView.missingInputs, ...pipeline.limitations],
    productionRemainingPublished: false,
    phase3Compile: EMPTY_PHASE3(pipeline.asOfDate),
    autonomouslyCompiledDisplayedCount: 0,
    verifiedExecutableCompile: compile,
    verifiedExecutableUnitsFeedingPosition: compile.verifiedExecutableUnitsFeedingPosition,
  };
}

export type VePositionPackage = {
  companyId: string;
  displayName: string;
  packageKey: string;
  pipelineArgs: () => RunAutonomousPipelineArgs;
};

/** Registry of packages that can feed Position via shared VE pipeline alone. */
export const VE_POSITION_PACKAGES: readonly VePositionPackage[] = [
  {
    companyId: MATTHEWS_POSITION_COMPANY_ID,
    displayName: "Matthews International Corporation",
    packageKey: "matthews-international-q1-fy2025",
    pipelineArgs: () => ({
      companyId: MATTHEWS_POSITION_COMPANY_ID,
      instrumentKey: "matthews-international-q1-fy2025",
      asOfDate: "2024-12-31",
      candidates: matthewsVerifiedExecutableCandidates(),
      packageLabel: "Matthews Indenture + CA excerpts",
    }),
  },
  {
    companyId: MHK_VE_COMPANY_ID,
    displayName: "Mohawk Industries, Inc.",
    packageKey: "mhk-2026-credit-agreement",
    pipelineArgs: () => ({
      companyId: MHK_VE_COMPANY_ID,
      instrumentKey: "mhk-2026-credit-agreement",
      asOfDate: "2025-06-30",
      candidates: mhkVerifiedExecutableCandidates(),
      packageLabel: "MHK 2026 Credit Agreement (product-proof/002)",
    }),
  },
];

export function hasVePositionPackage(companyId: string): boolean {
  return VE_POSITION_PACKAGES.some((p) => p.companyId === companyId);
}

/** Load VE-only Position slice for a registered package (shared compile path). */
export function loadVePositionSlice(companyId: string): AuthenticPositionSlice | null {
  const pkg = VE_POSITION_PACKAGES.find((p) => p.companyId === companyId);
  if (!pkg) return null;
  const pipeline = runAutonomousCompilationPipeline(pkg.pipelineArgs());
  return connectVePipelineToPosition(pipeline, {
    displayName: pkg.displayName,
    packageKey: pkg.packageKey,
  });
}
