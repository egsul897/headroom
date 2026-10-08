/**
 * Retrieve counterexamples to proposed interpretations.
 *
 * A counterexample is a real source provision that contradicts a claimed
 * necessary/absent drafting feature within the same covenant family.
 * Standing is at most SOURCE_SUPPORTED_LEGAL_DIFFERENCE unless the provision
 * itself is APPROVED_PRECEDENT (still reported as source-supported difference
 * against the *proposal*, which is never treated as reviewed precedent).
 */
import type { PrecedentCorpus } from "./corpus";
import { profileProvision } from "./features";
import type { CounterexampleHit, CounterexampleQuery } from "./types";

export function retrieveCounterexamples(corpus: PrecedentCorpus, query: CounterexampleQuery): CounterexampleHit[] {
  const limit = query.limit ?? 20;
  const necessary = query.claimedNecessaryFeatures ?? [];
  const absent = query.claimedAbsentFeatures ?? [];
  const needle = query.proposedInterpretation?.toLowerCase().trim() ?? null;
  const hits: CounterexampleHit[] = [];

  for (const provision of corpus.list()) {
    if (query.covenantFamily && provision.covenantFamily !== query.covenantFamily) continue;
    const features = profileProvision(provision);
    const set = new Set(features.features);

    const missingNecessary = necessary.filter((f) => !set.has(f));
    const presentClaimedAbsent = absent.filter((f) => set.has(f));

    // Text-only proposals without feature claims: find same-family provisions
    // that do not contain distinctive proposal words — weak structural contrast.
    let textContrast = false;
    if (needle && necessary.length === 0 && absent.length === 0) {
      const tokens = needle.split(/\s+/).filter((t) => t.length > 5).slice(0, 6);
      const hay = provision.sourceText.toLowerCase();
      const hitsCount = tokens.filter((t) => hay.includes(t)).length;
      textContrast = tokens.length > 0 && hitsCount <= Math.floor(tokens.length / 3);
    }

    if (missingNecessary.length === 0 && presentClaimedAbsent.length === 0 && !textContrast) continue;

    let why: string;
    if (missingNecessary.length > 0) {
      why = `Proposed interpretation claims necessary feature(s) [${missingNecessary.join(", ")}] that this source provision does not draft.`;
    } else if (presentClaimedAbsent.length > 0) {
      why = `Proposed interpretation claims feature(s) [${presentClaimedAbsent.join(", ")}] are absent, but this source provision contains them.`;
    } else {
      why = "Source provision in the same family shares little distinctive vocabulary with the proposed interpretation text — contrast only; not a legal conclusion.";
    }

    hits.push({
      provision,
      features,
      whyCounterexample: why,
      standing: missingNecessary.length || presentClaimedAbsent.length ? "SOURCE_SUPPORTED_LEGAL_DIFFERENCE" : "STRUCTURAL_SIMILARITY",
    });
  }

  return hits
    .sort((a, b) => {
      const rank = (s: CounterexampleHit["standing"]) => (s === "SOURCE_SUPPORTED_LEGAL_DIFFERENCE" ? 1 : 0);
      return rank(b.standing) - rank(a.standing) || a.provision.provisionId.localeCompare(b.provision.provisionId);
    })
    .slice(0, limit);
}
