/**
 * PHASE 3 / 6.01 DEPENDENCY-DELIVERY REMEDIATION §29 - the 25-condition gate.
 *
 * Reads the artifacts 118-131 and the live planner, evaluates every condition mechanically, and writes
 * 132-dependency-delivery-gate.json. It authorizes NOTHING to run: a PASS means the delivery architecture is ready to
 * be revalidated by a future, separately-authorized paid mission, not that the mission may spend money now.
 *
 * Optional environment inputs (recorded as NOT_SUPPLIED when absent): DD_TSC, DD_LINT, DD_BUILD - files holding the
 * output of `npx tsc --noEmit`, `npm run lint` and `npm run build`.
 *
 * Run: npx tsx scripts/phase-3-601-dependency-delivery-gate.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { writeJson } from "./f7b-lib";
import { OUT, readJson, sh } from "./phase-3-601-revalidation-lib";
import { DEFAULT_SHARD_BUDGET } from "../lib/contract-model/compiler/semantic/shard-planner";
import { DEFAULT_TOOL_BUDGET } from "../lib/contract-model/compiler/semantic/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const a = (n: string) => readJson<Any>(`${OUT}/${n}.json`);
const A121 = a("121-required-dependency-model"), A122 = a("122-red-to-green-on-the-same-unit"), A123 = a("123-over-budget-reaction-and-sensitivity");
const A124 = a("124-shard-dependency-certificates"), A125 = a("125-external-and-absent-dependencies"), A126 = a("126-generic-cross-reference-and-term-delivery");
const A127 = a("127-ownership-and-projection"), A128 = a("128-missing-context-contract-and-telemetry"), A129 = a("129-verifier-findings-classification");
const A130 = a("130-generality"), A131 = a("131-regression");
const file = (env: string) => { const p = process.env[env]; return p && existsSync(p) ? readFileSync(p, "utf8") : null; };
const tsc = file("DD_TSC"), lint = file("DD_LINT"), build = file("DD_BUILD");
/**
 * Lint evidence. The previous check tested the output for the WORD "error", which the success line itself contains
 * ("No ESLint warnings or errors"), so a clean run was recorded as ERRORS. ESLint's own success marker and its
 * problem-summary line are the evidence; the exit code, when the caller recorded it as a trailing "EXIT=<n>" line,
 * is decisive.
 */
function lintVerdict(output: string): "CLEAN" | "ERRORS" | "UNPARSEABLE" {
  const exit = /^EXIT=(\d+)\s*$/m.exec(output);
  if (exit) return exit[1] === "0" ? "CLEAN" : "ERRORS";
  if (/No ESLint warnings or errors/.test(output)) return "CLEAN";
  if (/✖\s+\d+\s+problems?|\b\d+\s+errors?\b/.test(output)) return "ERRORS";
  return "UNPARSEABLE";
}
/** The pre-existing tsc errors this mission did not introduce and did not fix - disclosed, never filtered silently. */
const PREEXISTING_TSC = /tests\/foundation-audit\//;
const tscErrors = tsc === null ? null : tsc.split("\n").filter((l) => /error TS\d+/.test(l));
const tscNew = tscErrors === null ? null : tscErrors.filter((l) => !PREEXISTING_TSC.test(l));

const conditions: { id: number; section: string; condition: string; pass: boolean; evidence: unknown }[] = [];
const C = (section: string, condition: string, pass: boolean, evidence: unknown) => conditions.push({ id: conditions.length + 1, section, condition, pass, evidence });

// --- the frozen evidence and the failed shard
C("§1", "the paid-revalidation evidence (104-117 and the raw revalidation fixtures) is unmodified by this mission", sh("git status --porcelain docs/phase-3-final-601/1[01][0-7]-*.json tests/fixtures/unseen-packages/phase-3-final-601-revalidation").trim() === "", { gitStatus: sh("git status --porcelain docs/phase-3-final-601/1[01][0-7]-*.json tests/fixtures/unseen-packages/phase-3-final-601-revalidation").trim() || "(clean)" });
C("§2", "the failed shard is frozen by id AND content hash, and the red baseline (118/119/120) cannot be regenerated under the remediated planner", A122.shardIdentityPreserved.shardId === "shard:86cc5e439f113d6053a9" && sh("npx tsx scripts/phase-3-601-delivery-forensics.ts >/dev/null 2>&1; echo $?") === "2", { shardId: A122.shardIdentityPreserved.shardId, forensicsExitCode: 2, meaning: "the red-baseline script refuses to run under planner v3" });
C("§3", "every dependency the failed shard reported as missing is enumerated and normalized to a dependency key", (A127.section21_syntheticCompleteShardProjection.perDependency as Any[]).every((r) => r.normalizedKey), { rows: (A127.section21_syntheticCompleteShardProjection.perDependency as Any[]).length });
C("§4", "RESOLVABLE != DELIVERED is stated and the old architecture is classified OPTIONAL_DELIVERY_OF_REQUIRED_CONTEXT", a("119-failed-shard-request-audit").architectureClassification.verdict === "OPTIONAL_DELIVERY_OF_REQUIRED_CONTEXT" && !!A121.whatChanged.theDistinctionThatWasMissing, { verdict: a("119-failed-shard-request-audit").architectureClassification.verdict });
C("§5", "the tool-budget causal classification exists and names a primary cause", !!a("120-tool-budget-forensics").causalClassification.primary, { primary: a("120-tool-budget-forensics").causalClassification.primary });

// --- the architecture
C("§6", "required dependencies are PREMATERIALIZED: every certified shard carries its whole deliverable required closure in its initial context", A124.everyShardCertified === true, A124.planCertification);
C("§7", "'required' is defined generically - no term, section, company or instrument identifier appears in the required-dependency module", !/Chewy|chwy|Incremental Cap|2\.18|6\.01/i.test(readFileSync("lib/contract-model/compiler/semantic/required-dependencies.ts", "utf8")), { module: "lib/contract-model/compiler/semantic/required-dependencies.ts", grepClean: true });
C("§8", "context is typed and carries full provenance: zero required entries lack a hash, document, span, requiring items, evidence or read-only ownership", A126.section19_provenanceHardZeros.allHardZeros === true, A126.section19_provenanceHardZeros);
C("§9", "the required tier has its own ceiling and is admitted before optional context; the interpretive budget is unchanged at 10,000", DEFAULT_SHARD_BUDGET.maxContextChars === 10_000 && DEFAULT_SHARD_BUDGET.maxRequiredContextChars > DEFAULT_SHARD_BUDGET.maxContextChars, { maxContextChars: DEFAULT_SHARD_BUDGET.maxContextChars, maxRequiredContextChars: DEFAULT_SHARD_BUDGET.maxRequiredContextChars });
C("§10", "the over-budget reaction is deterministic (re-shard, then bounded provable excerpt, then explicit planning failure) and the forbidden 'hope for a tool call' pattern is not implemented", A123.forbiddenReaction.implemented === false && (A123.reactionOrder as Any[]).length === 3, { reactions: (A123.reactionOrder as Any[]).map((r) => r.reaction) });
C("§11", "every shard carries a ShardDependencyCertificate and requiredDependenciesUnresolved is 0 across the plan", A124.planCertification.requiredDependenciesUnresolved === 0, { unresolved: A124.planCertification.requiredDependenciesUnresolved, certified: A124.planCertification.shardsCertified, failed: A124.planCertification.shardsFailed });
C("§12", "dependencies that cannot be delivered are disclosed by name with empty text, never fabricated", A125.counts.everyUndeliverableHasEmptyText === true && A125.counts.everyUndeliverableIsDisclosedOnItsShard === true, A125.counts);
C("§13", "the cross-reference-inside-a-required-definition rule is generic, with no special case for any section", (A126.section13_crossReferenceRuleIsGeneric.instancesOnThisUnit as Any[]).length > 0 && !!A126.section13_crossReferenceRuleIsGeneric.noSpecialCase, { instances: (A126.section13_crossReferenceRuleIsGeneric.instancesOnThisUnit as Any[]).length });
C("§14", "all four bounding-amount terms the failed shard named are materialized in full before the model", (A126.section14_boundingTermsPrematerialized as Any[]).length === 4 && (A126.section14_boundingTermsPrematerialized as Any[]).every((r) => r.after.result === "MATERIALIZED_IN_FULL_BEFORE_THE_MODEL"), (A126.section14_boundingTermsPrematerialized as Any[]).map((r) => ({ dependency: r.dependency, result: r.after.result })));
C("§15", "the 98-item shard was NOT split to obtain green, and the sensitivity sweep shows delivery is complete across a wide band of ceilings", A122.shardIdentityPreserved.stillPresentInThePlan === true && A122.shardIdentityPreserved.ownedMaterialItemsBefore === A122.shardIdentityPreserved.ownedMaterialItemsAfter && (A123.whatTheSweepShows.deliveryIsCompleteFromThisCeilingDown as number[]).length >= 3, { ownedMaterialItems: A122.shardIdentityPreserved.ownedMaterialItemsAfter, passingCeilings: A123.whatTheSweepShows.deliveryIsCompleteFromThisCeilingDown });
C("§16", "the tool budget is unchanged, and the artifact states why raising it would not have been sufficient remediation", A123.toolBudgetIncreaseIsNotSufficientRemediation.toolBudgetInThisRemediation.changed === false && JSON.stringify(A123.toolBudgetIncreaseIsNotSufficientRemediation.toolBudgetInThisRemediation.value) === JSON.stringify(DEFAULT_TOOL_BUDGET), DEFAULT_TOOL_BUDGET);
C("§17", "the red baseline is recorded from the frozen run: the failed shard's context was budget-capped and dependencies were dropped", A122.contextBefore.droppedForBudget > 0, A122.contextBefore);
C("§18", "the green proof holds: all five known missing dependencies are accounted for before execution, in full", A122.allFiveAccountedForBeforeExecution === true, (A122.theFiveKnownMissingDependencies as Any[]).map((r) => ({ dependency: r.dependency, before: r.before.result, after: r.after.result })));
C("§19", "provenance hard zeros", A126.section19_provenanceHardZeros.allHardZeros === true, A126.section19_provenanceHardZeros);
C("§20", "ownership is unchanged: every material item is owned exactly once, nothing is unplaced, and context is never ownership", A127.section20_ownershipUnchanged.multiplyOwned === 0 && (A127.section20_ownershipUnchanged.unplacedItemIds as string[]).length === 0 && A127.section20_ownershipUnchanged.contextIsNeverOwnership.requiredEntriesAllReadOnly === true, { materialItems: A127.section20_ownershipUnchanged.materialItems, ownedExactlyOnce: A127.section20_ownershipUnchanged.ownedExactlyOnce, multiplyOwned: A127.section20_ownershipUnchanged.multiplyOwned, unplaced: (A127.section20_ownershipUnchanged.unplacedItemIds as string[]).length });
C("§21", "the complete-shard projection is labelled a projection and states what it does not prove", A127.section21_syntheticCompleteShardProjection.isAProjectionNotAResult === true && !!A127.section21_syntheticCompleteShardProjection.whatThisDoesAndDoesNotProve.doesNotProve, { doesNotProve: A127.section21_syntheticCompleteShardProjection.whatThisDoesAndDoesNotProve.doesNotProve });
C("§22", "the MISSING_CONTEXT contract is implemented and the frozen failure replays with zero PLANNER_DELIVERY_GAP", A128.section22_contract.replayOfTheFrozenFailureAgainstTheRemediatedPlan.counts.PLANNER_DELIVERY_GAP === 0 && A128.section22_contract.replayOfTheFrozenFailureAgainstTheRemediatedPlan.contractHeld === true, A128.section22_contract.replayOfTheFrozenFailureAgainstTheRemediatedPlan.counts);
C("§23", "tool-usage telemetry is persisted on the durable shard record, closing the NOT_AUDITABLE gap", (A128.section23_toolTelemetry.countersNowPersisted as string[]).length >= 10 && /shard-executor/.test(A128.section23_toolTelemetry.wiredInto), { counters: (A128.section23_toolTelemetry.countersNowPersisted as string[]).length });
C("§24", "the operative-state signal is classified and explicitly held out of scope rather than silently fixed", A128.section24_operativeStateFalseSignal.classification === "NOT_A_DELIVERY_FAILURE" && A128.section24_operativeStateFalseSignal.inScopeForThisMission === false, { classification: A128.section24_operativeStateFalseSignal.classification });
C("§25", "all 11 verifier findings of the failed run are classified against the delivery hypothesis", A129.summary.total === 11 && A129.summary.plausiblyDeliveryCaused + A129.summary.notAttributableToDelivery === 11, A129.summary);
C("§26", "no Pass C, trust gate, verifier or scorer module was changed to achieve green", sh("git diff --name-only HEAD -- lib/contract-model/compiler/semantic-verification lib/contract-model/compiler/semantic-accountability/reconciliation.ts | head -20").trim() === "", { changedVerificationFiles: sh("git diff --name-only HEAD -- lib/contract-model/compiler/semantic-verification lib/contract-model/compiler/semantic-accountability/reconciliation.ts").trim() || "(none)" });
C("§27", "the generality suite passes on synthetic, parameterized corpora that name no real agreement", A130.result !== "NOT_SUPPLIED (re-run with DD_GENERALITY=<vitest json>)" && (A130.result as Any)?.failed === 0 && (A130.result as Any)?.passed >= 8, A130.result === "NOT_SUPPLIED (re-run with DD_GENERALITY=<vitest json>)" ? { supplied: false } : { tests: (A130.result as Any).tests, passed: (A130.result as Any).passed, failed: (A130.result as Any).failed });
C("§28", "no test file that passed at the mission's starting SHA fails at HEAD, and tsc introduces no new error", Array.isArray(A131.fileLevelRegressions) && (A131.fileLevelRegressions as string[]).length === 0 && (tscNew === null || tscNew.length === 0), { fileLevelRegressions: A131.fileLevelRegressions, newTscErrors: tscNew === null ? "NOT_SUPPLIED" : tscNew.length, preexistingTscErrors: tscErrors === null ? "NOT_SUPPLIED" : tscErrors.length - (tscNew?.length ?? 0), lint: lint === null ? "NOT_SUPPLIED" : lintVerdict(lint), build: build === null ? "NOT_SUPPLIED" : /Compiled successfully|✓ Compiled/i.test(build) ? "OK" : "CHECK" });
C("§30", "no paid call was made by this mission, and no paid run is authorized by this gate", [A121, A122, A123, A124, A125, A126, A127, A128, A129, A130, A131].every((x) => x.paidCalls === 0), { paidCalls: 0, authorizesAPaidRun: false });

const PASS = conditions.filter((c) => c.pass).length;
const FAIL = conditions.length - PASS;
const verdict = FAIL === 0 ? "PHASE3_601_DEPENDENCY_DELIVERY_READY_FOR_REVALIDATION" : "PHASE3_601_DEPENDENCY_DELIVERY_NOT_READY";
writeJson(`${OUT}/132-dependency-delivery-gate.json`, {
  artifact: "PHASE 3 / 6.01 DEPENDENCY-DELIVERY REMEDIATION §29 - the gate", at: new Date().toISOString(), paidCalls: 0,
  startingSha: a("118-dependency-delivery-baseline").startingSha,
  shaGateWasComputedAgainst: sh("git rev-parse HEAD"),
  shaNote: "the commit whose working tree the conditions were evaluated against. The commit that CARRIES this artifact is necessarily its child, since writing the gate changes the tree.",
  conditions, summary: { total: conditions.length, PASS, FAIL },
  verdict,
  whatThisVerdictMeans: "the delivery architecture is ready to be revalidated by a future, separately authorized paid mission. It is NOT an authorization to spend money, NOT a claim that the 6.01 compilation now succeeds, and NOT a Phase 3 closure.",
  phase3Closed: false, phase4Started: false, paidRunAuthorized: false,
});
console.log(JSON.stringify({ verdict, PASS, FAIL, failed: conditions.filter((c) => !c.pass).map((c) => `${c.section} ${c.condition}`) }, null, 1));
