/**
 * PHASE 3 FINAL - ZERO-COST PREFLIGHT (§1-§4, §15-§16, §37-§38). Freezes the starting system, the Chewy source
 * identity and the human reference set; runs the deterministic structural/package/operative preflight; builds the
 * whole-validation-set unit list from the frozen reference set (never from model output); plans every unit through
 * the certified planner; and computes the pre-registered cost model from OBSERVED rates only. Makes no model call. One
 * gateway balance read.
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { buildChewy, CHWY_SRC } from "./f7a-lib";
import { gatewayCredits, gitSha, loadGatewayKey, writeJson } from "./f7b-lib";
import { loadFrozenStage1, loadStage2 } from "./f7b3-lib";
import { freezeAndPlan } from "./f7b-lib";
import { resolveSourceContext } from "../lib/contract-model/compiler/semantic-accountability/source-context";
import { planCompilationShards, DEFAULT_SHARD_BUDGET } from "../lib/contract-model/compiler/semantic/shard-planner";
import { selectCompilationExecutionMode, SEMANTIC_EXECUTION_POLICY_VERSION } from "../lib/contract-model/compiler/semantic/execution-mode";
import { SHARD_PLANNER_ALGORITHM_VERSION } from "../lib/contract-model/compiler/semantic/shard-types";
import { SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION, SEMANTIC_COMPILER_TOOL_POLICY_VERSION } from "../lib/contract-model/compiler/semantic/types";
import { SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION, SEMANTIC_INVENTORY_PROMPT_VERSION } from "../lib/contract-model/compiler/semantic-accountability/types";
import { SOURCE_IDENTITY_MIGRATION_VERSION } from "../lib/contract-model/compiler/semantic-accountability/source-identity";
import { IR_SCHEMA_VERSION } from "../lib/contract-model/ir/types";

const OUT = "docs/phase-3-final-chewy";
const STARTING_SHA = "a474ab3ba42c2518b1dabe552b73dd37712c43e6";
const HARD_CAP_USD = 20;
const sha256 = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const TOC_BOUNDARY = 8980; // the pre-registered unit-selection rule from the Phase 3 validation manifest: body units start at the 1.01 body node

(async () => {
  // ---------------- §1 freeze
  const versions = { compilerAlgorithm: SEMANTIC_COMPILER_ALGORITHM_VERSION, compilerPrompt: SEMANTIC_COMPILER_PROMPT_VERSION, toolPolicy: SEMANTIC_COMPILER_TOOL_POLICY_VERSION, accountabilityAlgorithm: SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION, inventoryPrompt: SEMANTIC_INVENTORY_PROMPT_VERSION, sourceIdentityMigration: SOURCE_IDENTITY_MIGRATION_VERSION, executionPolicy: SEMANTIC_EXECUTION_POLICY_VERSION, shardPlanner: SHARD_PLANNER_ALGORITHM_VERSION, shardBudget: DEFAULT_SHARD_BUDGET, irSchema: IR_SCHEMA_VERSION };
  const verifierSrc = readFileSync("lib/contract-model/compiler/semantic-verification/verify.ts", "utf8");
  const verifierVersion = verifierSrc.match(/VERIFIER_(?:ALGORITHM_)?VERSION\s*=\s*"([^"]+)"/)?.[1] ?? null;
  const productionTree = execSync("git ls-tree -r HEAD --name-only lib/contract-model/compiler | sort | xargs sha256sum | sha256sum", { encoding: "utf8" }).split(" ")[0];
  const ref = JSON.parse(readFileSync("docs/phase-3-validation/04-human-reference-set.json", "utf8"));
  const refHash = sha256(readFileSync("docs/phase-3-validation/04-human-reference-set.json"));
  const byMat = ref.items.reduce((a: Record<string, number>, i: { materiality: string }) => { a[i.materiality] = (a[i.materiality] ?? 0) + 1; return a; }, {});
  const sourceSha = sha256(readFileSync(CHWY_SRC));
  const manifest = JSON.parse(readFileSync("docs/phase-3-validation/09-paid-run-manifest.json", "utf8"));
  const extraction = JSON.parse(readFileSync("tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extraction-manifest.json", "utf8"));
  writeJson(`${OUT}/00-baseline-and-reference-freeze.json`, {
    artifact: "PHASE 3 FINAL §1/§2/§4 - starting system, Chewy source identity and human reference set frozen before any paid call",
    at: new Date().toISOString(), startingSha: { expected: STARTING_SHA, actual: gitSha(), match: gitSha() === STARTING_SHA },
    productionCompilerTreeSha256: productionTree, versions, verifierVersion,
    chewy: { fixture: CHWY_SRC, extractedSha256: sourceSha, matchesPhase3ValidationManifest: sourceSha === manifest.inputs.extractedSha256, extractionManifest: { keys: Object.keys(extraction).slice(0, 12), source: extraction.source ?? extraction.filing ?? null } },
    humanReferenceSet: { path: "docs/phase-3-validation/04-human-reference-set.json", sha256: refHash, itemCount: ref.itemCount, items: ref.items.length, byMateriality: byMat, byCategory: ref.byCategory, offsetsRelativeTo: ref.offsetsRelativeTo, exposedToCompilerOrVerifier: false, editedAfterPaidExecution: "n/a - no paid execution occurred" },
    cap: { hardCapUsd: HARD_CAP_USD },
  });

  // ---------------- §37/§38 structural / package / operative preflight (deterministic)
  const chewy = buildChewy();
  const idx = chewy.index as unknown as { allNodes: (d: string) => unknown[]; allDefinitions: (d: string) => unknown[]; healthDiagnostics: (d: string) => { kind?: string; severity?: string }[]; orphans: (d: string) => unknown[]; roots: (d: string) => unknown[]; findNodesByRef: (d: string, r: string) => { nodeId: string; charStart: number; charEnd: number; sectionRef: string | null }[]; getNodeText: (id: string, m: "DESCENDANTS") => string; getDocumentText: (d: string) => string | undefined };
  const diags = idx.healthDiagnostics("doc-a");
  const diagByKind = diags.reduce((a: Record<string, number>, d) => { const k = `${d.kind ?? "?"}:${d.severity ?? "?"}`; a[k] = (a[k] ?? 0) + 1; return a; }, {});
  const pg = chewy.access.packageGraph as unknown as Record<string, unknown>;
  const coverage = JSON.parse(readFileSync("tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run/stage3e-coverage.json", "utf8"));

  // ---------------- §3 whole-validation-set units: every top-level section a reference item lives in, plus 1.01 (every
  // defined-term item and every CRITICAL item's ratio dependency lives there). Derived from the frozen set, never from output.
  const secOf = (s: string) => s.match(/^\d+\.\d+/)?.[0] ?? null;
  const sectionUnits = new Set<string>(["1.01"]);
  const unplaced: string[] = [];
  for (const it of ref.items as { id: string; section: string }[]) { const s = secOf(it.section); if (s) sectionUnits.add(s); else unplaced.push(`${it.id}:${it.section}`); }
  const units = [...sectionUnits].sort((a, b) => Number(a.split(".")[0]) - Number(b.split(".")[0]) || Number(a.split(".")[1]) - Number(b.split(".")[1]));

  // ---------------- plan every unit through the certified planner (empty inventory: the plan's unit structure and shard
  // count come from the source; ownership needs Pass A, which is paid). 1.01 is cross-checked against the certified plan.
  const emptyInv = (candidateRef: string) => ({ candidateRef, items: [], uninventoriedValues: [], unaccountedSource: [], sourceCoverage: null, gapReinventory: null, inventoryStatus: "INVENTORY_SKIPPED_NO_PROVIDER", inventoryStatusReason: "preflight estimate", rejectedUnverifiableItems: [], rejectedDuplicateItems: [], sourceContextState: "COMPLETE_LOCAL_SOURCE", frozenContentHash: "preflight", frozenAt: "", algorithmVersion: "", promptVersion: "", provider: "", model: "", telemetryCostUsd: null }) as unknown as Parameters<typeof planCompilationShards>[0]["frozenInventory"];
  const PASS_A_BATCH_CHARS = 6000;
  const perUnit = units.map((s) => {
    const nodes = idx.findNodesByRef("doc-a", s).filter((n) => n.charStart >= TOC_BOUNDARY);
    if (nodes.length !== 1) return { section: s, resolution: nodes.length === 0 ? "NOT_FOUND" : "AMBIGUOUS", bodyNodes: nodes.length };
    const node = nodes[0]!;
    const text = idx.getNodeText(node.nodeId, "DESCENDANTS");
    const sc = resolveSourceContext({ index: chewy.index, documentId: "doc-a", operativeSourceText: text, anchorNodeId: node.nodeId, operativeCharStart: node.charStart, documentText: idx.getDocumentText("doc-a") ?? null });
    const plan = planCompilationShards({ candidateRef: `phase-3-final:chwy:${s}`, companyId: "phase-3-validation-chwy", instrumentKey: "chwy-2026-revolving-credit-instrument", documentId: "doc-a", sourceContext: sc, frozenInventory: emptyInv(`phase-3-final:chwy:${s}`), structuralIndex: chewy.index, generation: { algorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION, promptVersion: SEMANTIC_COMPILER_PROMPT_VERSION } });
    const d = selectCompilationExecutionMode(plan);
    const refItems = (ref.items as { id: string; section: string; materiality: string }[]).filter((i) => secOf(i.section) === s || (s === "1.01" && !secOf(i.section)));
    return { section: s, resolution: "UNIQUE", nodeId: node.nodeId, charStart: node.charStart, chars: text.length, sourceContextState: sc.state, regions: sc.regions.length, sourceContextChars: sc.totalChars, unresolvedReferences: sc.unresolvedReferences.length, mode: d.mode, reason: d.reason, shards: plan.shards.length, oversizedShards: plan.totals.oversizedShards, plannerEstimatedInputTokens: plan.totals.estimatedInputTokens, maxShardInputTokens: plan.totals.maxShardInputTokens, passABatchesPerPass: Math.ceil(sc.totalChars / PASS_A_BATCH_CHARS), referenceItems: refItems.length, referenceCritical: refItems.filter((i) => i.materiality === "CRITICAL").length };
  });
  const planned = perUnit.filter((u) => u.resolution === "UNIQUE") as Extract<(typeof perUnit)[number], { chars: number }>[];
  // certified 1.01 cross-check (same source, the real frozen inventory): 36 shards / planHash 67d9f086...
  const certified = freezeAndPlan();
  const cert101 = { planHash: certified.plan.planHash, shards: certified.plan.shards.length, oversized: certified.plan.totals.oversizedShards, estimatedInputTokens: certified.plan.totals.estimatedInputTokens };

  writeJson(`${OUT}/01-structural-operative-preflight.json`, {
    artifact: "PHASE 3 FINAL §37/§38 - deterministic structural / package / operative / source-context preflight (0 model calls)",
    at: new Date().toISOString(),
    structuralIndex: { document: "doc-a", nodes: idx.allNodes("doc-a").length, definitions: idx.allDefinitions("doc-a").length, roots: idx.roots("doc-a").length, orphans: idx.orphans("doc-a").length, healthDiagnostics: diags.length, healthDiagnosticsByKind: diagByKind },
    packageGraph: { companyId: pg.companyId, packageKey: pg.packageKey, instruments: Array.isArray(pg.instruments) ? pg.instruments.length : null, classifications: Array.isArray(pg.classifications) ? pg.classifications.length : null, relationshipCandidates: Array.isArray(pg.relationshipCandidates) ? pg.relationshipCandidates.length : null, modificationCandidates: Array.isArray(pg.modificationCandidates) ? pg.modificationCandidates.length : null, note: "single-document package: the June 23, 2026 credit agreement is the base document; no amendments/supplements are in the fixture, so operative state is null (never amended) and every definition resolves against the base text" },
    operativeState: { present: false, amendmentEffects: 0, basis: "no amendment pipeline output exists for this single-document package; the compiler and verifier treat the base document as current truth, and the verifier's stale-definition/supersession checks stay active with EMPTY_SUPERSESSION_INDEX" },
    deterministicSourceCoverage: { artifact: "tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run/stage3e-coverage.json", packageCoverageStatus: coverage.packageCoverage?.status ?? null, layerCRefusals: coverage.layerCRefusals ?? null, note: "the last recorded deterministic 3E audit over this exact source hash; re-running its deterministic layers is free but its Layer C is paid and was not run" },
    units: perUnit, referenceItemsNotMappedToASection: unplaced, certifiedSection101Plan: cert101,
    preflightVerdict: { structural: idx.orphans("doc-a").length === 0 ? "PASS" : "FAIL", sourceIdentity: sourceSha === manifest.inputs.extractedSha256 ? "PASS" : "FAIL", operativeState: "PASS (single-document, never amended)", allUnitsResolveUniquely: planned.length === units.length },
  });

  // ---------------- §15 cost model from OBSERVED rates only (every rate cites its ledger)
  const s1 = loadFrozenStage1(), s2 = loadStage2();
  const shardRows = certified.plan.shards.map((s) => { const e = (s1.get(s.shardId) ?? s2.get(s.shardId))!; return { est: s.estimate.inputTokens, cost: e.record.actual.costUsd }; });
  const passBMeanRate = shardRows.reduce((a, r) => a + r.cost, 0) / shardRows.reduce((a, r) => a + r.est, 0);
  const passBWorstRate = Math.max(...shardRows.map((r) => r.cost / r.est));
  const f5 = (p: string) => JSON.parse(readFileSync(p, "utf8")) as { calls: { stage: string; costUsd: number }[] };
  const f5Ledgers = ["tests/fixtures/unseen-packages/phase-3-remediation-f5-run/certification-v5/ledger.json", "tests/fixtures/unseen-packages/phase-3-remediation-f5-run/certification-f5-3b/ledger.json", "tests/fixtures/unseen-packages/phase-3-remediation-f5-run/certification/ledger.json"].map(f5);
  const inv = f5Ledgers.flatMap((l) => l.calls.filter((c) => /semantic_inventory$/.test(c.stage)));
  const gap = f5Ledgers.flatMap((l) => l.calls.filter((c) => /semantic_inventory_gap$/.test(c.stage)));
  const passABatchMean = inv.reduce((a, c) => a + c.costUsd, 0) / inv.length, passABatchWorst = Math.max(...inv.map((c) => c.costUsd));
  const passAGapMean = gap.reduce((a, c) => a + c.costUsd, 0) / gap.length, passAGapWorst = Math.max(...gap.map((c) => c.costUsd));
  const prior = JSON.parse(readFileSync("tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run/cost-ledger.json", "utf8")) as { calls: { stage: string; costUsd: number }[] };
  const verifyCalls = prior.calls.filter((c) => /verif/.test(c.stage));
  const verifierSemanticReviewUsd = verifyCalls.reduce((a, c) => a + c.costUsd, 0) / Math.max(1, verifyCalls.length);
  const discoveryCalls = prior.calls.filter((c) => /discovery/.test(c.stage));
  const discoveryUsd = discoveryCalls.reduce((a, c) => a + c.costUsd, 0);
  const CONDITION_SUSPICION_PER_CALL = 0.0114; // docs/open4-final-real-model-holdout/12-real-model-results.json, 22 real calls
  const CONDITION_SUSPICION_CALLS_PER_UNIT = 5; // conservative allowance per candidate

  const totals = planned.reduce((a, u) => ({ shards: a.shards + u.shards, est: a.est + u.plannerEstimatedInputTokens, batches: a.batches + u.passABatchesPerPass, sharded: a.sharded + (u.mode === "SHARDED" ? 1 : 0), oversized: a.oversized + u.oversizedShards }), { shards: 0, est: 0, batches: 0, sharded: 0, oversized: 0 });
  const passes = 2; // DUAL_PASS_ENSEMBLE, §8
  const plan = {
    units: planned.length, monolithicUnits: planned.length - totals.sharded, shardedUnits: totals.sharded, projectedShards: totals.shards, oversizedShards: totals.oversized,
    passACalls: { batchesPerPass: totals.batches, gapCallsPerPass: planned.length, passes, total: (totals.batches + planned.length) * passes },
    passBCalls: { conversations: totals.shards, note: "one bounded conversation per shard (or per monolithic unit); the certified 36-shard run averaged 2.44 turns per conversation - turns are inside the per-shard rate" },
    verifierCalls: { semanticReview: planned.length, conditionSuspicion: planned.length * CONDITION_SUSPICION_CALLS_PER_UNIT },
    discovery: { reuseFrozenPhase2BOutput: true, freshCostIfRequiredUsd: +discoveryUsd.toFixed(4) },
  };
  const est = (batchRate: number, gapRate: number, shardRate: number, safety: number) => {
    const passA = ((totals.batches * batchRate) + (planned.length * gapRate)) * passes;
    const passB = totals.est * shardRate;
    const verifier = planned.length * verifierSemanticReviewUsd + plan.verifierCalls.conditionSuspicion * CONDITION_SUSPICION_PER_CALL;
    return { passAUsd: +(passA * safety).toFixed(2), passBUsd: +(passB * safety).toFixed(2), verifierUsd: +(verifier * safety).toFixed(2), totalUsd: +((passA + passB + verifier) * safety).toFixed(2) };
  };
  const mean = est(passABatchMean, passAGapMean, passBMeanRate, 1);
  const worst = est(passABatchWorst, passAGapWorst, passBWorstRate, 1);
  const conservative = est(passABatchWorst, passAGapWorst, passBWorstRate, 1.25);
  const credits = loadGatewayKey() ? await gatewayCredits() : null;
  const balance = credits ? Number(credits.balance) : null;
  const minimumSingleUnit = planned.map((u) => ({ section: u.section, meanUsd: +(((u.passABatchesPerPass * passABatchMean + passAGapMean) * passes) + u.plannerEstimatedInputTokens * passBMeanRate + verifierSemanticReviewUsd + CONDITION_SUSPICION_CALLS_PER_UNIT * CONDITION_SUSPICION_PER_CALL).toFixed(2) })).sort((a, b) => a.meanUsd - b.meanUsd);
  const decision = conservative.totalUsd <= HARD_CAP_USD && balance !== null && conservative.totalUsd <= balance ? "CLEAR_TO_EXECUTE" : "PHASE3_FINAL_COST_BOUND_BEFORE_START";
  writeJson(`${OUT}/02-cost-preflight.json`, {
    artifact: "PHASE 3 FINAL §15/§16 - deterministic pre-run cost model from observed rates (0 model calls; one gateway balance read)",
    at: new Date().toISOString(),
    rates: {
      passASemanticInventoryPerBatch: { meanUsd: +passABatchMean.toFixed(4), worstUsd: +passABatchWorst.toFixed(4), calls: inv.length, source: "F-5 certification ledgers (current batched Pass A, 6,000-char batches, ~11k input / ~41k output tokens per call)" },
      passAGapReinventoryPerCall: { meanUsd: +passAGapMean.toFixed(4), worstUsd: +passAGapWorst.toFixed(4), calls: gap.length, source: "same ledgers; one gap call per unit-pass observed" },
      passBPerPlannerEstimatedInputToken: { meanUsd: +passBMeanRate.toFixed(8), worstUsd: +passBWorstRate.toFixed(8), source: "the 36 certified Section 1.01 shards (F-7B.3E): $13.8961 over 804,892 planner-estimated tokens; mean $0.386 / shard" },
      verifierSemanticReviewPerCandidate: { usd: +verifierSemanticReviewUsd.toFixed(4), source: "Phase 3 validation paid run, unit 6.08 (85,458 in / 15,838 out)" },
      conditionSuspicionPerCall: { usd: CONDITION_SUSPICION_PER_CALL, callsAssumedPerUnit: CONDITION_SUSPICION_CALLS_PER_UNIT, source: "OPEN-4 real-model holdout, 22 calls" },
      discoveryPhase2B: { usd: +discoveryUsd.toFixed(4), calls: discoveryCalls.length, treatment: "frozen Phase 2B output over this exact source is reused as the candidate/context-bundle input (zero cost); shown here only so a fresh run is not hidden" },
    },
    callPlan: plan, perUnit: planned.map((u) => ({ section: u.section, chars: u.chars, mode: u.mode, shards: u.shards, passABatchesPerPass: u.passABatchesPerPass, plannerEstimatedInputTokens: u.plannerEstimatedInputTokens, referenceItems: u.referenceItems })),
    estimates: { meanRate: mean, worstObservedRate: worst, conservative: { ...conservative, safetyFactor: 1.25 } },
    cheapestSingleUnitAtMeanRate: minimumSingleUnit[0], largestSingleUnitAtMeanRate: minimumSingleUnit[minimumSingleUnit.length - 1],
    bound: { hardCapUsd: HARD_CAP_USD, gatewayBalanceUsd: balance, conservativeFitsCap: conservative.totalUsd <= HARD_CAP_USD, conservativeFitsBalance: balance !== null && conservative.totalUsd <= balance, meanFitsCap: mean.totalUsd <= HARD_CAP_USD, ratioConservativeToCap: +(conservative.totalUsd / HARD_CAP_USD).toFixed(1), ratioMeanToBalance: balance ? +(mean.totalUsd / balance).toFixed(1) : null },
    decision, paidCallsMade: 0, spendUsd: 0,
  });
  writeJson(`${OUT}/03-paid-call-ledger.json`, { artifact: "PHASE 3 FINAL §42 - paid call ledger", calls: [], paidCalls: 0, spendUsd: 0, gatewayBalanceBefore: balance, gatewayBalanceAfter: balance, reason: decision });
  console.log(JSON.stringify({ decision, units: planned.length, shards: totals.shards, passACalls: plan.passACalls.total, mean, worst, conservative, balance, cap: HARD_CAP_USD, cheapest: minimumSingleUnit[0], largest: minimumSingleUnit[minimumSingleUnit.length - 1], cert101 }, null, 1));
})();
