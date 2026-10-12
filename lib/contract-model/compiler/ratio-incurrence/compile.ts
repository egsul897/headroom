/**
 * Compile a fully specified ratio-incurrence permission into a fail-closed
 * representation. Incomplete formulas refuse — never invent thresholds.
 *
 * This does NOT produce production AVAILABLE capacity. Financial snapshot
 * dependencies remain missingDependencies until an approved snapshot supplies them.
 */
import { createHash } from "node:crypto";
import {
  classifyRatioIncurrencePermission,
  type RatioIncurrenceClassification,
} from "./classify";

export const RATIO_INCURRENCE_COMPILER_VERSION = "ratio-incurrence.v1";

export type RatioIncurrenceExecutableClass =
  | "RATIO_STRUCTURE_CANDIDATE"
  | "UNSUPPORTED"
  | "FAILED";

export interface RatioIncurrenceCompileArgs {
  companyId: string;
  instrumentKey: string;
  sourceDocumentId: string;
  candidateRef: string;
  sourceSectionRef: string;
  operativeSourceText: string;
  /** Optional closed definition texts keyed by term — required for elevation beyond STRUCTURE. */
  closedDefinitions?: ReadonlyMap<string, string> | Record<string, string>;
}

export interface RatioIncurrenceCompileResult {
  classification: RatioIncurrenceClassification;
  executableClass: RatioIncurrenceExecutableClass;
  missingDependencies: string[];
  /** True only when every declared defined-term dependency has a non-empty closed definition body. */
  definitionClosureComplete: boolean;
  financialMetricDependencies: string[];
  sourceCitation: {
    documentId: string;
    sourceSectionRef: string;
    candidateRef: string;
  };
  legalConditions: string[];
  compilerVersion: string;
  sourceContentVersion: string;
  /**
   * Ratio rules are never elevated to VERIFIED_EXECUTABLE numeric capacity here —
   * that requires approved financial snapshots + utilization gates.
   */
  numericCapacityAuthority: "REFUSED_PENDING_FINANCIAL_SNAPSHOT";
}

function asMap(
  closed?: ReadonlyMap<string, string> | Record<string, string>,
): Map<string, string> {
  if (!closed) return new Map();
  if (closed instanceof Map) return new Map(closed);
  return new Map(Object.entries(closed));
}

export function compileRatioIncurrencePermission(
  args: RatioIncurrenceCompileArgs,
): RatioIncurrenceCompileResult {
  const classification = classifyRatioIncurrencePermission(args.operativeSourceText);
  const sourceContentVersion = createHash("sha256")
    .update(`${RATIO_INCURRENCE_COMPILER_VERSION}|${args.operativeSourceText}`)
    .digest("hex")
    .slice(0, 32);
  const base = {
    classification,
    sourceCitation: {
      documentId: args.sourceDocumentId,
      sourceSectionRef: args.sourceSectionRef,
      candidateRef: args.candidateRef,
    },
    legalConditions: classification.conditionExcerpts,
    compilerVersion: RATIO_INCURRENCE_COMPILER_VERSION,
    sourceContentVersion,
    numericCapacityAuthority: "REFUSED_PENDING_FINANCIAL_SNAPSHOT" as const,
  };

  if (classification.class === "NOT_RATIO_INCURRENCE") {
    return {
      ...base,
      executableClass: "UNSUPPORTED",
      missingDependencies: classification.reasons,
      definitionClosureComplete: false,
      financialMetricDependencies: [],
    };
  }

  if (classification.class === "RATIO_INCURRENCE_INCOMPLETE") {
    return {
      ...base,
      executableClass: "UNSUPPORTED",
      missingDependencies: classification.reasons,
      definitionClosureComplete: false,
      financialMetricDependencies: classification.definedTermDependencies,
    };
  }

  const closed = asMap(args.closedDefinitions);
  const missingDefs: string[] = [];
  for (const term of classification.definedTermDependencies) {
    const body = closed.get(term);
    if (!body || body.trim().length < 20) missingDefs.push(`definition:${term}`);
  }
  const definitionClosureComplete = missingDefs.length === 0;

  // Fully specified structure may be recognized, but never becomes numeric VE
  // without closed definitions AND (separately) approved financial inputs.
  const missingDependencies = [
    ...missingDefs,
    "approved_financial_snapshot",
    "utilization_completeness_certificate",
    "trusted_issuer_activation",
  ];

  return {
    ...base,
    executableClass: definitionClosureComplete ? "RATIO_STRUCTURE_CANDIDATE" : "UNSUPPORTED",
    missingDependencies,
    definitionClosureComplete,
    financialMetricDependencies: classification.definedTermDependencies,
  };
}
