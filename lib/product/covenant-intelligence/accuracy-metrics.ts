/**
 * Workstream 7 — Real accuracy measurement.
 *
 * Reports the ten required metrics separately. Never substitutes provision
 * counts or pathway counts for accuracy.
 */

export const ACCURACY_METRICS_VERSION = "product.covenant-accuracy-metrics.v1";

export type CovenantFamilyBucket =
  | "DEBT_INCURRENCE"
  | "LIENS"
  | "RESTRICTED_PAYMENTS"
  | "INVESTMENTS"
  | "ASSET_SALES"
  | "GUARANTEES"
  | "FINANCIAL_MAINTENANCE"
  | "SHARED_CAPACITY"
  | "DEFINITIONS"
  | "AMENDMENTS"
  | "OTHER";

export type DocumentComplexity = "SIMPLE" | "STANDARD" | "COMPLEX" | "CROSS_DOCUMENT";

export interface CaseOutcome {
  caseId: string;
  family: CovenantFamilyBucket;
  complexity: DocumentComplexity;
  /** Held-out / previously unseen agreement. */
  unseen: boolean;
  /** Expert-adjudicated — never AI-generated as verified legal truth. */
  expertAdjudicated: boolean;
  materialProvisionsExpected: number;
  materialProvisionsRetrieved: number;
  definitionsExpected: number;
  definitionsRetrieved: number;
  dangerousOmission: boolean;
  interpretationCorrect: boolean | null;
  formulaExtractionCorrect: boolean | null;
  crossCovenantCorrect: boolean | null;
  transactionCorrect: boolean | null;
  unsupportedConclusion: boolean;
  citationCorrect: boolean;
}

export interface AccuracyReport {
  version: typeof ACCURACY_METRICS_VERSION;
  /** 1 */ materialProvisionRetrievalRecall: number | null;
  /** 2 */ definitionAndDependencyCoverage: number | null;
  /** 3 */ dangerousOmissionRate: number | null;
  /** 4 */ provisionInterpretationAccuracy: number | null;
  /** 5 */ formulaExtractionAccuracy: number | null;
  /** 6 */ crossCovenantReasoningAccuracy: number | null;
  /** 7 */ transactionLevelCorrectness: number | null;
  /** 8 */ unsupportedConclusionRate: number | null;
  /** 9 */ citationCorrectness: number | null;
  /** 10 */ accuracyOnPreviouslyUnseenAgreements: number | null;
  byFamily: Record<string, { n: number; interpretationAccuracy: number | null; dangerousOmissionRate: number | null }>;
  byComplexity: Record<string, { n: number; transactionCorrectness: number | null }>;
  /** Cases that are not expert-adjudicated are excluded from accuracy numerators. */
  expertAdjudicatedCases: number;
  nonExpertCasesExcludedFromTruth: number;
  notes: string[];
}

function ratio(num: number, den: number): number | null {
  if (den === 0) return null;
  return num / den;
}

function meanOfBooleans(xs: Array<boolean | null>): number | null {
  const vals = xs.filter((x): x is boolean => x !== null);
  if (vals.length === 0) return null;
  return vals.filter(Boolean).length / vals.length;
}

export function computeAccuracyReport(cases: readonly CaseOutcome[]): AccuracyReport {
  const expert = cases.filter((c) => c.expertAdjudicated);
  const notes: string[] = [
    "AI-generated expectations are never counted as verified legal truth.",
    "Provision/pathway counts are not used as accuracy substitutes.",
  ];

  const matExp = expert.reduce((s, c) => s + c.materialProvisionsExpected, 0);
  const matGot = expert.reduce((s, c) => s + Math.min(c.materialProvisionsRetrieved, c.materialProvisionsExpected), 0);
  const defExp = expert.reduce((s, c) => s + c.definitionsExpected, 0);
  const defGot = expert.reduce((s, c) => s + Math.min(c.definitionsRetrieved, c.definitionsExpected), 0);

  const byFamily: AccuracyReport["byFamily"] = {};
  for (const c of expert) {
    const slot = (byFamily[c.family] ??= { n: 0, interpretationAccuracy: null, dangerousOmissionRate: null });
    slot.n++;
  }
  for (const fam of Object.keys(byFamily)) {
    const rows = expert.filter((c) => c.family === fam);
    byFamily[fam]!.interpretationAccuracy = meanOfBooleans(rows.map((r) => r.interpretationCorrect));
    byFamily[fam]!.dangerousOmissionRate = ratio(rows.filter((r) => r.dangerousOmission).length, rows.length);
  }

  const byComplexity: AccuracyReport["byComplexity"] = {};
  for (const c of expert) {
    const slot = (byComplexity[c.complexity] ??= { n: 0, transactionCorrectness: null });
    slot.n++;
  }
  for (const cx of Object.keys(byComplexity)) {
    const rows = expert.filter((c) => c.complexity === cx);
    byComplexity[cx]!.transactionCorrectness = meanOfBooleans(rows.map((r) => r.transactionCorrect));
  }

  const unseen = expert.filter((c) => c.unseen);

  return {
    version: ACCURACY_METRICS_VERSION,
    materialProvisionRetrievalRecall: ratio(matGot, matExp),
    definitionAndDependencyCoverage: ratio(defGot, defExp),
    dangerousOmissionRate: ratio(expert.filter((c) => c.dangerousOmission).length, expert.length),
    provisionInterpretationAccuracy: meanOfBooleans(expert.map((c) => c.interpretationCorrect)),
    formulaExtractionAccuracy: meanOfBooleans(expert.map((c) => c.formulaExtractionCorrect)),
    crossCovenantReasoningAccuracy: meanOfBooleans(expert.map((c) => c.crossCovenantCorrect)),
    transactionLevelCorrectness: meanOfBooleans(expert.map((c) => c.transactionCorrect)),
    unsupportedConclusionRate: ratio(expert.filter((c) => c.unsupportedConclusion).length, expert.length),
    citationCorrectness: ratio(expert.filter((c) => c.citationCorrect).length, expert.length),
    accuracyOnPreviouslyUnseenAgreements: meanOfBooleans(unseen.map((c) => c.transactionCorrect ?? c.interpretationCorrect)),
    byFamily,
    byComplexity,
    expertAdjudicatedCases: expert.length,
    nonExpertCasesExcludedFromTruth: cases.length - expert.length,
    notes,
  };
}

/** Compare two reports (before/after). Null-safe deltas. */
export function accuracyDelta(before: AccuracyReport, after: AccuracyReport): Record<string, number | null> {
  const keys = [
    "materialProvisionRetrievalRecall",
    "definitionAndDependencyCoverage",
    "dangerousOmissionRate",
    "provisionInterpretationAccuracy",
    "formulaExtractionAccuracy",
    "crossCovenantReasoningAccuracy",
    "transactionLevelCorrectness",
    "unsupportedConclusionRate",
    "citationCorrectness",
    "accuracyOnPreviouslyUnseenAgreements",
  ] as const;
  const out: Record<string, number | null> = {};
  for (const k of keys) {
    const b = before[k];
    const a = after[k];
    out[k] = b == null || a == null ? null : a - b;
  }
  return out;
}
