/**
 * Phase 3F.1.6.RX Workstream H (AUDIT-F2 - atomic AnalysisRun concurrency).
 * Proves lib/contract-model/analysis/service.ts's startOrResumeAnalysisRun
 * really is atomic under GENUINE concurrent racing (Promise.all, real
 * Postgres) - not merely correct when one caller finds a pre-existing
 * RUNNING row created before it (that older test scenario cannot expose
 * the findUnique->upsert race this fix actually closes; see
 * docs/phase-3f1-6-rx-final-blocker-closure/11-analysis-run-concurrency-design.json).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import { prisma } from "../../lib/prisma";
import { uploadAndChunkDocument } from "../../lib/onboarding/documents";
import { runContractAnalysis } from "../../lib/contract-model/analysis/orchestrator";
import { startOrResumeAnalysisRun } from "../../lib/contract-model/analysis/service";
import { CONTRACT_ANALYSIS_ORCHESTRATOR_VERSION } from "../../lib/contract-model/analysis/identity";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { SemanticCaller, SemanticCallerResult } from "../../lib/contract-model/compiler/semantic/caller";
import type { SemanticCompilerInput } from "../../lib/contract-model/compiler/semantic/types";
import { SubmitCompilationSchema } from "../../lib/contract-model/compiler/semantic/wire-schema";
import type { AnalyzerCallTelemetry } from "../../lib/contract-model/analyzer/telemetry";

const COMPANY_ID = "analysis-run-concurrency-test";

const DOCUMENT_TEXT = `CREDIT AGREEMENT

ARTICLE VI. NEGATIVE COVENANTS

Section 6.01 Liens. The Borrower shall not create or suffer to exist any Lien on any property in an aggregate amount in excess of $4,000,000.
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
  await prisma.company.create({ data: { id: COMPANY_ID, name: "Analysis run concurrency test co", onboardingStatus: "ONBOARDING" } });
});

afterAll(async () => {
  await cleanupCompanyState();
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
});

beforeEach(async () => {
  await cleanupCompanyState();
});

describe("startOrResumeAnalysisRun atomicity (AUDIT-F2)", () => {
  it("service-level: N genuinely simultaneous callers (Promise.all, real Postgres) for the IDENTICAL identity resolve to exactly ONE STARTED and the rest ALREADY_RUNNING - never more than one STARTED", async () => {
    const identity = { companyId: COMPANY_ID, packageKey: "pkg-concurrency-service-level", documentIds: ["doc-1"], analysisAlgorithmVersion: CONTRACT_ANALYSIS_ORCHESTRATOR_VERSION };
    const CONCURRENCY = 12;

    const outcomes = await Promise.all(Array.from({ length: CONCURRENCY }, () => startOrResumeAnalysisRun(identity)));

    const started = outcomes.filter((o) => o.kind === "STARTED");
    const alreadyRunning = outcomes.filter((o) => o.kind === "ALREADY_RUNNING");
    expect(started.length).toBe(1);
    expect(alreadyRunning.length).toBe(CONCURRENCY - 1);

    // Exactly one row was ever created for this identity - the original
    // findUnique->upsert sequence's own real defect (both concurrent
    // callers' upserts would each report STARTED for the SAME row, since
    // Prisma's upsert compiles to INSERT ... ON CONFLICT DO UPDATE, which
    // never fails on a conflict) is what this count would fail to catch if
    // the fix were not real - this assertion is deliberately not the only
    // one in this test.
    expect(await prisma.analysisRun.count({ where: { companyId: identity.companyId, packageKey: identity.packageKey, analysisAlgorithmVersion: identity.analysisAlgorithmVersion } })).toBe(1);

    // Every ALREADY_RUNNING outcome's own `run` is the SAME row the one STARTED caller owns.
    const startedRunId = started[0]!.run.id;
    for (const o of alreadyRunning) expect(o.run.id).toBe(startedRunId);
  });

  it("orchestrator-level: N genuinely simultaneous runContractAnalysis calls for the SAME company/document set - exactly one executes the real pipeline, the rest are skipped without double-writing downstream state", async () => {
    await uploadAndChunkDocument({ companyId: COMPANY_ID, filename: "concurrency-orchestrator.txt", data: Buffer.from(DOCUMENT_TEXT, "utf-8"), declaredType: "CREDIT_AGREEMENT" });
    const CONCURRENCY = 6;

    const results = await Promise.all(Array.from({ length: CONCURRENCY }, () => runContractAnalysis({ companyId: COMPANY_ID }, { callers: scriptedCallers() })));

    const completed = results.filter((r) => r.outcome === "STARTED_TO_COMPLETION");
    const skipped = results.filter((r) => r.outcome === "SKIPPED_ALREADY_RUNNING");
    // At least one caller must actually own and complete the run; every
    // other concurrent caller must be skipped, never a second independent
    // execution of the real pipeline for the identical identity.
    expect(completed.length).toBe(1);
    expect(skipped.length).toBe(CONCURRENCY - 1);

    // Real Postgres proof: exactly one AnalysisRun row exists for this identity - never duplicated.
    expect(await prisma.analysisRun.count({ where: { companyId: COMPANY_ID } })).toBe(1);
    // Downstream review state was never double-written either - the real
    // review-item count matches what the ONE real execution actually
    // produced, not N times that (which double-writing would risk).
    const finalRun = await prisma.analysisRun.findFirstOrThrow({ where: { companyId: COMPANY_ID } });
    const claimCount = await prisma.claimReviewItem.count({ where: { companyId: COMPANY_ID } });
    expect(finalRun.reviewItemCount).toBe(claimCount);
  });

  it("a STALE RUNNING row (older than the documented 30-minute threshold) is safely reclaimed and rerun - a genuinely abandoned run is never stuck RUNNING forever", async () => {
    const identity = { companyId: COMPANY_ID, packageKey: "pkg-stale-reclaim", documentIds: ["doc-1"], analysisAlgorithmVersion: CONTRACT_ANALYSIS_ORCHESTRATOR_VERSION };
    const staleRun = await prisma.analysisRun.create({ data: { ...identity, status: "RUNNING", startedAt: new Date(Date.now() - 60 * 60 * 1000) } });
    // Backdate updatedAt directly via raw SQL - Prisma's own `@updatedAt`
    // auto-management would otherwise overwrite any value passed through
    // its normal client API, so this is the one legitimate way to simulate
    // "a row that has genuinely been RUNNING for over an hour" in a test.
    await prisma.$executeRaw`UPDATE analysis_runs SET "updatedAt" = NOW() - INTERVAL '60 minutes' WHERE id = ${staleRun.id}`;

    const outcome = await startOrResumeAnalysisRun(identity);
    expect(outcome.kind).toBe("STARTED");
    expect(outcome.run.id).toBe(staleRun.id); // reclaimed the SAME row, not a duplicate
    expect(outcome.run.status).toBe("RUNNING");
    expect(await prisma.analysisRun.count({ where: { companyId: identity.companyId, packageKey: identity.packageKey, analysisAlgorithmVersion: identity.analysisAlgorithmVersion } })).toBe(1);
  });

  it("a FRESH RUNNING row (within the threshold) is NOT reclaimed - only a genuinely abandoned run is safe to re-enter", async () => {
    const identity = { companyId: COMPANY_ID, packageKey: "pkg-fresh-running", documentIds: ["doc-1"], analysisAlgorithmVersion: CONTRACT_ANALYSIS_ORCHESTRATOR_VERSION };
    const freshRun = await prisma.analysisRun.create({ data: { ...identity, status: "RUNNING", startedAt: new Date() } });

    const outcome = await startOrResumeAnalysisRun(identity);
    expect(outcome.kind).toBe("ALREADY_RUNNING");
    expect(outcome.run.id).toBe(freshRun.id);
    expect(await prisma.analysisRun.count({ where: { companyId: identity.companyId, packageKey: identity.packageKey, analysisAlgorithmVersion: identity.analysisAlgorithmVersion } })).toBe(1);
  });

  it("re-entering an existing (non-RUNNING) row clears any stale AnalysisRunIssue rows from a prior attempt", async () => {
    const identity = { companyId: COMPANY_ID, packageKey: "pkg-clears-issues", documentIds: ["doc-1"], analysisAlgorithmVersion: CONTRACT_ANALYSIS_ORCHESTRATOR_VERSION };
    const priorRun = await prisma.analysisRun.create({ data: { ...identity, status: "PARTIAL", startedAt: new Date(), completedAt: new Date() } });
    await prisma.analysisRunIssue.create({ data: { runId: priorRun.id, companyId: COMPANY_ID, instrumentKey: "instrument:doc-1", documentIds: ["doc-1"], failedStage: "PER_INSTRUMENT_ANALYSIS", errorClass: "Error", message: "prior attempt's failure" } });

    const outcome = await startOrResumeAnalysisRun(identity);
    expect(outcome.kind).toBe("STARTED");
    expect(outcome.run.id).toBe(priorRun.id);
    expect(await prisma.analysisRunIssue.count({ where: { runId: priorRun.id } })).toBe(0);
  });
});
