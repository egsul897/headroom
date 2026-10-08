/**
 * Balanced novelty evaluation — corrects corpus/probe imbalance.
 *
 * Probe-only signatures under imbalanced pools are NOT market rarity.
 * Metrics here use equal-sized samples, reproducible RNG splits, and leave-one-out.
 */
import { issuerIdForPackage } from "./issuers";
import { clusterBySignature } from "./cluster";
import { scoreNovelty } from "./score";
import type { DraftingUnit } from "./types";
import type { BalancedNoveltyReport, BalancedSplitMetrics, LeaveOneOutResult } from "./phase2-types";
import { DRAFTING_NOVELTY_PHASE2_VERSION } from "./phase2-types";

/** Mulberry32 — deterministic PRNG from a 32-bit seed. */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleInPlace<T>(arr: T[], rand: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
}

function signatureRates(units: DraftingUnit[]): { probeOnly: number; shared: number } {
  const corpusKeys = new Set(units.filter((u) => u.role === "CORPUS").map((u) => u.signature.key));
  const probeKeys = new Set(units.filter((u) => u.role === "PROBE").map((u) => u.signature.key));
  let shared = 0;
  let probeOnly = 0;
  for (const k of probeKeys) {
    if (corpusKeys.has(k)) shared++;
    else probeOnly++;
  }
  const total = probeKeys.size || 1;
  return { probeOnly: probeOnly / total, shared: shared / total };
}

function sampleBalanced(
  units: DraftingUnit[],
  sampleSize: number,
  seed: number,
): { corpus: DraftingUnit[]; probe: DraftingUnit[] } {
  const rand = mulberry32(seed);
  // Issuer-level then document-level: sample units stratified by issuer within each role.
  const byRoleIssuer = (role: "CORPUS" | "PROBE") => {
    const map = new Map<string, DraftingUnit[]>();
    for (const u of units.filter((x) => x.role === role)) {
      const iss = issuerIdForPackage(u.packageId);
      const list = map.get(iss) ?? [];
      list.push(u);
      map.set(iss, list);
    }
    for (const list of map.values()) shuffleInPlace(list, rand);
    return map;
  };

  const pick = (role: "CORPUS" | "PROBE"): DraftingUnit[] => {
    const map = byRoleIssuer(role);
    const issuers = [...map.keys()].sort();
    shuffleInPlace(issuers, rand);
    const out: DraftingUnit[] = [];
    // Round-robin across issuers for document-level balance.
    let guard = 0;
    while (out.length < sampleSize && guard < sampleSize * 20) {
      guard++;
      let progressed = false;
      for (const iss of issuers) {
        const list = map.get(iss);
        if (!list || list.length === 0) continue;
        out.push(list.shift()!);
        progressed = true;
        if (out.length >= sampleSize) break;
      }
      if (!progressed) break;
    }
    return out;
  };

  return { corpus: pick("CORPUS"), probe: pick("PROBE") };
}

function metricsForSplit(splitId: string, seed: number, sampleSize: number, units: DraftingUnit[]): BalancedSplitMetrics {
  const { corpus, probe } = sampleBalanced(units, sampleSize, seed);
  const combined = [...corpus, ...probe].map((u) =>
    corpus.some((c) => c.unitId === u.unitId)
      ? { ...u, role: "CORPUS" as const }
      : { ...u, role: "PROBE" as const },
  );
  // Re-tag: corpus sample stays CORPUS, probe sample stays PROBE.
  const retagged = [
    ...corpus.map((u) => ({ ...u, role: "CORPUS" as const })),
    ...probe.map((u) => ({ ...u, role: "PROBE" as const })),
  ];
  void combined;
  const rates = signatureRates(retagged);
  const findings = scoreNovelty(retagged);
  const topScores = findings.slice(0, 20).map((f) => f.noveltyScore);
  const highRisk = findings.filter((f) =>
    ["FALSE_PERMISSION", "CAPACITY_OVERSTATEMENT", "MISSING_RESTRICTION", "CROSS_INSTRUMENT_SILENCE", "PRIORITY_MISORDER"].includes(
      f.suspectedFailureMode,
    ),
  ).length;

  return {
    splitId,
    seed,
    sampleSizePerRole: sampleSize,
    corpusUnits: corpus.length,
    probeUnits: probe.length,
    corpusIssuers: new Set(corpus.map((u) => issuerIdForPackage(u.packageId))).size,
    probeIssuers: new Set(probe.map((u) => issuerIdForPackage(u.packageId))).size,
    probeOnlySignatureRate: Number(rates.probeOnly.toFixed(4)),
    sharedSignatureRate: Number(rates.shared.toFixed(4)),
    meanTopNoveltyScore: Number(mean(topScores).toFixed(4)),
    medianTopNoveltyScore: Number(median(topScores).toFixed(4)),
    highRiskFindingCount: highRisk,
  };
}

function leaveOneOut(
  units: DraftingUnit[],
  heldOutKind: "ISSUER" | "INSTRUMENT",
  heldOutId: string,
): LeaveOneOutResult {
  const isHeld = (u: DraftingUnit) =>
    heldOutKind === "ISSUER"
      ? issuerIdForPackage(u.packageId) === heldOutId
      : `${u.packageId}::${u.documentId}` === heldOutId;

  const corpus = units.filter((u) => !isHeld(u)).map((u) => ({ ...u, role: "CORPUS" as const }));
  const probe = units.filter((u) => isHeld(u)).map((u) => ({ ...u, role: "PROBE" as const }));
  const combined = [...corpus, ...probe];
  const rates = signatureRates(combined);
  const findings = scoreNovelty(combined);
  const byCat = new Map<string, number>();
  for (const f of findings) byCat.set(f.category, (byCat.get(f.category) ?? 0) + 1);
  const topCategories = [...byCat.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([category, count]) => ({ category: category as LeaveOneOutResult["topCategories"][number]["category"], count }));

  return {
    heldOutId,
    heldOutKind,
    probeUnits: probe.length,
    findings: findings.length,
    meanNoveltyScore: Number(mean(findings.map((f) => f.noveltyScore)).toFixed(4)),
    probeOnlySignatureRate: Number(rates.probeOnly.toFixed(4)),
    topCategories,
  };
}

export function runBalancedNoveltyEvaluation(units: DraftingUnit[], options?: { seeds?: number[]; sampleSizes?: number[] }): BalancedNoveltyReport {
  const seeds = options?.seeds ?? [1, 2, 3, 5, 8, 13, 21, 34];
  const corpusCount = units.filter((u) => u.role === "CORPUS").length;
  const probeCount = units.filter((u) => u.role === "PROBE").length;
  const maxEqual = Math.min(corpusCount, probeCount);
  const primarySize = Math.max(20, Math.min(200, maxEqual));

  const equalSizedSplits = seeds.map((seed, i) =>
    metricsForSplit(`equal-${i + 1}-n${primarySize}-s${seed}`, seed, primarySize, units),
  );

  const sampleSizes = (options?.sampleSizes ?? [40, 80, 120, 160, primarySize])
    .filter((n) => n <= maxEqual && n >= 20)
    .filter((n, i, a) => a.indexOf(n) === i)
    .sort((a, b) => a - b);

  const sampleSizeSensitivity = sampleSizes.map((n) => {
    const splits = seeds.slice(0, 5).map((seed, i) => metricsForSplit(`sens-${n}-${i}`, seed + n, n, units));
    return {
      sampleSize: n,
      probeOnlyRateMean: Number(mean(splits.map((s) => s.probeOnlySignatureRate)).toFixed(4)),
      meanTopScoreMean: Number(mean(splits.map((s) => s.meanTopNoveltyScore)).toFixed(4)),
    };
  });

  const issuers = [...new Set(units.map((u) => issuerIdForPackage(u.packageId)))].sort();
  const leaveOneIssuerOut = issuers.map((id) => leaveOneOut(units, "ISSUER", id));

  const instruments = [...new Set(units.map((u) => `${u.packageId}::${u.documentId}`))].sort();
  // Cap instrument LOO for runtime — prefer one instrument per package.
  const onePerPackage = new Map<string, string>();
  for (const inst of instruments) {
    const pkg = inst.split("::")[0]!;
    if (!onePerPackage.has(pkg)) onePerPackage.set(pkg, inst);
  }
  const leaveOneInstrumentOut = [...onePerPackage.values()].map((id) => leaveOneOut(units, "INSTRUMENT", id));

  void clusterBySignature; // retained import for future cluster-level balance metrics

  return {
    version: DRAFTING_NOVELTY_PHASE2_VERSION,
    generatedAt: new Date().toISOString(),
    disclaimer:
      "Probe-only signature rates from imbalanced pools are not evidence of market rarity. Prefer equal-sized split metrics and leave-one-out rates below.",
    equalSizedSplits,
    equalSizedStability: {
      splitCount: equalSizedSplits.length,
      probeOnlyRateMean: Number(mean(equalSizedSplits.map((s) => s.probeOnlySignatureRate)).toFixed(4)),
      probeOnlyRateStd: Number(std(equalSizedSplits.map((s) => s.probeOnlySignatureRate)).toFixed(4)),
      meanTopScoreMean: Number(mean(equalSizedSplits.map((s) => s.meanTopNoveltyScore)).toFixed(4)),
      meanTopScoreStd: Number(std(equalSizedSplits.map((s) => s.meanTopNoveltyScore)).toFixed(4)),
      sampleSizeSensitivity,
    },
    leaveOneIssuerOut,
    leaveOneInstrumentOut,
  };
}
