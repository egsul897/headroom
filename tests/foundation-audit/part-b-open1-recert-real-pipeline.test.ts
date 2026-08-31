/**
 * INDEPENDENT PART B RECERTIFICATION AUDIT (OPEN-1) - REAL PIPELINE WIRING
 * VERIFICATION. Conceptually pinned to production commit
 * a7ee654f4eec1614ef59d47c5f07c597264edc5a.
 *
 * This file independently re-derives the wiring claim in
 * docs/phase-3f1-human-architecture-decision/04-structural-implementation.json
 * ("workstreamOPEN1RealOrchestratorWiringFix") rather than trusting it: it
 * drives the REAL, unmodified `runContractAnalysis`
 * (lib/contract-model/analysis/orchestrator.ts - that file's own header
 * calls itself "the ONE authoritative live contract-analysis orchestration
 * boundary") end-to-end, through the real Postgres database and the real
 * `uploadAndChunkDocument` upload path a genuine user's document goes
 * through - never the isolated `resolveStructuralAmbiguity` function alone,
 * and never the separate, explicitly-quarantined
 * `lib/contract-model/compiler/orchestrator.ts` pipeline (see that file's
 * own QUARANTINE NOTICE and tests/foundation-audit/legacy-phase-c-quarantine.test.ts).
 *
 * The fixture text is entirely fresh (a "Ridgeline Term Loan Credit
 * Agreement" covering Investments/Reporting/Restricted-Subsidiary
 * covenants) - never the implementers' own 6.08/6.09/6.10 Restricted-
 * Payments construction reused across their prior wiring tests
 * (tests/foundation-audit/structural-ambiguity-orchestrator-wiring.test.ts,
 * tests/foundation-audit/structural-ambiguity-real-orchestrator-wiring.test.ts).
 *
 * The `structuralCaller` option is DELIBERATELY left un-injected on every
 * call below, so it falls through to the real, unmocked,
 * env-var-driven `getStageCaller()` - the exact default a real user's
 * compile run gets - genuinely exercising the fail-closed synthetic-fallback
 * path in this environment (confirmed to have no working Gateway/Anthropic
 * credential) through the real pipeline, not a scripted stand-in for it.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import { prisma } from "../../lib/prisma";
import { uploadAndChunkDocument } from "../../lib/onboarding/documents";
import { runContractAnalysis } from "../../lib/contract-model/analysis/orchestrator";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { SemanticCaller, SemanticCallerResult } from "../../lib/contract-model/compiler/semantic/caller";
import type { SemanticCompilerInput } from "../../lib/contract-model/compiler/semantic/types";
import type { AnalyzerCallTelemetry } from "../../lib/contract-model/analyzer/telemetry";

const COMPANY_ID = "auditor-open1-recert-real-pipeline-co";

/**
 * Fresh fixture, entirely distinct topic/wording from every prior wiring
 * test in this repo. Section 7.08/7.10/7.12 and ARTICLE VII are genuine,
 * unambiguous headings. Section 7.09 and 7.11 are two SEPARATE, independent
 * well-punctuated in-prose citations - typographically indistinguishable
 * from a real heading whose body opens with an ordinary new sentence - each
 * quoting a different neighboring section's own official title. Two
 * genuinely ambiguous candidates in the SAME real document (not merely one)
 * lets this test independently confirm the classifier is invoked exactly
 * once per ambiguous candidate through the real pipeline, not merely once
 * overall by coincidence.
 */
const DOCUMENT_TEXT =
  "RIDGELINE TERM LOAN CREDIT AGREEMENT\n\n" +
  "ARTICLE VII COVENANTS\n\n" +
  "Section 7.08 Limitation on Investments. The Borrower shall not make Investments except Permitted Investments.\n" +
  "Section 7.09 Limitation on Investments in Unrestricted Subsidiaries. This provision operates solely as a cross-reference to the basket described in the Investments article.\n" +
  "(a) Permitted Investments existing on the Closing Date.\n\n" +
  "Section 7.10 Limitation on Liens. The Borrower shall not create Liens.\n" +
  "Section 7.11 Limitation on Sale-Leasebacks. This restriction cross-references the Asset Sale covenant described elsewhere in this Agreement.\n" +
  "(a) Real clause under 7.10.\n\n" +
  "Section 7.12 Limitation on Hedging. The Borrower shall not enter into speculative Hedging Agreements.\n";

const CLEAN_DOCUMENT_TEXT = "RIDGELINE TERM LOAN CREDIT AGREEMENT\n\nARTICLE V INVESTMENTS\n\nSection 5.01 Permitted Investments. The Borrower may make Investments in Cash Equivalents.\n\nSection 5.02 Restricted Investments. The Borrower may not make Investments in Unrestricted Subsidiaries beyond the Investment Basket.\n";

class EmptyScriptedStageCaller implements StageCaller {
  providerName = "auditor-scripted";
  model = "auditor-v1";
  isSynthetic = true;
  async call<T>(schema: ZodType<T>): Promise<T> {
    return schema.parse({});
  }
  lastTelemetry(): AnalyzerCallTelemetry | null {
    return null;
  }
}

class EmptyScriptedSemanticCaller implements SemanticCaller {
  providerName = "auditor-scripted";
  model = "auditor-v1";
  isSynthetic = true;
  async compile(_input: SemanticCompilerInput): Promise<SemanticCallerResult> {
    return { submission: null, rawSubmission: null, toolCallLog: [], telemetry: null, failureReason: null, failureDetail: null };
  }
}

async function uploadTestDocument(text: string, filename: string): Promise<string> {
  const { document } = await uploadAndChunkDocument({ companyId: COMPANY_ID, filename, data: Buffer.from(text, "utf-8"), declaredType: "CREDIT_AGREEMENT" });
  return document.id;
}

async function cleanupCompanyState() {
  await prisma.claimReviewItem.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.analysisRunIssue.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.semanticTruthRecord.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.analysisFailureLog.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.analysisRun.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.contractRule.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.documentNode.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.document.deleteMany({ where: { companyId: COMPANY_ID } });
}

beforeAll(async () => {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
  await prisma.company.create({ data: { id: COMPANY_ID, name: "Auditor OPEN-1 real-pipeline recert co", onboardingStatus: "ONBOARDING" } });
});

afterAll(async () => {
  await cleanupCompanyState();
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
});

beforeEach(async () => {
  await cleanupCompanyState();
});

describe("AUDITOR (fresh, independent): real runContractAnalysis genuinely reaches the triage + bounded fail-closed classifier architecture", () => {
  it("this sandbox genuinely has no real LLM credential configured - the ambient condition the fail-closed synthetic-fallback assertions below depend on (re-verified independently, not assumed from the implementers' own report)", () => {
    expect(process.env.AI_GATEWAY_API_KEY).toBeFalsy();
    expect(process.env.ANTHROPIC_API_KEY).toBeFalsy();
  });

  it("a fresh document with TWO independent ambiguous citations resolves both as UNCERTAIN via the real (synthetic-fallback) classifier path, fail-closed excludes both, and never corrupts the rank-stack of the genuinely confident headings around them", async () => {
    await uploadTestDocument(DOCUMENT_TEXT, "ridgeline-term-loan-ambiguous.txt");

    const result = await runContractAnalysis(
      { companyId: COMPANY_ID },
      {
        callers: {
          discoveryCaller: new EmptyScriptedStageCaller(),
          amendmentCaller: new EmptyScriptedStageCaller(),
          verificationCaller: new EmptyScriptedStageCaller(),
          semanticCaller: new EmptyScriptedSemanticCaller(),
          // structuralCaller: deliberately OMITTED - this is the one thing
          // this test exists to independently verify is genuinely wired to
          // the real, unmocked getStageCaller() a real user's compile gets.
        },
      }
    );

    expect(result.outcome).toBe("STARTED_TO_COMPLETION");
    expect(result.runId).toBeTruthy();

    // (a) THE CLASSIFIER ARCHITECTURE WAS GENUINELY REACHED, exactly twice
    // (one per independent ambiguous citation) - not merely once by
    // coincidence, and not a cache-hit resume (brand-new fixture).
    expect(result.structuralAmbiguityMetrics).not.toBeNull();
    expect(result.structuralAmbiguityMetrics!.ambiguousCount).toBe(2);
    expect(result.structuralAmbiguityMetrics!.classifierInvocationRate).toBeGreaterThan(0);
    expect(result.structuralAmbiguityMetrics!.uncertainCount).toBe(2);
    expect(result.structuralAmbiguityMetrics!.classifierSyntheticCount).toBe(2);
    expect(result.structuralAmbiguityMetrics!.totalCandidates).toBeGreaterThan(2);

    expect(result.structuralReviewSignals).toHaveLength(2);
    const evidenceTexts = result.structuralReviewSignals.map((s) => s.sourceEvidence);
    expect(evidenceTexts.some((t) => t.includes("7.09"))).toBe(true);
    expect(evidenceTexts.some((t) => t.includes("7.11"))).toBe(true);
    for (const signal of result.structuralReviewSignals) {
      expect(signal.classifierVerdict).toBe("UNCERTAIN");
      expect(signal.classifierFailed).toBe(true);
      expect(signal.classifierIsSynthetic).toBe(true);
    }

    // (b) NO FALSE STRUCTURAL BOUNDARY in the real persisted DocumentNode
    // rows: neither 7.09 nor 7.11 was ever accepted.
    const persistedNodes = await prisma.documentNode.findMany({ where: { companyId: COMPANY_ID }, select: { sectionRef: true, parentId: true, id: true } });
    const persistedSectionRefs = persistedNodes.map((n) => n.sectionRef);
    expect(persistedSectionRefs).not.toContain("7.09");
    expect(persistedSectionRefs).not.toContain("7.11");

    // (c) The genuinely confident headings in the SAME package parsed
    // normally, through real persistence, with zero classifier involvement.
    expect(persistedSectionRefs).toEqual(expect.arrayContaining(["VII", "7.08", "7.10", "7.12"]));

    // (d) ZERO MATERIAL RANK-STACK CORRUPTION through real persistence: each
    // real clause "(a)" stays parented to its TRUE enclosing section (7.08
    // and 7.10 respectively), never re-parented to the excluded 7.09/7.11.
    const nodeById = new Map(persistedNodes.map((n) => [n.id, n] as const));
    const clauseNodes = persistedNodes.filter((n) => n.sectionRef?.endsWith("(a)"));
    expect(clauseNodes.length).toBeGreaterThanOrEqual(2);
    const parentRefsOfClauses = clauseNodes.map((c) => (c.parentId ? nodeById.get(c.parentId)?.sectionRef : null));
    expect(parentRefsOfClauses.sort()).toEqual(["7.08", "7.10"]);

    const persistedRun = await prisma.analysisRun.findUniqueOrThrow({ where: { id: result.runId! } });
    expect(["COMPLETED", "COMPLETED_WITH_REVIEW", "PARTIAL"]).toContain(persistedRun.status);
  });

  it("a fresh document with ONLY confident headings costs exactly zero classifier calls through the real orchestrator - cost discipline holds end-to-end for a genuinely different fixture than the ambiguous one above", async () => {
    await uploadTestDocument(CLEAN_DOCUMENT_TEXT, "ridgeline-term-loan-clean.txt");

    const result = await runContractAnalysis(
      { companyId: COMPANY_ID },
      {
        callers: {
          discoveryCaller: new EmptyScriptedStageCaller(),
          amendmentCaller: new EmptyScriptedStageCaller(),
          verificationCaller: new EmptyScriptedStageCaller(),
          semanticCaller: new EmptyScriptedSemanticCaller(),
        },
      }
    );

    expect(result.outcome).toBe("STARTED_TO_COMPLETION");
    expect(result.structuralAmbiguityMetrics).not.toBeNull();
    expect(result.structuralAmbiguityMetrics!.ambiguousCount).toBe(0);
    expect(result.structuralAmbiguityMetrics!.classifierInvocationRate).toBe(0);
    expect(result.structuralAmbiguityMetrics!.deterministicResolutionRate).toBe(1);
    expect(result.structuralReviewSignals).toHaveLength(0);

    const persistedSectionRefs = (await prisma.documentNode.findMany({ where: { companyId: COMPANY_ID }, select: { sectionRef: true } })).map((n) => n.sectionRef).sort();
    expect(persistedSectionRefs).toEqual(["5.01", "5.02", "V"]);
  });

  it("confirms the call site is genuinely the triage-aware path by static re-inspection of the orchestrator's own source text (belt-and-suspenders alongside the runtime assertions above) - never runStructureStage/parseDocumentStructure directly for structural-node construction", async () => {
    // A minimal, self-contained static check independent of the dynamic
    // assertions above: reads the actual orchestrator source and confirms
    // (a) it imports/calls the new triage-aware entry point, and (b) it
    // contains no reachable call to the OLD bare synchronous function for
    // constructing the STRUCTURE stage's own node output.
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(path.join(process.cwd(), "lib/contract-model/analysis/orchestrator.ts"), "utf-8");
    expect(source).toMatch(/runStructureStageWithAmbiguityResolution\(/);
    // The old bare call shape ("runStructureStage(" with no "WithAmbiguityResolution"
    // suffix) must not appear as an actual call anywhere in this file.
    const oldBareCallPattern = /\brunStructureStage\(/;
    expect(oldBareCallPattern.test(source)).toBe(false);
  });
});
