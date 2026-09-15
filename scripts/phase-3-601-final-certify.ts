/**
 * PHASE 3 FINAL-BRIDGE / 6.01 FINAL CLEAN RUN - §1-§6 zero-cost freeze, triple harness certification, cost preflight.
 * Certifies HD-1 (guard == frozen estimator, first call admissible), HD-2 (exact shared predicate), and HD-3 (exact
 * shared persistence helper: write -> fsync -> read back -> hash + structural equality -> exists BEFORE a simulated
 * downstream gate). Zero model calls. One gateway balance read. Writes 47, 48, 49.
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { buildSection601, section601ReferenceItems, observedRates, estimate601 } from "./phase-3-601-preflight";
import { Guard, passAPrerequisiteSatisfied, persistAndReload, CONDITION_SUSPICION_CALLS, CONDITION_SUSPICION_PER_CALL } from "./phase-3-601-guard";
import { gatewayCredits, gitSha, loadGatewayKey, writeJson } from "./f7b-lib";
import { CHWY_SRC } from "./f7a-lib";
import { planCompilationShards, DEFAULT_SHARD_BUDGET } from "../lib/contract-model/compiler/semantic/shard-planner";
import { selectCompilationExecutionMode, SEMANTIC_EXECUTION_POLICY_VERSION } from "../lib/contract-model/compiler/semantic/execution-mode";
import { SHARD_PLANNER_ALGORITHM_VERSION } from "../lib/contract-model/compiler/semantic/shard-types";
import { partitionSourceSlots, batchSlots } from "../lib/contract-model/compiler/semantic-accountability/slots";
import { SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION, SEMANTIC_COMPILER_TOOL_POLICY_VERSION } from "../lib/contract-model/compiler/semantic/types";
import { SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION, SEMANTIC_INVENTORY_PROMPT_VERSION } from "../lib/contract-model/compiler/semantic-accountability/types";
import { SOURCE_IDENTITY_MIGRATION_VERSION } from "../lib/contract-model/compiler/semantic-accountability/source-identity";
import { IR_SCHEMA_VERSION } from "../lib/contract-model/ir/types";

export const OUT = "docs/phase-3-final-601";
export const RAW = "tests/fixtures/unseen-packages/phase-3-final-601-final-clean";
export const STARTING_SHA = "f3b885b12f5bc91fcf886b7b3f77e84ed26661c3";
export const CAP_USD = 15.84;
export const PRIOR = { voidUsd: 3.501676, lostPassAUsd: 5.291298, cumulativeUsd: 8.792974 };
const EXPECT = { sourceSha: "f63b9dc6560e699cd5158ee0f254dba76da92612ad75fdc27756047ad8f49eeb", sectionSha: "6b79685c94a08a9d27b484aaac52282ce92dbe9a7c3321bc38ff6504d12ec02a", refSha: "e7f863e58ee53ca499598f2a8194ff98a0f8f74d2a8ced23b6f12b96c2a64036", charStart: 608901, charEnd: 642524, chars: 33623 };
const sha256 = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

export function buildPlanContext() {
  const built = buildSection601();
  const emptyInv = { candidateRef: built.candidateRef, items: [], uninventoriedValues: [], unaccountedSource: [], sourceCoverage: null, gapReinventory: null, inventoryStatus: "INVENTORY_SKIPPED_NO_PROVIDER", inventoryStatusReason: "preflight", rejectedUnverifiableItems: [], rejectedDuplicateItems: [], sourceContextState: built.sourceContext.state, frozenContentHash: "preflight", frozenAt: "", algorithmVersion: "", promptVersion: "", provider: "", model: "", telemetryCostUsd: null } as unknown as Parameters<typeof planCompilationShards>[0]["frozenInventory"];
  const prePlan = planCompilationShards({ candidateRef: built.candidateRef, companyId: built.input.companyId, instrumentKey: built.input.instrumentKey, documentId: "doc-a", sourceContext: built.sourceContext, frozenInventory: emptyInv, structuralIndex: built.chewy.index, generation: { algorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION, promptVersion: SEMANTIC_COMPILER_PROMPT_VERSION } });
  const batchesPerPass = batchSlots(partitionSourceSlots({ sourceContext: built.sourceContext, structuralIndex: built.chewy.index }), built.sourceContext, 6000).length;
  return { built, prePlan, preMode: selectCompilationExecutionMode(prePlan), batchesPerPass, rates: observedRates() };
}
export function newGuard(rates: ReturnType<typeof observedRates>, batchesPerPass: number, plannerTokens: number, balanceUsd: number, statePath: string | null) {
  return new Guard({ rates, passABatchesPerPass: batchesPerPass, passAGapCallsPerPass: 1, passes: 2, passBPlannerTokens: plannerTokens, verifierReviews: 1, conditionSuspicionCalls: CONDITION_SUSPICION_CALLS, capUsd: CAP_USD, balanceUsd, statePath });
}

if (process.argv[1]?.endsWith("phase-3-601-final-certify.ts")) void (async () => {
  const actualSha = gitSha();
  const isAnc = (() => { try { execSync(`git merge-base --is-ancestor ${STARTING_SHA} HEAD`); return true; } catch { return false; } })();
  const delta = execSync(`git diff ${STARTING_SHA} HEAD --name-only`, { encoding: "utf8" }).trim().split("\n").filter(Boolean);
  const tree = (rev: string) => execSync(`git ls-tree -r ${rev} --name-only lib/contract-model/compiler | sort | while read f; do git show ${rev}:$f | sha256sum; done | sha256sum`, { encoding: "utf8", shell: "/bin/bash" }).split(" ")[0];
  const pinTree = tree(STARTING_SHA), headTree = tree("HEAD"), passATree = tree("f108ba2");
  const dirty = execSync("git status --porcelain", { encoding: "utf8" }).trim().split("\n").filter((l) => l.trim() !== "" && !/docs\/phase-3-final-601\/(4[7-9]|5\d|6[0-2])-final-clean|phase-3-final-601-final-clean/.test(l)).join("\n");
  const harnessOnly = execSync("git diff f108ba2 HEAD --name-only", { encoding: "utf8" }).trim().split("\n").filter(Boolean).filter((f) => !f.startsWith("docs/") && !f.startsWith("tests/fixtures/"));
  const sourceSha = sha256(readFileSync(CHWY_SRC));
  const { refHash, byLabel } = section601ReferenceItems();
  const { built, prePlan, preMode, batchesPerPass, rates } = buildPlanContext();
  const sectionSha = sha256(built.operativeSourceText);
  const crit = byLabel.filter((i) => i.materiality === "CRITICAL").length, mat = byLabel.filter((i) => i.materiality === "MATERIAL").length;
  const idChecks = {
    startingShaPin: { expected: STARTING_SHA, actual: actualSha, exactMatch: actualSha === STARTING_SHA, isDescendantOfPin: isAnc, filesChangedSincePin: delta, allHarnessOnly: delta.every((f) => f.startsWith("scripts/")), productionTreeIdentical: pinTree === headTree, match: actualSha === STARTING_SHA || (isAnc && delta.every((f) => f.startsWith("scripts/")) && pinTree === headTree) },
    workingTreeClean: { actual: dirty, match: dirty === "" },
    productionUnchangedSinceValidPassARun: { passARunPin: "f108ba2", treeAtPassARun: passATree, treeNow: headTree, match: passATree === headTree },
    harnessFixesLimitedToHarness: { nonDocNonFixtureFilesChangedSincePassARun: harnessOnly, match: harnessOnly.every((f) => f.startsWith("scripts/")) },
    sourceSha256: { expected: EXPECT.sourceSha, actual: sourceSha, match: sourceSha === EXPECT.sourceSha },
    sectionTextSha256: { expected: EXPECT.sectionSha, actual: sectionSha, match: sectionSha === EXPECT.sectionSha },
    sectionSpan: { expected: [EXPECT.charStart, EXPECT.charEnd], actual: [built.sec.charStart, built.sec.charEnd], match: built.sec.charStart === EXPECT.charStart && built.sec.charEnd === EXPECT.charEnd },
    sectionChars: { expected: EXPECT.chars, actual: built.operativeSourceText.length, match: built.operativeSourceText.length === EXPECT.chars },
    referenceSha256: { expected: EXPECT.refSha, actual: refHash, match: refHash === EXPECT.refSha },
    referenceSlice: { expected: { total: 8, critical: 4, material: 4 }, actual: { total: byLabel.length, critical: crit, material: mat }, match: byLabel.length === 8 && crit === 4 && mat === 4 },
  };
  const allIdOk = Object.values(idChecks).every((c) => c.match);
  const verifierSrc = readFileSync("lib/contract-model/compiler/semantic-verification/verify.ts", "utf8");
  writeJson(`${OUT}/47-final-clean-freeze.json`, {
    artifact: "PHASE 3 FINAL-BRIDGE / 6.01 FINAL CLEAN RUN §1-§3 - frozen head, identities, versions", at: new Date().toISOString(),
    idChecks, allIdentityChecksMatch: allIdOk,
    versions: { compilerAlgorithm: SEMANTIC_COMPILER_ALGORITHM_VERSION, compilerPrompt: SEMANTIC_COMPILER_PROMPT_VERSION, toolPolicy: SEMANTIC_COMPILER_TOOL_POLICY_VERSION, accountabilityAlgorithm: SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION, inventoryPrompt: SEMANTIC_INVENTORY_PROMPT_VERSION, sourceIdentityMigration: SOURCE_IDENTITY_MIGRATION_VERSION, executionPolicy: SEMANTIC_EXECUTION_POLICY_VERSION, shardPlanner: SHARD_PLANNER_ALGORITHM_VERSION, shardBudget: DEFAULT_SHARD_BUDGET, irSchema: IR_SCHEMA_VERSION, verifier: verifierSrc.match(/VERIFIER_(?:ALGORITHM_)?VERSION\s*=\s*"([^"]+)"/)?.[1] ?? null },
    harnessCode: { guard: sha256(readFileSync("scripts/phase-3-601-guard.ts")), certify: sha256(readFileSync("scripts/phase-3-601-final-certify.ts")), run: existsSync("scripts/phase-3-601-final-run.ts") ? sha256(readFileSync("scripts/phase-3-601-final-run.ts")) : null },
    costMethodology: { source: "docs/phase-3-final-601/01-cost-preflight.json", conservative: "worst observed rates x 1.25", perShardFloor: false, meanSubstitution: false },
    referenceItems: { total: byLabel.length, critical: crit, material: mat, exposedToModel: false },
    priorSpend: PRIOR, paidCallsAfterLatestHarnessFix: 0,
  });

  // ---------------- §4 HD-1
  const credits = loadGatewayKey() ? await gatewayCredits() : null;
  const balance = credits ? Number(credits.balance) : 0;
  const guard = newGuard(rates, batchesPerPass, prePlan.totals.estimatedInputTokens, balance, null);
  const live = guard.conservativeRemaining();
  const unrounded = ((batchesPerPass * rates.passABatchWorst + rates.passAGapWorst) * 2 + prePlan.totals.estimatedInputTokens * rates.passBWorst + rates.verifierSemanticReview + CONDITION_SUSPICION_CALLS * CONDITION_SUSPICION_PER_CALL) * 1.25;
  const hd1 = { liveInitialUsd: +live.toFixed(6), frozenEstimatorUsd: +unrounded.toFixed(6), deltaUsd: +(live - unrounded).toFixed(12), historicalExpectedUsd: 15.830939, agrees: Math.abs(live - unrounded) < 1e-9, firstPassACall: guard.wouldAdmit() };
  const hd1Ok = hd1.agrees && hd1.firstPassACall.admitted;
  // ---------------- §4 HD-2
  const mk = (s: string, n: number) => ({ inventoryStatus: s, items: new Array(n).fill({}) });
  const hd2Cases = [
    { name: "INVENTORY_COVERAGE_GAP + items>0 + ensembleBuilt + authoritative>0", input: { pass1: mk("INVENTORY_COVERAGE_GAP", 284), pass2: mk("INVENTORY_COVERAGE_GAP", 290), ensembleBuilt: true, authoritativeItemCount: 322 }, expected: true },
    { name: "INVENTORY_FAILED", input: { pass1: mk("INVENTORY_FAILED", 0), pass2: mk("INVENTORY_COVERAGE_GAP", 290), ensembleBuilt: true, authoritativeItemCount: 322 }, expected: false },
    { name: "absent inventory", input: { pass1: null, pass2: mk("INVENTORY_COVERAGE_GAP", 290), ensembleBuilt: true, authoritativeItemCount: 322 }, expected: false },
    { name: "zero items", input: { pass1: mk("INVENTORY_COVERAGE_GAP", 0), pass2: mk("INVENTORY_COVERAGE_GAP", 290), ensembleBuilt: true, authoritativeItemCount: 322 }, expected: false },
    { name: "ensemble not built", input: { pass1: mk("INVENTORY_COVERAGE_GAP", 284), pass2: mk("INVENTORY_COVERAGE_GAP", 290), ensembleBuilt: false, authoritativeItemCount: 322 }, expected: false },
  ].map((c) => { const actual = passAPrerequisiteSatisfied(c.input as Parameters<typeof passAPrerequisiteSatisfied>[0]); return { name: c.name, expected: c.expected, actual, passed: actual === c.expected }; });
  const hd2Ok = hd2Cases.every((c) => c.passed);
  // ---------------- §4 HD-3 - through the EXACT helper the paid run uses
  const synthetic = { candidateRef: built.candidateRef, documentId: "doc-a", inventoryStatus: "INVENTORY_COVERAGE_GAP", frozenContentHash: "synthetic-" + sha256("hd3-certification"), sourceContextState: built.sourceContext.state, items: [
    { inventoryItemId: "syn-1", sourceSpan: { regionId: "operative", documentId: "doc-a", sourceNodeId: null, sectionRef: "6.01", charStart: 0, charEnd: 40, sourceCitation: "syn" }, semanticRole: "RESTRICTION", proposition: "synthetic proposition one", quantitativeValues: [{ kind: "RATIO", rawText: "2.00x", normalizedValue: 2, unit: "x", charStart: 10, charEnd: 15 }], referencedTerms: ["Term A"], referencedSections: [], parentItemId: null, relatedItemIds: [], materiality: "CRITICAL", ambiguity: "NONE", ambiguityReason: null, support: { supportingPasses: ["pass-1", "pass-2"], supportStatus: "CORROBORATED", memberItemIds: { "pass-1": ["a"], "pass-2": ["b"] } } },
    { inventoryItemId: "syn-2", sourceSpan: { regionId: "operative", documentId: "doc-a", sourceNodeId: null, sectionRef: "6.01", charStart: 41, charEnd: 90, sourceCitation: "syn" }, semanticRole: "PERMISSION", proposition: "synthetic proposition two", quantitativeValues: [], referencedTerms: [], referencedSections: ["Section 1.01"], parentItemId: null, relatedItemIds: ["syn-1"], materiality: "MATERIAL", ambiguity: "NONE", ambiguityReason: null, support: { supportingPasses: ["pass-1"], supportStatus: "SINGLE_RUN", memberItemIds: { "pass-1": ["c"] } } },
  ], unaccountedSource: [{ regionId: "operative", charStart: 91, charEnd: 120, reason: "synthetic" }], uninventoriedValues: [], ensemble: { policy: "SUPPORT_AWARE_CANONICAL_UNION", counts: { canonicalItems: 2, corroborated: 1, singleRun: 1, conflicted: 0 }, supportReviewRequired: true, compatibility: { mode: "STRICT", sourceContextHash: "syn", partitionHash: "syn" } }, sourceIdentity: { method: "RECORDED_AT_FREEZE", sourceContextHash: "syn", partitionHash: "syn" } };
  const synPath = `${RAW}/certification/synthetic-frozen-inventory.json`;
  const proof = persistAndReload(synPath, synthetic);
  const existsBeforeGate = existsSync(synPath);
  const simulatedGate = passAPrerequisiteSatisfied({ pass1: mk("INVENTORY_COVERAGE_GAP", 2), pass2: mk("INVENTORY_COVERAGE_GAP", 2), ensembleBuilt: true, authoritativeItemCount: proof.reloaded.items.length });
  const hd3 = { helper: "scripts/phase-3-601-guard.ts persistAndReload (writeJsonDurable: write -> fsync -> close)", path: synPath, existsAfterWrite: proof.existsAfterWrite, writtenSha256: proof.writtenSha256, readSha256: proof.readSha256, hashEqual: proof.hashEqual, structurallyEqual: proof.structurallyEqual, reloadedItemCount: proof.reloaded.items.length, reloadedFrozenContentHash: proof.reloaded.frozenContentHash, reloadedCandidateRef: proof.reloaded.candidateRef, reloadedSourceContextState: proof.reloaded.sourceContextState, fileExistedBeforeSimulatedGate: existsBeforeGate, simulatedGateResultOnReloaded: simulatedGate, ordering: "persist -> reload -> gate (the gate only ever sees the reloaded object)" };
  const hd3Ok = proof.existsAfterWrite && proof.hashEqual && proof.structurallyEqual && proof.reloaded.items.length === 2 && existsBeforeGate && simulatedGate;
  const certified = allIdOk && hd1Ok && hd2Ok && hd3Ok;

  // ---------------- §5/§6 cost preflight
  const mean = estimate601(batchesPerPass, prePlan.totals.estimatedInputTokens, rates, rates.passABatchMean, rates.passAGapMean, rates.passBMean, 1);
  const worst = estimate601(batchesPerPass, prePlan.totals.estimatedInputTokens, rates, rates.passABatchWorst, rates.passAGapWorst, rates.passBWorst, 1);
  const conservative = estimate601(batchesPerPass, prePlan.totals.estimatedInputTokens, rates, rates.passABatchWorst, rates.passAGapWorst, rates.passBWorst, 1.25);
  const fits = conservative.totalUsd <= CAP_USD && balance >= conservative.totalUsd;
  const decision = !allIdOk ? "PHASE3_601_ENVIRONMENT_BLOCKED" : !(hd1Ok && hd2Ok && hd3Ok) ? "PHASE3_601_HARNESS_DEFECT" : !fits ? "PHASE3_601_COST_BOUND_BEFORE_START" : "CERTIFIED_CLEAR_TO_EXECUTE";
  writeJson(`${OUT}/48-final-clean-harness-certification.json`, { artifact: "PHASE 3 FINAL-BRIDGE / 6.01 FINAL CLEAN RUN §4 - zero-cost certification of HD-1, HD-2 and HD-3 closures (0 model calls)", at: new Date().toISOString(), hd1: { ...hd1, certified: hd1Ok }, hd2: { predicate: "passAPrerequisiteSatisfied (scripts/phase-3-601-guard.ts), imported by the paid runner", cases: hd2Cases, certified: hd2Ok }, hd3: { ...hd3, certified: hd3Ok }, certified, decision, paidCallsMade: 0 });
  writeJson(`${OUT}/49-final-clean-cost-preflight.json`, { artifact: "PHASE 3 FINAL-BRIDGE / 6.01 FINAL CLEAN RUN §5/§6 - cost preflight (frozen methodology)", at: new Date().toISOString(), rates, deterministicPlan: { mode: preMode.mode, reason: preMode.reason, planHash: prePlan.planHash, shards: prePlan.shards.length, oversizedShards: prePlan.totals.oversizedShards, plannerEstimatedInputTokens: prePlan.totals.estimatedInputTokens, passABatchesPerPass: batchesPerPass, plannedWithEmptyInventory: true }, estimates: { meanRate: mean, worstObservedRate: worst, conservative: { ...conservative, safetyFactor: 1.25 } }, gate: { capUsd: CAP_USD, gatewayBalanceUsd: balance, conservativeFitsCap: conservative.totalUsd <= CAP_USD, balanceCoversEstimate: balance >= conservative.totalUsd, passed: fits }, priorSpend: PRIOR, decision });
  console.log(JSON.stringify({ decision, allIdOk, hd1: hd1Ok, hd2: hd2Ok, hd3: hd3Ok, live: +live.toFixed(6), conservative: conservative.totalUsd, balance, cap: CAP_USD, plan: { mode: preMode.mode, shards: prePlan.shards.length, batchesPerPass } }, null, 1));
})();
