/**
 * Evaluation Methodology V2 — candidate generation.
 *
 * Phase 3F.1.5. THIS MODULE PRODUCES PAIRS TO EVALUATE. IT NEVER PRODUCES
 * CREDIT.
 *
 * Coarse filters are allowed and encouraged here (same document, overlapping
 * source span, legal citation, semantic family, shared numbers/metrics,
 * dependency links) purely so the semantic layers do not have to run over the
 * full N×M cross product. Every reason a pair was generated is recorded on the
 * pair (`generationReasons`) so a reviewer can see exactly what was and was not
 * load-bearing: a pair generated only by SECTION_REF_DESCENDANT still has to
 * pass Layers 2 and 3 on content alone, and is rejected if it does not.
 *
 * A ground-truth unit for which candidate generation produces nothing, or
 * produces only candidates that fail the semantic layers, is UNREPRESENTED —
 * never credited by proximity.
 */
import { extractSignals, figuresEquivalent } from "./signals";
import type { CandidateGenerationReason, CandidateSemanticRepresentation, GroundTruthSemanticUnit, SemanticSignals } from "./types";

export interface GeneratedPair {
  gtUnitId: string;
  candidateId: string;
  reasons: CandidateGenerationReason[];
}

export interface CandidateGenerationOptions {
  /** Hard cap on candidates carried into the semantic layers per ground-truth unit, ordered by breadth of generation evidence. */
  maxCandidatesPerUnit: number;
  /** Minimum content-term containment for a SHARED_CONTENT_TERMS pairing to be generated. Purely a recall filter. */
  minContentContainment: number;
}

export const DEFAULT_GENERATION_OPTIONS: CandidateGenerationOptions = {
  maxCandidatesPerUnit: 60,
  minContentContainment: 0.15,
};

// ---------------------------------------------------------------------------
// Structural-address helpers — NAVIGATION ONLY.
//
// These functions exist so a reviewer can see, on each pair, that a structural
// relationship was noted. Nothing downstream reads them for credit.
// ---------------------------------------------------------------------------

export function normalizeSectionRef(ref: string | null | undefined): string {
  return (ref ?? "")
    .replace(/^§/, "")
    .replace(/^Sections?\s+/i, "")
    .replace(/\s+/g, "")
    .toLowerCase()
    .trim();
}

export function structuralRelation(gtRef: string, candidateRef: string | null): CandidateGenerationReason | null {
  const a = normalizeSectionRef(gtRef);
  const b = normalizeSectionRef(candidateRef);
  if (!a || !b) return null;
  if (a === b) return "SECTION_REF_EXACT";
  if (b.startsWith(a) && b[a.length] === "(") return "SECTION_REF_DESCENDANT";
  if (a.startsWith(b) && a[b.length] === "(") return "SECTION_REF_ANCESTOR";
  const baseA = a.split("(")[0] ?? a;
  const baseB = b.split("(")[0] ?? b;
  if (baseA && baseA === baseB) return "SECTION_REF_SIBLING";
  return null;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export interface CandidateIndex {
  candidates: CandidateSemanticRepresentation[];
  byId: Map<string, CandidateSemanticRepresentation>;
  signals: Map<string, SemanticSignals>;
  /** Inverted postings used ONLY to bound the generation scan; they change which pairs are *considered*, never which are credited. */
  byContentTerm: Map<string, string[]>;
  byAction: Map<string, string[]>;
  byFamily: Map<string, string[]>;
  bySectionBase: Map<string, string[]>;
  byDefinedTerm: Map<string, string[]>;
}

function push(map: Map<string, string[]>, key: string, id: string): void {
  const list = map.get(key);
  if (list) list.push(id);
  else map.set(key, [id]);
}

export function buildCandidateIndex(candidates: readonly CandidateSemanticRepresentation[]): CandidateIndex {
  const signals = new Map<string, SemanticSignals>();
  const byContentTerm = new Map<string, string[]>();
  const byAction = new Map<string, string[]>();
  const byFamily = new Map<string, string[]>();
  const bySectionBase = new Map<string, string[]>();
  const byDefinedTerm = new Map<string, string[]>();
  for (const c of candidates) {
    const s = extractSignals({
      text: [...c.excerpts, c.normalizedSemantics, c.formulaSemantics ?? ""].filter(Boolean).join("\n"),
      declaredType: c.provisionRoleDeclared,
      structuredHints: [c.semanticFamily, ...c.referencedDefinedTerms, ...c.objectResource, ...c.action, ...c.scope],
    });
    signals.set(c.candidateId, s);
    for (const t of new Set(s.contentTerms)) push(byContentTerm, t, c.candidateId);
    for (const a of new Set([...c.action, ...s.actions])) push(byAction, a, c.candidateId);
    if (c.semanticFamily) push(byFamily, c.semanticFamily, c.candidateId);
    const base = normalizeSectionRef(c.sectionRef).split("(")[0];
    if (base) push(bySectionBase, `${c.documentId}::${base}`, c.candidateId);
    for (const t of new Set(c.referencedDefinedTerms.map((x) => x.toLowerCase()))) push(byDefinedTerm, t, c.candidateId);
  }
  return {
    candidates: [...candidates],
    byId: new Map(candidates.map((c) => [c.candidateId, c])),
    signals,
    byContentTerm,
    byAction,
    byFamily,
    bySectionBase,
    byDefinedTerm,
  };
}

/**
 * Bounds the generation scan. A term that appears on more than this fraction of
 * all candidates is not discriminative enough to be worth expanding into a
 * posting scan; it can still contribute a SHARED_CONTENT_TERMS reason for a
 * candidate reached by any other posting.
 */
const MAX_POSTING_FRACTION = 0.15;

function scanSet(gt: GroundTruthSemanticUnit, gtSignals: SemanticSignals, index: CandidateIndex): Set<string> {
  const out = new Set<string>();
  const limit = Math.max(1, Math.floor(index.candidates.length * MAX_POSTING_FRACTION));
  const add = (ids: string[] | undefined) => {
    if (!ids) return;
    for (const id of ids) out.add(id);
  };
  for (const t of new Set(gtSignals.contentTerms)) {
    const posting = index.byContentTerm.get(t);
    if (posting && posting.length <= limit) add(posting);
  }
  for (const a of new Set([...gt.action, ...gtSignals.actions])) add(index.byAction.get(a));
  if (gt.semanticFamily) add(index.byFamily.get(gt.semanticFamily));
  for (const t of new Set(gt.referencedDefinedTerms.map((x) => x.toLowerCase()))) add(index.byDefinedTerm.get(t));
  const base = normalizeSectionRef(gt.sectionRef).split("(")[0];
  if (base) add(index.bySectionBase.get(`${gt.documentId}::${base}`));
  return out;
}

export function generateCandidatePairs(
  gt: GroundTruthSemanticUnit,
  gtSignals: SemanticSignals,
  index: CandidateIndex,
  options: CandidateGenerationOptions = DEFAULT_GENERATION_OPTIONS,
): GeneratedPair[] {
  const pairs: GeneratedPair[] = [];
  const gtContentTerms = new Set(gtSignals.contentTerms);
  const gtDefinedTerms = new Set(gt.referencedDefinedTerms.map((t) => t.toLowerCase()));
  const gtFigures = [...gt.figures, ...gtSignals.amounts, ...gtSignals.percentages, ...gtSignals.ratios];
  const gtActions = new Set(gt.action.length > 0 ? gt.action : gtSignals.actions);

  for (const candidateId of scanSet(gt, gtSignals, index)) {
    const candidate = index.byId.get(candidateId);
    if (!candidate) continue;
    if (candidate.datasetKey !== gt.datasetKey) continue;
    const reasons: CandidateGenerationReason[] = [];

    if (candidate.documentId === gt.documentId) reasons.push("SAME_DOCUMENT");

    const rel = structuralRelation(gt.sectionRef, candidate.sectionRef);
    if (rel && candidate.documentId === gt.documentId) reasons.push(rel);

    if (candidate.semanticFamily && candidate.semanticFamily === gt.semanticFamily) reasons.push("SHARED_SEMANTIC_FAMILY");

    const candSignals = index.signals.get(candidate.candidateId);
    const candActions = new Set(candidate.action.length > 0 ? candidate.action : (candSignals?.actions ?? []));
    if ([...gtActions].some((a) => candActions.has(a))) reasons.push("SHARED_ACTION_TAG");

    const candFigures = [...candidate.figures, ...(candSignals?.amounts ?? []), ...(candSignals?.percentages ?? []), ...(candSignals?.ratios ?? [])];
    if (gtFigures.length > 0 && candFigures.some((c) => gtFigures.some((g) => figuresEquivalent(g, c)))) reasons.push("SHARED_NUMERIC_FIGURE");

    if (gtDefinedTerms.size > 0 && candidate.referencedDefinedTerms.some((t) => gtDefinedTerms.has(t.toLowerCase()))) reasons.push("SHARED_DEFINED_TERM");

    let containmentScore = 0;
    if (candSignals && gtContentTerms.size > 0) {
      let inter = 0;
      for (const t of new Set(candSignals.contentTerms)) if (gtContentTerms.has(t)) inter += 1;
      containmentScore = inter / gtContentTerms.size;
      if (containmentScore >= options.minContentContainment) reasons.push("SHARED_CONTENT_TERMS");
    }

    if (candidate.dependencyRefs.some((d) => gt.crossReferences.includes(d)) || gt.materialDependencies.some((d) => candidate.dependencyRefs.includes(d))) {
      reasons.push("DEPENDENCY_LINK");
    }

    // A pair is generated only when there is at least ONE content-bearing
    // reason, or a structural reason inside the same document. SAME_DOCUMENT
    // alone is never enough — it would generate the entire cross product.
    const contentReasons = reasons.filter((r) => r !== "SAME_DOCUMENT");
    if (contentReasons.length === 0) continue;

    pairs.push({ gtUnitId: gt.gtUnitId, candidateId: candidate.candidateId, reasons });
  }

  // Ordering for the per-unit cap: prefer pairs generated by more independent
  // reasons, and among ties prefer content-bearing reasons over structural
  // ones, so a truncation never silently drops the semantically-closest
  // candidate in favour of a structurally-adjacent one.
  const contentWeight: Record<CandidateGenerationReason, number> = {
    SHARED_CONTENT_TERMS: 4,
    SHARED_ACTION_TAG: 4,
    SHARED_SEMANTIC_FAMILY: 3,
    SHARED_NUMERIC_FIGURE: 3,
    SHARED_DEFINED_TERM: 3,
    DEPENDENCY_LINK: 2,
    SECTION_REF_EXACT: 1,
    SECTION_REF_ANCESTOR: 1,
    SECTION_REF_DESCENDANT: 1,
    SECTION_REF_SIBLING: 1,
    SAME_DOCUMENT: 3,
    EXPLICIT_TEST_PAIRING: 5,
  };
  pairs.sort((a, b) => {
    const wa = a.reasons.reduce((s, r) => s + contentWeight[r], 0);
    const wb = b.reasons.reduce((s, r) => s + contentWeight[r], 0);
    if (wb !== wa) return wb - wa;
    return a.candidateId.localeCompare(b.candidateId);
  });

  return pairs.slice(0, options.maxCandidatesPerUnit);
}
