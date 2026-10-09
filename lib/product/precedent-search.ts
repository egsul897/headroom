/**
 * Product-facing search over the compact precedent retrieval index.
 * Loads docs/knowledge-factory/mass-precedent/retrieval-index.json when present.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { PrecedentRetrievalIndex } from "../knowledge-factory/mass-precedent/retrieval-index";

export interface PrecedentSearchResult {
  sourceId: string;
  title: string;
  documentClass: string;
  issuer: string;
  filingDate: string;
  score: number;
  families: string[];
  definitionHits: string[];
  representationLevel: string;
  note: string;
}

function loadIndex(repoRoot = process.cwd()): PrecedentRetrievalIndex | null {
  const p = path.join(repoRoot, "docs/knowledge-factory/mass-precedent/retrieval-index.json");
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as PrecedentRetrievalIndex;
}

export function getPrecedentIndexSummary(repoRoot = process.cwd()) {
  const index = loadIndex(repoRoot);
  if (!index) {
    return {
      available: false as const,
      totals: null,
      note: "Run npm run kf:mass-precedent-analyze -- --all to build the retrieval index.",
    };
  }
  return {
    available: true as const,
    totals: index.totals,
    familyHistogram: index.familyHistogram,
    documentClassHistogram: index.documentClassHistogram,
    note: index.note,
  };
}

export function searchPrecedents(params: {
  q?: string;
  family?: string;
  documentClass?: string;
  excludeIssuerCik?: string;
  limit?: number;
  repoRoot?: string;
}): PrecedentSearchResult[] {
  const index = loadIndex(params.repoRoot);
  if (!index) return [];
  const q = (params.q ?? "").trim().toLowerCase();
  const family = (params.family ?? "").trim().toUpperCase();
  const docClass = (params.documentClass ?? "").trim().toUpperCase();
  const exclude = (params.excludeIssuerCik ?? "").padStart(10, "0");
  const limit = params.limit ?? 25;
  const out: PrecedentSearchResult[] = [];

  for (const e of index.entries) {
    if (exclude !== "0000000000" && e.issuerCik.padStart(10, "0") === exclude) continue;
    if (docClass && e.documentClass !== docClass) continue;
    if (family && !e.covenantFamilies.includes(family)) continue;

    let score = 0;
    const definitionHits: string[] = [];
    if (q) {
      if (e.documentTitle.toLowerCase().includes(q)) score += 3;
      if ((e.issuerName ?? "").toLowerCase().includes(q)) score += 2;
      if ((e.issuerTicker ?? "").toLowerCase().includes(q)) score += 2;
      if (e.sourceId.toLowerCase().includes(q)) score += 1;
      for (const t of e.definitionTerms) {
        if (t.toLowerCase().includes(q)) {
          score += 4;
          definitionHits.push(t);
        }
      }
      for (const f of e.covenantFamilies) {
        if (f.toLowerCase().includes(q)) score += 3;
      }
      if (score === 0) continue;
    } else {
      score = 1 + (e.covenantCandidateCount > 0 ? 1 : 0);
    }

    out.push({
      sourceId: e.sourceId,
      title: e.documentTitle,
      documentClass: e.documentClass,
      issuer: e.issuerName ?? e.issuerTicker ?? e.issuerCik,
      filingDate: e.filingDate,
      score,
      families: e.covenantFamilies,
      definitionHits: definitionHits.slice(0, 8),
      representationLevel: e.representationLevel,
      note: "Precedent hit — not operative authority for any customer workspace.",
    });
  }

  return out.sort((a, b) => b.score - a.score || a.sourceId.localeCompare(b.sourceId)).slice(0, limit);
}
