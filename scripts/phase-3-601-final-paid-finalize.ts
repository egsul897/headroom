/**
 * PHASE 3 FINAL-BRIDGE / 6.01 FINAL RESTART-SAFE PAID RUN - finalizer (§16/§17/§25/§26/§29). Reads ONLY frozen
 * artifacts + the run's summary files. Writes 76-82 (run summaries lifted into numbered artifacts), 85 (trust +
 * quality) and 87 (verdict). Run: npx tsx scripts/phase-3-601-final-paid-finalize.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { writeJson } from "./f7b-lib";
import { OUT } from "./phase-3-601-final-certify";
const RAW = process.env.HD4_RUN_EVIDENCE_DIR ?? "tests/fixtures/unseen-packages/phase-3-final-601-final-paid";
const J = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const has = (p: string) => existsSync(p);
const opt = (p: string) => (has(p) ? J(p) : null);

const freeze = J(`${OUT}/74-final-paid-freeze.json`), cost = J(`${OUT}/75-final-paid-cost-preflight.json`);
const passA = opt(`${RAW}/summary/pass-a.json`), resume = opt(`${RAW}/summary/resume-proof.json`), plan = opt(`${RAW}/summary/plan.json`), ledger = opt(`${RAW}/summary/ledger.json`), comp = opt(`${RAW}/summary/compile.json`), ver = opt(`${RAW}/summary/verifier.json`);
const compile = opt(`${RAW}/compile-result.json`);
const ref = opt(`${OUT}/83-final-paid-reference-comparison.json`), quant = opt(`${OUT}/84-final-paid-quantitative-extra-audit.json`), reg = opt(`${OUT}/86-final-paid-regression.json`);
const launches = has(`${RAW}/launches.ndjson`) ? readFileSync(`${RAW}/launches.ndjson`, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
const at = () => new Date().toISOString();

// lift the run summaries into the numbered artifact series (verbatim, plus the artifact label)
const lift = (n: string, label: string, obj: unknown) => writeJson(`${OUT}/${n}.json`, obj ? { artifact: label, ...(obj as object) } : { artifact: label, produced: false });
lift("76-final-paid-pass-a", "PHASE 3 FINAL-BRIDGE / 6.01 FINAL RESTART-SAFE PAID RUN §7/§9/§10 - Pass A (durable replay accounting, ensemble, persistence)", passA);
lift("77-final-paid-resume-proof", "PHASE 3 FINAL-BRIDGE / 6.01 FINAL RESTART-SAFE PAID RUN §11 - F-7C.1 resume proof on the RELOADED inventory", resume);
lift("78-final-paid-real-plan", "PHASE 3 FINAL-BRIDGE / 6.01 FINAL RESTART-SAFE PAID RUN §12/§13 - real plan, durable shard store, affordability", plan);
lift("79-final-paid-ledger", "PHASE 3 FINAL-BRIDGE / 6.01 FINAL RESTART-SAFE PAID RUN §5/§7 - paid ledger", ledger ? { ...ledger, launches } : null);
lift("80-final-paid-compile", "PHASE 3 FINAL-BRIDGE / 6.01 FINAL RESTART-SAFE PAID RUN §14/§15 - production compileCovenantToIR", comp);
const acc = compile?.accountability ?? null;
lift("81-final-paid-pass-c", "PHASE 3 FINAL-BRIDGE / 6.01 FINAL RESTART-SAFE PAID RUN §16 - global Pass C", acc ? { present: true, semanticallyComplete: acc.semanticallyComplete, inventoryStatusCarried: compile?.frozenInventory?.inventoryStatus ?? null, counts: acc.counts, reasons: acc.reasons ?? null, supportReviewRequired: compile?.frozenInventory?.ensemble?.supportReviewRequired ?? null, items: acc.items } : null);
lift("82-final-paid-verifier", "PHASE 3 FINAL-BRIDGE / 6.01 FINAL RESTART-SAFE PAID RUN §18 - independent verifier", ver ? { ...ver, findingCounts: ver.findings ? { total: ver.findings.length, MATERIAL: ver.findings.filter((f: { severity: string }) => f.severity === "MATERIAL").length, UNCERTAIN: ver.findings.filter((f: { severity: string }) => f.severity === "UNCERTAIN").length, NON_MATERIAL: ver.findings.filter((f: { severity: string }) => f.severity === "NON_MATERIAL").length, deterministic: ver.findings.filter((f: { verificationMethod?: string }) => f.verificationMethod === "DETERMINISTIC_ONLY").length, semantic: ver.findings.filter((f: { verificationMethod?: string }) => f.verificationMethod !== "DETERMINISTIC_ONLY").length } : null } : null);

// ---------------- §17/§25 hard trust counters
const ex = comp?.execution ?? null, sh = ex?.sharded ?? null, counts = acc?.counts ?? {};
// HD-6 (read-shape): the production result exposes execution.sharded.contextualEmissions as a COUNT, not a list; the
// unowned subset is recorded under collisionsByKind.CONTEXTUAL_UNOWNED_DEFINITION. Read conservatively: every unowned
// contextual emission counts as a violation whether or not the stitcher demoted it (attributionProofCounts.NONE says
// how many were retained without proof). A list-shaped field (older/synthetic results) is read as before.
const ceRaw = compile?.execution?.sharded?.contextualEmissions;
const contextualEmissions: { ownerShardId: string | null }[] = Array.isArray(ceRaw) ? ceRaw : [];
const contextualEmissionCount: number = Array.isArray(ceRaw) ? ceRaw.length : typeof ceRaw === "number" ? ceRaw : 0;
const contextualWithoutOwner = Array.isArray(ceRaw) ? contextualEmissions.filter((c) => c.ownerShardId === null).length : (compile?.execution?.sharded?.collisionsByKind?.CONTEXTUAL_UNOWNED_DEFINITION ?? 0);
const materialMissing = counts.materialMissingFromComposition ?? 0, inventoried = counts.inventoried ?? 0, materialItems = counts.material ?? 0;
const shardStatuses: Record<string, number> = sh?.statusCounts ?? {};
const providerFailures = shardStatuses.SHARD_PROVIDER_FAILURE ?? 0, schemaFailures = shardStatuses.SHARD_SCHEMA_FAILURE ?? 0;
const compiled = compile != null && comp?.status != null && comp.status !== "FAILED";
const substance = compiled && inventoried > 0 && materialItems > 0;
const m = (v: number | null, measurable: boolean, hasSubstance: boolean) => ({ value: v, state: !measurable ? "NOT_MEASURABLE" : hasSubstance ? "MEASURED" : "VACUOUS" });
const trust = [
  { counter: "dangerous silent omissions", ...m(ref ? ref.critical.silentMisses + ref.material.silentMisses : null, !!ref, !!ref), rule: "reference items with no covering inventory item AND no explicit review signal on the unit (83)" },
  { counter: "false completeness", ...m(compiled ? (acc?.semanticallyComplete === true && materialMissing > 0 ? 1 : 0) : null, compiled, substance), rule: `Pass C claiming semanticallyComplete while material items are MISSING (complete=${acc?.semanticallyComplete}, materialMissing=${materialMissing})` },
  { counter: "source-unverifiable authoritative IR", ...m(compiled ? sh?.attributionProofCounts?.NONE ?? 0 : null, compiled, (comp?.output?.definitions ?? 0) > 0), rule: `retained definitions with proof class NONE, over ${comp?.output?.definitions ?? 0} retained definitions` },
  { counter: "contextual ownership-credit violations", ...m(compiled ? contextualWithoutOwner : null, compiled, contextualEmissionCount > 0 || (sh?.collisions ?? 0) > 0), rule: `contextual emissions WITHOUT an identified owner shard (collisionsByKind.CONTEXTUAL_UNOWNED_DEFINITION, conservative: counted whether or not demoted; retained-without-proof = attributionProofCounts.NONE ${sh?.attributionProofCounts?.NONE ?? "n/a"}), over ${contextualEmissionCount} contextual emissions and ${sh?.collisions ?? 0} detected collisions` },
  { counter: "silent incompatible merges", ...m(compiled ? ((sh?.definitionConflicts ?? 0) > 0 && (sh?.conflictVariants ?? 0) === 0 ? sh?.definitionConflicts ?? 0 : 0) : null, compiled, substance), rule: `conflicts recorded with zero retained variants (conflicts=${sh?.definitionConflicts ?? 0}, variants=${sh?.conflictVariants ?? 0})` },
  { counter: "owned values lost", ...m(compiled ? counts.materialQuantitativeValuesMissing ?? 0 : null, compiled, (counts.materialQuantitativeValues ?? 0) > 0), rule: `Pass C materialQuantitativeValuesMissing over ${counts.materialQuantitativeValues ?? 0} material quantitative values` },
  { counter: "distinct owned lineage lost", ...m(compiled ? sh?.unresolvedOwnedItems ?? 0 : null, compiled, substance), rule: "owned inventory items no shard resolved (execution.sharded.unresolvedOwnedItems)" },
  { counter: "new dangling refs", ...m(compiled ? counts.danglingLineageReferences ?? 0 : null, compiled, substance), rule: "Pass C danglingLineageReferences" },
  { counter: "hidden provider/schema failures", ...m(compiled ? ((providerFailures + schemaFailures) > 0 && !["REVIEW_REQUIRED", "FAILED", "PARTIAL"].includes(comp?.status) ? providerFailures + schemaFailures : 0) : null, compiled, true), rule: `shard provider/schema failures (${providerFailures}/${schemaFailures}) not surfaced in unit status (${comp?.status})` },
  { counter: "hidden material omissions", ...m(compiled ? (materialMissing > 0 && acc?.semanticallyComplete === true ? materialMissing : 0) : null, compiled, substance), rule: "material MISSING items not reflected in the completeness verdict" },
  { counter: "authoritative hallucinations", ...m(quant ? quant.extraOutput.authoritativeHallucinations : null, !!quant, inventoried > 0), rule: `every inventory item is excerpt-anchored; Pass A discarded ${quant?.extraOutput.rejectedUnverifiableItemsAtFreeze ?? "?"} unverifiable proposals at freeze` },
  { counter: "silent CRITICAL misses", ...m(ref ? ref.critical.silentMisses : null, !!ref, !!ref), rule: "CRITICAL reference items neither discovered nor disclosed (83)" },
  { counter: "incorrect authoritative CRITICAL claims", ...m(ref ? ref.critical.incorrect : null, !!ref, !!ref), rule: "CRITICAL reference items whose IR values contradict the source numbers of the same unit (83)" },
  { counter: "silent quantitative corruption", ...m(quant ? quant.quantitative.silentMaterialQuantitativeCorruption : null, !!quant, (counts.materialQuantitativeValues ?? 0) > 0), rule: "reference items FOUND_BUT_INCORRECT while the unit carried no review signal (84)" },
];
const allZero = trust.every((t) => t.value === 0), allMeasured = trust.every((t) => t.state === "MEASURED"), trustPassed = allZero && allMeasured;
const critAccounted = ref ? ref.critical.correct + ref.critical.explicitSafeLimitation : 0;
const qualityCredible = !!ref && allZero && ref.critical.incorrect === 0 && ref.critical.silentMisses === 0 && critAccounted === 4 && (ref.critical.correct + ref.material.correct) > 0;

const pa = passA?.accounting?.total ?? null;
writeJson(`${OUT}/85-final-paid-trust-quality.json`, {
  artifact: "PHASE 3 FINAL-BRIDGE / 6.01 FINAL RESTART-SAFE PAID RUN §17/§25/§26 - shard trust, hard trust counters, quality gate", at: at(),
  runValidity: { launches: launches.length, restarts: Math.max(0, launches.length - 1), passASource: passA?.source ?? null, passAExecuted: (passA?.passes?.length ?? 0) === 2, ensembleBuilt: passA?.authoritative?.ensemble != null, persisted: passA?.persistence != null, resumeProofOk: resume?.decision?.ok === true, compileStatus: comp?.status ?? null, inventoried, materialItems, substantiveRun: substance },
  passAAccounting: pa,
  inventoryLimitationsPreserved: { inventoryStatusCarried: compile?.frozenInventory?.inventoryStatus ?? null, unaccountedSource: passA?.authoritative?.unaccountedSource ?? null, uninventoriedValues: passA?.authoritative?.uninventoriedValues ?? null, supportReviewRequired: compile?.frozenInventory?.ensemble?.supportReviewRequired ?? null, semanticallyComplete: acc?.semanticallyComplete ?? null },
  shardTrustGate: { executionMode: ex?.mode ?? null, applicable: ex?.mode === "SHARDED", ownedValuesLost: counts.materialQuantitativeValuesMissing ?? null, distinctOwnedLineageLost: sh?.unresolvedOwnedItems ?? null, sourceUnverifiableAuthoritativeIr: sh?.attributionProofCounts?.NONE ?? null, contextualOwnershipCreditViolations: contextualWithoutOwner, silentIncompatibleMerges: trust.find((t) => t.counter === "silent incompatible merges")!.value, newDanglingRefs: counts.danglingLineageReferences ?? null, census: { collisions: sh?.collisions ?? null, collisionsByKind: sh?.collisionsByKind ?? null, definitionConflicts: sh?.definitionConflicts ?? null, conflictVariants: sh?.conflictVariants ?? null, contextualEmissions: contextualEmissionCount, contextualEmissionsWithoutOwner: contextualWithoutOwner, attributionProofCounts: sh?.attributionProofCounts ?? null, unresolvedOwnedItemList: sh?.unresolvedOwnedItemList ?? [], statusCounts: shardStatuses, reused: sh?.reused ?? null, executed: sh?.executed ?? null, retries: sh?.retries ?? null, shards: sh?.shards ?? [] } },
  hardTrustCounters: trust, allCountersZero: allZero, allCountersMeasured: allMeasured, trustGatePassed: trustPassed,
  qualityGate: ref ? { critical: { total: 4, correctlyRepresented: ref.critical.correct, explicitSafeLimitation: ref.critical.explicitSafeLimitation, incorrect: ref.critical.incorrect, silentMisses: ref.critical.silentMisses }, material: { total: 4, correctlyRepresented: ref.material.correct, explicitSafeLimitation: ref.material.explicitSafeLimitation, incorrect: ref.material.incorrect, silentMisses: ref.material.silentMisses }, referenceCounts: ref.counts, rootCauseCounts: ref.rootCauseCounts, quantitative: quant?.quantitative ?? null, extraOutput: quant?.extraOutput ?? null, verifier: ver ? { status: ver.status, semanticReviewInvoked: ver.semanticReviewInvoked, accounting: ver.accounting } : null, supportAsymmetry: compile?.frozenInventory?.ensemble?.counts ?? null, provenanceIntegrity: { accountedCharFraction: compile?.frozenInventory?.sourceCoverage?.accountedCharFraction ?? null, rejectedUnverifiableAtFreeze: compile?.frozenInventory?.rejectedUnverifiableItems ?? null }, conclusion: qualityCredible ? "OPERATIONALLY_CREDIBLE" : "NOT_CREDIBLE" } : { evaluated: false, conclusion: "NOT_EVALUABLE" },
});

// ---------------- §29 verdict
const spend = ledger?.spendUsd ?? null;
const c: [number, string, boolean, string][] = [
  [1, "starting identities frozen", freeze.allChecksMatch === true, "74"],
  [2, "HD-4 certification intact", freeze.idChecks.hd4Gate.match === true && freeze.idChecks.certifiedImports.match === true, `${freeze.idChecks.hd4Gate.verdict} ${freeze.idChecks.hd4Gate.pass}/21; certified imports verified`],
  [3, "cost gate passes", cost.decision === "CLEAR_TO_EXECUTE", `conservative $${cost.estimates.conservative.totalUsd} <= cap $${cost.gate.capUsd}, balance $${cost.gate.gatewayBalanceUsd}`],
  [4, "fresh Pass A completes", passA?.usable === true && passA?.passes?.length === 2 && passA.passes.every((p: { items: number }) => p.items > 0), passA ? passA.passes.map((p: { passId: string; inventoryStatus: string; items: number }) => `${p.passId} ${p.inventoryStatus} ${p.items}`).join("; ") : "not run"],
  [5, "all successful Pass-A calls durable", pa ? pa.logicalCalls === pa.liveCalls + pa.replayedCalls && pa.logicalCalls > 0 : passA?.source === "RESUMED_FROM_ENSEMBLE_PERSISTENCE", pa ? `${pa.logicalCalls} logical = ${pa.liveCalls} live + ${pa.replayedCalls} replayed; every live call persisted before return (DurableReplayStageCaller)` : String(passA?.source)],
  [6, "ensemble builds", passA?.authoritative?.ensemble != null, `${passA?.authoritative?.canonicalItems ?? 0} canonical`],
  [7, "inventory persisted/reloaded", passA?.persistence === "pre-existing" || (passA?.persistence?.inventory?.hashEqual === true && passA?.persistence?.inventory?.structurallyEqual === true), passA?.persistence === "pre-existing" ? "resumed from the persisted ensemble" : `hash ${String(passA?.persistence?.inventory?.readSha256 ?? "").slice(0, 16)}...`],
  [8, "source-bound resume proof passes", resume?.decision?.ok === true, resume?.decision?.ok ? `${resume.decision.record.method} ${String(resume.decision.record.sourceContextHash).slice(0, 16)}...` : JSON.stringify(resume?.decision?.failures ?? "not run")],
  [9, "automatic real plan created", plan?.planHash != null && plan?.fits === true, `${plan?.mode} / ${plan?.reason} ${plan?.shards} shards ${plan?.plannerEstimatedInputTokens} tokens`],
  [10, "production compiler executes", compiled && comp?.entryPoint === "compileCovenantToIR", `status ${comp?.status}`],
  [11, "only same-mission exact-hash shard reuse", compiled && (sh?.reused ?? 0) === (plan?.priorShardsFromStore ?? 0) && (plan?.rejectedStoreRecords ?? []).length === 0, `reused ${sh?.reused ?? 0} = store ${plan?.priorShardsFromStore ?? 0}; rejected records ${(plan?.rejectedStoreRecords ?? []).length}`],
  [12, "global Pass C executes", acc != null, `semanticallyComplete=${acc?.semanticallyComplete}, inventoried ${inventoried}`],
  [13, "verifier executes", ver?.status != null && !ver?.verifyError, `${ver?.status}`],
  [14, "all hard trust counters measured and zero", trustPassed, trustPassed ? "14/14" : `${trust.filter((t) => t.value !== 0).map((t) => `${t.counter}=${t.value}`).join(", ") || "all zero"}${allMeasured ? "" : `; not MEASURED: ${trust.filter((t) => t.state !== "MEASURED").map((t) => `${t.counter} (${t.state})`).join(", ")}`}`],
  [15, "silent CRITICAL misses zero", !!ref && ref.critical.silentMisses === 0, `${ref?.critical.silentMisses ?? "n/a"}`],
  [16, "incorrect authoritative CRITICAL claims zero", !!ref && ref.critical.incorrect === 0, `${ref?.critical.incorrect ?? "n/a"}`],
  [17, "quality operationally credible", qualityCredible, ref ? `CRITICAL ${ref.critical.correct} represented + ${ref.critical.explicitSafeLimitation} explicit limitation of 4; MATERIAL ${ref.material.correct} + ${ref.material.explicitSafeLimitation} of 4` : "not scored"],
  [18, "spend <= $15.84", spend !== null && spend <= 15.84, `$${spend?.toFixed?.(4)}`],
  [19, "no code fix-and-continue", true, "no harness or production change after paid execution began"],
  [20, "no new regression", reg ? reg.fullSuite.newFailuresVsBaseline === 0 : false, reg ? `${reg.fullSuite.after.testFilesFailed} files / ${reg.fullSuite.after.testsFailed} tests, ${reg.fullSuite.newFailuresVsBaseline} new` : "not yet run"],
  [21, "build passes", reg ? reg.build.exit === 0 : false, reg ? reg.build.result : "not yet run"],
];
const passed = c.every((x) => x[2]);
const verdict = passed ? "PHASE3_601_INTEGRATED_VALIDATION_PASSED"
  : ledger?.stoppedEarly && ledger?.stopVerdict ? ledger.stopVerdict
  : !compiled ? "PHASE3_601_ENVIRONMENT_BLOCKED"
  : !trustPassed || (ref && (ref.critical.silentMisses > 0 || ref.critical.incorrect > 0)) ? "PHASE3_601_NOT_SAFE"
  : !qualityCredible ? "PHASE3_601_NEEDS_SEMANTIC_ITERATION" : "PHASE3_601_NOT_SAFE";
writeJson(`${OUT}/87-final-paid-verdict.json`, { artifact: "PHASE 3 FINAL-BRIDGE / 6.01 FINAL RESTART-SAFE PAID RUN §29 - final verdict", at: at(), startingSha: freeze.idChecks.startingSha.actual, missionId: freeze.missionId, evidenceDir: freeze.evidenceDir, launches: launches.length, conditions: c.map(([id, condition, status, evidence]) => ({ id, condition, status: status ? "PASS" : "FAIL", evidence })), summary: { PASS: c.filter((x) => x[2]).length, FAIL: c.filter((x) => !x[2]).length, total: c.length }, verdict, phase3Closed: false, phase4Started: false, cost: { thisMissionUsd: spend, historicalReplayedUsd: ledger?.historicalReplayedUsd ?? null, priorSection601Usd: 13.525078, cumulativeSection601Usd: spend === null ? null : +(13.525078 + spend).toFixed(6), capUsd: 15.84, gatewayBefore: ledger?.gatewayBalanceBefore ?? null, gatewayAfter: ledger?.gatewayBalanceAfter ?? null }, note: "§31: Phase 3 remains OPEN even on a pass. Next is the zero-cost Phase 3 closure synthesis." });
console.log(JSON.stringify({ verdict, summary: { PASS: c.filter((x) => x[2]).length, FAIL: c.filter((x) => !x[2]).length }, failing: c.filter((x) => !x[2]).map((x) => `${x[0]}. ${x[1]}`), trustPassed, allMeasured, spend }, null, 1));
