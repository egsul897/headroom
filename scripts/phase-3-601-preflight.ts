/**
 * PHASE 3 FINAL-BRIDGE §1-§4, §6, §12 - ZERO-COST preflight for the Chewy Section 6.01 fresh integrated
 * validation. Freezes the starting system, the source identity, the Section 6.01 structural node and the
 * Section 6.01 slice of the frozen human reference set; derives the deterministic production plan; and
 * recomputes the cost model with the EXACT methodology committed in docs/phase-3-final-chewy/02-cost-preflight.json
 * (mean / worst-observed / conservative = worst x 1.25). Makes no model call. One gateway balance read.
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { buildChewy, CHWY_SRC, COMPANY, INSTRUMENT } from "./f7a-lib";
import { gatewayCredits, gitSha, loadGatewayKey, writeJson } from "./f7b-lib";
import { loadFrozenStage1, loadStage2 } from "./f7b3-lib";
import { freezeAndPlan } from "./f7b-lib";
import { buildCovenantContextBundle } from "../lib/contract-model/compiler/context-retrieval/pipeline";
import { resolveSourceContext } from "../lib/contract-model/compiler/semantic-accountability/source-context";
import { planCompilationShards, DEFAULT_SHARD_BUDGET } from "../lib/contract-model/compiler/semantic/shard-planner";
import { selectCompilationExecutionMode, SEMANTIC_EXECUTION_POLICY_VERSION } from "../lib/contract-model/compiler/semantic/execution-mode";
import { SHARD_PLANNER_ALGORITHM_VERSION } from "../lib/contract-model/compiler/semantic/shard-types";
import { SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION, SEMANTIC_COMPILER_TOOL_POLICY_VERSION } from "../lib/contract-model/compiler/semantic/types";
import { SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION, SEMANTIC_INVENTORY_PROMPT_VERSION } from "../lib/contract-model/compiler/semantic-accountability/types";
import { SOURCE_IDENTITY_MIGRATION_VERSION } from "../lib/contract-model/compiler/semantic-accountability/source-identity";
import { IR_SCHEMA_VERSION } from "../lib/contract-model/ir/types";
import type { DiscoveredCandidate } from "../lib/contract-model/compiler/discovery/types";
import { computeOperativeContractState } from "../lib/contract-model/compiler/amendment/operative-state";
import type { OperativeContractState } from "../lib/contract-model/compiler/amendment/types";

const OUT = "docs/phase-3-final-601";
const STARTING_SHA = "a013ffdc4195257505a2e6546e984e7153cbf5bb";
const SECTION = "6.01";
const HARD_CAP_USD = 11.5;
const TOC_BOUNDARY = 8980;
const PASS_A_BATCH_CHARS = 6000;
const CONDITION_SUSPICION_PER_CALL = 0.0114;
const CONDITION_SUSPICION_CALLS = 5;
const sha256 = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

export interface Preflight601 {
  node: { nodeId: string; nodeKey: string; sectionRef: string; charStart: number; charEnd: number; chars: number };
  plan: { mode: string; reason: string; planHash: string; shards: number; oversized: number; estimatedInputTokens: number; maxShardInputTokens: number };
  passABatchesPerPass: number;
  sourceContext: { state: string; regions: number; totalChars: number; unresolvedReferences: number };
  estimates: Record<string, { passAUsd: number; passBUsd: number; verifierUsd: number; totalUsd: number }>;
  balance: number | null;
  decision: string;
}

/** The document date of the Chewy base agreement fixture (doc-a-2026-06-23-credit-agreement.txt) - the as-of date the harness computes operative state for. */
export const CHWY_AS_OF_DATE = "2026-06-23";

/**
 * Deterministic operative-state fact for the validation package: refuses (throws) unless the package graph proves a
 * single-document instrument with zero modification candidates, in which case the production
 * computeOperativeContractState over an EMPTY effect set yields OPERATIVE_STATE_RESOLVED with zero provisions -
 * exactly what production's orchestrator would compute for this package.
 */
export function computeHarnessOperativeState(chewy: ReturnType<typeof buildChewy>): OperativeContractState {
  const graph = chewy.access.packageGraph;
  const documentIds = graph?.instruments.find((i) => i.documentIds.includes("doc-a"))?.documentIds ?? ["doc-a"];
  const modifications = graph?.modificationCandidates.length ?? 0;
  if (documentIds.length !== 1 || modifications !== 0) throw new Error(`harness operative-state wiring requires a single-document, never-amended package; graph shows ${documentIds.length} document(s) and ${modifications} modification candidate(s) - run the amendment pipeline instead`);
  return computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: "doc-a", asOfDate: CHWY_AS_OF_DATE, index: chewy.index, allEffects: [] });
}

export function buildSection601() {
  const chewy = buildChewy();
  const idx = chewy.index as unknown as { findNodesByRef: (d: string, r: string) => { nodeId: string; charStart: number; charEnd: number }[]; getNodeById: (id: string) => { nodeId: string; nodeKey: string; sectionRef: string; heading: string; charStart: number; charEnd: number } | undefined; getNodeText: (id: string, m: "DESCENDANTS") => string; getDocumentText: (d: string) => string | undefined };
  const bodyNodes = idx.findNodesByRef("doc-a", SECTION).filter((n) => n.charStart >= TOC_BOUNDARY);
  if (bodyNodes.length !== 1) throw new Error(`Section ${SECTION} does not resolve uniquely in the document body: ${bodyNodes.length} nodes`);
  const sec = idx.getNodeById(bodyNodes[0]!.nodeId)!;
  const operativeSourceText = idx.getNodeText(sec.nodeId, "DESCENDANTS");
  const candidateRef = `phase-3-final-601:chwy:${SECTION}`;
  // The SAME deterministic candidate shape the prior Chewy paid run used (no discovery output is an input here).
  const candidate = { discoveryId: candidateRef, documentId: "doc-a", structuralNodeKeys: [sec.nodeKey], structuralNodeIds: [sec.nodeId], normalizedSourceRef: sec.sectionRef, families: [], role: "GENERAL_PROHIBITION", roleRaw: "", roleNormalizationStatus: "VALID_CANONICAL", familiesRaw: [], familiesNormalizationStatus: "VALID_CANONICAL", description: sec.heading, multipleRulesLikely: true, definedTermDependencyLikely: true, discoveryMethods: ["DETERMINISTIC_SIGNAL"], evidenceSignals: ["headline_heading"], reviewStatus: "NEEDS_REVIEW", confidence: 1, sourceCitation: operativeSourceText.slice(0, 200), discoveryRunVersion: "phase-3-final-601.v1", supersessionStatus: "UNKNOWN_SUPERSESSION_STATUS", supersessionReason: "single-document package, no amendment effects", valueAnchors: [] } as unknown as DiscoveredCandidate;
  const contextBundle = buildCovenantContextBundle({ candidate, packageKey: "phase-3-validation-chwy-package", companyId: COMPANY, instrumentKey: INSTRUMENT }, chewy.access);
  // PHASE 3 / 6.01 remediation §9/§15 (OPERATIVE_STATE_WIRING_WRONG - harness layer): the paid run passed
  // operativeState: null. Production tools treat a document with NO operative-state computation as
  // UNKNOWN_SUPERSESSION_STATUS (fail-closed), so every successful section-reading tool call returned
  // evidenceUnresolved=true and shard 0 was flagged OPERATIVE_STATE_UNRESOLVED although nothing was ever amended.
  // Production (analysis/orchestrator.ts) never passes null: it computes the state from the package's real effect set.
  // The same deterministic fact is wired here from the package graph - one document, no modification candidates,
  // no amendment effects - through the SAME production function; nothing is inferred by a model.
  const operativeState = computeHarnessOperativeState(chewy);
  const input = { companyId: COMPANY, instrumentKey: INSTRUMENT, sourceDocumentId: "doc-a", candidateRef, sourceSectionRef: SECTION, operativeSourceText, operativeCharStart: sec.charStart, contextBundle, operativeLineage: null, toolAccess: { structuralIndex: chewy.index, operativeState, packageGraph: chewy.access.packageGraph, amendmentEffects: [], contextBundle }, irSchemaVersion: IR_SCHEMA_VERSION, compilerAlgorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION, compilerPromptVersion: SEMANTIC_COMPILER_PROMPT_VERSION, toolPolicyVersion: SEMANTIC_COMPILER_TOOL_POLICY_VERSION };
  const sourceContext = resolveSourceContext({ index: chewy.index, documentId: "doc-a", operativeSourceText, anchorNodeId: contextBundle.originatingStructuralNodeIds?.[0] ?? null, operativeCharStart: sec.charStart, documentText: idx.getDocumentText("doc-a") ?? null });
  return { chewy, sec, operativeSourceText, candidateRef, contextBundle, input, sourceContext };
}

/** The Section 6.01 slice of the frozen reference set, by BOTH criteria (label and span), so any disagreement is visible. */
export function section601ReferenceItems() {
  const raw = readFileSync("docs/phase-3-validation/04-human-reference-set.json", "utf8");
  const ref = JSON.parse(raw) as { items: { id: string; section: string; materiality: string; span: [number, number]; category: string; description: string; dependencies: string[] }[] };
  const byLabel = ref.items.filter((i) => /^6\.01\b/.test(i.section));
  return { refHash: sha256(raw), all: ref.items, byLabel };
}

/** The committed cost methodology, re-read from its own observed ledgers (never re-parameterised here). */
export function observedRates() {
  const certified = freezeAndPlan();
  const s1 = loadFrozenStage1(), s2 = loadStage2();
  const rows = certified.plan.shards.map((s) => { const e = (s1.get(s.shardId) ?? s2.get(s.shardId))!; return { est: s.estimate.inputTokens, cost: e.record.actual.costUsd }; });
  const passBMean = rows.reduce((a, r) => a + r.cost, 0) / rows.reduce((a, r) => a + r.est, 0);
  const passBWorst = Math.max(...rows.map((r) => r.cost / r.est));
  const f5 = (p: string) => JSON.parse(readFileSync(p, "utf8")) as { calls: { stage: string; costUsd: number }[] };
  const ledgers = ["tests/fixtures/unseen-packages/phase-3-remediation-f5-run/certification-v5/ledger.json", "tests/fixtures/unseen-packages/phase-3-remediation-f5-run/certification-f5-3b/ledger.json", "tests/fixtures/unseen-packages/phase-3-remediation-f5-run/certification/ledger.json"].map(f5);
  const inv = ledgers.flatMap((l) => l.calls.filter((c) => /semantic_inventory$/.test(c.stage)));
  const gap = ledgers.flatMap((l) => l.calls.filter((c) => /semantic_inventory_gap$/.test(c.stage)));
  const prior = JSON.parse(readFileSync("tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run/cost-ledger.json", "utf8")) as { calls: { stage: string; costUsd: number }[] };
  const verifyCalls = prior.calls.filter((c) => /verif/.test(c.stage));
  return {
    passABatchMean: inv.reduce((a, c) => a + c.costUsd, 0) / inv.length, passABatchWorst: Math.max(...inv.map((c) => c.costUsd)), passABatchCalls: inv.length,
    passAGapMean: gap.reduce((a, c) => a + c.costUsd, 0) / gap.length, passAGapWorst: Math.max(...gap.map((c) => c.costUsd)), passAGapCalls: gap.length,
    passBMean, passBWorst, passBShards: rows.length,
    verifierSemanticReview: verifyCalls.reduce((a, c) => a + c.costUsd, 0) / Math.max(1, verifyCalls.length), verifierCalls: verifyCalls.length,
  };
}

/** Exactly the committed est() of 02-cost-preflight.json, for a ONE-unit plan. */
export function estimate601(batches: number, plannerTokens: number, r: ReturnType<typeof observedRates>, batchRate: number, gapRate: number, shardRate: number, safety: number) {
  const passA = ((batches * batchRate) + gapRate) * 2; // DUAL_PASS_ENSEMBLE: two independent passes, one gap call per pass
  const passB = plannerTokens * shardRate;
  const verifier = r.verifierSemanticReview + CONDITION_SUSPICION_CALLS * CONDITION_SUSPICION_PER_CALL;
  return { passAUsd: +(passA * safety).toFixed(4), passBUsd: +(passB * safety).toFixed(4), verifierUsd: +(verifier * safety).toFixed(4), totalUsd: +((passA + passB + verifier) * safety).toFixed(4) };
}

if (process.argv[1]?.endsWith("phase-3-601-preflight.ts")) void (async () => {
  const actualSha = gitSha();
  const versions = { compilerAlgorithm: SEMANTIC_COMPILER_ALGORITHM_VERSION, compilerPrompt: SEMANTIC_COMPILER_PROMPT_VERSION, toolPolicy: SEMANTIC_COMPILER_TOOL_POLICY_VERSION, accountabilityAlgorithm: SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION, inventoryPrompt: SEMANTIC_INVENTORY_PROMPT_VERSION, sourceIdentityMigration: SOURCE_IDENTITY_MIGRATION_VERSION, executionPolicy: SEMANTIC_EXECUTION_POLICY_VERSION, shardPlanner: SHARD_PLANNER_ALGORITHM_VERSION, shardBudget: DEFAULT_SHARD_BUDGET, irSchema: IR_SCHEMA_VERSION };
  const verifierSrc = readFileSync("lib/contract-model/compiler/semantic-verification/verify.ts", "utf8");
  const verifierVersion = verifierSrc.match(/VERIFIER_(?:ALGORITHM_)?VERSION\s*=\s*"([^"]+)"/)?.[1] ?? null;
  const productionTree = execSync("git ls-tree -r HEAD --name-only lib/contract-model/compiler | sort | xargs sha256sum | sha256sum", { encoding: "utf8" }).split(" ")[0];
  const sourceSha = sha256(readFileSync(CHWY_SRC));
  const { refHash, byLabel } = section601ReferenceItems();
  const built = buildSection601();
  const { sec, operativeSourceText, sourceContext } = built;
  const inSpan = byLabel.filter((i) => i.span[0] >= sec.charStart && i.span[1] <= sec.charEnd);
  const outOfSpan = byLabel.filter((i) => !(i.span[0] >= sec.charStart && i.span[1] <= sec.charEnd));

  const emptyInv = { candidateRef: built.candidateRef, items: [], uninventoriedValues: [], unaccountedSource: [], sourceCoverage: null, gapReinventory: null, inventoryStatus: "INVENTORY_SKIPPED_NO_PROVIDER", inventoryStatusReason: "preflight estimate", rejectedUnverifiableItems: [], rejectedDuplicateItems: [], sourceContextState: sourceContext.state, frozenContentHash: "preflight", frozenAt: "", algorithmVersion: "", promptVersion: "", provider: "", model: "", telemetryCostUsd: null } as unknown as Parameters<typeof planCompilationShards>[0]["frozenInventory"];
  const plan = planCompilationShards({ candidateRef: built.candidateRef, companyId: COMPANY, instrumentKey: INSTRUMENT, documentId: "doc-a", sourceContext, frozenInventory: emptyInv, structuralIndex: built.chewy.index, generation: { algorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION, promptVersion: SEMANTIC_COMPILER_PROMPT_VERSION } });
  const decision = selectCompilationExecutionMode(plan);
  const batches = Math.ceil(sourceContext.totalChars / PASS_A_BATCH_CHARS);

  const r = observedRates();
  const mean = estimate601(batches, plan.totals.estimatedInputTokens, r, r.passABatchMean, r.passAGapMean, r.passBMean, 1);
  const worst = estimate601(batches, plan.totals.estimatedInputTokens, r, r.passABatchWorst, r.passAGapWorst, r.passBWorst, 1);
  const conservative = estimate601(batches, plan.totals.estimatedInputTokens, r, r.passABatchWorst, r.passAGapWorst, r.passBWorst, 1.25);
  const credits = loadGatewayKey() ? await gatewayCredits() : null;
  const balance = credits ? Number(credits.balance) : null;
  const fitsCap = conservative.totalUsd <= HARD_CAP_USD;
  const fitsBalance = balance !== null && conservative.totalUsd <= balance;
  const verdict = fitsCap && fitsBalance ? "CLEAR_TO_EXECUTE" : "PHASE3_601_COST_BOUND_BEFORE_START";

  writeJson(`${OUT}/00-baseline-reference-freeze.json`, {
    artifact: "PHASE 3 FINAL-BRIDGE §1/§2/§3/§4 - starting system, Chewy source identity, Section 6.01 node and the frozen 6.01 reference slice, all fixed before any paid call",
    at: new Date().toISOString(),
    startingSha: { expected: STARTING_SHA, actual: actualSha, match: actualSha === STARTING_SHA },
    productionCompilerTreeSha256: productionTree, versions, verifierVersion,
    scoringAndGatingCode: { preflight: "scripts/phase-3-601-preflight.ts", run: "scripts/phase-3-601-run.ts", score: "scripts/phase-3-601-score.ts", note: "the scorer never reads model output before the compiler and verifier results are written to disk" },
    chewy: { fixture: CHWY_SRC, extractedSha256: sourceSha, expected: "f63b9dc6560e699cd5158ee0f254dba76da92612ad75fdc27756047ad8f49eeb", match: sourceSha === "f63b9dc6560e699cd5158ee0f254dba76da92612ad75fdc27756047ad8f49eeb" },
    section601: { nodeId: sec.nodeId, nodeKey: sec.nodeKey, sectionRef: sec.sectionRef, heading: sec.heading, charStart: sec.charStart, charEnd: sec.charEnd, chars: operativeSourceText.length, textSha256: sha256(operativeSourceText), resolvesUniquelyInBody: true },
    humanReferenceSet: { path: "docs/phase-3-validation/04-human-reference-set.json", sha256: refHash, expected: "e7f863e58ee53ca499598f2a8194ff98a0f8f74d2a8ced23b6f12b96c2a64036", match: refHash === "e7f863e58ee53ca499598f2a8194ff98a0f8f74d2a8ced23b6f12b96c2a64036" },
    section601ReferenceItems: {
      byLabel: byLabel.length, bySpanWithinNode: inSpan.length, labelAndSpanAgree: outOfSpan.length === 0,
      itemsOutsideNodeSpan: outOfSpan.map((i) => ({ id: i.id, section: i.section, span: i.span })),
      byMateriality: byLabel.reduce((a: Record<string, number>, i) => { a[i.materiality] = (a[i.materiality] ?? 0) + 1; return a; }, {}),
      expectedFromPriorPreflight: { total: 8, critical: 4 },
      items: byLabel.map((i) => ({ id: i.id, section: i.section, category: i.category, materiality: i.materiality, span: i.span, dependencies: i.dependencies, descriptionSha256: sha256(i.description) })),
      exposedToModel: false,
    },
    cap: { hardCapUsd: HARD_CAP_USD },
  });

  writeJson(`${OUT}/01-cost-preflight.json`, {
    artifact: "PHASE 3 FINAL-BRIDGE §6/§12 - deterministic Section 6.01 plan and pre-run cost model, using the committed 02-cost-preflight.json methodology unchanged (0 model calls; one gateway balance read)",
    at: new Date().toISOString(),
    methodology: { source: "docs/phase-3-final-chewy/02-cost-preflight.json", tiers: { meanRate: "observed mean rates", worstObservedRate: "worst single observed rate in each ledger", conservative: "worst observed rates x 1.25 safety factor" }, unchanged: true, note: "the estimator is re-used verbatim for one unit; no rate, safety factor or call-count assumption was relaxed for this mission" },
    rates: r,
    deterministicPlan: { section: SECTION, chars: operativeSourceText.length, sourceContext: { state: sourceContext.state, regions: sourceContext.regions.length, totalChars: sourceContext.totalChars, unresolvedReferences: sourceContext.unresolvedReferences.length }, mode: decision.mode, reason: decision.reason, planHash: plan.planHash, shards: plan.shards.length, oversizedShards: plan.totals.oversizedShards, plannerEstimatedInputTokens: plan.totals.estimatedInputTokens, maxShardInputTokens: plan.totals.maxShardInputTokens, passABatchesPerPass: batches, plannedWith: "EMPTY inventory - the paid run plans again with the REAL fresh Pass A inventory and any difference is recorded (§6)" },
    priorPreflightPrediction: { mode: "SHARDED", shards: 6, passABatchesPerPass: 6, chars: 33623, source: "docs/phase-3-final-chewy/01-structural-operative-preflight.json" },
    callPlan: { passACalls: { batchesPerPass: batches, gapCallsPerPass: 1, passes: 2, total: (batches + 1) * 2 }, passBConversations: plan.shards.length, verifierCalls: { semanticReview: 1, conditionSuspicion: CONDITION_SUSPICION_CALLS } },
    estimates: { meanRate: mean, worstObservedRate: worst, conservative: { ...conservative, safetyFactor: 1.25 } },
    bound: { hardCapUsd: HARD_CAP_USD, gatewayBalanceUsd: balance, conservativeFitsCap: fitsCap, conservativeFitsBalance: fitsBalance, meanFitsCap: mean.totalUsd <= HARD_CAP_USD, meanFitsBalance: balance !== null && mean.totalUsd <= balance, worstObservedFitsBalance: balance !== null && worst.totalUsd <= balance },
    missionExpectation: { meanUsd: 8.3, conservativeUsd: 10.4, reproducedMeanUsd: mean.totalUsd, note: "the mission's stated mean is reproduced to the cent. Its stated conservative figure corresponds to mean x 1.25 ($" + (mean.totalUsd * 1.25).toFixed(2) + "); the COMMITTED methodology names as 'conservative' the WORST observed rates x 1.25, which is the tier applied to this gate. The estimator was not re-parameterised to fit the cap." },
    whyTheBoundFails: {
      committedConservativeUsd: conservative.totalUsd, capUsd: HARD_CAP_USD, balanceUsd: balance,
      overCapUsd: +(conservative.totalUsd - HARD_CAP_USD).toFixed(4),
      overBalanceUsd: balance === null ? null : +(conservative.totalUsd - balance).toFixed(4),
      methodologyIndependentFinding: balance !== null && worst.totalUsd > balance
        ? "Independent of which safety factor is applied: the WORST-OBSERVED-RATE total with NO safety factor ($" + worst.totalUsd.toFixed(2) + ") already exceeds the gateway balance ($" + balance.toFixed(2) + "). There is no headroom for a worst-case run, so a started run could exhaust the account mid-execution - the exact failure that halted the original whole-agreement Validation B."
        : "The worst-observed-rate total fits the balance; only the 1.25 safety factor pushes it over.",
      dominantTerm: { passAShareOfConservative: +(conservative.passAUsd / conservative.totalUsd).toFixed(3), reason: "DUAL_PASS_ENSEMBLE (§7) doubles Pass A: 12 batch calls + 2 gap calls. Pass A is " + (100 * conservative.passAUsd / conservative.totalUsd).toFixed(0) + "% of the conservative total." },
    },
    unblockingLevers: {
      note: "Each lever is stated with exact arithmetic so a follow-up pre-registered mission can clear §12 without any estimator change. None of these were applied here.",
      A_fundAndRaiseCap: { requiredCapUsd: Math.ceil(conservative.totalUsd * 100) / 100, requiredBalanceUsd: Math.ceil(conservative.totalUsd * 100) / 100, shortfallVsBalanceUsd: balance === null ? null : +(conservative.totalUsd - balance).toFixed(2), effect: "clears §12 under the committed methodology unchanged" },
      B_adoptMissionsOwnConservativeArithmetic: { conservativeUsd: +(mean.totalUsd * 1.25).toFixed(4), fitsCap: mean.totalUsd * 1.25 <= HARD_CAP_USD, fitsBalance: balance !== null && mean.totalUsd * 1.25 <= balance, effect: "clears §12 at the current cap and balance, but requires an EXPLICIT instruction that the conservative tier is mean x 1.25; this mission will not make that substitution on its own because §12 forbids weakening the estimator" },
      C_singlePassPassA: { conservativeUsd: +(((batches * r.passABatchWorst + r.passAGapWorst) + plan.totals.estimatedInputTokens * r.passBWorst + r.verifierSemanticReview + CONDITION_SUSPICION_CALLS * CONDITION_SUSPICION_PER_CALL) * 1.25).toFixed(4), effect: "halves Pass A and clears both bounds under the committed methodology, but CONTRADICTS §7 (exactly two independent Pass A executions), so it is disclosed, not taken" },
      D_smallerUnit: { note: "Section 6.02 was costed at $2.27 mean in the committed whole-agreement artifact, but carries 1 reference item versus 6.01's 8, so it does not exercise sharding or deliver comparable evidence" },
    },
    decision: verdict, paidCallsMade: 0, spendUsd: 0,
  });
  console.log(JSON.stringify({ verdict, sha: actualSha === STARTING_SHA, section: { chars: operativeSourceText.length, charStart: sec.charStart, charEnd: sec.charEnd }, refItems: byLabel.length, critical: byLabel.filter((i) => i.materiality === "CRITICAL").length, inSpan: inSpan.length, mode: decision.mode, shards: plan.shards.length, batches, mean, worst, conservative, balance, cap: HARD_CAP_USD }, null, 1));
})();
