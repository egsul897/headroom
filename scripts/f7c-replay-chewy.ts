/**
 * F-7C §22/§43/§44 - ZERO-COST replay of the certified 36-shard Chewy 1.01 canary through the ACTIVATED PUBLIC
 * production entry point compileCovenantToIR. Every collaborator that could spend money is replaced by one that throws:
 * the semantic caller, the Pass A StageCaller and the shard executor. If the production path makes any model call, or
 * executes any shard, this script fails loudly. The 36 certified terminal results are injected by exact shardHash and
 * the frozen inventory is resumed by content hash.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { compileCovenantToIR } from "../lib/contract-model/compiler/semantic/compile";
import { InMemorySemanticCompilationCache } from "../lib/contract-model/compiler/semantic/cache";
import type { SemanticCaller } from "../lib/contract-model/compiler/semantic/caller";
import type { StageCaller } from "../lib/contract-model/compiler/llm-caller";
import type { ShardExecutionResult } from "../lib/contract-model/compiler/semantic/shard-types";
import { F7A_BASELINE, freezeAndPlan, gitSha, writeJson } from "./f7b-lib";
import { loadFrozenStage1, loadStage2, stitchAll } from "./f7b3-lib";
import { scoreCanary } from "./f7b-score";
import { buildChewy, CHWY_RUN } from "./f7a-lib";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const OUT = "docs/phase-3-remediation-f7c";
const CERTIFIED = JSON.parse(readFileSync("docs/phase-3-remediation-f7b3e/02-final-36-shard-evaluation.json", "utf8"));

// Collaborators that PROVE zero spend by construction.
let semanticCalls = 0, inventoryCalls = 0, executorCalls = 0;
const throwingCaller: SemanticCaller = { providerName: "vercel-ai-gateway", model: CERTIFIED.score?.provider ?? "replay-model", isSynthetic: false, compile: async () => { semanticCalls++; throw new Error("F-7C replay: the semantic caller must never be invoked"); } };
const throwingInventory: StageCaller = { providerName: "replay", model: "replay", isSynthetic: false, call: async () => { inventoryCalls++; throw new Error("F-7C replay: Pass A must never run - the frozen inventory is resumed"); }, lastTelemetry: () => null };

(async () => {
  const frozen = freezeAndPlan();
  const { plan, callerInput, unit } = frozen;
  const chewy = buildChewy();
  const sec = chewy.index.getNodeById((unit as unknown as { unit: { nodeId: string } }).unit.nodeId)!;
  // The ORIGINAL caller-facing input - what a production caller hands compileCovenantToIR: the node's own text, no
  // pre-resolved sourceContext, no frozenInventory on the input (the frozen inventory is resumed via options).
  const baseInput = { ...callerInput, operativeSourceText: chewy.index.getNodeText(sec.nodeId, "DESCENDANTS"), operativeCharStart: sec.charStart, sourceContext: undefined, frozenInventory: undefined };
  const fixtureInventory = JSON.parse(readFileSync(`${CHWY_RUN}/unit-1.01.json`, "utf8")).compile.frozenInventory;

  const s1 = loadFrozenStage1(); const s2 = loadStage2();
  const prior = new Map<string, ShardExecutionResult>();
  const certifiedResults: ShardExecutionResult[] = [];
  for (const s of plan.shards) { const e = s1.get(s.shardId) ?? s2.get(s.shardId); if (!e) throw new Error(`missing certified result for ${s.shardId}`); prior.set(e.result.shardHash, e.result); certifiedResults.push(e.result); }
  if (prior.size !== 36) throw new Error(`expected 36 prior results, found ${prior.size}`);

  const started = Date.now();
  const result = await compileCovenantToIR(baseInput, {
    caller: throwingCaller, inventoryCaller: throwingInventory, inventoryMode: "SINGLE_PASS",
    cache: new InMemorySemanticCompilationCache(),
    frozenInventory: fixtureInventory,
    priorShardResults: prior,
    shardExecutor: async (shard) => { executorCalls++; throw new Error(`F-7C replay: shard ${shard.shardId} must be reused, not executed`); },
  });
  const elapsedMs = Date.now() - started;

  // ---- the certified stitch over the SAME 36 results, for field-by-field comparison and as the F-7B.3D scorer's input
  const certifiedStitch = stitchAll(frozen, certifiedResults);
  const records = plan.shards.map((s) => (s1.get(s.shardId) ?? s2.get(s.shardId))!.record);
  const score = scoreCanary(frozen, certifiedResults, records, certifiedStitch, records.map((r) => ({ shardId: r.shardId, turn: 1, inputTokens: r.actual.inputTokens, outputTokens: r.actual.outputTokens, costUsd: r.actual.costUsd })));

  const ex = result.execution!;
  const sh = ex.sharded!;
  const acc = result.accountability!;
  const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const cert = CERTIFIED;
  type Row = { field: string; certified: unknown; replay: unknown; classification: "equal" | "intentionally_additive" | "mismatch"; note?: string };
  const rows: Row[] = [];
  const cmp = (field: string, certified: unknown, replay: unknown, note?: string) => rows.push({ field, certified, replay, classification: eq(certified, replay) ? "equal" : "mismatch", note });
  const additive = (field: string, certified: unknown, replay: unknown, note: string) => rows.push({ field, certified, replay, classification: "intentionally_additive", note });

  cmp("executionMode", "SHARDED", ex.mode);
  cmp("frozenInventoryResume.method", "VERIFIED_BY_RE_ANCHORING", ex.frozenInventoryResume?.method ?? null);
  cmp("planHash", F7A_BASELINE.planHash, ex.planHash);
  cmp("plannedShards", 36, ex.plannedShards);
  cmp("reusedShards", 36, sh.reused);
  cmp("executedShards", 0, sh.executed);
  cmp("providerCalls", 0, sh.providerCalls + semanticCalls + inventoryCalls + executorCalls);
  cmp("rules", cert.stitched.rules, result.rules.length);
  cmp("definitions", cert.stitched.definitions, result.definitions.length);
  cmp("sharedCapacities", cert.stitched.sharedCapacities, result.sharedCapacities.length);
  cmp("definitionConflicts", cert.stitched.definitionConflicts, sh.definitionConflicts);
  cmp("conflictVariants", cert.stitched.conflictVariants, sh.conflictVariants);
  cmp("contextualEmissions", cert.stitched.contextualEmissions, sh.contextualEmissions);
  cmp("collisionsByKind", cert.stitched.collisionsByKind, sh.collisionsByKind);
  cmp("unresolvedOwnedItems", cert.stitched.unresolvedOwnedItems, sh.unresolvedOwnedItems);
  cmp("stitchedStatus", cert.stitched.status, sh.stitchedStatus);
  cmp("stitchedFailureReasons", cert.stitched.failureReasons, sh.stitchedFailureReasons);
  cmp("materialTotal", cert.accountability.materialTotal, acc.counts.material);
  cmp("represented", cert.accountability.represented, acc.counts.represented);
  cmp("intentionallyNonComputational", cert.accountability.intentionallyNonComputational, acc.counts.intentionallyNonComputational);
  cmp("unsupported", cert.accountability.unsupported, acc.counts.unsupported);
  cmp("ambiguous", cert.accountability.ambiguous, acc.counts.ambiguous);
  cmp("materialMissing", cert.accountability.missing, acc.counts.materialMissingFromComposition);
  cmp("globalPassC.counts", cert.accountability.globalPassC, acc.counts);
  cmp("attributionProofCounts", { PLANNER_DEFINITION_UNIT: cert.attribution.PLANNER_DEFINITION_UNIT, OWNED_INVENTORY_LINEAGE: cert.attribution.OWNED_INVENTORY_LINEAGE, UNIQUE_PRIMARY_SOURCE_DECLARATION: cert.attribution.UNIQUE_PRIMARY_SOURCE_DECLARATION, NONE: cert.attribution.NONE }, sh.attributionProofCounts);
  // Deep identity of the canonical IR and the review evidence against the certified stitcher run over the same results.
  cmp("rules.deepEqualToCertifiedStitch", sha256(JSON.stringify(certifiedStitch.rules)), sha256(JSON.stringify(result.rules)));
  cmp("definitions.deepEqualToCertifiedStitch", sha256(JSON.stringify(certifiedStitch.definitions)), sha256(JSON.stringify(result.definitions)));
  cmp("sharedCapacities.deepEqualToCertifiedStitch", sha256(JSON.stringify(certifiedStitch.sharedCapacities)), sha256(JSON.stringify(result.sharedCapacities)));
  cmp("accountability.deepEqualToCertifiedStitch", sha256(JSON.stringify(certifiedStitch.accountability)), sha256(JSON.stringify(result.accountability)));
  cmp("definitionConflictEvidence.deepEqualToCertifiedStitch", sha256(JSON.stringify(certifiedStitch.definitionConflicts)), sha256(JSON.stringify(sh.definitionConflictEvidence)));
  cmp("unresolvedOwnedItemList.deepEqualToCertifiedStitch", sha256(JSON.stringify(certifiedStitch.unresolvedOwnedItems)), sha256(JSON.stringify(sh.unresolvedOwnedItemList)));
  // Trust counts from the F-7B.3D authoritative scorer over the certified stitch - identical inputs, deep-equal outputs.
  const t = score.trust;
  cmp("trust.ownedValuesLost", cert.trust.ownedValuesLostByStitching, t.valuesLostByStitching);
  cmp("trust.distinctOwnedLineageLost", cert.trust.distinctOwnedLineageLost, t.ownedLineageDistinctLost);
  cmp("trust.sourceUnverifiableAuthoritativeIr", cert.trust.sourceUnverifiableAuthoritativeIr, t.sourceUnverifiableIrSurviving);
  cmp("trust.contextualOwnershipCredit", cert.trust.contextualOwnershipCreditViolations, t.contextualOwnershipCredit);
  cmp("trust.dangerousSilentOmissions", cert.trust.dangerousSilentOmissions, t.dangerousSilentOmissions);
  cmp("trust.falseCompleteness", cert.trust.falseCompleteness, t.falseCompleteness);
  cmp("trust.silentIncompatibleMerges", cert.trust.silentIncompatibleMerges, t.conflictingDuplicateSilentlyMerged);
  cmp("trust.newDanglingRefs", cert.trust.newDanglingReferences, t.danglingReferencesCausedByStitching);
  cmp("trust.hiddenFailedShards", cert.trust.hiddenFailedShards, t.failedShardHidden);
  cmp("trust.hiddenMissingMaterial", cert.trust.hiddenMissingMaterialItems, t.missingMaterialOwnedItemHidden);
  // Whole-unit layering the harness never applied: disclosed, never hidden.
  const extraReasons = result.failureReasons.filter((r) => !sh.stitchedFailureReasons.includes(r));
  additive("failureReasons", cert.stitched.failureReasons, result.failureReasons, `production adds whole-unit signals on top of the certified stitch reasons: ${JSON.stringify(extraReasons)} (frozen inventory status ${fixtureInventory.inventoryStatus}; whole-unit definition-completeness check ${result.definitionCompletenessCheck ? "fired" : "did not fire"})`);
  additive("status", cert.stitched.status, result.status, "the stitcher's status is the floor; whole-unit signals can only demote, and PARTIAL is not demotable");
  additive("cacheKey.includesExecutionIdentity", null, result.cacheKey, "outer cache key now folds in the execution-policy identity and the resumed frozen-inventory hash");
  additive("telemetry.aggregate", null, result.telemetry, "summed across the 36 reused results; attemptCount = executed = 0");

  const mismatches = rows.filter((r) => r.classification === "mismatch");
  const verdict = mismatches.length === 0 && semanticCalls === 0 && inventoryCalls === 0 && executorCalls === 0 && sh.reused === 36 && sh.executed === 0 ? "REPLAY_EQUIVALENT" : "F7C_PRODUCTION_PATH_SEMANTIC_DRIFT";
  writeJson(`${OUT}/01-chewy-production-route-replay.json`, {
    artifact: "F-7C §22/§43 - the certified 36-shard Chewy 1.01 canary replayed through the activated public compileCovenantToIR (0 model calls, $0)",
    at: new Date().toISOString(), gitSha: gitSha(), elapsedMs,
    zeroSpendProof: { semanticCallerInvocations: semanticCalls, passAInvocations: inventoryCalls, shardExecutorInvocations: executorCalls, note: "every collaborator that could spend was replaced by one that throws; none was reached" },
    resumedFrozenInventory: { frozenContentHash: fixtureInventory.frozenContentHash, items: fixtureInventory.items.length, inventoryStatus: fixtureInventory.inventoryStatus, algorithmVersion: fixtureInventory.algorithmVersion, carriesSourceContextHash: Boolean(fixtureInventory.sourceContextHash) },
    // F-7C.1: how the legacy (no sourceContextHash) certified inventory was proven to belong to the current Chewy source context
    frozenInventoryResume: ex.frozenInventoryResume ?? null,
    execution: { ...ex, sharded: { ...sh, definitionConflictEvidence: `${sh.definitionConflictEvidence.length} conflicts (compared by hash above)`, shards: sh.shards.map((s) => ({ ordinal: s.ordinal, shardId: s.shardId, status: s.status, reused: s.reusedFromHash, attempts: s.attempts })) } },
    result: { status: result.status, failureReasons: result.failureReasons, rules: result.rules.length, definitions: result.definitions.length, sharedCapacities: result.sharedCapacities.length, unresolvedIssues: result.unresolvedIssues.length, toolCallLog: result.toolCallLog.length, rawModelOutput: result.rawModelOutput, definitionCompletenessCheckFired: !!result.definitionCompletenessCheck, accountabilityCounts: acc.counts, semanticallyComplete: acc.semanticallyComplete, inputHasUnresolvedOperativeEvidence: result.inputHasUnresolvedOperativeEvidence, telemetry: result.telemetry },
    scorerOverCertifiedStitch: { trust: score.trust, proofClassCounts: score.H.proofClassCounts },
    verdict,
  });
  writeJson(`${OUT}/02-certified-vs-activated-differential.json`, { artifact: "F-7C §44 - CERTIFIED_CANARY_RESULT vs NEW_PRODUCTION_ACTIVATION_REPLAY, every trust-significant field classified", at: new Date().toISOString(), rows, equal: rows.filter((r) => r.classification === "equal").length, intentionallyAdditive: rows.filter((r) => r.classification === "intentionally_additive").length, mismatches: mismatches.length, mismatchList: mismatches, verdict });
  console.log(JSON.stringify({ verdict, mode: ex.mode, planHash: ex.planHash, reused: sh.reused, executed: sh.executed, calls: { semanticCalls, inventoryCalls, executorCalls }, status: result.status, failureReasons: result.failureReasons, rules: result.rules.length, definitions: result.definitions.length, caps: result.sharedCapacities.length, conflicts: sh.definitionConflicts, variants: sh.conflictVariants, passC: acc.counts, proofs: sh.attributionProofCounts, trust: score.trust, equal: rows.filter((r) => r.classification === "equal").length, additive: rows.filter((r) => r.classification === "intentionally_additive").length, mismatches: mismatches.map((m) => m.field) }, null, 1));
})();
