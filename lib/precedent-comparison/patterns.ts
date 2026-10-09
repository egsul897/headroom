/**
 * Corpus-frequency drafting-pattern statistics.
 *
 * Never describes a pattern as market-common. Reports sample size, issuer
 * diversity, and sampling bias. Distinguishes corpus frequency from market
 * prevalence (always NOT_ESTIMATED here).
 */
import type { CovenantFamily } from "@prisma/client";
import { isHeldOutEval, type PrecedentCorpus } from "./corpus";
import { profileProvision } from "./features";
import type { ComparableCovenantFamily, DraftingFeature, PatternFrequency } from "./types";

const MIN_ISSUERS_FOR_COMMON_LABEL = 5;
const MIN_SAMPLE_FOR_COMMON_LABEL = 20;

function rarityInCorpus(
  rate: number,
  count: number,
  sampleSize: number,
  distinctIssuers: number,
): PatternFrequency["rarityInCorpus"] {
  // Refuse "COMMON_IN_CORPUS" on tiny / single-issuer slices.
  if (count <= 1) return "UNIQUE_IN_CORPUS";
  if (sampleSize < MIN_SAMPLE_FOR_COMMON_LABEL || distinctIssuers < MIN_ISSUERS_FOR_COMMON_LABEL) {
    if (rate < 0.25) return "RARE_IN_CORPUS";
    return "UNCOMMON_IN_CORPUS";
  }
  if (rate < 0.25) return "RARE_IN_CORPUS";
  if (rate < 0.55) return "UNCOMMON_IN_CORPUS";
  return "COMMON_IN_CORPUS";
}

function legacyRarity(r: PatternFrequency["rarityInCorpus"]): PatternFrequency["rarity"] {
  switch (r) {
    case "COMMON_IN_CORPUS":
      return "COMMON";
    case "UNCOMMON_IN_CORPUS":
      return "UNCOMMON";
    case "RARE_IN_CORPUS":
      return "RARE";
    case "UNIQUE_IN_CORPUS":
      return "UNIQUE";
  }
}

export function identifyDraftingPatterns(
  corpus: PrecedentCorpus,
  family?: CovenantFamily | ComparableCovenantFamily,
): PatternFrequency[] {
  // Never let CKG held-out packages drive "common in corpus" labels.
  const base = (family ? corpus.byFamily(family) : corpus.list()).filter((p) => !isHeldOutEval(p));
  const provisions = base;
  const total = provisions.length;
  if (total === 0) return [];
  const distinctIssuers = new Set(provisions.map((p) => p.issuerId)).size;
  const bias = [
    ...corpus.statistics().samplingBiasNotes,
    "Pattern frequencies exclude HELD_OUT_CKG provisions (Superior / designated blind).",
  ];

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
    const corpusRate = count / total;
    const rarityLabel = rarityInCorpus(corpusRate, count, total, distinctIssuers);
    out.push({
      feature,
      covenantFamily: family ?? "*",
      count,
      totalInFamily: total,
      corpusRate,
      rate: corpusRate,
      rarityInCorpus: rarityLabel,
      rarity: legacyRarity(rarityLabel),
      exampleProvisionIds: examples,
      marketPrevalence: "NOT_ESTIMATED",
      sampleSize: total,
      distinctIssuersInSlice: distinctIssuers,
      samplingBiasNotes: bias,
    });
  }
  return out.sort((a, b) => b.corpusRate - a.corpusRate || a.feature.localeCompare(b.feature));
}

export function commonPatterns(corpus: PrecedentCorpus, family?: CovenantFamily | ComparableCovenantFamily): PatternFrequency[] {
  return identifyDraftingPatterns(corpus, family).filter((p) => p.rarityInCorpus === "COMMON_IN_CORPUS");
}

export function uncommonPatterns(corpus: PrecedentCorpus, family?: CovenantFamily | ComparableCovenantFamily): PatternFrequency[] {
  return identifyDraftingPatterns(corpus, family).filter((p) => p.rarityInCorpus !== "COMMON_IN_CORPUS");
}
