/**
 * Independent evaluation of a package compile result.
 * Does not use model outputs as ground truth.
 */

import { createHash } from "node:crypto";
import type { OfflinePackageCompileResult } from "../contract-model/analysis/offline-package-compile";
import type {
  LearningCohort,
  LearningErrorRecord,
  LearningEvaluationRecord,
  LearningPackageSpec,
} from "./types";

function eid(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 24);
}

/**
 * evaluation.ts COVERAGE_GAP path. The sweep does not call this function.
 * High refusal is a compiler-abstention count, not an unbound excerpt.
 */
export const HIGH_REFUSAL_COVERAGE_MARKER = "refused executable with zero verified-executable";

export const METRIC_DEFINITIONS = {
  supportedStructureUnits:
    "Count of compile units with supportStatus===SUPPORTED_STRUCTURE (exception-catalog support and no unresolved context). Independent of executableAuthority.",
  verifiedExecutableUnits:
    "Count of units elevated to executableAuthority===VERIFIED_EXECUTABLE by fixed-dollar / greater-of / percent-of-assets vertical slices after independent fidelity PASS. May be >0 while supportedStructureUnits===0 when supportStatus is PARTIAL due to unresolved context bundles.",
  dangerousOmissions:
    "NOT_MEASURED unless an independently adjudicated completeness oracle exists for the package. Heuristic discovery gaps are recorded as DISCOVERY_GAP / COVERAGE_GAP errors — never reported as measured dangerousOmissions=0.",
} as const;

/**
 * Score coverage / fidelity from compile stages without trusting unverified IR.
 */
export function evaluateCompileIndependently(args: {
  spec: LearningPackageSpec;
  runId: string;
  result: OfflinePackageCompileResult;
  /** When true and an oracle is supplied elsewhere, dangerous omissions may be MEASURED. */
  completenessOracle?: { dangerousOmissionCount: number } | null;
}): { evaluation: LearningEvaluationRecord; errors: LearningErrorRecord[] } {
  const { spec, runId, result } = args;
  const notes: string[] = [];
  const errors: LearningErrorRecord[] = [];
  const now = new Date().toISOString();

  const passA = result.stages.discovery.passACount;
  const catalogs = result.stages.discovery.exceptionCatalogCount;
  const units = result.units.length;
  const verified = result.summary.verifiedExecutableUnits;
  const unsupported = result.summary.unsupportedUnits;
  const refused = result.summary.refusedExecutableUnits;
  const supported = result.summary.supportedStructureUnits;

  // Discovery gap heuristic — NOT a completeness-oracle measurement.
  if (passA > 20 && catalogs === 0 && units === 0) {
    errors.push({
      errorId: eid([runId, "DISCOVERY_GAP", "no-catalogs"]),
      packageKey: spec.packageKey,
      runId,
      class: "DISCOVERY_GAP",
      severity: "HIGH",
      message: `Pass A found ${passA} signals but zero exception catalogs and zero units (heuristic gap; not an adjudicated dangerous-omission oracle)`,
      stage: "INDEPENDENT_EVAL",
      evidence: { passA, catalogs, units },
      createdAt: now,
      correctiveHistory: [],
    });
    notes.push("DISCOVERY_GAP heuristic fired; dangerousOmissions remain NOT_MEASURED");
  }

  const dangerousOmissionsStatus = args.completenessOracle ? ("MEASURED" as const) : ("NOT_MEASURED" as const);
  const dangerousOmissionCount = args.completenessOracle
    ? args.completenessOracle.dangerousOmissionCount
    : null;
  if (dangerousOmissionsStatus === "NOT_MEASURED") {
    notes.push("dangerousOmissions=NOT_MEASURED (no independently adjudicated completeness oracle)");
  }

  if (result.stages.operativeHandoff.authorityGate !== "CONFIRMED_OPERATIVE_IDENTITY") {
    notes.push(`operative authority gate=${result.stages.operativeHandoff.authorityGate} (fail-closed)`);
    errors.push({
      errorId: eid([runId, "OPERATIVE_IDENTITY", result.stages.operativeHandoff.authorityGate]),
      packageKey: spec.packageKey,
      runId,
      class: "OPERATIVE_IDENTITY_UNRESOLVED",
      severity: "MEDIUM",
      message: `Operative identity not confirmed: ${result.stages.operativeHandoff.authorityGate}`,
      stage: "COMPILE",
      evidence: { gate: result.stages.operativeHandoff.authorityGate },
      createdAt: now,
      correctiveHistory: [],
    });
  }

  let sourceFidelityPass: boolean | null = null;
  if (verified > 0) {
    const fidelityFails = result.units.filter(
      (u) =>
        u.executableAuthority === "VERIFIED_EXECUTABLE" &&
        ((u.fixedDollarSlice?.fidelityVerdict && u.fixedDollarSlice.fidelityVerdict !== "PASS") ||
          (u.greaterOfSlice?.fidelityVerdict && u.greaterOfSlice.fidelityVerdict !== "PASS")),
    ).length;
    sourceFidelityPass = fidelityFails === 0;
    if (!sourceFidelityPass) {
      errors.push({
        errorId: eid([runId, "FIDELITY", String(fidelityFails)]),
        packageKey: spec.packageKey,
        runId,
        class: "FIDELITY_FAILURE",
        severity: "HIGH",
        message: `${fidelityFails} verified-executable unit(s) failed independent fidelity`,
        stage: "INDEPENDENT_EVAL",
        createdAt: now,
        correctiveHistory: [],
      });
    }
  } else {
    notes.push("sourceFidelity unknown — no VERIFIED_EXECUTABLE units (not treated as pass)");
  }

  if (supported === 0 && verified > 0) {
    notes.push(
      `metric note: supportedStructureUnits=0 while verifiedExecutableUnits=${verified} — VE vertical slices can elevate under PARTIAL supportStatus`,
    );
  }

  const coverageDenom = Math.max(passA, units, 1);
  const coverageScore = Math.min(1, (supported + verified) / coverageDenom);

  if (unsupported > 0) {
    notes.push(`${unsupported} unsupported-structure units recorded (not discarded)`);
  }

  const abstentionCount =
    refused +
    result.units.filter((u) => u.supportStatus === "AMBIGUOUS" || u.supportStatus === "UNVERIFIED").length;

  if (units >= 20 && verified === 0 && refused >= Math.floor(units * 0.8)) {
    errors.push({
      errorId: eid([runId, "COVERAGE_GAP", "high-refusal"]),
      packageKey: spec.packageKey,
      runId,
      class: "COVERAGE_GAP",
      severity: "MEDIUM",
      message: `${refused}/${units} units ${HIGH_REFUSAL_COVERAGE_MARKER} — record for bounded compiler expansion (not auto-applied)`,
      stage: "INDEPENDENT_EVAL",
      evidence: { units, refused, verified, supported },
      createdAt: now,
      correctiveHistory: [],
    });
    notes.push("COVERAGE_GAP: high executable refusal; improvement proposal required");
  }

  const evaluation: LearningEvaluationRecord = {
    evaluationId: eid([runId, "eval", spec.packageKey]),
    packageKey: spec.packageKey,
    runId,
    cohort: spec.cohort as LearningCohort,
    sourceFidelityPass,
    coverageScore,
    calculationCorrectness: verified > 0 ? sourceFidelityPass : null,
    dangerousOmissionsStatus,
    dangerousOmissionCount,
    abstentionCount,
    supportedStructureUnits: supported,
    verifiedExecutableUnits: verified,
    unsupportedUnits: unsupported,
    refusedExecutableUnits: refused,
    metricDefinitions: { ...METRIC_DEFINITIONS },
    independent: true,
    notes,
    createdAt: now,
  };

  return { evaluation, errors };
}
