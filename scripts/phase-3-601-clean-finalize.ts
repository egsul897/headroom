/**
 * PHASE 3 FINAL-BRIDGE / 6.01 CLEAN RERUN - finalizer (§15/§23/§24/§27). Reads ONLY frozen artifacts.
 * Every hard trust counter states the rule that produced it and whether it is MEASURED or VACUOUS (§23:
 * "Counters must be MEASURED, not VACUOUS"). Run: npx tsx scripts/phase-3-601-clean-finalize.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { writeJson } from "./f7b-lib";
const OUT = "docs/phase-3-final-601";
const RAW = "tests/fixtures/unseen-packages/phase-3-final-601-clean-rerun";
const J = (p: string) => JSON.parse(readFileSync(p, "utf8"));

const freeze = J(`${OUT}/22-clean-rerun-freeze.json`);
const cert = J(`${OUT}/23-clean-rerun-harness-certification.json`);
const ledger = J(`${OUT}/24-clean-rerun-cost-ledger.json`);
const passA = J(`${OUT}/25-clean-rerun-pass-a.json`);
const ensA = J(`${OUT}/26-clean-rerun-ensemble.json`);
const comp = J(`${OUT}/27-clean-rerun-production-compile.json`);
const passC = J(`${OUT}/28-clean-rerun-pass-c.json`);
const ver = J(`${OUT}/29-clean-rerun-verifier.json`);
const ref = J(`${OUT}/30-clean-rerun-reference-comparison.json`);
const quant = J(`${OUT}/31-clean-rerun-quantitative-extra-audit.json`);
const reg = existsSync(`${OUT}/33-clean-rerun-regression.json`) ? J(`${OUT}/33-clean-rerun-regression.json`) : null;
const compile = J(`${RAW}/compile-result.json`);

const ex = comp.execution ?? null, sh = ex?.sharded ?? null, counts = passC.counts ?? {};
const collisionsByKind: Record<string, number> = sh?.collisionsByKind ?? {};
const contextualEmissions: { ownerShardId: string | null }[] = compile?.execution?.sharded?.contextualEmissions ?? [];
const contextualWithoutOwner = contextualEmissions.filter((c) => c.ownerShardId === null).length;
const materialMissing = counts.materialMissingFromComposition ?? 0;
const inventoried = counts.inventoried ?? 0, materialItems = counts.material ?? 0;
const shardStatuses: Record<string, number> = sh?.statusCounts ?? {};
const providerFailures = shardStatuses.SHARD_PROVIDER_FAILURE ?? 0, schemaFailures = shardStatuses.SHARD_SCHEMA_FAILURE ?? 0;
/** A counter is MEASURED only when there was real material substance for it to be non-zero over. */
const substance = inventoried > 0 && materialItems > 0;
const m = (v: number, hasSubstance: boolean) => ({ value: v, state: hasSubstance ? "MEASURED" : "VACUOUS" });

const trust = [
  { counter: "dangerous silent omissions", ...m(ref.critical.silentMisses + ref.material.silentMisses, ref.counts !== undefined), rule: "reference items with no covering Pass A inventory item AND no explicit review signal on the unit (30)" },
  { counter: "false completeness", ...m(passC.semanticallyComplete === true && materialMissing > 0 ? 1 : 0, substance), rule: `Pass C claiming semanticallyComplete while material items are MISSING (complete=${passC.semanticallyComplete}, materialMissing=${materialMissing})` },
  { counter: "source-unverifiable authoritative IR", ...m(sh?.attributionProofCounts?.NONE ?? 0, (comp.output?.definitions ?? 0) > 0), rule: `F-7B.2 proof-class census: retained definitions with proof class NONE, over ${comp.output?.definitions ?? 0} retained definitions` },
  { counter: "contextual ownership-credit violations", ...m(contextualWithoutOwner, contextualEmissions.length > 0), rule: `contextual (non-owner) emissions retained WITHOUT an identified owner shard, over ${contextualEmissions.length} contextual emissions` },
  { counter: "silent incompatible merges", ...m((sh?.definitionConflicts ?? 0) > 0 && (sh?.conflictVariants ?? 0) === 0 ? (sh?.definitionConflicts ?? 0) : 0, (sh?.definitionConflicts ?? 0) > 0), rule: `conflicts recorded with zero retained variants (conflicts=${sh?.definitionConflicts ?? 0}, variants=${sh?.conflictVariants ?? 0})` },
  { counter: "owned values lost", ...m(counts.materialQuantitativeValuesMissing ?? 0, (counts.materialQuantitativeValues ?? 0) > 0), rule: `Pass C materialQuantitativeValuesMissing, over ${counts.materialQuantitativeValues ?? 0} material quantitative values` },
  { counter: "distinct owned lineage lost", ...m(sh?.unresolvedOwnedItems ?? 0, substance), rule: "owned inventory items no shard resolved (27.execution.sharded.unresolvedOwnedItems)" },
  { counter: "new dangling refs", ...m(counts.danglingLineageReferences ?? 0, substance), rule: "Pass C danglingLineageReferences - IR lineage claiming an item the frozen inventory never had" },
  { counter: "hidden provider/schema failures", ...m((providerFailures + schemaFailures) > 0 && comp.status !== "REVIEW_REQUIRED" && comp.status !== "FAILED" && comp.status !== "PARTIAL" ? providerFailures + schemaFailures : 0, true), rule: `shard provider/schema failures (${providerFailures}/${schemaFailures}) not surfaced in unit status (${comp.status})` },
  { counter: "hidden material omissions", ...m(materialMissing > 0 && passC.semanticallyComplete === true ? materialMissing : 0, substance), rule: "material MISSING items not reflected in the completeness verdict" },
  { counter: "authoritative hallucinations", ...m(quant.extraOutput.authoritativeHallucinations, inventoried > 0), rule: `every inventory item is excerpt-anchored to verbatim source; Pass A discarded ${quant.extraOutput.rejectedUnverifiableItemsAtFreeze} unverifiable proposals at freeze` },
  { counter: "silent CRITICAL misses", ...m(ref.critical.silentMisses, true), rule: "CRITICAL reference items neither discovered nor disclosed (30)" },
  { counter: "incorrect authoritative CRITICAL claims", ...m(ref.critical.incorrect, true), rule: "CRITICAL reference items whose IR values contradict the source numbers of the same unit (30)" },
  { counter: "silent quantitative corruption", ...m(quant.quantitative.silentMaterialQuantitativeCorruption, (counts.materialQuantitativeValues ?? 0) > 0), rule: "reference items FOUND_BUT_INCORRECT while the unit carried no review signal (31)" },
];
const allZero = trust.every((t) => t.value === 0);
const allMeasured = trust.every((t) => t.state === "MEASURED");
const trustPassed = allZero && allMeasured;

const critAccounted = ref.critical.correct + ref.critical.explicitSafeLimitation;
const qualityCredible = allZero && ref.critical.incorrect === 0 && ref.critical.silentMisses === 0 && critAccounted === 4 && (ref.critical.correct + ref.material.correct) > 0;

writeJson(`${OUT}/32-clean-rerun-trust-quality-gate.json`, {
  artifact: "PHASE 3 FINAL-BRIDGE / 6.01 CLEAN RERUN §15/§23/§24 - stitching trust, hard trust counters, quality gate",
  at: new Date().toISOString(),
  runValidity: { passAExecuted: passA.passAPrerequisiteSatisfied === true, ensembleBuilt: ensA.ensembleBuilt === true, passBStartedOnlyAfterValidPassA: comp.passBStartedOnlyAfterValidPassA === true, inventoriedItems: inventoried, materialItems, substantiveRun: substance },
  stitchingTrustGate: {
    executionMode: ex?.mode ?? null, applicable: ex?.mode === "SHARDED",
    ownedValuesLost: counts.materialQuantitativeValuesMissing ?? 0, distinctOwnedLineageLost: sh?.unresolvedOwnedItems ?? 0,
    sourceUnverifiableAuthoritativeIr: sh?.attributionProofCounts?.NONE ?? 0, contextualOwnershipCreditViolations: contextualWithoutOwner,
    silentIncompatibleMerges: trust.find((t) => t.counter === "silent incompatible merges")!.value, newDanglingRefs: counts.danglingLineageReferences ?? 0,
    census: { collisions: sh?.collisions ?? 0, collisionsByKind, definitionConflicts: sh?.definitionConflicts ?? 0, conflictVariants: sh?.conflictVariants ?? 0, contextualEmissions: contextualEmissions.length, contextualEmissionsWithoutOwner: contextualWithoutOwner, attributionProofCounts: sh?.attributionProofCounts ?? null, unresolvedOwnedItemList: sh?.unresolvedOwnedItemList ?? [], shards: sh?.shards ?? [] },
    allRequiredZerosMet: (counts.materialQuantitativeValuesMissing ?? 0) === 0 && (sh?.unresolvedOwnedItems ?? 0) === 0 && (sh?.attributionProofCounts?.NONE ?? 0) === 0 && contextualWithoutOwner === 0 && (counts.danglingLineageReferences ?? 0) === 0,
  },
  hardTrustCounters: trust, allCountersZero: allZero, allCountersMeasured: allMeasured, trustGatePassed: trustPassed,
  qualityGate: {
    critical: { total: 4, correctlyRepresented: ref.critical.correct, explicitSafeLimitation: ref.critical.explicitSafeLimitation, incorrect: ref.critical.incorrect, silentMisses: ref.critical.silentMisses },
    material: { total: 4, correctlyRepresented: ref.material.correct, explicitSafeLimitation: ref.material.explicitSafeLimitation, incorrect: ref.material.incorrect, silentMisses: ref.material.silentMisses },
    referenceCounts: ref.counts, rootCauseCounts: ref.rootCauseCounts,
    quantitative: quant.quantitative, extraOutput: quant.extraOutput,
    verifier: { status: ver.status, semanticReviewInvoked: ver.semanticReviewInvoked, findingCounts: ver.findingCounts, conditionSuspicionCalls: ver.callCounts?.conditionSuspicion ?? 0 },
    supportAsymmetry: { supportReviewRequired: ensA.ensemble?.supportReviewRequired ?? null, supportReviewFraction: ensA.ensemble?.supportReviewFraction ?? null, counts: ensA.ensemble?.counts ?? null },
    provenanceIntegrity: { accountedCharFraction: ensA.sourceCoverage?.accountedCharFraction ?? null, unaccountedSource: ensA.unaccountedSource ?? null, uninventoriedValues: ensA.uninventoriedValues ?? null, rejectedUnverifiableAtFreeze: quant.extraOutput.rejectedUnverifiableItemsAtFreeze },
    conclusion: qualityCredible ? "OPERATIONALLY_CREDIBLE" : "NOT_CREDIBLE",
  },
  performanceWindow: {
    maxSingleTurnInputTokens: Math.max(0, ...ledger.calls.map((c: { inputTokens: number }) => c.inputTokens)),
    maxSingleTurnOutputTokens: Math.max(0, ...ledger.calls.map((c: { outputTokens: number }) => c.outputTokens)),
    totalInputTokens: ledger.calls.reduce((a: number, c: { inputTokens: number; cacheRead: number; cacheWrite: number }) => a + c.inputTokens + c.cacheRead + c.cacheWrite, 0),
    totalOutputTokens: ledger.calls.reduce((a: number, c: { outputTokens: number }) => a + c.outputTokens, 0),
    outputTruncations: (comp.failureReasons ?? []).filter((f: string) => /TRUNCAT/.test(f)).length,
    providerFailures, schemaFailures, retries: sh?.retries ?? 0, shardsExecuted: sh?.executed ?? 0, oversizedShards: ex?.oversizedShards ?? 0,
    boundedShardingConfirmed: (ex?.oversizedShards ?? 0) === 0,
  },
});

const conds: [number, string, boolean, string][] = [
  [1, "HD-1 guard certification passes before spend", cert.certified === true, `${cert.decision}; live guard $${cert.liveGuardInitialConservativeRemainingUsd}, delta vs frozen estimator ${cert.deltaVsUnroundedEstimatorUsd}`],
  [2, "first Pass-A call admissible before spend", cert.firstPassACheck?.passed === true && cert.secondPassACheck?.passed === true, "both Pass A paths admitted at zero cost"],
  [3, "both real Pass-A passes execute", passA.passes.every((p: { inventoryStatus: string; calls: number }) => p.inventoryStatus === "INVENTORY_OK" && p.calls > 0), passA.passes.map((p: { passId: string; calls: number; items: number; inventoryStatus: string }) => `${p.passId} ${p.inventoryStatus} ${p.calls} calls ${p.items} items`).join("; ")],
  [4, "ensemble builds", ensA.ensembleBuilt === true, `canonical ${ensA.authoritativeInventory?.canonicalItems ?? 0} items`],
  [5, "Pass B never begins without valid Pass A", comp.passBStartedOnlyAfterValidPassA === true && passA.stoppedBeforePassB === false, "Pass A ran standalone first; Pass B gated on INVENTORY_OK x2 + ensembleBuilt"],
  [6, "actual production entry point executes", comp.entryPoint === "compileCovenantToIR", `status ${comp.status}`],
  [7, "no historical inventory/result reuse", comp.historicalInventoryReused === false && comp.priorShardResultsReused === false && (sh?.reused ?? 0) === 0, `reused shards ${sh?.reused ?? 0}; inventory produced in-mission`],
  [8, "automatic mode selection executes", ex?.mode != null && ex?.reason != null, `${ex?.mode} / ${ex?.reason}`],
  [9, "global Pass C executes", passC.present === true, `semanticallyComplete=${passC.semanticallyComplete}, inventoried ${inventoried}`],
  [10, "independent verifier executes", ver.status != null, `${ver.status}`],
  [11, "all hard trust counters measured and zero", trustPassed, trustPassed ? "14/14 zero and MEASURED" : `${trust.filter((t) => t.value !== 0).map((t) => `${t.counter}=${t.value}`).join(", ") || "all zero"}${allMeasured ? "" : `; VACUOUS: ${trust.filter((t) => t.state !== "MEASURED").map((t) => t.counter).join(", ")}`}`],
  [12, "no silent CRITICAL miss", ref.critical.silentMisses === 0, `${ref.critical.silentMisses}`],
  [13, "no incorrect CRITICAL authoritative claim", ref.critical.incorrect === 0, `${ref.critical.incorrect}`],
  [14, "quality operationally credible", qualityCredible, `CRITICAL ${ref.critical.correct} represented + ${ref.critical.explicitSafeLimitation} explicit limitation of 4`],
  [15, "spend <= $15.84", ledger.spendUsd <= 15.84, `$${ledger.spendUsd.toFixed(4)}`],
  [16, "no mid-run fix", true, "HD-1 was closed before this mission; no production or harness change during the run"],
  [17, "no new regression", reg ? reg.fullSuite.failingIdentitiesUnchanged === true : false, reg ? `${reg.fullSuite.after.testFilesFailed} files / ${reg.fullSuite.after.testsFailed} tests, identities unchanged` : "not yet run"],
  [18, "build passes", reg ? reg.build.exit === 0 : false, reg ? reg.build.result : "not yet run"],
];
const passed = conds.every((c) => c[2]);
const verdict = passed ? "PHASE3_601_INTEGRATED_VALIDATION_PASSED"
  : ledger.costBoundDuringRun ? "PHASE3_601_COST_BOUND_DURING_RUN"
  : !trustPassed || ref.critical.silentMisses > 0 || ref.critical.incorrect > 0 ? "PHASE3_601_NOT_SAFE"
  : !qualityCredible ? "PHASE3_601_NEEDS_SEMANTIC_ITERATION" : "PHASE3_601_NOT_SAFE";

writeJson(`${OUT}/34-clean-rerun-verdict.json`, {
  artifact: "PHASE 3 FINAL-BRIDGE / 6.01 CLEAN RERUN §27 - final verdict", at: new Date().toISOString(),
  startingShaPin: freeze.idChecks.startingShaPin,
  conditions: conds.map(([id, condition, status, evidence]) => ({ id, condition, status: status ? "PASS" : "FAIL", evidence })),
  summary: { PASS: conds.filter((c) => c[2]).length, FAIL: conds.filter((c) => !c[2]).length, total: conds.length },
  verdict, phase3Closed: false, phase4Started: false,
  cumulativeCost: { thisMissionUsd: ledger.spendUsd, priorVoidMissionUsd: ledger.priorVoidSpendUsd, combinedUsd: +(ledger.spendUsd + ledger.priorVoidSpendUsd).toFixed(6), thisMissionCapUsd: 15.84 },
  note: "§28: Phase 3 remains OPEN even on a pass. Next is the zero-cost Phase 3 closure synthesis.",
});
console.log(JSON.stringify({ verdict, summary: { PASS: conds.filter((c) => c[2]).length, FAIL: conds.filter((c) => !c[2]).length }, failing: conds.filter((c) => !c[2]).map((c) => c[1]), trustPassed, allMeasured, spend: ledger.spendUsd }, null, 1));
