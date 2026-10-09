/**
 * Independent evaluation of the reviewer queue.
 *
 * Separates heuristic failure-mode labels from independently confirmed legal defects.
 * Confirmation requires recovered controlling context + shape comparison — never
 * asserts a certified legal defect from an isolated window.
 */
import { recoverControllingContext } from "./context";
import { lexicalJaccard } from "./similarity";
import type { NoveltyFinding, ReviewerQueueItem } from "./types";
import type {
  IndependentReviewItem,
  IndependentReviewLabel,
  IndependentReviewReport,
} from "./phase2-types";
import { DRAFTING_NOVELTY_PHASE2_VERSION } from "./phase2-types";

const FAMILIAR_SHAPE_HINTS: RegExp[] = [
  /\bgreater of\b.+\beBITDA\b/i,
  /\bRestricted Subsidiar/i,
  /\bRequired Lenders?\b/i,
  /\bCash Equivalents\b.+\bmeans\b/i,
  /\bshall not,? and shall not permit\b/i,
];

function labelFor(
  item: ReviewerQueueItem,
  finding: NoveltyFinding | undefined,
  contextCompleteness: string,
  neighborJaccard: number,
): { label: IndependentReviewLabel; confirmed: boolean | null; uncertainty: string; rationale: string } {
  if (contextCompleteness === "CONTEXT_INCOMPLETE") {
    return {
      label: "UNRESOLVED_MISSING_CONTEXT",
      confirmed: null,
      uncertainty: "controlling_context_incomplete",
      rationale: "Independent review refused: controlling provision / surrounding context incomplete.",
    };
  }

  const excerpt = item.sourceSpan.excerpt;
  // Extraction artifact: page markers, cut mid-word, or pure definitional TOC noise without operative verbs.
  const midWordCut = /^[a-z]{1,8}\s/.test(excerpt) && !/^[A-Z(]/.test(excerpt.trim());
  const pageNoise = /-\d{1,3}-/.test(excerpt) && excerpt.length < 220;
  if (midWordCut || pageNoise) {
    return {
      label: "DUPLICATE_OR_EXTRACTION_ARTIFACT",
      confirmed: false,
      uncertainty: "extraction_window_quality",
      rationale: "Window appears truncated or page-artifact contaminated; treat as extraction artifact until re-anchored.",
    };
  }

  // Near-duplicate of another queue item signature with very high lexical overlap to a corpus neighbor.
  if (neighborJaccard >= 0.85 && finding && finding.corpusSupport > 0) {
    return {
      label: "FAMILIAR_SHAPE_DIFFERENT_WORDING",
      confirmed: false,
      uncertainty: "high_lexical_overlap_with_corpus_support",
      rationale: "Signature has corpus support and a high lexical neighbor overlap — familiar shape, different wording.",
    };
  }

  const familiar = FAMILIAR_SHAPE_HINTS.some((re) => re.test(excerpt));
  const highRiskTokens = finding?.signatureTokens ?? [];
  const rareShape =
    finding?.corpusSupport === 0 &&
    (highRiskTokens.includes("RECLASSIFY_AUTOMATIC") ||
      highRiskTokens.includes("FIXED_VS_INCURRENCE") ||
      highRiskTokens.includes("IN_THE_AGGREGATE_WITH") ||
      highRiskTokens.includes("CROSS_DOC_CAP_REFERENCE") ||
      highRiskTokens.includes("CROSS_DOC_REFINANCING_LINEAGE") ||
      highRiskTokens.includes("INTERCREDITOR_TURNOVER") ||
      highRiskTokens.includes("INTERCREDITOR_STANDSTILL") ||
      highRiskTokens.includes("AMENDMENT_AFFECTED_LENDER") ||
      highRiskTokens.includes("AMENDMENT_YANK_A_BANK") ||
      (highRiskTokens.includes("PROVISO_AFTER_PERMISSION") && highRiskTokens.includes("NOTWITHSTANDING_OVERRIDE")));

  if (rareShape && contextCompleteness === "COMPLETE") {
    return {
      label: "POTENTIALLY_MATERIAL_LEGAL_VARIATION",
      confirmed: null,
      uncertainty: "shape_rare_in_balanced_corpus_but_legal_effect_unverified",
      rationale:
        "Zero corpus signature support with high-risk tokens and recovered controlling context. Potentially material; legal defect NOT independently confirmed without solver/IR adjudication.",
    };
  }

  if (rareShape) {
    return {
      label: "GENUINELY_UNFAMILIAR_SHAPE",
      confirmed: null,
      uncertainty: "unfamiliar_shape_partial_context",
      rationale: "Drafting shape is unfamiliar relative to corpus signatures; context only partial — do not treat heuristic failure mode as confirmed defect.",
    };
  }

  if (familiar || (finding && finding.corpusSupport > 0)) {
    return {
      label: "FAMILIAR_SHAPE_DIFFERENT_WORDING",
      confirmed: false,
      uncertainty: "none_material",
      rationale: "Matches familiar market drafting patterns or has corpus signature support.",
    };
  }

  return {
    label: "GENUINELY_UNFAMILIAR_SHAPE",
    confirmed: null,
    uncertainty: "insufficient_precedent_neighbors",
    rationale: "No strong familiarity signals; flagged as unfamiliar shape pending broader corpus.",
  };
}

/** Stratified sample across categories from the 40-item queue. */
export function stratifyQueueSample(queue: ReviewerQueueItem[], perCategory = 2, limit = 20): ReviewerQueueItem[] {
  const buckets = new Map<string, ReviewerQueueItem[]>();
  for (const q of queue) {
    const list = buckets.get(q.category) ?? [];
    list.push(q);
    buckets.set(q.category, list);
  }
  const out: ReviewerQueueItem[] = [];
  for (const cat of [...buckets.keys()].sort()) {
    const list = buckets.get(cat) ?? [];
    out.push(...list.slice(0, perCategory));
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

export function independentlyReviewQueue(
  queue: ReviewerQueueItem[],
  findings: NoveltyFinding[],
  options?: { sampleSize?: number; repoRoot?: string },
): IndependentReviewReport {
  const byId = new Map(findings.map((f) => [f.findingId, f]));
  const sample = stratifyQueueSample(queue, 2, options?.sampleSize ?? 20);
  const items: IndependentReviewItem[] = [];

  for (const q of sample) {
    const finding = byId.get(q.findingId);
    const ctx = recoverControllingContext(
      finding ?? {
        findingId: q.findingId,
        unitId: q.findingId,
        category: q.category,
        noveltyScore: q.noveltyScore,
        rarityRank: q.queueRank,
        corpusSupport: 0,
        probeSupport: 1,
        clusterSize: 1,
        signatureKey: q.signatureKey,
        signatureTokens: [],
        suspectedFailureMode: q.suspectedFailureMode,
        failureRationale: "",
        span: q.sourceSpan,
        comparisonExamples: q.comparisonExamples,
        nearestCorpusSignatureDistance: 1,
        notes: [],
      },
      options?.repoRoot ?? process.cwd(),
    );
    const neighborJ = Math.max(0, ...q.comparisonExamples.map((n) => n.jaccard));
    const { label, confirmed, uncertainty, rationale } = labelFor(q, finding, ctx.completeness, neighborJ);

    items.push({
      queueRank: q.queueRank,
      findingId: q.findingId,
      category: q.category,
      heuristicFailureMode: q.suspectedFailureMode,
      independentLabel: label,
      confirmedLegalDefect: confirmed,
      defectUncertainty: uncertainty,
      contextCompleteness: ctx.completeness,
      rationale,
      sourceSpan: q.sourceSpan,
      signatureKey: q.signatureKey,
    });
  }

  const countsByLabel = {
    GENUINELY_UNFAMILIAR_SHAPE: 0,
    FAMILIAR_SHAPE_DIFFERENT_WORDING: 0,
    DUPLICATE_OR_EXTRACTION_ARTIFACT: 0,
    POTENTIALLY_MATERIAL_LEGAL_VARIATION: 0,
    UNRESOLVED_MISSING_CONTEXT: 0,
  } as Record<IndependentReviewLabel, number>;
  for (const it of items) countsByLabel[it.independentLabel] += 1;

  return {
    version: DRAFTING_NOVELTY_PHASE2_VERSION,
    generatedAt: new Date().toISOString(),
    sampleSize: items.length,
    queueSize: queue.length,
    stratification: "up_to_2_per_category_from_40_queue",
    countsByLabel,
    confirmedLegalDefectCount: items.filter((i) => i.confirmedLegalDefect === true).length,
    heuristicOnlyFailureModeCount: items.filter((i) => i.confirmedLegalDefect !== true).length,
    items,
  };
}

void lexicalJaccard;
