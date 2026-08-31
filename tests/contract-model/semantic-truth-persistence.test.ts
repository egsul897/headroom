/**
 * Phase 3F.1.6.RX Workstream H (AUDIT-F1 - durable semantic IR persistence).
 * Proves lib/contract-model/analysis/semantic-truth/** actually persists the
 * compiled/verified semantic IR (IRRule/IRDefinition) that, before this
 * workstream, existed only in-memory for the duration of one
 * runContractAnalysis call (docs/phase-3f1-6-r-blocker-remediation/
 * 19-contract-truth-ownership-map.json's own disclosed "semantic claim
 * truth: NONE, DURABLY, TODAY" finding).
 *
 * The CRITICAL proof this file is required to make: after a real analysis
 * run persists trusted semantic state, a query made through a BRAND NEW
 * PrismaClient instance (simulating a process boundary - a fresh connection
 * that shares no in-memory object with the orchestrator that produced this
 * state) can re-read the trusted rule, with full provenance and trust
 * status, directly from Postgres. See "RELOAD WITHOUT RERUNNING AI" below.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { uploadAndChunkDocument } from "../../lib/onboarding/documents";
import { runContractAnalysis } from "../../lib/contract-model/analysis/orchestrator";
import { getTrustedSemanticTruth, getAllSemanticTruthForInstrument, persistSemanticTruthForInstrument } from "../../lib/contract-model/analysis/semantic-truth/service";
import { computeTrustStatus, summarizeFindings } from "../../lib/contract-model/analysis/semantic-truth/mapping";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { SemanticCaller, SemanticCallerResult } from "../../lib/contract-model/compiler/semantic/caller";
import type { SemanticCompilerInput } from "../../lib/contract-model/compiler/semantic/types";
import { SubmitCompilationSchema } from "../../lib/contract-model/compiler/semantic/wire-schema";
import { IR_SCHEMA_VERSION } from "../../lib/contract-model/ir/types";
import type { IRRule } from "../../lib/contract-model/ir/types";
import type { SemanticVerificationResult } from "../../lib/contract-model/compiler/semantic-verification/types";
import type { AnalyzerCallTelemetry } from "../../lib/contract-model/analyzer/telemetry";

const COMPANY_ID = "semantic-truth-persistence-test";

/** Deliberately byte-identical to tests/contract-model/live-contract-analysis-orchestrator.test.ts's own DOCUMENT_TEXT for the 6.01 basket - that file's own comments explain exactly why this precise shape (single, non-enumerated basket; Borrower + Restricted Subsidiary both named, matching the compiled rule's own entityScope below) reaches a clean VERIFIED_NO_MATERIAL_GAP_FOUND via Layer 1 deterministic reconciliation alone. */
const DOCUMENT_TEXT = `CREDIT AGREEMENT

ARTICLE I. DEFINITIONS

Section 1.01 Certain Defined Terms. As used in this Agreement, the following terms have the meanings set forth below:

"Borrower" means the Company.
"Restricted Subsidiary" means any Subsidiary of the Borrower that is not an Unrestricted Subsidiary.
"Closing Date" means the date of this Agreement.

ARTICLE VI. NEGATIVE COVENANTS

Section 6.01 Indebtedness. The Borrower shall not, and shall not permit any Restricted Subsidiary to, create, incur, assume or suffer to exist any Indebtedness in an aggregate principal amount at any time outstanding in excess of $10,000,000.
`;

class ScriptedStageCaller implements StageCaller {
  providerName = "test-scripted";
  model = "test-v1";
  isSynthetic = true;
  constructor(private readonly respond: (stage: string, content: string) => unknown = () => ({})) {}
  async call<T>(schema: ZodType<T>, stage: string, _systemPrompt: string, content: string): Promise<T> {
    return schema.parse(this.respond(stage, content));
  }
  lastTelemetry(): AnalyzerCallTelemetry | null {
    return null;
  }
}

class ScriptedSemanticCaller implements SemanticCaller {
  providerName = "test-scripted";
  model = "test-v1";
  isSynthetic = true;
  constructor(private readonly respond: (input: SemanticCompilerInput) => unknown = () => ({})) {}
  async compile(input: SemanticCompilerInput): Promise<SemanticCallerResult> {
    const submission = SubmitCompilationSchema.parse(this.respond(input));
    return { submission, rawSubmission: submission, toolCallLog: [], telemetry: null, failureReason: null, failureDetail: null };
  }
}

function discoveryScript(_stage: string, content: string): unknown {
  if (content.includes('Section: 6.01 - "Indebtedness')) {
    return { rules: [{ relativeRef: "", families: ["INDEBTEDNESS"], role: "BASKET", description: "Indebtedness basket up to $10,000,000.", multipleRulesLikely: false, definedTermDependencyLikely: false, confidence: 0.95, needsReview: false }] };
  }
  return { rules: [] };
}

function semanticCompileScript(input: SemanticCompilerInput): unknown {
  if (input.sourceSectionRef === "6.01") {
    return {
      rules: [
        {
          localRef: "r1",
          sourceSectionRef: "6.01",
          covenantFamily: "INDEBTEDNESS",
          ruleType: "QUANTITATIVE_PERMISSION",
          posture: "PERMISSION",
          action: "INCUR_DEBT",
          entityScope: ["BORROWER", "ANY_SUBSIDIARY"],
          capacityExpression: { kind: "MONEY", amount: 10_000_000, currency: "USD" },
          sufficiency: "COMPLETE",
          citation: `${input.sourceDocumentId}::6.01`,
          excerpt: "Indebtedness in an aggregate principal amount at any time outstanding in excess of $10,000,000",
        },
      ],
    };
  }
  return {};
}

function scriptedCallers() {
  return {
    discoveryCaller: new ScriptedStageCaller(discoveryScript),
    amendmentCaller: new ScriptedStageCaller(),
    verificationCaller: new ScriptedStageCaller(),
    semanticCaller: new ScriptedSemanticCaller(semanticCompileScript),
  };
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
  await prisma.company.create({ data: { id: COMPANY_ID, name: "Semantic truth persistence test co", onboardingStatus: "ONBOARDING" } });
});

afterAll(async () => {
  await cleanupCompanyState();
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
});

beforeEach(async () => {
  await cleanupCompanyState();
});

describe("semantic-truth persistence (AUDIT-F1)", () => {
  it("a real, verified covenant produces a durable SemanticTruthRecord with the full required provenance/trust-gating shape", async () => {
    const { document } = await uploadAndChunkDocument({ companyId: COMPANY_ID, filename: "semantic-truth-main.txt", data: Buffer.from(DOCUMENT_TEXT, "utf-8"), declaredType: "CREDIT_AGREEMENT" });
    const result = await runContractAnalysis({ companyId: COMPANY_ID }, { callers: scriptedCallers() });
    expect(result.outcome).toBe("STARTED_TO_COMPLETION");
    expect(result.instruments.length).toBe(1);

    const instrumentKey = result.instruments[0]!.instrumentKey;
    const records = await getAllSemanticTruthForInstrument(COMPANY_ID, instrumentKey);
    expect(records.length).toBeGreaterThanOrEqual(1);

    const rule = records.find((r) => r.kind === "RULE")!;
    expect(rule).toBeDefined();
    // Trust gating: a fully reconciled, deterministically-verified rule reaches VERIFIED.
    expect(rule.trustStatus).toBe("VERIFIED");
    expect(rule.verificationStatus).toMatch(/VERIFIED_/);
    // Source provenance (task's own required field list).
    expect(rule.sourceDocumentId).toBe(document.id);
    expect(rule.sourceSectionRef).toBe("6.01");
    expect(rule.candidateRef).toBeTruthy();
    // Algorithm/prompt/tool version provenance.
    expect(rule.irSchemaVersion).toBe(IR_SCHEMA_VERSION);
    expect(rule.compilerAlgorithmVersion).toBeTruthy();
    expect(rule.compilerPromptVersion).toBeTruthy();
    expect(rule.toolPolicyVersion).toBeTruthy();
    expect(rule.verifierAlgorithmVersion).toBeTruthy();
    // Tenant/instrument scoping.
    expect(rule.companyId).toBe(COMPANY_ID);
    expect(rule.instrumentKey).toBe(instrumentKey);
    // Analysis-run lineage back-reference.
    expect(rule.analysisRunId).toBe(result.runId);
    // Sufficiency preserved verbatim from the IR.
    expect(rule.sufficiency).toBe("COMPLETE");
    // The payload really is the compiled IRRule - not a stub.
    const payload = rule.payload as unknown as IRRule;
    expect(payload.capacityExpression).toMatchObject({ kind: "MONEY", amount: 10_000_000 });
    expect(payload.ruleId).toBeTruthy();
    expect(rule.contentHash).toBeTruthy();
    expect(rule.version).toBe(1);
    expect(rule.createdAt).toBeInstanceOf(Date);
    expect(rule.updatedAt).toBeInstanceOf(Date);
  });

  it("RELOAD WITHOUT RERUNNING AI: a fresh PrismaClient (simulating a new process) re-reads the trusted rule directly from Postgres, with no in-memory object from the orchestrator involved", async () => {
    const { document } = await uploadAndChunkDocument({ companyId: COMPANY_ID, filename: "semantic-truth-reload.txt", data: Buffer.from(DOCUMENT_TEXT, "utf-8"), declaredType: "CREDIT_AGREEMENT" });
    const result = await runContractAnalysis({ companyId: COMPANY_ID }, { callers: scriptedCallers() });
    const instrumentKey = result.instruments[0]!.instrumentKey;

    // A brand-new PrismaClient - a genuinely separate connection/process
    // boundary from the shared `lib/prisma` singleton the orchestrator used
    // to WRITE this state. Nothing here reuses any in-memory object the
    // orchestrator returned; this is a real, independent SQL round trip.
    const freshClient = new PrismaClient();
    try {
      const reloaded = await freshClient.semanticTruthRecord.findMany({ where: { companyId: COMPANY_ID, instrumentKey, trustStatus: "VERIFIED" } });
      expect(reloaded.length).toBeGreaterThanOrEqual(1);
      const rule = reloaded[0]!;
      expect(rule.trustStatus).toBe("VERIFIED");
      expect(rule.sourceDocumentId).toBe(document.id);
      const payload = rule.payload as unknown as IRRule;
      expect(payload.capacityExpression).toMatchObject({ kind: "MONEY", amount: 10_000_000 });
      expect(payload.covenantFamily).toBe("INDEBTEDNESS");
    } finally {
      await freshClient.$disconnect();
    }
  });

  it("TRUST GATING: getTrustedSemanticTruth (the ONE authoritative 'current truth' read) returns only VERIFIED rows, never COMPILED/REVIEW_REQUIRED/CONTRADICTED/UNSUPPORTED state", async () => {
    const instrumentKey = "trust-gating-unit-test-instrument";
    const baseRule = (overrides: Partial<IRRule>): IRRule => ({
      ruleId: `rule-${overrides.sourceSectionRef}`,
      irSchemaVersion: IR_SCHEMA_VERSION,
      companyId: COMPANY_ID,
      instrumentKey,
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
    });

    const compilerVersions = { irSchemaVersion: IR_SCHEMA_VERSION, compilerAlgorithmVersion: "test-compiler-v1", compilerPromptVersion: "test-prompt-v1", toolPolicyVersion: "test-tool-v1" };
    const verifiedResult = { candidateRef: "c-verified", status: "VERIFIED_NO_MATERIAL_GAP_FOUND", findings: [] } as unknown as SemanticVerificationResult;
    const contradictedResult = { candidateRef: "c-contradicted", status: "MATERIAL_DISCREPANCY", findings: [] } as unknown as SemanticVerificationResult;
    const reviewRequiredResult = { candidateRef: "c-review", status: "REVIEW_REQUIRED", findings: [] } as unknown as SemanticVerificationResult;

    await persistSemanticTruthForInstrument({
      companyId: COMPANY_ID,
      packageKey: null,
      instrumentKey,
      analysisRunId: null,
      objects: [
        { kind: "RULE", object: baseRule({ sourceSectionRef: "1.01" }), candidateRef: "c-compiled", compilerVersions, verification: null, verifierPromptVersion: null },
        { kind: "RULE", object: baseRule({ sourceSectionRef: "1.02" }), candidateRef: "c-verified", compilerVersions, verification: verifiedResult, verifierPromptVersion: "vp1" },
        { kind: "RULE", object: baseRule({ sourceSectionRef: "1.03" }), candidateRef: "c-contradicted", compilerVersions, verification: contradictedResult, verifierPromptVersion: "vp1" },
        { kind: "RULE", object: baseRule({ sourceSectionRef: "1.04" }), candidateRef: "c-review", compilerVersions, verification: reviewRequiredResult, verifierPromptVersion: "vp1" },
        { kind: "RULE", object: baseRule({ sourceSectionRef: "1.05", sufficiency: "UNSUPPORTED" }), candidateRef: "c-verified", compilerVersions, verification: verifiedResult, verifierPromptVersion: "vp1" },
      ],
    });

    const trusted = await getTrustedSemanticTruth(COMPANY_ID, instrumentKey);
    expect(trusted.length).toBe(1);
    expect(trusted[0]!.sourceSectionRef).toBe("1.02");
    expect(trusted[0]!.trustStatus).toBe("VERIFIED");

    const all = await getAllSemanticTruthForInstrument(COMPANY_ID, instrumentKey);
    expect(all.length).toBe(5);
    const byRef = new Map(all.map((r) => [r.sourceSectionRef, r.trustStatus]));
    expect(byRef.get("1.01")).toBe("COMPILED");
    expect(byRef.get("1.02")).toBe("VERIFIED");
    expect(byRef.get("1.03")).toBe("CONTRADICTED");
    expect(byRef.get("1.04")).toBe("REVIEW_REQUIRED");
    // UNSUPPORTED sufficiency wins regardless of a VERIFIED verification result for its own candidate.
    expect(byRef.get("1.05")).toBe("UNSUPPORTED");
  });

  it("IDEMPOTENCY: re-persisting identical content upserts the SAME row (same id, version unchanged); a genuine content change bumps version", async () => {
    const instrumentKey = "idempotency-unit-test-instrument";
    const rule: IRRule = {
      ruleId: "rule-idempotency",
      irSchemaVersion: IR_SCHEMA_VERSION,
      companyId: COMPANY_ID,
      instrumentKey,
      sourceDocumentId: "doc-1",
      sourceSectionRef: "2.01",
      covenantFamily: "INDEBTEDNESS",
      ruleType: "QUANTITATIVE_PERMISSION",
      posture: "PERMISSION",
      action: "INCUR_DEBT",
      entityScope: [],
      entityScopeExcluded: [],
      transactionScope: null,
      capacityExpression: { kind: "MONEY", type: "MONEY", exprId: "e1", amount: 5_000_000, currency: "USD" },
      conditions: [],
      exceptions: [],
      dependsOn: [],
      operativeLineage: null,
      sufficiency: "COMPLETE",
      sufficiencyReasons: [],
      provenance: null,
      compilerVersion: "test-v1",
      sourceContentVersion: null,
    };
    const compilerVersions = { irSchemaVersion: IR_SCHEMA_VERSION, compilerAlgorithmVersion: "test-compiler-v1", compilerPromptVersion: "test-prompt-v1", toolPolicyVersion: "test-tool-v1" };

    const first = await persistSemanticTruthForInstrument({ companyId: COMPANY_ID, packageKey: null, instrumentKey, analysisRunId: null, objects: [{ kind: "RULE", object: rule, candidateRef: "c1", compilerVersions, verification: null, verifierPromptVersion: null }] });
    expect(first.upserted).toBe(1);
    const rowAfterFirst = await prisma.semanticTruthRecord.findUniqueOrThrow({ where: { companyId_instrumentKey_kind_semanticObjectId: { companyId: COMPANY_ID, instrumentKey, kind: "RULE", semanticObjectId: "rule-idempotency" } } });
    expect(rowAfterFirst.version).toBe(1);

    // Identical content re-persisted - a real no-op (never a duplicate row, never a version bump).
    const second = await persistSemanticTruthForInstrument({ companyId: COMPANY_ID, packageKey: null, instrumentKey, analysisRunId: null, objects: [{ kind: "RULE", object: rule, candidateRef: "c1", compilerVersions, verification: null, verifierPromptVersion: null }] });
    expect(second.unchanged).toBe(1);
    expect(await prisma.semanticTruthRecord.count({ where: { companyId: COMPANY_ID, instrumentKey } })).toBe(1);
    const rowAfterSecond = await prisma.semanticTruthRecord.findUniqueOrThrow({ where: { id: rowAfterFirst.id } });
    expect(rowAfterSecond.version).toBe(1);

    // A genuine content change (a different capacity amount for the SAME ruleId) bumps version, still the same row.
    const changedRule: IRRule = { ...rule, capacityExpression: { kind: "MONEY", type: "MONEY", exprId: "e1", amount: 7_500_000, currency: "USD" } };
    const third = await persistSemanticTruthForInstrument({ companyId: COMPANY_ID, packageKey: null, instrumentKey, analysisRunId: null, objects: [{ kind: "RULE", object: changedRule, candidateRef: "c1", compilerVersions, verification: null, verifierPromptVersion: null }] });
    expect(third.upserted).toBe(1);
    expect(await prisma.semanticTruthRecord.count({ where: { companyId: COMPANY_ID, instrumentKey } })).toBe(1);
    const rowAfterThird = await prisma.semanticTruthRecord.findUniqueOrThrow({ where: { id: rowAfterFirst.id } });
    expect(rowAfterThird.version).toBe(2);
    expect((rowAfterThird.payload as unknown as IRRule).capacityExpression).toMatchObject({ amount: 7_500_000 });
  });
});

describe("computeTrustStatus / summarizeFindings (pure mapping unit tests)", () => {
  it("maps every SemanticVerificationStatus to the documented trust status", () => {
    expect(computeTrustStatus("COMPLETE", null)).toBe("COMPILED");
    expect(computeTrustStatus("COMPLETE", { status: "VERIFIED_NO_MATERIAL_GAP_FOUND" } as unknown as SemanticVerificationResult)).toBe("VERIFIED");
    expect(computeTrustStatus("COMPLETE", { status: "VERIFIED_WITH_NON_MATERIAL_FINDINGS" } as unknown as SemanticVerificationResult)).toBe("VERIFIED");
    expect(computeTrustStatus("COMPLETE", { status: "MATERIAL_DISCREPANCY" } as unknown as SemanticVerificationResult)).toBe("CONTRADICTED");
    expect(computeTrustStatus("COMPLETE", { status: "REVIEW_REQUIRED" } as unknown as SemanticVerificationResult)).toBe("REVIEW_REQUIRED");
    expect(computeTrustStatus("COMPLETE", { status: "VERIFICATION_INCOMPLETE" } as unknown as SemanticVerificationResult)).toBe("REVIEW_REQUIRED");
    expect(computeTrustStatus("COMPLETE", { status: "VERIFICATION_FAILED" } as unknown as SemanticVerificationResult)).toBe("REVIEW_REQUIRED");
    expect(computeTrustStatus("COMPLETE", { status: "NOT_VERIFIED" } as unknown as SemanticVerificationResult)).toBe("REVIEW_REQUIRED");
    // UNSUPPORTED sufficiency always wins, even with a VERIFIED result for its own candidate.
    expect(computeTrustStatus("UNSUPPORTED", { status: "VERIFIED_NO_MATERIAL_GAP_FOUND" } as unknown as SemanticVerificationResult)).toBe("UNSUPPORTED");
  });

  it("summarizeFindings bounds and never returns the full finding list verbatim", () => {
    expect(summarizeFindings(null)).toBeNull();
    const manyFindings = Array.from({ length: 30 }, (_, i) => ({ findingId: `f${i}`, findingType: "WRONG_AMOUNT", severity: "MATERIAL", sourceCitation: "6.01", verifierReasoning: "x".repeat(600) }));
    const result = summarizeFindings({ findings: manyFindings } as unknown as SemanticVerificationResult);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(20);
    expect(result![0]!.verifierReasoning.length).toBeLessThanOrEqual(520);
    expect(result![0]!.verifierReasoning).toContain("[truncated]");
  });
});
