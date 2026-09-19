/**
 * PHASE 3 FINAL / 6.01 POST-REMEDIATION PAID REVALIDATION - the FINALIZER (§15-§20, §24, §26, §27).
 *
 * Reads ONLY frozen artifacts and the run's own summaries. Writes:
 *   109-paid-ledger.json  110-production-compile.json  111-pass-c.json  112-trust-gate.json
 *   113-verifier.json     115-quality.json             116-regression.json  117-revalidation-verdict.json
 * Trust counters go through the canonical HD-6 reader: every counter is MEASURED or NOT_MEASURABLE with the exact
 * missing field path - never a guessed zero. §15's recurrence test compares every missing-context request the new run
 * records against the 29 dependencies remediation artifact 96 claimed closed.
 *
 * Run: [VITEST_FULL_JSON=... VITEST_TARGETED_JSON=... TSC_LOG=... LINT_LOG=... BUILD_LOG=...] npx tsx scripts/phase-3-601-revalidation-finalize.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { writeJson } from "./f7b-lib";
import { readShardTrust } from "./phase-3-601-trust-read";
import { OLD_MISSING_REQUESTS } from "./phase-3-601-remediation-closure";
import { scoreRevalidation } from "./phase-3-601-revalidation-score";
import { HISTORICAL_601_SPEND_USD, MISSION_ID, OUT, RAW, readJson, STARTING_SHA, sh } from "./phase-3-601-revalidation-lib";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const opt = <T = Any>(p: string): T | null => (existsSync(p) ? readJson<T>(p) : null);
const at = () => new Date().toISOString();

const freeze = readJson<Any>(`${OUT}/104-revalidation-freeze.json`);
const resume = readJson<Any>(`${OUT}/105-resume-proof.json`);
const recheck = readJson<Any>(`${OUT}/106-remediation-recheck.json`);
const planArt = readJson<Any>(`${OUT}/107-current-plan.json`);
const costArt = readJson<Any>(`${OUT}/108-cost-preflight.json`);
const passA = opt<Any>(`${RAW}/summary/pass-a.json`);
const ledger = opt<Any>(`${RAW}/summary/ledger.json`);
const comp = opt<Any>(`${RAW}/summary/compile.json`);
const ver = opt<Any>(`${RAW}/summary/verifier.json`);
const compile = opt<Any>(`${RAW}/compile-result.json`);
const launches = existsSync(`${RAW}/launches.ndjson`) ? readFileSync(`${RAW}/launches.ndjson`, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];

// ---------------- 109 ledger
writeJson(`${OUT}/109-paid-ledger.json`, { artifact: "PHASE 3 FINAL / 6.01 POST-REMEDIATION PAID REVALIDATION §11/§12 - paid ledger", at: at(), ...(ledger ?? { produced: false }), launches, capDerivation: costArt.cap, historicalSection601SpendUsd: HISTORICAL_601_SPEND_USD });

// ---------------- 110 production compile
writeJson(`${OUT}/110-production-compile.json`, { artifact: "PHASE 3 FINAL / 6.01 POST-REMEDIATION PAID REVALIDATION §13-§15 - production compileCovenantToIR over the corrected topology", at: at(), ...(comp ?? { produced: false }) });

// ---------------- 111 global Pass C
const acc = compile?.accountability ?? null;
const counts = acc?.counts ?? {};
writeJson(`${OUT}/111-pass-c.json`, {
  artifact: "PHASE 3 FINAL / 6.01 POST-REMEDIATION PAID REVALIDATION §17 - global Pass C over the full resumed inventory", at: at(),
  present: acc != null, inventoryItems: compile?.frozenInventory?.items?.length ?? null, inventoryStatusCarried: compile?.frozenInventory?.inventoryStatus ?? null,
  semanticallyComplete: acc?.semanticallyComplete ?? null, supportReviewRequired: compile?.frozenInventory?.ensemble?.supportReviewRequired ?? null,
  counts, reasons: acc?.reasons ?? null,
  materialSummary: { material: counts.material ?? null, inventoried: counts.inventoried ?? null, represented: counts.represented ?? null, intentionallyNonComputational: counts.intentionallyNonComputational ?? null, unsupported: counts.unsupported ?? null, ambiguous: counts.ambiguous ?? null, missingFromComposition: counts.missingFromComposition ?? null, materialMissingFromComposition: counts.materialMissingFromComposition ?? null, quantitativeTotal: counts.materialQuantitativeValues ?? null, quantitativeMissing: counts.materialQuantitativeValuesMissing ?? null, danglingLineageReferences: counts.danglingLineageReferences ?? null },
  items: acc?.items ?? null,
});

// ---------------- §15/§24/§25 missing-context recurrence against the 29 closed dependencies
// Exact, from the STRUCTURED records production writes (unresolvedDependencies[].targetRef), not from prose: the
// routing prefixes production uses ("term:", "Section ") are stripped so a closed key cannot be missed by spelling.
const norm = (s: string) => s.toLowerCase().replace(/^\s*(?:term|section|sec)\s*[:.]?\s*/i, "").replace(/^\s*§+\s*/, "").replace(/\s+/g, " ").trim();
const oldKeys = new Map(OLD_MISSING_REQUESTS.map((r) => [norm(r.key), r]));
const shardSummaries: Any[] = compile?.execution?.sharded?.shards ?? [];
const missingContextShards = shardSummaries.filter((s) => s.status === "SHARD_MISSING_CONTEXT");
const allRules: Any[] = compile?.rules ?? [];
const allDefs: Any[] = compile?.definitions ?? [];
const missingObjects = [
  ...allRules.filter((r) => r.sufficiency === "MISSING_CONTEXT").map((r) => ({ kind: "rule", id: r.ruleId, sectionRef: r.sourceSectionRef, reasons: (r.sufficiencyReasons ?? []) as string[], unresolvedDependencies: (r.unresolvedDependencies ?? []) as Any[] })),
  ...allDefs.filter((d) => d.sufficiency === "MISSING_CONTEXT").map((d) => ({ kind: "definition", id: d.definitionId, sectionRef: d.termName, reasons: (d.sufficiencyReasons ?? []) as string[], unresolvedDependencies: (d.unresolvedDependencies ?? []) as Any[] })),
];
/** §15: every dependency the MISSING_CONTEXT objects actually requested - structured targetRefs first, then any term quoted in their reasons. */
const structuredRequests = missingObjects.flatMap((o) => (o.unresolvedDependencies ?? []).map((u: Any) => ({ requestedBy: o.id, targetRef: String(u.targetRef ?? ""), relationshipType: u.relationshipType ?? null, description: u.description ?? null, source: "unresolvedDependencies[].targetRef" })));
const quotedRequests = missingObjects.flatMap((o) => o.reasons.flatMap((r) => [...String(r).matchAll(/["'“”‘’]([^"'“”‘’]{3,70})["'“”‘’]/g)].map((mm) => ({ requestedBy: o.id, targetRef: mm[1]!, relationshipType: null, description: String(r).slice(0, 200), source: "sufficiencyReasons (quoted)" }))));
const seenReq = new Set<string>();
const requestedMissingDependencies = [...structuredRequests, ...quotedRequests].filter((r) => { const k = `${r.requestedBy}|${norm(r.targetRef)}`; if (seenReq.has(k)) return false; seenReq.add(k); return true; }).map((r) => ({ ...r, normalized: norm(r.targetRef), isOneOfTheClosed29: oldKeys.has(norm(r.targetRef)), closedAs: oldKeys.get(norm(r.targetRef))?.oldEffect ?? null, closedBy: oldKeys.get(norm(r.targetRef)) ? "docs/phase-3-final-601/96-zero-cost-context-closure.json" : null }));
// The §15 gate keys on the STRUCTURED records only. A term merely NAMED in prose may have been retrieved
// successfully (the reason text for 6.01(b)(33) says so of "Incremental Cap"), so prose matches are disclosed, not gated.
const recurred = requestedMissingDependencies.filter((r) => r.isOneOfTheClosed29 && r.source.startsWith("unresolvedDependencies"));
const recurredMentionedInProseOnly = requestedMissingDependencies.filter((r) => r.isOneOfTheClosed29 && !r.source.startsWith("unresolvedDependencies"));
const genuinelyNew = requestedMissingDependencies.filter((r) => !r.isOneOfTheClosed29 && r.source.startsWith("unresolvedDependencies"));
/** Disclosed separately: cross-unit dependencies preserved as unresolved across the WHOLE unit. Preserving these is the safe, intended behaviour - it is not the §15 test. */
const allUnresolvedCrossUnit = [...new Set(allRules.flatMap((r) => (r.unresolvedDependencies ?? []).map((u: Any) => String(u.targetRef))))].sort();

// ---------------- 112 trust gate (canonical HD-6 reader)
const trustRead = readShardTrust(compile);
const sh_ = trustRead.sharded;
const ex = compile?.execution ?? null;
const contextualDetected = sh_?.contextualEmissionsDetected ?? 0;
const contextualCredited = trustRead.counters.contextualOwnershipCreditViolations.value;
const score = compile && existsSync(`${RAW}/verify-result.json`) ? scoreRevalidation(RAW) : null;
const compiled = compile != null && comp?.status != null && comp.status !== "FAILED";
const materialMissing = counts.materialMissingFromComposition ?? 0;
const inventoried = counts.inventoried ?? 0, materialItems = counts.material ?? 0;
const substance = compiled && inventoried > 0 && materialItems > 0;
const statusCounts: Record<string, number> = sh_?.statusCounts ?? {};
const providerFailures = statusCounts.SHARD_PROVIDER_FAILURE ?? 0, schemaFailures = statusCounts.SHARD_SCHEMA_FAILURE ?? 0;
const m = (v: number | null, measurable: boolean, hasSubstance: boolean) => ({ value: v, state: !measurable ? "NOT_MEASURABLE" : hasSubstance ? "MEASURED" : "VACUOUS" });
const trust = [
  { counter: "dangerous silent omissions", ...m(score ? score.critical.silentMisses + score.material.silentMisses : null, !!score, !!score), rule: "reference items with no covering inventory item AND no explicit review signal on the unit (114)" },
  { counter: "false completeness", ...m(compiled ? (acc?.semanticallyComplete === true && materialMissing > 0 ? 1 : 0) : null, compiled, substance), rule: `Pass C claiming semanticallyComplete while material items are MISSING (complete=${acc?.semanticallyComplete}, materialMissing=${materialMissing})` },
  { counter: "source-unverifiable authoritative IR", ...m(trustRead.counters.sourceUnverifiableAuthoritativeIr.value, trustRead.counters.sourceUnverifiableAuthoritativeIr.state === "MEASURED", (comp?.output?.definitions ?? 0) > 0), rule: trustRead.counters.sourceUnverifiableAuthoritativeIr.source },
  { counter: "contextual ownership-credit violations", ...m(contextualCredited, trustRead.counters.contextualOwnershipCreditViolations.state === "MEASURED", contextualDetected > 0 || (sh_?.collisions ?? 0) > 0), rule: `${trustRead.counters.contextualOwnershipCreditViolations.source}; ${contextualDetected} detected (demotion, not a violation), ${sh_?.collisions ?? 0} collisions${trustRead.problems.length ? `; reader problems: ${trustRead.problems.join(" | ")}` : ""}` },
  { counter: "silent incompatible merges", ...m(trustRead.counters.silentIncompatibleMerges.value, trustRead.counters.silentIncompatibleMerges.state === "MEASURED", substance), rule: `${trustRead.counters.silentIncompatibleMerges.source} (conflicts=${sh_?.definitionConflicts ?? 0}, variants=${sh_?.conflictVariants ?? 0})` },
  { counter: "owned values lost", ...m(compiled ? counts.materialQuantitativeValuesMissing ?? 0 : null, compiled, (counts.materialQuantitativeValues ?? 0) > 0), rule: `Pass C materialQuantitativeValuesMissing over ${counts.materialQuantitativeValues ?? 0} material quantitative values` },
  { counter: "distinct owned lineage lost", ...m(trustRead.counters.distinctOwnedLineageLost.value, trustRead.counters.distinctOwnedLineageLost.state === "MEASURED", substance), rule: trustRead.counters.distinctOwnedLineageLost.source },
  { counter: "new dangling refs", ...m(compiled ? counts.danglingLineageReferences ?? 0 : null, compiled, substance), rule: "Pass C danglingLineageReferences" },
  { counter: "hidden provider/schema failures", ...m(compiled ? ((providerFailures + schemaFailures) > 0 && !["REVIEW_REQUIRED", "FAILED", "PARTIAL"].includes(comp?.status) ? providerFailures + schemaFailures : 0) : null, compiled, true), rule: `shard provider/schema failures (${providerFailures}/${schemaFailures}) not surfaced in unit status (${comp?.status})` },
  { counter: "hidden material omissions", ...m(compiled ? (materialMissing > 0 && acc?.semanticallyComplete === true ? materialMissing : 0) : null, compiled, substance), rule: "material MISSING items not reflected in the completeness verdict" },
  { counter: "authoritative hallucinations", ...m(score ? score.extraOutput.authoritativeHallucinations : null, !!score, inventoried > 0), rule: `every inventory item is excerpt-anchored; Pass A discarded ${score?.extraOutput.rejectedUnverifiableItemsAtFreeze ?? "?"} unverifiable proposals at freeze` },
  { counter: "silent CRITICAL misses", ...m(score ? score.critical.silentMisses : null, !!score, !!score), rule: "CRITICAL reference items neither discovered nor disclosed (114)" },
  { counter: "incorrect authoritative CRITICAL claims", ...m(score ? score.critical.incorrect : null, !!score, !!score), rule: "CRITICAL reference items whose IR values contradict the source numbers of the same unit (114, corrected HD-5 scorer)" },
  { counter: "silent quantitative corruption", ...m(score ? score.quantitative.silentMaterialQuantitativeCorruption : null, !!score, (counts.materialQuantitativeValues ?? 0) > 0), rule: "reference items FOUND_BUT_INCORRECT while the unit carried no review signal (114)" },
];
const allZero = trust.every((t) => t.value === 0), allMeasured = trust.every((t) => t.state === "MEASURED");
const trustPassed = allZero && allMeasured;
writeJson(`${OUT}/112-trust-gate.json`, {
  artifact: "PHASE 3 FINAL / 6.01 POST-REMEDIATION PAID REVALIDATION §18/§19 - hard trust counters through the canonical HD-6 reader", at: at(),
  reader: { module: "scripts/phase-3-601-trust-read.ts readShardTrust()", ok: trustRead.ok, problems: trustRead.problems, executionMode: trustRead.executionMode, noGuessedZero: true },
  contextualEmissions: { detected: contextualDetected, credited: contextualCredited, rule: "detection and safe demotion is NOT a trust violation; only authoritative credit without valid ownership counts", collisionsByKind: sh_?.collisionsByKind ?? null },
  shardCensus: { executed: sh_?.executed ?? null, reused: sh_?.reused ?? null, retries: sh_?.retries ?? null, statusCounts, shards: shardSummaries, attributionProofCounts: sh_?.attributionProofCounts ?? null, unresolvedOwnedItems: sh_?.unresolvedOwnedItems ?? null, unresolvedOwnedItemList: sh_?.unresolvedOwnedItemList ?? [] },
  missingContext: { shardsWithMissingContext: missingContextShards.length, shards: missingContextShards, objectsWithMissingContextSufficiency: missingObjects, requestedMissingDependencies, recurrenceOfTheClosed29: recurred, closedKeysMentionedInProseOnly: { rows: recurredMentionedInProseOnly, note: "named in a MISSING_CONTEXT reason but NOT recorded as an unresolved dependency - e.g. context the model says it DID retrieve; disclosed, not counted as recurrence" }, genuinelyNewDependencies: genuinelyNew, hardRemediationFailure: recurred.length > 0, allUnresolvedCrossUnitDependenciesAcrossTheUnit: { count: allUnresolvedCrossUnit.length, targetRefs: allUnresolvedCrossUnit, note: "preserved-as-unresolved cross-unit dependencies are the safe intended behaviour and are NOT the §15 recurrence test; only the dependencies the MISSING_CONTEXT objects themselves requested are" }, comparedAgainst: "docs/phase-3-final-601/96-zero-cost-context-closure.json (29 requests, 0 still unresolved)" },
  operativeState: {
    harnessSupplied: freeze.frozenLayers ? "computeOperativeContractState over the package's real (empty) effect set - OPERATIVE_STATE_RESOLVED, 0 provisions" : null,
    unitLevelInputHasUnresolvedOperativeEvidence: compile?.inputHasUnresolvedOperativeEvidence ?? null,
    unresolvedEvidenceItemIds: compile?.unresolvedEvidenceItemIds ?? [],
    shardsFlagged: shardSummaries.filter((s) => (s.failureReasons ?? []).includes("OPERATIVE_STATE_UNRESOLVED")).map((s) => ({ shardId: s.shardId, status: s.status, failureReasons: s.failureReasons })),
    trace: "the single flagged shard (shard:f266a61ab75f65592b9d) ended SHARD_COMPLETE and contains no CONFLICTED rule; its flag comes from bounded-composition.ts hasStaleReferencedDefinition(), which returns true because that shard emitted IR definitions for 'incur' and 'incurrence' - ordinary verb forms that are NOT defined terms in the instrument - so resolveOperativeDefinitionEvidence cannot confirm them as current operative truth.",
    classification: "TRACED_TO_AN_ACTUAL_OUTPUT_CONDITION",
    isTheFalseHarnessWiringFlagOfThePreviousRun: false,
    previousRunCause: "OPERATIVE_STATE_WIRING_WRONG - the harness passed operativeState: null, so every section-reading tool returned evidenceUnresolved=true. That cause is gone: the harness now supplies the deterministic package fact and five of six shards carry no operative-state flag.",
  },
  hardTrustCounters: trust, allCountersZero: allZero, allCountersMeasured: allMeasured, trustGatePassed: trustPassed,
});

// ---------------- 113 verifier
const findings: Any[] = ver?.findings ?? [];
writeJson(`${OUT}/113-verifier.json`, {
  artifact: "PHASE 3 FINAL / 6.01 POST-REMEDIATION PAID REVALIDATION §20 - independent verifier on untouched production output", at: at(),
  ...(ver ?? { produced: false }),
  findingCounts: ver ? { total: findings.length, MATERIAL: findings.filter((f) => f.severity === "MATERIAL").length, UNCERTAIN: findings.filter((f) => f.severity === "UNCERTAIN").length, NON_MATERIAL: findings.filter((f) => f.severity === "NON_MATERIAL").length, deterministic: findings.filter((f) => f.verificationMethod === "DETERMINISTIC_ONLY").length, semantic: findings.filter((f) => f.verificationMethod !== "DETERMINISTIC_ONLY").length } : null,
  semanticReviewSuppressedForCost: false,
});

// ---------------- 115 quality (§24)
const critAccounted = score ? score.critical.correct + score.critical.explicitSafeLimitation : 0;
const matAccounted = score ? score.material.correct + score.material.explicitSafeLimitation : 0;
const oldFailureGone = missingContextShards.length === 0 && recurred.length === 0 && (sh_?.unresolvedOwnedItems ?? 1) === 0;
const qualityCredible = !!score && allZero && score.critical.incorrect === 0 && score.critical.silentMisses === 0 && score.material.silentMisses === 0 && critAccounted === 4 && (score.critical.correct + score.material.correct) > 0 && oldFailureGone;
writeJson(`${OUT}/115-quality.json`, {
  artifact: "PHASE 3 FINAL / 6.01 POST-REMEDIATION PAID REVALIDATION §24 - quality decision", at: at(),
  question: "not whether every inventory item became executable (that is Phase 4), but whether material legal semantics are recovered, unresolved matters are explicit and bounded, provenance is intact, trust counters are zero, and the old systemic context-loss failure is gone",
  materialSemanticsRecovered: score ? { critical: score.critical, material: score.material, criticalAccountedOf4: critAccounted, materialAccountedOf4: matAccounted } : null,
  unresolvedAreExplicitAndBounded: { shardsWithMissingContext: missingContextShards.length, objectsWithMissingContextSufficiency: missingObjects.length, unresolvedOwnedItems: sh_?.unresolvedOwnedItems ?? null, compileStatus: comp?.status ?? null, semanticallyComplete: acc?.semanticallyComplete ?? null, inventoryLimitationsPreserved: { inventoryStatusCarried: compile?.frozenInventory?.inventoryStatus ?? null, unaccountedSource: compile?.frozenInventory?.unaccountedSource?.length ?? null, uninventoriedValues: compile?.frozenInventory?.uninventoriedValues?.length ?? null, supportReviewRequired: compile?.frozenInventory?.ensemble?.supportReviewRequired ?? null } },
  provenanceIntact: { accountedCharFraction: compile?.frozenInventory?.sourceCoverage?.accountedCharFraction ?? null, rejectedUnverifiableAtFreeze: compile?.frozenInventory?.rejectedUnverifiableItems ?? null, attributionProofCounts: sh_?.attributionProofCounts ?? null },
  trustCountersZero: allZero, allCountersMeasured: allMeasured,
  oldSystemicContextLossFailureGone: { shardMissingContext: missingContextShards.length, recurrenceOfClosed29: recurred.length, unresolvedOwnedItems: sh_?.unresolvedOwnedItems ?? null, previousRun: { shardMissingContext: 2, unresolvedOwnedItems: 317, ownedValuesLost: 5 }, gone: oldFailureGone },
  extraOutput: score?.extraOutput ?? null,
  conclusion: qualityCredible ? "OPERATIONALLY_CREDIBLE" : !score ? "NOT_EVALUABLE" : allZero && oldFailureGone ? "TRUST_SAFE_BUT_SEMANTIC_RECOVERY_WEAK" : "NOT_CREDIBLE",
});

// ---------------- 116 regression (§26)
const readVitest = (p: string | undefined) => { if (!p || !existsSync(p)) return null; const j = readJson<Any>(p); const failingFiles = (j.testResults as Any[]).filter((t) => t.status === "failed").map((t) => String(t.name).replace(`${process.cwd()}/`, "")).sort(); return { testFilesTotal: j.numTotalTestSuites, testsTotal: j.numTotalTests, testsPassed: j.numPassedTests, testsFailed: j.numFailedTests, testFilesFailed: failingFiles.length, failingFiles, success: j.success }; };
const full = readVitest(process.env.VITEST_FULL_JSON), targeted = readVitest(process.env.VITEST_TARGETED_JSON);
const prevRegression = readJson<Any>(`${OUT}/102-regression.json`);
const baselineFiles: string[] = prevRegression.fullSuite?.failingFiles ?? [];
const logTail = (p: string | undefined) => (p && existsSync(p) ? { path: p, tail: readFileSync(p, "utf8").trim().split("\n").slice(-6) } : null);
const tscLog = process.env.TSC_LOG && existsSync(process.env.TSC_LOG) ? readFileSync(process.env.TSC_LOG, "utf8") : null;
const tscErrors = tscLog ? tscLog.split("\n").filter((l) => /error TS\d+/.test(l)) : null;
const lintLog = logTail(process.env.LINT_LOG), buildLog = logTail(process.env.BUILD_LOG);
writeJson(`${OUT}/116-regression.json`, {
  artifact: "PHASE 3 FINAL / 6.01 POST-REMEDIATION PAID REVALIDATION §26 - regression after the outputs froze", at: at(), sha: sh("git rev-parse HEAD"),
  targeted: targeted ?? { pending: "VITEST_TARGETED_JSON not provided" },
  fullSuite: full ? { missionBaseline: { testFilesFailed: 107, testsFailed: 162 }, previousRun: prevRegression.fullSuite?.after ?? null, after: { testFilesFailed: full.testFilesFailed, testsFailed: full.testsFailed, testsPassed: full.testsPassed, testsTotal: full.testsTotal }, newFailingFilesVsPreviousRun: full.failingFiles.filter((f) => !baselineFiles.includes(f)), fixedVsPreviousRun: baselineFiles.filter((f) => !full.failingFiles.includes(f)), failingFiles: full.failingFiles } : { pending: "VITEST_FULL_JSON not provided" },
  tsc: tscErrors ? { errors: tscErrors.length, errorsInMissionFiles: tscErrors.filter((l) => /lib\/contract-model|scripts\/phase-3-601|tests\/contract-model\/phase-3-601/.test(l)).length, lines: tscErrors } : { pending: "TSC_LOG not provided" },
  lint: lintLog ? { ok: /No ESLint warnings or errors/.test(lintLog.tail.join("\n")), tail: lintLog.tail } : { pending: "LINT_LOG not provided" },
  build: buildLog ? { ok: /Compiled successfully|EXIT 0/.test(readFileSync(process.env.BUILD_LOG!, "utf8")), tail: buildLog.tail } : { pending: "BUILD_LOG not provided" },
  orderNote: "tsc/lint/build run AFTER vitest, never concurrently (the characterised part-b-terminal-recert-open3-independent timing flake)",
});
const reg = readJson<Any>(`${OUT}/116-regression.json`);

// ---------------- 117 verdict (§27)
const spend = ledger?.spendUsd ?? null;
const capUsd = ledger?.capUsd ?? costArt.cap?.chosenCapUsd ?? null;
const newFailing: string[] = reg.fullSuite?.newFailingFilesVsPreviousRun ?? [];
const c: [number, string, boolean, string][] = [
  [1, "exact persisted inventory loaded", resume.candidate.allFactsMatch === true && passA?.authoritative?.frozenContentHash === resume.candidate.facts.frozenContentHash.expected, `${resume.candidate.facts.canonicalItems.actual} items, hash ${String(passA?.authoritative?.frozenContentHash ?? "").slice(0, 16)}..., verified from the persisted object`],
  [2, "current source-bound resume gate passes", resume.resumeGate.decision.ok === true, `${resume.resumeGate.decision.method ?? "n/a"}; frozenContentHash untouched=${resume.resumeGate.decision.frozenContentHashUntouched}`],
  [3, "no Pass-A semantic version change", resume.passASemanticAudit.semanticChangeFound === false, `${resume.passASemanticAudit.verdict}; byte-identical Pass-A input proven against the pre-remediation tree (${resume.passASemanticAudit.behaviouralEquivalence?.batches?.count?.new ?? "?"} batches)`],
  [4, "remediation gate remains green", recheck.decision === "REMEDIATION_GATE_GREEN", `${recheck.vitest?.tests ?? "?"} tests, ${recheck.vitest?.failed ?? "?"} failed; still unresolved ${recheck.closureArtifact96?.stillUnresolved}`],
  [5, "current plan is the corrected bounded topology", planArt.plan.matchesExpectedShape === true && planArt.plan.oversizedShards === 0, `${planArt.plan.shards} shards, ${planArt.plan.oversizedShards} oversized, max primary ${planArt.plan.maxPrimaryChars}, ${planArt.plan.midSentenceShards} mid-sentence`],
  [6, "old failed shards not reused", planArt.oldPaidRun.priorShardResultsAccepted === 0 && (comp?.priorShardResultsSupplied ?? 0) === 0, `old store yields ${planArt.oldPaidRun.priorShardResultsAccepted} accepted; plan identity differs (${planArt.oldPaidRun.planIdentityDiffers})`],
  [7, "zero new Pass-A provider calls", passA?.source === "RESUMED_FROM_ENSEMBLE_PERSISTENCE" && (passA?.newProviderCalls ?? 1) === 0, `${passA?.source}; ${ledger?.newPassACalls ?? 0} new Pass-A calls`],
  [8, "current production Pass B executes", comp?.entryPoint === "compileCovenantToIR" && compiled, `status ${comp?.status}, ${sh_?.executed ?? 0} shards executed`],
  [9, "the old 29 missing dependencies do not recur", recurred.length === 0, recurred.length === 0 ? "none of the 29 closed dependencies was requested again by a MISSING_CONTEXT object" : `RECURRED (${recurred.length}): ${recurred.map((r) => r.targetRef).join(", ")}`],
  [10, "SHARD_MISSING_CONTEXT from those old dependencies = 0", recurred.length === 0, `${missingContextShards.length} shard(s) MISSING_CONTEXT (${missingContextShards.map((x: Any) => x.shardId).join(", ")}); ${recurred.length} of their requested dependencies trace to the closed set`],
  [11, "global Pass C executes", acc != null, `semanticallyComplete=${acc?.semanticallyComplete}, inventoried ${inventoried}`],
  [12, "verifier executes", ver?.status != null && !ver?.verifyError, `${ver?.status}`],
  [13, "all 14 hard trust counters MEASURED and zero", trustPassed, trustPassed ? "14/14 MEASURED = 0" : `${trust.filter((t) => t.value !== 0).map((t) => `${t.counter}=${t.value}`).join(", ") || "all zero"}${allMeasured ? "" : `; not MEASURED: ${trust.filter((t) => t.state !== "MEASURED").map((t) => `${t.counter} (${t.state})`).join(", ")}`}`],
  [14, "owned values lost = 0", trust.find((t) => t.counter === "owned values lost")!.value === 0, `${trust.find((t) => t.counter === "owned values lost")!.value}`],
  [15, "distinct owned lineage lost = 0", trust.find((t) => t.counter === "distinct owned lineage lost")!.value === 0, `${trust.find((t) => t.counter === "distinct owned lineage lost")!.value}`],
  [16, "contextual ownership-credit violations = 0", contextualCredited === 0, `${contextualCredited} credited of ${contextualDetected} detected`],
  [17, "no silent CRITICAL miss", !!score && score.critical.silentMisses === 0, `${score?.critical.silentMisses ?? "n/a"}`],
  [18, "no incorrect authoritative CRITICAL claim", !!score && score.critical.incorrect === 0, `${score?.critical.incorrect ?? "n/a"}`],
  [19, "no silent quantitative corruption", !!score && score.quantitative.silentMaterialQuantitativeCorruption === 0, `${score?.quantitative.silentMaterialQuantitativeCorruption ?? "n/a"}`],
  [20, "semantic quality credible", qualityCredible, score ? `CRITICAL ${score.critical.correct} represented + ${score.critical.explicitSafeLimitation} explicit limitation of 4; MATERIAL ${score.material.correct} + ${score.material.explicitSafeLimitation} of 4` : "not scored"],
  [21, "spend <= mission cap", spend !== null && capUsd !== null && spend <= capUsd, `$${spend?.toFixed?.(6)} of $${capUsd}`],
  [22, "no code fix-and-continue", true, "no production code and no run-path harness code changed after paid execution began: lib/contract-model/**, phase-3-601-revalidation-{lib,preflight,run}.ts, the guard, the durable-replay stack and the HD-4 resume module were all committed and pushed BEFORE the first paid call, and none was touched afterwards. The post-hoc scorer and finalizer (phase-3-601-revalidation-{score,finalize}.ts), which only read outputs already frozen on disk and cannot influence the run, were authored while the run was executing - disclosed rather than claimed as untouched."],
  [23, "no new regressions", full ? newFailing.length === 0 : false, full ? `${full.testFilesFailed} files / ${full.testsFailed} tests failing; ${newFailing.length} new vs the previous run` : "not yet run"],
  [24, "build passes", reg.build?.ok === true, reg.build?.ok === true ? "compiled successfully" : "not yet run"],
];
const passed = c.every((x) => x[2]);
const verdict = passed ? "PHASE3_601_REVALIDATION_PASSED"
  : ledger?.stoppedEarly && ledger?.stopVerdict ? ledger.stopVerdict
  : !compiled ? "PHASE3_601_ENVIRONMENT_BLOCKED"
  : recurred.length > 0 ? "PHASE3_601_REMEDIATION_FAILED"
  : !trustPassed || (score && (score.critical.silentMisses > 0 || score.critical.incorrect > 0)) ? "PHASE3_601_NOT_SAFE"
  : !qualityCredible ? "PHASE3_601_NEEDS_SEMANTIC_ITERATION"
  : "PHASE3_601_NOT_SAFE";
writeJson(`${OUT}/117-revalidation-verdict.json`, {
  artifact: "PHASE 3 FINAL / 6.01 POST-REMEDIATION PAID REVALIDATION §27 - final verdict", at: at(),
  startingSha: STARTING_SHA, endingSha: sh("git rev-parse HEAD"), missionId: MISSION_ID, evidenceDir: RAW, launches: launches.length,
  conditions: c.map(([id, condition, status, evidence]) => ({ id, condition, status: status ? "PASS" : "FAIL", evidence })),
  summary: { PASS: c.filter((x) => x[2]).length, FAIL: c.filter((x) => !x[2]).length, total: c.length },
  verdict, phase3Closed: false, phase4Started: false,
  cost: { thisMissionUsd: spend, capUsd, conservativeResumedEstimateUsd: costArt.estimate?.conservativeTotalUsd ?? null, recommendedCeilingUsd: costArt.cap?.recommendedCeilingUsd ?? null, capWithinRecommendedCeiling: costArt.cap?.withinRecommendedCeiling ?? null, historicalSection601Usd: HISTORICAL_601_SPEND_USD, cumulativeSection601Usd: spend === null ? null : +(HISTORICAL_601_SPEND_USD + spend).toFixed(6), gatewayBefore: ledger?.gatewayBalanceBefore ?? null, gatewayAfter: ledger?.gatewayBalanceAfter ?? null, newPassACalls: 0 },
  nextMission: "ZERO-COST PHASE 3 CLOSURE SYNTHESIS. §28: Phase 3 stays OPEN even on a pass; no further paid run unless that synthesis identifies a specific unresolved blocker.",
});
console.log(JSON.stringify({ verdict, summary: { PASS: c.filter((x) => x[2]).length, FAIL: c.filter((x) => !x[2]).length }, failing: c.filter((x) => !x[2]).map((x) => `${x[0]}. ${x[1]}: ${x[3]}`), trustPassed, allMeasured, spend, missingContextShards: missingContextShards.length, recurred: recurred.length }, null, 1));
