/**
 * Phase 3F.1.6.RX Part B (independent, PRODUCTION-FROZEN recertification) -
 * AUDIT-F3 (partial instrument failure durability).
 *
 * This is a DELIBERATELY DIFFERENT adversarial construction from Workstream
 * H's own test (tests/contract-model/partial-instrument-failure.test.ts),
 * which injects its failure via lib/contract-model/analysis/semantic-truth/
 * service.ts's persistSemanticTruthForInstrument. To independently falsify
 * (not merely re-confirm) the claim that "every instrument-level failure is
 * durably recorded regardless of WHERE in the per-instrument pipeline it
 * occurs," this file injects the failure at a DIFFERENT stage entirely -
 * lib/contract-model/compiler/semantic-coverage/pipeline.ts's own
 * runSemanticCoverageAudit, which runs AFTER semantic-truth persistence and
 * has no internal per-instrument fault isolation of its own (a real
 * exception there propagates straight to the orchestrator's own
 * per-instrument catch, exactly like the persistence-layer failure the
 * original test uses). Two fresh, unrelated single-section credit
 * agreements (different covenant families/dollar amounts than the original
 * test's own fixtures) are used so package-graph groups them into two
 * separate standalone instruments, never one.
 *
 * If AUDIT-F3's fix were narrowly coupled to the ONE injection point
 * Workstream H's own test happened to use (e.g. a hidden per-call try/catch
 * placed only around persistSemanticTruthForInstrument, rather than a
 * genuine per-instrument boundary around the WHOLE analyzeInstrument call),
 * this test would catch it: it would observe the instrument's real, partial
 * work (semantic-truth rows already persisted before the injected coverage-
 * audit failure) getting silently discarded with no AnalysisRunIssue, or
 * the run resolving to a clean COMPLETED/COMPLETED_WITH_REVIEW despite the
 * failure.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ZodType } from "zod";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { SemanticCaller, SemanticCallerResult } from "../../lib/contract-model/compiler/semantic/caller";
import type { SemanticCompilerInput } from "../../lib/contract-model/compiler/semantic/types";

const FAILING_MARKER = "MARKER-PARTB-COVERAGE-AUDIT-SHOULD-FAIL";

vi.mock("../../lib/contract-model/compiler/semantic-coverage/pipeline", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/contract-model/compiler/semantic-coverage/pipeline")>();
  return {
    ...actual,
    runSemanticCoverageAudit: vi.fn(async (input: Parameters<typeof actual.runSemanticCoverageAudit>[0]) => {
      const g = globalThis as { __PARTB_FAILING_INSTRUMENT_KEY__?: string; __PARTB_FAIL_ALL__?: boolean };
      if (g.__PARTB_FAIL_ALL__ === true || input.instrumentKey === g.__PARTB_FAILING_INSTRUMENT_KEY__) {
        throw new Error(`INJECTED (Part B recert, test-only): simulated semantic-coverage-audit failure for ${FAILING_MARKER}`);
      }
      return actual.runSemanticCoverageAudit(input);
    }),
  };
});

const { prisma } = await import("../../lib/prisma");
const { uploadAndChunkDocument } = await import("../../lib/onboarding/documents");
const { runContractAnalysis } = await import("../../lib/contract-model/analysis/orchestrator");
const { getAnalysisRunIssues } = await import("../../lib/contract-model/analysis/service");
const wireSchemaMod = await import("../../lib/contract-model/compiler/semantic/wire-schema");

const COMPANY_ID = "part-b-recert-auditf3-alt-injection-test";

// Deliberately different covenant families/amounts/document shape than
// Workstream H's own fixtures (Indebtedness $8M / Liens $6M) - a fresh,
// independently-constructed adversarial package, not a copy.
const TEXT_A = `CREDIT AGREEMENT

ARTICLE V. NEGATIVE COVENANTS

Section 5.02 Restricted Payments. The Borrower shall not make Restricted Payments in excess of $12,000,000.
`;
const TEXT_B = `CREDIT AGREEMENT

ARTICLE V. NEGATIVE COVENANTS

Section 5.03 Asset Sales. The Borrower shall not consummate Asset Sales generating Net Proceeds in excess of $9,500,000.
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

function discoveryScript(_stage: string, content: string): unknown {
  if (content.includes("Restricted Payments") || content.includes("Asset Sales")) {
    return { rules: [{ relativeRef: "", families: content.includes("Restricted Payments") ? ["RESTRICTED_PAYMENTS"] : ["ASSET_SALES"], role: "BASKET", description: "basket", multipleRulesLikely: false, definedTermDependencyLikely: false, confidence: 0.9, needsReview: false }] };
  }
  return { rules: [] };
}

function semanticCompileScript(input: SemanticCompilerInput): unknown {
  const isA = input.operativeSourceText.includes("12,000,000");
  return {
    rules: [
      {
        localRef: "r1",
        sourceSectionRef: isA ? "5.02" : "5.03",
        covenantFamily: isA ? "RESTRICTED_PAYMENTS" : "ASSET_SALES",
        ruleType: "QUANTITATIVE_PERMISSION",
        posture: "PERMISSION",
        action: isA ? "MAKE_RESTRICTED_PAYMENT" : "DISPOSE_ASSETS",
        entityScope: [],
        capacityExpression: { kind: "MONEY", amount: isA ? 12_000_000 : 9_500_000, currency: "USD" },
        sufficiency: "COMPLETE",
        citation: `${input.sourceDocumentId}::${isA ? "5.02" : "5.03"}`,
        excerpt: isA ? "Restricted Payments in excess of $12,000,000" : "Asset Sales generating Net Proceeds in excess of $9,500,000",
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
  await prisma.company.create({ data: { id: COMPANY_ID, name: "Part B recert AUDIT-F3 alt-injection test co", onboardingStatus: "ONBOARDING" } });
});

afterAll(async () => {
  await cleanupCompanyState();
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
  delete (globalThis as { __PARTB_FAILING_INSTRUMENT_KEY__?: string }).__PARTB_FAILING_INSTRUMENT_KEY__;
  delete (globalThis as { __PARTB_FAIL_ALL__?: boolean }).__PARTB_FAIL_ALL__;
});

beforeEach(async () => {
  await cleanupCompanyState();
});

describe("Part B recertification - AUDIT-F3 partial instrument failure, alternate injection point (semantic-coverage-audit, not semantic-truth persistence)", () => {
  it("instrument A succeeds, instrument B's coverage audit throws: A's real trusted state survives, B's failure is durable, status is genuinely PARTIAL", async () => {
    const { document: docA } = await uploadAndChunkDocument({ companyId: COMPANY_ID, filename: "partb-f3-a.txt", data: Buffer.from(TEXT_A, "utf-8"), declaredType: "CREDIT_AGREEMENT" });
    const { document: docB } = await uploadAndChunkDocument({ companyId: COMPANY_ID, filename: "partb-f3-b.txt", data: Buffer.from(TEXT_B, "utf-8"), declaredType: "CREDIT_AGREEMENT" });

    // Confirm package-graph genuinely does NOT group these two unrelated
    // single-section agreements into one instrument (a real precondition
    // this test depends on, not assumed).
    const bInstrumentKeyGuess = `instrument:${docB.id}`;
    (globalThis as { __PARTB_FAILING_INSTRUMENT_KEY__?: string }).__PARTB_FAILING_INSTRUMENT_KEY__ = bInstrumentKeyGuess;

    const result = await runContractAnalysis({ companyId: COMPANY_ID }, { callers: scriptedCallers() });

    expect(result.outcome).toBe("STARTED_TO_COMPLETION");
    expect(result.status).toBe("PARTIAL");
    expect(result.instruments.length).toBe(1);
    expect(result.instruments[0]!.instrumentKey).not.toBe(bInstrumentKeyGuess);
    expect(result.instrumentFailures.length).toBe(1);
    expect(result.instrumentFailures[0]!.instrumentKey).toBe(bInstrumentKeyGuess);
    expect(result.instrumentFailures[0]!.message).toContain(FAILING_MARKER);

    // --- Reload from real Postgres, never trust the in-memory result ---
    const persistedRun = await prisma.analysisRun.findUniqueOrThrow({ where: { id: result.runId! } });
    expect(persistedRun.status).toBe("PARTIAL");

    // A's real semantic-truth state (produced by a stage BEFORE the injected
    // failure point) genuinely exists and was not rolled back merely because
    // a later stage failed for A - wait, this checks A specifically, which
    // never failed at all.
    const aRecords = await prisma.semanticTruthRecord.findMany({ where: { companyId: COMPANY_ID, sourceDocumentId: docA.id } });
    expect(aRecords.length).toBeGreaterThanOrEqual(1);

    // Crucially: B's own semantic-truth objects WERE already persisted by
    // persistSemanticTruthForInstrument (which runs BEFORE the injected
    // coverage-audit failure in analyzeInstrument's own real sequence) -
    // this proves the fix's durability is a genuine per-instrument boundary
    // around the WHOLE analyzeInstrument call, not merely a narrow wrapper
    // around the one function Workstream H's own test happened to mock.
    // B's partial, already-computed work is real and not silently discarded
    // even though B's own instrument-level outcome never reaches
    // instrumentOutcomes.
    const bRecords = await prisma.semanticTruthRecord.findMany({ where: { companyId: COMPANY_ID, sourceDocumentId: docB.id } });
    expect(bRecords.length).toBeGreaterThanOrEqual(1);

    // B's failure is durable (AnalysisRunIssue), not merely in-memory.
    const issues = await getAnalysisRunIssues(result.runId!);
    expect(issues.length).toBe(1);
    expect(issues[0]!.instrumentKey).toBe(bInstrumentKeyGuess);
    expect(issues[0]!.documentIds).toContain(docB.id);
    expect(issues[0]!.message).toContain(FAILING_MARKER);
    expect(issues[0]!.failedStage).toBe("PER_INSTRUMENT_ANALYSIS");
  });

  it("TOTAL FAILURE at the coverage-audit stage for every instrument: status is FAILED (never PARTIAL), and BOTH instruments' own failures are durably recorded, not just the first", async () => {
    const { document: docA } = await uploadAndChunkDocument({ companyId: COMPANY_ID, filename: "partb-f3-total-a.txt", data: Buffer.from(TEXT_A, "utf-8"), declaredType: "CREDIT_AGREEMENT" });
    const { document: docB } = await uploadAndChunkDocument({ companyId: COMPANY_ID, filename: "partb-f3-total-b.txt", data: Buffer.from(TEXT_B, "utf-8"), declaredType: "CREDIT_AGREEMENT" });
    (globalThis as { __PARTB_FAIL_ALL__?: boolean }).__PARTB_FAIL_ALL__ = true;

    const result = await runContractAnalysis({ companyId: COMPANY_ID }, { callers: scriptedCallers() });

    expect(result.outcome).toBe("FAILED");
    expect(result.status).toBe("FAILED");
    const persistedRun = await prisma.analysisRun.findUniqueOrThrow({ where: { id: result.runId! } });
    expect(persistedRun.status).toBe("FAILED");

    const issues = await getAnalysisRunIssues(result.runId!);
    expect(issues.length).toBe(2);
    const issueDocIds = issues.flatMap((i) => i.documentIds).sort();
    expect(issueDocIds).toEqual([docA.id, docB.id].sort());
    for (const issue of issues) expect(issue.message).toContain(FAILING_MARKER);
  });
});
