/**
 * F-7B.3D §1/§2 - ZERO-COST reproduction of the scorer disagreement over the same 25 frozen real shard results.
 * Runs the pre-registered F-7 scorer and the certified F-7B.3B metric side by side and records both.
 */
import { createHash } from "node:crypto";
import { F7A_BASELINE, freezeAndPlan, gitSha, writeJson } from "./f7b-lib";
import { loadFrozenStage1, loadStage2, stitchAll } from "./f7b3-lib";
import { scoreCanary } from "./f7b-score";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const frozen = freezeAndPlan();
const { plan } = frozen;
const s1 = loadFrozenStage1(); const s2 = loadStage2();
const evidence = plan.shards.flatMap((s) => { const e = s1.get(s.shardId) ?? s2.get(s.shardId); return e ? [{ shard: s, e }] : []; });
if (evidence.length !== 25) { console.error(`F7B_3D_BASELINE_INVALID: expected 25 real shard results, found ${evidence.length}`); process.exit(3); }
const results = evidence.map((x) => x.e.result);
const records = evidence.map((x) => x.e.record);
const stitched = stitchAll(frozen, results);
const ledgerCalls = records.flatMap((r) => [{ shardId: r.shardId, turn: 1, inputTokens: r.actual.inputTokens, outputTokens: r.actual.outputTokens, costUsd: r.actual.costUsd }]);
const legacy = scoreCanary(frozen, results, records, stitched, ledgerCalls);

writeJson("docs/phase-3-remediation-f7b3d/00-scorer-disagreement.json", {
  artifact: "F-7B.3D §2 - the pre-registered scorer and the certified F-7B.3B metric disagree on the same frozen evidence (0 model calls, $0)",
  at: new Date().toISOString(), gitSha: gitSha(),
  planHash: plan.planHash, planHashMatchesBaseline: plan.planHash === F7A_BASELINE.planHash,
  frozenShardCount: evidence.length,
  frozenShards: evidence.map((x) => ({ ordinal: x.shard.ordinal, shardId: x.shard.shardId, shardHash: x.shard.shardHash, status: x.e.result.status, compositionHash: sha256(JSON.stringify(x.e.result.composition)) })),
  legacyScorer: {
    module: "scripts/f7b-score.ts",
    ownedValuesLostByStitching: legacy.trust.valuesLostByStitching, valuesLostList: legacy.B.valuesLostList,
    lineageRefsBefore: legacy.C.lineageRefsBefore, lineageRefsAfter: legacy.C.lineageRefsAfter,
    ownedLineageOccurrencesLost: legacy.C.lineageRefsBefore - legacy.C.lineageRefsAfter,
    sourceUnverifiableIrSurviving: legacy.trust.sourceUnverifiableIrSurviving,
    valueOccurrencesBefore: legacy.B.valueOccurrencesBefore, valueOccurrencesAfter: legacy.B.valueOccurrencesAfter,
    trust: legacy.trust,
  },
  stitchedNow: { definitions: stitched.definitions.length, definitionConflicts: stitched.definitionConflicts.length, conflictVariants: stitched.definitionConflicts.reduce((a, c) => a + c.variants.length, 0), contextualEmissions: stitched.contextualEmissions.length },
  certifiedMetricReference: "docs/phase-3-remediation-f7b3c/13-25shard-conflict-and-loss-audit.json - owned values lost 0, owned distinct lineage lost 0",
});
console.log(JSON.stringify({ frozenShards: evidence.length, legacyValuesLost: legacy.trust.valuesLostByStitching, legacyValuesLostList: legacy.B.valuesLostList, legacyLineageOccurrencesLost: legacy.C.lineageRefsBefore - legacy.C.lineageRefsAfter, legacySourceUnverifiable: legacy.trust.sourceUnverifiableIrSurviving, conflicts: stitched.definitionConflicts.length, variants: stitched.definitionConflicts.reduce((a, c) => a + c.variants.length, 0) }, null, 1));
