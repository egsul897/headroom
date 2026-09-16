/**
 * PHASE 3 FINAL-BRIDGE / 6.01 FINAL RESTART-SAFE PAID RUN - zero-cost pre-run gate (mission §1-§5).
 * Writes 74 (freeze + HD-4 intact + certified-import verification) and 75 (cost preflight, frozen methodology, live
 * balance). Zero model calls; one gateway balance read. Run: npx tsx scripts/phase-3-601-final-paid-preflight.ts
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gatewayCredits, loadGatewayKey, writeJson } from "./f7b-lib";
import { OUT, CAP_USD, PRIOR, buildPlanContext } from "./phase-3-601-final-certify";
import { estimate601, section601ReferenceItems } from "./phase-3-601-preflight";
import { CONDITION_SUSPICION_CALLS, CONDITION_SUSPICION_PER_CALL, Guard } from "./phase-3-601-guard";
import { DURABLE_CALL_RECORD_VERSION, DURABLE_REPLAY_ALGORITHM_VERSION, DURABLE_SHARD_RECORD_VERSION } from "./phase-3-601-durable-replay";
import { SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION } from "../lib/contract-model/compiler/semantic/types";
import { SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION, SEMANTIC_INVENTORY_PROMPT_VERSION } from "../lib/contract-model/compiler/semantic-accountability/types";
import { SEMANTIC_VERIFIER_ALGORITHM_VERSION, SEMANTIC_VERIFIER_PROMPT_VERSION } from "../lib/contract-model/compiler/semantic-verification/types";
import { SOURCE_IDENTITY_MIGRATION_VERSION } from "../lib/contract-model/compiler/semantic-accountability/source-identity";

export const STARTING_SHA = "e6baf51b6a1211323a2926daaba21ed4a3facd1c";
export const MISSION_ID = "phase-3-final-601-final-paid";
export const EVIDENCE_DIR = "tests/fixtures/unseen-packages/phase-3-final-601-final-paid";
const HD4_PIN = "5bd15c263b1e8fdadd16b908d5037f298af0d1e2";
const CHWY_SRC = "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt";
const EXPECT = { sourceSha: "f63b9dc6560e699cd5158ee0f254dba76da92612ad75fdc27756047ad8f49eeb", sectionSha: "6b79685c94a08a9d27b484aaac52282ce92dbe9a7c3321bc38ff6504d12ec02a", refSha: "e7f863e58ee53ca499598f2a8194ff98a0f8f74d2a8ced23b6f12b96c2a64036", charStart: 608901, charEnd: 642524, chars: 33623 };
const sha256 = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const sh = (c: string) => execSync(c, { encoding: "utf8" }).trim();

void (async () => {
  const head = sh("git rev-parse HEAD");
  const porcelain = execSync("git status --porcelain", { encoding: "utf8" }).split("\n").filter(Boolean).map((l) => l.slice(3));
  const missionArtifacts = porcelain.filter((p) => p.startsWith("docs/phase-3-final-601/7[4-9]") || /^docs\/phase-3-final-601\/(7[4-9]|8\d)-/.test(p) || p.startsWith(EVIDENCE_DIR) || p.startsWith("scripts/phase-3-601-final-paid-") || p === "scripts/phase-3-601-hd4-run.ts");
  const otherDirty = porcelain.filter((p) => !missionArtifacts.includes(p));
  const libTree = (rev: string) => sh(`git rev-parse ${rev}:lib`);
  const hd4Gate = JSON.parse(readFileSync(`${OUT}/73-hd4-gate.json`, "utf8")) as { verdict: string; summary: { PASS: number; FAIL: number }; paidCalls: number; spendUsd: number };
  const runSrc = readFileSync("scripts/phase-3-601-hd4-run.ts", "utf8");
  const importChecks = {
    resumablePassA: /import \{[^}]*resumablePassA[^}]*\} from "\.\/phase-3-601-hd4-resume"/.test(runSrc),
    durableVerifierCallers: /import \{[^}]*durableVerifierCallers[^}]*\} from "\.\/phase-3-601-hd4-resume"/.test(runSrc),
    durableShardStoreAndExecutor: /import \{[^}]*DurableShardStore[^}]*durableShardExecutor[^}]*\} from "\.\/phase-3-601-durable-replay"/.test(runSrc),
    guardAndGuardedCaller: /import \{[^}]*GuardedStageCaller[^}]*\} from "\.\/phase-3-601-guard"/.test(runSrc) && /newGuard/.test(runSrc),
    productionShardExecutorWrapped: /createBoundedShardExecutor\(/.test(runSrc) && /durableShardExecutor\(/.test(runSrc),
    productionEntryPoint: /compileCovenantToIR\(/.test(runSrc) && /verifyCompiledCandidate\(/.test(runSrc),
    noLocalReplayImplementation: !/class .*StageCaller/.test(runSrc),
  };
  const moduleHashes = Object.fromEntries(["scripts/phase-3-601-durable-replay.ts", "scripts/phase-3-601-hd4-resume.ts", "scripts/phase-3-601-guard.ts", "scripts/phase-3-601-hd4-run.ts", "scripts/phase-3-601-final-certify.ts", "scripts/phase-3-601-preflight.ts"].map((f) => [f, { working: sha256(readFileSync(f)), atHd4Head: (() => { try { return sha256(sh(`git show ${STARTING_SHA}:${f}`) + "\n"); } catch { return null; } })() }]));
  const sourceSha = sha256(readFileSync(CHWY_SRC));
  const { refHash, byLabel } = section601ReferenceItems();
  const { built, prePlan, preMode, batchesPerPass, rates } = buildPlanContext();
  const sectionSha = sha256(built.operativeSourceText);
  const crit = byLabel.filter((i) => i.materiality === "CRITICAL").length, mat = byLabel.filter((i) => i.materiality === "MATERIAL").length;
  const idChecks = {
    startingSha: { expected: STARTING_SHA, actual: head, match: head === STARTING_SHA },
    workingTreeCleanOutsideMission: { otherDirty, match: otherDirty.length === 0 },
    productionTreeUnchangedSinceHd4: { libAtHd4Certification: libTree(STARTING_SHA), libAtHd4Pin: libTree(HD4_PIN), libNow: libTree("HEAD"), libWorkingClean: sh("git status --porcelain -- lib app prisma") === "", match: libTree(STARTING_SHA) === libTree("HEAD") && libTree(HD4_PIN) === libTree("HEAD") && sh("git status --porcelain -- lib app prisma") === "" },
    hd4Gate: { verdict: hd4Gate.verdict, pass: hd4Gate.summary.PASS, fail: hd4Gate.summary.FAIL, paidCalls: hd4Gate.paidCalls, match: hd4Gate.verdict === "HD4_DURABLE_REPLAY_CERTIFIED" && hd4Gate.summary.PASS === 21 && hd4Gate.summary.FAIL === 0 && hd4Gate.paidCalls === 0 },
    certifiedImports: { ...importChecks, match: Object.values(importChecks).every(Boolean) },
    sourceSha256: { expected: EXPECT.sourceSha, actual: sourceSha, match: sourceSha === EXPECT.sourceSha },
    sectionTextSha256: { expected: EXPECT.sectionSha, actual: sectionSha, match: sectionSha === EXPECT.sectionSha },
    sectionSpan: { expected: [EXPECT.charStart, EXPECT.charEnd, EXPECT.chars], actual: [built.sec.charStart, built.sec.charEnd, built.operativeSourceText.length], match: built.sec.charStart === EXPECT.charStart && built.sec.charEnd === EXPECT.charEnd && built.operativeSourceText.length === EXPECT.chars },
    referenceSha256: { expected: EXPECT.refSha, actual: refHash, match: refHash === EXPECT.refSha },
    referenceSlice: { expected: { total: 8, critical: 4, material: 4 }, actual: { total: byLabel.length, critical: crit, material: mat }, match: byLabel.length === 8 && crit === 4 && mat === 4 },
  };
  const allOk = Object.values(idChecks).every((c) => c.match);
  writeJson(`${OUT}/74-final-paid-freeze.json`, { artifact: "PHASE 3 FINAL-BRIDGE / 6.01 FINAL RESTART-SAFE PAID RUN §1-§4 - frozen state, HD-4 intact, certified imports", at: new Date().toISOString(), missionId: MISSION_ID, evidenceDir: EVIDENCE_DIR, idChecks, allChecksMatch: allOk,
    versions: { compilerAlgorithm: SEMANTIC_COMPILER_ALGORITHM_VERSION, compilerPrompt: SEMANTIC_COMPILER_PROMPT_VERSION, passAAlgorithm: SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION, passAPrompt: SEMANTIC_INVENTORY_PROMPT_VERSION, verifierAlgorithm: SEMANTIC_VERIFIER_ALGORITHM_VERSION, verifierPrompt: SEMANTIC_VERIFIER_PROMPT_VERSION, sourceIdentityMigration: SOURCE_IDENTITY_MIGRATION_VERSION, durableCallRecord: DURABLE_CALL_RECORD_VERSION, durableReplayAlgorithm: DURABLE_REPLAY_ALGORITHM_VERSION, durableShardRecord: DURABLE_SHARD_RECORD_VERSION },
    harnessModules: moduleHashes, harnessChangeBeforePaidExecution: "scripts/phase-3-601-hd4-run.ts gained mission-level cross-launch cap accounting (mission-start.json pins the starting balance; a restart charges startBalance - balanceNow against the same cap before any new call) and a launches.ndjson log; the certified replay/resume/shard/verifier/guard modules are byte-identical to the HD-4 head",
    costMethodology: { source: "docs/phase-3-final-601/01-cost-preflight.json", conservative: "worst observed rates x 1.25", perShardFloor: false, meanSubstitution: false }, referenceItems: { total: byLabel.length, critical: crit, material: mat, exposedToModel: false }, priorSpend: PRIOR, cumulativePriorSection601Usd: 13.525078 });

  loadGatewayKey();
  const credits = await gatewayCredits();
  const balance = credits ? Number(credits.balance) : 0;
  const mean = estimate601(batchesPerPass, prePlan.totals.estimatedInputTokens, rates, rates.passABatchMean, rates.passAGapMean, rates.passBMean, 1);
  const worst = estimate601(batchesPerPass, prePlan.totals.estimatedInputTokens, rates, rates.passABatchWorst, rates.passAGapWorst, rates.passBWorst, 1);
  const conservative = estimate601(batchesPerPass, prePlan.totals.estimatedInputTokens, rates, rates.passABatchWorst, rates.passAGapWorst, rates.passBWorst, 1.25);
  const guard = new Guard({ rates, passABatchesPerPass: batchesPerPass, passAGapCallsPerPass: 1, passes: 2, passBPlannerTokens: prePlan.totals.estimatedInputTokens, verifierReviews: 1, conditionSuspicionCalls: CONDITION_SUSPICION_CALLS, capUsd: CAP_USD, balanceUsd: balance });
  const live = guard.conservativeRemaining();
  const unrounded = ((batchesPerPass * rates.passABatchWorst + rates.passAGapWorst) * 2 + prePlan.totals.estimatedInputTokens * rates.passBWorst + rates.verifierSemanticReview + CONDITION_SUSPICION_CALLS * CONDITION_SUSPICION_PER_CALL) * 1.25;
  const fits = conservative.totalUsd <= CAP_USD && balance >= conservative.totalUsd;
  const decision = !allOk ? "PHASE3_601_ENVIRONMENT_BLOCKED" : !fits ? "PHASE3_601_COST_BOUND_BEFORE_START" : "CLEAR_TO_EXECUTE";
  writeJson(`${OUT}/75-final-paid-cost-preflight.json`, { artifact: "PHASE 3 FINAL-BRIDGE / 6.01 FINAL RESTART-SAFE PAID RUN §5 - cost gate (frozen methodology, live balance)", at: new Date().toISOString(), rates, deterministicPlan: { mode: preMode.mode, reason: preMode.reason, planHash: prePlan.planHash, shards: prePlan.shards.length, plannerEstimatedInputTokens: prePlan.totals.estimatedInputTokens, passABatchesPerPass: batchesPerPass, plannedWithEmptyInventory: true }, estimates: { mean, worst, conservative }, liveGuardInitialUsd: +live.toFixed(6), frozenEstimatorUnroundedUsd: +unrounded.toFixed(6), guardAgreesWithEstimator: Math.abs(live - unrounded) < 1e-9, gate: { capUsd: CAP_USD, gatewayBalanceUsd: balance, conservativeFitsCap: conservative.totalUsd <= CAP_USD, balanceCoversConservative: balance >= conservative.totalUsd, firstCallAdmissible: guard.wouldAdmit().admitted }, decision, paidCallsMade: 0 });
  console.log(JSON.stringify({ decision, allOk, failing: Object.entries(idChecks).filter(([, c]) => !c.match).map(([k]) => k), conservative: conservative.totalUsd, live: +live.toFixed(6), balance, cap: CAP_USD, plan: { mode: preMode.mode, shards: prePlan.shards.length, batchesPerPass } }, null, 1));
})();
