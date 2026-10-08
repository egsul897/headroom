/**
 * Corpus quality audit — legal coverage, not just document count.
 */

import type { CorpusStore } from "../store/corpus-store";
import { TAXONOMY_FAMILIES } from "../taxonomy/families";
import { findExactByteDuplicates, findExactNormalizedDuplicates } from "../dedupe/near-duplicate";
import type { KnowledgeTaxonomyFamily } from "../types";

export interface CorpusQualityReport {
  generatedAt: string;
  sourceCoverage: {
    issuers: number;
    documents: number;
    byFormType: Record<string, number>;
    byDocumentClass: Record<string, number>;
  };
  covenantFamilyCoverage: Record<string, number>;
  uncoveredTaxonomyFamilies: KnowledgeTaxonomyFamily[];
  definitionDiversity: { uniqueTerms: number; totalDefinitions: number };
  amendmentChainCompleteness: {
    amendments: number;
    linkedAmendments: number;
    unlinkedAmendments: number;
  };
  parsingSuccess: {
    structurallyIndexed: number;
    failed: number;
    unsupported: number;
    ambiguousNodes: number;
  };
  missingOperativeAuthority: number;
  duplicateContamination: {
    exactBytePairs: number;
    normalizedPairs: number;
  };
  unverifiedSemanticHypotheses: number;
  notes: string[];
}

export function auditCorpusQuality(store: CorpusStore): CorpusQualityReport {
  const sources = store.listSources();
  const issuers = new Set(sources.map((s) => s.issuerCik));
  const byFormType: Record<string, number> = {};
  const byDocumentClass: Record<string, number> = {};
  const familyCounts: Record<string, number> = {};
  const terms = new Set<string>();
  let totalDefinitions = 0;
  let structurallyIndexed = 0;
  let failed = 0;
  let unsupported = 0;
  let ambiguousNodes = 0;
  let missingOperativeAuthority = 0;
  let unverifiedSemanticHypotheses = 0;

  for (const s of sources) {
    byFormType[s.formType] = (byFormType[s.formType] ?? 0) + 1;
    byDocumentClass[s.documentClass] = (byDocumentClass[s.documentClass] ?? 0) + 1;
    if (s.extractionStatus === "STRUCTURALLY_INDEXED" || s.representationLevel === "STRUCTURALLY_INDEXED" || s.representationLevel === "DISCOVERED_CANDIDATE") {
      structurallyIndexed += 1;
    }
    if (s.extractionStatus === "FAILED") failed += 1;
    if (s.extractionStatus === "UNSUPPORTED_FORMAT") unsupported += 1;
    if (s.representationLevel === "SOURCE_ONLY" || s.representationLevel === "DISCOVERED_CANDIDATE" || s.representationLevel === "SEMANTIC_HYPOTHESIS") {
      missingOperativeAuthority += 1;
    }
    if (s.representationLevel === "SEMANTIC_HYPOTHESIS") unverifiedSemanticHypotheses += 1;

    const nodes = store.loadStructuralNodes(s.sourceId);
    ambiguousNodes += nodes.filter((n) => n.ambiguous).length;
    const defs = store.loadDefinitions(s.sourceId);
    totalDefinitions += defs.length;
    for (const d of defs) terms.add(d.term.toLowerCase());
    for (const c of store.loadCandidates(s.sourceId)) {
      for (const f of c.families) familyCounts[f] = (familyCounts[f] ?? 0) + 1;
      if (c.representationLevel === "SEMANTIC_HYPOTHESIS") unverifiedSemanticHypotheses += 1;
    }
  }

  const covered = new Set(Object.keys(familyCounts));
  const uncoveredTaxonomyFamilies = TAXONOMY_FAMILIES.map((f) => f.family).filter((f) => !covered.has(f));

  const rels = store.loadRelationships();
  const amendments = sources.filter((s) => s.documentClass === "AMENDMENT" || s.documentClass === "RESTATEMENT");
  const linked = amendments.filter((a) =>
    rels.some((r) => r.sourceId === a.sourceId && (r.kind === "AGREEMENT_AMENDMENT" || r.kind === "AGREEMENT_RESTATEMENT")),
  );

  const exact = findExactByteDuplicates(sources);
  const norm = findExactNormalizedDuplicates(sources);

  return {
    generatedAt: new Date().toISOString(),
    sourceCoverage: {
      issuers: issuers.size,
      documents: sources.length,
      byFormType,
      byDocumentClass,
    },
    covenantFamilyCoverage: familyCounts,
    uncoveredTaxonomyFamilies,
    definitionDiversity: { uniqueTerms: terms.size, totalDefinitions },
    amendmentChainCompleteness: {
      amendments: amendments.length,
      linkedAmendments: linked.length,
      unlinkedAmendments: amendments.length - linked.length,
    },
    parsingSuccess: {
      structurallyIndexed,
      failed,
      unsupported,
      ambiguousNodes,
    },
    missingOperativeAuthority,
    duplicateContamination: {
      exactBytePairs: exact.length,
      normalizedPairs: norm.length,
    },
    unverifiedSemanticHypotheses,
    notes: [
      "Discovery labels and taxonomy coverage are not operative legal authority.",
      "Unlinked amendments are expected when title/metadata evidence is insufficient — chronology alone is not used.",
      "Measure legal coverage via family/definition/amendment completeness, not document count alone.",
    ],
  };
}
