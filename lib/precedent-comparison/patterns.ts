/**
 * Common / uncommon drafting-pattern frequency over a corpus slice.
 */
import type { CovenantFamily } from "@prisma/client";
import type { PrecedentCorpus } from "./corpus";
import { profileProvision } from "./features";
import type { ComparableCovenantFamily, DraftingFeature, PatternFrequency } from "./types";

function rarityOf(rate: number, count: number): PatternFrequency["rarity"] {
  if (count <= 1) return "UNIQUE";
  if (rate < 0.25) return "RARE";
  if (rate < 0.55) return "UNCOMMON";
  return "COMMON";
}

export function identifyDraftingPatterns(
  corpus: PrecedentCorpus,
  family?: CovenantFamily | ComparableCovenantFamily,
): PatternFrequency[] {
  const provisions = family ? corpus.byFamily(family) : corpus.list();
  const total = provisions.length;
  if (total === 0) return [];

  const counts = new Map<DraftingFeature, { count: number; examples: string[] }>();
  for (const p of provisions) {
    const profile = profileProvision(p);
    for (const f of profile.features) {
      const entry = counts.get(f) ?? { count: 0, examples: [] };
      entry.count += 1;
      if (entry.examples.length < 5) entry.examples.push(p.provisionId);
      counts.set(f, entry);
    }
  }

  const out: PatternFrequency[] = [];
  for (const [feature, { count, examples }] of counts) {
    const rate = count / total;
    out.push({
      feature,
      covenantFamily: family ?? "*",
      count,
      totalInFamily: total,
      rate,
      rarity: rarityOf(rate, count),
      exampleProvisionIds: examples,
    });
  }
  return out.sort((a, b) => b.rate - a.rate || a.feature.localeCompare(b.feature));
}

export function commonPatterns(corpus: PrecedentCorpus, family?: CovenantFamily | ComparableCovenantFamily): PatternFrequency[] {
  return identifyDraftingPatterns(corpus, family).filter((p) => p.rarity === "COMMON");
}

export function uncommonPatterns(corpus: PrecedentCorpus, family?: CovenantFamily | ComparableCovenantFamily): PatternFrequency[] {
  return identifyDraftingPatterns(corpus, family).filter((p) => p.rarity === "UNCOMMON" || p.rarity === "RARE" || p.rarity === "UNIQUE");
}
