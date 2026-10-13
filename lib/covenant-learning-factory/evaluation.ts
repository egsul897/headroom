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
 * Score coverage / fidelity from compile stages without trusting unverified IR.
 * Dangerous omissions: Pass A found candidates but zero exception catalogs / units.
 */
export function evaluateCompileIndependently(args: {
  spec: LearningPackageSpec;
  runId: string;
  result: OfflinePackageCompileResult;
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

  let dangerousOmissionCount = 0;
  if (passA > 20 && catalogs === 0 && units === 0) {
    dangerousOmissionCount += 1;
    errors.push({
      errorId: eid([runId, "DANGEROUS_OMISSION", "no-catalogs"]),
      packageKey: spec.packageKey,
      runId,
      class: "DANGEROUS_OMISSION",
      severity: "HIGH",
      message: `Pass A found ${passA} signals but zero exception catalogs and zero units`,
      stage: "INDEPENDENT_EVAL",
      evidence: { passA, catalogs, units },
      createdAt: now,
      correctiveHistory: [],
    });
    notes.push("DANGEROUS_OMISSION: discovery signals without catalog/unit materialization");
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

  // Fidelity: only score when verified-executable units exist; otherwise unknown (null).
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

  const coverageDenom = Math.max(passA, units, 1);
  const coverageScore = Math.min(1, (supported + verified) / coverageDenom);

  if (unsupported > 0) {
    notes.push(`${unsupported} unsupported-structure units recorded (not discarded)`);
  }

  const abstentionCount =
    refused +
    result.units.filter((u) => u.supportStatus === "AMBIGUOUS" || u.supportStatus === "UNVERIFIED").length;

  const evaluation: LearningEvaluationRecord = {
    evaluationId: eid([runId, "eval", spec.packageKey]),
    packageKey: spec.packageKey,
    runId,
    cohort: spec.cohort as LearningCohort,
    sourceFidelityPass,
    coverageScore,
    calculationCorrectness: verified > 0 ? sourceFidelityPass : null,
    dangerousOmissionCount,
    abstentionCount,
    supportedStructureUnits: supported,
    verifiedExecutableUnits: verified,
    unsupportedUnits: unsupported,
    refusedExecutableUnits: refused,
    independent: true,
    notes,
    createdAt: now,
  };

  return { evaluation, errors };
}
