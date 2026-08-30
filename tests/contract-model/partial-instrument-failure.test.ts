/**
 * Phase 3F.1.6.RX Workstream H (AUDIT-F3 - partial instrument failure
 * durability). Proves that when the orchestrator processes multiple
 * instruments and ONE throws an unexpected, unhandled exception mid-
 * pipeline while others succeed, the failure becomes durable, visible trust
 * state (AnalysisRunIssue + AnalysisRun.status = PARTIAL) - never only an
 * in-memory array, per the NO_SILENT_MATERIAL_FAILURE invariant.
 *
 * INJECTION METHOD: every REAL analytical stage in this pipeline
 * (discovery/compilation/verification) already has its OWN internal
 * per-section/per-candidate fault isolation (empirically confirmed while
 * building this test - a thrown discoveryCaller/semanticCaller exception is
 * caught internally and degrades to a reduced/empty result, never
 * propagating to the orchestrator's own per-instrument boundary). This is a
 * GOOD property of those modules, not a gap - but it means a genuinely
 * uncaught, unexpected exception reaching THIS workstream's own per-
 * instrument catch (lib/contract-model/analysis/orchestrator.ts's
 * analyzeInstrument, called from runContractAnalysis's own per-instrument
 * loop) realistically comes from something in the composition layer itself
 * failing - e.g. a transient error while persisting semantic-truth state
 * (AUDIT-F1's own new persistence step, lib/contract-model/analysis/
 * semantic-truth/service.ts's persistSemanticTruthForInstrument, which has
 * no internal per-candidate fault isolation of its own by design - a real
 * failure there IS a genuine instrument-level failure, not a per-claim one).
 * This test simulates exactly that failure mode via `vi.mock` on that one
 * module (a standard, legitimate testing technique - no production code is
 * changed or weakened to make this test possible), for ONE specific,
 * document-identified instrument only, while every other instrument's real,
 * unmodified persistence path runs unmocked.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ZodType } from "zod";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { SemanticCaller, SemanticCallerResult } from "../../lib/contract-model/compiler/semantic/caller";
import type { SemanticCompilerInput } from "../../lib/contract-model/compiler/semantic/types";

const FAILING_MARKER = "MARKER-INSTRUMENT-B-SHOULD-FAIL";

vi.mock("../../lib/contract-model/analysis/semantic-truth/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/contract-model/analysis/semantic-truth/service")>();
  return {
    ...actual,
    persistSemanticTruthForInstrument: vi.fn(async (input: Parameters<typeof actual.persistSemanticTruthForInstrument>[0]) => {
      const g = globalThis as { __FAILING_DOC_ID__?: string; __FAIL_ALL__?: boolean };
      const touchesFailingDoc = g.__FAIL_ALL__ === true || input.objects.some((o) => o.object.sourceDocumentId === g.__FAILING_DOC_ID__);
      if (touchesFailingDoc) throw new Error(`INJECTED (test-only): simulated persistence failure for ${FAILING_MARKER}`);
      return actual.persistSemanticTruthForInstrument(input);
    }),
  };
});

const { prisma } = await import("../../lib/prisma");
const { uploadAndChunkDocument } = await import("../../lib/onboarding/documents");
const { runContractAnalysis } = await import("../../lib/contract-model/analysis/orchestrator");
const { getAnalysisRunIssues } = await import("../../lib/contract-model/analysis/service");
const wireSchemaMod = await import("../../lib/contract-model/compiler/semantic/wire-schema");

const COMPANY_ID = "partial-instrument-failure-test";

const TEXT_A = `CREDIT AGREEMENT

ARTICLE VI. NEGATIVE COVENANTS

Section 6.01 Indebtedness. The Borrower shall not create Indebtedness in excess of $8,000,000.
`;
const TEXT_B = `CREDIT AGREEMENT

ARTICLE VI. NEGATIVE COVENANTS

Section 6.01 Liens. The Borrower shall not create Liens in excess of $6,000,000.
`;

class ScriptedStageCaller implements StageCaller {
  providerName = "test-scripted";
  model = "test-v1";
  isSynthetic = true;
  constructor(private readonly respond: (stage: string, content: string) => unknown = () => ({})) {}
  async call<T>(schema: ZodType<T>, stage: string, _systemPrompt: string, content: string): Promise<T> {
    return schema.parse(this.respond(stage, content));
  }
  lastTelemetry() {
    return null;
  }
}

class ScriptedSemanticCaller implements SemanticCaller {
  providerName = "test-scripted";
  model = "test-v1";
  isSynthetic = true;
  constructor(private readonly respond: (input: SemanticCompilerInput) => unknown = () => ({})) {}
  async compile(input: SemanticCompilerInput): Promise<SemanticCallerResult> {
    const submission = wireSchemaMod.SubmitCompilationSchema.parse(this.respond(input));
    return { submission, rawSubmission: submission, toolCallLog: [], telemetry: null, failureReason: null, failureDetail: null };
  }
}

/** Both A's and B's own single covenant are scripted to be discovered + compiled - each instrument produces real semantic-truth objects, so the injected failure is genuinely about PERSISTING them, not about upstream discovery/compilation finding nothing. */
function discoveryScript(_stage: string, content: string): unknown {
  if (content.includes("Indebtedness") || content.includes("Liens")) {
    return { rules: [{ relativeRef: "", families: content.includes("Indebtedness") ? ["INDEBTEDNESS"] : ["LIENS"], role: "BASKET", description: "basket", multipleRulesLikely: false, definedTermDependencyLikely: false, confidence: 0.9, needsReview: false }] };
  }
  return { rules: [] };
}

function semanticCompileScript(input: SemanticCompilerInput): unknown {
  const isA = input.operativeSourceText.includes("8,000,000");
  return {
    rules: [
      {
        localRef: "r1",
        sourceSectionRef: "6.01",
        covenantFamily: isA ? "INDEBTEDNESS" : "LIENS",
        ruleType: "QUANTITATIVE_PERMISSION",
        posture: "PERMISSION",
        action: isA ? "INCUR_DEBT" : "GRANT_LIEN",
        entityScope: [],
        capacityExpression: { kind: "MONEY", amount: isA ? 8_000_000 : 6_000_000, currency: "USD" },
        sufficiency: "COMPLETE",
        citation: `${input.sourceDocumentId}::6.01`,
        excerpt: isA ? "Indebtedness in excess of $8,000,000" : "Liens in excess of $6,000,000",
      },
    ],
  };
}

function scriptedCallers() {
  return { discoveryCaller: new ScriptedStageCaller(discoveryScript), amendmentCaller: new ScriptedStageCaller(), verificationCaller: new ScriptedStageCaller(), semanticCaller: new ScriptedSemanticCaller(semanticCompileScript) };
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
  await prisma.company.create({ data: { id: COMPANY_ID, name: "Partial instrument failure test co", onboardingStatus: "ONBOARDING" } });
});

afterAll(async () => {
  await cleanupCompanyState();
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
  delete (globalThis as { __FAILING_DOC_ID__?: string }).__FAILING_DOC_ID__;
});

beforeEach(async () => {
  await cleanupCompanyState();
});

describe("partial instrument failure durability (AUDIT-F3)", () => {
  it("instrument A succeeds, instrument B throws mid-pipeline: A's trusted state persists, B's failure is durable, AnalysisRun cannot read as fully-clean success", async () => {
    const { document: docA } = await uploadAndChunkDocument({ companyId: COMPANY_ID, filename: "partial-failure-a.txt", data: Buffer.from(TEXT_A, "utf-8"), declaredType: "CREDIT_AGREEMENT" });
    const { document: docB } = await uploadAndChunkDocument({ companyId: COMPANY_ID, filename: "partial-failure-b.txt", data: Buffer.from(TEXT_B, "utf-8"), declaredType: "CREDIT_AGREEMENT" });
    (globalThis as { __FAILING_DOC_ID__?: string }).__FAILING_DOC_ID__ = docB.id;

    const result = await runContractAnalysis({ companyId: COMPANY_ID }, { callers: scriptedCallers() });

    // The run still reaches STARTED_TO_COMPLETION (it is not a total,
    // whole-run FAILED - A's real success must not be discarded), but its
    // OWN status is PARTIAL, never a clean COMPLETED/COMPLETED_WITH_REVIEW -
    // "did every instrument's analysis finish" must be answerable from
    // status alone.
    expect(result.outcome).toBe("STARTED_TO_COMPLETION");
    expect(result.status).toBe("PARTIAL");
    expect(result.instruments.length).toBe(1); // only A's outcome is in the in-memory success list
    expect(result.instrumentFailures.length).toBe(1);
    expect(result.instrumentFailures[0]!.message).toContain(FAILING_MARKER);

    // --- Reload from Postgres (never trust the in-memory result alone) ---
    const persistedRun = await prisma.analysisRun.findUniqueOrThrow({ where: { id: result.runId! } });
    expect(persistedRun.status).toBe("PARTIAL");

    // A's trusted semantic state exists and is real.
    const aInstrumentKey = result.instruments[0]!.instrumentKey;
    const aRecords = await prisma.semanticTruthRecord.findMany({ where: { companyId: COMPANY_ID, instrumentKey: aInstrumentKey } });
    expect(aRecords.length).toBeGreaterThanOrEqual(1);
    expect(aRecords[0]!.sourceDocumentId).toBe(docA.id);

    // B's failure exists as a durable AnalysisRunIssue row - not just in the in-memory result.
    const issues = await getAnalysisRunIssues(result.runId!);
    expect(issues.length).toBe(1);
    expect(issues[0]!.documentIds).toContain(docB.id);
    expect(issues[0]!.errorClass).toBe("Error");
    expect(issues[0]!.message).toContain(FAILING_MARKER);
    expect(issues[0]!.failedStage).toBe("PER_INSTRUMENT_ANALYSIS");

    // B produced NO semantic-truth rows at all (the injected failure happened before persistence completed for B).
    const bInstrumentKey = `instrument:${docB.id}`;
    expect(await prisma.semanticTruthRecord.count({ where: { companyId: COMPANY_ID, instrumentKey: bInstrumentKey } })).toBe(0);

    // --- Retry semantics: B alone gets reprocessed by simply re-triggering the same (idempotent) analysis, once the transient failure clears ---
    delete (globalThis as { __FAILING_DOC_ID__?: string }).__FAILING_DOC_ID__;
    const retryResult = await runContractAnalysis({ companyId: COMPANY_ID }, { callers: scriptedCallers() });
    expect(retryResult.runId).toBe(result.runId); // SAME row reclaimed, not a new run
    expect(retryResult.outcome).toBe("STARTED_TO_COMPLETION");
    expect(retryResult.status).not.toBe("PARTIAL"); // B succeeded this time - no longer partial
    expect(retryResult.instruments.length).toBe(2); // both A and B now present

    // The stale AnalysisRunIssue from the FIRST attempt is cleared - never left behind once resolved.
    expect(await getAnalysisRunIssues(result.runId!)).toHaveLength(0);
    // B's trusted state now exists too.
    expect(await prisma.semanticTruthRecord.count({ where: { companyId: COMPANY_ID, instrumentKey: bInstrumentKey } })).toBeGreaterThanOrEqual(1);
    // A's state from the FIRST attempt is untouched/still present (never lost across the retry).
    expect(await prisma.semanticTruthRecord.count({ where: { companyId: COMPANY_ID, instrumentKey: aInstrumentKey } })).toBeGreaterThanOrEqual(1);
  });

  it("TOTAL FAILURE (every instrument fails): AnalysisRun.status is FAILED, not PARTIAL, and every failure is still durably recorded", async () => {
    const { document: docA } = await uploadAndChunkDocument({ companyId: COMPANY_ID, filename: "total-failure-a.txt", data: Buffer.from(TEXT_A, "utf-8"), declaredType: "CREDIT_AGREEMENT" });
    const { document: docB } = await uploadAndChunkDocument({ companyId: COMPANY_ID, filename: "total-failure-b.txt", data: Buffer.from(TEXT_B, "utf-8"), declaredType: "CREDIT_AGREEMENT" });
    // A sentinel that matches NEITHER real document id but forces the mock's
    // `.some(...)` check to be true for EVERY object regardless of
    // sourceDocumentId, by asserting failure unconditionally via a second,
    // simpler global flag the mock also checks.
    (globalThis as { __FAIL_ALL__?: boolean }).__FAIL_ALL__ = true;

    const result = await runContractAnalysis({ companyId: COMPANY_ID }, { callers: scriptedCallers() });

    expect(result.outcome).toBe("FAILED");
    expect(result.status).toBe("FAILED");
    const persistedRun = await prisma.analysisRun.findUniqueOrThrow({ where: { id: result.runId! } });
    expect(persistedRun.status).toBe("FAILED");

    const issues = await getAnalysisRunIssues(result.runId!);
    expect(issues.length).toBe(2);
    const issueDocIds = issues.flatMap((i) => i.documentIds).sort();
    expect(issueDocIds).toEqual([docA.id, docB.id].sort());

    delete (globalThis as { __FAIL_ALL__?: boolean }).__FAIL_ALL__;
  });
});
