/**
 * Phase 3F.1.6.RX-FINAL Part B - INDEPENDENT recertification of FINDING-6
 * (AUDIT-F2's "zombie writer" gap - AnalysisRun.executionGeneration fencing).
 *
 * Written FROM SCRATCH by the Part B auditor. Deliberately does NOT reuse or
 * re-run tests/contract-model/part-b-recert-auditf2-concurrency.test.ts's own
 * "ZOMBIE WRITER" test (that would only re-confirm what Part A already
 * proved about itself). Every scenario below is a fresh attack shape:
 *
 *   - a multi-hop generation CHAIN (gen1 -> gen2 -> gen3), proving a
 *     once-superseded writer stays fenced out forever, not just against the
 *     immediately-next owner;
 *   - genuinely concurrent (Promise.all, no artificial sequencing) mixed old-
 *     generation / new-generation writes hitting the SAME row at once;
 *   - a zombie resuming its write AFTER the run has been fully reclaimed AND
 *     re-completed THROUGH SEVERAL SUBSEQUENT full analysis cycles;
 *   - a genuine concurrent race against recordAnalysisRunIssue's FOR UPDATE
 *     child-table fencing;
 *   - and, as the assigned falsification attempt, a dedicated investigation
 *     of every mutating AnalysisRun-adjacent write path the design document
 *     itself discloses as NOT a true atomic compare-and-swap:
 *     persistSemanticTruthForInstrument's pre-write generation GATE (a
 *     check-then-act read, not a per-row CAS - see
 *     lib/contract-model/analysis/semantic-truth/service.ts's own
 *     "disclosedLimitation" doc comment). Both a deterministic
 *     (interleaving-controlled) and a genuinely-timed, unmocked concurrent
 *     reproduction are provided against real Postgres.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { startOrResumeAnalysisRun, setAnalysisRunStage, completeAnalysisRun, failAnalysisRun, recordAnalysisRunIssue } from "../../lib/contract-model/analysis/service";
import { persistSemanticTruthForInstrument } from "../../lib/contract-model/analysis/semantic-truth/service";
import { CONTRACT_ANALYSIS_ORCHESTRATOR_VERSION } from "../../lib/contract-model/analysis/identity";
import { IR_SCHEMA_VERSION } from "../../lib/contract-model/ir/types";
import type { IRRule } from "../../lib/contract-model/ir/types";

const COMPANY_ID = "part-b-recert-finding6-independent";

async function cleanupCompanyState() {
  await prisma.claimReviewItem.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.analysisRunIssue.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.semanticTruthRecord.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.analysisFailureLog.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.analysisRun.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.documentNode.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.document.deleteMany({ where: { companyId: COMPANY_ID } });
}

beforeAll(async () => {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
  await prisma.company.create({ data: { id: COMPANY_ID, name: "Part B recert F6 independent co", onboardingStatus: "ONBOARDING" } });
});

afterAll(async () => {
  await cleanupCompanyState();
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
});

beforeEach(async () => {
  await cleanupCompanyState();
});

async function backdateUpdatedAt(runId: string, minutesAgo: number) {
  await prisma.$executeRaw`UPDATE analysis_runs SET "updatedAt" = NOW() - (${minutesAgo}::text || ' minutes')::interval WHERE id = ${runId}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const compilerVersions = { irSchemaVersion: IR_SCHEMA_VERSION, compilerAlgorithmVersion: "test-compiler-v1", compilerPromptVersion: "test-prompt-v1", toolPolicyVersion: "test-tool-v1" };

function makeRule(overrides: Partial<IRRule> & { ruleId: string; instrumentKey: string }): IRRule {
  return {
    irSchemaVersion: IR_SCHEMA_VERSION,
    companyId: COMPANY_ID,
    sourceDocumentId: "doc-1",
    sourceSectionRef: "1.00",
    covenantFamily: "INDEBTEDNESS",
    ruleType: "QUANTITATIVE_PERMISSION",
    posture: "PERMISSION",
    action: "INCUR_DEBT",
    entityScope: [],
    entityScopeExcluded: [],
    transactionScope: null,
    capacityExpression: null,
    conditions: [],
    exceptions: [],
    dependsOn: [],
    operativeLineage: null,
    sufficiency: "COMPLETE",
    sufficiencyReasons: [],
    provenance: null,
    compilerVersion: "test-v1",
    sourceContentVersion: null,
    ...overrides,
  };
}

describe("Part B INDEPENDENT recertification - FINDING-6 AnalysisRun row mutators (fresh adversarial scenarios)", () => {
  it("MULTI-HOP STALENESS CHAIN: gen1 -> gen2 -> gen3 - BOTH a once-superseded (gen1) AND a twice-superseded (gen2) writer are permanently rejected, not just against the immediately-next owner", async () => {
    const identity = { companyId: COMPANY_ID, packageKey: "pkg-f6-indep-chain", documentIds: ["doc-x"], analysisAlgorithmVersion: CONTRACT_ANALYSIS_ORCHESTRATOR_VERSION };

    const gen1Outcome = await startOrResumeAnalysisRun(identity);
    expect(gen1Outcome.kind).toBe("STARTED");
    const runId = gen1Outcome.run.id;
    const gen1 = gen1Outcome.run.executionGeneration;
    expect(gen1).toBe(1);

    // gen1 goes quiet (but not dead) for >30 minutes - reclaimed by gen2.
    await backdateUpdatedAt(runId, 45);
    const gen2Outcome = await startOrResumeAnalysisRun(identity);
    expect(gen2Outcome.kind).toBe("STARTED");
    const gen2 = gen2Outcome.run.executionGeneration;
    expect(gen2).toBe(2);

    // gen2 ALSO goes quiet for >30 minutes - reclaimed by gen3. Two full
    // hand-offs have now occurred while gen1 (and now gen2) are still
    // physically alive and could still issue writes at any moment.
    await backdateUpdatedAt(runId, 45);
    const gen3Outcome = await startOrResumeAnalysisRun(identity);
    expect(gen3Outcome.kind).toBe("STARTED");
    const gen3 = gen3Outcome.run.executionGeneration;
    expect(gen3).toBe(3);

    // gen3 makes real, live progress.
    expect(await setAnalysisRunStage(runId, "PER_INSTRUMENT_ANALYSIS", gen3)).toBe(true);

    // The zombie from TWO hops ago (gen1) resumes and tries every mutating call.
    expect(await setAnalysisRunStage(runId, "GEN1_ZOMBIE_STAGE", gen1)).toBe(false);
    expect(await completeAnalysisRun(runId, { openReviewItemCount: 0, hadInstrumentFailures: false }, gen1)).toBeNull();
    expect(await failAnalysisRun(runId, { stage: "GEN1_ZOMBIE", message: "gen1 zombie", errorClass: "ZombieError" }, gen1)).toBeNull();

    // The zombie from ONE hop ago (gen2) - itself once a legitimate reclaimer - ALSO resumes and tries every mutating call. A generation fence must reject a superseded owner regardless of how "recent" its own generation was.
    expect(await setAnalysisRunStage(runId, "GEN2_ZOMBIE_STAGE", gen2)).toBe(false);
    expect(await completeAnalysisRun(runId, { openReviewItemCount: 0, hadInstrumentFailures: false }, gen2)).toBeNull();
    expect(await failAnalysisRun(runId, { stage: "GEN2_ZOMBIE", message: "gen2 zombie", errorClass: "ZombieError" }, gen2)).toBeNull();

    // The row's real, live state is untouched by either zombie - still exactly what gen3 (the true, current owner) set.
    const finalRow = await prisma.analysisRun.findUniqueOrThrow({ where: { id: runId } });
    expect(finalRow.currentStage).toBe("PER_INSTRUMENT_ANALYSIS");
    expect(finalRow.status).toBe("RUNNING");
    expect(finalRow.executionGeneration).toBe(3);
    expect(finalRow.fatalError).toBeNull();

    // gen3 now completes for real - its own write is the only one that ever counted.
    const completeResult = await completeAnalysisRun(runId, { openReviewItemCount: 2, hadInstrumentFailures: false }, gen3);
    expect(completeResult).not.toBeNull();
    expect(completeResult!.status).toBe("COMPLETED_WITH_REVIEW");
  });

  it("GENUINE CONCURRENT MIXED-GENERATION RACE: old-generation and new-generation setAnalysisRunStage calls fired together via Promise.all (no artificial sequencing) - every old-generation call loses, every new-generation call wins, regardless of real scheduling order", async () => {
    const identity = { companyId: COMPANY_ID, packageKey: "pkg-f6-indep-mixed-race", documentIds: ["doc-x"], analysisAlgorithmVersion: CONTRACT_ANALYSIS_ORCHESTRATOR_VERSION };

    const gen1Outcome = await startOrResumeAnalysisRun(identity);
    const runId = gen1Outcome.run.id;
    const gen1 = gen1Outcome.run.executionGeneration;

    await backdateUpdatedAt(runId, 45);
    const gen2Outcome = await startOrResumeAnalysisRun(identity);
    const gen2 = gen2Outcome.run.executionGeneration;
    expect(gen2).toBe(gen1 + 1);

    // A real Promise.all race: 10 stale (gen1) calls and 10 live (gen2)
    // calls, INTERLEAVED in one array (not run as two separate sequential
    // waves) so their actual DB-level execution order is whatever the real
    // connection pool/event loop happens to schedule - genuinely concurrent,
    // not scripted before/after.
    const calls: Promise<boolean>[] = [];
    const expectedKind: ("OLD" | "NEW")[] = [];
    for (let i = 0; i < 10; i++) {
      calls.push(setAnalysisRunStage(runId, `OLD_STAGE_${i}`, gen1));
      expectedKind.push("OLD");
      calls.push(setAnalysisRunStage(runId, `NEW_STAGE_${i}`, gen2));
      expectedKind.push("NEW");
    }
    const results = await Promise.all(calls);

    for (let i = 0; i < results.length; i++) {
      if (expectedKind[i] === "OLD") expect(results[i]).toBe(false);
      else expect(results[i]).toBe(true);
    }

    // Whatever the row's final currentStage is, it MUST be one of the
    // NEW_STAGE_* values - never an OLD_STAGE_* value, no matter which of
    // the 10 legitimate writes happened to land last.
    const finalRow = await prisma.analysisRun.findUniqueOrThrow({ where: { id: runId } });
    expect(finalRow.currentStage).toMatch(/^NEW_STAGE_\d$/);
    expect(finalRow.executionGeneration).toBe(gen2);
  });

  it("ZOMBIE RESUMES ACROSS SEVERAL SUBSEQUENT FULL RUN CYCLES: a gen1 writer that never got word its run was reclaimed tries to write again after the run has ALREADY been reclaimed, completed, re-triggered, and completed AGAIN twice more", async () => {
    const identity = { companyId: COMPANY_ID, packageKey: "pkg-f6-indep-multi-cycle", documentIds: ["doc-x"], analysisAlgorithmVersion: CONTRACT_ANALYSIS_ORCHESTRATOR_VERSION };

    const run1 = await startOrResumeAnalysisRun(identity);
    const runId = run1.run.id;
    const gen1 = run1.run.executionGeneration;
    expect(gen1).toBe(1);
    // gen1 never itself completes or fails - it simply goes silent forever
    // from here (the realistic "slow, not dead" scenario), and every write
    // below happens completely independent of it.

    // Cycle 2: a legitimate new trigger reclaims immediately (status is
    // still RUNNING and fresh here, so we backdate once to model the
    // 30-minute abandonment window before this FIRST reclaim only).
    await backdateUpdatedAt(runId, 45);
    const run2 = await startOrResumeAnalysisRun(identity);
    const gen2 = run2.run.executionGeneration;
    const complete2 = await completeAnalysisRun(runId, { openReviewItemCount: 0, hadInstrumentFailures: false }, gen2);
    expect(complete2!.status).toBe("COMPLETED");

    // Cycle 3: another legitimate re-trigger (e.g. new documents uploaded) -
    // reclaims instantly since status is COMPLETED, not RUNNING at all.
    const run3 = await startOrResumeAnalysisRun(identity);
    const gen3 = run3.run.executionGeneration;
    expect(gen3).toBe(gen2 + 1);
    const complete3 = await completeAnalysisRun(runId, { openReviewItemCount: 1, hadInstrumentFailures: false }, gen3);
    expect(complete3!.status).toBe("COMPLETED_WITH_REVIEW");

    // Cycle 4: yet another legitimate re-trigger.
    const run4 = await startOrResumeAnalysisRun(identity);
    const gen4 = run4.run.executionGeneration;
    expect(gen4).toBe(gen3 + 1);
    expect(await setAnalysisRunStage(runId, "PER_INSTRUMENT_ANALYSIS", gen4)).toBe(true);

    // NOW gen1 - dormant since the very first claim, three full cycles ago -
    // finally resumes and tries to write.
    expect(await setAnalysisRunStage(runId, "GEN1_VERY_LATE_STAGE", gen1)).toBe(false);
    expect(await completeAnalysisRun(runId, { openReviewItemCount: 999, hadInstrumentFailures: false }, gen1)).toBeNull();
    expect(await failAnalysisRun(runId, { stage: "GEN1_VERY_LATE", message: "very late zombie", errorClass: "ZombieError" }, gen1)).toBeNull();

    const finalRow = await prisma.analysisRun.findUniqueOrThrow({ where: { id: runId } });
    expect(finalRow.executionGeneration).toBe(gen4);
    expect(finalRow.currentStage).toBe("PER_INSTRUMENT_ANALYSIS");
    expect(finalRow.status).toBe("RUNNING"); // never flipped to FAILED/COMPLETED by the gen1 zombie
    expect(finalRow.reviewItemCount).not.toBe(999);
  });

  it("recordAnalysisRunIssue GENUINE CONCURRENT RACE against a real reclaim: FOR UPDATE row-lock fencing + the reclaim's own clearAnalysisRunIssues sweep together guarantee NO gen1-authored issue ever survives as the final state, under actual Promise.all concurrency (not sequenced)", async () => {
    const identity = { companyId: COMPANY_ID, packageKey: "pkg-f6-indep-issue-race", documentIds: ["doc-x"], analysisAlgorithmVersion: CONTRACT_ANALYSIS_ORCHESTRATOR_VERSION };
    const claim = await startOrResumeAnalysisRun(identity);
    const runId = claim.run.id;
    const gen1 = claim.run.executionGeneration;

    // Make the row eligible for reclaim, then fire the reclaim AND ten
    // concurrent gen1 recordAnalysisRunIssue calls all at once via
    // Promise.all - a genuine race with no artificial before/after
    // sequencing between the reclaim and the issue writes. NOTE: a gen1
    // write that genuinely wins the FOR UPDATE row-lock race BEFORE the
    // reclaim's own updateMany commits legitimately observes a
    // still-matching generation and is honestly reported applied:true by
    // recordAnalysisRunIssue - but the reclaim path's own subsequent,
    // unconditional clearAnalysisRunIssues(runId) (AUDIT-F3's "a fresh
    // attempt's issue set must never carry a prior attempt's stale failure"
    // contract) then deletes EVERY AnalysisRunIssue row for this runId
    // regardless of exactly when it was written - so the composite
    // contract this test actually verifies is EVENTUAL correctness of the
    // persisted issue set after the whole race settles, not that
    // applied:true instantaneously implies permanent persistence.
    await backdateUpdatedAt(runId, 45);

    const ISSUE_COUNT = 10;
    const issueKeys = Array.from({ length: ISSUE_COUNT }, (_, i) => `concurrent-issue-${i}`);
    const [reclaimOutcome, ...issueResults] = await Promise.all([
      startOrResumeAnalysisRun(identity),
      ...issueKeys.map((instrumentKey) => recordAnalysisRunIssue({ runId, companyId: COMPANY_ID, instrumentKey, documentIds: ["doc-x"], failedStage: "PER_INSTRUMENT_ANALYSIS", errorClass: "TestError", message: `race test ${instrumentKey}`, expectedGeneration: gen1 })),
    ]);

    expect(reclaimOutcome.kind).toBe("STARTED");
    const gen2 = reclaimOutcome.run.executionGeneration;
    expect(gen2).toBe(gen1 + 1);
    for (const r of issueResults) expect(typeof r.applied).toBe("boolean");

    // The NEW (gen2) owner now records its own, genuinely current failure.
    expect((await recordAnalysisRunIssue({ runId, companyId: COMPANY_ID, instrumentKey: "gen2-real-issue", documentIds: ["doc-x"], failedStage: "PER_INSTRUMENT_ANALYSIS", errorClass: "RealError", message: "gen2 real failure", expectedGeneration: gen2 })).applied).toBe(true);

    // EVENTUAL CORRECTNESS: whatever happened during the race, the FINAL
    // persisted issue set for this run must contain ONLY the gen2 owner's
    // own real issue - never any of the ten gen1-authored ones, regardless
    // of how many of them were (honestly, at the time) reported applied.
    const finalIssues = await prisma.analysisRunIssue.findMany({ where: { runId } });
    expect(finalIssues.map((i) => i.instrumentKey)).toEqual(["gen2-real-issue"]);

    // DETERMINISTIC SANITY CHECK (no race): once the reclaim has fully
    // settled, a gen1 call is unambiguously, deterministically rejected -
    // the base fencing contract holds outside the race window too.
    const lateGen1 = await recordAnalysisRunIssue({ runId, companyId: COMPANY_ID, instrumentKey: "gen1-late-deterministic", documentIds: ["doc-x"], failedStage: "PER_INSTRUMENT_ANALYSIS", errorClass: "ZombieError", message: "late gen1", expectedGeneration: gen1 });
    expect(lateGen1.applied).toBe(false);
    expect(await prisma.analysisRunIssue.count({ where: { runId, instrumentKey: "gen1-late-deterministic" } })).toBe(0);
  });
});

describe("Part B FALSIFICATION ATTEMPT - persistSemanticTruthForInstrument's generation gate is a check-then-act read, not a per-row atomic CAS", () => {
  it("DETERMINISTIC REPRODUCTION (controlled interleave, real Postgres reads/writes throughout): a superseded (gen1) writer's stale content clobbers the new (gen2) owner's already-persisted, fresh content for the SAME semantic object", async () => {
    const identity = { companyId: COMPANY_ID, packageKey: "pkg-f6-indep-truth-toctou", documentIds: ["doc-x"], analysisAlgorithmVersion: CONTRACT_ANALYSIS_ORCHESTRATOR_VERSION };
    const claim = await startOrResumeAnalysisRun(identity);
    const runId = claim.run.id;
    const gen1 = claim.run.executionGeneration;
    expect(gen1).toBe(1);

    const instrumentKey = "toctou-deterministic-instrument";
    const sharedRuleId = "toctou-shared-rule-deterministic";
    const staleRule = makeRule({ ruleId: sharedRuleId, instrumentKey, sourceSectionRef: "9.01", capacityExpression: { kind: "MONEY", type: "MONEY", exprId: "e-stale", amount: 111, currency: "USD" } as unknown as IRRule["capacityExpression"] });
    const freshRule = makeRule({ ruleId: sharedRuleId, instrumentKey, sourceSectionRef: "9.01", capacityExpression: { kind: "MONEY", type: "MONEY", exprId: "e-fresh", amount: 999, currency: "USD" } as unknown as IRRule["capacityExpression"] });

    // Intercept the ONE prisma.analysisRun.findUnique call
    // persistSemanticTruthForInstrument's own gate performs. We let it run
    // for REAL against Postgres first (capturing whatever the row's true,
    // accurate-at-that-instant generation is - genuinely 1, since the
    // reclaim below has not happened yet) and only delay WHEN that already-
    // real result is handed back to the caller - simulating the realistic
    // case where the old worker's own gate check genuinely won the race to
    // read the row BEFORE the reclaim committed, then was simply slow
    // (scheduler/network jitter, GC pause, anything) to act on what it read.
    //
    // NOTE: this deliberately does NOT use vi.spyOn on Prisma's own model
    // delegate - Prisma's client exposes each model (e.g.
    // `prisma.analysisRun`) via an internal proxy whose OWN
    // `getOwnPropertyDescriptor` trap reports a decoy `{ value: undefined }`
    // descriptor for methods like `findUnique` (confirmed by direct probe:
    // `Object.getOwnPropertyDescriptor(prisma.analysisRun, "findUnique")`
    // returns `value: undefined` even though the property is genuinely
    // callable) - `vi.spyOn` captures its "original" via exactly that API,
    // so `mockRestore()` silently reinstalls `undefined` and permanently
    // breaks every later real call to `prisma.analysisRun.findUnique` for
    // the rest of this test file's process (this was hit and diagnosed
    // during this test's own development). Manually capturing the live
    // function via plain property access (not `getOwnPropertyDescriptor`)
    // and restoring via plain reassignment in `finally` sidesteps this
    // Prisma-proxy quirk entirely and was confirmed to restore real
    // Postgres access correctly.
    const originalFindUnique = prisma.analysisRun.findUnique;
    let releaseOldWorkerGate: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseOldWorkerGate = resolve;
    });
    let delayNextMatchingRead = true;
    (prisma.analysisRun as unknown as { findUnique: typeof prisma.analysisRun.findUnique }).findUnique = (async (args: Parameters<typeof prisma.analysisRun.findUnique>[0]) => {
      const real = await originalFindUnique(args as never);
      const targetsOurRun = (args as { where?: { id?: string } })?.where?.id === runId;
      if (targetsOurRun && delayNextMatchingRead) {
        delayNextMatchingRead = false;
        await gate;
      }
      return real;
    }) as unknown as typeof prisma.analysisRun.findUnique;

    try {
      // Old worker (gen1) begins persisting its (stale) semantic truth. Its
      // internal gate check fires immediately and captures the REAL,
      // accurate generation (1) - but its own promise is now held open by
      // our gate, exactly modeling "the check already happened and
      // genuinely passed" before anything else occurs.
      const oldWorkerPromise = persistSemanticTruthForInstrument({ companyId: COMPANY_ID, packageKey: identity.packageKey, instrumentKey, analysisRunId: runId, expectedGeneration: gen1, objects: [{ kind: "RULE", object: staleRule, candidateRef: "c-stale", compilerVersions, verification: null, verifierPromptVersion: null }] });

      // Give the mocked read a moment to actually fire and be captured.
      await sleep(25);

      // A legitimate new owner now reclaims the run for real (a genuine
      // Postgres UPDATE, the SAME mechanism startOrResumeAnalysisRun's own
      // reclaim branch uses).
      const reclaimed = await prisma.analysisRun.update({ where: { id: runId }, data: { executionGeneration: { increment: 1 } } });
      const gen2 = reclaimed.executionGeneration;
      expect(gen2).toBe(gen1 + 1);

      // The new owner computes and durably persists its own, correct, fresh
      // semantic truth for the SAME instrument/ruleId - this call's own gate
      // check is genuinely fresh and genuinely matches, so it is expected
      // (and required, by FINDING-6's own contract) to succeed cleanly.
      const newWorkerSummary = await persistSemanticTruthForInstrument({ companyId: COMPANY_ID, packageKey: identity.packageKey, instrumentKey, analysisRunId: runId, expectedGeneration: gen2, objects: [{ kind: "RULE", object: freshRule, candidateRef: "c-fresh", compilerVersions, verification: null, verifierPromptVersion: null }] });
      expect(newWorkerSummary.skippedSupersededGeneration).toBe(false);
      expect(newWorkerSummary.upserted).toBe(1);

      const afterNewWorker = await prisma.semanticTruthRecord.findUniqueOrThrow({ where: { companyId_instrumentKey_kind_semanticObjectId: { companyId: COMPANY_ID, instrumentKey, kind: "RULE", semanticObjectId: sharedRuleId } } });
      expect((afterNewWorker.payload as unknown as IRRule).capacityExpression).toMatchObject({ amount: 999 });

      // NOW release the old (superseded) worker's held gate check result.
      // Per FINDING-6's own stated intent for this gate ("a stale
      // (superseded) execution must never republish its own semantic output
      // as this instrument's 'current' state on behalf of a run it no
      // longer owns"), this call SHOULD still be rejected, because by the
      // time its own writes actually reach Postgres, the run is
      // unambiguously on generation 2, not 1. The gate mechanism as
      // implemented cannot see that: it already captured its (accurate,
      // but now stale) verdict before the reclaim happened, and never
      // re-checks.
      releaseOldWorkerGate();
      const oldWorkerSummary = await oldWorkerPromise;

      const finalRecord = await prisma.semanticTruthRecord.findUniqueOrThrow({ where: { companyId_instrumentKey_kind_semanticObjectId: { companyId: COMPANY_ID, instrumentKey, kind: "RULE", semanticObjectId: sharedRuleId } } });
      const finalAmount = (finalRecord.payload as unknown as IRRule).capacityExpression as unknown as { amount: number };

      // THE FALSIFICATION: the old worker's own gate reported it was NOT
      // superseded (because it captured its read before the reclaim), so it
      // proceeded to write - and its stale content (111) is what a fresh
      // downstream read of "this instrument's current semantic truth" now
      // sees, even though the row's real, live, actually-current owner is
      // gen2 and gen2's own correct content (999) was already durably
      // persisted first.
      expect(oldWorkerSummary.skippedSupersededGeneration).toBe(false); // the gate did NOT catch this - it cannot, by construction
      expect(finalAmount.amount).toBe(111); // the STALE value clobbered the FRESH one
      expect(finalRecord.version).toBeGreaterThan(1); // the clobber registered as a real, version-bumped content change, not a no-op
    } finally {
      (prisma.analysisRun as unknown as { findUnique: typeof prisma.analysisRun.findUnique }).findUnique = originalFindUnique;
    }
  });

  it("REAL, UNMOCKED TIMING RACE (no interception of any kind - genuine Promise.all concurrency against real Postgres): a slow gen1 writer processing many objects still clobbers a fast gen2 writer's fresh content for a shared ruleId", async () => {
    const identity = { companyId: COMPANY_ID, packageKey: "pkg-f6-indep-truth-timing", documentIds: ["doc-x"], analysisAlgorithmVersion: CONTRACT_ANALYSIS_ORCHESTRATOR_VERSION };
    const claim = await startOrResumeAnalysisRun(identity);
    const runId = claim.run.id;
    const gen1 = claim.run.executionGeneration;

    const instrumentKey = "toctou-timing-instrument";
    const sharedRuleId = "toctou-shared-rule-timing";

    // The old (gen1) worker's own call carries a large batch of filler
    // objects (simulating a real instrument with many discovered
    // rules/definitions still being upserted one at a time) with the
    // contested shared ruleId LAST in the list, so its own gate check (which
    // fires once, at the very top of the call, before any of these objects
    // are written) completes almost immediately - genuinely still matching
    // generation 1 - while its writes are still working through the batch
    // for a real, measurable stretch of wall-clock time.
    const FILLER_COUNT = 120;
    const staleShared = makeRule({ ruleId: sharedRuleId, instrumentKey, sourceSectionRef: "9.02", capacityExpression: { kind: "MONEY", type: "MONEY", exprId: "e-stale-timing", amount: 222, currency: "USD" } as unknown as IRRule["capacityExpression"] });
    const oldWorkerObjects = [
      ...Array.from({ length: FILLER_COUNT }, (_, i) => ({ kind: "RULE" as const, object: makeRule({ ruleId: `filler-rule-${i}`, instrumentKey, sourceSectionRef: `filler-${i}` }), candidateRef: `c-filler-${i}`, compilerVersions, verification: null, verifierPromptVersion: null })),
      { kind: "RULE" as const, object: staleShared, candidateRef: "c-stale-timing", compilerVersions, verification: null, verifierPromptVersion: null },
    ];

    const oldWorkerPromise = persistSemanticTruthForInstrument({ companyId: COMPANY_ID, packageKey: identity.packageKey, instrumentKey, analysisRunId: runId, expectedGeneration: gen1, objects: oldWorkerObjects });

    // A short, deliberate delay - long enough for the old worker's OWN gate
    // check (one single findUnique) to have already completed and for its
    // loop to be genuinely underway, but far short of the time needed for
    // it to reach the LAST (shared) object in a 120-object batch.
    await sleep(15);

    const reclaimed = await prisma.analysisRun.update({ where: { id: runId }, data: { executionGeneration: { increment: 1 } } });
    const gen2 = reclaimed.executionGeneration;
    expect(gen2).toBe(gen1 + 1);

    const freshShared = makeRule({ ruleId: sharedRuleId, instrumentKey, sourceSectionRef: "9.02", capacityExpression: { kind: "MONEY", type: "MONEY", exprId: "e-fresh-timing", amount: 888, currency: "USD" } as unknown as IRRule["capacityExpression"] });
    const newWorkerSummary = await persistSemanticTruthForInstrument({ companyId: COMPANY_ID, packageKey: identity.packageKey, instrumentKey, analysisRunId: runId, expectedGeneration: gen2, objects: [{ kind: "RULE", object: freshShared, candidateRef: "c-fresh-timing", compilerVersions, verification: null, verifierPromptVersion: null }] });
    expect(newWorkerSummary.skippedSupersededGeneration).toBe(false);

    const afterNewWorker = await prisma.semanticTruthRecord.findUniqueOrThrow({ where: { companyId_instrumentKey_kind_semanticObjectId: { companyId: COMPANY_ID, instrumentKey, kind: "RULE", semanticObjectId: sharedRuleId } } });
    expect((afterNewWorker.payload as unknown as IRRule).capacityExpression).toMatchObject({ amount: 888 });

    // Now let the old worker's own (still in-flight, real, unmocked) batch
    // finish reaching the shared object.
    const oldWorkerSummary = await oldWorkerPromise;

    const finalRecord = await prisma.semanticTruthRecord.findUniqueOrThrow({ where: { companyId_instrumentKey_kind_semanticObjectId: { companyId: COMPANY_ID, instrumentKey, kind: "RULE", semanticObjectId: sharedRuleId } } });
    const finalAmount = (finalRecord.payload as unknown as IRRule).capacityExpression as unknown as { amount: number };

    expect(oldWorkerSummary.skippedSupersededGeneration).toBe(false);
    // If this assertion ever fails because real scheduling happened to let
    // the old worker's batch finish BEFORE the 15ms delay elapsed, that
    // itself would only narrow the reproduction window - it would not mean
    // the underlying check-then-act gate is safe; see the deterministic
    // reproduction above for a timing-independent proof of the same gap.
    expect(finalAmount.amount).toBe(222);
    expect(finalRecord.version).toBeGreaterThan(1);
  });
});
