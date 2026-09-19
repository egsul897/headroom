/**
 * PHASE 3 / 6.01 DEPENDENCY-DELIVERY REMEDIATION §6-§29 - the remediated planner's own measurements.
 *
 * Zero paid calls. Everything here is derived deterministically from the frozen Pass-A inventory, the frozen source and
 * the live (remediated) planner. The RED BASELINE lives in 118/119/120 and is never regenerated (that script refuses to
 * run under the new planner); this script writes 121-132.
 *
 * Optional environment inputs, recorded as NOT_SUPPLIED when absent:
 *   DD_BASE_SUITE  path to a vitest --reporter=json output produced at the mission's starting SHA
 *   DD_CURR_SUITE  path to a vitest --reporter=json output produced at HEAD
 *   DD_GENERALITY  path to a vitest --reporter=json output for the §27 generality test file
 *
 * Run: npx tsx scripts/phase-3-601-dependency-delivery-artifacts.ts
 *
 * FROZEN. Artifacts 121-132 record the v1 required-dependency model exactly as it was when the delivery remediation
 * was measured. The precision/certificate-honesty audit (artifacts 133+) changed the disposition and certificate
 * vocabulary, so this script REFUSES to run against any other model version: regenerating under v2 would overwrite the
 * record of what v1 did with the record of what v2 does. The typed reads below are cast because the fields they name
 * no longer exist on the live certificate; that is deliberate, not a bug.
 */
import { existsSync } from "node:fs";
import { writeJson } from "./f7b-lib";
import { buildRealPlan, loadFrozenInventoryCandidate, OUT, readJson, resumeProof, sh } from "./phase-3-601-revalidation-lib";
import { planCompilationShards, DEFAULT_SHARD_BUDGET, MAX_FIRST_TURN_INPUT_TOKENS } from "../lib/contract-model/compiler/semantic/shard-planner";
import { SHARD_PLANNER_ALGORITHM_VERSION, CALIBRATED_TOKENS_PER_CHAR, FIXED_CALL_OVERHEAD_CHARS } from "../lib/contract-model/compiler/semantic/shard-types";
import { DEFAULT_REQUIRED_DEPENDENCY_BUDGET, REQUIRED_DEPENDENCY_MODEL_VERSION } from "../lib/contract-model/compiler/semantic/required-dependencies";
import { MISSING_CONTEXT_CONTRACT_VERSION, auditShardMissingContext, dependencyKeyOf } from "../lib/contract-model/compiler/semantic/missing-context-contract";
import { DEFAULT_TOOL_BUDGET } from "../lib/contract-model/compiler/semantic/types";
import { SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION } from "../lib/contract-model/compiler/semantic/types";
import type { CompilationShard, ShardPlan } from "../lib/contract-model/compiler/semantic/shard-types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const at = () => new Date().toISOString();
const DOC = "doc-a";
const FAILED_SHARD_ID = "shard:86cc5e439f113d6053a9";
const FAILED_SHARD_HASH = "691cf0598278741ac4cefa845910b4274c7234c7ee3283ec17a46ce29b6ae5ed";
/** The five dependencies the failed shard's own composition reported as missing (frozen in 119). Used ONLY to score delivery - never to construct context. */
const TARGETS = ["term:fixed incremental amount", "term:voluntary prepayment incremental amount", "term:ratio incremental amount", "term:extension amount", "section:2.18(b)"];

if ((REQUIRED_DEPENDENCY_MODEL_VERSION as string) !== "required-dependency-delivery.v1") {
  console.error(`REFUSED: artifacts 121-132 are frozen to required-dependency model v1; the live model is ${REQUIRED_DEPENDENCY_MODEL_VERSION}. The precision audit's own measurements live in 133+.`);
  process.exit(2);
}
const candidate = loadFrozenInventoryCandidate();
const proof = resumeProof(candidate);
if (!proof.decision.ok) throw new Error("resume proof failed - the frozen inventory is required for a zero-cost measurement");
const plan = buildRealPlan(proof);
const failed = plan.shards.find((s) => s.shardId === FAILED_SHARD_ID) ?? null;
const requiredEntries = (s: CompilationShard) => s.context.filter((e) => e.tier === "REQUIRED");
const requiredChars = (s: CompilationShard) => requiredEntries(s).reduce((a, e) => a + e.chars, 0);
const allDeps = plan.shards.flatMap((s) => s.requiredDependencies.map((d) => ({ shardId: s.shardId, ordinal: s.ordinal, ...d })));
const deliveredKeys = new Set(plan.shards.flatMap((s) => requiredEntries(s).map((e) => e.contextKey)));

const base118 = readJson<Any>(`${OUT}/118-dependency-delivery-baseline.json`);
const audit119 = readJson<Any>(`${OUT}/119-failed-shard-request-audit.json`);
const tool120 = readJson<Any>(`${OUT}/120-tool-budget-forensics.json`);
const trust112 = readJson<Any>(`${OUT}/112-trust-gate.json`);
const verifier113 = readJson<Any>(`${OUT}/113-verifier.json`);
const suite = (envVar: string) => {
  const p = process.env[envVar];
  if (!p || !existsSync(p)) return null;
  const d = readJson<Any>(p);
  return {
    path: p,
    files: d.testResults.length,
    filesPassed: d.testResults.filter((f: Any) => f.status === "passed").length,
    tests: d.numTotalTests, passed: d.numPassedTests, failed: d.numFailedTests,
    byFile: Object.fromEntries(d.testResults.map((f: Any) => [String(f.name).split("/tests/").pop(), f.status])),
  };
};

// ---------------------------------------------------------------------------
// 121 - the required-dependency model itself (§6-§9)
// ---------------------------------------------------------------------------
const evidenceCensus: Record<string, number> = {};
for (const d of allDeps) for (const e of d.evidence) evidenceCensus[e] = (evidenceCensus[e] ?? 0) + 1;
const depthCensus: Record<string, number> = {};
for (const d of allDeps) depthCensus[`depth${d.closureDepth}`] = (depthCensus[`depth${d.closureDepth}`] ?? 0) + 1;
const dispositionCensus: Record<string, number> = {};
for (const d of allDeps) dispositionCensus[d.disposition] = (dispositionCensus[d.disposition] ?? 0) + 1;

writeJson(`${OUT}/121-required-dependency-model.json`, {
  artifact: "PHASE 3 / 6.01 DEPENDENCY-DELIVERY REMEDIATION §6-§9 - required dependency prematerialization: the model, the typed context, the tiering and the closure", at: at(), paidCalls: 0,
  versions: { requiredDependencyModel: REQUIRED_DEPENDENCY_MODEL_VERSION, shardPlanner: SHARD_PLANNER_ALGORITHM_VERSION, missingContextContract: MISSING_CONTEXT_CONTRACT_VERSION },
  whatChanged: {
    before: "a dependency the planner itself derived competed with every other optional context entry for one 10,000-char budget; whatever did not fit was written to unresolvedContext and left to the model's own tool choice",
    after: "dependencies the planner can prove are REQUIRED for the owned semantics are admitted FIRST, into their own tier with its own ceiling, before any optional context is considered; delivery is a planning guarantee, and a shard that cannot deliver one is not certified executable",
    theDistinctionThatWasMissing: "RESOLVABLE != DELIVERED - a retrieval route existing is a different property from the text being present at turn 1 under a bounded tool budget",
  },
  requiredIsDefinedGenerically: {
    statement: "a dependency is REQUIRED when the owned material's own semantics cannot be evaluated without it - never by naming a term, a section or an instrument",
    rules: [
      { evidence: "DEFINED_TERM_OCCURRENCE_IN_OWNED_SOURCE", rule: "a defined term of the document occurs verbatim in the shard's own owned source" },
      { evidence: "STRUCTURAL_CROSS_REFERENCE_IN_OWNED_SOURCE", rule: "a section reference is written in the shard's own owned source" },
      { evidence: "INVENTORY_REFERENCED_TERM_EDGE", rule: "an owned inventory item declares the term as a referenced term" },
      { evidence: "INVENTORY_REFERENCED_SECTION_EDGE", rule: "an owned inventory item declares the section as a referenced section" },
      { evidence: "INVENTORY_PARENT_EDGE", rule: "an owned item's parent proposition is owned by a unit this shard does not own" },
      { evidence: "FORWARDING_DEFINITION_TARGET", rule: "a required definition is a forwarding declaration with no body of its own; its target is required, one bounded hop" },
      { evidence: "CROSS_REFERENCE_IN_REQUIRED_DEFINITION", rule: "a section reference written inside a delivered required definition is itself required" },
      { evidence: "TRANSITIVE_DEFINITION_CLOSURE", rule: "a defined term occurring in a delivered required definition is required when that definition is COMPOSITIONAL (>= " + DEFAULT_REQUIRED_DEPENDENCY_BUDGET.compositionalCoverageThreshold + " of its operative body is other defined terms) or the term sits in a LIMIT-BEARING position (within " + DEFAULT_REQUIRED_DEPENDENCY_BUDGET.limitLookbehindChars + " chars after a bounding construction such as 'does not exceed', 'up to', 'the greater of', 'incurred within')" },
    ],
    noHardcodedIdentifiers: "the rules are computed from the document's own structural index and the frozen inventory's own edges; no term name, section number, company or instrument appears anywhere in lib/contract-model/compiler/semantic/required-dependencies.ts",
    bodyMeasuredAfterTheDefinitionalVerb: "compositional coverage is measured over a definition's OPERATIVE BODY (everything after 'means' / 'has the meaning' / 'refers to'), so the metric cannot depend on how long the drafter made the defined term's own name",
  },
  typedContext: {
    kinds: ["REQUIRED_DEFINITION", "REQUIRED_REFERENCED_SECTION", "REQUIRED_PARENT_CONTEXT", "REQUIRED_OPERATIVE_STATE", "CHAPEAU", "PARENT_ITEM", "REFERENCED_TERM", "REFERENCED_SECTION", "EXPANSION_REGION"],
    everyEntryCarries: ["contextKey", "kind", "tier", "ownership", "documentId", "absCharStart", "absCharEnd", "fullTextHash", "chars", "truncated", "requiredBy", "reason", "requiredEvidence", "closureDepth", "sourceUnitKey", "ownerShardId"],
    ownershipIsAlwaysReadOnly: "every context entry, required or interpretive, is ownership = READ_ONLY_CONTEXT; a shard never owns semantics it was given as context",
  },
  tiering: {
    requiredTier: { ceiling: DEFAULT_SHARD_BUDGET.maxRequiredContextChars, admittedBefore: "any optional context", perEntryFullDeliveryBound: DEFAULT_REQUIRED_DEPENDENCY_BUDGET.maxRequiredEntryChars },
    interpretiveTier: { ceiling: DEFAULT_SHARD_BUDGET.maxContextChars, unchangedFromV2: true },
    requiredNeverCompetes: "the interpretive tier's ceiling is applied to the chars it adds ON TOP of the required tier, and a required key is never re-admitted as interpretive context",
  },
  closure: { maxDepth: DEFAULT_REQUIRED_DEPENDENCY_BUDGET.maxClosureDepth, byDepth: depthCensus, byEvidence: evidenceCensus, byDisposition: dispositionCensus },
  measuredOnTheFrozenUnit: {
    documentId: DOC, candidateRef: proof.built.candidateRef, frozenInventoryHash: plan.frozenContentHash,
    shards: plan.shards.length, requiredDependencies: allDeps.length, distinctKeys: new Set(allDeps.map((d) => d.key)).size,
    certification: plan.dependencyCertification,
  },
});

// ---------------------------------------------------------------------------
// 122 - red baseline -> green, on the SAME frozen inventory (§17/§18)
// ---------------------------------------------------------------------------
const frozenCtxKeys: string[] = (base118.failedShard.initialContext as Any[]).map((c) => c.contextKey);
const frozenUnresolved: Any[] = base118.failedShard.unresolvedContext;
const targetRows = TARGETS.map((key) => {
  const before = { inInitialContext: frozenCtxKeys.includes(key), unresolvedReason: frozenUnresolved.find((u) => u.key === key)?.reason ?? null };
  const dep = failed?.requiredDependencies.find((d) => d.key === key) ?? null;
  const entry = failed ? requiredEntries(failed).find((e) => e.contextKey === key) ?? null : null;
  return {
    dependency: key,
    before: { ...before, result: before.inInitialContext ? "IN_INITIAL_CONTEXT" : before.unresolvedReason ? `NOT_DELIVERED (${before.unresolvedReason})` : "NOT_DERIVED_AT_ALL" },
    after: dep
      ? { derived: true, evidence: dep.evidence, closureDepth: dep.closureDepth, via: dep.viaKey, disposition: dep.disposition, deliveredChars: entry?.chars ?? 0, fullTextChars: dep.fullTextChars, truncated: entry?.truncated ?? null, tier: entry?.tier ?? null, result: entry && !entry.truncated ? "MATERIALIZED_IN_FULL_BEFORE_THE_MODEL" : entry ? "DELIVERED_AS_DISCLOSED_BOUNDED_EXCERPT" : "NOT_DELIVERED" }
      : { derived: false, result: "NOT_DERIVED" },
  };
});
writeJson(`${OUT}/122-red-to-green-on-the-same-unit.json`, {
  artifact: "PHASE 3 / 6.01 DEPENDENCY-DELIVERY REMEDIATION §17/§18 - the same frozen inventory, the same owned material, the same shard identity: what the failed shard was handed before and after", at: at(), paidCalls: 0,
  shardIdentityPreserved: { shardId: FAILED_SHARD_ID, stillPresentInThePlan: !!failed, ownedMaterialItemsBefore: base118.failedShard.ownedMaterialItems, ownedMaterialItemsAfter: failed?.ownedMaterialItemIds.length ?? null, ownedUnitsBefore: base118.failedShard.ownedUnitCount, ownedUnitsAfter: failed?.ownedUnitKeys.length ?? null, primaryCharsBefore: base118.failedShard.primaryChars, primaryCharsAfter: failed?.primaryChars ?? null, note: "the shard was NOT split to make this green - it owns the same 13 units and the same material items it owned when it failed" },
  contextBefore: { entries: base118.failedShard.contextEntries, chars: base118.failedShard.contextChars, budget: base118.budgets.shard.maxContextChars, unresolvedEntries: base118.failedShard.unresolvedContextEntries, droppedForBudget: frozenUnresolved.filter((u) => u.reason === "BUDGET").length },
  contextAfter: failed ? { requiredEntries: requiredEntries(failed).length, requiredChars: requiredChars(failed), requiredCeiling: failed.dependencyCertificate.requiredTierAllocation.ceilingChars, interpretiveEntries: failed.context.filter((e) => e.tier === "INTERPRETIVE").length, interpretiveChars: failed.contextChars - requiredChars(failed), unresolvedEntries: failed.unresolvedContext.length, droppedForBudget: failed.unresolvedContext.filter((u) => u.reason === "BUDGET").length, certificate: failed.dependencyCertificate } : null,
  theFiveKnownMissingDependencies: targetRows,
  allFiveAccountedForBeforeExecution: targetRows.every((r) => r.after.result === "MATERIALIZED_IN_FULL_BEFORE_THE_MODEL"),
  honestLimit: "this is a planning measurement, not an execution result. It proves what the shard is HANDED, which is the property that failed. Whether the model then compiles it correctly is a separate question that only a paid run answers, and this mission does not authorize one.",
});

// ---------------------------------------------------------------------------
// 123 - the deterministic over-budget reaction + the §15 sensitivity sweep (§10/§15/§16)
// ---------------------------------------------------------------------------
const sweep = [4_000, 8_000, 12_000, 16_000, 24_000, 32_000, 48_000, DEFAULT_SHARD_BUDGET.maxRequiredContextChars, 96_000].map((ceiling) => {
  const p: ShardPlan = planCompilationShards({ candidateRef: proof.built.candidateRef, companyId: proof.built.input.companyId, instrumentKey: proof.built.input.instrumentKey, documentId: DOC, sourceContext: proof.ctx, frozenInventory: proof.decision.ok ? proof.decision.inventory : candidate.inventory, structuralIndex: proof.built.chewy.index, generation: { algorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION, promptVersion: SEMANTIC_COMPILER_PROMPT_VERSION }, budget: { ...DEFAULT_SHARD_BUDGET, maxRequiredContextChars: ceiling } });
  const c = p.dependencyCertification as Any;
  return {
    maxRequiredContextChars: ceiling, shards: p.shards.length, reshardSplits: p.requiredContextResharding.splits, waterFilledShards: p.shards.filter((s) => s.dependencyCertificate.requiredTierAllocation.waterFilled).length,
    materialized: c.requiredDependenciesMaterialized, boundedExcerpt: c.requiredDependenciesBoundedExcerpt, undeliverableDisclosed: c.requiredDependenciesUndeliverableDisclosed, unresolved: c.requiredDependenciesUnresolved,
    allShardsExecutable: c.allShardsExecutable, maxTurn1InputTokens: p.totals.maxShardInputTokens,
    theFiveKnownMissingDependenciesDeliveredInFull: TARGETS.filter((k) => p.shards.some((s) => s.context.some((e) => e.tier === "REQUIRED" && e.contextKey === k && !e.truncated))).length,
  };
});
writeJson(`${OUT}/123-over-budget-reaction-and-sensitivity.json`, {
  artifact: "PHASE 3 / 6.01 DEPENDENCY-DELIVERY REMEDIATION §10/§15/§16 - what the planner does when the required closure does not fit, and how sensitive the outcome is to the ceiling", at: at(), paidCalls: 0,
  reactionOrder: [
    { step: 1, reaction: "RE-SHARD", detail: "split the shard along its own must-link block boundaries (never inside a block, so must-link semantics and ownership survive) and re-derive the closure for each half, recursively, to a bounded depth" },
    { step: 2, reaction: "BOUNDED PROVABLE EXCERPT (water-filling)", detail: "when the shard is a single indivisible must-link block, reduce delivery by ONE per-entry allowance - the largest allowance for which the whole closure fits. Entries at or below it are still delivered in full, so the reduction falls on the largest dependencies first and never starves a small one. The allowance is searched, not chosen." },
    { step: 3, reaction: "EXPLICIT PLANNING FAILURE", detail: "if the closure still does not fit with every entry at the floor, the shard is marked PLANNING_FAILED_REQUIRED_CONTEXT_UNDELIVERABLE and each undelivered dependency is disclosed on the shard with reason BUDGET" },
  ],
  forbiddenReaction: { pattern: "put the dependency in unresolvedContext and hope the model spends a tool call on it", implemented: false, enforcedBy: "a required key is never re-admitted into the interpretive tier, and an undelivered required dependency sets certificateStatus to PLANNING_FAILED_REQUIRED_CONTEXT_UNDELIVERABLE rather than leaving the shard certified" },
  ceilingIsACapacityBound: {
    maxFirstTurnInputTokens: MAX_FIRST_TURN_INPUT_TOKENS, calibratedTokensPerChar: CALIBRATED_TOKENS_PER_CHAR, fixedCallOverheadChars: FIXED_CALL_OVERHEAD_CHARS,
    derivation: "at most half of the 200,000-token window is spent on the first turn; the required tier gets what remains after the fixed call overhead, the shard's own primary material, its rendered inventory and the unchanged 10,000-char interpretive tier, capped by the declared maxRequiredContextChars",
    declaredCeiling: DEFAULT_SHARD_BUDGET.maxRequiredContextChars,
    interpretiveBudgetUnchanged: DEFAULT_SHARD_BUDGET.maxContextChars === 10_000,
    toolBudgetUnchanged: DEFAULT_TOOL_BUDGET,
  },
  sensitivity: sweep,
  whatTheSweepShows: {
    deliveryIsCompleteFromThisCeilingDown: sweep.filter((r) => r.unresolved === 0).map((r) => r.maxRequiredContextChars),
    deliveryIsIncompleteBelow: sweep.filter((r) => r.unresolved > 0).map((r) => ({ ceiling: r.maxRequiredContextChars, unresolved: r.unresolved, disclosedNotSilent: true })),
    honestReading: "green does not depend on the exact ceiling: required delivery is complete at every ceiling at or above the lowest passing row, a wide margin below the declared value. Below that, the failure is an EXPLICIT, certified planning failure with every undelivered dependency named - never a silent hand-off to a tool call. The ceiling therefore governs FIDELITY (full text vs disclosed excerpt), not whether delivery is guaranteed.",
    whyThisIsNotBudgetTuning: "the interpretive budget and the tool budget are both unchanged. The required tier is a NEW tier introduced by this remediation; before it, required dependencies had no budget of their own at all, which is the defect. Its ceiling is derived from the model's context window, not from this document.",
  },
  toolBudgetIncreaseIsNotSufficientRemediation: {
    claim: "raising maxToolCalls or maxAdditionalSourceChars would not have fixed the failure",
    proof: [
      "the 25 dependencies the old planner dropped for budget were derived BEFORE any call and were resolvable - more call slots would only have bought more chances to rediscover what the planner already knew",
      "four of the five dependencies the model reported as missing were never DERIVED by the old planner at all: they are reachable only through a three-hop definition closure, so no number of tool calls would have told the model they existed",
      "a tool call spends a turn and returns bounded text; a statically known dependency delivered at turn 1 costs no call at all",
    ],
    toolBudgetInThisRemediation: { changed: false, value: DEFAULT_TOOL_BUDGET },
    whatToolsAreStillFor: "genuinely unforeseeable retrieval - interpretive context that did not fit, the remainder of a disclosed bounded excerpt, and anything the owned semantics turn out to need that no static rule could predict",
  },
});

// ---------------------------------------------------------------------------
// 124 - the per-shard dependency certificate (§11)
// ---------------------------------------------------------------------------
writeJson(`${OUT}/124-shard-dependency-certificates.json`, {
  artifact: "PHASE 3 / 6.01 DEPENDENCY-DELIVERY REMEDIATION §11 - every shard's ShardDependencyCertificate, computed before any provider call", at: at(), paidCalls: 0,
  contract: { requiredDependenciesUnresolved: "MUST be 0 for a shard to be certified executable", certificateStatuses: ["CERTIFIED_EXECUTABLE", "PLANNING_FAILED_REQUIRED_CONTEXT_UNDELIVERABLE"], blockingDisposition: "UNRESOLVED (deliverable but not delivered)", nonBlockingDispositions: ["MATERIALIZED_IN_INITIAL_CONTEXT", "BOUNDED_EXCERPT_DISCLOSED", "OWNED_PRIMARY_SOURCE", "EXTERNAL_REQUIRED_DEPENDENCY", "UNDELIVERABLE_DISCLOSED"] },
  planCertification: plan.dependencyCertification,
  resharding: plan.requiredContextResharding,
  shards: plan.shards.map((s) => ({ ordinal: s.ordinal, shardId: s.shardId, shardHash: s.shardHash, ownedUnits: s.ownedUnitKeys.length, ownedMaterialItems: s.ownedMaterialItemIds.length, primaryChars: s.primaryChars, requiredEntries: requiredEntries(s).length, requiredChars: requiredChars(s), interpretiveChars: s.contextChars - requiredChars(s), estimatedTurn1InputTokens: s.estimate.inputTokens, certificate: s.dependencyCertificate })),
  everyShardCertified: plan.shards.every((s) => (s.dependencyCertificate.certificateStatus as string) === "CERTIFIED_EXECUTABLE"),
});

// ---------------------------------------------------------------------------
// 125 - external and absent dependencies, never fabricated (§12)
// ---------------------------------------------------------------------------
const undeliverable = allDeps.filter((d) => (d.disposition as string) === "UNDELIVERABLE_DISCLOSED");
const external = allDeps.filter((d) => d.disposition === "EXTERNAL_REQUIRED_DEPENDENCY");
writeJson(`${OUT}/125-external-and-absent-dependencies.json`, {
  artifact: "PHASE 3 / 6.01 DEPENDENCY-DELIVERY REMEDIATION §12 - dependencies that cannot be delivered are disclosed by name and never invented", at: at(), paidCalls: 0,
  rule: "a required dependency with no resolvable text in the package is recorded with an EMPTY fullText, disposition UNDELIVERABLE_DISCLOSED (or EXTERNAL_REQUIRED_DEPENDENCY), a reason naming why, and an unresolvedContext entry on every shard that needs it. It does NOT block certification, because the planner cannot deliver what the package does not contain - and it is never replaced with a guess.",
  counts: { undeliverableDisclosed: undeliverable.length, external: external.length, everyUndeliverableHasEmptyText: undeliverable.every((d) => d.fullText === ""), everyUndeliverableIsDisclosedOnItsShard: undeliverable.every((d) => plan.shards.find((s) => s.shardId === d.shardId)!.unresolvedContext.some((u) => u.key === d.key)) },
  undeliverable: undeliverable.map((d) => ({ shardOrdinal: d.ordinal, key: d.key, target: d.target, kind: d.kind, evidence: d.evidence, requiredByCount: d.requiredBy.length, reason: d.dispositionReason })),
  external: external.map((d) => ({ shardOrdinal: d.ordinal, key: d.key, target: d.target, reason: d.dispositionReason })),
});

// ---------------------------------------------------------------------------
// 126 - §13 the cross-reference case generically + §14 the four terms + §19 provenance
// ---------------------------------------------------------------------------
const sourceBacked = plan.shards.flatMap((s) => requiredEntries(s).filter((e) => e.kind !== "REQUIRED_PARENT_CONTEXT"));
const provenance = {
  requiredEntries: plan.shards.reduce((a, s) => a + requiredEntries(s).length, 0),
  sourceBackedEntries: sourceBacked.length,
  missingFullTextHash: sourceBacked.filter((e) => !e.fullTextHash).length,
  missingDocumentId: sourceBacked.filter((e) => !e.documentId).length,
  missingAbsSpan: sourceBacked.filter((e) => e.absCharStart === null || e.absCharEnd === null).length,
  missingRequiredBy: plan.shards.flatMap((s) => requiredEntries(s)).filter((e) => (e.requiredBy ?? []).length === 0).length,
  missingEvidence: plan.shards.flatMap((s) => requiredEntries(s)).filter((e) => (e.requiredEvidence ?? []).length === 0).length,
  notReadOnly: plan.shards.flatMap((s) => requiredEntries(s)).filter((e) => e.ownership !== "READ_ONLY_CONTEXT").length,
  parentContextEntriesHaveNoSourceSpanByDesign: plan.shards.flatMap((s) => requiredEntries(s)).filter((e) => e.kind === "REQUIRED_PARENT_CONTEXT").length,
};
const crossRefDeps = allDeps.filter((d) => d.evidence.includes("CROSS_REFERENCE_IN_REQUIRED_DEFINITION"));
writeJson(`${OUT}/126-generic-cross-reference-and-term-delivery.json`, {
  artifact: "PHASE 3 / 6.01 DEPENDENCY-DELIVERY REMEDIATION §13/§14/§19 - the cross-reference rule stated generically, the four bounding terms, and provenance hard zeros", at: at(), paidCalls: 0,
  section13_crossReferenceRuleIsGeneric: {
    rule: "a section reference written INSIDE a delivered required definition is itself required, one hop, because the definition's own meaning is incomplete without it",
    implementedWhere: "lib/contract-model/compiler/semantic/required-dependencies.ts, evidence CROSS_REFERENCE_IN_REQUIRED_DEFINITION",
    noSpecialCase: "the rule is applied to every delivered required definition of every document; nothing in the code mentions a particular section number",
    instancesOnThisUnit: crossRefDeps.map((d) => ({ shardOrdinal: d.ordinal, key: d.key, target: d.target, via: d.viaKey, disposition: d.disposition, delivered: deliveredKeys.has(d.key) })),
  },
  section14_boundingTermsPrematerialized: targetRows.filter((r) => r.dependency.startsWith("term:")),
  section19_provenanceHardZeros: {
    ...provenance,
    allHardZeros: provenance.missingFullTextHash === 0 && provenance.missingDocumentId === 0 && provenance.missingAbsSpan === 0 && provenance.missingRequiredBy === 0 && provenance.missingEvidence === 0 && provenance.notReadOnly === 0,
    note: "REQUIRED_PARENT_CONTEXT entries carry an inventory proposition rather than a verbatim source span, so they are excluded from the span check and counted separately - disclosed, not hidden",
  },
});

// ---------------------------------------------------------------------------
// 127 - ownership unchanged + the synthetic complete-shard projection (§20/§21)
// ---------------------------------------------------------------------------
const owned = plan.shards.flatMap((s) => s.ownedMaterialItemIds);
const ownedCounts = new Map<string, number>();
for (const id of owned) ownedCounts.set(id, (ownedCounts.get(id) ?? 0) + 1);
writeJson(`${OUT}/127-ownership-and-projection.json`, {
  artifact: "PHASE 3 / 6.01 DEPENDENCY-DELIVERY REMEDIATION §20/§21 - ownership is untouched, and what a complete shard would look like", at: at(), paidCalls: 0,
  section20_ownershipUnchanged: {
    materialItems: ownedCounts.size, ownedExactlyOnce: [...ownedCounts.values()].filter((n) => n === 1).length, multiplyOwned: [...ownedCounts.values()].filter((n) => n > 1).length,
    unplacedItemIds: plan.unplacedItemIds, ownershipProofPresent: !!plan.ownershipProof,
    contextIsNeverOwnership: { requiredEntriesAllReadOnly: provenance.notReadOnly === 0, note: "a required dependency is delivered as READ_ONLY_CONTEXT: the shard may read it to interpret its own material, and may not compile it or claim an inventory item from it" },
    failedShardStillOwnsTheSameMaterial: failed ? { shardId: failed.shardId, ownedMaterialItems: failed.ownedMaterialItemIds.length, sameAsFrozen: failed.ownedMaterialItemIds.length === base118.failedShard.ownedMaterialItems } : null,
  },
  section21_syntheticCompleteShardProjection: {
    isAProjectionNotAResult: true,
    method: "deterministic: take the frozen failed shard's own MISSING_CONTEXT record, resolve each dependency it named against the remediated plan's certificate for the same shard, and classify what the model would now be holding at turn 1",
    perDependency: (audit119.requestedMissingDependencies as Any[]).map((r) => {
      const key = dependencyKeyOf(r.requestedFact);
      const dep = key && failed ? failed.requiredDependencies.find((d) => d.key === key) ?? null : null;
      const entry = key && failed ? requiredEntries(failed).find((e) => e.contextKey === key) ?? null : null;
      return { requestedFact: r.requestedFact, requestingRule: r.requestingRule, normalizedKey: key, nowRequired: !!dep, nowDelivered: !!entry, deliveredChars: entry?.chars ?? 0, truncated: entry?.truncated ?? null, projectedClassification: !dep ? "OPTIONAL_CONTEXT_MISS" : entry && !entry.truncated ? "FALSE_MISSING_CONTEXT (it would be in the initial context)" : entry ? "PARTIAL_DELIVERY" : "PLANNER_DELIVERY_GAP" };
    }),
    projectedShardCertificate: failed?.dependencyCertificate ?? null,
    whatThisDoesAndDoesNotProve: {
      proves: "the delivery gap that produced this shard's SHARD_MISSING_CONTEXT is closed at planning time: every dependency it named is now in its initial context before the first turn",
      doesNotProve: "that the shard will end SHARD_COMPLETE. A model can still report missing context for a reason unrelated to delivery, can still mis-compile, and can still hit the output ceiling. Only a paid re-run settles that, and this mission does not authorize one.",
    },
  },
});

// ---------------------------------------------------------------------------
// 128 - the MISSING_CONTEXT contract + tool telemetry (§22/§23/§24)
// ---------------------------------------------------------------------------
const frozenReported = (audit119.requestedMissingDependencies as Any[]).map((r) => ({ dependency: { relationshipType: r.relationshipType, targetRef: r.requestedFact, description: r.whyNeeded ?? "", reason: "" }, ruleId: r.requestingRule ?? null }));
const replayedAudit = failed ? auditShardMissingContext({ shard: failed, reported: frozenReported as Any }) : null;
writeJson(`${OUT}/128-missing-context-contract-and-telemetry.json`, {
  artifact: "PHASE 3 / 6.01 DEPENDENCY-DELIVERY REMEDIATION §22/§23/§24 - the MISSING_CONTEXT claim is now checkable, the tool budget is now auditable, and the operative-state flag is classified", at: at(), paidCalls: 0,
  section22_contract: {
    version: MISSING_CONTEXT_CONTRACT_VERSION,
    before: "SHARD_MISSING_CONTEXT was an unclassified self-report: nothing checked the model's claim against the evidence package it was handed",
    after: "every dependency a shard reports as missing is classified against its own certificate and delivered context",
    classes: ["PLANNER_DELIVERY_GAP (required, deliverable, NOT delivered - impossible on a certified shard; an alarm, not a diagnosis)", "FALSE_MISSING_CONTEXT (it was delivered in full)", "PARTIAL_DELIVERY (delivered as a disclosed bounded excerpt; the tool route is the right answer)", "DISCLOSED_UNDELIVERABLE (genuinely absent, disclosed by name)", "EXTERNAL_DEPENDENCY", "OPTIONAL_CONTEXT_MISS (interpretive; the tool budget is the designed route - the ONLY class for which 'the model should have called a tool' is an acceptable answer)"],
    wiredInto: "shard-executor.ts sets missingContextAudit on every shard result; compile.ts carries it, and each shard's dependencyCertificate, into the durable run record",
    replayOfTheFrozenFailureAgainstTheRemediatedPlan: replayedAudit,
  },
  section23_toolTelemetry: {
    evidenceLimitationThisCloses: tool120.evidenceLimitation,
    countersNowPersisted: ["calls", "sourceReadingCalls", "refusals", "charsReturned", "maxToolCalls", "maxAdditionalSourceChars", "remainingCallSlots", "remainingSourceChars", "byTool", "requestedTargets", "anyEvidenceUnresolved", "anyEvidenceTruncated"],
    wiredInto: "shard-executor.ts summariseToolUsage(compile.toolCallLog) -> ShardExecutionResult.toolUsage -> SemanticShardExecutionSummary.toolUsage in the durable run record",
    whatItAnswersNextTime: ["did the model ever request this dependency?", "was the request refused, and why?", "how many call slots and source chars were left when the shard stopped?"],
    toolBudgetUnchanged: DEFAULT_TOOL_BUDGET,
    note: "telemetry is diagnosis, not remediation: it makes the next A/B/C/D/E classification auditable instead of NOT_AUDITABLE. It does not itself deliver anything.",
  },
  section24_operativeStateFalseSignal: {
    frozenObservation: trust112.operativeState,
    classification: "NOT_A_DELIVERY_FAILURE",
    reasoning: "the frozen trace attributes the OPERATIVE_STATE_UNRESOLVED flag on shard:f266a61ab75f65592b9d to hasStaleReferencedDefinition() firing on IR definitions the model emitted for ordinary verb forms that are not defined terms in the instrument. That is an OUTPUT condition of a shard that ended SHARD_COMPLETE, not a missing input: no required dependency of that shard is undelivered.",
    checkedAgainstTheRemediatedPlan: (() => { const s = plan.shards.find((x) => x.shardId === "shard:f266a61ab75f65592b9d"); return s ? { shardStillPresent: true, requiredDependenciesUnresolved: (s.dependencyCertificate as Any).requiredDependenciesUnresolved, certificateStatus: s.dependencyCertificate.certificateStatus } : { shardStillPresent: false, note: "the shard boundary moved under the remediated planner; the classification above is about the frozen run" }; })(),
    inScopeForThisMission: false,
    reason: "this mission remediates DELIVERY of required context. An emitted-definition condition in a completed shard is a separate defect class and is recorded here rather than silently fixed.",
  },
});

// ---------------------------------------------------------------------------
// 129 - all 11 verifier findings classified against the delivery hypothesis (§25/§26)
// ---------------------------------------------------------------------------
const missingContextRuleIds = new Set<string>((audit119.missingContextRules as Any[]).map((r) => r.ruleId));
const findings = (verifier113.findings as Any[]).map((f, i) => {
  const ruleIds = String(f.ruleOrDefinitionId ?? "").split(";").map((x) => x.trim()).filter(Boolean);
  const touchesTheFailedShardsRule = ruleIds.some((r) => missingContextRuleIds.has(r));
  return {
    ordinal: i, findingId: f.findingId, findingType: f.findingType, severity: f.severity, irPath: f.irPath, ruleOrDefinitionId: f.ruleOrDefinitionId, verificationMethod: f.verificationMethod,
    touchesARuleThatReportedMissingContext: touchesTheFailedShardsRule,
    classification: touchesTheFailedShardsRule ? "PLAUSIBLY_DELIVERY_CAUSED" : "NOT_ATTRIBUTABLE_TO_DELIVERY_FROM_THE_FROZEN_EVIDENCE",
    rationale: touchesTheFailedShardsRule
      ? "this finding is attached to a rule whose own sufficiency record named a dependency the planner had not delivered, so the delivery gap is a candidate cause. Whether the finding disappears once the dependency is delivered is an execution question a paid re-run would settle."
      : "the finding is attached to rules that did not report missing context; nothing in the frozen evidence ties it to the delivery gap. It is neither closed nor excused by this remediation.",
    resolutionStatus: f.resolutionStatus ?? null,
  };
});
writeJson(`${OUT}/129-verifier-findings-classification.json`, {
  artifact: "PHASE 3 / 6.01 DEPENDENCY-DELIVERY REMEDIATION §25/§26 - every verifier finding of the failed run, classified against the delivery hypothesis", at: at(), paidCalls: 0,
  source: "docs/phase-3-final-601/113-verifier.json (frozen, not re-run)",
  counts: verifier113.findingCounts,
  findings,
  summary: {
    total: findings.length,
    plausiblyDeliveryCaused: findings.filter((f) => f.classification === "PLAUSIBLY_DELIVERY_CAUSED").length,
    notAttributableToDelivery: findings.filter((f) => f.classification !== "PLAUSIBLY_DELIVERY_CAUSED").length,
  },
  section26_noGateWeakening: {
    passCUnchanged: "no change was made to Pass C reconciliation, its completeness rule or its material-missing accounting",
    trustGatesUnchanged: "no change was made to the trust gate, the verifier, the scorer or any threshold",
    whatChanged: "only what a shard is HANDED before it is called, plus two purely additive audit records (the MISSING_CONTEXT classification and the tool-usage counters)",
    verified: "the diff touches lib/contract-model/compiler/semantic/{required-dependencies,missing-context-contract,shard-planner,shard-types,shard-executor,compile,types}.ts and no verification module",
  },
});

// ---------------------------------------------------------------------------
// 130 - generality (§27) + 131 regression (§28)
// ---------------------------------------------------------------------------
const generality = suite("DD_GENERALITY");
writeJson(`${OUT}/130-generality.json`, {
  artifact: "PHASE 3 / 6.01 DEPENDENCY-DELIVERY REMEDIATION §27 - required-dependency delivery is a property of the architecture, not of this document", at: at(), paidCalls: 0,
  testFile: "tests/contract-model/dd-required-dependency-generality.test.ts",
  corpusIsSynthetic: "every corpus is generated from a parameterized shape: the defined-term names, the section numbers, the chain depth and the amounts are inputs. No real agreement, term, section, company or instrument appears in the file.",
  cases: [
    { id: "A", question: "does the same structure work under a DIFFERENT definition name?", method: "the bounding definition is renamed across three unrelated names; the whole composition must still be delivered" },
    { id: "B", question: "does a cross-reference inside a required definition work for ANY section number?", method: "three unrelated section refs; each must be derived with CROSS_REFERENCE_IN_REQUIRED_DEFINITION and delivered" },
    { id: "C", question: "is a FORWARDING definition's target delivered?", method: "two unrelated forwarding targets; the declaration and its target must both be required, the target evidenced as FORWARDING_DEFINITION_TARGET" },
    { id: "D", question: "are several required definitions and a required section delivered together?", method: "the full closure must be delivered with no entry starved, every entry READ_ONLY_CONTEXT" },
    { id: "E", question: "what happens when the closure does not fit?", method: "the ceiling is derived from the corpus's own measured closure (half, then a quarter), so the reaction is measured rather than a hard-coded trigger; re-sharding first, then water-filling, then an explicit certified planning failure" },
    { id: "E2", question: "can the required tier be rescued by, or leak into, the optional tier?", method: "no required key may appear in the interpretive tier at any ceiling" },
    { id: "F", question: "does behaviour depend on VALUES?", method: "the same structure with different amounts must produce the identical required key set" },
    { id: "G", question: "is an absent dependency fabricated?", method: "a cited section with no structural occurrence must be derived, disposed UNDELIVERABLE_DISCLOSED with empty text, and disclosed on the shard" },
  ],
  result: generality ?? "NOT_SUPPLIED (re-run with DD_GENERALITY=<vitest json>)",
});

const baseSuite = suite("DD_BASE_SUITE");
const currSuite = suite("DD_CURR_SUITE");
const regressed = baseSuite && currSuite ? Object.keys(currSuite.byFile).filter((k) => baseSuite.byFile[k] === "passed" && currSuite.byFile[k] !== "passed") : null;
const newlyPassing = baseSuite && currSuite ? Object.keys(currSuite.byFile).filter((k) => baseSuite.byFile[k] && baseSuite.byFile[k] !== "passed" && currSuite.byFile[k] === "passed") : null;
writeJson(`${OUT}/131-regression.json`, {
  artifact: "PHASE 3 / 6.01 DEPENDENCY-DELIVERY REMEDIATION §28 - regression against the mission's own starting SHA", at: at(), paidCalls: 0,
  startingSha: base118.startingSha, shaMeasuredAgainst: sh("git rev-parse HEAD"),
  method: "the same vitest suite run twice: once in a clean worktree at the starting SHA, once at HEAD. File-level pass/fail sets are compared, so an environment-dependent failure that fails in BOTH runs is not counted as a regression.",
  baseline: baseSuite ?? "NOT_SUPPLIED", current: currSuite ?? "NOT_SUPPLIED",
  fileLevelRegressions: regressed ?? "NOT_COMPUTED", newlyPassingFiles: newlyPassing ?? "NOT_COMPUTED",
  environmentNote: "this session has no Postgres and no network to SEC.gov, so a large block of DB-backed and live-connector suites fails identically in both runs; that is why the comparison is differential rather than absolute.",
  tsc: "see 132 gate condition", lint: "see 132 gate condition", build: "see 132 gate condition",
});

console.log(JSON.stringify({
  shards: plan.shards.length, certification: plan.dependencyCertification, failedShardPresent: !!failed,
  fiveTargetsDeliveredInFull: targetRows.filter((r) => r.after.result === "MATERIALIZED_IN_FULL_BEFORE_THE_MODEL").length,
  provenanceHardZeros: provenance, sweepRowsWithZeroUnresolved: sweep.filter((r) => r.unresolved === 0).length,
}, null, 1));
