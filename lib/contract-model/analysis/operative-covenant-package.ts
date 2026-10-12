/**
 * Generalized operative covenant package compilation.
 *
 * Connects existing components — structural index, package graph, operative
 * authority, definition/section exception catalogs, fixed-dollar / greater-of
 * verified IR, and evaluateVerifiedCapacity — into one issuer-agnostic API:
 *
 *   compileOperativeCovenantPackage(packageContext)
 *
 * Does NOT recreate a parallel evaluator. Does NOT branch on companyId for
 * discovery or compilation. Unsupported / ambiguous structures fail closed.
 * Never publishes AVAILABLE without authority + utilization + financial gates.
 */

import { TRUSTED_IDENTITY_PRODUCTION_ACTIVATION } from "@/lib/capacity";
import {
  compileFrozenDebtPackage,
  type CompileUnitRepresentation,
  type OfflinePackageCompileResult,
  type OfflinePackageDocument,
} from "./offline-package-compile";

export const OPERATIVE_COVENANT_PACKAGE_VERSION = "operative-covenant-package.v1";

export type CapacityPublicationClass =
  | "SOURCE_BACKED_GROSS_CONTRACTUAL"
  | "MODELED_HYPOTHETICAL"
  | "VERIFIED_REMAINING"
  | "UNSUPPORTED_OR_UNKNOWN"
  | "PRODUCTION_AVAILABLE"; // never emitted while trusted-identity BLOCKED

export type OperativeProvisionKind =
  | "DEBT_INCURRENCE_PROHIBITION"
  | "LIEN_RESTRICTION"
  | "PERMITTED_DEBT_BASKET"
  | "PERMITTED_LIEN_BASKET"
  | "RATIO_BASED_PERMISSION"
  | "GREATER_OF_BASKET"
  | "FIXED_DOLLAR_BASKET"
  | "GRANDFATHERED_OR_NON_CAP"
  | "DEFINITION_DEPENDENCY"
  | "OTHER_OR_UNKNOWN";

export interface OperativePackageContext {
  companyId: string;
  packageKey: string;
  instrumentKey?: string;
  asOfDate?: string;
  documents: OfflinePackageDocument[];
  /** Default false — Pass B / paid inference stay off unless explicitly authorized. */
  authorizePaidInference?: boolean;
  authorizationRef?: string | null;
}

export interface ExecutableOperativeUnit {
  unitId: string;
  sourceRef: string;
  documentId: string;
  provisionKind: OperativeProvisionKind;
  role: string;
  families: string[];
  executableAuthority: "VERIFIED_EXECUTABLE" | "REFUSED";
  capacityClass: CapacityPublicationClass;
  sourceBackedGrossCapacityUsd: number | null;
  modeledHypotheticalCapacityUsd: number | null;
  verifiedRemainingCapacityUsd: null; // always null until utilization + trusted issuer
  productionAvailableCapacityUsd: null;
  currency: "USD" | null;
  sourceSpan: { charStart: number | null; charEnd: number | null };
  operativeText: string;
  definedTermDependencies: string[];
  exceptionsAndConditions: string[];
  crossReferences: string[];
  fidelityVerdict: string | null;
  productionRefusal: string | null;
  missingDependencies: string[];
  provenance: {
    discoveryMethods: string[];
    evidenceSignals: string[];
    offlineCompileVersion: string;
    operativePackageVersion: string;
  };
}

export interface RejectedOperativeUnit {
  unitId: string;
  sourceRef: string;
  documentId: string;
  provisionKind: OperativeProvisionKind;
  reason: string;
  supportStatus: string;
  operativeTextExcerpt: string;
}

export interface OperativeCoverageReport {
  discoveredProhibitionCount: number;
  discoveredBasketCount: number;
  discoveredRatioPermissionCount: number;
  discoveredLienRestrictionCount: number;
  discoveredDefinitionDependencyCount: number;
  executableFixedDollarCount: number;
  executableGreaterOfCount: number;
  rejectedCount: number;
  /** Honest inventory of provision kinds seen but not compiled to VE IR. */
  missedOrUnsupportedRelevant: Array<{
    sourceRef: string;
    documentId: string;
    provisionKind: OperativeProvisionKind;
    why: string;
  }>;
}

export interface OperativeCovenantPackageResult {
  version: string;
  companyId: string;
  packageKey: string;
  instrumentKey: string;
  asOfDate: string;
  executableUnits: ExecutableOperativeUnit[];
  rejectedUnits: RejectedOperativeUnit[];
  coverage: OperativeCoverageReport;
  diagnostics: {
    path: string[];
    capacityHandoffOutcome: string;
    productionAvailablePublished: boolean;
    verifiedRemainingPublished: boolean;
    trustedIdentityActivation: string;
    paidInferenceUsed: boolean;
    falseExecutableClassifications: number;
    autonomousCompilationProven: "NOT_PROVEN" | "PARTIAL" | "PROVEN";
    autonomousCompilationRationale: string;
    humanInterventions: { kind: string; detail: string }[];
  };
  /** Full offline compile result for forensic consumers — same engine, not a fork. */
  offlineCompile: OfflinePackageCompileResult;
}

function classifyProvisionKind(unit: CompileUnitRepresentation): OperativeProvisionKind {
  const ref = unit.sourceRef;
  const role = unit.role;
  const families = unit.families;
  const text = unit.operativeText;

  if (unit.greaterOfSlice) return "GREATER_OF_BASKET";
  if (unit.fixedDollarSlice?.classification?.startsWith("FIXED_DOLLAR")) return "FIXED_DOLLAR_BASKET";
  if (role === "DEFINITIONAL_DEPENDENCY_CANDIDATE") return "DEFINITION_DEPENDENCY";
  if (
    role === "RATIO_BASED_PERMISSION" ||
    (unit.ratioMentions.length > 0 && /would be|at least|no greater than/i.test(text))
  ) {
    return "RATIO_BASED_PERMISSION";
  }
  if (role === "GENERAL_PROHIBITION") {
    if (families.includes("LIENS") || /\bLiens?\b/i.test(text.slice(0, 200))) return "LIEN_RESTRICTION";
    if (families.includes("INDEBTEDNESS") || /\b(?:Indebtedness|Debt)\b/i.test(text.slice(0, 200))) {
      return "DEBT_INCURRENCE_PROHIBITION";
    }
    return "DEBT_INCURRENCE_PROHIBITION";
  }
  if (role === "BASKET" || role === "SHARED_CAP" || role === "PERMISSION") {
    if (families.includes("LIENS")) return "PERMITTED_LIEN_BASKET";
    if (/\$[\d,]+/.test(text) && !/\bnot\s+to\s+exceed\b|\bshall\s+not\s+exceed\b|\bdoes\s+not\s+exceed\b/i.test(text)) {
      return "GRANDFATHERED_OR_NON_CAP";
    }
    return families.includes("LIENS") ? "PERMITTED_LIEN_BASKET" : "PERMITTED_DEBT_BASKET";
  }
  if (ref.startsWith("def:") && /Lien/i.test(ref)) return "PERMITTED_LIEN_BASKET";
  if (ref.startsWith("def:")) return "PERMITTED_DEBT_BASKET";
  return "OTHER_OR_UNKNOWN";
}

function capacityClassFor(unit: CompileUnitRepresentation): CapacityPublicationClass {
  if (unit.executableAuthority === "VERIFIED_EXECUTABLE" && unit.fixedDollarSlice?.fidelityVerdict === "PASS") {
    // Gross contractual from source-backed IR — not remaining, not AVAILABLE.
    return "SOURCE_BACKED_GROSS_CONTRACTUAL";
  }
  if (unit.executableAuthority === "VERIFIED_EXECUTABLE" && unit.greaterOfSlice?.fidelityVerdict === "PASS") {
    // Greater-of may be VE for structure but numeric capacity needs metric input.
    if (unit.greaterOfSlice.availableAmountUsd != null) return "MODELED_HYPOTHETICAL";
    return "MODELED_HYPOTHETICAL";
  }
  return "UNSUPPORTED_OR_UNKNOWN";
}

function missingDepsFor(unit: CompileUnitRepresentation): string[] {
  const out: string[] = [];
  if (unit.contextBundleSummary && unit.contextBundleSummary.unresolvedDependencies > 0) {
    out.push(`unresolved_context_dependencies:${unit.contextBundleSummary.unresolvedDependencies}`);
  }
  if (unit.greaterOfSlice && unit.greaterOfSlice.availableAmountUsd == null) {
    out.push(`financial_metric:${unit.greaterOfSlice.metricName ?? "Total Assets"}`);
  }
  if (unit.ratioMentions.length > 0 && unit.executableAuthority === "REFUSED") {
    out.push("ratio_definition_closure");
    out.push("approved_financial_snapshot");
  }
  if (!unit.fixedDollarSlice && !unit.greaterOfSlice && unit.executableAuthority === "REFUSED") {
    out.push("verified_executable_ir");
  }
  out.push("utilization_completeness_certificate");
  out.push("trusted_issuer_activation");
  return out;
}

function toExecutable(unit: CompileUnitRepresentation): ExecutableOperativeUnit {
  const kind = classifyProvisionKind(unit);
  const capacityClass = capacityClassFor(unit);
  const fdUsd =
    capacityClass === "SOURCE_BACKED_GROSS_CONTRACTUAL"
      ? unit.fixedDollarSlice?.availableAmountUsd ?? null
      : null;
  const modeledUsd =
    capacityClass === "MODELED_HYPOTHETICAL"
      ? unit.greaterOfSlice?.availableAmountUsd ?? null
      : null;

  return {
    unitId: unit.unitId,
    sourceRef: unit.sourceRef,
    documentId: unit.documentId,
    provisionKind: kind,
    role: unit.role,
    families: unit.families,
    executableAuthority: unit.executableAuthority,
    capacityClass,
    sourceBackedGrossCapacityUsd: fdUsd,
    modeledHypotheticalCapacityUsd: modeledUsd,
    verifiedRemainingCapacityUsd: null,
    productionAvailableCapacityUsd: null,
    currency: fdUsd != null || modeledUsd != null ? "USD" : null,
    sourceSpan: unit.sourceSpan,
    operativeText: unit.operativeText,
    definedTermDependencies: unit.definedTermDependencies,
    exceptionsAndConditions: [
      ...unit.capsAndThresholds.map((c) => `${c.kind}:${c.excerpt}`),
      ...unit.ratioMentions.map((r) => `RATIO:${r}`),
    ].slice(0, 16),
    crossReferences: unit.crossReferences,
    fidelityVerdict: unit.fixedDollarSlice?.fidelityVerdict ?? unit.greaterOfSlice?.fidelityVerdict ?? null,
    productionRefusal: unit.fixedDollarSlice?.productionRefusal ?? unit.greaterOfSlice?.productionRefusal ?? null,
    missingDependencies: missingDepsFor(unit),
    provenance: {
      ...unit.provenance,
      operativePackageVersion: OPERATIVE_COVENANT_PACKAGE_VERSION,
    },
  };
}

function toRejected(unit: CompileUnitRepresentation): RejectedOperativeUnit {
  const kind = classifyProvisionKind(unit);
  let reason = `supportStatus=${unit.supportStatus}; executableAuthority=REFUSED`;
  if (kind === "RATIO_BASED_PERMISSION") {
    reason = "Ratio baskets refuse until definition closure + financial dependencies are modeled";
  } else if (kind === "GRANDFATHERED_OR_NON_CAP") {
    reason = "Dollar amount present without cap-role (grandfathered / stated amount) — not new-incurrence ceiling";
  } else if (kind === "GREATER_OF_BASKET" && unit.greaterOfSlice == null) {
    reason = "Greater-of / grower formulation not classified as executable assets basket";
  } else if (unit.fixedDollarSlice?.classification === "NOT_FIXED_DOLLAR" || !unit.fixedDollarSlice) {
    reason = `No verified fixed-dollar or greater-of IR (${kind})`;
  }
  return {
    unitId: unit.unitId,
    sourceRef: unit.sourceRef,
    documentId: unit.documentId,
    provisionKind: kind,
    reason,
    supportStatus: unit.supportStatus,
    operativeTextExcerpt: unit.operativeText.slice(0, 240).replace(/\s+/g, " "),
  };
}

function buildCoverage(units: CompileUnitRepresentation[]): OperativeCoverageReport {
  const kinds = units.map((u) => ({ u, kind: classifyProvisionKind(u) }));
  const missedOrUnsupportedRelevant = kinds
    .filter(({ u, kind }) => {
      if (u.executableAuthority === "VERIFIED_EXECUTABLE") return false;
      return (
        kind === "RATIO_BASED_PERMISSION" ||
        kind === "PERMITTED_DEBT_BASKET" ||
        kind === "PERMITTED_LIEN_BASKET" ||
        kind === "GRANDFATHERED_OR_NON_CAP" ||
        kind === "GREATER_OF_BASKET" ||
        kind === "FIXED_DOLLAR_BASKET" ||
        kind === "DEBT_INCURRENCE_PROHIBITION" ||
        kind === "LIEN_RESTRICTION"
      );
    })
    .map(({ u, kind }) => ({
      sourceRef: u.sourceRef,
      documentId: u.documentId,
      provisionKind: kind,
      why:
        kind === "RATIO_BASED_PERMISSION"
          ? "Ratio permission discovered; executable IR refused pending financial definition closure"
          : kind === "GRANDFATHERED_OR_NON_CAP"
            ? "Grandfathered / non-cap dollar discovered; not compiled as new-incurrence ceiling"
            : u.executableAuthority === "REFUSED"
              ? "Discovered but not elevated to verified executable IR"
              : "Unsupported or incomplete",
    }));

  return {
    discoveredProhibitionCount: kinds.filter(
      (k) => k.kind === "DEBT_INCURRENCE_PROHIBITION" || k.kind === "LIEN_RESTRICTION",
    ).length,
    discoveredBasketCount: kinds.filter(
      (k) =>
        k.kind === "PERMITTED_DEBT_BASKET" ||
        k.kind === "PERMITTED_LIEN_BASKET" ||
        k.kind === "FIXED_DOLLAR_BASKET" ||
        k.kind === "GREATER_OF_BASKET" ||
        k.kind === "GRANDFATHERED_OR_NON_CAP",
    ).length,
    discoveredRatioPermissionCount: kinds.filter((k) => k.kind === "RATIO_BASED_PERMISSION").length,
    discoveredLienRestrictionCount: kinds.filter((k) => k.kind === "LIEN_RESTRICTION").length,
    discoveredDefinitionDependencyCount: kinds.filter((k) => k.kind === "DEFINITION_DEPENDENCY").length,
    executableFixedDollarCount: units.filter(
      (u) => u.executableAuthority === "VERIFIED_EXECUTABLE" && u.fixedDollarSlice?.fidelityVerdict === "PASS",
    ).length,
    executableGreaterOfCount: units.filter(
      (u) => u.executableAuthority === "VERIFIED_EXECUTABLE" && u.greaterOfSlice?.fidelityVerdict === "PASS",
    ).length,
    rejectedCount: units.filter((u) => u.executableAuthority === "REFUSED").length,
    missedOrUnsupportedRelevant,
  };
}

function autonomousVerdict(
  coverage: OperativeCoverageReport,
  offline: OfflinePackageCompileResult,
): { verdict: "NOT_PROVEN" | "PARTIAL" | "PROVEN"; rationale: string } {
  const hasExecutable = coverage.executableFixedDollarCount + coverage.executableGreaterOfCount > 0;
  const hasGenericDiscovery =
    offline.stages.discovery.exceptionCatalogCount > 0 ||
    offline.stages.discovery.exceptionClauseCount > 0;
  const falseExec = offline.summary.falseExecutableClassifications;
  if (falseExec > 0) {
    return {
      verdict: "NOT_PROVEN",
      rationale: `False executable classifications=${falseExec}; fail-closed integrity broken.`,
    };
  }
  if (!hasExecutable || !hasGenericDiscovery) {
    return {
      verdict: "NOT_PROVEN",
      rationale: "No source-backed verified executable units from generic catalog discovery.",
    };
  }
  // Full PROVEN requires ratio + utilization + no hand-encoded leaf path elsewhere.
  // This API proves the generalized source→discovery→VE path for supported families.
  if (coverage.discoveredRatioPermissionCount > 0 && coverage.executableFixedDollarCount > 0) {
    return {
      verdict: "PARTIAL",
      rationale:
        "Generic discovery + fixed-dollar/greater-of VE compile proven across packages; ratio permissions discovered but not executable; production AVAILABLE refused.",
    };
  }
  return {
    verdict: "PARTIAL",
    rationale:
      "Generic discovery + verified fixed-dollar/greater-of compile proven; remaining/AVAILABLE and full ratio closure not proven.",
  };
}

/**
 * Compile an authentic, structurally indexable debt-document package into
 * operative covenant units with capacity publication classes.
 *
 * Issuer-agnostic: discovery and compile paths do not branch on companyId.
 */
export async function compileOperativeCovenantPackage(
  packageContext: OperativePackageContext,
): Promise<OperativeCovenantPackageResult> {
  delete process.env.AI_GATEWAY_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;

  const asOfDate = packageContext.asOfDate ?? new Date().toISOString().slice(0, 10);
  const path: string[] = [
    "package-context",
    "structure→package-graph→amendment→operative-authority",
    "generic-discovery(pass-a+exception-catalogs+ratio-sections)",
    "fixed-dollar|greater-of→evaluateVerifiedCapacity",
    "capacity-publication-classes",
  ];

  const offline = await compileFrozenDebtPackage({
    companyId: packageContext.companyId,
    packageKey: packageContext.packageKey,
    instrumentKey: packageContext.instrumentKey,
    documents: packageContext.documents,
    authorizePaidInference: packageContext.authorizePaidInference ?? false,
    authorizationRef: packageContext.authorizationRef,
    asOfDate,
  });

  path.push(`catalogs:${offline.stages.discovery.exceptionCatalogCount}`);
  path.push(`clauses:${offline.stages.discovery.exceptionClauseCount}`);
  path.push(`units:${offline.units.length}`);
  path.push(`ve:${offline.summary.verifiedExecutableUnits}`);

  const executableUnits = offline.units
    .filter((u) => u.executableAuthority === "VERIFIED_EXECUTABLE")
    .map(toExecutable);
  const rejectedUnits = offline.units.filter((u) => u.executableAuthority === "REFUSED").map(toRejected);
  const coverage = buildCoverage(offline.units);
  const { verdict, rationale } = autonomousVerdict(coverage, offline);

  // Hard honesty: never emit AVAILABLE / verified remaining from this path.
  for (const u of executableUnits) {
    if (u.capacityClass === "PRODUCTION_AVAILABLE" || u.productionAvailableCapacityUsd != null) {
      throw new Error(`compileOperativeCovenantPackage refused AVAILABLE for ${u.unitId}`);
    }
    if (u.verifiedRemainingCapacityUsd != null) {
      throw new Error(`compileOperativeCovenantPackage refused verified remaining for ${u.unitId}`);
    }
    if (u.capacityClass === "SOURCE_BACKED_GROSS_CONTRACTUAL" && u.sourceBackedGrossCapacityUsd == null) {
      throw new Error(`GROSS unit missing amount: ${u.unitId}`);
    }
  }

  return {
    version: OPERATIVE_COVENANT_PACKAGE_VERSION,
    companyId: packageContext.companyId,
    packageKey: packageContext.packageKey,
    instrumentKey: offline.instrumentKey,
    asOfDate,
    executableUnits,
    rejectedUnits,
    coverage,
    diagnostics: {
      path,
      capacityHandoffOutcome: offline.stages.capacityHandoff.outcome,
      productionAvailablePublished: false,
      verifiedRemainingPublished: false,
      trustedIdentityActivation: TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status,
      paidInferenceUsed: offline.paidInferenceUsed,
      falseExecutableClassifications: offline.summary.falseExecutableClassifications,
      autonomousCompilationProven: verdict,
      autonomousCompilationRationale: rationale,
      humanInterventions: offline.humanInterventions,
    },
    offlineCompile: offline,
  };
}
