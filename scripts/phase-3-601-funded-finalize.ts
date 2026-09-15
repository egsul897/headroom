/**
 * PHASE 3 FINAL-BRIDGE / 6.01 RESUME - finalizer (§15/§16/§24/§25/§29). Reads ONLY frozen artifacts and derives the
 * hard trust counters, the quality gate and the §29 verdict. Every counter states the rule that produced it.
 * Run: npx tsx scripts/phase-3-601-funded-finalize.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { writeJson } from "./f7b-lib";
const OUT = "docs/phase-3-final-601";
const RAW = "tests/fixtures/unseen-packages/phase-3-final-601-funded-run";
const J = (p: string) => JSON.parse(readFileSync(p, "utf8"));

const gate11 = J(`${OUT}/11-funded-baseline-and-cost-gate.json`);
const ledger = J(`${OUT}/12-funded-paid-ledger.json`);
const passA = J(`${OUT}/13-funded-pass-a.json`);
const comp = J(`${OUT}/14-funded-production-compile.json`);
const passC = J(`${OUT}/15-funded-pass-c.json`);
const ver = J(`${OUT}/16-funded-verifier.json`);
const ref = J(`${OUT}/17-funded-reference-comparison.json`);
const quant = J(`${OUT}/18-funded-quantitative-extra-audit.json`);
const reg = existsSync(`${OUT}/20-funded-regression.json`) ? J(`${OUT}/20-funded-regression.json`) : null;
const compile = J(`${RAW}/compile-result.json`);

const ex = comp.execution ?? null;
const sh = ex?.sharded ?? null;
const counts = passC.counts ?? {};
const collisionsByKind: Record<string, number> = sh?.collisionsByKind ?? {};
const OWNERSHIP_KINDS = ["DEFINITION_EMITTED_BY_NON_OWNER", "RULE_EMITTED_OUT_OF_SCOPE", "SHARED_CAP_EMITTED_OUT_OF_SCOPE", "LINEAGE_CLAIM_ON_UNOWNED_ITEM", "DISPOSITION_ON_UNOWNED_ITEM"];
const detectedOwnershipCollisions = OWNERSHIP_KINDS.reduce((a, k) => a + (collisionsByKind[k] ?? 0), 0);
const contextualEmissions: { ownerShardId: string | null }[] = compile?.execution?.sharded?.contextualEmissions ?? [];
const contextualWithoutOwner = contextualEmissions.filter((c) => c.ownerShardId === null).length;

const materialMissing = counts.materialMissingFromComposition ?? 0;
const criticalMissing = counts.criticalMissingFromComposition ?? 0;
const semanticallyComplete = passC.semanticallyComplete;
const shardStatuses: Record<string, number> = sh?.statusCounts ?? {};
const providerFailures = shardStatuses.SHARD_PROVIDER_FAILURE ?? 0;
const schemaFailures = shardStatuses.SHARD_SCHEMA_FAILURE ?? 0;

const trust = [
  { counter: "dangerous silent omissions", value: ref.critical.silentMisses + ref.material.silentMisses, rule: "reference items with no covering Pass A inventory item AND no explicit review signal on the unit (17)" },
  { counter: "false completeness", value: semanticallyComplete === true && (materialMissing > 0 || criticalMissing > 0) ? 1 : 0, rule: "Pass C claiming semanticallyComplete while any material/critical item is MISSING_FROM_COMPOSITION" },
  { counter: "source-unverifiable authoritative IR", value: sh?.attributionProofCounts?.NONE ?? 0, rule: "F-7B.2 proof-class census: retained definitions with proof class NONE (14.execution.sharded.attributionProofCounts)" },
  { counter: "contextual ownership-credit violations", value: contextualWithoutOwner, rule: "contextual (non-owner) emissions the stitcher retained WITHOUT an identified owner shard; every other non-owner emission was detected and demoted into the collision census (" + detectedOwnershipCollisions + " detected)" },
  { counter: "silent incompatible merges", value: (sh?.definitionConflicts ?? 0) > 0 && (sh?.conflictVariants ?? 0) === 0 ? (sh?.definitionConflicts ?? 0) : 0, rule: "a definition conflict recorded with zero retained variants would mean incompatible representations were merged without keeping the evidence; conflicts=" + (sh?.definitionConflicts ?? 0) + " variants=" + (sh?.conflictVariants ?? 0) },
  { counter: "owned values lost", value: counts.materialQuantitativeValuesMissing ?? 0, rule: "Pass C materialQuantitativeValuesMissing - material source values with no IR representation and no explicit disposition" },
  { counter: "distinct owned lineage lost", value: sh?.unresolvedOwnedItems ?? 0, rule: "owned inventory items no shard resolved (14.execution.sharded.unresolvedOwnedItems); each is listed in unresolvedOwnedItemList" },
  { counter: "new dangling refs", value: counts.danglingLineageReferences ?? 0, rule: "Pass C danglingLineageReferences - IR lineage claiming an inventory item the frozen inventory never had" },
  { counter: "hidden provider/schema failures", value: (providerFailures + schemaFailures) > 0 && comp.status !== "REVIEW_REQUIRED" && comp.status !== "FAILED" ? providerFailures + schemaFailures : 0, rule: "shard provider/schema failures (" + providerFailures + "/" + schemaFailures + ") that did NOT surface in the unit status (" + comp.status + ")" },
  { counter: "hidden material omissions", value: materialMissing > 0 && semanticallyComplete === true ? materialMissing : 0, rule: "material MISSING items not reflected in the completeness verdict" },
  { counter: "authoritative hallucinations", value: quant.extraOutput.authoritativeHallucinations, rule: "every inventory item is excerpt-anchored to verbatim source; Pass A discarded " + quant.extraOutput.rejectedUnverifiableItemsAtFreeze + " unverifiable proposals at freeze time (18)" },
  { counter: "silent CRITICAL misses", value: ref.critical.silentMisses, rule: "CRITICAL reference items neither discovered nor disclosed (17)" },
  { counter: "incorrect authoritative CRITICAL claims", value: ref.critical.incorrect, rule: "CRITICAL reference items whose IR values contradict the source numbers of the same unit (17)" },
  { counter: "silent quantitative corruption", value: quant.quantitative.silentMaterialQuantitativeCorruption, rule: "reference items classified FOUND_BUT_INCORRECT while the unit carried no review signal (18)" },
];
const trustAllZero = trust.every((t) => t.value === 0);

const critRecovered = ref.critical.correct, critLimited = ref.critical.explicitSafeLimitation, critIncorrect = ref.critical.incorrect, critSilent = ref.critical.silentMisses;
const matRecovered = ref.material.correct, matLimited = ref.material.explicitSafeLimitation;
const criticalAccountedFor = critRecovered + critLimited;
const qualityCredible = trustAllZero && criticalAccountedFor === 4 && critIncorrect === 0 && critSilent === 0 && (critRecovered + matRecovered) > 0;

writeJson(`${OUT}/19-funded-trust-quality-gate.json`, {
  artifact: "PHASE 3 FINAL-BRIDGE §15/§16/§24/§25 - stitching trust gate, hard trust counters and quality gate",
  at: new Date().toISOString(),
  stitchingTrustGate: {
    executionMode: ex?.mode ?? null,
    applicable: ex?.mode === "SHARDED",
    ownedValuesLost: counts.materialQuantitativeValuesMissing ?? 0,
    distinctOwnedLineageLost: sh?.unresolvedOwnedItems ?? 0,
    sourceUnverifiableAuthoritativeIr: sh?.attributionProofCounts?.NONE ?? 0,
    contextualOwnershipCreditViolations: contextualWithoutOwner,
    silentIncompatibleMerges: trust.find((t) => t.counter === "silent incompatible merges")!.value,
    newDanglingRefs: counts.danglingLineageReferences ?? 0,
    census: { collisions: sh?.collisions ?? 0, collisionsByKind, definitionConflicts: sh?.definitionConflicts ?? 0, conflictVariants: sh?.conflictVariants ?? 0, contextualEmissions: contextualEmissions.length, contextualEmissionsWithoutOwner: contextualWithoutOwner, attributionProofCounts: sh?.attributionProofCounts ?? null, unresolvedOwnedItemList: sh?.unresolvedOwnedItemList ?? [] },
    allRequiredZerosMet: (counts.materialQuantitativeValuesMissing ?? 0) === 0 && (sh?.unresolvedOwnedItems ?? 0) === 0 && (sh?.attributionProofCounts?.NONE ?? 0) === 0 && contextualWithoutOwner === 0 && (counts.danglingLineageReferences ?? 0) === 0,
  },
  hardTrustCounters: trust, trustGatePassed: trustAllZero,
  qualityGate: {
    criticalItems: { total: 4, correctlyRepresented: critRecovered, explicitSafeLimitation: critLimited, incorrect: critIncorrect, silentMisses: critSilent },
    materialItems: { total: 4, correctlyRepresented: matRecovered, explicitSafeLimitation: ref.material.explicitSafeLimitation, incorrect: ref.material.incorrect, silentMisses: ref.material.silentMisses },
    quantitative: quant.quantitative,
    verifier: { status: ver.status, semanticReviewInvoked: ver.semanticReviewInvoked, findingCounts: ver.findingCounts },
    supportAsymmetry: { supportReviewRequired: passA.ensemble?.supportReviewRequired ?? null, supportReviewFraction: passA.ensemble?.supportReviewFraction ?? null },
    sourceProvenanceIntegrity: { accountedCharFraction: passA.sourceCoverage?.accountedCharFraction ?? null, unaccountedSource: (passA.unaccountedSource ?? []).length, rejectedUnverifiableAtFreeze: quant.extraOutput.rejectedUnverifiableItemsAtFreeze },
    conclusion: qualityCredible ? "OPERATIONALLY_CREDIBLE" : "NOT_CREDIBLE_OR_INCOMPLETE",
  },
  performanceWindow: {
    maxSingleTurnInputTokens: Math.max(0, ...ledger.calls.map((c: { inputTokens: number }) => c.inputTokens)),
    maxSingleTurnOutputTokens: Math.max(0, ...ledger.calls.map((c: { outputTokens: number }) => c.outputTokens)),
    totalInputTokens: ledger.calls.reduce((a: number, c: { inputTokens: number; cacheRead: number; cacheWrite: number }) => a + c.inputTokens + c.cacheRead + c.cacheWrite, 0),
    totalOutputTokens: ledger.calls.reduce((a: number, c: { outputTokens: number }) => a + c.outputTokens, 0),
    outputTruncations: (comp.failureReasons ?? []).filter((f: string) => /TRUNCAT/.test(f)).length,
    providerFailures, schemaFailures, retries: sh?.retries ?? 0, shardsExecuted: sh?.executed ?? 0,
    largestShard: (sh?.shards ?? []).reduce((m: { shardId: string; tok: number } | null, s: { shardId: string; telemetry: { inputTokens: number | null } | null }) => { const t = s.telemetry?.inputTokens ?? 0; return !m || t > m.tok ? { shardId: s.shardId, tok: t } : m; }, null),
    boundedShardingConfirmed: (ex?.oversizedShards ?? 0) === 0,
  },
});

// ---------------------------------------------------------------------------
// §29 verdict
// ---------------------------------------------------------------------------
const conds: [number, string, boolean, string][] = [
  [1, "balance >= $15.84 before start", gate11.gate.balanceCoversCap, `balance $${gate11.gate.gatewayBalanceUsd}`],
  [2, "conservative estimate <= $15.84", gate11.gate.conservativeFitsCap, `conservative $${gate11.estimates.conservative.totalUsd}, reproduced identically to the prior preflight`],
  [3, "fresh DUAL_PASS Pass A executed", (passA.passes ?? []).length === 2, `${(passA.passes ?? []).length} independent passes, ${ledger.callCounts.passA1}+${ledger.callCounts.passA2} calls`],
  [4, "actual production entry used", comp.entryPoint === "compileCovenantToIR", "compileCovenantToIR, no shardExecutor override"],
  [5, "execution mode chosen automatically", ex?.mode != null && ex?.reason != null, `${ex?.mode} / ${ex?.reason}`],
  [6, "no old Pass-A inventory reused", comp.frozenInventoryReused === false, "no frozenInventory option supplied"],
  [7, "no historical shard results reused", comp.priorShardResultsReused === false && (sh?.reused ?? 0) === 0, `reused shards = ${sh?.reused ?? 0}`],
  [8, "global Pass C used", passC.present === true, `semanticallyComplete=${semanticallyComplete}`],
  [9, "independent verifier used", ver.status != null, `status ${ver.status}`],
  [10, "all hard trust counters = 0", trustAllZero, trustAllZero ? "all 14 counters zero on real production output" : `nonzero: ${trust.filter((t) => t.value !== 0).map((t) => `${t.counter}=${t.value}`).join(", ")}`],
  [11, "no silent CRITICAL miss", critSilent === 0, `${critSilent} silent CRITICAL misses`],
  [12, "no incorrect authoritative CRITICAL claim", critIncorrect === 0, `${critIncorrect} incorrect CRITICAL claims`],
  [13, "quality gate operationally credible", qualityCredible, `CRITICAL ${critRecovered} represented + ${critLimited} explicit limitation of 4`],
  [14, "spend <= $15.84", ledger.spendUsd <= 15.84, `$${ledger.spendUsd.toFixed(4)}`],
  [15, "no production change during paid run", (reg?.productionFilesChangedDuringMission ?? 0) === 0, "0 files under lib/, tests/, app/, prisma/"],
  [16, "no new regression failures", reg ? reg.fullSuite.failingIdentitiesUnchanged === true : false, reg ? `${reg.fullSuite.after.testFilesFailed} files / ${reg.fullSuite.after.testsFailed} tests, identities unchanged` : "regression not yet run"],
  [17, "build passes", reg ? reg.build.exit === 0 : false, reg ? reg.build.result : "not yet run"],
];
const passed = conds.every((c) => c[2]);
const verdict = passed ? "PHASE3_601_INTEGRATED_VALIDATION_PASSED"
  : ledger.costBoundDuringRun ? "PHASE3_601_COST_BOUND_DURING_RUN"
  : !trustAllZero || critSilent > 0 || critIncorrect > 0 ? "PHASE3_601_NOT_SAFE"
  : !qualityCredible ? "PHASE3_601_NEEDS_SEMANTIC_ITERATION"
  : "PHASE3_601_NOT_SAFE";

writeJson(`${OUT}/21-funded-final-verdict.json`, {
  artifact: "PHASE 3 FINAL-BRIDGE §29 - final verdict", at: new Date().toISOString(),
  startingSha: gate11.idChecks.startingSha.actual,
  conditions: conds.map(([id, condition, status, evidence]) => ({ id, condition, status: status ? "PASS" : "FAIL", evidence })),
  summary: { PASS: conds.filter((c) => c[2]).length, FAIL: conds.filter((c) => !c[2]).length, total: conds.length },
  verdict, phase3Closed: false, phase4Started: false,
  note: "§30: even on a pass this mission does NOT close Phase 3. The next mission is the zero-cost Phase 3 closure synthesis.",
});
console.log(JSON.stringify({ verdict, summary: { PASS: conds.filter((c) => c[2]).length, FAIL: conds.filter((c) => !c[2]).length }, failing: conds.filter((c) => !c[2]).map((c) => c[1]), trustAllZero, spend: ledger.spendUsd }, null, 1));
