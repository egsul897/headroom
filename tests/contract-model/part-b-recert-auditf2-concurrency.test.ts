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

  it("PRODUCTION RISK - ZOMBIE WRITER: after a stale row is reclaimed by a NEW caller, the OLD (presumed-dead) owner can still successfully write to the SAME runId and silently overwrite the new owner's live state - there is no fencing/lease-generation token distinguishing 'this write comes from the owner that currently holds the claim' from 'this write comes from whoever last held any reference to this row id'", async () => {
    const identity = { companyId: COMPANY_ID, packageKey: "pkg-part-b-recert-zombie-writer", documentIds: ["doc-x"], analysisAlgorithmVersion: CONTRACT_ANALYSIS_ORCHESTRATOR_VERSION };

    // Step 1: the "old worker" starts a real run.
    const oldWorkerOutcome = await startOrResumeAnalysisRun(identity);
    expect(oldWorkerOutcome.kind).toBe("STARTED");
    const runId = oldWorkerOutcome.run.id;
    await setAnalysisRunStage(runId, "PER_INSTRUMENT_ANALYSIS");

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
    // documented stale-reclaim contract.
    const newWorkerOutcome = await startOrResumeAnalysisRun(identity);
    expect(newWorkerOutcome.kind).toBe("STARTED");
    expect(newWorkerOutcome.run.id).toBe(runId); // same row - this IS the documented, intended behavior
    const afterReclaim = await prisma.analysisRun.findUniqueOrThrow({ where: { id: runId } });
    expect(afterReclaim.status).toBe("RUNNING");
    expect(afterReclaim.currentStage).toBe("INGESTION"); // reset by the new worker's own claim

    // Step 4: the new worker makes real progress.
    await setAnalysisRunStage(runId, "STRUCTURAL_ANALYSIS");

    // Step 5: THE DEFECT - the old worker was never actually dead. It was
    // merely slow. Unaware that ownership was reassigned (startOrResumeAnalysisRun
    // never told it, and it never re-checks), it now finishes its own
    // (stale) view of the PER_INSTRUMENT_ANALYSIS stage and calls
    // completeAnalysisRun with ITS OWN runId reference - the identical id
    // the new worker is also using, since reclaiming a row never mints a
    // new id or any other fencing token the old worker's calls would fail
    // against.
    const oldWorkerFinalState = await completeAnalysisRun(runId, { openReviewItemCount: 0, hadInstrumentFailures: false });

    // The old worker's completion call SUCCEEDED and silently clobbered the
    // new worker's live, in-progress run: the row now reads COMPLETED even
    // though the new worker is still only at STRUCTURAL_ANALYSIS and has
    // not itself finished (or even reached the review-persistence stage).
    expect(oldWorkerFinalState.status).toBe("COMPLETED");
    expect(oldWorkerFinalState.currentStage).toBe("COMPLETE");
    const rowAfterOldWorkerWrite = await prisma.analysisRun.findUniqueOrThrow({ where: { id: runId } });
    expect(rowAfterOldWorkerWrite.status).toBe("COMPLETED"); // wrong: the new worker's real execution is still in flight

    // Worse: the new worker, still running and unaware its run was just
    // marked COMPLETED behind its back, continues and eventually calls
    // failAnalysisRun itself (e.g. it hits a real error later in its own
    // execution) - this ALSO succeeds unconditionally, silently overwriting
    // the old worker's premature COMPLETED status with FAILED, even though
    // by then a THIRD, even-later trigger may have already reclaimed and
    // relied on the (incorrect) COMPLETED status in between. Whichever
    // caller writes last wins, with zero coordination - the exact class of
    // uncoordinated concurrent write AUDIT-F2's own claimed fix ("downstream
    // state is not double-written") was supposed to close, reappearing here
    // via the reclaim path rather than the initial-claim path.
    const newWorkerLateFailure = await failAnalysisRun(runId, { stage: "PER_INSTRUMENT_ANALYSIS", message: "a real error the new worker hit", errorClass: "Error" });
    expect(newWorkerLateFailure.status).toBe("FAILED");
    const finalRow = await prisma.analysisRun.findUniqueOrThrow({ where: { id: runId } });
    expect(finalRow.status).toBe("FAILED"); // final state is whichever writer happened to run last - not a function of who actually still legitimately owns the run

    // CONCLUSION: startOrResumeAnalysisRun's own atomic CAS genuinely
    // prevents two callers from BOTH observing {kind: "STARTED"} at claim
    // time (the literal defect AUDIT-F2 targeted, and this file's own
    // earlier tests independently reconfirm it is closed). It does NOT
    // prevent a stale-but-not-actually-dead prior owner from continuing to
    // mutate the SAME run row after a new owner has reclaimed it, because
    // setAnalysisRunStage/completeAnalysisRun/failAnalysisRun all write by
    // bare `runId` alone with no compare-and-swap against a claim
    // generation/lease token minted at claim time. This is a genuine,
    // reproducible residual defect in the concurrency design, distinct from
    // (and not covered by) the literal claim-time race the fix addresses.
  });
});
