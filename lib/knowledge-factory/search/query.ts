/**
 * Knowledge retrieval over the file-backed corpus (Postgres FTS optional later).
 * Returns source-backed examples, not generalized legal conclusions.
 */

import type {
  CovenantCandidateRecord,
  DefinitionRecord,
  KnowledgeRelationshipRecord,
  KnowledgeSourceRecord,
  KnowledgeTaxonomyFamily,
  DebtDocumentClass,
} from "../types";
import type { CorpusStore } from "../store/corpus-store";
import { allPatterns, detectPatternsInText } from "../patterns/library";

export interface SearchQuery {
  issuerCik?: string;
  issuerTicker?: string;
  agreementClass?: DebtDocumentClass;
  covenantFamily?: KnowledgeTaxonomyFamily;
  definedTerm?: string;
  provisionText?: string;
  draftingPatternId?: string;
  legalCondition?: string;
  amendmentRelationship?: boolean;
  verificationStatus?: KnowledgeSourceRecord["representationLevel"];
  limit?: number;
}

export interface SearchHit {
  sourceId: string;
  title: string;
  documentClass: DebtDocumentClass;
  filingDate: string;
  sourceUrl: string;
  representationLevel: KnowledgeSourceRecord["representationLevel"];
  excerpt?: string;
  families?: KnowledgeTaxonomyFamily[];
  score: number;
  note: string;
}

export function searchKnowledge(store: CorpusStore, query: SearchQuery): SearchHit[] {
  const sources = store.listSources();
  const rels = store.loadRelationships();
  const limit = query.limit ?? 25;
  const hits: SearchHit[] = [];

  for (const s of sources) {
    if (query.issuerCik && s.issuerCik !== query.issuerCik.padStart(10, "0")) continue;
    if (query.issuerTicker && (s.issuerTicker ?? "").toUpperCase() !== query.issuerTicker.toUpperCase()) continue;
    if (query.agreementClass && s.documentClass !== query.agreementClass) continue;
    if (query.verificationStatus && s.representationLevel !== query.verificationStatus) continue;

    const candidates = store.loadCandidates(s.sourceId);
    const defs = store.loadDefinitions(s.sourceId);
    let score = 0;
    let excerpt: string | undefined;
    let families: KnowledgeTaxonomyFamily[] | undefined;

    if (query.covenantFamily) {
      const match = candidates.filter((c) => c.families.includes(query.covenantFamily!));
      if (match.length === 0) continue;
      score += 5 + match[0]!.discoveryScore;
      excerpt = match[0]!.excerpt;
      families = match[0]!.families;
    }

    if (query.definedTerm) {
      const term = query.definedTerm.toLowerCase();
      const d = defs.find((x) => x.term.toLowerCase() === term || x.term.toLowerCase().includes(term));
      if (!d) continue;
      score += 4;
      excerpt = d.excerpt;
    }

    if (query.provisionText) {
      const needle = query.provisionText.toLowerCase();
      const c = candidates.find((x) => x.excerpt.toLowerCase().includes(needle));
      if (!c && !s.documentTitle.toLowerCase().includes(needle)) continue;
      score += c ? 6 : 2;
      excerpt = c?.excerpt ?? s.documentTitle;
      families = c?.families;
    }

    if (query.draftingPatternId) {
      const c = candidates.find((x) => x.signals.includes(`pattern:${query.draftingPatternId}`));
      if (!c) continue;
      score += 5;
      excerpt = c.excerpt;
      families = c.families;
    }

    if (query.legalCondition) {
      const needle = query.legalCondition.toLowerCase();
      const c = candidates.find((x) => x.excerpt.toLowerCase().includes(needle));
      if (!c) continue;
      score += 4;
      excerpt = c.excerpt;
      families = c.families;
    }

    if (query.amendmentRelationship) {
      const has = rels.some(
        (r) =>
          (r.sourceId === s.sourceId || r.targetId === s.sourceId) &&
          (r.kind === "AGREEMENT_AMENDMENT" || r.kind === "AGREEMENT_RESTATEMENT" || r.kind === "INDENTURE_SUPPLEMENTAL"),
      );
      if (!has) continue;
      score += 3;
    }

    if (score === 0 && !query.covenantFamily && !query.definedTerm && !query.provisionText && !query.draftingPatternId && !query.legalCondition && !query.amendmentRelationship) {
      score = 1;
    }
    if (score === 0) continue;

    hits.push({
      sourceId: s.sourceId,
      title: s.documentTitle,
      documentClass: s.documentClass,
      filingDate: s.filingDate,
      sourceUrl: s.sourceUrl,
      representationLevel: s.representationLevel,
      excerpt,
      families,
      score,
      note: "Source-backed example only — not a generalized legal conclusion.",
    });
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Named cross-document example queries from the mandate. */
export function runExampleQueries(store: CorpusStore): Record<string, SearchHit[]> {
  return {
    leverage_based_rp_baskets: searchKnowledge(store, {
      covenantFamily: "RESTRICTED_PAYMENTS",
      legalCondition: "Leverage",
      limit: 10,
    }),
    shared_baskets_investments_junior_debt: searchKnowledge(store, {
      draftingPatternId: "shared-capacity",
      limit: 10,
    }),
    ebitda_acquisition_addbacks: searchKnowledge(store, {
      definedTerm: "EBITDA",
      provisionText: "acquisition",
      limit: 10,
    }),
    amendments_narrowing_available_amount: searchKnowledge(store, {
      agreementClass: "AMENDMENT",
      provisionText: "Available Amount",
      amendmentRelationship: true,
      limit: 10,
    }),
    debt_baskets_no_default: searchKnowledge(store, {
      covenantFamily: "INDEBTEDNESS",
      legalCondition: "no Default",
      limit: 10,
    }),
    non_guarantor_sub_debt: searchKnowledge(store, {
      covenantFamily: "INDEBTEDNESS",
      provisionText: "non-Guarantor",
      limit: 10,
    }),
    unusual_reclassification: searchKnowledge(store, {
      draftingPatternId: "reclassification",
      limit: 10,
    }),
  };
}

export function traverseKnowledgeGraph(
  store: CorpusStore,
  startCandidateId: string,
): {
  candidate?: CovenantCandidateRecord;
  source?: KnowledgeSourceRecord;
  definitions: DefinitionRecord[];
  relationships: KnowledgeRelationshipRecord[];
  missingEdges: string[];
  verificationStatus?: KnowledgeSourceRecord["representationLevel"];
} {
  const sources = store.listSources();
  let candidate: CovenantCandidateRecord | undefined;
  let source: KnowledgeSourceRecord | undefined;
  for (const s of sources) {
    const c = store.loadCandidates(s.sourceId).find((x) => x.candidateId === startCandidateId);
    if (c) {
      candidate = c;
      source = s;
      break;
    }
  }
  const missingEdges: string[] = [];
  if (!candidate) missingEdges.push("candidate");
  if (!source) missingEdges.push("source");
  const definitions = source ? store.loadDefinitions(source.sourceId).filter((d) => candidate?.excerpt.includes(d.term)) : [];
  if (candidate && definitions.length === 0) missingEdges.push("definition_link");
  const relationships = source ? store.loadRelationships().filter((r) => r.sourceId === source!.sourceId || r.targetId === source!.sourceId) : [];
  if (source && relationships.length === 0) missingEdges.push("amendment_link");
  return {
    candidate,
    source,
    definitions,
    relationships,
    missingEdges,
    verificationStatus: source?.representationLevel,
  };
}

export function patternCatalog() {
  return allPatterns();
}

export function attachPatternsToCandidate(c: CovenantCandidateRecord): string[] {
  return detectPatternsInText(c.excerpt);
}
