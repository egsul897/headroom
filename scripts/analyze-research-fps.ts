/**
 * False-positive analysis for research retrieval (deterministic, $0).
 */
import { readFileSync } from "node:fs";
import {
  buildPhase2ResearchCorpus,
  evaluateHeldOutRetrieval,
  loadResearchCorpusFromFile,
  retrieveResearch,
} from "../lib/covenant-research";

const heldOut = JSON.parse(readFileSync("tests/fixtures/covenant-research/held-out-queries.json", "utf8")) as {
  queries: Array<{
    id: string;
    query: string;
    relevantEntryIds: string[];
    expectRefusal?: boolean;
    asOfDate?: string;
    operativeOnly?: boolean;
  }>;
};

function classifyFp(entry: {
  entryId: string;
  covenantFamily: string;
  sourceSectionRef: string | null;
  sourceDocumentId?: string | null;
  sourceExcerpt: string;
  verificationStatus: string;
  operativeVersion: { status: string };
}, relevantIds: Set<string>, queryText: string) {
  const reasons: string[] = [];
  if (!relevantIds.has(entry.entryId)) {
    if (/definition|ebitda|means,/i.test(entry.sourceExcerpt) && /basket|debt|payment/i.test(queryText)) {
      reasons.push("DEFINED_TERM_COLLISION_OR_DEF_LEAK");
    }
    if (entry.entryId.startsWith("discovery:") && relevantIds.size > 0) {
      reasons.push("WEAK_STRUCTURAL_RANKING_OR_TOPICAL_OVERLAP");
    }
    const relevantFamilies = queryText.toLowerCase();
    if (
      (relevantFamilies.includes("restricted payment") && entry.covenantFamily !== "RESTRICTED_PAYMENTS") ||
      (relevantFamilies.includes("investment") && entry.covenantFamily !== "INVESTMENTS") ||
      (relevantFamilies.includes("ebitda") && entry.covenantFamily !== "DEFINITIONS_CALCULATION_RULES") ||
      (relevantFamilies.includes("general debt") && entry.covenantFamily !== "INDEBTEDNESS")
    ) {
      reasons.push("WRONG_COVENANT_FAMILY");
    }
    if (entry.operativeVersion.status === "SUPERSEDED" || entry.operativeVersion.status === "UNKNOWN") {
      reasons.push("WRONG_OR_UNKNOWN_DOCUMENT_VERSION");
    }
    if ((entry.sourceExcerpt?.length ?? 0) < 80) {
      reasons.push("OVERLAPPING_OR_SHORT_EXTRACTION_WINDOW");
    }
    if (!reasons.length) reasons.push("QUERY_INTERPRETATION_OR_TOPICAL_NEAR_MISS");
  }
  return reasons;
}

async function main() {
  const curated = loadResearchCorpusFromFile();
  const phase2 = buildPhase2ResearchCorpus();
  const evalP2 = evaluateHeldOutRetrieval(phase2.entries);

  const fpBuckets: Record<string, number> = {};
  const perQuery: unknown[] = [];

  for (const q of heldOut.queries) {
    if (q.expectRefusal) continue;
    const response = retrieveResearch(
      { text: q.query, asOfDate: q.asOfDate, operativeOnly: q.operativeOnly },
      { corpus: phase2.entries, limit: 5 },
    );
    const relevant = new Set(q.relevantEntryIds);
    const fps = response.hits.filter((h) => !relevant.has(h.entry.entryId));
    const reasons = fps.flatMap((h) => classifyFp(h.entry, relevant, q.query));
    for (const r of reasons) fpBuckets[r] = (fpBuckets[r] ?? 0) + 1;
    perQuery.push({
      id: q.id,
      precisionAt5: response.hits.length
        ? response.hits.filter((h) => relevant.has(h.entry.entryId)).length / Math.min(5, response.hits.length)
        : 0,
      topIds: response.hits.map((h) => h.entry.entryId),
      fpReasons: reasons,
    });
  }

  console.log(
    JSON.stringify(
      {
        curatedBaseline: evaluateHeldOutRetrieval(curated),
        phase2Metrics: {
          recallAt5: evalP2.macroRecallAt5,
          recallAt10: evalP2.macroRecallAt10,
          precisionAt5: evalP2.macroPrecisionAt5,
        },
        fpBuckets,
        perQuery,
        corpus: {
          afterDedupe: phase2.afterDedupe,
          duplicatesRemoved: phase2.duplicatesRemoved,
        },
      },
      null,
      2,
    ),
  );
}

main();
