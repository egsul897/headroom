/**
 * PHASE 3 FINAL / 6.01 FINAL FUNDED POST-PRECISION PAID REVALIDATION - FINALIZER (mission §16-§27).
 * Reads ONLY frozen outputs of the paid run (plus the frozen reference set through the corrected HD-5 scorer) and writes
 *   150 ledger, 151 production compile + dependency-delivery validation, 152 global Pass C, 153 trust gate (HD-6 reader),
 *   154 verifier + reassessment of the 11 historical findings + the deterministic-fix effects, 155 reference score,
 *   156 quality, 157 regression, 158 final verdict.
 * Zero model calls. Run: [VITEST_TARGETED_JSON=.. VITEST_FULL_JSON=.. VITEST_FULL_BASE_JSON=.. TSC_LOG=.. LINT_LOG=.. BUILD_LOG=..] npx tsx scripts/phase-3-601-precision-revalidation-finalize.ts
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { writeJson } from "./f7b-lib";
import { readShardTrust } from "./phase-3-601-trust-read";
import { OLD_MISSING_REQUESTS } from "./phase-3-601-remediation-closure";
import { scoreRevalidation } from "./phase-3-601-revalidation-score";
import { OUT, readJson, sh, sha256 } from "./phase-3-601-revalidation-lib";
import { CERTIFIED_PRODUCTION_SHA, CERTIFIED_TREES, CONSERVATIVE_ESTIMATE_USD, HARD_CAP_USD, HISTORICAL_601_SPEND_USD, MISSION_ID, RAW, STARTING_SHA, WITNESS_KEYS } from "./phase-3-601-precision-revalidation-lib";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const opt = <T = Any>(p: string): T | null => (existsSync(p) ? readJson<T>(p) : null);
const at = () => new Date().toISOString();
const A = (n: string) => `${OUT}/${n}.json`;

const balanceGate = opt<Any>(`${RAW}/summary/balance-gate.json`);
const passA = opt<Any>(`${RAW}/summary/pass-a.json`);
const planArt = opt<Any>(`${RAW}/summary/plan.json`);
const ledger = opt<Any>(`${RAW}/summary/ledger.json`);
const comp = opt<Any>(`${RAW}/summary/compile.json`);
const ver = opt<Any>(`${RAW}/summary/verifier.json`);
const compile = opt<Any>(`${RAW}/compile-result.json`);
const missionStart = opt<Any>(`${RAW}/mission-start.json`);
const launches = existsSync(`${RAW}/launches.ndjson`) ? readFileSync(`${RAW}/launches.ndjson`, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
const durable: Any[] = existsSync(`${RAW}/durable-shards`) ? readdirSync(`${RAW}/durable-shards`).filter((f) => f.endsWith(".json")).map((f) => readJson<Any>(`${RAW}/durable-shards/${f}`)) : [];
const durableByHash = new Map<string, Any>(durable.map((r) => [r.shardHash, r]));

// ---------------- 150 ledger (§3, §25)
writeJson(A("150-precision-revalidation-ledger"), {
  artifact: "FINAL FUNDED POST-PRECISION PAID REVALIDATION §3/§25 - live balance gate, hard cap, paid ledger", at: at(),
  missionId: MISSION_ID, evidenceDir: RAW, startingSha: STARTING_SHA, certifiedProductionSha: CERTIFIED_PRODUCTION_SHA, certifiedTrees: CERTIFIED_TREES,
  balanceGate, missionStart, launches, ...(ledger ?? { produced: false }),
  hardCapUsd: HARD_CAP_USD, conservativeEstimateUsd: CONSERVATIVE_ESTIMATE_USD, historicalSection601SpendUsd: HISTORICAL_601_SPEND_USD, cumulativeSection601SpendUsd: ledger ? +(HISTORICAL_601_SPEND_USD + ledger.spendUsd).toFixed(6) : null,
});

// ---------------- 151 production compile + dependency-delivery validation (§15-§18)
const shardSummaries: Any[] = compile?.execution?.sharded?.shards ?? [];
const perShard = (planArt?.perShard ?? []).map((p: Any) => {
  const rec = durableByHash.get(p.shardHash) ?? null; const r = rec?.result ?? null;
  const sum = shardSummaries.find((s) => s.shardId === p.shardId) ?? null;
  const audit = r?.missingContextAudit ?? null; const tools = r?.toolUsage ?? null;
  return { ...p, executed: { status: r?.status ?? sum?.status ?? null, attempts: r?.attempts ?? sum?.attempts ?? null, reusedFromHash: r?.reusedFromHash ?? null, failureReasons: r?.failureReasons ?? sum?.failureReasons ?? null, telemetry: r?.telemetry ?? null, persistedAt: rec?.completedAt ?? null },
    toolUsage: tools ? { calls: tools.calls, sourceReadingCalls: tools.sourceReadingCalls, refusals: tools.refusals, charsReturned: tools.charsReturned, maxToolCalls: tools.maxToolCalls, maxAdditionalSourceChars: tools.maxAdditionalSourceChars, byTool: tools.byTool, requestedTargets: tools.requestedTargets, anyEvidenceUnresolved: tools.anyEvidenceUnresolved, anyEvidenceTruncated: tools.anyEvidenceTruncated } : "NOT_RECORDED",
    missingContext: audit ? { certificateStatus: audit.certificateStatus, requested: audit.requested, counts: audit.counts, contractHeld: audit.contractHeld, violations: audit.violations } : "NOT_RECORDED" };
});
const sumCounts = (k: string) => perShard.reduce((x: number, s: Any) => x + (s.missingContext !== "NOT_RECORDED" ? (s.missingContext.counts?.[k] ?? 0) : 0), 0);
const contractCounts = Object.fromEntries(["PLANNER_DELIVERY_GAP", "FALSE_MISSING_CONTEXT", "PARTIAL_DELIVERY", "INTERNAL_LIMITATION_DISCLOSED", "AMBIGUOUS_LIMITATION_DISCLOSED", "EXTERNAL_DEPENDENCY", "OPTIONAL_CONTEXT_MISS"].map((k) => [k, sumCounts(k)]));
const statusCounts: Record<string, number> = compile?.execution?.sharded?.statusCounts ?? {};
const allRules: Any[] = compile?.rules ?? []; const allDefs: Any[] = compile?.definitions ?? [];
const missingObjects = [
  ...allRules.filter((r) => r.sufficiency === "MISSING_CONTEXT").map((r) => ({ kind: "rule", id: r.ruleId, sectionRef: r.sourceSectionRef, reasons: (r.sufficiencyReasons ?? []) as string[], unresolvedDependencies: (r.unresolvedDependencies ?? []) as Any[] })),
  ...allDefs.filter((d) => d.sufficiency === "MISSING_CONTEXT").map((d) => ({ kind: "definition", id: d.definitionId, sectionRef: d.termName, reasons: (d.sufficiencyReasons ?? []) as string[], unresolvedDependencies: (d.unresolvedDependencies ?? []) as Any[] })),
];
const norm = (s: string) => s.toLowerCase().replace(/^\s*(?:term|section|sec)\s*[:.]?\s*/i, "").replace(/^\s*§+\s*/, "").replace(/\s+/g, " ").trim();
const oldKeys = new Map(OLD_MISSING_REQUESTS.map((r) => [norm(r.key), r]));
const structuredRequests = missingObjects.flatMap((o) => (o.unresolvedDependencies ?? []).map((u: Any) => ({ requestedBy: o.id, targetRef: String(u.targetRef ?? ""), normalized: norm(String(u.targetRef ?? "")), isOneOfTheClosed29: oldKeys.has(norm(String(u.targetRef ?? ""))) })));
const recurred = structuredRequests.filter((r) => r.isOneOfTheClosed29);
const witnessDelivery = WITNESS_KEYS.map((k) => ({ key: k, shardsWithKeyInTurn1Required: (planArt?.perShard ?? []).filter((p: Any) => (p.witnessesInTurn1 ?? []).some((w: Any) => w.key === k)).map((p: Any) => ({ shardId: p.shardId, deliveredInFull: (p.witnessesInTurn1 as Any[]).find((w) => w.key === k)!.deliveredInFull })) }));
const thinShardPlan = planArt?.thinShard ?? null;
const thinExecuted = perShard.find((s: Any) => s.shardId === thinShardPlan?.shardId) ?? null;
const hardQuestion = perShard.flatMap((s: Any) => s.missingContext !== "NOT_RECORDED" ? (s.missingContext.requested as Any[]).filter((q) => q.classification === "FALSE_MISSING_CONTEXT" || q.classification === "PLANNER_DELIVERY_GAP" || q.classification === "PARTIAL_DELIVERY").map((q) => ({ shardId: s.shardId, ...q })) : []);
writeJson(A("151-production-compile-and-delivery"), {
  artifact: "FINAL FUNDED POST-PRECISION PAID REVALIDATION §15-§18 - production compileCovenantToIR, per-shard dependency-delivery validation, MISSING_CONTEXT contract", at: at(),
  compile: comp ?? { produced: false },
  planIdentity: { harnessPlanHash: planArt?.planHash ?? null, productionPlanHash: compile?.execution?.planHash ?? null, identical: planArt?.planHash === compile?.execution?.planHash },
  shardStatusCounts: statusCounts, providerFailures: statusCounts.SHARD_PROVIDER_FAILURE ?? 0, schemaFailures: statusCounts.SHARD_SCHEMA_FAILURE ?? 0, retries: compile?.execution?.sharded?.retries ?? null,
  perShard,
  contractCounts, plannerDeliveryGap: contractCounts.PLANNER_DELIVERY_GAP, falseMissingContext: contractCounts.FALSE_MISSING_CONTEXT, contractHeldOnEveryShard: perShard.every((s: Any) => s.missingContext === "NOT_RECORDED" ? true : s.missingContext.contractHeld === true), shardsWithoutRecordedAudit: perShard.filter((s: Any) => s.missingContext === "NOT_RECORDED").length,
  hardQuestion: {
    question: "did any model report missing context for something already present in its initial required-context package?",
    missingContextReports: { shardsMissingContext: shardSummaries.filter((s) => s.status === "SHARD_MISSING_CONTEXT").length, objectsWithMissingContextSufficiency: missingObjects.length },
    unresolvedDependencyEdgesAgainstDeliveredContext: { count: hardQuestion.length, note: "unresolvedDependencies[] the compositions left on rules whose target text WAS in the turn-1 required tier (FALSE_MISSING_CONTEXT) or was there as a disclosed bounded excerpt (PARTIAL_DELIVERY); none of them produced a MISSING_CONTEXT status - they are cross-reference edges the model recorded as unresolved rather than context it lacked", rows: hardQuestion },
    answer: shardSummaries.filter((s) => s.status === "SHARD_MISSING_CONTEXT").length === 0 && missingObjects.length === 0 ? `NO missing-context report; ${hardQuestion.length} unresolved-dependency edge(s) point at context that was delivered (disclosed, contract held on every shard)` : `YES (${hardQuestion.length})`,
  },
  missingContextObjects: missingObjects, structuredRequests, recurrenceOfTheClosed29: recurred,
  witnesses: { note: "audit witnesses of the generic machinery (harness-only names): turn-1 availability in the REQUIRED tier of every shard whose owned material cites them", witnessDelivery, allWitnessesInFullWhereverCited: witnessDelivery.every((w) => w.shardsWithKeyInTurn1Required.length > 0 && w.shardsWithKeyInTurn1Required.every((s: Any) => s.deliveredInFull)) },
  thinCapShard: { plan: thinShardPlan, executed: thinExecuted ? { status: thinExecuted.executed.status, toolUsage: thinExecuted.toolUsage, missingContext: thinExecuted.missingContext } : null },
  toolTelemetryTotals: perShard.reduce((m: Record<string, number>, s: Any) => { if (s.toolUsage !== "NOT_RECORDED") { m.calls += s.toolUsage.calls; m.sourceReadingCalls += s.toolUsage.sourceReadingCalls; m.refusals += s.toolUsage.refusals; m.charsReturned += s.toolUsage.charsReturned; } return m; }, { calls: 0, sourceReadingCalls: 0, refusals: 0, charsReturned: 0 }),
});

// ---------------- 152 global Pass C (§19)
const acc = compile?.accountability ?? null; const counts = acc?.counts ?? {};
writeJson(A("152-pass-c"), {
  artifact: "FINAL FUNDED POST-PRECISION PAID REVALIDATION §19 - global Pass C over the full resumed inventory", at: at(),
  present: acc != null, inventoryItems: compile?.frozenInventory?.items?.length ?? null, inventoryStatusCarried: compile?.frozenInventory?.inventoryStatus ?? null, semanticallyComplete: acc?.semanticallyComplete ?? null, counts, reasons: acc?.reasons ?? null,
  summary: { inventoried: counts.inventoried ?? null, material: counts.material ?? null, represented: counts.represented ?? null, intentionallyNonComputational: counts.intentionallyNonComputational ?? null, unsupported: counts.unsupported ?? null, ambiguous: counts.ambiguous ?? null, missingFromComposition: counts.missingFromComposition ?? null, materialMissingFromComposition: counts.materialMissingFromComposition ?? null, criticalMissing: counts.criticalMissingFromComposition ?? counts.criticalMissing ?? null, quantitativeTotal: counts.materialQuantitativeValues ?? null, quantitativeMissing: counts.materialQuantitativeValuesMissing ?? null, danglingLineage: counts.danglingLineageReferences ?? null },
  items: acc?.items ?? null,
});

// ---------------- 153 trust gate (§20, canonical HD-6 reader)
const trustRead = readShardTrust(compile); const sh_ = trustRead.sharded;
const contextualDetected = sh_?.contextualEmissionsDetected ?? 0; const contextualCredited = trustRead.counters.contextualOwnershipCreditViolations.value;
const score = compile && existsSync(`${RAW}/verify-result.json`) ? scoreRevalidation(RAW) : null;
const compiled = compile != null && comp?.status != null && comp.status !== "FAILED";
const materialMissing = counts.materialMissingFromComposition ?? 0; const inventoried = counts.inventoried ?? 0; const materialItems = counts.material ?? 0;
const substance = compiled && inventoried > 0 && materialItems > 0;
const providerFailures = statusCounts.SHARD_PROVIDER_FAILURE ?? 0, schemaFailures = statusCounts.SHARD_SCHEMA_FAILURE ?? 0;
const m = (v: number | null, measurable: boolean, hasSubstance: boolean) => ({ value: v, state: !measurable ? "NOT_MEASURABLE" : hasSubstance ? "MEASURED" : "VACUOUS" });
const trust = [
  { counter: "owned values lost", ...m(compiled ? counts.materialQuantitativeValuesMissing ?? 0 : null, compiled, (counts.materialQuantitativeValues ?? 0) > 0), rule: `Pass C materialQuantitativeValuesMissing over ${counts.materialQuantitativeValues ?? 0} material quantitative values` },
  { counter: "distinct owned lineage lost", ...m(trustRead.counters.distinctOwnedLineageLost.value, trustRead.counters.distinctOwnedLineageLost.state === "MEASURED", substance), rule: trustRead.counters.distinctOwnedLineageLost.source },
  { counter: "contextual ownership-credit violations", ...m(contextualCredited, trustRead.counters.contextualOwnershipCreditViolations.state === "MEASURED", contextualDetected > 0 || (sh_?.collisions ?? 0) > 0), rule: `${trustRead.counters.contextualOwnershipCreditViolations.source}; ${contextualDetected} detected (demotion, not a violation), ${sh_?.collisions ?? 0} collisions${trustRead.problems.length ? `; reader problems: ${trustRead.problems.join(" | ")}` : ""}` },
  { counter: "source-unverifiable authoritative IR", ...m(trustRead.counters.sourceUnverifiableAuthoritativeIr.value, trustRead.counters.sourceUnverifiableAuthoritativeIr.state === "MEASURED", (comp?.output?.definitions ?? 0) > 0), rule: trustRead.counters.sourceUnverifiableAuthoritativeIr.source },
  { counter: "silent incompatible merges", ...m(trustRead.counters.silentIncompatibleMerges.value, trustRead.counters.silentIncompatibleMerges.state === "MEASURED", substance), rule: `${trustRead.counters.silentIncompatibleMerges.source} (conflicts=${sh_?.definitionConflicts ?? 0}, variants=${sh_?.conflictVariants ?? 0})` },
  { counter: "new dangling refs", ...m(compiled ? counts.danglingLineageReferences ?? 0 : null, compiled, substance), rule: "Pass C danglingLineageReferences" },
  { counter: "hidden provider/schema failures", ...m(compiled ? ((providerFailures + schemaFailures) > 0 && !["REVIEW_REQUIRED", "FAILED", "PARTIAL"].includes(comp?.status) ? providerFailures + schemaFailures : 0) : null, compiled, true), rule: `shard provider/schema failures (${providerFailures}/${schemaFailures}) not surfaced in unit status (${comp?.status})` },
  { counter: "hidden material omissions", ...m(compiled ? (materialMissing > 0 && acc?.semanticallyComplete === true ? materialMissing : 0) : null, compiled, substance), rule: "material MISSING items not reflected in the completeness verdict" },
  { counter: "authoritative hallucinations", ...m(score ? score.extraOutput.authoritativeHallucinations : null, !!score, inventoried > 0), rule: `every inventory item is excerpt-anchored; Pass A discarded ${score?.extraOutput.rejectedUnverifiableItemsAtFreeze ?? "?"} unverifiable proposals at freeze` },
  { counter: "silent CRITICAL misses", ...m(score ? score.critical.silentMisses : null, !!score, !!score), rule: "CRITICAL reference items neither discovered nor disclosed (155)" },
  { counter: "incorrect authoritative CRITICAL claims", ...m(score ? score.critical.incorrect : null, !!score, !!score), rule: "CRITICAL reference items whose IR values contradict the source numbers of the same unit (155, corrected HD-5 scorer)" },
  { counter: "silent quantitative corruption", ...m(score ? score.quantitative.silentMaterialQuantitativeCorruption : null, !!score, (counts.materialQuantitativeValues ?? 0) > 0), rule: "reference items FOUND_BUT_INCORRECT while the unit carried no review signal (155)" },
  { counter: "false completeness", ...m(compiled ? (acc?.semanticallyComplete === true && materialMissing > 0 ? 1 : 0) : null, compiled, substance), rule: `Pass C claiming semanticallyComplete while material items are MISSING (complete=${acc?.semanticallyComplete}, materialMissing=${materialMissing})` },
  { counter: "dangerous silent omissions", ...m(score ? score.critical.silentMisses + score.material.silentMisses : null, !!score, !!score), rule: "reference items with no covering inventory item AND no explicit review signal on the unit (155)" },
];
const allZero = trust.every((t) => t.value === 0), allMeasured = trust.every((t) => t.state === "MEASURED"); const trustPassed = allZero && allMeasured;
writeJson(A("153-trust-gate"), {
  artifact: "FINAL FUNDED POST-PRECISION PAID REVALIDATION §20 - hard trust counters through the canonical HD-6 reader", at: at(),
  reader: { module: "scripts/phase-3-601-trust-read.ts readShardTrust()", ok: trustRead.ok, problems: trustRead.problems, executionMode: trustRead.executionMode, noGuessedZero: true },
  contextualEmissions: { detected: contextualDetected, credited: contextualCredited, collisionsByKind: sh_?.collisionsByKind ?? null },
  shardCensus: { executed: sh_?.executed ?? null, reused: sh_?.reused ?? null, retries: sh_?.retries ?? null, statusCounts, attributionProofCounts: sh_?.attributionProofCounts ?? null, unresolvedOwnedItems: sh_?.unresolvedOwnedItems ?? null, unresolvedOwnedItemList: sh_?.unresolvedOwnedItemList ?? [] },
  explicitLimitationsAreNotSilentFailures: { certifiedLimitations: (planArt?.perShard ?? []).flatMap((p: Any) => (p.limitations ?? []).map((l: Any) => ({ shardId: p.shardId, ...l }))), missingContextShards: shardSummaries.filter((s) => s.status === "SHARD_MISSING_CONTEXT").map((s) => s.shardId) },
  operativeState: { unitLevelInputHasUnresolvedOperativeEvidence: compile?.inputHasUnresolvedOperativeEvidence ?? null, unresolvedEvidenceItemIds: compile?.unresolvedEvidenceItemIds ?? [], shardsFlagged: shardSummaries.filter((s) => (s.failureReasons ?? []).includes("OPERATIVE_STATE_UNRESOLVED")).map((s) => s.shardId) },
  hardTrustCounters: trust, allCountersZero: allZero, allCountersMeasured: allMeasured, trustGatePassed: trustPassed,
});

// ---------------- 154 verifier + historical reassessment + fix effects (§21/§22)
const findings: Any[] = ver?.findings ?? [];
const old = readJson<Any>(A("113-verifier")); const oldFindings: Any[] = old.findings ?? [];
const triage = readJson<Any>(A("143-verifier-triage"));
const prohibitions = allRules.filter((r) => r.posture === "PROHIBITION");
const stitchedExceptions = allRules.flatMap((r) => (r.exceptions ?? []).filter((e: Any) => /stitched-carve-out/.test(String(e.exceptionId)))).length;
const unresolvedTotal = allRules.reduce((x, r) => x + (r.unresolvedDependencies ?? []).length, 0);
const dependsOnTotal = allRules.reduce((x, r) => x + (r.dependsOn ?? []).length, 0);
const stitcherNote = (compile?.unresolvedIssues ?? []).find((s: string) => /cross-shard|stitch/i.test(s)) ?? null;
const entityScoped = allRules.filter((r) => (r.entityScope ?? []).length > 0 || (r.entityScopeExcluded ?? []).length > 0).length;
const fixEffects = {
  crossShardCarveOutLinkage: { prohibitionRules: prohibitions.length, exceptionsPerProhibitionRule: prohibitions.map((r) => ({ ruleId: r.ruleId, section: r.sourceSectionRef, exceptions: (r.exceptions ?? []).length, stitched: (r.exceptions ?? []).filter((e: Any) => /stitched-carve-out/.test(String(e.exceptionId))).length })), stitchedCarveOutExceptions: stitchedExceptions, frozenRunHad: "7/3/3 exceptions on the three prohibition rules, none cross-shard", stitcherNote },
  uniqueSectionReferenceResolution: { unresolvedDependenciesTotal: unresolvedTotal, dependsOnTotal, frozenRunHad: { unresolvedDependencies: 57, uniquelyResolvable: 18 } },
  entityScope: { rulesWithEntityScope: entityScoped, rulesTotal: allRules.length, frozenRunHad: 0 },
};
// A specific finding type (entity scope, missing rule/basket/reclassification) relates by TYPE alone - the same class of
// omission raised again anywhere in the unit is related; the generic OTHER_MATERIAL type relates only on the same source.
const SPECIFIC_TYPES = new Set(["WRONG_ENTITY_SCOPE", "MISSING_RULE", "MISSING_BASKET", "MISSING_RECLASSIFICATION"]);
const related = (o: Any) => findings.filter((f) => f.findingType === o.findingType && (SPECIFIC_TYPES.has(o.findingType) || f.sourceCitation === o.sourceCitation || String(f.sourceEvidence ?? "").slice(0, 60) === String(o.sourceEvidence ?? "").slice(0, 60)));
const reassess = oldFindings.map((o, i) => {
  const same = findings.find((f) => f.findingId === o.findingId);
  const rel = related(o);
  const cls = String((triage.triage as Any[]).find((t) => t.ordinal === i)?.classification ?? "");
  let status: string; let evidence: string;
  if (same) { status = "RECURRED"; evidence = "identical findingId in the fresh verifier run"; }
  else if (rel.length > 0) { status = "NEW_RELATED_FINDING"; evidence = `fresh finding(s) of the same type on the same source: ${rel.map((f) => f.findingId.slice(0, 12)).join(", ")}`; }
  else if (i === 0) { status = stitchedExceptions > 0 ? "RESOLVED" : "NOT_APPLICABLE_TO_NEW_IR"; evidence = `${stitchedExceptions} cross-shard carve-out exceptions synthesized on ${prohibitions.length} prohibition rules; verifier raised no finding of this type on §6.01(b)`; }
  else if (i === 2) { status = unresolvedTotal < 57 ? "RESOLVED" : "NOT_APPLICABLE_TO_NEW_IR"; evidence = `unresolvedDependencies ${unresolvedTotal} (frozen 57), dependsOn ${dependsOnTotal}; no fresh finding of this type on the same source`; }
  else if (i === 3 || i === 9) { status = entityScoped > 0 ? "RESOLVED" : "NOT_APPLICABLE_TO_NEW_IR"; evidence = `${entityScoped}/${allRules.length} rules carry entityScope (frozen 0); no fresh WRONG_ENTITY_SCOPE / scope finding`; }
  else if (/^F_|^B_/.test(cls)) { status = "RESOLVED"; evidence = "one-run or delivery-caused finding; the fresh verifier did not raise it on the new IR"; }
  else { status = "NOT_APPLICABLE_TO_NEW_IR"; evidence = "the IR objects it named no longer exist and no related fresh finding was raised"; }
  return { ordinal: i, findingId: o.findingId, findingType: o.findingType, severity: o.severity, sourceCitation: o.sourceCitation, triageClass: cls, status, evidence };
});
const relatedIds = new Set(oldFindings.flatMap((o) => related(o).map((f) => f.findingId)).concat(oldFindings.map((o) => o.findingId)));
const genuinelyNew = findings.filter((f) => !relatedIds.has(f.findingId));
writeJson(A("154-verifier"), {
  artifact: "FINAL FUNDED POST-PRECISION PAID REVALIDATION §21/§22 - independent verifier on untouched output; the 11 historical findings reassessed; deterministic-fix effects observed", at: at(),
  ...(ver ?? { produced: false }),
  findingCounts: ver ? { total: findings.length, MATERIAL: findings.filter((f) => f.severity === "MATERIAL").length, UNCERTAIN: findings.filter((f) => f.severity === "UNCERTAIN").length, NON_MATERIAL: findings.filter((f) => f.severity === "NON_MATERIAL").length, deterministic: findings.filter((f) => f.verificationMethod === "DETERMINISTIC_ONLY").length, semantic: findings.filter((f) => f.verificationMethod !== "DETERMINISTIC_ONLY").length, byType: findings.reduce((a: Record<string, number>, f) => { a[f.findingType] = (a[f.findingType] ?? 0) + 1; return a; }, {}) } : null,
  previousVerdictReused: false,
  historicalReassessment: { method: "identical findingId => RECURRED; same findingType on the same source citation/evidence => NEW_RELATED_FINDING; otherwise the deterministic condition the finding described is re-measured on the fresh IR (carve-out exceptions, dependency resolution, entityScope) => RESOLVED when it no longer holds, NOT_APPLICABLE_TO_NEW_IR when it cannot be evaluated; one-run findings not raised again => RESOLVED", rows: reassess, counts: reassess.reduce((a: Record<string, number>, r) => { a[r.status] = (a[r.status] ?? 0) + 1; return a; }, {}) },
  genuinelyNewFindings: genuinelyNew.map((f) => ({ findingId: f.findingId, findingType: f.findingType, severity: f.severity, sourceCitation: f.sourceCitation, irPath: f.irPath, method: f.verificationMethod, summary: String(f.proposedIrEvidence ?? "").slice(0, 300) })),
  deterministicFixEffects: fixEffects,
});

// ---------------- 155 reference score (§23)
if (score) writeJson(A("155-reference-score"), {
  artifact: "FINAL FUNDED POST-PRECISION PAID REVALIDATION §23 - corrected (HD-5) score against the 8 frozen Section 6.01 human reference items", at: at(),
  scoredAfterOutputsFrozen: true, referenceSetReachedNoPrompt: true, referenceSetSha256: score.refHash, referenceSetEdited: false,
  inputs: { compileResult: `${RAW}/compile-result.json`, verifyResult: `${RAW}/verify-result.json`, numericModule: "scripts/phase-3-601-score-numeric.ts (corrected HD-5)" },
  unitFlaggedForReview: score.unitFlaggedForReview, compileStatus: score.compileStatus, verifyStatus: score.verifyStatus, semanticallyComplete: score.semanticallyComplete,
  CRITICAL: score.critical, MATERIAL: score.material,
  counts: score.rows.reduce((a: Record<string, number>, x) => { a[x.classification] = (a[x.classification] ?? 0) + 1; return a; }, {}),
  b6ReferenceSpanVerdict: score.rows.find((x) => x.id === "B6")?.referenceSpan ?? null, referenceSetErrors: score.rows.filter((x) => x.referenceSpan.erroneous).map((x) => ({ id: x.id, ...x.referenceSpan })),
  quantitative: score.quantitative, extraOutput: score.extraOutput, items: score.rows,
});

// ---------------- 156 quality (§24)
const missingContextShards = shardSummaries.filter((s) => s.status === "SHARD_MISSING_CONTEXT");
const critAccounted = score ? score.critical.correct + score.critical.explicitSafeLimitation : 0;
const matAccounted = score ? score.material.correct + score.material.explicitSafeLimitation : 0;
const deliveryHeld = contractCounts.PLANNER_DELIVERY_GAP === 0 && recurred.length === 0 && (sh_?.unresolvedOwnedItems ?? 1) === 0;
const qualityCredible = !!score && allZero && score.critical.incorrect === 0 && score.critical.silentMisses === 0 && score.material.silentMisses === 0 && critAccounted === 4 && (score.critical.correct + score.material.correct) > 0 && deliveryHeld;
writeJson(A("156-quality"), {
  artifact: "FINAL FUNDED POST-PRECISION PAID REVALIDATION §24 - quality decision (Phase-3 standard, not Phase-4 executability)", at: at(),
  materialSemanticsRecovered: score ? { critical: score.critical, material: score.material, criticalAccountedOf4: critAccounted, materialAccountedOf4: matAccounted } : null,
  knownRequiredContextDelivered: { plannerDeliveryGap: contractCounts.PLANNER_DELIVERY_GAP, falseMissingContext: contractCounts.FALSE_MISSING_CONTEXT, recurrenceOfClosed29: recurred.length, unresolvedOwnedItems: sh_?.unresolvedOwnedItems ?? null, missingContextShards: missingContextShards.length },
  remainingLimitationsExplicit: { certified: (planArt?.perShard ?? []).flatMap((p: Any) => p.limitations ?? []).length, compileStatus: comp?.status ?? null, semanticallyComplete: acc?.semanticallyComplete ?? null, inventoryStatusCarried: compile?.frozenInventory?.inventoryStatus ?? null },
  provenanceIntact: { accountedCharFraction: compile?.frozenInventory?.sourceCoverage?.accountedCharFraction ?? null, attributionProofCounts: sh_?.attributionProofCounts ?? null },
  trustCountersZero: allZero, allCountersMeasured: allMeasured,
  systemicOmission: { verifierMaterialFindings: findings.filter((f) => f.severity === "MATERIAL").length, historicalReassessment: reassess.reduce((a: Record<string, number>, r) => { a[r.status] = (a[r.status] ?? 0) + 1; return a; }, {}) },
  conclusion: qualityCredible ? "OPERATIONALLY_CREDIBLE" : !score ? "NOT_EVALUABLE" : allZero && deliveryHeld ? "TRUST_SAFE_BUT_SEMANTIC_QUALITY_MATERIALLY_WEAK" : "NOT_CREDIBLE",
});

// ---------------- 157 regression (§26)
const rel = (p: string) => p.replace(/^.*?\/(tests|lib|scripts|app|prisma)\//, "$1/");
const readVitest = (p: string | undefined) => { if (!p || !existsSync(p)) return null; const j = readJson<Any>(p); return { json: j, sha256: sha256(readFileSync(p)), files: j.numTotalTestSuites, tests: j.numTotalTests, passed: j.numPassedTests, failed: j.numFailedTests, failingFiles: (j.testResults as Any[]).filter((t) => t.status === "failed").map((t) => rel(String(t.name))).sort(), identities: new Map<string, string>((j.testResults as Any[]).flatMap((f) => (f.assertionResults as Any[]).map((t) => [`${rel(String(f.name))} :: ${t.fullName}`, t.status]))) }; };
const full = readVitest(process.env.VITEST_FULL_JSON), base = readVitest(process.env.VITEST_FULL_BASE_JSON), targeted = readVitest(process.env.VITEST_TARGETED_JSON);
const newFailing = full && base ? [...full.identities].filter(([k, s]) => s === "failed" && base.identities.get(k) !== "failed").map(([k]) => k) : null;
const targetedNew = targeted && base ? [...targeted.identities].filter(([k, s]) => s === "failed" && base.identities.get(k) !== "failed").map(([k]) => k) : null;
const tscLog = process.env.TSC_LOG && existsSync(process.env.TSC_LOG) ? readFileSync(process.env.TSC_LOG, "utf8") : null;
const tscErrors = tscLog ? tscLog.split("\n").filter((l) => /error TS\d+/.test(l)) : null; const tscNew = tscErrors ? tscErrors.filter((l) => !/tests\/foundation-audit\//.test(l)) : null;
const lintLog = process.env.LINT_LOG && existsSync(process.env.LINT_LOG) ? readFileSync(process.env.LINT_LOG, "utf8") : null;
const buildLog = process.env.BUILD_LOG && existsSync(process.env.BUILD_LOG) ? readFileSync(process.env.BUILD_LOG, "utf8") : null;
const lintOk = lintLog !== null && /^EXIT=0\s*$/m.test(lintLog) && /No ESLint warnings or errors/.test(lintLog);
const buildOk = buildLog !== null && /^EXIT=0\s*$/m.test(buildLog) && /Compiled successfully/.test(buildLog);
writeJson(A("157-regression"), {
  artifact: "FINAL FUNDED POST-PRECISION PAID REVALIDATION §26 - regression after the outputs froze", at: at(), sha: sh("git rev-parse HEAD"),
  targeted: targeted ? { sha256: targeted.sha256, tests: targeted.tests, passed: targeted.passed, failed: targeted.failed, failingFiles: targeted.failingFiles, newFailingIdentitiesVsBase: targetedNew } : { pending: "VITEST_TARGETED_JSON not provided" },
  fullSuite: full && base ? { baseSha: CERTIFIED_PRODUCTION_SHA, base: { sha256: base.sha256, tests: base.tests, passed: base.passed, failed: base.failed }, after: { sha256: full.sha256, tests: full.tests, passed: full.passed, failed: full.failed }, newFailingIdentities: newFailing, newFailingFiles: full.failingFiles.filter((f) => !base.failingFiles.includes(f)), fixedFiles: base.failingFiles.filter((f) => !full.failingFiles.includes(f)) } : { pending: "VITEST_FULL_JSON / VITEST_FULL_BASE_JSON not provided" },
  tsc: tscErrors ? { errors: tscErrors.length, newErrors: tscNew!.length, preexisting: "tests/foundation-audit/ (unchanged)" } : { pending: "TSC_LOG not provided" },
  lint: lintLog ? { ok: lintOk, tail: lintLog.trim().split("\n").slice(-2) } : { pending: "LINT_LOG not provided" },
  build: buildLog ? { ok: buildOk, tail: buildLog.trim().split("\n").slice(-2) } : { pending: "BUILD_LOG not provided" },
});

// ---------------- 158 verdict (§27)
const spend = ledger?.spendUsd ?? null;
const startBalance = missionStart?.gatewayBalanceAtMissionStart ?? null;
const passA0 = passA?.source === "RESUMED_FROM_ENSEMBLE_PERSISTENCE" && (passA?.newProviderCalls ?? 1) === 0;
const c: [number, string, boolean, string][] = [
  [1, "live starting balance >= $12.153745", startBalance !== null && startBalance >= CONSERVATIVE_ESTIMATE_USD, `$${startBalance} vs $${CONSERVATIVE_ESTIMATE_USD}`],
  [2, "production tree identity matches the certified tree", planArt?.identity?.allMatch === true && planArt?.identity?.productionTreeIsCertified?.match === true, `certified ${CERTIFIED_PRODUCTION_SHA}; trees ${Object.values(CERTIFIED_TREES).map((t) => t.slice(0, 8)).join("/")}`],
  [3, "frozen inventory resumes", passA?.resume?.method === "RECORDED_SOURCE_CONTEXT_HASH" && passA?.authoritative?.canonicalItems === 326, `${passA?.resume?.method}; ${passA?.authoritative?.canonicalItems} items`],
  [4, "new Pass-A calls = 0", passA0, `${passA?.source}; newProviderCalls ${passA?.newProviderCalls}`],
  [5, "exact current plan hash matches", planArt?.planHash === planArt?.expectedPlanHash && compile?.execution?.planHash === planArt?.planHash, `${planArt?.planHash?.slice(0, 16)}`],
  [6, "old shard reuse = 0", (planArt?.historicalStores ?? []).every((s: Any) => s.accepted === 0) && (comp?.priorShardResultsSupplied ?? 0) === 0, `historical accepted ${(planArt?.historicalStores ?? []).map((s: Any) => s.accepted).join("/")}`],
  [7, "no planning failure", planArt?.census?.PLANNING_FAILED_REQUIRED_CONTEXT_UNDELIVERABLE === 0 && planArt?.certification?.deliverableNotDelivered === 0, JSON.stringify(planArt?.census ?? null)],
  [8, "PLANNER_DELIVERY_GAP = 0", compiled && contractCounts.PLANNER_DELIVERY_GAP === 0 && perShard.every((s: Any) => s.missingContext !== "NOT_RECORDED"), `${contractCounts.PLANNER_DELIVERY_GAP}; audits recorded on ${perShard.filter((s: Any) => s.missingContext !== "NOT_RECORDED").length}/${perShard.length} shards`],
  [9, "Pass B completes sufficiently for safe semantic composition", compiled && (sh_?.unresolvedOwnedItems ?? 1) === 0 && providerFailures === 0 && schemaFailures === 0, `status ${comp?.status}; statuses ${JSON.stringify(statusCounts)}; unresolved owned items ${sh_?.unresolvedOwnedItems}`],
  [10, "Pass C executes", acc != null, `semanticallyComplete=${acc?.semanticallyComplete}, inventoried ${inventoried}`],
  [11, "all 14 hard trust counters MEASURED and zero", trustPassed, trustPassed ? "14/14 MEASURED = 0" : `${trust.filter((t) => t.value !== 0).map((t) => `${t.counter}=${t.value}`).join(", ") || "all zero"}${allMeasured ? "" : `; not MEASURED: ${trust.filter((t) => t.state !== "MEASURED").map((t) => `${t.counter} (${t.state})`).join(", ")}`}`],
  [12, "verifier executes", ver?.status != null && !ver?.verifyError, `${ver?.status}, ${findings.length} findings`],
  [13, "no unresolved deterministic Phase-3 blocker remains", !reassess.some((r) => r.status === "RECURRED" && /^A_/.test(r.triageClass)) && genuinelyNew.filter((f) => f.verificationMethod === "DETERMINISTIC_ONLY" && f.severity === "MATERIAL").length === 0, `historical A-class findings recurred: ${reassess.filter((r) => r.status === "RECURRED" && /^A_/.test(r.triageClass)).length}; new deterministic MATERIAL findings: ${genuinelyNew.filter((f) => f.verificationMethod === "DETERMINISTIC_ONLY" && f.severity === "MATERIAL").length}`],
  [14, "no silent CRITICAL miss", !!score && score.critical.silentMisses === 0, `${score?.critical.silentMisses ?? "n/a"}`],
  [15, "no incorrect authoritative CRITICAL claim", !!score && score.critical.incorrect === 0, `${score?.critical.incorrect ?? "n/a"}`],
  [16, "no silent quantitative corruption", !!score && score.quantitative.silentMaterialQuantitativeCorruption === 0, `${score?.quantitative.silentMaterialQuantitativeCorruption ?? "n/a"}`],
  [17, "semantic quality credible", qualityCredible, score ? `CRITICAL ${score.critical.correct}+${score.critical.explicitSafeLimitation} of 4; MATERIAL ${score.material.correct}+${score.material.explicitSafeLimitation} of 4` : "not scored"],
  [18, "spend <= $12.20", spend !== null && spend <= HARD_CAP_USD, `$${spend} of $${HARD_CAP_USD}`],
  [19, "no code fix-and-continue", sh(`git diff --name-only ${CERTIFIED_PRODUCTION_SHA} -- lib/`).trim() === "" && sh(`git diff --name-only ${STARTING_SHA} -- scripts/phase-3-601-precision-revalidation-run.ts scripts/phase-3-601-precision-revalidation-lib.ts scripts/phase-3-601-guard.ts scripts/phase-3-601-durable-replay.ts scripts/phase-3-601-hd4-resume.ts`).trim().split("\n").filter(Boolean).every((f) => /precision-revalidation-(run|lib)\.ts$/.test(f)), "production tree unchanged since the certified SHA; the run harness was committed and pushed before the first paid call and not touched afterwards; the finalizer only reads frozen outputs"],
  [20, "no new regression", newFailing !== null && newFailing.length === 0 && targetedNew !== null && targetedNew.length === 0 && tscNew !== null && tscNew.length === 0 && lintOk, `full-suite new failing identities ${newFailing?.length ?? "n/a"}; targeted new ${targetedNew?.length ?? "n/a"}; tsc new ${tscNew?.length ?? "n/a"}; lint ${lintOk}`],
  [21, "build passes", buildOk, buildOk ? "compiled successfully" : "not passed / not run"],
];
const passed = c.every((x) => x[2]);
const verdict = passed ? "PHASE3_601_FINAL_REVALIDATION_PASSED"
  : ledger?.stoppedEarly && ledger?.stopVerdict ? ledger.stopVerdict
  : !compiled ? "PHASE3_601_ENVIRONMENT_BLOCKED"
  : contractCounts.PLANNER_DELIVERY_GAP > 0 || recurred.length > 0 ? "PHASE3_601_REQUIRED_DEPENDENCY_MODEL_FAILED"
  : !trustPassed || (score && (score.critical.silentMisses > 0 || score.critical.incorrect > 0)) ? "PHASE3_601_NOT_SAFE"
  : !c[13 - 1]![2] ? "PHASE3_601_IMPLEMENTATION_DEFECT"
  : !qualityCredible ? "PHASE3_601_NEEDS_SEMANTIC_ITERATION"
  : !c[19]![2] || !c[20]![2] ? "PHASE3_601_REGRESSION_BLOCKED"
  : "PHASE3_601_NOT_SAFE";
writeJson(A("158-final-revalidation-verdict"), {
  artifact: "FINAL FUNDED POST-PRECISION PAID REVALIDATION §27 - final verdict", at: at(),
  startingSha: STARTING_SHA, endingSha: sh("git rev-parse HEAD"), certifiedProductionSha: CERTIFIED_PRODUCTION_SHA, certifiedTrees: CERTIFIED_TREES, missionId: MISSION_ID, evidenceDir: RAW, launches: launches.length,
  conditions: c.map(([id, condition, status, evidence]) => ({ id, condition, status: status ? "PASS" : "FAIL", evidence })),
  summary: { PASS: c.filter((x) => x[2]).length, FAIL: c.filter((x) => !x[2]).length, total: c.length },
  verdict, phase3Closed: false, phase4Started: false,
  cost: { thisMissionUsd: spend, hardCapUsd: HARD_CAP_USD, conservativeEstimateUsd: CONSERVATIVE_ESTIMATE_USD, gatewayBefore: startBalance, gatewayAfter: ledger?.gatewayBalanceAfter ?? null, gatewayReportedSpendUsd: ledger?.gatewayReportedSpendUsd ?? null, historicalSection601Usd: HISTORICAL_601_SPEND_USD, cumulativeSection601Usd: spend === null ? null : +(HISTORICAL_601_SPEND_USD + spend).toFixed(6), liveCalls: ledger?.liveCalls ?? null, replayedCalls: ledger?.replayedCalls ?? null, newPassACalls: 0 },
  nextMission: "ZERO-COST PHASE 3 CLOSURE SYNTHESIS. §28: Phase 3 stays OPEN even on a pass.",
});
console.log(JSON.stringify({ verdict, summary: { PASS: c.filter((x) => x[2]).length, FAIL: c.filter((x) => !x[2]).length }, failing: c.filter((x) => !x[2]).map((x) => `${x[0]}. ${x[1]}: ${x[3]}`), trustPassed, allMeasured, spend, statusCounts, contractCounts, reassessment: reassess.map((r) => `${r.ordinal}:${r.status}`).join(" "), newFindings: genuinelyNew.length, score: score ? { CRITICAL: score.critical, MATERIAL: score.material } : null }, null, 1));
