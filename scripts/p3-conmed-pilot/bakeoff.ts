/**
 * §3/§4/§5 — cheap-model discovery, cost exclusion, and the deterministic probe set.
 *
 * Everything in this file is free: it reads the gateway catalogue and the sealed CONMED
 * population, and selects without consulting a single benchmark result.
 */
import fs from "node:fs";
import path from "node:path";
import { buildDeterministicStages, sealedPopulation, rehydrateNodeIds, operativeTextFor } from "./pipeline";
import { dedupExact } from "./dedup";
import { estimatedCostPerCandidate, isPremiumById, VIABILITY_CEILING_USD_PER_CANDIDATE, PREFERRED_CEILING_USD_PER_CANDIDATE } from "./premium-lock";
import type { GatewayModel } from "./probe-models";
import type { DiscoveredCandidate } from "../../lib/contract-model/compiler/discovery/types";

const ROOT = process.cwd();

export interface BakeoffCandidateModel {
  id: string;
  owner: string;
  contextWindow: number;
  maxOutputTokens: number;
  inputPerMtok: number;
  outputPerMtok: number;
  estimatedCostPerCandidateUsd: number;
  tier: "PREFERRED" | "VIABLE" | "EXCLUDED_FOR_COST" | "EXCLUDED_AS_PREMIUM" | "EXCLUDED_FOR_CAPABILITY";
  excludeReason: string | null;
}

/**
 * The capability floor is the unchanged compiler configuration's own requirement, not a
 * quality preference: a tool-use loop, an output ceiling the request will not exceed, and
 * a context window large enough for the prompt plus retrieved evidence plus tool results.
 */
export function capabilityFloor(m: GatewayModel): { ok: boolean; reason: string | null } {
  if (m.type !== "language") return { ok: false, reason: "not a language model" };
  if (!(m.tags ?? []).includes("tool-use")) return { ok: false, reason: "no tool-use capability advertised" };
  if (m.max_tokens < 64000) return { ok: false, reason: `output ceiling ${m.max_tokens} below the 64,000 the compiler requests` };
  if (m.context_window < 200000) return { ok: false, reason: `context window ${m.context_window} below the 200,000 the workflow needs` };
  return { ok: true, reason: null };
}

export function discoverModels(cataloguePath = "/tmp/claude-0/pilot/models-bakeoff.json"): BakeoffCandidateModel[] {
  const data = JSON.parse(fs.readFileSync(cataloguePath, "utf8")).data as GatewayModel[];
  return data
    .map((m): BakeoffCandidateModel => {
      const inP = Number(m.pricing?.input);
      const outP = Number(m.pricing?.output);
      // Unpriced models cannot be checked against the cost ceiling. NaN also silently
      // breaks the sort (NaN comparisons leave elements in place), so a model with no
      // published price would both misorder the list AND evade the ceiling. Excluded.
      const priceKnown = Number.isFinite(inP) && Number.isFinite(outP);
      const est = priceKnown ? estimatedCostPerCandidate(inP, outP) : Number.POSITIVE_INFINITY;
      const cap = capabilityFloor(m);
      let tier: BakeoffCandidateModel["tier"];
      let reason: string | null = null;

      if (!priceKnown) {
        tier = "EXCLUDED_FOR_COST";
        reason = "gateway publishes no price for this model; cost cannot be bounded, so it cannot be used under a spend ceiling";
      } else if (!cap.ok) {
        tier = "EXCLUDED_FOR_CAPABILITY";
        reason = cap.reason;
      } else if (isPremiumById(m.id)) {
        tier = "EXCLUDED_AS_PREMIUM";
        reason = "model id matches a premium family; §1 forbids any paid request to it";
      } else if (est >= VIABILITY_CEILING_USD_PER_CANDIDATE) {
        tier = "EXCLUDED_FOR_COST";
        reason = `estimated $${est.toFixed(4)}/candidate is at or above the $${VIABILITY_CEILING_USD_PER_CANDIDATE} ceiling`;
      } else if (est < PREFERRED_CEILING_USD_PER_CANDIDATE) {
        tier = "PREFERRED";
      } else {
        tier = "VIABLE";
      }

      return {
        id: m.id,
        owner: m.owned_by ?? m.id.split("/")[0]!,
        contextWindow: m.context_window,
        maxOutputTokens: m.max_tokens,
        inputPerMtok: priceKnown ? Number((inP * 1e6).toFixed(4)) : -1,
        outputPerMtok: priceKnown ? Number((outP * 1e6).toFixed(4)) : -1,
        estimatedCostPerCandidateUsd: priceKnown ? Number(est.toFixed(5)) : Number.POSITIVE_INFINITY,
        tier,
        excludeReason: reason,
      };
    })
    .sort((a, b) => {
      // A total order. Subtracting two Infinities yields NaN, which makes a comparator
      // INCONSISTENT — and an inconsistent comparator corrupts the whole sort, not just
      // the pair involved. Unpriced models are ranked into a single trailing bucket
      // first, then cost, then id.
      const rank = (x: BakeoffCandidateModel) => (Number.isFinite(x.estimatedCostPerCandidateUsd) ? 0 : 1);
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      if (rank(a) === 1) return a.id.localeCompare(b.id);
      if (a.estimatedCostPerCandidateUsd !== b.estimatedCostPerCandidateUsd) return a.estimatedCostPerCandidateUsd - b.estimatedCostPerCandidateUsd;
      return a.id.localeCompare(b.id);
    });
}

/**
 * §5 — the probe set. Structural and deterministic: every axis is a property of the
 * candidate or of the prior run's EXECUTION record, never of a benchmark outcome. Ties
 * break on discoveryId so the set is reproducible.
 */
export interface ProbeSlot {
  axis: string;
  rationale: string;
  discoveryId: string;
  sourceSectionRef: string;
  sourceTextChars: number;
  priorOutcome: string;
}

export function buildProbeSet(priorTier1Path = "/tmp/claude-0/pilot/run/03-tier1.json"): ProbeSlot[] {
  const stages = buildDeterministicStages();
  const { rehydrated } = rehydrateNodeIds(sealedPopulation().eligible, stages.index);
  const { keep } = dedupExact(rehydrated, (c) => operativeTextFor(c, stages.index));
  const priorAbs = path.isAbsolute(priorTier1Path) ? priorTier1Path : path.join(ROOT, priorTier1Path);
  const prior = JSON.parse(fs.readFileSync(priorAbs, "utf8")) as { discoveryId: string; status: string; failureReasons: string[]; sourceSectionRef: string; sourceTextChars: number; inputTokens: number | null }[];
  const priorById = new Map(prior.map((r) => [r.discoveryId, r]));

  const withText = keep
    .map((c) => ({ c, chars: operativeTextFor(c, stages.index).length, prior: priorById.get(c.discoveryId) }))
    .filter((x) => x.chars > 0)
    .sort((a, b) => a.c.discoveryId.localeCompare(b.c.discoveryId));

  const depth = (ref: string) => (ref.match(/\(/g) ?? []).length;
  const xrefDensity = (c: DiscoveredCandidate, chars: number) => {
    const text = operativeTextFor(c, stages.index);
    return (text.match(/Section\s+\d/gi) ?? []).length / Math.max(1, chars / 1000);
  };
  const hasThreshold = (c: DiscoveredCandidate) => /\$[\d,]{4,}|\d+\.\d+\s*to\s*1\.00|\d+%/.test(operativeTextFor(c, stages.index));

  const picked = new Map<string, ProbeSlot>();
  const take = (axis: string, rationale: string, pool: typeof withText) => {
    const hit = pool.find((x) => !picked.has(x.c.discoveryId));
    if (!hit) return;
    picked.set(hit.c.discoveryId, {
      axis,
      rationale,
      discoveryId: hit.c.discoveryId,
      sourceSectionRef: String(hit.c.normalizedSourceRef),
      sourceTextChars: hit.chars,
      priorOutcome: hit.prior ? (hit.prior.status !== "FAILED" ? "COMPLETED" : hit.prior.failureReasons[0] ?? "FAILED") : "NOT_ATTEMPTED",
    });
  };

  take("SHORT_SIMPLE_PROHIBITION", "shortest non-empty candidate: the cheapest possible compilation", [...withText].sort((a, b) => a.chars - b.chars));
  take("LONGER_COVENANT", "longest candidate: stresses output ceiling and wall clock", [...withText].sort((a, b) => b.chars - a.chars));
  take("NESTED_SUBSECTION", "deepest structural nesting: stresses reference resolution", [...withText].sort((a, b) => depth(String(b.c.normalizedSourceRef)) - depth(String(a.c.normalizedSourceRef))));
  take("THRESHOLD_PROVISION", "carries an explicit numeric threshold the IR must capture", withText.filter((x) => hasThreshold(x.c)));
  take("CROSS_REFERENCE_HEAVY", "highest density of section references per 1k chars", [...withText].sort((a, b) => xrefDensity(b.c, b.chars) - xrefDensity(a.c, a.chars)));
  take("EVIDENCE_RETRIEVAL_REQUIRED", "prior run used the evidence tools on this candidate", withText.filter((x) => (priorById.get(x.c.discoveryId) as { toolCalls?: number } | undefined)?.toolCalls ?? 0 > 0));
  take("PREVIOUSLY_SUCCEEDED_ON_DEEPSEEK", "known-good control: establishes the harness still works", withText.filter((x) => x.prior && x.prior.status !== "FAILED"));
  take("PREVIOUSLY_SUCCEEDED_ON_DEEPSEEK_2", "second known-good control", withText.filter((x) => x.prior && x.prior.status !== "FAILED"));
  take("PREVIOUSLY_TIMED_OUT", "hit the 900s ceiling while still streaming", withText.filter((x) => x.prior?.failureReasons.includes("WALL_CLOCK_TIMEOUT")));
  take("PREVIOUSLY_TIMED_OUT_2", "second timeout candidate, per §9's minimum of two", withText.filter((x) => x.prior?.failureReasons.includes("WALL_CLOCK_TIMEOUT")));
  take("PREVIOUSLY_STALLED_AT_CONCURRENCY_6", "zero-token stall in the concurrency-6 pass", withText.filter((x) => x.prior?.failureReasons.includes("PROVIDER_FAILURE") && (x.prior?.inputTokens ?? 0) === 0));
  take("MEDIAN_SIZE", "median-length candidate: the typical case, not an extreme", [...withText].sort((a, b) => Math.abs(a.chars - withText[Math.floor(withText.length / 2)]!.chars) - Math.abs(b.chars - withText[Math.floor(withText.length / 2)]!.chars)));

  return [...picked.values()];
}

if (process.argv[1]?.endsWith("bakeoff.ts")) {
  const models = discoverModels();
  const byTier = models.reduce((a: Record<string, number>, m) => { a[m.tier] = (a[m.tier] ?? 0) + 1; return a; }, {});
  console.log("catalogue:", models.length, JSON.stringify(byTier));
  console.log("\ncheapest 12 eligible for the bakeoff:");
  console.table(models.filter((m) => m.tier === "PREFERRED" || m.tier === "VIABLE").slice(0, 12).map((m) => ({ id: m.id, "$/cand": m.estimatedCostPerCandidateUsd, in: m.inputPerMtok, out: m.outputPerMtok, ctx: m.contextWindow, tier: m.tier })));
  const probes = buildProbeSet();
  console.log(`\nprobe set (${probes.length}):`);
  console.table(probes.map((p) => ({ axis: p.axis, ref: p.sourceSectionRef, chars: p.sourceTextChars, prior: p.priorOutcome })));
  fs.writeFileSync("/tmp/claude-0/pilot/bakeoff-plan.json", JSON.stringify({ models, probes }, null, 2));
}
