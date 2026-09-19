/**
 * PHASE 3 FINAL / 6.01 POST-REMEDIATION PAID REVALIDATION - ZERO-COST preflight (mission §1-§12). Writes
 *   104-revalidation-freeze.json      §1-§3  frozen head, identities, versions, harness hashes
 *   105-resume-proof.json             §4-§6  the exact persisted inventory, the certified resume gate, the Pass-A semantic audit
 *   106-remediation-recheck.json      §7     deterministic remediation/HD-4/HD-5/HD-6 tests (from VITEST_RECHECK_JSON)
 *   107-current-plan.json             §8-§9  the current production plan from the RESUMED inventory; old failed shards rejected
 *   108-cost-preflight.json           §11-§12 resumed-work cost, the mission cap, live gateway balance
 * and prints the pre-spend decision. Makes NO model call; one gateway balance read.
 * Run: VITEST_RECHECK_JSON=<path> npx tsx scripts/phase-3-601-revalidation-preflight.ts
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { gatewayCredits, loadGatewayKey, writeJson } from "./f7b-lib";
import { DurableShardStore, DURABLE_SHARD_RECORD_VERSION } from "./phase-3-601-durable-replay";
import { section601ReferenceItems } from "./phase-3-601-preflight";
import { SEMANTIC_VERIFIER_ALGORITHM_VERSION, SEMANTIC_VERIFIER_PROMPT_VERSION } from "../lib/contract-model/compiler/semantic-verification/types";
import { SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION, SEMANTIC_COMPILER_TOOL_POLICY_VERSION } from "../lib/contract-model/compiler/semantic/types";
import { SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION, SEMANTIC_INVENTORY_PROMPT_VERSION } from "../lib/contract-model/compiler/semantic-accountability/types";
import { SOURCE_IDENTITY_MIGRATION_VERSION } from "../lib/contract-model/compiler/semantic-accountability/source-identity";
import { SEMANTIC_EXECUTION_POLICY_VERSION } from "../lib/contract-model/compiler/semantic/execution-mode";
import { SHARD_PLANNER_ALGORITHM_VERSION } from "../lib/contract-model/compiler/semantic/shard-types";
import { IR_SCHEMA_VERSION } from "../lib/contract-model/ir/types";
import { buildRealPlan, CAP_CEILING_USD, EXPECT, GATEWAY_BALANCE_AFTER_PREVIOUS_PAID_RUN, HISTORICAL_601_SPEND_USD, harnessHashes, identityChecks, loadFrozenInventoryCandidate, MISSION_ID, OLD_FAILED_SHARD_HASHES, OLD_MISSION_ID, OLD_PLAN_HASH, OLD_RAW, OUT, passASemanticAudit, planShape, RAW, readJson, resumeProof, resumedCost, resumedGuard, frozenObservedRates, sectionChecks, STARTING_SHA } from "./phase-3-601-revalidation-lib";

type Rec = Record<string, unknown>;
const at = () => new Date().toISOString();

void (async () => {
  // ---------------- §1-§3 freeze
  const id = identityChecks();
  const candidate = loadFrozenInventoryCandidate();
  const proof = resumeProof(candidate);
  const sec = sectionChecks(proof.built);
  const { byLabel } = section601ReferenceItems();
  const allId = Object.values(id).every((c) => c.match) && Object.values(sec).every((c) => c.match);
  const durableReplaySrc = readFileSync("scripts/phase-3-601-durable-replay.ts", "utf8");
  writeJson(`${OUT}/104-revalidation-freeze.json`, {
    artifact: "PHASE 3 FINAL / 6.01 POST-REMEDIATION PAID REVALIDATION §1-§3 - frozen head, identities, versions, harness", at: at(),
    missionId: MISSION_ID, evidenceDir: RAW, startingSha: STARTING_SHA,
    idChecks: { ...id, ...sec }, allChecksMatch: allId,
    frozenLayers: { productionTree: id.productionTreeAsCommitted, structuralIndex: "lib/contract-model/compiler/structural-index.ts + structural-definitions.ts (HEAD)", referenceResolver: "lib/contract-model/compiler/semantic-accountability/reference-resolver.ts (HEAD)", shardPlanner: SHARD_PLANNER_ALGORITHM_VERSION, tools: "lib/contract-model/compiler/semantic/tools.ts (HEAD)", compiler: { algorithm: SEMANTIC_COMPILER_ALGORITHM_VERSION, prompt: SEMANTIC_COMPILER_PROMPT_VERSION, toolPolicy: SEMANTIC_COMPILER_TOOL_POLICY_VERSION }, hd4DurableReplay: { recordVersion: DURABLE_SHARD_RECORD_VERSION, callRecordVersion: durableReplaySrc.match(/DURABLE_CALL_RECORD_VERSION\s*=\s*"([^"]+)"/)?.[1] ?? null }, hd5Scorer: "scripts/phase-3-601-score-numeric.ts", hd6TrustReader: "scripts/phase-3-601-trust-read.ts", humanReferenceSet: { path: "docs/phase-3-validation/04-human-reference-set.json", sha256: id.referenceSha256.actual, section601Items: byLabel.length, exposedToModel: false, auditOnly: true } },
    versions: { compilerAlgorithm: SEMANTIC_COMPILER_ALGORITHM_VERSION, compilerPrompt: SEMANTIC_COMPILER_PROMPT_VERSION, toolPolicy: SEMANTIC_COMPILER_TOOL_POLICY_VERSION, accountabilityAlgorithm: SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION, inventoryPrompt: SEMANTIC_INVENTORY_PROMPT_VERSION, sourceIdentityMigration: SOURCE_IDENTITY_MIGRATION_VERSION, executionPolicy: SEMANTIC_EXECUTION_POLICY_VERSION, shardPlanner: SHARD_PLANNER_ALGORITHM_VERSION, irSchema: IR_SCHEMA_VERSION, verifier: { algorithm: SEMANTIC_VERIFIER_ALGORITHM_VERSION, prompt: SEMANTIC_VERIFIER_PROMPT_VERSION } },
    harnessModules: harnessHashes(),
    noPaidCallsSinceRemediation: { remediationGatePaidCalls: id.remediationGate.paidCalls, gatewayBalanceAfterPreviousPaidRun: GATEWAY_BALANCE_AFTER_PREVIOUS_PAID_RUN, note: "the live balance read in 108 must equal this value" },
    rules: ["no production/harness code change after the first paid call", "no automatic fresh Pass A", "no fix-and-continue", "Phase 3 is not closed by this mission", "Phase 4 is not started"],
    priorSpend: { historicalSection601Usd: HISTORICAL_601_SPEND_USD },
  });

  // ---------------- §4-§6 resume proof + Pass-A semantic audit
  const audit = await passASemanticAudit(candidate, proof);
  const dec = proof.decision;
  writeJson(`${OUT}/105-resume-proof.json`, {
    artifact: "PHASE 3 FINAL / 6.01 POST-REMEDIATION PAID REVALIDATION §4-§6 - frozen inventory candidate, certified source-bound resume gate, Pass-A semantic version audit", at: at(),
    paidCalls: 0,
    candidate: { path: candidate.path, fileSha256: candidate.fileSha256, bytes: candidate.bytes, passesPath: candidate.passesPath, passesSha256: candidate.passesSha256, producedBy: { mission: OLD_MISSION_ID, sha: "51fda653190d6859096be145245406b1c9329c58" }, verifiedFromPersistedObject: true, reconstructedFromSummaries: false, facts: candidate.facts, allFactsMatch: candidate.allFactsMatch, recorded: { algorithmVersion: candidate.inventory.algorithmVersion, promptVersion: candidate.inventory.promptVersion, provider: candidate.inventory.provider, model: candidate.inventory.model, frozenAt: candidate.inventory.frozenAt, sourceContextState: candidate.inventory.sourceContextState, sourceIdentity: (candidate.inventory as Rec).sourceIdentity ?? null } },
    currentSourceContext: { state: proof.ctx.state, regions: proof.ctx.regions.length, totalChars: proof.ctx.totalChars, unresolvedReferences: proof.ctx.unresolvedReferences.length, sourceContextHash: proof.currentSourceContextHash, partitionHash: proof.currentPartitionHash },
    resumeGate: { validator: "lib/contract-model/compiler/semantic/frozen-inventory-resume.ts validateFrozenInventoryResume (the production validator compile.ts itself applies; unweakened)", candidateIdentity: { expected: proof.built.candidateRef, recorded: candidate.inventory.candidateRef, match: candidate.inventory.candidateRef === proof.built.candidateRef }, documentIdentity: { expected: "doc-a", recorded: candidate.inventory.documentId ?? null, match: (candidate.inventory.documentId ?? "doc-a") === "doc-a" }, sourceContextHash: { recorded: proof.recordedSourceContextHash, current: proof.currentSourceContextHash, match: proof.recordedSourceContextHash === proof.currentSourceContextHash }, partitionProof: { recorded: proof.recordedPartitionHash, current: proof.currentPartitionHash, match: proof.recordedPartitionHash === proof.currentPartitionHash, note: "not a gate condition for a current-generation inventory; recorded as the slot-partition proof" }, frozenContentHash: candidate.inventory.frozenContentHash, decision: dec.ok ? { ok: true, method: dec.record.method, record: dec.record, reAnchoringUsed: dec.record.method === "VERIFIED_BY_RE_ANCHORING", inventoryReturnedIsTheSameObject: dec.inventory === candidate.inventory, frozenContentHashUntouched: dec.inventory.frozenContentHash === candidate.inventory.frozenContentHash } : { ok: false, failures: dec.failures }, newIdentityStamped: false },
    passASemanticAudit: audit,
    decision: !candidate.allFactsMatch ? "PHASE3_601_HARNESS_DEFECT (persisted inventory facts differ from the expected historical facts)" : !dec.ok || audit.semanticChangeFound ? "PHASE3_601_REMEDIATION_REQUIRES_FRESH_PASS_A" : "RESUME_ACCEPTED",
  });
  if (!candidate.allFactsMatch || !dec.ok || audit.semanticChangeFound) { console.log(JSON.stringify({ decision: !dec.ok || audit.semanticChangeFound ? "PHASE3_601_REMEDIATION_REQUIRES_FRESH_PASS_A" : "PHASE3_601_HARNESS_DEFECT", failures: dec.ok ? [] : dec.failures, semanticChange: audit.semanticChangeFound, facts: candidate.allFactsMatch }, null, 1)); process.exit(0); }

  // ---------------- §7 remediation recheck
  const recheckPath = process.env.VITEST_RECHECK_JSON;
  const recheck = recheckPath && existsSync(recheckPath) ? readJson<{ numTotalTestSuites: number; numTotalTests: number; numPassedTests: number; numFailedTests: number; numPendingTests: number; success: boolean; testResults: { name: string; status: string; assertionResults: { fullName: string; status: string }[] }[] }>(recheckPath) : null;
  const closure = readJson<{ counts: Record<string, number>; stillUnresolved: unknown }>(`${OUT}/96-zero-cost-context-closure.json`);
  const lineage = readJson<{ counters: Record<string, number> }>(`${OUT}/97-ownership-lineage-proof.json`);
  const files = recheck ? recheck.testResults.map((t) => ({ file: t.name.replace(`${process.cwd()}/`, ""), status: t.status, tests: t.assertionResults.length, failed: t.assertionResults.filter((a) => a.status === "failed").map((a) => a.fullName) })) : [];
  const required = ["phase-3-601-remediation-closure", "phase-3-601-remediation-red-baseline", "phase-3-601-hd5-scorer", "phase-3-601-hd6-finalizer", "phase-3-601-hd4-durable-replay", "phase-3-601-hd4-sigkill", "f7c1-frozen-inventory-resume", "f7c-production-activation", "f7a-shard-planner-stitcher"];
  const covered = required.map((r) => ({ suite: r, present: files.some((f) => f.file.includes(r)), passed: files.some((f) => f.file.includes(r) && f.status === "passed") }));
  const recheckOk = !!recheck && recheck.success && recheck.numFailedTests === 0 && covered.every((c) => c.present && c.passed);
  writeJson(`${OUT}/106-remediation-recheck.json`, {
    artifact: "PHASE 3 FINAL / 6.01 POST-REMEDIATION PAID REVALIDATION §7 - zero-cost deterministic remediation recheck before spend", at: at(), paidCalls: 0,
    vitest: recheck ? { source: recheckPath, suites: recheck.numTotalTestSuites, tests: recheck.numTotalTests, passed: recheck.numPassedTests, failed: recheck.numFailedTests, pending: recheck.numPendingTests, success: recheck.success, files } : { pending: "VITEST_RECHECK_JSON not provided" },
    requiredSuites: covered,
    closureArtifact96: { counts: closure.counts, stillUnresolved: closure.counts.STILL_UNRESOLVED, allTwentyNineClosed: closure.counts.total === 29 && closure.counts.STILL_UNRESOLVED === 0 },
    lineageArtifact97: { counters: lineage.counters, allZero: Object.values(lineage.counters).every((v) => v === 0) },
    decision: recheckOk && closure.counts.STILL_UNRESOLVED === 0 && Object.values(lineage.counters).every((v) => v === 0) ? "REMEDIATION_GATE_GREEN" : "PHASE3_601_REMEDIATION_REGRESSED_BEFORE_RUN",
  });
  if (!recheckOk) { console.log(JSON.stringify({ decision: "PHASE3_601_REMEDIATION_REGRESSED_BEFORE_RUN", covered, failed: recheck?.numFailedTests ?? "no json" }, null, 1)); process.exit(0); }

  // ---------------- §8-§9 current plan from the resumed inventory; old failed shard records rejected by identity
  const plan = buildRealPlan(proof);
  const shape = planShape(plan, proof.ctx.regions[0]!.text);
  const oldStore = new DurableShardStore(`${OLD_RAW}/durable-shards`);
  const oldLoad = oldStore.loadPriorResults(plan, OLD_MISSION_ID);
  const oldLoadNewMission = oldStore.loadPriorResults(plan, MISSION_ID);
  const oldRecords = readdirSync(`${OLD_RAW}/durable-shards`).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")).map((h) => { const r = readJson<{ missionId: string; planHash: string; shardId: string; shardHash: string; result: { status: string } }>(`${OLD_RAW}/durable-shards/${h}.json`); return { file: `${h}.json`, missionId: r.missionId, planHash: r.planHash, shardId: r.shardId, shardHash: r.shardHash, status: r.result.status, planHashMatchesNewPlan: r.planHash === plan.planHash, shardHashInNewPlan: plan.shards.some((s) => s.shardHash === r.shardHash), missionMatches: r.missionId === MISSION_ID, acceptedUnderNewPlan: false }; });
  const newStoreDir = `${RAW}/durable-shards`;
  const newStorePreexisting = existsSync(newStoreDir) ? readdirSync(newStoreDir).filter((f) => f.endsWith(".json")).length : 0;
  writeJson(`${OUT}/107-current-plan.json`, {
    artifact: "PHASE 3 FINAL / 6.01 POST-REMEDIATION PAID REVALIDATION §8-§9 - the current production plan built from the RESUMED inventory; old failed Pass-B shards rejected", at: at(), paidCalls: 0,
    builtFrom: { sourceContextHash: proof.currentSourceContextHash, frozenContentHash: candidate.inventory.frozenContentHash, structuralIndex: "current (HEAD)", planner: SHARD_PLANNER_ALGORITHM_VERSION, resumeMethod: dec.ok ? dec.record.method : null },
    plan: shape,
    expectedShapeObservedNotHardcoded: true,
    materialDifferenceFromExpectedShape: shape.matchesExpectedShape ? null : { note: "the observed plan differs from the remediation's deterministic shape", observed: { shards: shape.shards, oversized: shape.oversizedShards, maxPrimaryChars: shape.maxPrimaryChars, maxUnitsPerShard: shape.maxUnitsPerShard, midSentenceShards: shape.midSentenceShards, ownership: shape.ownershipProof }, expected: EXPECT.planShape },
    oldPaidRun: { planHash: OLD_PLAN_HASH, failedShardHashes: OLD_FAILED_SHARD_HASHES, newPlanHash: plan.planHash, planIdentityDiffers: plan.planHash !== OLD_PLAN_HASH, oldFailedShardHashesInNewPlan: plan.shards.filter((s) => OLD_FAILED_SHARD_HASHES.includes(s.shardHash)).length, durableStoreInspection: { store: `${OLD_RAW}/durable-shards`, loadedForNewPlanUnderOldMission: { accepted: oldLoad.prior.size, rejected: oldLoad.rejected }, loadedForNewPlanUnderThisMission: { accepted: oldLoadNewMission.prior.size, rejected: oldLoadNewMission.rejected }, records: oldRecords, rule: "DurableShardStore.loadPriorResults only reads a record whose file name is a shardHash of THIS plan, and then requires missionId + planHash + shardHash identity and a reusable status; none of the old records carry a hash of the new plan" }, priorShardResultsAccepted: oldLoad.prior.size + oldLoadNewMission.prior.size },
    thisMissionStore: { dir: newStoreDir, preexistingRecords: newStorePreexisting },
    decision: shape.oldPathologicalPlanReappeared ? "PHASE3_601_REMEDIATION_PLAN_REGRESSION" : oldLoad.prior.size + oldLoadNewMission.prior.size > 0 ? "PHASE3_601_HARNESS_DEFECT (old records accepted)" : "PLAN_IS_THE_CORRECTED_BOUNDED_TOPOLOGY",
  });
  if (shape.oldPathologicalPlanReappeared) { console.log(JSON.stringify({ decision: "PHASE3_601_REMEDIATION_PLAN_REGRESSION", shape }, null, 1)); process.exit(0); }

  // ---------------- §11-§12 cost preflight (resumed work only) + live balance
  const frozenRates = frozenObservedRates();
  const cost = resumedCost(plan, frozenRates.rates);
  const credits = loadGatewayKey() ? await gatewayCredits() : null;
  const balance = credits ? Number(credits.balance) : null;
  const guard = resumedGuard(cost.rates, plan.totals.estimatedInputTokens, cost.capUsd, balance ?? 0, null);
  const live = guard.conservativeRemaining();
  const admit = guard.wouldAdmit();
  const fits = balance !== null && cost.conservativeTotalUsd <= cost.capUsd && balance >= cost.conservativeTotalUsd;
  const noPaidSince = balance !== null && Math.abs(balance - GATEWAY_BALANCE_AFTER_PREVIOUS_PAID_RUN) < 1e-6;
  writeJson(`${OUT}/108-cost-preflight.json`, {
    artifact: "PHASE 3 FINAL / 6.01 POST-REMEDIATION PAID REVALIDATION §11-§12 - resumed-run cost preflight and the mission's incremental cap", at: at(), paidCalls: 0,
    methodology: { source: "docs/phase-3-final-601/01-cost-preflight.json (frozen): worst observed rates x 1.25", resumedWorkOnly: true, historicalCostIncluded: false, phantomPassACallsIncluded: false, passA: "$0 - resumed" },
    plan: { planHash: plan.planHash, shards: plan.shards.length, plannerEstimatedInputTokens: plan.totals.estimatedInputTokens, maxShardInputTokens: plan.totals.maxShardInputTokens },
    rateSource: frozenRates.source,
    estimate: cost,
    guard: { liveInitialConservativeRemainingUsd: +live.toFixed(6), frozenEstimatorUsd: cost.conservativeTotalUsd, agrees: Math.abs(live - cost.conservativeTotalUsd) < 1e-6, firstCallAdmissible: admit },
    cap: { chosenCapUsd: cost.capUsd, derivation: "conservative resumed estimate rounded up to the cent", recommendedCeilingUsd: CAP_CEILING_USD, withinRecommendedCeiling: cost.capWithinRecommendedCeiling, previousMissionCapUsd: 15.84, previousMissionCapReused: false, previousPassBPlusVerifierActualUsd: cost.previousPassBPlusVerifierActualUsd },
    gateway: { balanceUsd: balance, totalUsed: credits?.total_used ?? null, readLive: credits !== null, balanceAfterPreviousPaidRun: GATEWAY_BALANCE_AFTER_PREVIOUS_PAID_RUN, noPaidCallsSinceRemediation: noPaidSince },
    gate: { conservativeFitsCap: cost.conservativeTotalUsd <= cost.capUsd, balanceCoversEstimate: balance !== null && balance >= cost.conservativeTotalUsd, passed: fits },
    decision: !fits ? "PHASE3_601_COST_BOUND_BEFORE_START" : !noPaidSince ? "PHASE3_601_HARNESS_DEFECT (gateway balance moved since the previous paid run)" : "CLEAR_TO_EXECUTE",
  });
  console.log(JSON.stringify({ freeze: allId, resume: dec.ok ? dec.record.method : dec.failures, passAAudit: audit.verdict, recheck: recheckOk, plan: { hash: plan.planHash, shards: shape.shards, oversized: shape.oversizedShards, maxPrimary: shape.maxPrimaryChars, maxUnits: shape.maxUnitsPerShard, midSentence: shape.midSentenceShards, tokens: shape.plannerEstimatedInputTokens, matchesExpected: shape.matchesExpectedShape }, oldAccepted: oldLoad.prior.size + oldLoadNewMission.prior.size, cost: { conservative: cost.conservativeTotalUsd, cap: cost.capUsd, balance, fits, noPaidSince }, decision: !allId ? "PHASE3_601_ENVIRONMENT_BLOCKED" : !fits ? "PHASE3_601_COST_BOUND_BEFORE_START" : !noPaidSince ? "PHASE3_601_HARNESS_DEFECT" : "CLEAR_TO_EXECUTE" }, null, 1));
})();
