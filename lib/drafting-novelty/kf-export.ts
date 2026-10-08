/**
 * Knowledge Factory novelty import export.
 *
 * Uses the canonical KF integration fields (KnowledgeSourceRecord-aligned
 * sourceIdentity) plus novelty/context/reviewer payload.
 * Does NOT create a competing production schema or write Permission/capacity rules.
 */
import { recoverControllingContext } from "./context";
import type { NoveltyFinding, ReviewerQueueItem } from "./types";
import type {
  HighRiskDraftingExample,
  IndependentReviewItem,
  KnowledgeFactoryNoveltyImportRecord,
} from "./phase2-types";

const HIGH_RISK_FAMILY_BY_CATEGORY: Record<string, HighRiskDraftingExample["family"]> = {
  RECLASSIFICATION: "AUTOMATIC_RECLASSIFICATION",
  SHARED_CAPACITY: "SHARED_BASKET_CAPACITY",
  ENTITY_SCOPE: "ENTITY_SPECIFIC_SUBLIMIT",
  PROVISO_PLACEMENT: "HANGING_PROVISO",
  CROSS_DOCUMENT_RESTRICTION: "CROSS_DOCUMENT_RESTRICTION",
  AMENDMENT_MECHANISM: "AMENDMENT_CONSENT",
  INTERCREDITOR_LIMITATION: "INTERCREDITOR_PAYMENT",
  BASKET_FORMULA: "COMPARATOR_THRESHOLD",
  DEFINITION_FORMULATION: "FINANCIAL_DEFINITION_CHANGE",
  COVENANT_STRUCTURE: "NONOBVIOUS_EXCEPTION_NESTING",
};

export function buildKnowledgeFactoryImport(
  findings: NoveltyFinding[],
  queue: ReviewerQueueItem[],
  reviews: IndependentReviewItem[],
  options?: { repoRoot?: string; limit?: number },
): KnowledgeFactoryNoveltyImportRecord[] {
  const reviewById = new Map(reviews.map((r) => [r.findingId, r]));
  const queueById = new Map(queue.map((q) => [q.findingId, q]));
  const prioritized = [...findings].sort((a, b) => {
    const qa = queueById.get(a.findingId)?.queueRank ?? 999;
    const qb = queueById.get(b.findingId)?.queueRank ?? 999;
    return qa - qb || b.noveltyScore - a.noveltyScore;
  });

  const out: KnowledgeFactoryNoveltyImportRecord[] = [];
  for (const f of prioritized.slice(0, options?.limit ?? 40)) {
    const ctx = recoverControllingContext(f, options?.repoRoot ?? process.cwd());
    const rev = reviewById.get(f.findingId);
    const q = queueById.get(f.findingId);
    const unresolved: string[] = [...ctx.missingPieces];
    if (ctx.completeness === "CONTEXT_INCOMPLETE") unresolved.push("CONTEXT_INCOMPLETE");
    if (rev?.confirmedLegalDefect == null) unresolved.push("legal_defect_unconfirmed");

    let disposition: KnowledgeFactoryNoveltyImportRecord["reviewerStatus"]["disposition"] = "PENDING_REVIEW";
    if (ctx.completeness === "CONTEXT_INCOMPLETE") disposition = "CONTEXT_INCOMPLETE";
    else if (rev?.independentLabel === "DUPLICATE_OR_EXTRACTION_ARTIFACT") disposition = "ARTIFACT";
    else if (rev?.independentLabel === "POTENTIALLY_MATERIAL_LEGAL_VARIATION" || (q && q.queueRank <= 15)) {
      disposition = "PRIORITIZED";
    }

    out.push({
      exportId: `kf-novelty:${f.findingId}`,
      schema: "knowledge-factory.novelty-import.v1",
      sourceId: f.span.documentId,
      sourceIdentity: {
        documentTitle: f.span.path.split("/").pop() ?? f.span.documentId,
        packageId: f.span.path.includes("unseen-packages/")
          ? f.span.path.split("unseen-packages/")[1]?.split("/")[0] ?? "unknown"
          : "acquired",
        path: f.span.path,
        normalizedTextHash: ctx.documentHash || ctx.windowHash,
        usageRightsReviewStatus: f.span.path.includes("tests/fixtures") ? "FIXTURE_INTERNAL" : "PUBLIC_SEC_EDGAR",
      },
      noveltySignature: {
        category: f.category,
        signatureKey: f.signatureKey,
        tokens: f.signatureTokens,
        noveltyScore: f.noveltyScore,
      },
      controllingSourceContext: ctx,
      dependencyReferences: {
        definedTerms: ctx.definedTerms.map((d) => d.term),
        crossReferences: ctx.crossReferences,
        amendmentHints: ctx.amendmentHints,
        relatedDocumentHints: ctx.relatedDocumentHints,
      },
      riskHypothesis: {
        heuristicFailureMode: f.suspectedFailureMode,
        rationale: f.failureRationale,
        highRiskFamily: HIGH_RISK_FAMILY_BY_CATEGORY[f.category] ?? "NONOBVIOUS_EXCEPTION_NESTING",
        uncertainty: [
          "heuristic_failure_mode_is_not_confirmed_legal_defect",
          ...(rev ? [rev.defectUncertainty] : []),
          ...ctx.notes,
        ],
      },
      reviewerStatus: {
        queueRank: q?.queueRank,
        independentLabel: rev?.independentLabel,
        confirmedLegalDefect: rev?.confirmedLegalDefect ?? null,
        disposition,
      },
      precedentNeighbors: f.comparisonExamples,
      unresolvedIssues: [...new Set(unresolved)],
      representationLevel: ctx.completeness === "CONTEXT_INCOMPLETE" ? "DISCOVERED_CANDIDATE" : "REVIEW_REQUIRED",
      paidCalls: 0,
      productionLegalRulesModified: false,
    });
  }
  return out;
}

export function buildHighRiskExamples(
  findings: NoveltyFinding[],
  reviews: IndependentReviewItem[],
  repoRoot = process.cwd(),
): HighRiskDraftingExample[] {
  const reviewById = new Map(reviews.map((r) => [r.findingId, r]));
  const families = Object.values(HIGH_RISK_FAMILY_BY_CATEGORY);
  const out: HighRiskDraftingExample[] = [];

  for (const family of families) {
    const category = (Object.entries(HIGH_RISK_FAMILY_BY_CATEGORY).find(([, v]) => v === family)?.[0] ??
      "COVENANT_STRUCTURE") as NoveltyFinding["category"];
    const candidates = findings
      .filter((f) => f.category === category)
      .sort((a, b) => b.noveltyScore - a.noveltyScore);
    const primary = candidates[0];
    if (!primary) continue;
    const ctx = recoverControllingContext(primary, repoRoot);
    const counters = candidates.slice(1, 3).map((c) => c.span);
    const rev = reviewById.get(primary.findingId);
    out.push({
      exampleId: `highrisk:${family}:${primary.findingId}`,
      family,
      findingId: primary.findingId,
      sourceSpan: primary.span,
      controllingContextCompleteness: ctx.completeness,
      counterexampleSpans: counters,
      riskHypothesis: primary.failureRationale,
      uncertainty: [
        "Not a certified legal defect",
        ...(ctx.missingPieces.length ? [`missing:${ctx.missingPieces.join(",")}`] : []),
        rev?.defectUncertainty ?? "independent_review_pending_or_unconfirmed",
      ],
      independentLabel: rev?.independentLabel,
    });
  }
  return out;
}
