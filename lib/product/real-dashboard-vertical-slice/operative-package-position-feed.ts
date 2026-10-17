/**
 * Position feed from compileOperativeCovenantPackage — the generalized
 * source→discovery→VE path. Replaces package-specific regex candidate
 * discovery as the production Position entry for multi-issuer VE gross.
 *
 * Package contexts supply documents only. No issuer production branches
 * in discovery/compile.
 */

import { buildPositionView } from "@/lib/customer-workflow/position-view";
import { presentCapacityClaim } from "@/lib/customer-workflow/status-contract";
import type { CapacityReadiness } from "@/lib/product/customer-intelligence/capacity-readiness";
import type { RulebookReadiness } from "@/lib/product/customer-intelligence/rulebook-readiness";
import type { CompanyDashboard } from "@/lib/dashboard-service";
import {
  compileOperativeCovenantPackage,
  matthewsOperativePackageContext,
  mhkOperativePackageContext,
  type OperativeCovenantPackageResult,
  type OperativePackageContext,
} from "@/lib/product/autonomous-covenant-compilation";
import {
  canonicalCapacityFromOperativePackage,
  type CanonicalCapacityContract,
} from "@/lib/product/canonical-capacity-contract";
import type { AuthenticPositionSlice, DashboardConnectedMetric } from "./position-bridge";
import type { Phase3CompileBridgeResult } from "./phase3-compile-bridge";
import type { VerifiedExecutableCompileBridgeResult } from "./verified-executable-compile-core";
import {
  classifyEntityScope,
  classifyProvisionLegalContext,
  type CovenantFamilyId,
} from "./provision-legal-context";
import { MATTHEWS_POSITION_COMPANY_ID } from "./package-matthews";
import { MHK_VE_COMPANY_ID } from "./package-mhk-ve-candidates";

const KNOWN_FAMILIES = new Set<CovenantFamilyId>([
  "INDEBTEDNESS",
  "LIENS",
  "INVESTMENTS",
  "RESTRICTED_PAYMENTS",
  "ASSET_SALES",
]);

function familyFromExecutable(families: string[], operativeText: string): CovenantFamilyId | null {
  for (const f of families) {
    if (KNOWN_FAMILIES.has(f as CovenantFamilyId)) return f as CovenantFamilyId;
  }
  return classifyProvisionLegalContext(operativeText).family;
}

export type OperativePositionPackage = {
  companyId: string;
  displayName: string;
  context: () => OperativePackageContext;
};

export const OPERATIVE_POSITION_PACKAGES: readonly OperativePositionPackage[] = [
  {
    companyId: MATTHEWS_POSITION_COMPANY_ID,
    displayName: "Matthews International Corporation",
    context: () => matthewsOperativePackageContext(),
  },
  {
    companyId: MHK_VE_COMPANY_ID,
    displayName: "Mohawk Industries, Inc.",
    context: () => mhkOperativePackageContext(),
  },
];

export function hasOperativePositionPackage(companyId: string): boolean {
  return OPERATIVE_POSITION_PACKAGES.some((p) => p.companyId === companyId);
}

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
  path: ["operative-package-position-feed"],
  limitations: [
    "Position feed uses compileOperativeCovenantPackage (generic discovery→VE).",
    "Full leaf evaluateProvision dashboard remains Matthews-only / separate.",
  ],
  structuralIndexVersion: "n/a",
});

function readiness(companyId: string, n: number): CapacityReadiness {
  return {
    companyId,
    status: "DISCOVERY_ONLY",
    canEvaluateExecutableCapacity: false,
    capacityAuthority: "LEGACY_ENGINE",
    analyzedDocumentCount: 1,
    summaryCount: n,
    permissionCount: 0,
    unverifiedPermissionCount: 0,
    provisionCount: n,
    hasFinancialSnapshot: false,
    financialSnapshotStatus: "UNKNOWN",
    ns4ApprovedSnapshotCount: 0,
    approvedNorthStarSnapshotCount: 0,
    contractLedgerActiveCount: 0,
    phase3TrustedUnitCount: 0,
    phase3TrustedRuleCount: 0,
    // VE/fixture compile: no stored analyses in scope, so none can be stale.
    staleAnalyzedDocumentCount: 0,
    headline: "Operative package VE → Position (GROSS/MODELED only)",
    blockers: [
      "No NS-4 APPROVED financial snapshot on this feed.",
      "No utilization completeness — verified remaining null.",
      "Trusted-issuer activation BLOCKED.",
    ],
    guidance: "Publish GROSS / MODELED only. Refuse AVAILABLE remaining.",
  };
}

function rulebook(companyId: string, n: number): RulebookReadiness {
  return {
    companyId,
    stage: "INTERPRETED",
    discoveredSummaries: n,
    interpretedProvisions: n,
    reviewedPermissions: 0,
    executablePermissions: 0,
    provisionRows: n,
    staleDiscoveredSummaries: 0,
    exceptionItems: 0,
    exceptionDecisions: 0,
    reviewComplete: false,
    blockers: ["No counsel REVIEWED permissions on VE Position feed."],
    headline: "Generic operative package compile (not counsel-reviewed)",
    note: "PROVISIONAL — GROSS/MODELED only.",
  };
}

function dashboardStub(companyId: string, displayName: string, asOf: string): CompanyDashboard {
  const asOfDate = new Date(`${asOf}T00:00:00.000Z`);
  const emptySide = {
    amount: 0,
    secured: true as boolean,
    packageAuthoritative: {
      remainingCapacity: null as number | null,
      bindingDocumentName: null as string | null,
      bindingProvisionCode: null as string | null,
      authority: "MODELED_CROSS_DOCUMENT" as const,
      label: "MODELED / EVALUATION_SEED_NOT_NS4_APPROVED" as const,
      solverNativeRemaining: null as number | null,
      solverAuthority: "NON_AUTHORITATIVE_DIAGNOSTIC" as const,
      solverIsFalseFavorable: false,
    },
    utilizationRemainingAuthority: "NOT_PRODUCTION_AUTHORITATIVE" as const,
    perDocument: [] as [],
  };
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
      capitalStructure: { companyId, asOfDate, facilities: [] },
    } as unknown as CompanyDashboard["financialPosition"],
    capacity: {
      secured: { ...emptySide, secured: true },
      unsecured: { ...emptySide, secured: false },
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

/** Exported for acceptance tests — MODELED_HYPOTHETICAL must not become GROSS. */
export function metricFromCanonical(
  u: CanonicalCapacityContract["units"][number],
): DashboardConnectedMetric {
  const hasGross =
    u.grossContractualMm != null &&
    (u.publicationStatus === "GROSS_CONTRACTUAL_ONLY" ||
      u.capacityClass === "SOURCE_BACKED_GROSS_CONTRACTUAL");
  const hasModeledOnly =
    !hasGross &&
    u.modeledHypotheticalMm != null &&
    (u.publicationStatus === "MODELED_HYPOTHETICAL_ONLY" ||
      u.capacityClass === "MODELED_HYPOTHETICAL");

  // MODELED_HYPOTHETICAL must never be published as GROSS_CONTRACTUAL.
  const claim = hasGross
    ? presentCapacityClaim({
        claimKind: "GROSS_CONTRACTUAL",
        amountMillions: u.grossContractualMm,
        remainingIsAuthoritative: false,
        publicationLabel: "GROSS_CONTRACTUAL",
        unavailableReason: null,
      })
    : hasModeledOnly
      ? presentCapacityClaim({
          claimKind: "HYPOTHETICAL",
          amountMillions: u.modeledHypotheticalMm,
          remainingIsAuthoritative: false,
          publicationLabel: "HYPOTHETICAL",
          unavailableReason: null,
        })
      : presentCapacityClaim({
          claimKind: "UNAVAILABLE",
          amountMillions: null,
          remainingIsAuthoritative: false,
          publicationLabel: "NOT_PRODUCTION_AUTHORITATIVE",
          unavailableReason: `UNSUPPORTED / refused: ${u.publicationStatus}`,
        });

  if (
    (u.capacityClass === "MODELED_HYPOTHETICAL" ||
      u.publicationStatus === "MODELED_HYPOTHETICAL_ONLY") &&
    claim.claimKind === "GROSS_CONTRACTUAL"
  ) {
    throw new Error(
      `MODELED_HYPOTHETICAL unit ${u.unitId} refused publication as GROSS_CONTRACTUAL`,
    );
  }

  const remainingClaim = presentCapacityClaim({
    claimKind: "UNAVAILABLE",
    amountMillions: null,
    remainingIsAuthoritative: false,
    publicationLabel: "NOT_PRODUCTION_AUTHORITATIVE",
    unavailableReason:
      "Verified remaining null — utilization completeness + trusted issuer required.",
  });

  const amountMillions = hasGross
    ? u.grossContractualMm
    : hasModeledOnly
      ? u.modeledHypotheticalMm
      : null;

  return {
    label: `Operative VE — ${u.sourceSectionRef}`,
    code: u.unitId,
    amountMillions,
    // Modeled column is modeled-only — never coalesce GROSS into modeledCapacityMm.
    modeledCapacityMm: u.modeledHypotheticalMm,
    remainingCapacityMm: null,
    claim,
    remainingClaim,
    operativeSection: u.sourceSectionRef,
    authorityStatus: hasGross
      ? "GROSS_ONLY_UTILIZATION_INCOMPLETE"
      : hasModeledOnly
        ? "MODELED_AUTHENTIC_EVIDENCE"
        : "PRODUCTION_REMAINING_REFUSED",
    refusalReason: u.missingInputs.join(" | ") || null,
    mayPublishAvailable: false,
    valueProvenance: hasGross ? "SOURCE_BACKED_COMPILED_GROSS" : "MODELED_LEAF",
    quarantinedFromProductionCalculation: !hasGross,
  };
}

function compileBridgeFromResult(
  result: OperativeCovenantPackageResult,
): VerifiedExecutableCompileBridgeResult {
  return {
    companyId: result.companyId,
    instrumentKey: result.instrumentKey,
    asOfDate: result.asOfDate,
    candidatesAttempted: result.executableUnits.length + result.rejectedUnits.length,
    verifiedExecutableUnits: result.executableUnits.map((u) => ({
      candidateId: u.unitId,
      documentId: u.governingDocumentId || u.documentId,
      operativeSourceDocumentId: u.operativeSourceDocumentId || u.documentId,
      instrumentKey: result.instrumentKey,
      covenantFamily: familyFromExecutable(u.families, u.operativeText),
      entityScope: classifyEntityScope(u.operativeText),
      sourceSectionRef: u.sourceRef,
      relatedLeafCode: null,
      compileClass:
        u.executableAuthority === "VERIFIED_EXECUTABLE"
          ? "VERIFIED_EXECUTABLE_CANDIDATE"
          : "UNSUPPORTED",
      classificationClass: u.provisionKind,
      fidelityVerdict: (u.fidelityVerdict as "PASS" | "FAIL" | null) ?? null,
      hypotheticalOutcome: u.capacityClass,
      productionOutcome: u.productionRefusal ?? "PRODUCTION_CAPACITY_REFUSED",
      sourceBackedGrossCapacityMm:
        u.sourceBackedGrossCapacityUsd != null ? u.sourceBackedGrossCapacityUsd / 1_000_000 : null,
      valueClass:
        u.capacityClass === "SOURCE_BACKED_GROSS_CONTRACTUAL"
          ? "SOURCE_BACKED_COMPILED_GROSS"
          : "REFUSED_NOT_FIXED_DOLLAR",
      feedsPosition: u.capacityClass === "SOURCE_BACKED_GROSS_CONTRACTUAL",
      displayedOnDashboard: true,
      limitations: u.missingDependencies,
      missingLegalStructure:
        u.capacityClass === "SOURCE_BACKED_GROSS_CONTRACTUAL" ? null : u.productionRefusal,
    })),
    verifiedExecutableUnitsFeedingPosition: result.executableUnits.filter(
      (u) => u.capacityClass === "SOURCE_BACKED_GROSS_CONTRACTUAL",
    ).length,
    productionCapacityPublished: false,
    trustedIdentityActivation: result.diagnostics.trustedIdentityActivation,
    path: result.diagnostics.path,
    limitations: [
      "Feed from compileOperativeCovenantPackage — not package-specific regex candidates.",
      result.diagnostics.autonomousCompilationRationale,
    ],
  };
}

export type OperativePackagePositionLoad = {
  slice: AuthenticPositionSlice;
  canonical: CanonicalCapacityContract;
  operative: OperativeCovenantPackageResult;
};

/**
 * Compile authentic package via generalized operative compiler and assemble
 * Position + canonical capacity contract.
 */
export async function loadOperativePackagePositionSlice(
  companyId: string,
): Promise<OperativePackagePositionLoad | null> {
  const pkg = OPERATIVE_POSITION_PACKAGES.find((p) => p.companyId === companyId);
  if (!pkg) return null;

  const operative = await compileOperativeCovenantPackage(pkg.context());
  const canonical = canonicalCapacityFromOperativePackage(operative, {
    financialSnapshotPresent: false,
    utilizationCompletenessPresent: false,
    productionAuthorityActive: false,
  });

  const feeding = canonical.units.filter(
    (u) => u.grossContractualMm != null || u.modeledHypotheticalMm != null,
  );
  const verifiedExecutableMetrics = feeding.map(metricFromCanonical);
  const compile = compileBridgeFromResult(operative);

  for (const m of verifiedExecutableMetrics) {
    if (m.mayPublishAvailable || m.claim.claimLabel.includes("AVAILABLE")) {
      throw new Error(`AVAILABLE publication blocked for ${m.code}`);
    }
  }

  const dash = dashboardStub(companyId, pkg.displayName, operative.asOfDate);
  const positionView = buildPositionView({
    companyId,
    dashboard: dash,
    readiness: readiness(companyId, feeding.length),
    rulebook: rulebook(companyId, feeding.length),
    dashboardError: null,
  });

  const slice: AuthenticPositionSlice = {
    companyId,
    packageKey: operative.packageKey,
    asOf: operative.asOfDate,
    positionView,
    connectedMetrics: [],
    verifiedExecutableMetrics,
    missingInputs: [...canonical.sharedConstraints, ...canonical.limitations],
    productionRemainingPublished: false,
    phase3Compile: EMPTY_PHASE3(operative.asOfDate),
    autonomouslyCompiledDisplayedCount: 0,
    verifiedExecutableCompile: compile,
    verifiedExecutableUnitsFeedingPosition: compile.verifiedExecutableUnitsFeedingPosition,
  };

  return { slice, canonical, operative };
}
