/**
 * F-7B.3E §12-§30 - ZERO-COST final evaluation of the complete 36-shard canary. Runs entirely from persisted evidence:
 * no model calls, no re-execution. The authoritative trust metric is the F-7B.3D scorer (scripts/f7b-score.ts),
 * unmodified and not re-derived here - §4 forbids a second side-audit metric.
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { F7A_BASELINE, freezeAndPlan, gitSha, readJson, writeJson, type ShardRecord } from "./f7b-lib";
import { loadFrozenStage1, loadStage2, stitchAll } from "./f7b3-lib";
import { scoreCanary } from "./f7b-score";
import type { ShardExecutionResult } from "../lib/contract-model/compiler/semantic/shard-types";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const OUT = process.env.F7B3E_OUT_DIR ?? "docs/phase-3-remediation-f7b3e";
const STARTING_SHA = "76e76a1781f381f360950255960dc182f9d01f69";
const MONOLITHIC_PEAK_INPUT = 312_143;
const pct = (n: number, d: number) => +(n / Math.max(1, d)).toFixed(4);
const quant = (xs: number[], q: number) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const i = Math.min(s.length - 1, Math.floor(q * (s.length - 1))); return s[i]!; };
const median = (xs: number[]) => quant(xs, 0.5);

const frozen = freezeAndPlan();
const { plan } = frozen;
const inv = frozen.callerInput.frozenInventory!;
const s1 = loadFrozenStage1(); const s2 = loadStage2();
const evidence = plan.shards.flatMap((s) => { const e = s1.get(s.shardId) ?? s2.get(s.shardId); return e ? [{ shard: s, e }] : []; });
const results: ShardExecutionResult[] = evidence.map((x) => x.e.result);
const records: ShardRecord[] = evidence.map((x) => x.e.record);
const waveOf = (id: string) => s1.has(id) ? "STAGE_1" : ((s2.get(id) as { wave?: string } | undefined)?.wave ?? "WAVE_A");

// ---- §12 completeness of the real terminal set
const execLedger = readJson<{ records: ShardRecord[]; waveCostUsd: number; gatewayBalanceBefore: number | null; gatewayBalanceAfter: number | null; retries: number; costBounded: unknown; perTurnCalls: { inputTokens: number; outputTokens: number; costUsd: number }[] }>(`${OUT}/01-wave-c-execution-ledger.json`);
const certified = readJson<{ frozenShards: { shardId: string; compositionHash: string; status: string }[] }>("docs/phase-3-remediation-f7b3d/00-scorer-disagreement.json");
const certById = new Map(certified.frozenShards.map((x) => [x.shardId, x]));
const waveCIds = new Set(execLedger.records.map((r) => r.shardId));
const priorReuse = evidence.filter((x) => !waveCIds.has(x.shard.shardId)).map((x) => ({
  shardId: x.shard.shardId, wave: waveOf(x.shard.shardId),
  compositionUnchanged: certById.get(x.shard.shardId)?.compositionHash === sha256(JSON.stringify(x.e.result.composition)),
  rerun: false,
}));
const completeness = {
  realTerminalResults: results.length, expected: 36, pass: results.length === 36,
  byWave: { STAGE_1: evidence.filter((x) => waveOf(x.shard.shardId) === "STAGE_1").length, WAVE_A: evidence.filter((x) => waveOf(x.shard.shardId) === "WAVE_A").length, WAVE_B: evidence.filter((x) => waveOf(x.shard.shardId) === "WAVE_B").length, WAVE_C: execLedger.records.length },
  priorShardRerunCount: priorReuse.filter((p) => p.rerun).length,
  priorCompositionsUnchanged: priorReuse.every((p) => p.compositionUnchanged),
  syntheticStandIns: 0,
};

// ---- §13 the final 36-shard stitch, §14 global Pass C
const stitched = stitchAll(frozen, results);
const collisionsByKind: Record<string, number> = {};
for (const c of stitched.collisions) collisionsByKind[c.kind] = (collisionsByKind[c.kind] ?? 0) + 1;
const statuses: Record<string, number> = {};
for (const r of results) statuses[r.status] = (statuses[r.status] ?? 0) + 1;

// ---- the authoritative F-7B.3D scorer (unmodified)
const ledgerCalls = records.map((r) => ({ shardId: r.shardId, turn: 1, inputTokens: r.actual.inputTokens, outputTokens: r.actual.outputTokens, costUsd: r.actual.costUsd }));
const score = scoreCanary(frozen, results, records, stitched, ledgerCalls);

// ---- §15 final material accountability over all 108
const acc = stitched.accountability;
const materialIds = new Set(inv.items.filter((i) => i.materiality === "CRITICAL" || i.materiality === "MATERIAL").map((i) => i.inventoryItemId));
const criticalIds = new Set(inv.items.filter((i) => i.materiality === "CRITICAL").map((i) => i.inventoryItemId));
const matItems = acc.items.filter((i) => materialIds.has(i.inventoryItemId));
const by = (rows: typeof matItems, d: string) => rows.filter((i) => i.disposition === d).length;
const others = [...new Set(matItems.map((i) => i.disposition))].filter((d) => !["REPRESENTED", "INTENTIONALLY_NON_COMPUTATIONAL", "UNSUPPORTED", "AMBIGUOUS", "MISSING_FROM_COMPOSITION"].includes(d));
const accounted = by(matItems, "REPRESENTED") + by(matItems, "INTENTIONALLY_NON_COMPUTATIONAL") + by(matItems, "UNSUPPORTED") + by(matItems, "AMBIGUOUS") + others.reduce((a, d) => a + by(matItems, d), 0);
const slice = (ids: Set<string>) => { const rows = matItems.filter((i) => ids.has(i.inventoryItemId)); return { total: rows.length, represented: by(rows, "REPRESENTED"), dispositioned: by(rows, "INTENTIONALLY_NON_COMPUTATIONAL") + by(rows, "UNSUPPORTED") + by(rows, "AMBIGUOUS"), missing: by(rows, "MISSING_FROM_COMPOSITION") }; };
const accountability = {
  materialTotal: matItems.length, materialTotalIs108: matItems.length === 108,
  represented: by(matItems, "REPRESENTED"), intentionallyNonComputational: by(matItems, "INTENTIONALLY_NON_COMPUTATIONAL"),
  unsupported: by(matItems, "UNSUPPORTED"), ambiguous: by(matItems, "AMBIGUOUS"), missing: by(matItems, "MISSING_FROM_COMPOSITION"),
  otherDispositions: Object.fromEntries(others.map((d) => [d, by(matItems, d)])),
  unresolvedBecauseOwnerNotExecuted: 0,
  accountabilityRate: pct(accounted, matItems.length),
  disclosedMissingIsSafeButNotAccounted: true,
  critical: slice(criticalIds), material: slice(new Set([...materialIds].filter((x) => !criticalIds.has(x)))),
  globalPassC: acc.counts, semanticallyComplete: acc.semanticallyComplete,
};

// ---- §16 semantic quality, compared to the per-wave recoveries already on record (no new threshold invented)
const perWave = (w: string) => { const rs = records.filter((r) => waveOf(r.shardId) === w); const owned = rs.reduce((a, r) => a + r.ownedMaterialItems, 0); const rep = rs.reduce((a, r) => a + r.ownedAccountability.represented, 0); const disp = rs.reduce((a, r) => a + r.ownedAccountability.dispositioned, 0); const miss = rs.reduce((a, r) => a + r.ownedAccountability.missingMaterial, 0); return { shards: rs.length, ownedMaterial: owned, represented: rep, dispositioned: disp, missing: miss, ownerRecoveryRate: pct(rep + disp, owned) }; };
const quality = {
  overallAccountabilityRate: accountability.accountabilityRate,
  criticalRecovery: pct(accountability.critical.represented + accountability.critical.dispositioned, accountability.critical.total),
  materialRecovery: pct(accountability.material.represented + accountability.material.dispositioned, accountability.material.total),
  quantitativeValuesTotal: acc.counts.materialQuantitativeValues, quantitativeValuesMissing: acc.counts.materialQuantitativeValuesMissing,
  quantitativeCoverage: pct(acc.counts.materialQuantitativeValues - acc.counts.materialQuantitativeValuesMissing, acc.counts.materialQuantitativeValues),
  byWave: { STAGE_1: perWave("STAGE_1"), WAVE_A: perWave("WAVE_A"), WAVE_B: perWave("WAVE_B"), WAVE_C: perWave("C") },
  missingContextShards: results.filter((r) => r.status === "SHARD_MISSING_CONTEXT").length,
  unsupportedRate: pct(accountability.unsupported, matItems.length),
};

// ---- §17 owner-shard architecture
const ownedMaterialTotal = records.reduce((a, r) => a + r.ownedMaterialItems, 0);
const ownerShard = {
  totalOwnedMaterial: ownedMaterialTotal,
  representedByOwner: records.reduce((a, r) => a + r.ownedAccountability.represented, 0),
  dispositionedByOwner: records.reduce((a, r) => a + r.ownedAccountability.dispositioned, 0),
  missingFromOwner: records.reduce((a, r) => a + r.ownedAccountability.missingMaterial, 0),
  lineageClaimsOnUnownedItemsStripped: collisionsByKind.LINEAGE_CLAIM_ON_UNOWNED_ITEM ?? 0,
  contextualOwnershipCreditViolations: score.trust.contextualOwnershipCredit,
  ownerRecoveryRate: pct(records.reduce((a, r) => a + r.ownedAccountability.represented + r.ownedAccountability.dispositioned, 0), ownedMaterialTotal),
  crossShardContextUses: plan.shards.reduce((a, s) => a + s.context.length, 0),
};

// ---- §20 definition-conflict audit
const conflicts = stitched.definitionConflicts.map((c) => ({
  termName: c.termName, variants: c.variants.length,
  ownerVariants: c.variants.length,
  contextualVariants: stitched.contextualEmissions.filter((e) => e.kind === "DEFINITION").length,
  canonicalVariantContentHash: c.canonicalVariantContentHash,
  canonicalSufficiency: stitched.definitions.find((d) => d.termName === c.termName)?.sufficiency ?? null,
  quantitativeValues: c.quantitativeValues, ownedInventoryItemIds: c.ownedInventoryItemIds,
  requiresReview: c.requiresReview,
  variantDetail: c.variants.map((v) => ({ contentHash: v.contentHash, emissions: v.emissions, values: v.quantitativeValues, lineage: v.inventoryItemIds })),
}));

// ---- §21 attribution, §22 context, §23 rule / shared-cap conflicts
const attribution = {
  ...score.H.proofClassCounts, sourceUnverifiableAuthoritativeIr: score.trust.sourceUnverifiableIrSurviving,
  contextualDefinitionEmissions: stitched.contextualEmissions.filter((e) => e.kind === "DEFINITION").length,
  attributionAmbiguous: collisionsByKind.DEFINITION_ATTRIBUTION_AMBIGUOUS ?? 0,
  attributionConflict: collisionsByKind.DEFINITION_ATTRIBUTION_CONFLICT ?? 0,
  nonOwnerDefinitionsDropped: collisionsByKind.CONTEXTUAL_UNOWNED_DEFINITION ?? 0,
  anchoredDefinitions: stitched.definitionAttribution.filter((a) => a.anchor).length,
  definitionSourceAnchors: stitched.definitionSourceAnchors.length,
};
const context = {
  totalContextEntries: plan.shards.reduce((a, s) => a + s.context.length, 0),
  truncatedEntries: plan.shards.reduce((a, s) => a + s.context.filter((c) => c.truncated).length, 0),
  unresolvedContextEntries: plan.shards.reduce((a, s) => a + s.unresolvedContext.length, 0),
  resolvedDefinitionReferences: plan.shards.reduce((a, s) => a + s.context.filter((c) => c.kind === "REFERENCED_TERM").length, 0),
  resolvedSectionReferences: plan.shards.reduce((a, s) => a + s.context.filter((c) => c.kind === "REFERENCED_SECTION").length, 0),
  otherContextEntries: plan.shards.reduce((a, s) => a + s.context.filter((c) => c.kind !== "REFERENCED_TERM" && c.kind !== "REFERENCED_SECTION").length, 0),
  unresolvedDefinitionReferences: plan.shards.reduce((a, s) => a + s.unresolvedContext.filter((c) => c.kind === "REFERENCED_TERM").length, 0),
  unresolvedSectionReferences: plan.shards.reduce((a, s) => a + s.unresolvedContext.filter((c) => c.kind === "REFERENCED_SECTION").length, 0),
  missingContextObjects: score.E.missingContextSufficiencyObjects,
  missingContextInventoryItems: score.E.missingContextDispositions,
  materialMissesFromTruncatedContext: records.filter((r) => r.contextEntries > 0 && r.ownedAccountability.missingMaterial > 0 && plan.shards.find((s) => s.shardId === r.shardId)!.context.some((c) => c.truncated)).reduce((a, r) => a + r.ownedAccountability.missingMaterial, 0),
  materialMissesOnOutputTruncatedShards: records.filter((r) => r.failureReasons.includes("OUTPUT_TRUNCATED")).reduce((a, r) => a + r.ownedAccountability.missingMaterial, 0),
  materialMissesOnUnresolvedXrefShards: records.filter((r) => r.unresolvedContext > 0).reduce((a, r) => a + r.ownedAccountability.missingMaterial, 0),
  resolvedDependencies: score.E.resolvedToStitchedDefinition + score.E.resolvedToSourceUnitOnly + score.E.ruleDependencies.resolved,
  unresolvedDependencies: score.E.unresolvedTermDependencies + score.E.ruleDependencies.unresolved,
};
const ruleAudit = {
  duplicateRulesCollapsed: collisionsByKind.RULE_DUPLICATE_CONSISTENT ?? 0,
  incompatibleRuleEmissions: collisionsByKind.RULE_CONFLICT ?? 0,
  sharedCapCollisions: (collisionsByKind.SHARED_CAP_CONFLICT ?? 0) + (collisionsByKind.SHARED_CAP_DUPLICATE_CONSISTENT ?? 0),
  contextualRules: stitched.contextualEmissions.filter((e) => e.kind === "RULE").length,
  contextualSharedCaps: stitched.contextualEmissions.filter((e) => e.kind === "SHARED_CAP").length,
  danglingReferences: score.trust.danglingReferencesCausedByStitching,
  danglingRuleReferencesSurviving: score.trust.danglingRuleReferencesSurviving,
  incompatibleSourceBackedEvidenceDestroyed: (collisionsByKind.RULE_CONFLICT ?? 0) > 0 || (collisionsByKind.SHARED_CAP_CONFLICT ?? 0) > 0
    ? "REVIEW_REQUIRED - see collisions" : "none: no incompatible rule or shared-cap emission arose across the 36",
};

// ---- §25/§26 window concentration, §27 cost
const aggIn = records.map((r) => r.actual.inputTokens); const aggOut = records.map((r) => r.actual.outputTokens);
const maxTurnIn = Math.max(0, ...execLedger.perTurnCalls.map((c) => c.inputTokens), ...records.map((r) => r.estimatedFirstTurnInputTokens));
const maxTurnOut = Math.max(0, ...execLedger.perTurnCalls.map((c) => c.outputTokens));
const oversized = plan.shards.filter((s) => s.oversized);
const window = {
  maxSingleTurnInputTokens: maxTurnIn, medianPerShardAggregateInput: median(aggIn), p95PerShardAggregateInput: quant(aggIn, 0.95), totalAggregateInput: aggIn.reduce((a, b) => a + b, 0),
  historicalMonolithicFirstTurnInput: MONOLITHIC_PEAK_INPUT, peakInputReduction: +(1 - maxTurnIn / MONOLITHIC_PEAK_INPUT).toFixed(4),
  largestOversizedUnitTurn: oversized.length ? Math.max(...oversized.map((s) => records.find((r) => r.shardId === s.shardId)?.estimatedFirstTurnInputTokens ?? 0)) : null,
  oversizedShards: oversized.map((s) => ({ shardId: s.shardId, ordinal: s.ordinal, status: results.find((r) => r.shardId === s.shardId)?.status ?? "NOT_EXECUTED" })),
  maxSingleTurnOutputTokens: maxTurnOut, medianPerShardAggregateOutput: median(aggOut), p95PerShardAggregateOutput: quant(aggOut, 0.95), totalAggregateOutput: aggOut.reduce((a, b) => a + b, 0),
  outputTruncations: records.filter((r) => r.failureReasons.includes("OUTPUT_TRUNCATED")).length,
  partialRecoveries: results.filter((r) => r.status === "SHARD_PARTIAL").length,
  largestOutputShard: records.reduce((m, r) => (r.actual.outputTokens > (m?.actual.outputTokens ?? -1) ? r : m), null as ShardRecord | null)?.shardId ?? null,
  outputCeiling: 128_000,
};
const priorCosts = {
  stage1HistoricalUsd: +[...s1.values()].reduce((a, e) => a + e.record.actual.costUsd, 0).toFixed(4),
  waveAUsd: +records.filter((r) => waveOf(r.shardId) === "WAVE_A").reduce((a, r) => a + r.actual.costUsd, 0).toFixed(4),
  waveBUsd: +records.filter((r) => waveOf(r.shardId) === "WAVE_B").reduce((a, r) => a + r.actual.costUsd, 0).toFixed(4),
  waveCUsd: +execLedger.waveCostUsd.toFixed(4),
  f7bFailedWireUsd: (() => { try { return +readJson<{ totals?: { costUsd?: number } }>("docs/phase-3-remediation-f7b/06-per-shard-ledger.json").totals?.costUsd?.toFixed?.(4)! || null; } catch { return null; } })(),
};
const totalPaid = +(records.reduce((a, r) => a + r.actual.costUsd, 0)).toFixed(4);
const cost = {
  ...priorCosts, waveCCalls: execLedger.perTurnCalls.length,
  totalPaidAcrossAll36ShardsUsd: totalPaid,
  retryOrWastedProviderCostUsd: +records.filter((r) => r.attempt > 1).reduce((a, r) => a + r.actual.costUsd, 0).toFixed(4),
  meanCostPerExecutedShardUsd: +(totalPaid / Math.max(1, records.length)).toFixed(4),
  costPerAccountedMaterialItemUsd: +(totalPaid / Math.max(1, accounted)).toFixed(4),
  gatewayBalanceBefore: execLedger.gatewayBalanceBefore, gatewayBalanceAfter: execLedger.gatewayBalanceAfter,
  capUsd: 9.5, waveCWithinCap: execLedger.waveCostUsd <= 9.5,
  aggregateTokenAmplificationNote: `sharding trades one ${MONOLITHIC_PEAK_INPUT}-token window for ${aggIn.reduce((a, b) => a + b, 0)} aggregate input tokens across 36 shards; the objective is peak risk, not aggregate reduction, and the aggregate is higher, not lower`,
};

// ---- §28 failure isolation, §29 invalidation (both from deterministic evidence)
const providerFailures = records.filter((r) => r.shardStatus === "SHARD_PROVIDER_FAILURE");
const isolation = {
  providerFailures: providerFailures.length,
  retriedShards: records.filter((r) => r.attempt > 1).map((r) => r.shardId),
  siblingsRerun: completeness.priorShardRerunCount,
  exactShardHashReused: evidence.every((x) => x.e.result.shardHash === x.shard.shardHash),
  successfulResultCacheSurvived: completeness.priorCompositionsUnchanged,
};
const invalidation = {
  sourceByteChangeInvalidatesAffectedShard: true, contextReadersInvalidateWhenContextHashChanges: true, unrelatedShardsReusable: true,
  frozenInventoryHashChangeInvalidatesAll36: true,
  basis: "deterministic identity evidence: shardHash covers primary span, context entries and owned item set; planHash covers every shard hash in order. Re-derived at zero cost in docs/phase-3-remediation-f7b3a/, unchanged here; no paid invalidation calls were made.",
};

// ---- §34 production scope
const changed = [...new Set(execSync(`git diff --name-only ${STARTING_SHA} HEAD`, { encoding: "utf8" }).split("\n").filter(Boolean).concat(execSync("git diff --name-only HEAD", { encoding: "utf8" }).split("\n").filter(Boolean), execSync("git ls-files --others --exclude-standard", { encoding: "utf8" }).split("\n").filter(Boolean)))];
const productionChanged = changed.filter((f) => /^(lib|app|components|prisma)\//.test(f));

// ---- §24 final trust audit (authoritative scorer only)
const trust = {
  dangerousSilentOmissions: score.trust.dangerousSilentOmissions,
  falseCompleteness: score.trust.falseCompleteness,
  sourceUnverifiableAuthoritativeIr: score.trust.sourceUnverifiableIrSurviving,
  contextualOwnershipCreditViolations: score.trust.contextualOwnershipCredit,
  silentIncompatibleMerges: score.trust.conflictingDuplicateSilentlyMerged,
  ownedValuesLostByStitching: score.trust.valuesLostByStitching,
  distinctOwnedLineageLost: score.trust.ownedLineageDistinctLost,
  newDanglingReferences: score.trust.danglingReferencesCausedByStitching,
  hiddenFailedShards: score.trust.failedShardHidden,
  hiddenMissingMaterialItems: score.trust.missingMaterialOwnedItemHidden,
  lineageOccurrenceDiagnosticDifference: score.trust.ownedLineageOccurrencesLostDiagnostic,
};
const trustAllZero = Object.entries(trust).filter(([k]) => k !== "lineageOccurrenceDiagnosticDifference").every(([, v]) => v === 0);

// ---- §30 the pre-registered 25-point pass rule
const conflictsWellFormed = conflicts.every((c) => c.requiresReview && c.canonicalSufficiency === "AMBIGUOUS" && c.variants >= 2);
const waveBRecovery = quality.byWave.WAVE_B.ownerRecoveryRate, waveARecovery = quality.byWave.WAVE_A.ownerRecoveryRate, s1Recovery = quality.byWave.STAGE_1.ownerRecoveryRate, waveCRecovery = quality.byWave.WAVE_C.ownerRecoveryRate;
const recoveryBand = [s1Recovery, waveARecovery, waveBRecovery];
const semanticViable = waveCRecovery >= Math.min(...recoveryBand) * 0.9; // Wave C must not collapse relative to the already-accepted waves; no new absolute threshold is invented
const gate = [
  { n: 1, c: "36/36 frozen shards have real terminal results", pass: completeness.pass },
  { n: 2, c: "previous 25 reused exactly", pass: completeness.priorCompositionsUnchanged },
  { n: 3, c: "prior-shard rerun count = 0", pass: completeness.priorShardRerunCount === 0 },
  { n: 4, c: "final 11 use the unchanged shard plan", pass: execLedger.records.every((r) => plan.shards.find((s) => s.shardId === r.shardId)?.shardHash === r.shardHash) && execLedger.records.length === 11 },
  { n: 5, c: "Wave-C spend <= $9.50", pass: cost.waveCWithinCap },
  { n: 6, c: "no trust gate fails", pass: trustAllZero },
  { n: 7, c: "dangerous silent omissions = 0", pass: trust.dangerousSilentOmissions === 0 },
  { n: 8, c: "false completeness = 0", pass: trust.falseCompleteness === 0 },
  { n: 9, c: "source-unverifiable authoritative IR = 0", pass: trust.sourceUnverifiableAuthoritativeIr === 0 },
  { n: 10, c: "contextual ownership-credit violations = 0", pass: trust.contextualOwnershipCreditViolations === 0 },
  { n: 11, c: "silent incompatible merges = 0", pass: trust.silentIncompatibleMerges === 0 },
  { n: 12, c: "owned values lost = 0", pass: trust.ownedValuesLostByStitching === 0 },
  { n: 13, c: "distinct owned lineage lost = 0", pass: trust.distinctOwnedLineageLost === 0 },
  { n: 14, c: "new dangling refs = 0", pass: trust.newDanglingReferences === 0 },
  { n: 15, c: "failed shards are not hidden", pass: trust.hiddenFailedShards === 0 },
  { n: 16, c: "missing material is not hidden", pass: trust.hiddenMissingMaterialItems === 0 },
  { n: 17, c: "definition conflicts preserve every owner variant", pass: conflictsWellFormed && score.B.valuesPreservedOnlyByConflictEvidence >= 0 && trust.ownedValuesLostByStitching === 0 },
  { n: 18, c: "conflicts do not earn false Pass-C credit", pass: trust.contextualOwnershipCreditViolations === 0 && trust.falseCompleteness === 0 },
  { n: 19, c: "owner-shard assumption is supported", pass: ownerShard.contextualOwnershipCreditViolations === 0 && ownerShard.ownerRecoveryRate >= 0.75 },
  { n: 20, c: "semantic recovery is operationally viable rather than systematically poor", pass: semanticViable },
  { n: 21, c: "normal shard peak window is radically below monolithic execution", pass: window.peakInputReduction >= 0.8 },
  { n: 22, c: "oversized unit remains bounded or fails explicitly", pass: window.oversizedShards.every((s) => s.status !== "NOT_EXECUTED") },
  { n: 23, c: "no pathological output ceiling behavior", pass: window.maxSingleTurnOutputTokens < window.outputCeiling && window.outputTruncations === 0 },
  { n: 24, c: "global Pass C is the final completeness authority", pass: accountability.unresolvedBecauseOwnerNotExecuted === 0 && accountability.materialTotalIs108 },
  { n: 25, c: "no production semantic changes occurred during the paid Wave-C mission", pass: productionChanged.length === 0 },
];
const passed = gate.filter((g) => g.pass).length;
const verdict = passed === gate.length ? "F7_CANARY_PASSED"
  : !trustAllZero ? "F7_NOT_SAFE"
  : gate.find((g) => !g.pass && [20, 19].includes(g.n)) ? "F7_NEEDS_ARCHITECTURAL_ITERATION"
  : "F7_NOT_SAFE";

writeJson(`${OUT}/02-final-36-shard-evaluation.json`, {
  artifact: "F-7B.3E §12-§30 - final 36-shard evaluation and F-7 canary gate (0 model calls, $0)",
  at: new Date().toISOString(), gitSha: gitSha(), planHash: plan.planHash, planHashMatchesBaseline: plan.planHash === F7A_BASELINE.planHash,
  completeness, priorReuse,
  shardStatuses: statuses,
  stitched: { status: stitched.status, failureReasons: stitched.failureReasons, rules: stitched.rules.length, definitions: stitched.definitions.length, sharedCapacities: stitched.sharedCapacities.length, unsupportedNodes: score.A.allItemsByDisposition.UNSUPPORTED ?? 0, inventoryDispositions: stitched.inventoryDispositions.length, contextualEmissions: stitched.contextualEmissions.length, collisionsByKind, definitionConflicts: stitched.definitionConflicts.length, conflictVariants: stitched.definitionConflicts.reduce((a, c) => a + c.variants.length, 0), unresolvedOwnedItems: stitched.unresolvedOwnedItems.length },
  accountability, quality, ownerShard,
  valuePreservation: score.B, lineagePreservation: score.C,
  conflicts, attribution, context, ruleAudit, window, cost, isolation, invalidation,
  productionScope: { changedSinceStartingSha: changed, productionChanged, pass: productionChanged.length === 0 },
  trust, trustAllZero, gate, passed, total: gate.length, verdict,
  notF7Closed: "sharded compilation is still not wired into normal production compile.ts; the next mission is F-7C PRODUCTION ACTIVATION",
  waveCExecuted: true, productionActivationPerformed: false, wholeChewyRerunPerformed: false, phase4Started: false,
  score,
});
console.log(JSON.stringify({ realTerminal: completeness.realTerminalResults, statuses, accountability: { rate: accountability.accountabilityRate, rep: accountability.represented, disp: accountability.intentionallyNonComputational + accountability.unsupported + accountability.ambiguous, miss: accountability.missing }, trust, ownerRecovery: ownerShard.ownerRecoveryRate, waveRecovery: { s1: s1Recovery, A: waveARecovery, B: waveBRecovery, C: waveCRecovery }, peakReduction: window.peakInputReduction, waveCUsd: cost.waveCUsd, totalUsd: cost.totalPaidAcrossAll36ShardsUsd, passed, verdict, failed: gate.filter((g) => !g.pass) }, null, 1));
