/**
 * F-7B §1/§6/§7 precheck (ZERO model calls): freeze + reproduce the F-7A Chewy 1.01 plan against the recorded baseline,
 * render every shard's first turn byte-exactly, compute the deterministic Stage 1 selection and its pre-registered
 * tranche estimate, and read the gateway balance. Writes 00-precheck.json, 01-frozen-plan.json, 03-stage1-selection.json.
 *   npx tsx scripts/f7b-precheck.ts
 */
import { F7A_BASELINE, F7A_STARTING_SHA, F7B_DIR, MISSION_CAP_USD, STAGE1_CAP_USD, TURN_FACTOR, freezeAndPlan, gatewayCredits, gitSha, loadGatewayKey, preCallEstimateUsd, renderFirstTurns, writeJson } from "./f7b-lib";
import { calculateCostUsd } from "../lib/contract-model/analyzer/telemetry";
import { MODEL } from "./f7b-lib";

(async () => {
  const sha = gitSha();
  const frozen = freezeAndPlan();
  const { plan } = frozen;
  const rendered = await renderFirstTurns(frozen);
  const renderedTokens = plan.shards.map((s) => rendered.get(s.shardId)!.tokens);
  const sorted = [...renderedTokens].sort((a, b) => a - b);
  const pct = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;

  const reproduction = {
    shaMatchesStarting: sha === F7A_STARTING_SHA,
    planHash: plan.planHash, planHashMatches: plan.planHash === F7A_BASELINE.planHash,
    shardCount: plan.shards.length, shardCountMatches: plan.shards.length === F7A_BASELINE.shardCount,
    ownership: plan.ownershipProof, ownershipMatches: plan.ownershipProof.materialItems === F7A_BASELINE.materialItems && plan.ownershipProof.ownedOnce === F7A_BASELINE.ownedOnce && plan.ownershipProof.unowned === 0 && plan.ownershipProof.multiplyOwned === 0,
    plannerMaxInputTokens: plan.totals.maxShardInputTokens, plannerMaxMatches: plan.totals.maxShardInputTokens === F7A_BASELINE.plannerMaxInputTokens,
    maxRenderedInputTokens: sorted[sorted.length - 1], maxRenderedMatches: sorted[sorted.length - 1] === F7A_BASELINE.maxRenderedInputTokens,
    oversizedShards: plan.totals.oversizedShards, oversizedMatches: plan.totals.oversizedShards === F7A_BASELINE.oversizedShards,
    unplacedItems: plan.unplacedItemIds.length,
  };
  const baselineReproduced = reproduction.shaMatchesStarting && reproduction.planHashMatches && reproduction.shardCountMatches && reproduction.ownershipMatches && reproduction.plannerMaxMatches && reproduction.maxRenderedMatches && reproduction.oversizedMatches && reproduction.unplacedItems === 0;

  // ---- Stage 1 deterministic selection (§6): dimensions are structural only - never term names or legal content.
  const inv = frozen.callerInput.frozenInventory!;
  const itemById = new Map(inv.items.map((i) => [i.inventoryItemId, i]));
  const unitsByKey = new Map(plan.units.map((u) => [u.unitKey, u]));
  const profile = plan.shards.map((s) => {
    const ownedItems = s.ownedItemIds.map((id) => itemById.get(id)!).filter(Boolean);
    const quantitativeItems = ownedItems.filter((i) => i.quantitativeValues.length > 0).length;
    const quantitativeValues = ownedItems.reduce((a, i) => a + i.quantitativeValues.length, 0);
    const referencedTermsOut = ownedItems.reduce((a, i) => a + i.referencedTerms.length, 0);
    // "minority-lineage risk shape" (6.08 lesson): owned items that reference terms OWNED BY OTHER SHARDS - the pattern where a monolithic
    // run credited a foreign item through minority lineage; here the owner shard must compile them itself.
    const foreignTermRefs = ownedItems.reduce((a, i) => a + i.referencedTerms.filter((t) => { const u = plan.units.find((x) => x.kind === "DEFINITION" && x.normalizedTermName === t.replace(/\s+/g, " ").trim().toLowerCase()); return u ? plan.unitOwnerShard[u.unitKey] !== s.shardId : false; }).length, 0);
    return { shardId: s.shardId, ordinal: s.ordinal, units: s.ownedUnitKeys.length, sourceChars: s.primaryChars, ownedItems: s.ownedItemIds.length, ownedMaterialItems: s.ownedMaterialItemIds.length, contextEntries: s.context.length, contextChars: s.contextChars, unresolvedContext: s.unresolvedContext.length, oversized: s.oversized, quantitativeItems, quantitativeValues, referencedTermsOut, foreignTermRefs, renderedInputTokens: rendered.get(s.shardId)!.tokens, plannerOutputEstimate: s.estimate.outputTokens, preCallEstimateUsd: preCallEstimateUsd(rendered.get(s.shardId)!.tokens, s).usd, primaryUnitKinds: [...new Set(s.ownedUnitKeys.map((k) => unitsByKey.get(k)!.kind))] };
  });
  const byOrdinal = (a: { ordinal: number }, b: { ordinal: number }) => a.ordinal - b.ordinal;
  const pick = (label: string, cands: typeof profile, cmp: (a: (typeof profile)[number], b: (typeof profile)[number]) => number) => { const c = [...cands].sort((a, b) => cmp(a, b) || byOrdinal(a, b))[0]!; return { criterion: label, shardId: c.shardId, ordinal: c.ordinal }; };
  const normal = profile.filter((p) => !p.oversized);
  const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]!; };
  const medChars = median(normal.map((p) => p.sourceChars)), medItems = median(normal.map((p) => p.ownedMaterialItems));
  const picks = [
    pick("D oversized atomic-definition shard", profile.filter((p) => p.oversized), () => 0),
    pick("B highest owned-material-item count (ties: lowest ordinal)", normal, (a, b) => b.ownedMaterialItems - a.ownedMaterialItems),
    pick("C highest dependency-context entry count (ties: lowest ordinal)", normal, (a, b) => b.contextEntries - a.contextEntries),
    pick("E highest owned quantitative-value count (ties: lowest ordinal)", normal, (a, b) => b.quantitativeValues - a.quantitativeValues),
    pick("F highest foreign-term reference count (6.08 minority-lineage risk shape; ties: lowest ordinal)", normal, (a, b) => b.foreignTermRefs - a.foreignTermRefs),
    pick("A ordinary definition shard: closest to median source chars and median material items, with >=1 material item (ties: lowest ordinal)", normal.filter((p) => p.ownedMaterialItems >= 1), (a, b) => (Math.abs(a.sourceChars - medChars) / medChars + Math.abs(a.ownedMaterialItems - medItems) / Math.max(1, medItems)) - (Math.abs(b.sourceChars - medChars) / medChars + Math.abs(b.ownedMaterialItems - medItems) / Math.max(1, medItems))),
    // Added before any model call (the A-F cover collapsed to 3 shards because one shard tops B/C/E/F at once; the mission prefers 4-6):
    pick("G full-size (max units) shard owning ZERO material items - the textual/non-computational path where the compiler must disposition or emit nothing rather than invent IR (ties: lowest ordinal)", normal.filter((p) => p.ownedMaterialItems === 0), (a, b) => b.units - a.units),
    pick("H densest full-size shard: highest owned-material-item count among max-unit shards (ties: lowest ordinal)", normal.filter((p) => p.units === Math.max(...normal.map((x) => x.units))), (a, b) => b.ownedMaterialItems - a.ownedMaterialItems),
  ];
  // Smallest deterministic cover: distinct shard ids in criterion order (a shard satisfying several criteria is used once).
  const selectedIds = [...new Set(picks.map((p) => p.shardId))];
  const selected = selectedIds.map((id) => profile.find((p) => p.shardId === id)!).sort(byOrdinal);
  const trancheEstimateUsd = selected.reduce((a, p) => a + p.preCallEstimateUsd, 0);
  const stage1Fits = trancheEstimateUsd <= STAGE1_CAP_USD;

  const keyPresent = loadGatewayKey();
  const credits = keyPresent ? await gatewayCredits() : null;
  const fullPlanEstimateUsd = profile.reduce((a, p) => a + p.preCallEstimateUsd, 0);

  writeJson(`${F7B_DIR}/00-precheck.json`, {
    artifact: "F-7B §1 freeze + §7 Stage 1 precheck (0 model calls)", at: new Date().toISOString(), gitSha: sha, startingSha: F7A_STARTING_SHA,
    identity: frozen.identity,
    baseline: F7A_BASELINE, reproduction, baselineReproduced,
    verdictIfNotReproduced: baselineReproduced ? null : "F7B_BASELINE_INVALID",
    renderedFirstTurn: { maxTokens: sorted[sorted.length - 1], medianTokens: pct(0.5), p95Tokens: pct(0.95), totalTokens: renderedTokens.reduce((a, b) => a + b, 0), historicalMonolithicFirstTurnTokens: 312143 },
    preRegisteredCostEstimator: { model: MODEL, rateCard: { inputPerMTokUsd: 2, outputPerMTokUsd: 10 }, inputTokens: `TURN_FACTOR ${TURN_FACTOR} x rendered first-turn tokens (recorded 6.08: 314,844 all-turn / 95,786 first-turn)`, outputTokens: "F-7A planner estimate 1,500 + 2,500 x owned units (above the recorded 1,535 output tokens per emitted object)", perTurnGuard: "before EVERY turn: cost(rendered turn chars x 0.3957 tokens/char, shard output estimate) must fit the remaining stage/mission cap, else the turn is refused and the shard ends as a provider failure; previously completed shards stay frozen", perShardGuard: "before EVERY shard: the pre-call estimate must fit the remaining cap, else the shard is not started and the canary is reported cost-bounded" },
    caps: { stage1CapUsd: STAGE1_CAP_USD, missionCapUsd: MISSION_CAP_USD },
    stage1: { selectedShardIds: selectedIds, trancheEstimateUsd: +trancheEstimateUsd.toFixed(4), fitsStage1Cap: stage1Fits, verdictIfNotFit: stage1Fits ? null : "F7B_ENVIRONMENT_BLOCKED" },
    fullPlanPreRegisteredEstimateUsd: +fullPlanEstimateUsd.toFixed(4),
    gateway: { keyPresent, credits, balanceCoversMissionCap: credits ? Number(credits.balance) >= MISSION_CAP_USD : null },
    historicalMonolithic: { firstTurnInputTokens: 312143, outputTokens: 60318, costUsd: 1.227466, unitCostInclPassA: 2.04469, status: "FAILED / PROVIDER_FAILURE" },
    outputEstimateSanity: { plannerMaxOutputTokens: plan.totals.maxShardOutputTokens, maxTokensSetting: 128000, monolithicImpliedOutputTokens: 379 * 2500 + 1500 },
  });
  writeJson(`${F7B_DIR}/01-frozen-plan.json`, {
    artifact: "F-7B §1 frozen Chewy 1.01 shard plan (regenerated at the starting SHA; identical to F-7A 02 by planHash)", gitSha: sha, planHash: plan.planHash, algorithmVersion: plan.algorithmVersion, candidateRef: plan.candidateRef, frozenContentHash: plan.frozenContentHash, budget: plan.budget, derivation: plan.derivation, ownershipProof: plan.ownershipProof, totals: plan.totals, units: plan.units.length, mustLinkGroups: plan.mustLinkGroups.length,
    shards: plan.shards.map((s) => ({ ordinal: s.ordinal, shardId: s.shardId, shardHash: s.shardHash, ownedUnitKeys: s.ownedUnitKeys, primaryCharStart: s.primaryCharStart, primaryCharEnd: s.primaryCharEnd, primaryChars: s.primaryChars, ownedItemIds: s.ownedItemIds, ownedMaterialItemIds: s.ownedMaterialItemIds, context: s.context.map((c) => ({ kind: c.kind, contextKey: c.contextKey, ownerShardId: c.ownerShardId, chars: c.text.length, truncated: c.truncated })), contextChars: s.contextChars, unresolvedContext: s.unresolvedContext, oversized: s.oversized, estimate: s.estimate, renderedFirstTurn: rendered.get(s.shardId) })),
    itemOwnerShard: plan.itemOwnerShard,
  });
  writeJson(`${F7B_DIR}/03-stage1-selection.json`, {
    artifact: "F-7B §6 Stage 1 deterministic representative selection (computed before any model call; structural dimensions only)", gitSha: sha, planHash: plan.planHash,
    dimensions: ["sourceChars", "ownedMaterialItems", "contextEntries", "oversized", "quantitativeValues", "foreignTermRefs (owned items referencing terms owned by another shard)"],
    medians: { sourceChars: medChars, ownedMaterialItems: medItems },
    picks, selectedShardIds: selectedIds, selected,
    trancheEstimateUsd: +trancheEstimateUsd.toFixed(4), stage1CapUsd: STAGE1_CAP_USD, fitsStage1Cap: stage1Fits,
    trancheEstimateBreakdown: selected.map((p) => ({ shardId: p.shardId, renderedInputTokens: p.renderedInputTokens, estInputTokens: Math.ceil(p.renderedInputTokens * TURN_FACTOR), estOutputTokens: p.plannerOutputEstimate, usd: +p.preCallEstimateUsd.toFixed(4) })),
    profile,
    sanity: { oneTurnOnlyEstimateUsd: +selected.reduce((a, p) => a + (calculateCostUsd(p.renderedInputTokens, p.plannerOutputEstimate, MODEL) ?? 0), 0).toFixed(4) },
  });
  console.log(JSON.stringify({ baselineReproduced, reproduction, selectedIds, trancheEstimateUsd: +trancheEstimateUsd.toFixed(4), stage1Fits, fullPlanEstimateUsd: +fullPlanEstimateUsd.toFixed(4), credits }, null, 1));
})();
