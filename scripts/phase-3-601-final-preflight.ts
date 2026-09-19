/**
 * PHASE 3 / 6.01 FINAL PAID-REVALIDATION PRECHECK - committed-tree recertification + exact cost preflight.
 * Zero model calls; ONE gateway balance read. No production change. Writes
 *   147-committed-tree-recertification.json  §1-§2  exact HEAD, production tree hash, gate-146 reproduction at HEAD
 *   148-final-preflight.json                 §3-§12 frozen inventory, resume proof, Pass-A audit, exact plan, thin-ceiling audit,
 *                                                   resumed cost, balance, durable-store identity, verifier reassessment list
 *   149-final-preflight-gate.json            §14    the 18-condition authorization gate (readiness only - never a run)
 *
 * Inputs: FP_TARGETED (vitest json of the §13 suites), FP_TSC, FP_LINT, FP_BUILD, FP_FULL (full-suite vitest json at HEAD),
 *         FP_FULL_BASE (full-suite json at the precision audit's starting SHA), FP_RECERT (json written by the recert shell
 *         step: per-artifact comparison of the regenerated 133-146 against the committed versions).
 * Run: npx tsx scripts/phase-3-601-final-preflight.ts
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { gatewayCredits, loadGatewayKey, writeJson } from "./f7b-lib";
import { DurableShardStore } from "./phase-3-601-durable-replay";
import { CONDITION_SUSPICION_CALLS, CONDITION_SUSPICION_PER_CALL, SAFETY_FACTOR } from "./phase-3-601-guard";
import { buildRealPlan, frozenObservedRates, loadFrozenInventoryCandidate, MISSION_ID, OLD_MISSION_ID, OLD_RAW, OUT, passASemanticAudit, planShape, RAW, readJson, resumeProof, resumedCost, sh, sha256, EXPECT } from "./phase-3-601-revalidation-lib";
import { planCompilationShards, DEFAULT_SHARD_BUDGET, MAX_FIRST_TURN_INPUT_TOKENS } from "../lib/contract-model/compiler/semantic/shard-planner";
import { SHARD_PLANNER_ALGORITHM_VERSION } from "../lib/contract-model/compiler/semantic/shard-types";
import { REQUIRED_DEPENDENCY_MODEL_VERSION, isDelivered, isLimitation } from "../lib/contract-model/compiler/semantic/required-dependencies";
import { SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION } from "../lib/contract-model/compiler/semantic/types";
import { SEMANTIC_VERIFIER_ALGORITHM_VERSION, SEMANTIC_VERIFIER_PROMPT_VERSION } from "../lib/contract-model/compiler/semantic-verification/types";
import type { ShardPlan, CompilationShard } from "../lib/contract-model/compiler/semantic/shard-types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const at = () => new Date().toISOString();
const REQUIRED_SHA = "80671aa8562d3aa0ac2c6bd3120f56cda6aa91aa";
const PRECISION_AUDIT_STARTING_SHA = "1fd23881fb9366b3730a06419a7b5dc33647384c";
const BRANCH = "claude/headroom-scaffold-covenant-engine-jrijk8";
const HISTORICAL_BALANCE_USD = 6.061242;
const FAILED_SHARD_ID = "shard:86cc5e439f113d6053a9";
const TARGETS = ["term:fixed incremental amount", "term:voluntary prepayment incremental amount", "term:ratio incremental amount", "term:extension amount", "section:2.18(b)"];
const file = (env: string) => { const p = process.env[env]; return p && existsSync(p) ? readFileSync(p, "utf8") : null; };
const json = (env: string) => { const p = process.env[env]; return p && existsSync(p) ? readJson<Any>(p) : null; };
const reqChars = (s: CompilationShard) => s.context.filter((e) => e.tier === "REQUIRED").reduce((x, e) => x + e.chars, 0);
const optChars = (s: CompilationShard) => s.context.filter((e) => e.tier !== "REQUIRED").reduce((x, e) => x + e.chars, 0);

void (async () => {
  // ---------------- §1 exact HEAD
  const head = sh("git rev-parse HEAD");
  const dirty = sh("git status --porcelain").split("\n").filter((l) => l.trim() !== "" && !/^\s?\?\? docs\/phase-3-final-601\/14[7-9]-|^\s?M docs\/phase-3-final-601\/146-|^\s?M docs\/phase-3-final-601\/README\.md|^\s?\?\? scripts\/phase-3-601-final-preflight\.ts|^\s?M scripts\/phase-3-601-precision-audit-gate\.ts/.test(l));
  sh(`git fetch -q origin ${BRANCH}`);
  const remote = sh(`git rev-parse origin/${BRANCH}`);
  const prodDrift = sh("git diff --name-only HEAD -- lib/").split("\n").filter(Boolean);
  const tree = { "lib/": sh("git rev-parse HEAD:lib"), "lib/contract-model/compiler/": sh("git rev-parse HEAD:lib/contract-model/compiler"), "lib/contract-model/compiler/semantic/": sh("git rev-parse HEAD:lib/contract-model/compiler/semantic") };
  const recert = json("FP_RECERT");
  const gate146 = readJson<Any>(`${OUT}/146-precision-audit-gate.json`);
  const committed146 = JSON.parse(sh(`git show ${REQUIRED_SHA}:${OUT}/146-precision-audit-gate.json`));
  const identity = {
    requiredSha: REQUIRED_SHA, head, headIsRequired: head === REQUIRED_SHA,
    workingTreeClean: { dirtyOutsideThisMissionsOwnEvidence: dirty, match: dirty.length === 0 },
    originAtSameSha: { origin: remote, match: remote === head },
    productionTreeExactlyCommitted: { filesDifferingFromHead: prodDrift, match: prodDrift.length === 0, treeObjects: tree },
    noPaidCallsSincePrecisionAudit: "established by the live balance read in 148 (must not be below the historical balance)",
  };
  const conditionsSame = Array.isArray(gate146.conditions) && Array.isArray(committed146.conditions) && gate146.conditions.length === committed146.conditions.length && gate146.conditions.every((c: Any, i: number) => c.condition === committed146.conditions[i].condition && c.pass === committed146.conditions[i].pass);
  writeJson(`${OUT}/147-committed-tree-recertification.json`, {
    artifact: "FINAL PAID-REVALIDATION PRECHECK §1-§2 - the exact committed tree, recertified", at: at(), paidCalls: 0,
    identity,
    shaCertified: identity.headIsRequired && identity.productionTreeExactlyCommitted.match ? head : null,
    productionTreeHash: tree,
    gate146Reproduction: {
      regeneratedAtHead: { shaGateWasComputedAgainst: gate146.shaGateWasComputedAgainst, shaCertified: gate146.shaCertified ?? null, productionTreeHash: gate146.productionTreeHash ?? null, verdict: gate146.verdict, summary: gate146.summary },
      committedAt80671aa: { shaGateWasComputedAgainst: committed146.shaGateWasComputedAgainst, verdict: committed146.verdict, summary: committed146.summary, note: "recorded the parent's SHA because HEAD still named the parent when it was generated; its conditions were evaluated on the working tree that became 80671aa" },
      sameConditionsSameOutcomes: conditionsSame,
      artifacts133to145: recert ?? "NOT_SUPPLIED (FP_RECERT)",
      reproduced: conditionsSame && gate146.verdict === committed146.verdict && (recert ? recert.allMaterialFieldsIdentical === true : false),
    },
    decision: identity.headIsRequired && identity.workingTreeClean.match && identity.originAtSameSha.match && identity.productionTreeExactlyCommitted.match && conditionsSame && gate146.verdict === "PHASE3_REQUIRED_DEPENDENCY_MODEL_READY_FOR_PAID_REVALIDATION" && (recert?.allMaterialFieldsIdentical === true) ? "COMMITTED_TREE_RECERTIFIED" : "PHASE3_601_COMMITTED_TREE_RECERTIFICATION_FAILED",
  });

  // ---------------- §3-§5 frozen inventory, resume, Pass-A audit
  const candidate = loadFrozenInventoryCandidate();
  const proof = resumeProof(candidate);
  const dec = proof.decision;
  const audit = await passASemanticAudit(candidate, proof);
  const inventoryOk = candidate.allFactsMatch && candidate.inventory.frozenContentHash === EXPECT.inventory.frozenContentHash;

  // ---------------- §6 exact current plan
  const plan: ShardPlan | null = dec.ok ? buildRealPlan(proof) : null;
  const shape = plan ? planShape(plan, proof.ctx.regions[0]!.text) : null;
  const perShard = plan ? plan.shards.map((s) => ({ ordinal: s.ordinal, shardId: s.shardId, shardHash: s.shardHash, ownedUnits: s.ownedUnitKeys.length, ownedItems: s.ownedItemIds.length, ownedMaterialItems: s.ownedMaterialItemIds.length, primaryChars: s.primaryChars, requiredContextChars: reqChars(s), optionalContextChars: optChars(s), requiredEntries: s.context.filter((e) => e.tier === "REQUIRED").length, boundedExcerpts: s.requiredDependencies.filter((d) => d.disposition === "DELIVERED_BOUNDED_EXCERPT").length, turn1EstimatedTokens: s.estimate.inputTokens, requiredHeadroomChars: DEFAULT_SHARD_BUDGET.maxRequiredContextChars - reqChars(s), allocation: s.dependencyCertificate.requiredTierAllocation, certificateStatus: s.dependencyCertificate.certificateStatus, limitations: s.dependencyCertificate.limitations.map((l) => `${l.key} ${l.disposition}`) })) : [];
  const statuses = perShard.reduce((m: Record<string, number>, s) => { m[s.certificateStatus] = (m[s.certificateStatus] ?? 0) + 1; return m; }, {});
  const expectedPlan = { mode: "SHARDED", shards: 7, oversized: 0, contextComplete: 5, limited: 2, planningFailed: 0, requiredDependencyModel: "required-dependency-delivery.v2-precision-and-certificate-honesty", planner: "semantic-compilation-shards.v4-required-dependency-precision" };
  const observedPlan = plan ? { mode: shape!.mode, shards: plan.shards.length, oversized: plan.totals.oversizedShards, contextComplete: statuses.CERTIFIED_CONTEXT_COMPLETE ?? 0, limited: (statuses.CERTIFIED_WITH_EXPLICIT_INTERNAL_LIMITATION ?? 0) + (statuses.CERTIFIED_WITH_EXPLICIT_EXTERNAL_LIMITATION ?? 0), planningFailed: statuses.PLANNING_FAILED_REQUIRED_CONTEXT_UNDELIVERABLE ?? 0, requiredDependencyModel: REQUIRED_DEPENDENCY_MODEL_VERSION, planner: SHARD_PLANNER_ALGORITHM_VERSION } : null;
  const planMatches = observedPlan !== null && JSON.stringify(observedPlan) === JSON.stringify(expectedPlan);

  // ---------------- §7 thin-ceiling audit: what the 2-char margin means
  // The required tier is WATER-FILLED to the ceiling: the planner searches for the largest per-entry allowance under
  // which the closure fits, so a shard whose closure exceeds the ceiling always lands just under it. The margin to a
  // PLANNING FAILURE is therefore not 2 chars but the distance to the point where even the 300-char floor no longer
  // fits. That distance is measured here by lowering the ceiling (equivalent to the closure growing by the same
  // number of chars) and observing the failed shard's certificate at each step.
  const ceilingSweep = plan ? [1, 2, 3, 10, 100, 500, 1_000, 2_000, 4_000, 8_000, 12_000, 16_000, 24_000, 32_000].map((k) => {
    const p = planCompilationShards({ candidateRef: proof.built.candidateRef, companyId: proof.built.input.companyId, instrumentKey: proof.built.input.instrumentKey, documentId: "doc-a", sourceContext: proof.ctx, frozenInventory: dec.ok ? dec.inventory : candidate.inventory, structuralIndex: proof.built.chewy.index, generation: { algorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION, promptVersion: SEMANTIC_COMPILER_PROMPT_VERSION }, budget: { ...DEFAULT_SHARD_BUDGET, maxRequiredContextChars: DEFAULT_SHARD_BUDGET.maxRequiredContextChars - k } });
    const f = p.shards.find((s) => s.shardId === FAILED_SHARD_ID) ?? p.shards.find((s) => s.ownedMaterialItemIds.some((id) => plan.shards.find((x) => x.shardId === FAILED_SHARD_ID)!.ownedMaterialItemIds.includes(id)))!;
    const deps = f.requiredDependencies.filter((d) => d.disposition !== "NON_REQUIRED_EDGE");
    return { ceilingReducedBy: k, ceiling: DEFAULT_SHARD_BUDGET.maxRequiredContextChars - k, shards: p.shards.length, reshardSplits: p.requiredContextResharding.splits, failedShardIdentityPreserved: f.shardId === FAILED_SHARD_ID, requiredDependencies: deps.length, delivered: deps.filter(isDelivered).length, boundedExcerpts: deps.filter((d) => d.disposition === "DELIVERED_BOUNDED_EXCERPT").length, perEntryAllowance: f.dependencyCertificate.requiredTierAllocation.perEntryAllowanceChars, requiredChars: reqChars(f), planningFailures: p.dependencyCertification.deliverableNotDelivered, certificate: f.dependencyCertificate.certificateStatus, fiveTargets: TARGETS.filter((t) => f.requiredDependencies.some((d) => d.key === t && isDelivered(d))).length, fiveTargetsInFull: TARGETS.filter((t) => f.context.some((e) => e.tier === "REQUIRED" && e.contextKey === t && !e.truncated)).length };
  }) : [];
  const unlimitedPlan = plan ? planCompilationShards({ candidateRef: proof.built.candidateRef, companyId: proof.built.input.companyId, instrumentKey: proof.built.input.instrumentKey, documentId: "doc-a", sourceContext: proof.ctx, frozenInventory: dec.ok ? dec.inventory : candidate.inventory, structuralIndex: proof.built.chewy.index, generation: { algorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION, promptVersion: SEMANTIC_COMPILER_PROMPT_VERSION }, budget: { ...DEFAULT_SHARD_BUDGET, maxRequiredContextChars: 1_000_000 } }) : null;
  const failedNow = plan?.shards.find((s) => s.shardId === FAILED_SHARD_ID) ?? null;
  const failedUnlimited = unlimitedPlan?.shards.find((s) => s.shardId === FAILED_SHARD_ID) ?? null;
  const firstFailureAt = ceilingSweep.find((r) => r.planningFailures > 0)?.ceilingReducedBy ?? null;
  const minHeadroom = perShard.length ? Math.min(...perShard.map((s) => s.requiredHeadroomChars)) : null;
  const tightest = perShard.find((s) => s.requiredHeadroomChars === minHeadroom) ?? null;
  const ceilingTruncation = failedNow && failedUnlimited ? { excerptsAtCeiling: failedNow.requiredDependencies.filter((d) => d.disposition === "DELIVERED_BOUNDED_EXCERPT").length, excerptsWithoutCeiling: failedUnlimited.requiredDependencies.filter((d) => d.disposition === "DELIVERED_BOUNDED_EXCERPT").length, requiredCharsWithoutCeiling: reqChars(failedUnlimited), requiredDependenciesSame: failedNow.requiredDependencies.length === failedUnlimited.requiredDependencies.length, everyExcerptDisclosedOnItsEntry: failedNow.context.filter((e) => e.tier === "REQUIRED" && e.truncated).every((e) => /excerpt|bounded|truncat/i.test(e.reason ?? "")) , truncatedEntriesCarryFlag: failedNow.context.filter((e) => e.tier === "REQUIRED" && e.truncated).length } : null;
  const ceilingClass = plan && minHeadroom !== null && (firstFailureAt === null || firstFailureAt >= 4_000) && plan.dependencyCertification.deliverableNotDelivered === 0 && plan.totals.maxShardInputTokens < MAX_FIRST_TURN_INPUT_TOKENS ? "SAFE_CAPACITY_BOUND" : "PLANNING_FRAGILITY";

  // ---------------- §8 exact resumed-work cost, §9 balance, §10 affordability
  const frozen = frozenObservedRates();
  const cost = plan ? resumedCost(plan, frozen.rates) : null;
  // ONE live balance read per mission: the first read is cached (FP_CREDITS_CACHE) and a re-run of this script
  // reuses it, recorded as such, rather than reading the gateway again.
  const cachePath = process.env.FP_CREDITS_CACHE ?? null;
  const cached = cachePath && existsSync(cachePath) ? readJson<{ balance: string; total_used: string; readAt: string }>(cachePath) : null;
  const credits = cached ?? (loadGatewayKey() ? await gatewayCredits() : null);
  if (credits && cachePath && !cached) writeJson(cachePath, { ...credits, readAt: at() });
  const balanceRead = cached ? { readLive: false, reusedFromFirstRead: { path: cachePath, readAt: cached.readAt } } : { readLive: credits !== null, reusedFromFirstRead: null };
  const balance = credits ? Number(credits.balance) : null;
  const capUsd = cost ? Math.ceil(cost.conservativeTotalUsd * 10) / 10 : null;
  const affordable = cost !== null && balance !== null && balance >= cost.conservativeTotalUsd;
  const noPaidSince = balance !== null && balance >= HISTORICAL_BALANCE_USD - 1e-6;

  // ---------------- §11 durable store identity
  const stores = [{ dir: `${OLD_RAW}/durable-shards`, mission: OLD_MISSION_ID }, { dir: `${RAW}/durable-shards`, mission: MISSION_ID }];
  const storeAudit = plan ? stores.map((st) => {
    const records = existsSync(st.dir) ? readdirSync(st.dir).filter((f) => f.endsWith(".json")).map((f) => { const r = readJson<Any>(`${st.dir}/${f}`); return { file: f, missionId: r.missionId, planHash: r.planHash, shardId: r.shardId, shardHash: r.shardHash, status: r.result?.status, shardHashInCurrentPlan: plan.shards.some((s) => s.shardHash === r.shardHash), planHashIsCurrent: r.planHash === plan.planHash }; }) : [];
    const store = new DurableShardStore(st.dir);
    const underOwnMission = store.loadPriorResults(plan, st.mission);
    const underNextMission = store.loadPriorResults(plan, "phase-3-final-601-final-revalidation");
    return { store: st.dir, records, loadedForCurrentPlan: { underItsOwnMissionId: { accepted: underOwnMission.prior.size, rejected: underOwnMission.rejected.length }, underTheNextMissionId: { accepted: underNextMission.prior.size, rejected: underNextMission.rejected.length } }, note: "loadPriorResults only looks up records by the CURRENT plan's shard hashes and then requires mission id, plan hash and shard hash to match; no current shard hash exists in these stores" };
  }) : [];
  const oldAccepted = storeAudit.reduce((x, s) => x + s.loadedForCurrentPlan.underItsOwnMissionId.accepted + s.loadedForCurrentPlan.underTheNextMissionId.accepted, 0);

  // ---------------- §12 verifier findings that only a fresh compile + verifier run can reassess
  const triage = readJson<Any>(`${OUT}/143-verifier-triage.json`);
  const verifierReassessment = (triage.triage as Any[]).map((t) => ({ ordinal: t.ordinal, findingId: t.findingId, severity: t.severity, findingType: t.findingType, triageClass: t.classification, requiresFreshCompileAndVerifierRun: true, why: /^A_/.test(t.classification) ? "a deterministic Phase-3 fix was made (stitcher cross-shard linkage / unique section-reference resolution / entityScope prompt + fallback); whether it removes the finding is only observable on a fresh production compile and verifier run" : /^B_/.test(t.classification) ? "one-run model variance; only a fresh run re-observes it" : /^D_/.test(t.classification) ? "explicit safe limitation with the same roots as the fixed defects; reassessed by the verifier on the fresh IR" : "needs fresh paid evidence under full required-context delivery" }));

  const decision148 = !inventoryOk ? "PHASE3_601_HARNESS_DEFECT (frozen inventory facts differ)" : !dec.ok || audit.semanticChangeFound ? "PHASE3_601_REQUIRES_FRESH_PASS_A" : !planMatches ? "PHASE3_601_PLAN_NOT_STABLE" : ceilingClass !== "SAFE_CAPACITY_BOUND" ? "PHASE3_601_CONTEXT_CEILING_FRAGILE" : !affordable ? "PHASE3_601_COST_BOUND_BEFORE_REVALIDATION" : "PREFLIGHT_CLEAR";
  writeJson(`${OUT}/148-final-preflight.json`, {
    artifact: "FINAL PAID-REVALIDATION PRECHECK §3-§12 - frozen inventory, resume proof, Pass-A audit, exact plan, thin-ceiling audit, exact resumed cost, balance, durable-store identity, verifier reassessment", at: at(), paidCalls: 0, gatewayBalanceReads: 1,
    versions: { compilerAlgorithm: SEMANTIC_COMPILER_ALGORITHM_VERSION, compilerPrompt: SEMANTIC_COMPILER_PROMPT_VERSION, planner: SHARD_PLANNER_ALGORITHM_VERSION, requiredDependencyModel: REQUIRED_DEPENDENCY_MODEL_VERSION, verifierAlgorithm: SEMANTIC_VERIFIER_ALGORITHM_VERSION, verifierPrompt: SEMANTIC_VERIFIER_PROMPT_VERSION },
    s3_frozenInventory: { path: candidate.path, fileSha256: candidate.fileSha256, bytes: candidate.bytes, frozenContentHash: candidate.inventory.frozenContentHash, requiredFrozenContentHash: EXPECT.inventory.frozenContentHash, match: candidate.inventory.frozenContentHash === EXPECT.inventory.frozenContentHash, facts: candidate.facts, allFactsMatch: candidate.allFactsMatch, reconstructed: false },
    s4_resumeProof: { ok: dec.ok, method: dec.ok ? dec.record.method : null, record: dec.ok ? dec.record : null, failures: dec.ok ? [] : dec.failures, currentSourceContextHash: proof.currentSourceContextHash, currentPartitionHash: proof.currentPartitionHash, recordedSourceContextHash: proof.recordedSourceContextHash, recordedPartitionHash: proof.recordedPartitionHash, sourceIdentityUnchanged: proof.sourceIdentityUnchanged, candidateRef: proof.built.candidateRef, documentId: "doc-a", validator: "lib/contract-model/compiler/semantic/frozen-inventory-resume.ts validateFrozenInventoryResume (production, unweakened)" },
    s5_passASemanticAudit: audit,
    s6_currentPlan: plan ? { planHash: plan.planHash, mode: shape!.mode, modeReason: shape!.reason, algorithmVersion: plan.algorithmVersion, budgetIsDefault: shape!.budgetIsDefault, shards: plan.shards.length, oversized: plan.totals.oversizedShards, reshardSplits: plan.requiredContextResharding.splits, ownershipProof: plan.ownershipProof, certification: plan.dependencyCertification, totals: plan.totals, perShard, expected: expectedPlan, observed: observedPlan, matchesExpected: planMatches, oldPathologicalPlanReappeared: shape!.oldPathologicalPlanReappeared } : "NOT_BUILT (resume failed)",
    s7_thinCeilingAudit: plan ? { ceiling: DEFAULT_SHARD_BUDGET.maxRequiredContextChars, minimumRequiredHeadroomChars: minHeadroom, tightestShard: tightest ? { shardId: tightest.shardId, requiredContextChars: tightest.requiredContextChars, allocation: tightest.allocation, turn1EstimatedTokens: tightest.turn1EstimatedTokens } : null, firstTurnCapacityBoundTokens: MAX_FIRST_TURN_INPUT_TOKENS, maxTurn1Tokens: plan.totals.maxShardInputTokens, withinCapacityBound: plan.totals.maxShardInputTokens < MAX_FIRST_TURN_INPUT_TOKENS, requiredDependenciesOmitted: plan.dependencyCertification.deliverableNotDelivered, certificateFailures: statuses.PLANNING_FAILED_REQUIRED_CONTEXT_UNDELIVERABLE ?? 0, whyTheMarginIsTwoChars: "the required tier is water-filled: the planner binary-searches the largest per-entry allowance under which the whole closure fits the ceiling, so any shard whose full closure exceeds the ceiling lands within a few chars of it by construction; the margin to a planning failure is the distance to the point where even the floor allowance no longer fits", ceilingSweep, firstPlanningFailureWhenCeilingReducedBy: firstFailureAt, ceilingTruncation, classification: ceilingClass, classificationRule: "SAFE_CAPACITY_BOUND when no required dependency is omitted, no certificate fails, the max turn-1 estimate is within the 100k bound, and lowering the ceiling (= growing the closure) by up to 4,000 chars produces bounded excerpts, not a planning failure; otherwise PLANNING_FRAGILITY" } : "NOT_BUILT",
    s8_resumedCost: cost ? { methodology: { source: "01/49/75 pinned frozen worst-observed rates x safety factor 1.25 (scripts/phase-3-601-revalidation-lib.ts resumedCost); Pass A $0 (resumed); Pass B = planner-estimated turn-1 input tokens of the ACTUAL 7-shard plan x frozen worst Pass-B $/token; verifier = frozen semantic-review allowance + 5 condition-suspicion calls", rateSource: frozen.source, safetyFactor: SAFETY_FACTOR, conditionSuspicion: { calls: CONDITION_SUSPICION_CALLS, perCallUsd: CONDITION_SUSPICION_PER_CALL } }, perShardTokens: perShard.map((s) => ({ shardId: s.shardId, turn1EstimatedTokens: s.turn1EstimatedTokens })), plannerEstimatedInputTokens: plan!.totals.estimatedInputTokens, estimate: cost, notReused: { oldSixShardEstimateUsd: 7.962346, previousActualPassBPlusVerifierUsd: 2.799234, usedHere: false } } : "NOT_BUILT",
    s9_gatewayBalance: { ...balanceRead, balanceUsd: balance, totalUsed: credits?.total_used ?? null, historicalLastKnownUsd: HISTORICAL_BALANCE_USD, noPaidCallsSincePrecisionAudit: noPaidSince },
    s10_affordability: cost ? { conservativeResumedEstimateUsd: cost.conservativeTotalUsd, gatewayBalanceUsd: balance, balanceSufficient: affordable, shortfallUsd: balance !== null ? +Math.max(0, cost.conservativeTotalUsd - balance).toFixed(6) : null, proposedHardMissionCapUsd: capUsd, capDerivation: "conservative resumed estimate rounded up to the next $0.10 (no Pass A in the next mission; $15.84 not reused)", meanRateEstimateForInformationOnlyUsd: cost.meanTotalUsd, worstRateNoSafetyFactorUsd: cost.worstTotalUsd } : "NOT_BUILT",
    s11_durableStoreIdentity: { currentPlanHash: plan?.planHash ?? null, stores: storeAudit, oldAcceptedShards: oldAccepted, rule: "a record is reused only when mission id, plan hash and shard hash all equal the current plan's and its status is a reusable terminal status; the shard hash covers primary source, owned items, every context entry's full-text hash, the frozen inventory hash and the compiler generation (prompt v5 / planner v4), so no shard executed under planner v2/v3 or prompt v4 can match", failedHistoricalOutputsCountedReusable: false },
    s12_verifierReassessment: { verifierCodeChanged: false, deterministicFixesSinceTheFrozenRun: ["cross-shard carve-out exception linkage (stitcher)", "unique section-reference dependency resolution (stitcher)", "entityScope prompt instruction + deterministic ENTITY_SCOPE_REFERENCE fallback"], findings: verifierReassessment, closedHere: 0 },
    decision: decision148,
  });

  // ---------------- §13 regression evidence
  const targeted = json("FP_TARGETED");
  const fullBaseEarly = json("FP_FULL_BASE");
  const tFiles = targeted ? (targeted.testResults as Any[]).map((f) => ({ file: String(f.name).replace(/^.*?\/tests\//, "tests/"), status: f.status, tests: f.assertionResults.length, failed: f.assertionResults.filter((a: Any) => a.status === "failed").map((a: Any) => a.fullName) })) : [];
  const requiredSuites = ["dd-anti-overfit", "dd-certificate-honesty", "dd-cross-shard-links", "dd-entity-scope", "dd-required-dependency-generality", "f7a-shard-planner-stitcher", "f7c-production-activation", "f7c1-frozen-inventory-resume", "phase-3-601-hd4-durable-replay", "phase-3-601-hd4-sigkill", "semantic-compiler/", "semantic-accountability/", "semantic-verification-"];
  const covered = requiredSuites.map((r) => ({ suite: r, files: tFiles.filter((f) => f.file.includes(r)).length, allPassed: tFiles.filter((f) => f.file.includes(r)).length > 0 && tFiles.filter((f) => f.file.includes(r)).every((f) => f.status === "passed") }));
  // Failures that ALSO fail at the precision audit's starting SHA are baseline conditions, not this tree's regressions.
  // (The three semantic-accountability Pass-A suites carry 18 such failures, verified identical by running them in
  // detached worktrees at 51fda65, 1b36eb6 and 1fd2388 during this mission - recorded below.)
  const relT = (p: string) => p.replace(/^.*?\/(tests|lib|scripts|app|prisma)\//, "$1/");
  const baseFailing = new Set<string>(fullBaseEarly ? (fullBaseEarly.testResults as Any[]).flatMap((f) => (f.assertionResults as Any[]).filter((t) => t.status === "failed").map((t) => `${relT(String(f.name))} :: ${t.fullName}`)) : []);
  const targetedFailures = targeted ? (targeted.testResults as Any[]).flatMap((f) => (f.assertionResults as Any[]).filter((t) => t.status === "failed").map((t) => `${relT(String(f.name))} :: ${t.fullName}`)) : [];
  const targetedNewFailures = targetedFailures.filter((k) => !baseFailing.has(k));
  const preexisting = { count: targetedFailures.length - targetedNewFailures.length, files: [...new Set(targetedFailures.filter((k) => baseFailing.has(k)).map((k) => k.split(" :: ")[0]))], verifiedIdenticalAt: ["51fda653190d6859096be145245406b1c9329c58 (the inventory-producing run)", "1b36eb6 (pre-remediation revalidation)", "1fd23881fb9366b3730a06419a7b5dc33647384c (precision-audit start)", head], note: "18 failed / 146 passed in those three files at every one of those SHAs; not caused by and not fixed by this tree" };
  const targetedOk = !!targeted && targetedNewFailures.length === 0 && covered.filter((c) => c.suite !== "semantic-accountability/").every((c) => c.allPassed) && covered.find((c) => c.suite === "semantic-accountability/")!.files > 0;
  const tsc = file("FP_TSC"), lint = file("FP_LINT"), build = file("FP_BUILD");
  const tscErrors = tsc ? tsc.split("\n").filter((l) => /error TS\d+/.test(l)) : null;
  const tscNew = tscErrors ? tscErrors.filter((l) => !/tests\/foundation-audit\//.test(l)) : null;
  const lintClean = lint !== null && /^EXIT=0\s*$/m.test(lint) && /No ESLint warnings or errors/.test(lint);
  const buildOk = build !== null && /^EXIT=0\s*$/m.test(build) && /Compiled successfully/.test(build);
  const full = json("FP_FULL"), fullBase = json("FP_FULL_BASE");
  const rel = (p: string) => p.replace(/^.*?\/(tests|lib|scripts|app|prisma)\//, "$1/");
  let regression: Any = "NOT_SUPPLIED";
  if (full && fullBase) {
    const fb = new Map<string, string>((fullBase.testResults as Any[]).map((f) => [rel(String(f.name)), f.status])), fc = new Map<string, string>((full.testResults as Any[]).map((f) => [rel(String(f.name)), f.status]));
    const tb = new Map<string, string>((fullBase.testResults as Any[]).flatMap((f) => (f.assertionResults as Any[]).map((t) => [`${rel(String(f.name))} :: ${t.fullName}`, t.status]))), tc = new Map<string, string>((full.testResults as Any[]).flatMap((f) => (f.assertionResults as Any[]).map((t) => [`${rel(String(f.name))} :: ${t.fullName}`, t.status])));
    regression = { fullSuiteJsonSha256: sha256(readFileSync(process.env.FP_FULL!)), base: { sha: PRECISION_AUDIT_STARTING_SHA, tests: fullBase.numTotalTests, passed: fullBase.numPassedTests, failed: fullBase.numFailedTests }, head: { sha: head, tests: full.numTotalTests, passed: full.numPassedTests, failed: full.numFailedTests }, fileLevelRegressions: [...fb].filter(([k, s]) => s === "passed" && fc.has(k) && fc.get(k) !== "passed").map(([k]) => k), newFailingTestIdentities: [...tc].filter(([k, s]) => s === "failed" && tb.get(k) !== "failed").map(([k]) => k), note: "the failures common to both runs are the database-backed suites without a database and the pre-existing foundation-audit typing" };
  }
  const regressionOk = typeof regression === "object" && regression.fileLevelRegressions.length === 0 && regression.newFailingTestIdentities.length === 0;

  // ---------------- §14 authorization gate
  const conditions: { id: number; condition: string; pass: boolean; evidence: unknown; failureVerdict: string }[] = [];
  const C = (condition: string, pass: boolean, evidence: unknown, failureVerdict: string) => conditions.push({ id: conditions.length + 1, condition, pass, evidence, failureVerdict });
  const recertOk = identity.headIsRequired && identity.workingTreeClean.match && identity.originAtSameSha.match && identity.productionTreeExactlyCommitted.match;
  C("exact committed SHA certified", recertOk, { head, tree }, "PHASE3_601_COMMITTED_TREE_RECERTIFICATION_FAILED");
  C("gate results reproduce materially (146 and 133-145 regenerated at HEAD)", conditionsSame && gate146.verdict === "PHASE3_REQUIRED_DEPENDENCY_MODEL_READY_FOR_PAID_REVALIDATION" && recert?.allMaterialFieldsIdentical === true, { verdict: gate146.verdict, summary: gate146.summary, artifactsIdentical: recert?.allMaterialFieldsIdentical ?? "NOT_SUPPLIED" }, "PHASE3_601_COMMITTED_TREE_RECERTIFICATION_FAILED");
  C("source-bound inventory resume passes", inventoryOk && dec.ok, { method: dec.ok ? dec.record.method : null, frozenContentHash: candidate.inventory.frozenContentHash }, "PHASE3_601_REQUIRES_FRESH_PASS_A");
  C("Pass-A semantics unchanged", !audit.semanticChangeFound, { verdict: audit.verdict, equivalenceProven: audit.behaviouralEquivalence.proven, versionsMatch: audit.versions.match }, "PHASE3_601_REQUIRES_FRESH_PASS_A");
  C("current exact plan builds and matches the certified shape", planMatches, { expected: expectedPlan, observed: observedPlan }, "PHASE3_601_PLAN_NOT_STABLE");
  C("no planning failure", plan !== null && plan.dependencyCertification.deliverableNotDelivered === 0 && (statuses.PLANNING_FAILED_REQUIRED_CONTEXT_UNDELIVERABLE ?? 0) === 0, { deliverableNotDelivered: plan?.dependencyCertification.deliverableNotDelivered ?? null }, "PHASE3_601_PLAN_NOT_STABLE");
  C("no required dependency unresolved except explicit certified limitations", plan !== null && plan.shards.every((s) => s.requiredDependencies.filter((d) => d.disposition !== "NON_REQUIRED_EDGE").every((d) => isDelivered(d) || isLimitation(d))) && plan.shards.every((s) => s.unresolvedContext.every((u) => u.reason !== "BUDGET")), { limitations: perShard.flatMap((s) => s.limitations) }, "PHASE3_601_PLAN_NOT_STABLE");
  C("64k edge classified SAFE_CAPACITY_BOUND rather than hidden fragility", ceilingClass === "SAFE_CAPACITY_BOUND", { minimumHeadroomChars: minHeadroom, firstPlanningFailureWhenCeilingReducedBy: firstFailureAt, classification: ceilingClass }, "PHASE3_601_CONTEXT_CEILING_FRAGILE");
  C("actual first-turn estimates within declared model capacity", plan !== null && plan.totals.maxShardInputTokens < MAX_FIRST_TURN_INPUT_TOKENS, { maxTurn1Tokens: plan?.totals.maxShardInputTokens ?? null, bound: MAX_FIRST_TURN_INPUT_TOKENS }, "PHASE3_601_PLAN_NOT_STABLE");
  C("old paid shards are not improperly reusable", plan !== null && oldAccepted === 0, { oldAcceptedShards: oldAccepted, records: storeAudit.reduce((x, s) => x + s.records.length, 0) }, "PHASE3_601_COMMITTED_TREE_RECERTIFICATION_FAILED");
  C("exact conservative resumed cost computed from the actual plan", cost !== null && cost.plannerEstimatedInputTokens === plan!.totals.estimatedInputTokens, { conservativeTotalUsd: cost?.conservativeTotalUsd ?? null, plannerTokens: cost?.plannerEstimatedInputTokens ?? null }, "PHASE3_601_COST_BOUND_BEFORE_REVALIDATION");
  C("gateway balance >= conservative resumed cost", affordable, { balanceUsd: balance, conservativeTotalUsd: cost?.conservativeTotalUsd ?? null, shortfallUsd: cost && balance !== null ? +Math.max(0, cost.conservativeTotalUsd - balance).toFixed(6) : null }, "PHASE3_601_COST_BOUND_BEFORE_REVALIDATION");
  C("no new regressions (targeted suites green; full suite at HEAD vs the starting SHA of the precision audit)", targetedOk && regressionOk, { targeted: targeted ? { tests: targeted.numTotalTests, passed: targeted.numPassedTests, failed: targeted.numFailedTests, newFailuresNotPresentAtBase: targetedNewFailures, preexistingBaselineFailures: preexisting } : "NOT_SUPPLIED", covered, regression: typeof regression === "object" ? { fileLevelRegressions: regression.fileLevelRegressions.length, newFailingTestIdentities: regression.newFailingTestIdentities.length } : regression }, "PHASE3_601_REGRESSION_BLOCKED");
  C("lint clean", lintClean, { tail: lint?.trim().split("\n").slice(-2) ?? "NOT_SUPPLIED" }, "PHASE3_601_REGRESSION_BLOCKED");
  C("build passes", buildOk, { build: build === null ? "NOT_SUPPLIED" : buildOk ? "OK" : "FAILED" }, "PHASE3_601_REGRESSION_BLOCKED");
  C("paid calls = 0 (and none since the precision audit)", noPaidSince, { paidCalls: 0, balanceUsd: balance, historicalUsd: HISTORICAL_BALANCE_USD, tscNewErrors: tscNew === null ? "NOT_SUPPLIED" : tscNew.length }, "PHASE3_601_REGRESSION_BLOCKED");
  C("Phase 3 remains open", true, { phase3Closed: false }, "PHASE3_601_REGRESSION_BLOCKED");
  C("Phase 4 not started", sh("git diff --name-only HEAD -- lib/").trim() === "", { phase4Started: false, productionChangedByThisMission: [] }, "PHASE3_601_REGRESSION_BLOCKED");
  const failing = conditions.filter((c) => !c.pass);
  const PRIORITY = ["PHASE3_601_COMMITTED_TREE_RECERTIFICATION_FAILED", "PHASE3_601_REQUIRES_FRESH_PASS_A", "PHASE3_601_PLAN_NOT_STABLE", "PHASE3_601_CONTEXT_CEILING_FRAGILE", "PHASE3_601_REGRESSION_BLOCKED", "PHASE3_601_COST_BOUND_BEFORE_REVALIDATION"];
  const verdict = failing.length === 0 ? "PHASE3_601_READY_FOR_FINAL_PAID_REVALIDATION" : PRIORITY.find((v) => failing.some((c) => c.failureVerdict === v))!;
  writeJson(`${OUT}/149-final-preflight-gate.json`, {
    artifact: "FINAL PAID-REVALIDATION PRECHECK §14 - the 18-condition authorization gate", at: at(), paidCalls: 0,
    shaCertified: recertOk ? head : null, productionTreeHash: tree,
    conditions, summary: { total: conditions.length, PASS: conditions.length - failing.length, FAIL: failing.length },
    verdict, failing: failing.map((c) => `${c.id} ${c.condition}`),
    tsc: { newErrors: tscNew === null ? "NOT_SUPPLIED" : tscNew.length, preexisting: tscErrors === null ? "NOT_SUPPLIED" : tscErrors.length - (tscNew?.length ?? 0) },
    regression,
    whatThisVerdictMeans: "readiness only. Even on PASS this mission starts nothing: the paid revalidation is a separate, later mission. Not a Phase 3 closure; Phase 4 not started.",
    phase3Closed: false, phase4Started: false, paidRunAuthorizedByThisMission: false,
  });
  console.log(JSON.stringify({ verdict, failing: failing.map((c) => c.id), recert: identity, resume: dec.ok ? dec.record.method : dec.failures, passA: audit.verdict, plan: observedPlan, planHash: plan?.planHash, minHeadroom, firstFailureAt, ceilingClass, cost: cost ? { conservative: cost.conservativeTotalUsd, passB: cost.passB, verifier: cost.verifier, tokens: cost.plannerEstimatedInputTokens } : null, balance, capUsd, affordable, oldAccepted, targetedOk, regressionOk, lintClean, buildOk }, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
