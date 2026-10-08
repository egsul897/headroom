/**
 * Retrieve comparable provisions by covenant family and drafting features.
 */
import type { PrecedentCorpus } from "./corpus";
import { profileProvision } from "./features";
import type { ComparisonStanding, RetrievalHit, RetrievalQuery } from "./types";

function standingCeiling(reviewStatus: string): ComparisonStanding {
  return reviewStatus === "APPROVED_PRECEDENT" ? "REVIEWER_VERIFIED_CONCLUSION" : "SOURCE_SUPPORTED_LEGAL_DIFFERENCE";
}

export function retrieveComparableProvisions(corpus: PrecedentCorpus, query: RetrievalQuery): RetrievalHit[] {
  const limit = query.limit ?? 25;
  const required = new Set(query.requiredFeatures ?? []);
  const any = query.anyFeatures ?? [];
  const exclude = new Set(query.excludeProvisionIds ?? []);
  const textNeedle = query.textContains?.toLowerCase().trim() ?? null;

  const hits: RetrievalHit[] = [];
  for (const provision of corpus.list()) {
    if (exclude.has(provision.provisionId)) continue;
    if (query.covenantFamily && provision.covenantFamily !== query.covenantFamily) continue;
    if (query.documentRole && provision.documentRole !== query.documentRole) continue;
    if (query.packageIds && !query.packageIds.includes(provision.locator.packageId)) continue;
    if (textNeedle) {
      const hay = `${provision.sourceText}\n${provision.locator.sourceSectionRef}\n${provision.tags.join(" ")}`.toLowerCase();
      if (!hay.includes(textNeedle)) continue;
    }

    const features = profileProvision(provision);
    const featureSet = new Set(features.features);
    if ([...required].some((f) => !featureSet.has(f))) continue;
    const matchedAny = any.length === 0 ? features.features : any.filter((f) => featureSet.has(f));
    if (any.length > 0 && matchedAny.length === 0) continue;

    let score = 0;
    if (query.covenantFamily && provision.covenantFamily === query.covenantFamily) score += 3;
    score += matchedAny.length;
    score += [...required].length * 2;
    if (textNeedle) score += 1;
    // Shared-capacity / reclass are high-value comparison features.
    if (featureSet.has("SHARED_CAPACITY")) score += 0.5;
    if (featureSet.has("RECLASSIFICATION_RIGHT")) score += 0.5;

    hits.push({
      provision,
      features,
      score,
      matchedFeatures: matchedAny,
      standingCeiling: standingCeiling(provision.reviewStatus),
    });
  }

  return hits.sort((a, b) => b.score - a.score || a.provision.provisionId.localeCompare(b.provision.provisionId)).slice(0, limit);
}

/** Searchable examples — free-text + family/feature filters over the corpus. */
export function searchExamples(corpus: PrecedentCorpus, query: RetrievalQuery): RetrievalHit[] {
  return retrieveComparableProvisions(corpus, query);
}
