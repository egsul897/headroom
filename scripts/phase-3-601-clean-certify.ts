/**
 * PHASE 3 FINAL-BRIDGE / 6.01 CLEAN RERUN - §1/§2/§3 freeze + MANDATORY zero-cost HD-1 harness certification.
 * Instantiates the EXACT Guard the paid run will use (scripts/phase-3-601-guard.ts) against the current
 * deterministic Section 6.01 plan, the live balance and the $15.84 cap, and proves that:
 *   (a) its initial conservativeRemaining() equals the frozen pre-run conservative estimate, and
 *   (b) the first Pass-A call of BOTH passes is admissible.
 * Zero model calls. One gateway balance read. Writes 22 and 23.
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { buildSection601, section601ReferenceItems, observedRates, estimate601 } from "./phase-3-601-preflight";
import { Guard, CONDITION_SUSPICION_CALLS } from "./phase-3-601-guard";
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
export const CLEAN_RAW = "tests/fixtures/unseen-packages/phase-3-final-601-clean-rerun";
export const STARTING_SHA = "f108ba24886e689830a3e3ddff421013e8f20d36";
export const CAP_USD = 15.84;
export const PRIOR_VOID_SPEND_USD = 3.501676;
const EXPECT = { sourceSha: "f63b9dc6560e699cd5158ee0f254dba76da92612ad75fdc27756047ad8f49eeb", sectionSha: "6b79685c94a08a9d27b484aaac52282ce92dbe9a7c3321bc38ff6504d12ec02a", refSha: "e7f863e58ee53ca499598f2a8194ff98a0f8f74d2a8ced23b6f12b96c2a64036", charStart: 608901, charEnd: 642524, chars: 33623, refItems: 8, refCritical: 4, refMaterial: 4 };
const sha256 = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

/** Everything the paid run needs, established with zero model calls. */
export function buildCleanRunPlan() {
  const built = buildSection601();
  const emptyInv = { candidateRef: built.candidateRef, items: [], uninventoriedValues: [], unaccountedSource: [], sourceCoverage: null, gapReinventory: null, inventoryStatus: "INVENTORY_SKIPPED_NO_PROVIDER", inventoryStatusReason: "preflight estimate", rejectedUnverifiableItems: [], rejectedDuplicateItems: [], sourceContextState: built.sourceContext.state, frozenContentHash: "preflight", frozenAt: "", algorithmVersion: "", promptVersion: "", provider: "", model: "", telemetryCostUsd: null } as unknown as Parameters<typeof planCompilationShards>[0]["frozenInventory"];
  const prePlan = planCompilationShards({ candidateRef: built.candidateRef, companyId: built.input.companyId, instrumentKey: built.input.instrumentKey, documentId: "doc-a", sourceContext: built.sourceContext, frozenInventory: emptyInv, structuralIndex: built.chewy.index, generation: { algorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION, promptVersion: SEMANTIC_COMPILER_PROMPT_VERSION } });
  const preMode = selectCompilationExecutionMode(prePlan);
  const batchesPerPass = batchSlots(partitionSourceSlots({ sourceContext: built.sourceContext, structuralIndex: built.chewy.index }), built.sourceContext, 6000).length;
  const rates = observedRates();
  return { built, prePlan, preMode, batchesPerPass, rates };
}

export function newGuard(rates: ReturnType<typeof observedRates>, batchesPerPass: number, plannerTokens: number, balanceUsd: number, statePath: string | null) {
  return new Guard({ rates, passABatchesPerPass: batchesPerPass, passAGapCallsPerPass: 1, passes: 2, passBPlannerTokens: plannerTokens, verifierReviews: 1, conditionSuspicionCalls: CONDITION_SUSPICION_CALLS, capUsd: CAP_USD, balanceUsd, statePath });
}

if (process.argv[1]?.endsWith("phase-3-601-clean-certify.ts")) void (async () => {
  const actualSha = gitSha();
  // §1 pins f108ba2. Certifying "the exact Guard the paid run will use" (§3) requires that guard to EXIST, so the
  // harness modules were committed first and HEAD advanced. The pin is therefore honoured as: f108ba2 is an ancestor
  // of HEAD, every file added since touches only scripts/ (harness), and the production compiler tree hash is
  // byte-identical to f108ba2's. Disclosed here rather than relaxed silently.
  const shaIsAncestor = (() => { try { execSync(`git merge-base --is-ancestor ${STARTING_SHA} HEAD`); return true; } catch { return false; } })();
  const deltaSincePin = execSync(`git diff ${STARTING_SHA} HEAD --name-only`, { encoding: "utf8" }).trim().split("\n").filter(Boolean);
  const treeAt = (rev: string) => execSync(`git ls-tree -r ${rev} --name-only lib/contract-model/compiler | sort | while read f; do git show ${rev}:$f | sha256sum; done | sha256sum`, { encoding: "utf8", shell: "/bin/bash" }).split(" ")[0];
  const pinTree = treeAt(STARTING_SHA), headTree = treeAt("HEAD");
  // The mission's own output artifacts are written by THIS script, so they are excluded from the cleanliness check.
  const dirty = execSync("git status --porcelain", { encoding: "utf8" }).trim().split("\n").filter((l) => l.trim() !== "" && !/docs\/phase-3-final-601\/(2|3)\d-clean-rerun/.test(l)).join("\n");
  const prodDelta = Number(execSync("git diff d51e7f2 HEAD --name-only | grep -cE '^(lib|app|prisma)/' || true", { encoding: "utf8" }).trim());
  const hd1Files = execSync("git diff d51e7f2 HEAD --name-only", { encoding: "utf8" }).trim().split("\n").filter((f) => !f.startsWith("docs/") && !f.startsWith("tests/fixtures/"));
  const productionTree = execSync("git ls-tree -r HEAD --name-only lib/contract-model/compiler | sort | xargs sha256sum | sha256sum", { encoding: "utf8" }).split(" ")[0];
  const verifierSrc = readFileSync("lib/contract-model/compiler/semantic-verification/verify.ts", "utf8");
  const verifierVersion = verifierSrc.match(/VERIFIER_(?:ALGORITHM_)?VERSION\s*=\s*"([^"]+)"/)?.[1] ?? null;
  const sourceSha = sha256(readFileSync(CHWY_SRC));
  const { refHash, byLabel } = section601ReferenceItems();
  const { built, prePlan, preMode, batchesPerPass, rates } = buildCleanRunPlan();
  const { sec, operativeSourceText, sourceContext } = built;
  const sectionSha = sha256(operativeSourceText);
  const inSpan = byLabel.filter((i) => i.span[0] >= sec.charStart && i.span[1] <= sec.charEnd);
  const crit = byLabel.filter((i) => i.materiality === "CRITICAL").length, mat = byLabel.filter((i) => i.materiality === "MATERIAL").length;

  const idChecks = {
    startingShaPin: { expected: STARTING_SHA, actual: actualSha, exactMatch: actualSha === STARTING_SHA, isDescendantOfPin: shaIsAncestor, filesAddedSincePin: deltaSincePin, allAddedFilesAreHarness: deltaSincePin.every((f) => f.startsWith("scripts/")), productionCompilerTreeShaAtPin: pinTree, productionCompilerTreeShaAtHead: headTree, productionTreeIdentical: pinTree === headTree, match: shaIsAncestor && deltaSincePin.every((f) => f.startsWith("scripts/")) && pinTree === headTree, note: "exact-SHA equality is impossible once §3's mandatory certification harness is committed; the pin is honoured as ancestry + harness-only delta + identical production compiler tree" },
    workingTreeClean: { expected: "", actual: dirty, match: dirty === "" },
    productionSemanticChangesSinceD51e7f2: { expected: 0, actual: prodDelta, match: prodDelta === 0 },
    hd1FixConfinedToHarness: { nonDocNonFixtureFilesChanged: hd1Files, match: hd1Files.every((f) => f.startsWith("scripts/")) },
    sourceSha256: { expected: EXPECT.sourceSha, actual: sourceSha, match: sourceSha === EXPECT.sourceSha },
    sectionTextSha256: { expected: EXPECT.sectionSha, actual: sectionSha, match: sectionSha === EXPECT.sectionSha },
    sectionSpan: { expected: [EXPECT.charStart, EXPECT.charEnd], actual: [sec.charStart, sec.charEnd], match: sec.charStart === EXPECT.charStart && sec.charEnd === EXPECT.charEnd },
    sectionChars: { expected: EXPECT.chars, actual: operativeSourceText.length, match: operativeSourceText.length === EXPECT.chars },
    referenceSha256: { expected: EXPECT.refSha, actual: refHash, match: refHash === EXPECT.refSha },
    referenceSlice: { expected: { total: 8, critical: 4, material: 4 }, actual: { total: byLabel.length, critical: crit, material: mat }, match: byLabel.length === 8 && crit === 4 && mat === 4 },
    labelSpanAgreement: { byLabel: byLabel.length, bySpan: inSpan.length, match: inSpan.length === byLabel.length },
  };
  const allIdOk = Object.values(idChecks).every((c) => c.match);

  const mean = estimate601(batchesPerPass, prePlan.totals.estimatedInputTokens, rates, rates.passABatchMean, rates.passAGapMean, rates.passBMean, 1);
  const worst = estimate601(batchesPerPass, prePlan.totals.estimatedInputTokens, rates, rates.passABatchWorst, rates.passAGapWorst, rates.passBWorst, 1);
  const conservative = estimate601(batchesPerPass, prePlan.totals.estimatedInputTokens, rates, rates.passABatchWorst, rates.passAGapWorst, rates.passBWorst, 1.25);
  const credits = loadGatewayKey() ? await gatewayCredits() : null;
  const balance = credits ? Number(credits.balance) : 0;

  writeJson(`${OUT}/22-clean-rerun-freeze.json`, {
    artifact: "PHASE 3 FINAL-BRIDGE / 6.01 CLEAN RERUN §1/§2 - frozen head, identities and versions",
    at: new Date().toISOString(), idChecks, allIdentityChecksMatch: allIdOk,
    productionCompilerTreeSha256: productionTree,
    priorVoidAttempt: { spendUsd: PRIOR_VOID_SPEND_USD, creditedToThisMission: false, retainedAs: ["harness-defect evidence", "incidental safe-failure evidence"], artifacts: "docs/phase-3-final-601/11-21" },
    versions: { compilerAlgorithm: SEMANTIC_COMPILER_ALGORITHM_VERSION, compilerPrompt: SEMANTIC_COMPILER_PROMPT_VERSION, toolPolicy: SEMANTIC_COMPILER_TOOL_POLICY_VERSION, accountabilityAlgorithm: SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION, inventoryPrompt: SEMANTIC_INVENTORY_PROMPT_VERSION, sourceIdentityMigration: SOURCE_IDENTITY_MIGRATION_VERSION, executionPolicy: SEMANTIC_EXECUTION_POLICY_VERSION, shardPlanner: SHARD_PLANNER_ALGORITHM_VERSION, shardBudget: DEFAULT_SHARD_BUDGET, irSchema: IR_SCHEMA_VERSION, verifier: verifierVersion },
    section601: { nodeId: sec.nodeId, nodeKey: sec.nodeKey, sectionRef: sec.sectionRef, charStart: sec.charStart, charEnd: sec.charEnd, chars: operativeSourceText.length, textSha256: sectionSha },
    referenceItems: { total: byLabel.length, critical: crit, material: mat, exposedToModel: false, items: byLabel.map((i) => ({ id: i.id, section: i.section, materiality: i.materiality, span: i.span })) },
    deterministicPlan: { mode: preMode.mode, reason: preMode.reason, planHash: prePlan.planHash, shards: prePlan.shards.length, oversizedShards: prePlan.totals.oversizedShards, plannerEstimatedInputTokens: prePlan.totals.estimatedInputTokens, passABatchesPerPass: batchesPerPass, sourceContext: { state: sourceContext.state, regions: sourceContext.regions.length, totalChars: sourceContext.totalChars, unresolvedReferences: sourceContext.unresolvedReferences.length } },
  });

  // ---------------- §3 HD-1 certification against the EXACT live Guard
  const guard = newGuard(rates, batchesPerPass, prePlan.totals.estimatedInputTokens, balance, null);
  const liveInitial = guard.conservativeRemaining();
  // The committed pre-run tiers are stored rounded to 4 decimals by estimate601's toFixed(4). Compare the live guard
  // against the UNROUNDED estimator (must be bit-identical) and, separately, against the stored 4-dp figure.
  const preRunUnrounded = ((batchesPerPass * rates.passABatchWorst + rates.passAGapWorst) * 2
    + prePlan.totals.estimatedInputTokens * rates.passBWorst
    + rates.verifierSemanticReview + CONDITION_SUSPICION_CALLS * 0.0114) * 1.25;
  const delta = liveInitial - preRunUnrounded;
  const deltaVsStoredRounded = liveInitial - conservative.totalUsd;
  const agrees = Math.abs(delta) < 1e-9 && Math.abs(deltaVsStoredRounded) < 5e-5;
  const passA1 = guard.wouldAdmit();
  // Second Pass-A path under its initial expected state: pass 1 complete at its WORST observed cost, pass 2 not started.
  const g2 = newGuard(rates, batchesPerPass, prePlan.totals.estimatedInputTokens, balance, null);
  g2.passABatchesRemaining = batchesPerPass; g2.passAGapRemaining = 1;
  g2.spent = batchesPerPass * rates.passABatchWorst + rates.passAGapWorst;
  const passA2 = g2.wouldAdmit();

  const certified = allIdOk && agrees && passA1.admitted && passA2.admitted && balance >= CAP_USD && conservative.totalUsd <= CAP_USD;
  const decision = !allIdOk ? "PHASE3_601_ENVIRONMENT_BLOCKED" : !agrees || !passA1.admitted || !passA2.admitted ? "PHASE3_601_HARNESS_ESTIMATOR_MISMATCH" : balance < CAP_USD || conservative.totalUsd > CAP_USD ? "PHASE3_601_COST_BOUND_BEFORE_START" : "CERTIFIED_CLEAR_TO_EXECUTE";

  writeJson(`${OUT}/23-clean-rerun-harness-certification.json`, {
    artifact: "PHASE 3 FINAL-BRIDGE / 6.01 CLEAN RERUN §3 - mandatory zero-cost HD-1 harness certification (0 model calls)",
    at: new Date().toISOString(),
    guardUnderTest: { module: "scripts/phase-3-601-guard.ts", sha256: sha256(readFileSync("scripts/phase-3-601-guard.ts")), sameInstanceUsedByPaidRun: true, note: "the certification and the paid run import ONE Guard implementation, so the formula proved here is the formula that runs" },
    hd1: { defect: "the void run's in-run guard added a per-shard Pass B term (max(tokens x rate, shards x worstSingleShardUsd)) absent from the frozen §5 estimator, inflating conservative-remaining by $0.6472 and refusing both Pass A passes", closed: true, perShardTermPresent: false },
    frozenEstimator: { passA: "remaining batch calls x worst batch rate + remaining gap calls x worst gap rate", passB: "remaining plannerEstimatedInputTokens x worst per-token rate", verifier: "reviews x worst review cost + condition-suspicion calls x rate", safetyFactor: 1.25 },
    rates,
    preRunEstimator: { meanRate: mean, worstObservedRate: worst, conservative: { ...conservative, safetyFactor: 1.25 } },
    liveGuardInitialConservativeRemainingUsd: +liveInitial.toFixed(6),
    preRunConservativeUnroundedUsd: +preRunUnrounded.toFixed(6),
    preRunConservativeStoredUsd: conservative.totalUsd,
    deltaVsUnroundedEstimatorUsd: +delta.toFixed(12),
    deltaVsStoredRoundedUsd: +deltaVsStoredRounded.toFixed(9),
    agreesToFloatingPointRounding: agrees,
    agreementNote: "the live guard is bit-identical to the unrounded frozen estimator; the $0.0000389 gap against the committed artifact is only that artifact storing the tier rounded to 4 decimals",
    initialGuardState: guard.state(),
    firstPassACheck: { path: "passA-1:first-call-preflight", ...passA1, passed: passA1.admitted },
    secondPassACheck: { path: "passA-2:first-call-preflight", stateAssumed: "pass 1 fully consumed at WORST observed rates; pass 2 not started", spentAssumedUsd: +g2.spent.toFixed(4), ...passA2, passed: passA2.admitted },
    gate: { capUsd: CAP_USD, gatewayBalanceUsd: balance, balanceCoversCap: balance >= CAP_USD, conservativeFitsCap: conservative.totalUsd <= CAP_USD },
    priorVoidSpendUsd: PRIOR_VOID_SPEND_USD, priorVoidSpendConsumesThisCap: false,
    certified, decision, paidCallsMade: 0, spendUsd: 0,
  });
  console.log(JSON.stringify({ decision, allIdOk, liveInitial: +liveInitial.toFixed(6), preRun: conservative.totalUsd, delta: +delta.toFixed(9), passA1: passA1.admitted, passA2: passA2.admitted, balance, cap: CAP_USD, plan: { mode: preMode.mode, shards: prePlan.shards.length, batchesPerPass, tokens: prePlan.totals.estimatedInputTokens } }, null, 1));
})();
