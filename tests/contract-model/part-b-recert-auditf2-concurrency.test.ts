/**
 * Phase 3F.1.6.RX Part B - INDEPENDENT recertification of AUDIT-F2 (atomic
 * AnalysisRun concurrency). Written from scratch by the Part B auditor,
 * deliberately NOT copying tests/contract-model/analysis-run-concurrency.test.ts
 * verbatim - a fresh company/identity, a higher concurrency count, a
 * genuinely-concurrent stress test of the STALE-reclaim branch itself
 * (N callers racing to reclaim the SAME abandoned row, not just one caller
 * against a pre-backdated row), and a dedicated investigation of whether
 * reclaiming a "stale" row is actually SAFE against a prior owner that
 * turns out not to have been dead after all (no literature on this in
 * Workstream H's own design/results docs - this is this file's own
 * original contribution).
 *
 * See docs/phase-3f1-6-rx-final-blocker-closure/28-part-b-auditf1-f2-recertification.json
 * for the full disposition writeup this file's results feed into.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import { prisma } from "../../lib/prisma";
import { uploadAndChunkDocument } from "../../lib/onboarding/documents";
import { runContractAnalysis } from "../../lib/contract-model/analysis/orchestrator";
import { startOrResumeAnalysisRun, setAnalysisRunStage, completeAnalysisRun, failAnalysisRun } from "../../lib/contract-model/analysis/service";
import { CONTRACT_ANALYSIS_ORCHESTRATOR_VERSION } from "../../lib/contract-model/analysis/identity";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { SemanticCaller, SemanticCallerResult } from "../../lib/contract-model/compiler/semantic/caller";
import type { SemanticCompilerInput } from "../../lib/contract-model/compiler/semantic/types";
import { SubmitCompilationSchema } from "../../lib/contract-model/compiler/semantic/wire-schema";
import type { AnalyzerCallTelemetry } from "../../lib/contract-model/analyzer/telemetry";

const COMPANY_ID = "part-b-recert-f2-concurrency";

const DOCUMENT_TEXT = `CREDIT AGREEMENT

ARTICLE VI. NEGATIVE COVENANTS

Section 6.05 Investments. The Borrower shall not make any Investment in excess of $2,000,000.
`;

class ScriptedStageCaller implements StageCaller {
  providerName = "test-scripted";
  model = "test-v1";
  isSynthetic = true;
  async call<T>(schema: ZodType<T>): Promise<T> {
    return schema.parse({ rules: [] });
  }
  lastTelemetry(): AnalyzerCallTelemetry | null {
    return null;
  }
}

class NoopSemanticCaller implements SemanticCaller {
  providerName = "test-scripted";
  model = "test-v1";
  isSynthetic = true;
  async compile(_input: SemanticCompilerInput): Promise<SemanticCallerResult> {
    const submission = SubmitCompilationSchema.parse({});
    return { submission, rawSubmission: submission, toolCallLog: [], telemetry: null, failureReason: null, failureDetail: null };
  }
}

function scriptedCallers() {
  return { discoveryCaller: new ScriptedStageCaller(), amendmentCaller: new ScriptedStageCaller(), verificationCaller: new ScriptedStageCaller(), semanticCaller: new NoopSemanticCaller() };
}

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
  await prisma.company.create({ data: { id: COMPANY_ID, name: "Part B recert F2 concurrency co", onboardingStatus: "ONBOARDING" } });
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

describe("Part B independent recertification - AUDIT-F2 atomic AnalysisRun concurrency", () => {
  it("INDEPENDENT REPRODUCTION: 20 genuinely simultaneous callers (fresh Promise.all harness, fresh identity, real Postgres) for the IDENTICAL identity resolve to exactly ONE STARTED", async () => {
    const identity = { companyId: COMPANY_ID, packageKey: "pkg-part-b-recert-20-way", documentIds: ["doc-x"], analysisAlgorithmVersion: CONTRACT_ANALYSIS_ORCHESTRATOR_VERSION };
    const CONCURRENCY = 20;

    const outcomes = await Promise.all(Array.from({ length: CONCURRENCY }, () => startOrResumeAnalysisRun(identity)));
    const started = outcomes.filter((o) => o.kind === "STARTED");
    const already = outcomes.filter((o) => o.kind === "ALREADY_RUNNING");
    expect(started.length).toBe(1);
    expect(already.length).toBe(CONCURRENCY - 1);
    expect(await prisma.analysisRun.count({ where: { companyId: identity.companyId, packageKey: identity.packageKey, analysisAlgorithmVersion: identity.analysisAlgorithmVersion } })).toBe(1);
  });

  it("orchestrator-level independent reproduction: 8 simultaneous runContractAnalysis calls for a fresh document set - exactly one real execution", async () => {
    await uploadAndChunkDocument({ companyId: COMPANY_ID, filename: "f2-recert-orchestrator.txt", data: Buffer.from(DOCUMENT_TEXT, "utf-8"), declaredType: "CREDIT_AGREEMENT" });
    const results = await Promise.all(Array.from({ length: 8 }, () => runContractAnalysis({ companyId: COMPANY_ID }, { callers: scriptedCallers() })));
    expect(results.filter((r) => r.outcome === "STARTED_TO_COMPLETION").length).toBe(1);
    expect(results.filter((r) => r.outcome === "SKIPPED_ALREADY_RUNNING").length).toBe(7);
    expect(await prisma.analysisRun.count({ where: { companyId: COMPANY_ID } })).toBe(1);
  });

  it("STALE-RECLAIM UNDER GENUINE CONCURRENCY: 15 callers racing SIMULTANEOUSLY to reclaim the SAME abandoned (>30min stale) RUNNING row - exactly one reclaims, the rest see it as freshly-claimed and back off", async () => {
    const identity = { companyId: COMPANY_ID, packageKey: "pkg-part-b-recert-stale-race", documentIds: ["doc-x"], analysisAlgorithmVersion: CONTRACT_ANALYSIS_ORCHESTRATOR_VERSION };
    const abandoned = await prisma.analysisRun.create({ data: { ...identity, status: "RUNNING", startedAt: new Date(Date.now() - 90 * 60 * 1000) } });
    await backdateUpdatedAt(abandoned.id, 90); // 90 minutes stale - well past the 30-minute threshold

    const CONCURRENCY = 15;
    const outcomes = await Promise.all(Array.from({ length: CONCURRENCY }, () => startOrResumeAnalysisRun(identity)));
    const started = outcomes.filter((o) => o.kind === "STARTED");
    const already = outcomes.filter((o) => o.kind === "ALREADY_RUNNING");

    // This is the SAME real-Postgres-row-lock CAS guarantee the primary fix
    // provides for the create() branch, now stressed on the updateMany
    // fallback branch specifically - the design docs only ever exercised
    // ONE caller reclaiming a pre-backdated row, never N racing for it.
    expect(started.length).toBe(1);
    expect(already.length).toBe(CONCURRENCY - 1);
    expect(await prisma.analysisRun.count({ where: { companyId: identity.companyId, packageKey: identity.packageKey, analysisAlgorithmVersion: identity.analysisAlgorithmVersion } })).toBe(1);
    for (const o of already) expect(o.run.id).toBe(abandoned.id);
  });

  it("a run abandoned for a VERY long time (24 hours) is still cleanly reclaimable - confirms the row can never become permanently stuck regardless of how long it has been abandoned", async () => {
    const identity = { companyId: COMPANY_ID, packageKey: "pkg-part-b-recert-very-stale", documentIds: ["doc-x"], analysisAlgorithmVersion: CONTRACT_ANALYSIS_ORCHESTRATOR_VERSION };
    const abandoned = await prisma.analysisRun.create({ data: { ...identity, status: "RUNNING", startedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) } });
    await backdateUpdatedAt(abandoned.id, 24 * 60);

    const outcome = await startOrResumeAnalysisRun(identity);
    expect(outcome.kind).toBe("STARTED");
    expect(outcome.run.id).toBe(abandoned.id);
    expect(outcome.run.status).toBe("RUNNING");
  });

  it("boundary check: a row exactly at (just under) the 30-minute threshold is NOT reclaimed - only a genuinely-older row is", async () => {
    const identity = { companyId: COMPANY_ID, packageKey: "pkg-part-b-recert-boundary", documentIds: ["doc-x"], analysisAlgorithmVersion: CONTRACT_ANALYSIS_ORCHESTRATOR_VERSION };
    const run = await prisma.analysisRun.create({ data: { ...identity, status: "RUNNING", startedAt: new Date(Date.now() - 29 * 60 * 1000) } });
    await backdateUpdatedAt(run.id, 29); // 29 minutes - inside the 30-minute window, must NOT be treated as stale

    const outcome = await startOrResumeAnalysisRun(identity);
    expect(outcome.kind).toBe("ALREADY_RUNNING");
    expect(outcome.run.id).toBe(run.id);
  });

  it("NO RACE WINDOW between create() and the updateMany fallback: mixed concurrency where some callers race the create() branch and others (after the row already exists) race the updateMany branch never produces more than one winner", async () => {
    const identity = { companyId: COMPANY_ID, packageKey: "pkg-part-b-recert-mixed-race", documentIds: ["doc-x"], analysisAlgorithmVersion: CONTRACT_ANALYSIS_ORCHESTRATOR_VERSION };

    // Two full waves of concurrent racing against the SAME identity, back
    // to back: wave 1 exercises the create()-vs-create() race (brand new
    // identity, nothing exists yet); wave 2 (fired immediately after,
    // without awaiting any settling) exercises callers landing on the
    // create() branch (which will fail with P2002 since wave 1 already
    // created the row) racing AGAINST callers from wave 1 that are still
    // in-flight on their own updateMany fallback - a genuine mix of both
    // code paths racing at once, real Postgres, no artificial serialization
    // point between the two waves.
    const wave1 = Array.from({ length: 10 }, () => startOrResumeAnalysisRun(identity));
    const wave2 = Array.from({ length: 10 }, () => startOrResumeAnalysisRun(identity));
    const outcomes = await Promise.all([...wave1, ...wave2]);

    const started = outcomes.filter((o) => o.kind === "STARTED");
    expect(started.length).toBe(1); // never more than one winner regardless of which code path each caller happened to land on
    expect(await prisma.analysisRun.count({ where: { companyId: identity.companyId, packageKey: identity.packageKey, analysisAlgorithmVersion: identity.analysisAlgorithmVersion } })).toBe(1);
  });

  it("FINDING-6 FIX VERIFIED - ZOMBIE WRITER: after a stale row is reclaimed by a NEW caller, the OLD (presumed-dead) owner's later writes to the SAME runId are now rejected/no-op (executionGeneration fencing) - the new owner alone controls the final run state", async () => {
    const identity = { companyId: COMPANY_ID, packageKey: "pkg-part-b-recert-zombie-writer", documentIds: ["doc-x"], analysisAlgorithmVersion: CONTRACT_ANALYSIS_ORCHESTRATOR_VERSION };

    // Step 1: the "old worker" starts a real run and holds generation 1.
    const oldWorkerOutcome = await startOrResumeAnalysisRun(identity);
    expect(oldWorkerOutcome.kind).toBe("STARTED");
    const runId = oldWorkerOutcome.run.id;
    const oldWorkerGeneration = oldWorkerOutcome.run.executionGeneration;
    expect(oldWorkerGeneration).toBe(1);
    expect(await setAnalysisRunStage(runId, "PER_INSTRUMENT_ANALYSIS", oldWorkerGeneration)).toBe(true);

    // Step 2: the old worker goes silent for >30 minutes WITHOUT crashing -
    // a fully realistic scenario for a single stage covering many
    // instruments/large real LLM latency (this codebase's own documented
    // rationale for the 30-minute threshold explicitly assumes this never
    // happens - "comfortably longer than any single real analysis run this
    // codebase's own scripted/E2E timing has ever observed" - but that is
    // an empirical observation about THIS codebase's current test fixtures,
    // not a structural guarantee about real production document volumes).
    await backdateUpdatedAt(runId, 45);

    // Step 3: a legitimate new trigger (a user re-clicking "run analysis",
    // or a scheduled retry) correctly reclaims the SAME row per the
    // documented stale-reclaim contract, and is minted a NEW, strictly
    // greater generation as part of that SAME atomic reclaim statement.
    const newWorkerOutcome = await startOrResumeAnalysisRun(identity);
    expect(newWorkerOutcome.kind).toBe("STARTED");
    expect(newWorkerOutcome.run.id).toBe(runId); // same row - this IS the documented, intended behavior
    const newWorkerGeneration = newWorkerOutcome.run.executionGeneration;
    expect(newWorkerGeneration).toBeGreaterThan(oldWorkerGeneration);
    const afterReclaim = await prisma.analysisRun.findUniqueOrThrow({ where: { id: runId } });
    expect(afterReclaim.status).toBe("RUNNING");
    expect(afterReclaim.currentStage).toBe("INGESTION"); // reset by the new worker's own claim
    expect(afterReclaim.executionGeneration).toBe(newWorkerGeneration);

    // Step 4: the new worker makes real progress, presenting its OWN
    // (current) generation - this applies normally.
    expect(await setAnalysisRunStage(runId, "STRUCTURAL_ANALYSIS", newWorkerGeneration)).toBe(true);

    // Step 5: the old worker was never actually dead. It was merely slow.
    // Unaware that ownership was reassigned (startOrResumeAnalysisRun never
    // told it, and it never re-checks), it now finishes its own (stale)
    // view of the PER_INSTRUMENT_ANALYSIS stage and calls completeAnalysisRun
    // with ITS OWN runId reference AND its own (now-superseded) generation -
    // THE FIX: this is no longer unconditional. The atomic
    // `updateMany({ where: { id, executionGeneration: oldWorkerGeneration } })`
    // matches zero rows (the row's real executionGeneration is now
    // newWorkerGeneration), so the write does not apply and `null` is
    // returned instead of a clobbered row.
    const oldWorkerCompleteResult = await completeAnalysisRun(runId, { openReviewItemCount: 0, hadInstrumentFailures: false }, oldWorkerGeneration);
    expect(oldWorkerCompleteResult).toBeNull();

    // The new owner's live, in-progress state is COMPLETELY UNTOUCHED by the
    // old worker's rejected write - still RUNNING, still at the new worker's
    // own real stage, never silently flipped to COMPLETED.
    const rowAfterOldWorkerAttempt = await prisma.analysisRun.findUniqueOrThrow({ where: { id: runId } });
    expect(rowAfterOldWorkerAttempt.status).toBe("RUNNING");
    expect(rowAfterOldWorkerAttempt.currentStage).toBe("STRUCTURAL_ANALYSIS");
    expect(rowAfterOldWorkerAttempt.executionGeneration).toBe(newWorkerGeneration);

    // The old worker's OWN stage-update attempts are likewise rejected/no-op
    // once superseded - not just its completion call.
    expect(await setAnalysisRunStage(runId, "PACKAGE_RELATIONSHIPS", oldWorkerGeneration)).toBe(false);
    const oldWorkerFailResult = await failAnalysisRun(runId, { stage: "PER_INSTRUMENT_ANALYSIS", message: "a real error the OLD worker hit, long after losing ownership", errorClass: "Error" }, oldWorkerGeneration);
    expect(oldWorkerFailResult).toBeNull();
    const rowAfterOldWorkerFailAttempt = await prisma.analysisRun.findUniqueOrThrow({ where: { id: runId } });
    expect(rowAfterOldWorkerFailAttempt.status).toBe("RUNNING"); // still untouched by the old worker

    // Meanwhile the NEW worker's own writes, presenting its own real,
    // current generation, continue to apply normally end to end - fencing
    // rejects only the SUPERSEDED caller, never the legitimate current owner.
    const newWorkerCompleteResult = await completeAnalysisRun(runId, { openReviewItemCount: 0, hadInstrumentFailures: false }, newWorkerGeneration);
    expect(newWorkerCompleteResult).not.toBeNull();
    expect(newWorkerCompleteResult!.status).toBe("COMPLETED");
    const finalRow = await prisma.analysisRun.findUniqueOrThrow({ where: { id: runId } });
    expect(finalRow.status).toBe("COMPLETED"); // the NEW owner alone controls the final state, unconditionally
    expect(finalRow.executionGeneration).toBe(newWorkerGeneration); // unchanged by completion - generation only ever moves on a fresh claim/reclaim

    // A final zombie write attempt, even AFTER the new worker's own genuine
    // completion, still correctly fails closed.
    const lateZombieAttempt = await completeAnalysisRun(runId, { openReviewItemCount: 999, hadInstrumentFailures: true }, oldWorkerGeneration);
    expect(lateZombieAttempt).toBeNull();
    expect((await prisma.analysisRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe("COMPLETED");

    // CONCLUSION: FINDING-6 is closed. startOrResumeAnalysisRun's own atomic
    // CAS was always correct at claim time (AUDIT-F2's own literal charter,
    // reconfirmed by this file's earlier tests); the NEW executionGeneration
    // fencing on setAnalysisRunStage/completeAnalysisRun/failAnalysisRun now
    // ALSO closes the later reclaim-then-original-owner-still-writes window
    // this test originally reproduced as a genuine defect - every one of the
    // old (superseded) worker's writes above was rejected/no-op, and the new
    // owner alone ever controlled the run's real, final, persisted state.
  });

  it("FINDING-6 regression check - ORDINARY single-owner run: a normal (non-zombie) claim, stage progression, and completion all apply exactly as before generation fencing was added", async () => {
    const identity = { companyId: COMPANY_ID, packageKey: "pkg-part-b-recert-ordinary-single-owner", documentIds: ["doc-x"], analysisAlgorithmVersion: CONTRACT_ANALYSIS_ORCHESTRATOR_VERSION };

    const outcome = await startOrResumeAnalysisRun(identity);
    expect(outcome.kind).toBe("STARTED");
    const runId = outcome.run.id;
    const generation = outcome.run.executionGeneration;
    expect(generation).toBe(1); // a brand-new row's own schema default - never bumped by create()

    for (const stage of ["INGESTION", "STRUCTURAL_ANALYSIS", "STRUCTURAL_PERSISTENCE", "PACKAGE_RELATIONSHIPS", "PER_INSTRUMENT_ANALYSIS", "REVIEW_PERSISTENCE"]) {
      expect(await setAnalysisRunStage(runId, stage, generation)).toBe(true);
      expect((await prisma.analysisRun.findUniqueOrThrow({ where: { id: runId } })).currentStage).toBe(stage);
    }

    const completeResult = await completeAnalysisRun(runId, { openReviewItemCount: 2, hadInstrumentFailures: false }, generation);
    expect(completeResult).not.toBeNull();
    expect(completeResult!.status).toBe("COMPLETED_WITH_REVIEW");
    expect(completeResult!.reviewItemCount).toBe(2);
    expect(completeResult!.executionGeneration).toBe(generation); // never bumped by an ordinary completion, only by a fresh claim/reclaim

    // A second, independent identity's own ordinary FAILED path also applies normally.
    const identity2 = { companyId: COMPANY_ID, packageKey: "pkg-part-b-recert-ordinary-single-owner-fail", documentIds: ["doc-y"], analysisAlgorithmVersion: CONTRACT_ANALYSIS_ORCHESTRATOR_VERSION };
    const outcome2 = await startOrResumeAnalysisRun(identity2);
    expect(outcome2.kind).toBe("STARTED");
    const failResult = await failAnalysisRun(outcome2.run.id, { stage: "STRUCTURAL_ANALYSIS", message: "an ordinary real failure", errorClass: "Error" }, outcome2.run.executionGeneration);
    expect(failResult).not.toBeNull();
    expect(failResult!.status).toBe("FAILED");
  });
});
