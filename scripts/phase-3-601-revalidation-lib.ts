/**
 * PHASE 3 FINAL / 6.01 POST-REMEDIATION PAID REVALIDATION - the ONE shared implementation behind the zero-cost preflight
 * (104-108), the paid runner (109-113 raw evidence) and the finalizer (114-117). Resume-first: the exact persisted
 * Pass-A inventory of the valid final paid run at 51fda65 is the ONLY inventory candidate; it is never reconstructed
 * from summaries and never re-stamped. If the certified source-bound resume contract refuses it, the mission stops with
 * zero paid calls (no fresh Pass A inside this mission).
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { buildSection601, observedRates, section601ReferenceItems } from "./phase-3-601-preflight";
import { CONDITION_SUSPICION_CALLS, CONDITION_SUSPICION_PER_CALL, Guard, SAFETY_FACTOR } from "./phase-3-601-guard";
import { CHWY_SRC } from "./f7a-lib";
import { resolveSourceContext } from "../lib/contract-model/compiler/semantic-accountability/source-context";
import { computePartitionHash, computeSourceContextHash } from "../lib/contract-model/compiler/semantic-accountability/source-identity";
import { partitionSourceSlots } from "../lib/contract-model/compiler/semantic-accountability/slots";
import { SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION, SEMANTIC_INVENTORY_PROMPT_VERSION, type FrozenSemanticInventory, type SourceContextResult } from "../lib/contract-model/compiler/semantic-accountability/types";
import { validateFrozenInventoryResume, type FrozenInventoryResumeDecision } from "../lib/contract-model/compiler/semantic/frozen-inventory-resume";
import { planCompilationShards, DEFAULT_SHARD_BUDGET } from "../lib/contract-model/compiler/semantic/shard-planner";
import { selectCompilationExecutionMode } from "../lib/contract-model/compiler/semantic/execution-mode";
import { SHARD_PLANNER_ALGORITHM_VERSION, type ShardPlan } from "../lib/contract-model/compiler/semantic/shard-types";
import { SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION } from "../lib/contract-model/compiler/semantic/types";
import { provePassAInputEquivalence, type PassAEquivalence } from "./phase-3-601-revalidation-passa-equivalence";

export const MISSION_ID = "phase-3-final-601-revalidation";
export const RAW = "tests/fixtures/unseen-packages/phase-3-final-601-revalidation";
export const OUT = "docs/phase-3-final-601";
export const STARTING_SHA = "f944790423c9a6f7046f46654ad1348611083204";
export const REMEDIATION_STARTING_SHA = "51fda653190d6859096be145245406b1c9329c58";
export const OLD_RAW = "tests/fixtures/unseen-packages/phase-3-final-601-final-paid";
export const OLD_MISSION_ID = "phase-3-final-601-final-paid";
export const OLD_PLAN_HASH = "eab77c1aad1d941440f0d412e20578902c6744a5e100a0306153ea02e1720552";
export const OLD_FAILED_SHARD_HASHES = ["4b97a4f01be352664f66d7165e37f3b0a42600a829e306f819c7b3489123fc2f", "f422344546f42e86dd6951848772cf0f832347a84eb324e561bf6ca912d6881c"];
export const DOC = "doc-a";
/** Mission §12: the recommended upper ceiling for the incremental cap; the cap itself is the conservative resumed estimate rounded up to the cent. */
export const CAP_CEILING_USD = 6.0;
/** Historical Section 6.01 spend before this mission (87-final-paid-verdict.json cumulativeSection601Usd). */
export const HISTORICAL_601_SPEND_USD = 22.078734;
/** The gateway balance the previous paid mission ended on (79-final-paid-ledger.json gatewayBalanceAfter): any lower live balance means a paid call happened since. */
export const GATEWAY_BALANCE_AFTER_PREVIOUS_PAID_RUN = 10.48047;

export const EXPECT = {
  sourceSha: "f63b9dc6560e699cd5158ee0f254dba76da92612ad75fdc27756047ad8f49eeb",
  sectionSha: "6b79685c94a08a9d27b484aaac52282ce92dbe9a7c3321bc38ff6504d12ec02a",
  refSha: "e7f863e58ee53ca499598f2a8194ff98a0f8f74d2a8ced23b6f12b96c2a64036",
  charStart: 608901, charEnd: 642524, chars: 33623,
  inventory: { frozenContentHash: "88e7419f61f96b827db31d91e9047e699fb54685d11d94d432b081e0d7eb1b0c", inventoryStatus: "INVENTORY_COVERAGE_GAP", canonicalItems: 326, pass1Items: 289, pass2Items: 289, corroborated: 252, singleRun: 74, conflicted: 0, unaccountedSource: 17, uninventoriedValues: 2 },
  /** Deterministic remediation shape (mission §8) - observed, never fed to production. */
  planShape: { shards: 6, oversized: 0, maxPrimaryChars: 11801, maxUnitsPerShard: 16, midSentenceShards: 0, unowned: 0, multiplyOwned: 0 },
};

export const sha256 = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
export const readJson = <T = unknown>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;
export const sh = (cmd: string) => execSync(cmd, { encoding: "utf8", shell: "/bin/bash" }).trim();

// ---------------------------------------------------------------------------
// §4 the frozen Pass-A inventory candidate - the exact persisted object, verified from its own fields
// ---------------------------------------------------------------------------
export interface InventoryCandidate {
  path: string; passesPath: string; fileSha256: string; passesSha256: string; bytes: number;
  inventory: FrozenSemanticInventory;
  passes: { passId: string; inventory: FrozenSemanticInventory }[];
  facts: Record<string, { expected: unknown; actual: unknown; match: boolean }>;
  allFactsMatch: boolean;
}
export function loadFrozenInventoryCandidate(): InventoryCandidate {
  const path = `${OLD_RAW}/frozen-inventory.json`, passesPath = `${OLD_RAW}/pass-a-passes.json`;
  const raw = readFileSync(path), passesRaw = readFileSync(passesPath);
  const inventory = JSON.parse(raw.toString("utf8")) as FrozenSemanticInventory;
  const passes = JSON.parse(passesRaw.toString("utf8")) as InventoryCandidate["passes"];
  const ens = (inventory.ensemble ?? null) as null | { counts?: Record<string, number> };
  const f = (expected: unknown, actual: unknown) => ({ expected, actual, match: JSON.stringify(expected) === JSON.stringify(actual) });
  const facts: InventoryCandidate["facts"] = {
    frozenContentHash: f(EXPECT.inventory.frozenContentHash, inventory.frozenContentHash),
    inventoryStatus: f(EXPECT.inventory.inventoryStatus, inventory.inventoryStatus),
    canonicalItems: f(EXPECT.inventory.canonicalItems, inventory.items.length),
    pass1Items: f(EXPECT.inventory.pass1Items, passes.find((p) => p.passId === "pass-1")?.inventory.items.length ?? null),
    pass2Items: f(EXPECT.inventory.pass2Items, passes.find((p) => p.passId === "pass-2")?.inventory.items.length ?? null),
    corroborated: f(EXPECT.inventory.corroborated, ens?.counts?.corroborated ?? null),
    singleRun: f(EXPECT.inventory.singleRun, ens?.counts?.singleRun ?? null),
    conflicted: f(EXPECT.inventory.conflicted, ens?.counts?.conflicted ?? null),
    unaccountedSource: f(EXPECT.inventory.unaccountedSource, inventory.unaccountedSource?.length ?? null),
    uninventoriedValues: f(EXPECT.inventory.uninventoriedValues, inventory.uninventoriedValues?.length ?? null),
    candidateRef: f("phase-3-final-601:chwy:6.01", inventory.candidateRef),
    documentId: f(DOC, inventory.documentId ?? null),
    ensembleCanonicalCount: f(EXPECT.inventory.canonicalItems, ens?.counts?.canonicalItems ?? null),
  };
  return { path, passesPath, fileSha256: sha256(raw), passesSha256: sha256(passesRaw), bytes: raw.length, inventory, passes, facts, allFactsMatch: Object.values(facts).every((x) => x.match) };
}

// ---------------------------------------------------------------------------
// §5 the CURRENT source context + the certified resume gate (unweakened: the production validator itself)
// ---------------------------------------------------------------------------
export interface ResumeProof {
  built: ReturnType<typeof buildSection601>;
  ctx: SourceContextResult;
  currentSourceContextHash: string;
  currentPartitionHash: string;
  recordedSourceContextHash: string | null;
  recordedPartitionHash: string | null;
  recordedSourceIdentityMethod: string | null;
  decision: FrozenInventoryResumeDecision;
  sourceIdentityUnchanged: boolean;
}
export function resumeProof(candidate: InventoryCandidate, built = buildSection601()): ResumeProof {
  const idx = built.chewy.index;
  const ctx = resolveSourceContext({ index: idx, documentId: DOC, operativeSourceText: built.input.operativeSourceText, anchorNodeId: built.input.contextBundle.originatingStructuralNodeIds?.[0] ?? null, operativeCharStart: built.input.operativeCharStart ?? null, documentText: idx.getDocumentText(DOC) ?? null });
  const currentSourceContextHash = computeSourceContextHash(ctx);
  const currentPartitionHash = computePartitionHash(partitionSourceSlots({ sourceContext: ctx, structuralIndex: idx }));
  const inv = candidate.inventory as FrozenSemanticInventory & { sourceIdentity?: { method?: string; sourceContextHash?: string; partitionHash?: string | null } };
  const decision = validateFrozenInventoryResume({ candidateRef: built.candidateRef, sourceDocumentId: DOC, frozenInventory: candidate.inventory, sourceContext: ctx, structuralIndex: idx });
  const recordedSourceContextHash = inv.sourceContextHash ?? null, recordedPartitionHash = inv.sourceIdentity?.partitionHash ?? null;
  return { built, ctx, currentSourceContextHash, currentPartitionHash, recordedSourceContextHash, recordedPartitionHash, recordedSourceIdentityMethod: inv.sourceIdentity?.method ?? null, decision, sourceIdentityUnchanged: recordedSourceContextHash === currentSourceContextHash && recordedPartitionHash === currentPartitionHash };
}

// ---------------------------------------------------------------------------
// §8 the CURRENT production plan from the RESUMED inventory (observed, never hardcoded)
// ---------------------------------------------------------------------------
export function buildRealPlan(proof: ResumeProof): ShardPlan {
  if (!proof.decision.ok) throw new Error("buildRealPlan requires a passing resume decision");
  const { built, ctx } = proof;
  return planCompilationShards({ candidateRef: built.candidateRef, companyId: built.input.companyId, instrumentKey: built.input.instrumentKey, documentId: DOC, sourceContext: ctx, frozenInventory: proof.decision.inventory, structuralIndex: built.chewy.index, generation: { algorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION, promptVersion: SEMANTIC_COMPILER_PROMPT_VERSION } });
}
export function planShape(plan: ShardPlan, operativeRegionText: string) {
  const mode = selectCompilationExecutionMode(plan);
  // the same rule the zero-cost closure gate (scripts/phase-3-601-remediation-closure.ts projectLineage) applies
  const midSentence = plan.shards.filter((s) => { const last = s.primarySlices[s.primarySlices.length - 1]!; return !/[.;:!?][\s"”'’)\]]*$/.test(operativeRegionText.slice(last.charStart, last.charEnd).trimEnd()); }).length;
  return {
    algorithmVersion: plan.algorithmVersion, plannerAlgorithmVersionConstant: SHARD_PLANNER_ALGORITHM_VERSION, budget: plan.budget, defaultBudget: DEFAULT_SHARD_BUDGET, budgetIsDefault: JSON.stringify(plan.budget) === JSON.stringify(DEFAULT_SHARD_BUDGET),
    mode: mode.mode, reason: mode.reason, planHash: plan.planHash,
    shards: plan.shards.length, oversizedShards: plan.totals.oversizedShards, plannerEstimatedInputTokens: plan.totals.estimatedInputTokens, maxShardInputTokens: plan.totals.maxShardInputTokens,
    maxPrimaryChars: plan.totals.largestShardPrimaryChars, maxUnitsPerShard: plan.totals.largestShardUnits, midSentenceShards: midSentence,
    ownershipProof: plan.ownershipProof, mustLinkGroups: plan.mustLinkGroups.length,
    shardTable: plan.shards.map((s) => ({ ordinal: s.ordinal, shardId: s.shardId, shardHash: s.shardHash, ownedUnits: s.ownedUnitKeys.length, ownedItems: s.ownedItemIds.length, primaryChars: s.primaryChars, slices: s.primarySlices.length, contextEntries: s.context.length, contextChars: s.context.reduce((a, c) => a + c.chars, 0), unresolvedContext: s.unresolvedContext.length, estimatedInputTokens: s.estimate.inputTokens, oversized: s.oversized })),
    expected: EXPECT.planShape,
    matchesExpectedShape: plan.shards.length === EXPECT.planShape.shards && plan.totals.oversizedShards === EXPECT.planShape.oversized && plan.totals.largestShardPrimaryChars === EXPECT.planShape.maxPrimaryChars && plan.totals.largestShardUnits === EXPECT.planShape.maxUnitsPerShard && midSentence === EXPECT.planShape.midSentenceShards && plan.ownershipProof.unowned === EXPECT.planShape.unowned && plan.ownershipProof.multiplyOwned === EXPECT.planShape.multiplyOwned,
    oldPathologicalPlanReappeared: plan.planHash === OLD_PLAN_HASH || plan.shards.some((s) => OLD_FAILED_SHARD_HASHES.includes(s.shardHash)) || plan.totals.oversizedShards > 0,
  };
}

// ---------------------------------------------------------------------------
// §6 Pass-A semantic version audit: 51fda65 -> HEAD over the Pass-A layers (prompt, algorithm, wire schema, accountability rules, ensemble)
// ---------------------------------------------------------------------------
const PASS_A_FILES = ["dual-pass.ts", "ensemble.ts", "inventory.ts", "prompt.ts", "quantitative.ts", "reconciliation.ts", "rollup.ts", "semantic-functions.ts", "slots.ts", "source-context.ts", "source-coverage.ts", "source-identity.ts", "types.ts", "wire-schema.ts", "reference-resolver.ts", "index.ts"].map((f) => `lib/contract-model/compiler/semantic-accountability/${f}`).concat(["lib/contract-model/compiler/llm-caller.ts", "lib/contract-model/compiler/semantic/frozen-inventory-resume.ts"]);
export async function passASemanticAudit(candidate: InventoryCandidate, proof: ResumeProof) {
  const changed = sh(`git diff --name-only ${REMEDIATION_STARTING_SHA} HEAD -- ${PASS_A_FILES.join(" ")}`).split("\n").filter(Boolean);
  const perFile = PASS_A_FILES.map((f) => ({ file: f, changed: changed.includes(f), sha256AtPaidRun: sha256(sh(`git show ${REMEDIATION_STARTING_SHA}:${f}`)), sha256Now: sha256(readFileSync(f)) }));
  const resolverDiff = changed.includes("lib/contract-model/compiler/semantic-accountability/reference-resolver.ts") ? sh(`git diff ${REMEDIATION_STARTING_SHA} HEAD -- lib/contract-model/compiler/semantic-accountability/reference-resolver.ts`) : "";
  const typesDiff = changed.includes("lib/contract-model/compiler/semantic-accountability/types.ts") ? sh(`git diff ${REMEDIATION_STARTING_SHA} HEAD -- lib/contract-model/compiler/semantic-accountability/types.ts`) : "";
  // The Pass-A call sites of the resolver pass no `fromNodeId`; the only behavioural addition (RESOLVED_WITHIN_ENUMERATION_RUN) is gated on it.
  const passACallSites = sh(`grep -n "resolveReferenceTarget(" lib/contract-model/compiler/semantic-accountability/source-context.ts lib/contract-model/compiler/semantic-accountability/source-coverage.ts || true`).split("\n").filter(Boolean);
  const callSitesPassOpts = passACallSites.filter((l) => /fromNodeId/.test(l));
  const typesChangeIsUnionOnly = typesDiff === "" || (typesDiff.split("\n").filter((l) => /^[+-](?![+-])/.test(l)).every((l) => /ReferenceResolutionStatus/.test(l)));
  // Mechanical additivity proof: every REMOVED line of the resolver diff must reappear as an ADDED line that differs only by
  // threading the optional referrer parameter/argument (`fromNodeId`). Any other removal is a behavioural change.
  const THREADING = [", fromNodeId: string | null = null", ", opts: { fromNodeId?: string | null } = {}", ", fromNodeId"];
  const diffLines = resolverDiff.split("\n");
  const removed = diffLines.filter((l) => /^-(?!-)/.test(l)).map((l) => l.slice(1));
  const addedNormalized = new Set(diffLines.filter((l) => /^\+(?!\+)/.test(l)).map((l) => THREADING.reduce((acc, t) => acc.split(t).join(""), l.slice(1))));
  const unmatchedRemovals = removed.filter((r) => !addedNormalized.has(r));
  const resolverAdditive = resolverDiff === "" || unmatchedRemovals.length === 0;
  const inv = candidate.inventory;
  const versions = { recordedAlgorithm: inv.algorithmVersion, currentAlgorithm: `${SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION}+${(inv.ensemble as { algorithmVersion?: string } | undefined)?.algorithmVersion ?? "semantic-ensemble.v1"}`, recordedPrompt: inv.promptVersion, currentPrompt: SEMANTIC_INVENTORY_PROMPT_VERSION };
  const versionsMatch = versions.recordedAlgorithm === versions.currentAlgorithm && versions.recordedPrompt === versions.currentPrompt;
  const nonResolverChanges = changed.filter((f) => !/reference-resolver\.ts$|semantic-accountability\/types\.ts$/.test(f));
  // §6 is answered BEHAVIOURALLY, not textually: the current tree must derive byte-identical Pass-A input (source
  // context incl. unresolvedReferences, slot partition, batching, system prompt, every per-batch user content) from
  // its own modules. Fails closed when the pre-remediation worktree is absent.
  const equivalence: PassAEquivalence = await provePassAInputEquivalence(process.env.PRE_REMEDIATION_WORKTREE, (candidate.inventory.partition?.batchChars ?? 6000) as number);
  const semanticChange = !equivalence.proven || nonResolverChanges.length > 0 || !typesChangeIsUnionOnly || callSitesPassOpts.length > 0 || !versionsMatch || !proof.sourceIdentityUnchanged;
  return {
    comparedRange: `${REMEDIATION_STARTING_SHA}..HEAD`, files: perFile, changedFiles: changed, nonResolverChanges,
    resolver: { changed: resolverDiff !== "", textuallyAdditiveOnly: resolverAdditive, removedLines: removed.length, textualRemovalsNotRestatedVerbatim: unmatchedRemovals, passACallSites, passACallSitesPassingFromNodeId: callSitesPassOpts, note: "the remediation added an optional { fromNodeId } parameter and a fourth rule (RESOLVED_WITHIN_ENUMERATION_RUN) that fires only when a referrer node is supplied. One AMBIGUOUS return is not restated verbatim: its note string gained a `${fromNodeId ? \"...\" : \"\"}` clause that renders as the empty string without a referrer. Pass A's source-context and source-coverage call sites supply no referrer, so the rendered text is unchanged for Pass A - which the behavioural equivalence proof below establishes directly rather than by reading the diff.", textualCheckIsDisclosureOnly: true },
    behaviouralEquivalence: equivalence,
    types: { changed: typesDiff !== "", unionMemberOnly: typeschangeSummary(typesDiff) },
    versions: { ...versions, match: versionsMatch },
    sourceIdentity: { recordedSourceContextHash: proof.recordedSourceContextHash, currentSourceContextHash: proof.currentSourceContextHash, recordedPartitionHash: proof.recordedPartitionHash, currentPartitionHash: proof.currentPartitionHash, unchanged: proof.sourceIdentityUnchanged, note: "the stored inventory's source-context hash AND slot-partition hash equal the ones the current structural index + resolver produce: the exact Pass-A input (regions, text, batching) is reproduced by the current tree" },
    semanticChangeFound: semanticChange,
    decidedBy: "byte-identical Pass-A input derived independently by each tree (worktree at 51fda65 vs HEAD), plus unchanged prompt/algorithm versions and unchanged source+partition identity; the textual diff is recorded as disclosure and is not the criterion",
    verdict: semanticChange ? "PASS_A_SEMANTIC_CHANGE_FOUND" : "NO_PASS_A_SEMANTIC_CHANGE",
  };
}
function typeschangeSummary(typesDiff: string) { const lines = typesDiff.split("\n").filter((l) => /^[+-](?![+-])/.test(l)); return { changedLines: lines.length, allOnReferenceResolutionStatusUnion: lines.every((l) => /ReferenceResolutionStatus/.test(l)), lines }; }

// ---------------------------------------------------------------------------
// §11/§12 resumed-work cost model: Pass A $0, Pass B = planner tokens x frozen worst rate, verifier = frozen allowance, x frozen safety factor
// ---------------------------------------------------------------------------
/**
 * §11 "frozen worst observed Pass-B token rate": the rates are read from the PINNED cost artifacts of the earlier
 * missions, not recomputed. Recomputation through observedRates() derives the Pass-B per-token rate by joining the
 * F-7B canary shard ledgers on shardId - and planner v2 (the remediation) changed shard identities, so that join no
 * longer resolves. The pinned numbers are byte-identical across 01, 49 and 75; nothing is re-parameterised, and the
 * recomputation attempt is recorded either way. A disagreement between any two pinned artifacts is fatal.
 */
export function frozenObservedRates(): { rates: ReturnType<typeof observedRates>; source: Record<string, unknown> } {
  const pinnedPaths = [`${OUT}/01-cost-preflight.json`, `${OUT}/49-final-clean-cost-preflight.json`, `${OUT}/75-final-paid-cost-preflight.json`];
  const pinned = pinnedPaths.map((p) => ({ path: p, rates: readJson<{ rates: ReturnType<typeof observedRates> }>(p).rates }));
  const canon = JSON.stringify(pinned[0]!.rates);
  const disagreeing = pinned.filter((p) => JSON.stringify(p.rates) !== canon).map((p) => p.path);
  if (disagreeing.length > 0) throw new Error(`pinned cost artifacts disagree on the frozen observed rates: ${disagreeing.join(", ")}`);
  let recomputed: ReturnType<typeof observedRates> | null = null, recomputeError: string | null = null;
  try { recomputed = observedRates(); } catch (e) { recomputeError = e instanceof Error ? e.message : String(e); }
  return { rates: pinned[0]!.rates, source: { method: "PINNED_FROZEN_RATES", pinnedArtifacts: pinnedPaths, allPinnedArtifactsAgree: true, recomputationAttempted: true, recomputationSucceeded: recomputed !== null, recomputationMatchesPinned: recomputed !== null ? JSON.stringify(recomputed) === canon : null, recomputeError, whyPinned: "observedRates() joins the frozen F-7B canary shard ledgers on shardId; planner v2 changed shard identities, so the historical join no longer resolves. The rate VALUES are unchanged - they are read from the artifacts the previous missions committed." } };
}

export function resumedCost(plan: ShardPlan, rates = frozenObservedRates().rates) {
  const passB = plan.totals.estimatedInputTokens * rates.passBWorst;
  const verifier = rates.verifierSemanticReview + CONDITION_SUSPICION_CALLS * CONDITION_SUSPICION_PER_CALL;
  const passBMean = plan.totals.estimatedInputTokens * rates.passBMean;
  const total = (0 + passB + verifier) * SAFETY_FACTOR;
  const capUsd = Math.ceil(total * 100) / 100;
  return {
    rates, safetyFactor: SAFETY_FACTOR, plannerEstimatedInputTokens: plan.totals.estimatedInputTokens,
    passA: { usd: 0, calls: 0, reason: "resumed from the persisted ensemble - no Pass-A caller is constructed" },
    passB: { worstUsd: +passB.toFixed(6), meanUsd: +passBMean.toFixed(6), conservativeUsd: +(passB * SAFETY_FACTOR).toFixed(6) },
    verifier: { worstUsd: +verifier.toFixed(6), conservativeUsd: +(verifier * SAFETY_FACTOR).toFixed(6), calls: { semanticReview: 1, conditionSuspicion: CONDITION_SUSPICION_CALLS } },
    conservativeTotalUsd: +total.toFixed(6), worstTotalUsd: +(passB + verifier).toFixed(6), meanTotalUsd: +(passBMean + verifier).toFixed(6),
    capUsd, capCeilingUsd: CAP_CEILING_USD, capWithinRecommendedCeiling: capUsd <= CAP_CEILING_USD,
    previousPassBPlusVerifierActualUsd: 2.799234,
  };
}
/** The guard for the resumed run: identical estimator/refusal arithmetic (HD-1), zero Pass-A remaining work, the mission's own cap. */
export function resumedGuard(rates: ReturnType<typeof observedRates>, plannerTokens: number, capUsd: number, balanceUsd: number, statePath: string | null) {
  return new Guard({ rates, passABatchesPerPass: 0, passAGapCallsPerPass: 0, passes: 2, passBPlannerTokens: plannerTokens, verifierReviews: 1, conditionSuspicionCalls: CONDITION_SUSPICION_CALLS, capUsd, balanceUsd, statePath });
}

// ---------------------------------------------------------------------------
// identity helpers shared by the freeze artifact and the runner's own refusal checks
// ---------------------------------------------------------------------------
export function identityChecks() {
  const actualSha = sh("git rev-parse HEAD");
  const dirty = sh("git status --porcelain").split("\n").filter((l) => l.trim() !== "" && !new RegExp(`${RAW}|docs/phase-3-final-601/(10[4-9]|11[0-7])-`).test(l));
  let remoteSha: string | null = null;
  try { remoteSha = sh("git ls-remote origin refs/heads/claude/headroom-scaffold-covenant-engine-jrijk8").split(/\s+/)[0] ?? null; } catch { try { remoteSha = sh("git rev-parse origin/claude/headroom-scaffold-covenant-engine-jrijk8"); } catch { remoteSha = null; } }
  const gate = existsSync(`${OUT}/103-remediation-gate.json`) ? readJson<{ verdict: string; summary: { PASS: number; FAIL: number }; paidCalls: number }>(`${OUT}/103-remediation-gate.json`) : null;
  // Exact: `git diff <sha> -- <path>` compares the WORKING TREE against that commit, so an empty name list proves the
  // production tree on disk is byte-identical to the one committed at the starting SHA (tree object ids recorded too).
  const productionPath = "lib/contract-model/compiler";
  const productionDrift = sh(`git diff --name-only ${STARTING_SHA} -- ${productionPath}`).split("\n").filter(Boolean);
  const productionTreeAtStart = sh(`git rev-parse ${STARTING_SHA}:${productionPath}`);
  const productionTreeNow = sh(`git rev-parse HEAD:${productionPath}`);
  const sourceSha = sha256(readFileSync(CHWY_SRC));
  const { refHash, byLabel } = section601ReferenceItems();
  return {
    startingSha: (() => {
      // The same rule the earlier 6.01 missions certified: either HEAD IS the pinned SHA, or HEAD is a descendant of
      // it whose only additions are this mission's own harness/evidence AND whose production tree is byte-identical.
      const isDescendant = (() => { try { sh(`git merge-base --is-ancestor ${STARTING_SHA} HEAD`); return true; } catch { return false; } })();
      const changedSincePin = sh(`git diff --name-only ${STARTING_SHA} HEAD`).split("\n").filter(Boolean);
      const missionOwned = changedSincePin.filter((f) => f.startsWith("scripts/") || new RegExp(`^docs/phase-3-final-601/(10[4-9]|11[0-7])-`).test(f) || f.startsWith(RAW) || f === "docs/phase-3-final-601/README.md" || f.startsWith("tests/contract-model/phase-3-601-revalidation"));
      const foreign = changedSincePin.filter((f) => !missionOwned.includes(f));
      return { expected: STARTING_SHA, actual: actualSha, exactMatch: actualSha === STARTING_SHA, isDescendantOfPin: isDescendant, filesChangedSincePin: changedSincePin, filesOutsideThisMissionsHarnessAndEvidence: foreign, match: actualSha === STARTING_SHA || (isDescendant && foreign.length === 0) };
    })(),
    workingTreeClean: { dirty, match: dirty.length === 0 },
    remoteAtSameHead: { remote: remoteSha, match: remoteSha === STARTING_SHA },
    remediationGate: { verdict: gate?.verdict ?? null, pass: gate?.summary.PASS ?? null, fail: gate?.summary.FAIL ?? null, paidCalls: gate?.paidCalls ?? null, match: gate?.verdict === "PHASE3_601_REMEDIATION_READY_FOR_PAID_REVALIDATION" && gate?.summary.PASS === 20 && gate?.summary.FAIL === 0 },
    productionTreeAsCommitted: { path: productionPath, treeObjectAtStartingSha: productionTreeAtStart, treeObjectAtHead: productionTreeNow, filesDifferingFromStartingSha: productionDrift, match: productionDrift.length === 0 && productionTreeAtStart === productionTreeNow },
    sourceSha256: { expected: EXPECT.sourceSha, actual: sourceSha, match: sourceSha === EXPECT.sourceSha },
    referenceSha256: { expected: EXPECT.refSha, actual: refHash, match: refHash === EXPECT.refSha },
    referenceSlice: { expected: { total: 8, critical: 4, material: 4 }, actual: { total: byLabel.length, critical: byLabel.filter((i) => i.materiality === "CRITICAL").length, material: byLabel.filter((i) => i.materiality === "MATERIAL").length }, match: byLabel.length === 8 && byLabel.filter((i) => i.materiality === "CRITICAL").length === 4 && byLabel.filter((i) => i.materiality === "MATERIAL").length === 4 },
  };
}
export function sectionChecks(built: ReturnType<typeof buildSection601>) {
  const sectionSha = sha256(built.operativeSourceText);
  return {
    sectionTextSha256: { expected: EXPECT.sectionSha, actual: sectionSha, match: sectionSha === EXPECT.sectionSha },
    sectionSpan: { expected: [EXPECT.charStart, EXPECT.charEnd], actual: [built.sec.charStart, built.sec.charEnd], match: built.sec.charStart === EXPECT.charStart && built.sec.charEnd === EXPECT.charEnd },
    sectionChars: { expected: EXPECT.chars, actual: built.operativeSourceText.length, match: built.operativeSourceText.length === EXPECT.chars },
  };
}
export const HARNESS_MODULES = ["scripts/phase-3-601-guard.ts", "scripts/phase-3-601-durable-replay.ts", "scripts/phase-3-601-hd4-resume.ts", "scripts/phase-3-601-trust-read.ts", "scripts/phase-3-601-score-numeric.ts", "scripts/phase-3-601-preflight.ts", "scripts/phase-3-601-revalidation-lib.ts", "scripts/phase-3-601-revalidation-preflight.ts", "scripts/phase-3-601-revalidation-run.ts", "scripts/phase-3-601-revalidation-score.ts", "scripts/phase-3-601-revalidation-finalize.ts", "lib/contract-model/compiler/semantic/frozen-inventory-resume.ts"];
export function harnessHashes() { return Object.fromEntries(HARNESS_MODULES.map((m) => [m, existsSync(m) ? sha256(readFileSync(m)) : null])); }
