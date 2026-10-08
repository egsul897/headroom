/**
 * Source-backed retrieval across the precedent corpus.
 */
import { isHeldOutEval, type PrecedentCorpus } from "./corpus";
import { profileProvision } from "./features";
import type { ComparisonStanding, RetrievalHit, RetrievalQuery } from "./types";

function standingCeiling(reviewStatus: string): ComparisonStanding {
  // Retrieval hits are not claims. Provision-level APPROVED_PRECEDENT never
  // elevates to REVIEWER_VERIFIED_CONCLUSION (claim-bound review required).
  // SOURCE_ONLY caps suggestion at SEMANTIC_HYPOTHESIS until a claim is built
  // with source excerpts via makeClaim.
  if (reviewStatus === "APPROVED_PRECEDENT") return "SOURCE_SUPPORTED_LEGAL_DIFFERENCE";
  return "SEMANTIC_HYPOTHESIS";
}

export function retrieveComparableProvisions(corpus: PrecedentCorpus, query: RetrievalQuery): RetrievalHit[] {
  const limit = query.limit ?? 25;
  const required = new Set(query.requiredFeatures ?? []);
  const any = query.anyFeatures ?? [];
  const exclude = new Set(query.excludeProvisionIds ?? []);
  const textNeedle = query.textContains?.toLowerCase().trim() ?? null;
  const finTerms = (query.financialDefinitionTerms ?? []).map((t) => t.toLowerCase());

  const hits: RetrievalHit[] = [];
  const includeHeldOut = query.includeHeldOutEval === true;

  for (const provision of corpus.list()) {
    if (exclude.has(provision.provisionId)) continue;
    if (!includeHeldOut && isHeldOutEval(provision)) continue;
    if (query.covenantFamily && provision.covenantFamily !== query.covenantFamily) continue;
    if (query.documentRole && provision.documentRole !== query.documentRole) continue;
    if (query.agreementType && provision.agreementType !== query.agreementType) continue;
    if (query.reviewStatus && provision.reviewStatus !== query.reviewStatus) continue;
    if (query.packageIds && !query.packageIds.includes(provision.locator.packageId)) continue;
    if (query.issuerIds && !query.issuerIds.includes(provision.issuerId)) continue;
    if (query.amendmentStatus === "ORIGINAL_ONLY" && provision.documentRole === "AMENDMENT") continue;
    if (query.amendmentStatus === "AMENDMENT_ONLY" && provision.documentRole !== "AMENDMENT") continue;
    if (finTerms.length > 0) {
      const terms = provision.financialDefinitionTerms.map((t) => t.toLowerCase());
      const hay = `${provision.sourceText}\n${terms.join("\n")}`.toLowerCase();
      if (!finTerms.every((t) => hay.includes(t) || terms.some((x) => x.includes(t)))) continue;
    }
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
    if (finTerms.length) score += 1;
    if (featureSet.has("SHARED_CAPACITY")) score += 0.5;
    if (featureSet.has("RECLASSIFICATION_RIGHT")) score += 0.5;

    hits.push({
      provision,
      features,
      score,
      matchedFeatures: matchedAny,
      provenanceStatus: provision.reviewStatus,
      standingCeiling: standingCeiling(provision.reviewStatus),
    });
  }

  return hits.sort((a, b) => b.score - a.score || a.provision.provisionId.localeCompare(b.provision.provisionId)).slice(0, limit);
}

export function searchExamples(corpus: PrecedentCorpus, query: RetrievalQuery): RetrievalHit[] {
  return retrieveComparableProvisions(corpus, query);
}
