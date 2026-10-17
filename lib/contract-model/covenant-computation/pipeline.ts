/**
 * One covenant-computation pass on the Phase-4A spine.
 *
 * compute → cite-bound verify → mistakes as CALCULATION_MISMATCH records
 * the learning factory (#356) can store. This module does not write Neon
 * and does not call the legacy covenant engine.
 */

import { createHash } from "node:crypto";
import type { LearnedRuleSet } from "@/lib/covenant-learning-factory/learned-rules/types";
import { bindFinancialInputs } from "./bind-inputs";
import { evaluateBaskets, categorize } from "./baskets";
import { learningRecords, type LearningRecordSink } from "./learning-records";
import { computeRatios } from "./ratios";
import type {
  AppliedCorrection,
  ComputationCorrection,
  ComputationPackage,
  ComputationResult,
  RefusedCorrection,
} from "./types";
import { CERTIFICATION, COVENANT_COMPUTATION_VERSION } from "./types";
import { citedIn } from "./text";
import { verifyComputation } from "./verify";
import type { MetricInput } from "../runtime/types";

export interface RunCovenantComputationOptions {
  corrections?: readonly ComputationCorrection[];
  sink?: LearningRecordSink;
  createdAt?: string;
  /** Runtime-loaded learned rules from learned-rules/vN.json or Neon. */
  rules?: LearnedRuleSet;
  /**
   * Filing-derived inputs (SEC XBRL) already bound to contract metric names by their definitions
   * (lib/covenant-learning-factory/xbrl/bind.ts). Package-document inputs win on a name clash.
   */
  externalMetrics?: readonly MetricInput[];
}

export function runCovenantComputation(
  pkg: ComputationPackage,
  options: RunCovenantComputationOptions = {},
): ComputationResult {
  const docBound = bindFinancialInputs(pkg.documents);
  const have = new Set(docBound.metrics.map((m) => m.metricKey.toLowerCase()));
  const bound = { ...docBound, metrics: [...docBound.metrics, ...(options.externalMetrics ?? []).filter((m) => !have.has(m.metricKey.toLowerCase()))] };
  const ratios = computeRatios(pkg, bound);
  const baskets = evaluateBaskets(pkg, bound.metrics, ratios, options.rules);
  const { applied, refused } = applyCorrections(pkg, baskets, options.corrections ?? [], options.rules);
  const result: ComputationResult = {
    packageKey: pkg.packageKey,
    companyId: pkg.companyId,
    instrumentKey: pkg.instrumentKey,
    asOf: pkg.asOf,
    version: COVENANT_COMPUTATION_VERSION,
    certification: CERTIFICATION,
    ratios,
    baskets,
    correctionsApplied: applied,
    correctionsRefused: refused,
    mistakes: [],
    omissions: (pkg.omissions ?? []).map((omission) => ({
      ...omission,
      status: "NEEDS_INPUT" as const,
      capCanonical: null,
    })),
  };
  result.mistakes = verifyComputation({ pkg, result, metrics: bound.metrics });
  const createdAt = options.createdAt ?? new Date().toISOString();
  const runId = createHash("sha256")
    .update(`${pkg.packageKey}|${pkg.asOf}|${createdAt}`)
    .digest("hex")
    .slice(0, 16);
  if (options.sink) {
    const records = learningRecords({ result, runId, createdAt });
    options.sink.saveArtifact(records.artifact);
    for (const error of records.errors) options.sink.saveError(error);
  }
  return result;
}

function applyCorrections(
  pkg: ComputationPackage,
  baskets: ComputationResult["baskets"],
  corrections: readonly ComputationCorrection[],
  rules?: LearnedRuleSet,
): { applied: AppliedCorrection[]; refused: RefusedCorrection[] } {
  const applied: AppliedCorrection[] = [];
  const refused: RefusedCorrection[] = [];
  for (const correction of corrections) {
    const basket = baskets.find((b) => b.stableKey === correction.stableKey);
    if (!basket) {
      refused.push({ stableKey: correction.stableKey, field: correction.field, reason: "No basket with that key." });
      continue;
    }
    if (!citedIn(basket.citationExcerpt, correction.citationExcerpt)) {
      refused.push({
        stableKey: correction.stableKey,
        field: correction.field,
        reason: "Correction citation is not in the operative text.",
      });
      continue;
    }
    const fresh = categorize(basket.citationExcerpt, rules);
    if (correction.corrected !== fresh) {
      refused.push({
        stableKey: correction.stableKey,
        field: correction.field,
        reason: `Correction ${correction.corrected} disagrees with the clause classification ${fresh}.`,
      });
      continue;
    }
    const doc = pkg.documents.find((d) => d.documentId === basket.sourceDocumentId);
    if (!doc || !citedIn(doc.text, correction.citationExcerpt)) {
      refused.push({
        stableKey: correction.stableKey,
        field: correction.field,
        reason: "Correction citation is not in the source document.",
      });
      continue;
    }
    applied.push({
      stableKey: correction.stableKey,
      field: correction.field,
      corrected: correction.corrected,
      rationale: correction.rationale,
    });
  }
  return { applied, refused };
}
