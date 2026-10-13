/**
 * Records shaped for the covenant learning factory (#356).
 *
 * `kind: "CALCULATION"` matches `LearningArtifactRecord`.
 * `class: "CALCULATION_MISMATCH"` matches `LearningErrorRecord`.
 * Automated state is PROPOSED only. This module does not write Neon.
 */

import { createHash } from "node:crypto";
import type { ComputationMistake, ComputationResult } from "./types";
import { COVENANT_COMPUTATION_VERSION } from "./types";

export interface CovenantCalculationArtifact {
  artifactId: string;
  packageKey: string;
  kind: "CALCULATION";
  state: "PROPOSED";
  family: "COVENANT_COMPUTATION";
  sourceRefs: string[];
  payload: {
    schemaVersion: typeof COVENANT_COMPUTATION_VERSION;
    certification: "COMPUTED_NOT_CERTIFIED";
    runId: string;
    result: ComputationResult;
  };
  compilerVersion: typeof COVENANT_COMPUTATION_VERSION;
  createdAt: string;
}

export interface CovenantCalculationError {
  errorId: string;
  packageKey: string;
  runId: string;
  class: "CALCULATION_MISMATCH";
  severity: "HIGH";
  message: string;
  stage: "INDEPENDENT_EVAL";
  evidence?: Record<string, unknown>;
  createdAt: string;
  correctiveHistory: { at: string; note: string; actor: string }[];
}

export interface LearningRecordSink {
  saveArtifact(artifact: CovenantCalculationArtifact): void;
  saveError(error: CovenantCalculationError): void;
}

export class InMemoryLearningSink implements LearningRecordSink {
  readonly artifacts: CovenantCalculationArtifact[] = [];
  readonly errors: CovenantCalculationError[] = [];

  saveArtifact(artifact: CovenantCalculationArtifact): void {
    this.artifacts.push(artifact);
  }

  saveError(error: CovenantCalculationError): void {
    this.errors.push(error);
  }
}

export function learningRecords(args: {
  result: ComputationResult;
  runId: string;
  createdAt: string;
}): { artifact: CovenantCalculationArtifact; errors: CovenantCalculationError[] } {
  const sourceRefs = [
    ...new Set([
      ...args.result.ratios.flatMap((r) => [
        r.definitionDocumentId,
        ...r.numerator.map((n) => n.sourceDocumentId),
        ...r.denominator.map((d) => d.sourceDocumentId),
      ]),
      ...args.result.baskets.map((b) => b.sourceDocumentId),
    ].filter((x): x is string => Boolean(x))),
  ];
  const artifact: CovenantCalculationArtifact = {
    artifactId: `calc:${args.result.packageKey}:${args.runId}`,
    packageKey: args.result.packageKey,
    kind: "CALCULATION",
    state: "PROPOSED",
    family: "COVENANT_COMPUTATION",
    sourceRefs,
    payload: {
      schemaVersion: COVENANT_COMPUTATION_VERSION,
      certification: "COMPUTED_NOT_CERTIFIED",
      runId: args.runId,
      result: args.result,
    },
    compilerVersion: COVENANT_COMPUTATION_VERSION,
    createdAt: args.createdAt,
  };
  const errors = args.result.mistakes.map((m) => toError(args.result.packageKey, args.runId, args.createdAt, m));
  for (const refused of args.result.correctionsRefused) {
    errors.push(
      toError(args.result.packageKey, args.runId, args.createdAt, {
        stableKey: refused.stableKey,
        message: refused.reason,
        evidence: { field: refused.field, refused: true },
      }),
    );
  }
  return { artifact, errors };
}

function toError(packageKey: string, runId: string, createdAt: string, mistake: ComputationMistake): CovenantCalculationError {
  const errorId = createHash("sha256")
    .update(`${packageKey}|${runId}|${mistake.stableKey}|${mistake.message}`)
    .digest("hex")
    .slice(0, 24);
  return {
    errorId: `err:${errorId}`,
    packageKey,
    runId,
    class: "CALCULATION_MISMATCH",
    severity: "HIGH",
    message: mistake.message,
    stage: "INDEPENDENT_EVAL",
    evidence: { stableKey: mistake.stableKey, ...mistake.evidence },
    createdAt,
    correctiveHistory: [],
  };
}
