/**
 * Reviewer-ready examples. Never fabricates reviewer decisions.
 */

import type { CorpusStore } from "../store/corpus-store";
import type { KnowledgeTaxonomyFamily } from "../types";

export interface ReviewerExample {
  exampleId: string;
  sourceId: string;
  sourceUrl: string;
  exactSourceText: string;
  candidateClassification: KnowledgeTaxonomyFamily[];
  dependencyContext: {
    definitions: string[];
    crossReferences: string[];
    relationships: string[];
  };
  proposedInterpretation: string | null;
  knownUncertainty: string[];
  counterexamples: string[];
  reviewerDecisionFields: {
    decision: null;
    reviewerName: null;
    reviewedAt: null;
    notes: null;
    disposition: null;
  };
}

export function buildReviewerDataset(store: CorpusStore, limit = 50): ReviewerExample[] {
  const out: ReviewerExample[] = [];
  for (const s of store.listSources()) {
    const candidates = store.loadCandidates(s.sourceId);
    const defs = store.loadDefinitions(s.sourceId);
    const xrefs = store.loadCrossReferences(s.sourceId);
    const rels = store.loadRelationships().filter((r) => r.sourceId === s.sourceId || r.targetId === s.sourceId);

    for (const c of candidates) {
      if (out.length >= limit) return out;
      const relatedDefs = defs.filter((d) => c.excerpt.includes(d.term)).slice(0, 8);
      out.push({
        exampleId: `rev:${c.candidateId}`,
        sourceId: s.sourceId,
        sourceUrl: s.sourceUrl,
        exactSourceText: c.excerpt,
        candidateClassification: c.families,
        dependencyContext: {
          definitions: relatedDefs.map((d) => d.term),
          crossReferences: xrefs.slice(0, 10).map((x) => x.rawReference),
          relationships: rels.map((r) => `${r.kind}:${r.evidenceStatus}`),
        },
        proposedInterpretation: null, // never invent
        knownUncertainty: c.families.includes("UNKNOWN")
          ? ["classification_unsupported"]
          : c.signals.filter((x) => /risk|ambiguous|unknown/i.test(x)),
        counterexamples: [],
        reviewerDecisionFields: {
          decision: null,
          reviewerName: null,
          reviewedAt: null,
          notes: null,
          disposition: null,
        },
      });
    }
  }
  return out;
}
