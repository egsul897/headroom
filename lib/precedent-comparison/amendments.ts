/**
 * Compare provisions across original agreements and amendments.
 */
import { compareProvisions } from "./compare";
import type { PrecedentCorpus } from "./corpus";
import { dependencyAwareView } from "./dependency-view";
import type { DependencyAwareComparisonView, PrecedentComparisonRecord, PrecedentProvision } from "./types";

export interface AmendmentComparisonResult {
  original: PrecedentProvision;
  amendment: PrecedentProvision;
  comparison: PrecedentComparisonRecord;
  dependencyView: DependencyAwareComparisonView;
  amendmentClaims: PrecedentComparisonRecord["claims"];
}

export function listAmendmentPairs(corpus: PrecedentCorpus): Array<{ original: PrecedentProvision; amendment: PrecedentProvision }> {
  const pairs: Array<{ original: PrecedentProvision; amendment: PrecedentProvision }> = [];
  for (const amendment of corpus.list().filter((p) => p.documentRole === "AMENDMENT" && p.amendsProvisionId)) {
    const original = corpus.get(amendment.amendsProvisionId!);
    if (original) pairs.push({ original, amendment });
  }
  return pairs;
}

export function compareOriginalAndAmendment(
  corpus: PrecedentCorpus,
  amendmentProvisionId: string,
): AmendmentComparisonResult {
  const amendment = corpus.get(amendmentProvisionId);
  if (!amendment) throw new Error(`compareOriginalAndAmendment: unknown provision ${amendmentProvisionId}`);
  if (amendment.documentRole !== "AMENDMENT" || !amendment.amendsProvisionId) {
    throw new Error(`compareOriginalAndAmendment: ${amendmentProvisionId} is not an AMENDMENT with amendsProvisionId`);
  }
  const original = corpus.get(amendment.amendsProvisionId);
  if (!original) throw new Error(`compareOriginalAndAmendment: missing original ${amendment.amendsProvisionId}`);

  const comparison = compareProvisions(original, amendment);
  // Tag amendment-dimension claims explicitly when roles differ
  const amendmentClaims = [
    ...comparison.claims,
    {
      claimId: `claim_amend_${comparison.comparisonId}`,
      standing: "SOURCE_SUPPORTED_LEGAL_DIFFERENCE" as const,
      dimension: "AMENDMENT" as const,
      summary: `Right-side provision ${amendment.provisionId} is an AMENDMENT targeting ${original.provisionId} (${original.locator.sourceSectionRef}).`,
      sourceEvidence: [
        { provisionId: original.provisionId, excerpt: original.sourceText.slice(0, 160) },
        { provisionId: amendment.provisionId, excerpt: amendment.sourceText.slice(0, 160) },
      ],
      featuresOnlyIn: null,
    },
  ];
  const enriched: PrecedentComparisonRecord = { ...comparison, claims: amendmentClaims };
  return {
    original,
    amendment,
    comparison: enriched,
    dependencyView: dependencyAwareView(corpus, enriched),
    amendmentClaims,
  };
}
