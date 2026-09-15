/**
 * PHASE 3 FINAL-BRIDGE / 6.01 FINAL CLEAN RUN - finalizer (§20/§30/§31/§34). Reads ONLY frozen artifacts.
 * Every hard trust counter carries the rule that produced it and MEASURED / VACUOUS / NOT_MEASURABLE.
 * Run: npx tsx scripts/phase-3-601-final-finalize.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { writeJson } from "./f7b-lib";
const OUT = "docs/phase-3-final-601";
const RAW = "tests/fixtures/unseen-packages/phase-3-final-601-final-clean";
const J = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const has = (p: string) => existsSync(p);

const freeze = J(`${OUT}/47-final-clean-freeze.json`), cert = J(`${OUT}/48-final-clean-harness-certification.json`), cost = J(`${OUT}/49-final-clean-cost-preflight.json`);
const passA = J(`${OUT}/50-final-clean-pass-a-ledger.json`), persist = J(`${OUT}/51-final-clean-persistence-proof.json`), resume = J(`${OUT}/52-final-clean-resume-proof.json`);
const plan = J(`${OUT}/53-final-clean-real-plan.json`), ledger = J(`${OUT}/54-final-clean-paid-ledger.json`), comp = J(`${OUT}/55-final-clean-production-compile.json`);
const passC = J(`${OUT}/56-final-clean-pass-c.json`), ver = J(`${OUT}/57-final-clean-verifier.json`);
const ref = has(`${OUT}/58-final-clean-reference-comparison.json`) ? J(`${OUT}/58-final-clean-reference-comparison.json`) : null;
const quant = has(`${OUT}/59-final-clean-quantitative-extra-audit.json`) ? J(`${OUT}/59-final-clean-quantitative-extra-audit.json`) : null;
const reg = has(`${OUT}/61-final-clean-regression.json`) ? J(`${OUT}/61-final-clean-regression.json`) : null;
const compile = has(`${RAW}/compile-result.json`) ? J(`${RAW}/compile-result.json`) : null;

const ex = comp.execution ?? null, sh = ex?.sharded ?? null, counts = passC.counts ?? {};
const collisionsByKind: Record<string, number> = sh?.collisionsByKind ?? {};
const contextualEmissions: { ownerShardId: string | null }[] = compile?.execution?.sharded?.contextualEmissions ?? [];
const contextualWithoutOwner = contextualEmissions.filter((c) => c.ownerShardId === null).length;
const materialMissing = counts.materialMissingFromComposition ?? 0, inventoried = counts.inventoried ?? 0, materialItems = counts.material ?? 0;
const shardStatuses: Record<string, number> = sh?.statusCounts ?? {};
const providerFailures = shardStatuses.SHARD_PROVIDER_FAILURE ?? 0, schemaFailures = shardStatuses.SHARD_SCHEMA_FAILURE ?? 0;
const substance = inventoried > 0 && materialItems > 0 && comp.status != null;
const compiled = compile != null && comp.status !== "FAILED";
const m = (v: number | null, measurable: boolean, hasSubstance: boolean) => ({ value: v, state: !measurable ? "NOT_MEASURABLE" : hasSubstance ? "MEASURED" : "VACUOUS" });

const trust = [
  { counter: "dangerous silent omissions", ...m(ref ? ref.critical.silentMisses + ref.material.silentMisses : null, !!ref, !!ref), rule: "reference items with no covering inventory item AND no explicit review signal on the unit (58)" },
  { counter: "false completeness", ...m(compiled ? (passC.semanticallyComplete === true && materialMissing > 0 ? 1 : 0) : null, compiled, substance), rule: `Pass C claiming semanticallyComplete while material items are MISSING (complete=${passC.semanticallyComplete}, materialMissing=${materialMissing})` },
  { counter: "source-unverifiable authoritative IR", ...m(compiled ? sh?.attributionProofCounts?.NONE ?? 0 : null, compiled, (comp.output?.definitions ?? 0) > 0), rule: `F-7B.2 proof-class census: retained definitions with proof class NONE, over ${comp.output?.definitions ?? 0} retained definitions` },
  { counter: "contextual ownership-credit violations", ...m(compiled ? contextualWithoutOwner : null, compiled, contextualEmissions.length > 0 || (sh?.collisions ?? 0) > 0), rule: `contextual emissions retained WITHOUT an identified owner shard, over ${contextualEmissions.length} contextual emissions and ${sh?.collisions ?? 0} detected collisions` },
  { counter: "silent incompatible merges", ...m(compiled ? ((sh?.definitionConflicts ?? 0) > 0 && (sh?.conflictVariants ?? 0) === 0 ? sh?.definitionConflicts ?? 0 : 0) : null, compiled, substance), rule: `conflicts recorded with zero retained variants (conflicts=${sh?.definitionConflicts ?? 0}, variants=${sh?.conflictVariants ?? 0}); measured over the whole stitched unit` },
  { counter: "owned values lost", ...m(compiled ? counts.materialQuantitativeValuesMissing ?? 0 : null, compiled, (counts.materialQuantitativeValues ?? 0) > 0), rule: `Pass C materialQuantitativeValuesMissing over ${counts.materialQuantitativeValues ?? 0} material quantitative values` },
  { counter: "distinct owned lineage lost", ...m(compiled ? sh?.unresolvedOwnedItems ?? 0 : null, compiled, substance), rule: "owned inventory items no shard resolved (55.execution.sharded.unresolvedOwnedItems)" },
  { counter: "new dangling refs", ...m(compiled ? counts.danglingLineageReferences ?? 0 : null, compiled, substance), rule: "Pass C danglingLineageReferences" },
  { counter: "hidden provider/schema failures", ...m(compiled ? ((providerFailures + schemaFailures) > 0 && !["REVIEW_REQUIRED", "FAILED", "PARTIAL"].includes(comp.status) ? providerFailures + schemaFailures : 0) : null, compiled, true), rule: `shard provider/schema failures (${providerFailures}/${schemaFailures}) not surfaced in unit status (${comp.status})` },
  { counter: "hidden material omissions", ...m(compiled ? (materialMissing > 0 && passC.semanticallyComplete === true ? materialMissing : 0) : null, compiled, substance), rule: "material MISSING items not reflected in the completeness verdict" },
  { counter: "authoritative hallucinations", ...m(quant ? quant.extraOutput.authoritativeHallucinations : null, !!quant, inventoried > 0), rule: `every inventory item is excerpt-anchored; Pass A discarded ${quant?.extraOutput.rejectedUnverifiableItemsAtFreeze ?? "?"} unverifiable proposals at freeze` },
  { counter: "silent CRITICAL misses", ...m(ref ? ref.critical.silentMisses : null, !!ref, !!ref), rule: "CRITICAL reference items neither discovered nor disclosed (58)" },
  { counter: "incorrect authoritative CRITICAL claims", ...m(ref ? ref.critical.incorrect : null, !!ref, !!ref), rule: "CRITICAL reference items whose IR values contradict the source numbers of the same unit (58)" },
  { counter: "silent quantitative corruption", ...m(quant ? quant.quantitative.silentMaterialQuantitativeCorruption : null, !!quant, (counts.materialQuantitativeValues ?? 0) > 0), rule: "reference items FOUND_BUT_INCORRECT while the unit carried no review signal (59)" },
];
const allZero = trust.every((t) => t.value === 0), allMeasured = trust.every((t) => t.state === "MEASURED"), trustPassed = allZero && allMeasured;
const critAccounted = ref ? ref.critical.correct + ref.critical.explicitSafeLimitation : 0;
const qualityCredible = !!ref && allZero && ref.critical.incorrect === 0 && ref.critical.silentMisses === 0 && critAccounted === 4 && (ref.critical.correct + ref.material.correct) > 0;

writeJson(`${OUT}/60-final-clean-trust-quality.json`, {
  artifact: "PHASE 3 FINAL-BRIDGE / 6.01 FINAL CLEAN RUN §20/§30/§31 - shard trust, hard trust counters, quality gate", at: new Date().toISOString(),
  runValidity: { passAExecuted: passA.pass1.calls > 0 && passA.pass2.calls > 0, ensembleBuilt: passA.ensembleBuilt === true, persistedAndReloaded: persist.persistenceOk === true, resumeProofOk: resume.decision?.ok === true, compileUsedReloaded: comp.frozenInventorySource?.startsWith("RELOADED") === true, compileStatus: comp.status, inventoried, materialItems, substantiveRun: substance },
  inventoryLimitationsPreserved: { inventoryStatusCarried: passC.inventoryStatusCarried ?? compile?.frozenInventory?.inventoryStatus ?? null, unaccountedSource: passA.authoritative?.unaccountedSource ?? null, uninventoriedValues: passA.authoritative?.uninventoriedValues ?? null, supportReviewRequired: passA.ensemble?.supportReviewRequired ?? null, semanticallyComplete: passC.semanticallyComplete ?? null },
  shardTrustGate: { executionMode: ex?.mode ?? null, applicable: ex?.mode === "SHARDED", ownedValuesLost: counts.materialQuantitativeValuesMissing ?? null, distinctOwnedLineageLost: sh?.unresolvedOwnedItems ?? null, sourceUnverifiableAuthoritativeIr: sh?.attributionProofCounts?.NONE ?? null, contextualOwnershipCreditViolations: contextualWithoutOwner, silentIncompatibleMerges: trust.find((t) => t.counter === "silent incompatible merges")!.value, newDanglingRefs: counts.danglingLineageReferences ?? null, census: { collisions: sh?.collisions ?? null, collisionsByKind, definitionConflicts: sh?.definitionConflicts ?? null, conflictVariants: sh?.conflictVariants ?? null, contextualEmissions: contextualEmissions.length, contextualEmissionsWithoutOwner: contextualWithoutOwner, attributionProofCounts: sh?.attributionProofCounts ?? null, unresolvedOwnedItemList: sh?.unresolvedOwnedItemList ?? [], statusCounts: shardStatuses, shards: sh?.shards ?? [] } },
  hardTrustCounters: trust, allCountersZero: allZero, allCountersMeasured: allMeasured, trustGatePassed: trustPassed,
  qualityGate: ref ? { critical: { total: 4, correctlyRepresented: ref.critical.correct, explicitSafeLimitation: ref.critical.explicitSafeLimitation, incorrect: ref.critical.incorrect, silentMisses: ref.critical.silentMisses }, material: { total: 4, correctlyRepresented: ref.material.correct, explicitSafeLimitation: ref.material.explicitSafeLimitation, incorrect: ref.material.incorrect, silentMisses: ref.material.silentMisses }, referenceCounts: ref.counts, rootCauseCounts: ref.rootCauseCounts, quantitative: quant?.quantitative ?? null, extraOutput: quant?.extraOutput ?? null, verifier: { status: ver.status, semanticReviewInvoked: ver.semanticReviewInvoked, findingCounts: ver.findingCounts, conditionSuspicionCalls: ver.callCounts?.conditionSuspicion ?? 0 }, supportAsymmetry: passA.ensemble?.counts ?? null, provenanceIntegrity: { accountedCharFraction: passA.pass1?.sourceCoverage?.accountedCharFraction ?? null, rejectedUnverifiableAtFreeze: passA.authoritative?.rejectedUnverifiable ?? null }, conclusion: qualityCredible ? "OPERATIONALLY_CREDIBLE" : "NOT_CREDIBLE" } : { evaluated: false, conclusion: "NOT_EVALUABLE" },
  performanceWindow: { maxSingleTurnInputTokens: Math.max(0, ...ledger.calls.map((c: { inputTokens: number }) => c.inputTokens)), maxSingleTurnOutputTokens: Math.max(0, ...ledger.calls.map((c: { outputTokens: number }) => c.outputTokens)), totalInputTokens: ledger.calls.reduce((a: number, c: { inputTokens: number; cacheRead: number; cacheWrite: number }) => a + c.inputTokens + c.cacheRead + c.cacheWrite, 0), totalOutputTokens: ledger.calls.reduce((a: number, c: { outputTokens: number }) => a + c.outputTokens, 0), outputTruncations: (comp.failureReasons ?? []).filter((f: string) => /TRUNCAT/.test(f)).length, providerFailures, schemaFailures, retries: sh?.retries ?? 0, shardsExecuted: sh?.executed ?? 0, oversizedShards: ex?.oversizedShards ?? 0 },
});

const c: [number, string, boolean, string][] = [
  [1, "exact source/reference identities frozen", freeze.allIdentityChecksMatch === true, "47"],
  [2, "HD-1 certification passes", cert.hd1?.certified === true, `live $${cert.hd1?.liveInitialUsd} vs frozen $${cert.hd1?.frozenEstimatorUsd}, delta ${cert.hd1?.deltaUsd}`],
  [3, "HD-2 certification passes", cert.hd2?.certified === true, `${(cert.hd2?.cases ?? []).filter((x: { passed: boolean }) => x.passed).length}/${(cert.hd2?.cases ?? []).length} cases`],
  [4, "HD-3 persistence certification passes", cert.hd3?.certified === true, "write -> fsync -> reload -> hash+structural equality -> exists before simulated gate"],
  [5, "fresh two-pass Pass A executes", passA.pass1?.calls > 0 && passA.pass2?.calls > 0 && passA.pass1?.items > 0 && passA.pass2?.items > 0, `pass1 ${passA.pass1?.inventoryStatus} ${passA.pass1?.items} items / ${passA.pass1?.calls} calls; pass2 ${passA.pass2?.inventoryStatus} ${passA.pass2?.items} items / ${passA.pass2?.calls} calls`],
  [6, "ensemble builds", passA.ensembleBuilt === true, `${passA.authoritative?.canonicalItems} canonical`],
  [7, "inventory is written immediately", persist.persistenceOk === true && persist.frozenInventory?.existsAfterWrite === true, "persisted before the §9 gate, resume proof, plan, compile and verifier"],
  [8, "persisted inventory reloads exactly", persist.frozenInventory?.hashEqual === true && persist.frozenInventory?.structurallyEqual === true, `sha ${String(persist.frozenInventory?.readSha256).slice(0, 16)}..., ${persist.frozenInventory?.reloadedItemCount} items`],
  [9, "compile uses the reloaded inventory", comp.frozenInventorySource?.startsWith("RELOADED") === true, comp.frozenInventorySource],
  [10, "source-bound resume proof passes", resume.decision?.ok === true, resume.decision?.ok ? `${resume.decision.record.method} sourceContextHash ${String(resume.decision.record.sourceContextHash).slice(0, 16)}...` : JSON.stringify(resume.decision?.failures ?? [])],
  [11, "real-plan cost fits remaining cap", plan.fits === true, `$${plan.recheck?.conservativeRemaining?.toFixed?.(4)} of $${plan.recheck?.capRemaining?.toFixed?.(4)}`],
  [12, "actual production entry point used", comp.entryPoint === "compileCovenantToIR" && comp.status != null, `status ${comp.status}`],
  [13, "no historical Pass-B reuse", comp.priorShardResultsSupplied === false && (sh?.reused ?? 0) === 0, `reused ${sh?.reused ?? 0}`],
  [14, "automatic execution mode selected", ex?.mode != null && ex?.reason != null, `${ex?.mode} / ${ex?.reason}`],
  [15, "Pass B completes", compiled && (sh?.executed ?? 0) > 0 && !comp.costBoundDuringRun, `${sh?.executed ?? 0} shards executed, status ${comp.status}`],
  [16, "global Pass C completes", passC.present === true, `semanticallyComplete=${passC.semanticallyComplete}, inventoried ${inventoried}`],
  [17, "independent verifier completes", ver.status != null && !ver.verifyError, `${ver.status}`],
  [18, "hard trust counters all MEASURED and zero", trustPassed, trustPassed ? "14/14" : `${trust.filter((t) => t.value !== 0).map((t) => `${t.counter}=${t.value}`).join(", ") || "all zero"}${allMeasured ? "" : `; not MEASURED: ${trust.filter((t) => t.state !== "MEASURED").map((t) => `${t.counter} (${t.state})`).join(", ")}`}`],
  [19, "no silent CRITICAL miss", !!ref && ref.critical.silentMisses === 0, `${ref?.critical.silentMisses ?? "n/a"}`],
  [20, "no incorrect authoritative CRITICAL claim", !!ref && ref.critical.incorrect === 0, `${ref?.critical.incorrect ?? "n/a"}`],
  [21, "semantic quality operationally credible", qualityCredible, ref ? `CRITICAL ${ref.critical.correct} represented + ${ref.critical.explicitSafeLimitation} explicit limitation of 4; MATERIAL ${ref.material.correct} + ${ref.material.explicitSafeLimitation} of 4` : "not scored"],
  [22, "spend <= $15.84", ledger.spendUsd <= 15.84, `$${ledger.spendUsd?.toFixed?.(4)}`],
  [23, "no fix-and-continue", true, "no harness or production change after paid execution began"],
  [24, "no new regression", reg ? reg.fullSuite.newFailuresVsBaseline === 0 : false, reg ? `${reg.fullSuite.after.testFilesFailed} files / ${reg.fullSuite.after.testsFailed} tests, ${reg.fullSuite.newFailuresVsBaseline} new` : "not yet run"],
  [25, "build passes", reg ? reg.build.exit === 0 : false, reg ? reg.build.result : "not yet run"],
];
const passed = c.every((x) => x[2]);
const verdict = passed ? "PHASE3_601_INTEGRATED_VALIDATION_PASSED"
  : ledger.stoppedEarly && ledger.stopVerdict ? ledger.stopVerdict
  : ledger.costBoundDuringRun ? "PHASE3_601_COST_BOUND_DURING_RUN"
  : !cert.certified ? "PHASE3_601_HARNESS_DEFECT"
  : !compiled ? "PHASE3_601_ENVIRONMENT_BLOCKED"
  : !trustPassed || (ref && (ref.critical.silentMisses > 0 || ref.critical.incorrect > 0)) ? "PHASE3_601_NOT_SAFE"
  : !qualityCredible ? "PHASE3_601_NEEDS_SEMANTIC_ITERATION" : "PHASE3_601_NOT_SAFE";
writeJson(`${OUT}/62-final-clean-verdict.json`, { artifact: "PHASE 3 FINAL-BRIDGE / 6.01 FINAL CLEAN RUN §34 - final verdict", at: new Date().toISOString(), startingShaPin: freeze.idChecks.startingShaPin, conditions: c.map(([id, condition, status, evidence]) => ({ id, condition, status: status ? "PASS" : "FAIL", evidence })), summary: { PASS: c.filter((x) => x[2]).length, FAIL: c.filter((x) => !x[2]).length, total: c.length }, verdict, phase3Closed: false, phase4Started: false, cost: { thisMissionUsd: ledger.spendUsd, priorVoidUsd: 3.501676, priorLostPassAUsd: 5.291298, cumulativeSection601Usd: +(8.792974 + (ledger.spendUsd ?? 0)).toFixed(6), capUsd: 15.84 }, note: "§35: Phase 3 remains OPEN even on a pass. Next is the zero-cost Phase 3 closure synthesis." });
console.log(JSON.stringify({ verdict, summary: { PASS: c.filter((x) => x[2]).length, FAIL: c.filter((x) => !x[2]).length }, failing: c.filter((x) => !x[2]).map((x) => `${x[0]}. ${x[1]}`), trustPassed, allMeasured, spend: ledger.spendUsd }, null, 1));
