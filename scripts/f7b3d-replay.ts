/**
 * F-7B.3D §13/§14 - the UPDATED authoritative scorer replayed over the same 25 frozen real shard results.
 * Zero model calls. This is the single trust output future Wave-C and 36-shard gates should read.
 */
import { F7A_BASELINE, freezeAndPlan, gitSha, writeJson } from "./f7b-lib";
import { loadFrozenStage1, loadStage2, stitchAll } from "./f7b3-lib";
import { scoreCanary } from "./f7b-score";

const frozen = freezeAndPlan();
const { plan } = frozen;
const s1 = loadFrozenStage1(); const s2 = loadStage2();
const evidence = plan.shards.flatMap((s) => { const e = s1.get(s.shardId) ?? s2.get(s.shardId); return e ? [{ shard: s, e }] : []; });
if (evidence.length !== 25) { console.error(`F7B_3D_BASELINE_INVALID: expected 25, found ${evidence.length}`); process.exit(3); }
const results = evidence.map((x) => x.e.result);
const records = evidence.map((x) => x.e.record);
const stitched = stitchAll(frozen, results);
const score = scoreCanary(frozen, results, records, stitched, records.map((r) => ({ shardId: r.shardId, turn: 1, inputTokens: r.actual.inputTokens, outputTokens: r.actual.outputTokens, costUsd: r.actual.costUsd })));

const material = new Set(frozen.callerInput.frozenInventory!.items.filter((i) => i.materiality === "CRITICAL" || i.materiality === "MATERIAL").map((i) => i.inventoryItemId));
const executedShardIds = new Set(results.map((r) => r.shardId));
const matItems = score.A.passC ? stitched.accountability.items.filter((i) => material.has(i.inventoryItemId)) : [];
const onExecuted = matItems.filter((i) => executedShardIds.has(plan.itemOwnerShard[i.inventoryItemId] ?? ""));
const byDisp = (d: string) => onExecuted.filter((i) => i.disposition === d).length;
const conflictValues = new Set(stitched.definitionConflicts.flatMap((c) => c.quantitativeValues));

writeJson("docs/phase-3-remediation-f7b3d/03-authoritative-scorer-replay.json", {
  artifact: "F-7B.3D §13 - the updated authoritative F-7 scorer over the same 25 frozen real shards (0 model calls, $0)",
  at: new Date().toISOString(), gitSha: gitSha(), planHash: plan.planHash, planHashMatchesBaseline: plan.planHash === F7A_BASELINE.planHash,
  frozenShardCount: evidence.length,
  trust: score.trust,
  valuePreservation: score.B, lineagePreservation: score.C, sourceVerifiability: score.H,
  conflicts: { count: stitched.definitionConflicts.length, variants: stitched.definitionConflicts.reduce((a, c) => a + c.variants.length, 0), requiringReview: stitched.definitionConflicts.filter((c) => c.requiresReview).length, names: stitched.definitionConflicts.map((c) => c.termName), values: [...conflictValues].sort(), canonicalSufficiency: stitched.definitionConflicts.map((c) => ({ termName: c.termName, sufficiency: stitched.definitions.find((d) => d.definitionId === c.definitionId)?.sufficiency ?? null })) },
  moneyPreserved: { "MONEY:100000000": conflictValues.has("MONEY:100000000"), "MONEY:250000000": conflictValues.has("MONEY:250000000") },
  accountability: { executedShardMaterialOwned: onExecuted.length, executedRepresented: byDisp("REPRESENTED"), executedIntentionallyNonComputational: byDisp("INTENTIONALLY_NON_COMPUTATIONAL"), executedUnsupported: byDisp("UNSUPPORTED"), executedAmbiguous: byDisp("AMBIGUOUS"), executedMissing: byDisp("MISSING_FROM_COMPOSITION"), executedAccountabilityRate: +((onExecuted.length - byDisp("MISSING_FROM_COMPOSITION")) / Math.max(1, onExecuted.length)).toFixed(4), globalPassC: stitched.accountability.counts, semanticallyComplete: stitched.accountability.semanticallyComplete },
  contextualEmissions: stitched.contextualEmissions.length,
  paidCalls: 0, costUsd: 0,
});
console.log(JSON.stringify({ trust: score.trust, proofClasses: score.H.proofClassCounts, sourceUnverifiable: score.H.sourceUnverifiableSurviving, lineage: { expected: score.C.ownedLineageDistinctExpected, preserved: score.C.ownedLineageDistinctPreserved, lost: score.C.ownedLineageDistinctLost, occurrencesLostDiagnostic: score.C.ownedLineageOccurrencesLostDiagnostic, preservedOnlyByConflictEvidence: score.C.ownedLineageDistinctPreservedOnlyByConflictEvidence }, values: { lost: score.B.valuesLostByStitching, preservedOnlyByConflictEvidence: score.B.valuesPreservedOnlyByConflictEvidence, lostBeforeConflictEvidence: score.B.valuesLostBeforeConflictEvidenceDiagnostic }, accountability: { owned: onExecuted.length, represented: byDisp("REPRESENTED"), missing: byDisp("MISSING_FROM_COMPOSITION") }, passC: { represented: stitched.accountability.counts.represented, missing: stitched.accountability.counts.materialMissingFromComposition } }, null, 1));
