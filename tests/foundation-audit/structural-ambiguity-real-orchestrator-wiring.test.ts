/**
 * Phase 3F.1 Human Architecture Decision (Workstream OPEN-1, REAL-orchestrator
 * wiring fix - docs/phase-3f1-human-architecture-decision/
 * 04-structural-implementation.json's own "workstreamOPEN1RealOrchestratorWiringFix"
 * section).
 *
 * tests/foundation-audit/structural-ambiguity-orchestrator-wiring.test.ts
 * (an earlier workstream) proved the deterministic-triage + bounded-
 * classifier architecture is reachable through `runContractCompiler`
 * (lib/contract-model/compiler/orchestrator.ts). That file is explicitly
 * QUARANTINED legacy code (see its own header - `app/**` must never import
 * `runContractCompiler` from it, enforced by
 * tests/foundation-audit/legacy-phase-c-quarantine.test.ts) - a real end
 * user's compile run NEVER goes through it.
 *
 * THE ONE authoritative live contract-analysis orchestration boundary is
 * `runContractAnalysis` (lib/contract-model/analysis/orchestrator.ts - see
 * that file's own header), called from
 * app/[companyId]/onboarding/documents/actions.ts's real runExtractionAction.
 * Before this fix, THAT file's own STRUCTURE stage independently called the
 * old, synchronous, classifier-free `runStructureStage` directly - the
 * architecture was reachable in unit tests and through the quarantined
 * pipeline, but a real user's compile never reached it at all.
 *
 * This test drives the REAL `runContractAnalysis`, end to end, through the
 * exact same falsifying reproduction fixture the quarantined-file wiring fix
 * used (itself the independent auditor's original exploit -
 * tests/certification/part-b-final-fix1-independent-recert.test.ts, Part 2,
 * first case): a well-punctuated in-prose citation of "Section 6.09
 * Limitation on Restricted Payments." immediately followed by an ordinary
 * new sentence - typographically indistinguishable from a real heading whose
 * body starts with an ordinary sentence - adjacent to genuinely confident
 * headings (6.08/6.10) in the same document. Real Postgres and real document
 * storage required (uploadAndChunkDocument - the same real upload path a
 * real user's document goes through); the discovery/amendment/verification/
 * semantic callers are scripted (this test is about the STRUCTURE stage
 * only, mirroring live-contract-analysis-orchestrator.test.ts's own
 * established scripting convention) - the STRUCTURAL caller is deliberately
 * left un-injected (falls through to the real, unmocked, env-var-driven
 * `getStageCaller()`), so this test genuinely exercises the real no-
 * credential synthetic-fallback path for the ambiguous candidate, never a
 * scripted stand-in for it.
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

const COMPANY_ID = "real-orch-structural-ambiguity-wiring-co";

// Byte-identical in shape to the quarantined-file wiring fix's own fixture
// (tests/foundation-audit/structural-ambiguity-orchestrator-wiring.test.ts) -
// 6.08/6.10 are ordinary, unambiguous real headings; 6.09 is a well-
// punctuated in-prose CITATION of a section's own title, immediately
// followed by an ordinary capitalized new sentence.
const DOCUMENT_TEXT =
  "CREDIT AGREEMENT\n\n" +
  "ARTICLE VI COVENANTS\n\n" +
  "Section 6.08 Restricted Payments. The Borrower shall not make any Restricted Payment except as otherwise agreed.\n" +
  "Section 6.09 Limitation on Restricted Payments. This citation refers to a limitation described in the Credit Agreement and does not itself constitute an independent covenant of this Agreement.\n" +
  "(a) Permitted Liens existing on the Closing Date.\n\n" +
  "Section 6.10 Liens. The Borrower shall not create Liens.\n";

/** Test-only mock StageCaller - real StageCaller interface, always a safe schema-default (empty) response (this test is about the STRUCTURE stage; discovery/amendment/verification never need to find anything real for these assertions). Mirrors live-contract-analysis-orchestrator.test.ts's own ScriptedStageCaller. */
class EmptyScriptedStageCaller implements StageCaller {
  providerName = "test-scripted";
  model = "test-v1";
  isSynthetic = true;
  async call<T>(schema: ZodType<T>): Promise<T> {
    return schema.parse({});
  }
  lastTelemetry(): AnalyzerCallTelemetry | null {
    return null;
  }
}

/** Test-only mock SemanticCaller - never compiles anything (nothing in this fixture is ever discovered, so this is never actually invoked; present only so `runContractAnalysis`'s own callers option is fully, deliberately supplied). */
class EmptyScriptedSemanticCaller implements SemanticCaller {
  providerName = "test-scripted";
  model = "test-v1";
  isSynthetic = true;
  async compile(_input: SemanticCompilerInput): Promise<SemanticCallerResult> {
    return { submission: null, rawSubmission: null, toolCallLog: [], telemetry: null, failureReason: null, failureDetail: null };
  }
}

async function uploadTestDocument(): Promise<string> {
  const { document } = await uploadAndChunkDocument({ companyId: COMPANY_ID, filename: "credit-agreement-real-orch-structural-ambiguity.txt", data: Buffer.from(DOCUMENT_TEXT, "utf-8"), declaredType: "CREDIT_AGREEMENT" });
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
  await prisma.company.create({ data: { id: COMPANY_ID, name: "Real orchestrator structural ambiguity wiring test co", onboardingStatus: "ONBOARDING" } });
});

afterAll(async () => {
  await cleanupCompanyState();
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
});

beforeEach(async () => {
  await cleanupCompanyState();
});

describe("runContractAnalysis (THE real, live orchestration boundary) - STRUCTURE stage genuinely reaches the triage + bounded classifier architecture", () => {
  it("this sandbox genuinely has no real LLM credential configured (the same ambient condition the fail-closed synthetic-fallback assertions below depend on)", () => {
    // Not a mock - the real getStageCaller() selection order (llm-caller.ts)
    // falls through to the synthetic caller under exactly this condition,
    // which is the real path `callers.structuralCaller` takes below (this
    // test deliberately does NOT inject a structuralCaller override).
    expect(process.env.AI_GATEWAY_API_KEY).toBeFalsy();
    expect(process.env.ANTHROPIC_API_KEY).toBeFalsy();
  });

  it("a real end-to-end runContractAnalysis run resolves the AMBIGUOUS citation as UNCERTAIN via the real (synthetic-fallback) classifier path and fail-closed EXCLUDES it, never fabricating a false structural boundary - while confident headings in the SAME package still parse with zero classifier involvement", async () => {
    await uploadTestDocument();

    const result = await runContractAnalysis(
      { companyId: COMPANY_ID },
      {
        callers: {
          discoveryCaller: new EmptyScriptedStageCaller(),
          amendmentCaller: new EmptyScriptedStageCaller(),
          verificationCaller: new EmptyScriptedStageCaller(),
          semanticCaller: new EmptyScriptedSemanticCaller(),
          // structuralCaller: deliberately OMITTED - falls through to the
          // real getStageCaller(), the exact live-path default a real
          // user's compile run gets. This is the one thing this whole test
          // exists to prove is now genuinely wired.
        },
      }
    );

    expect(result.outcome).toBe("STARTED_TO_COMPLETION");
    expect(result.runId).toBeTruthy();

    // (a) THE CLASSIFIER ARCHITECTURE WAS ACTUALLY REACHED through the REAL
    // orchestrator - `structuralAmbiguityMetrics`/`structuralReviewSignals`
    // are only ever populated by `runStructureStageWithAmbiguityResolution`
    // genuinely running as part of THIS call (never a cache-hit resume -
    // this is a brand-new company/document/package fixture created
    // immediately above). Before this fix, this was structurally
    // impossible to observe through `runContractAnalysis` at all - the old
    // `runStructureStage` call site had no such fields to report.
    expect(result.structuralAmbiguityMetrics).not.toBeNull();
    expect(result.structuralAmbiguityMetrics!.ambiguousCount).toBe(1);
    expect(result.structuralAmbiguityMetrics!.classifierInvocationRate).toBeGreaterThan(0);
    expect(result.structuralAmbiguityMetrics!.uncertainCount).toBe(1);
    // Real, unmocked no-credential fallback (confirmed by the ambient-
    // condition assertion above) - the classifier genuinely ran its
    // fail-closed synthetic path, not a real paid semantic judgment.
    expect(result.structuralAmbiguityMetrics!.classifierSyntheticCount).toBe(1);
    // More than one real candidate existed overall (ARTICLE + 3 SECTIONs) -
    // only 6.09 was ever routed to the classifier, proving zero classifier
    // involvement for the confident headings structurally, not by
    // coincidence of a synthetic stub's fixed answer.
    expect(result.structuralAmbiguityMetrics!.totalCandidates).toBeGreaterThan(1);

    // The fail-closed review-state signal is a real, honest, non-silent
    // artifact of this run - not a swallowed failure, and not invented only
    // for the quarantined pipeline.
    expect(result.structuralReviewSignals).toHaveLength(1);
    const signal = result.structuralReviewSignals[0]!;
    expect(signal.candidateType).toBe("SECTION");
    expect(signal.sourceEvidence).toContain("6.09");
    expect(signal.classifierVerdict).toBe("UNCERTAIN");
    expect(signal.classifierFailed).toBe(true);
    expect(signal.classifierIsSynthetic).toBe(true);

    // (b) No false structural boundary: 6.09 - the in-prose citation - was
    // NEVER accepted as a real heading, in the REAL persisted DocumentNode
    // rows the real persistStructuralNodes call site writes (unmodified).
    const persistedSectionRefs = (await prisma.documentNode.findMany({ where: { companyId: COMPANY_ID }, select: { sectionRef: true } })).map((n) => n.sectionRef);
    expect(persistedSectionRefs).not.toContain("6.09");

    // (c) The genuinely confident headings elsewhere in the SAME package
    // still parsed normally through the real orchestrator - the fix did not
    // regress, slow down, or route unrelated confident content through the
    // classifier at all.
    expect(persistedSectionRefs).toEqual(expect.arrayContaining(["VI", "6.08", "6.10"]));

    const persistedRun = await prisma.analysisRun.findUniqueOrThrow({ where: { id: result.runId! } });
    expect(["COMPLETED", "COMPLETED_WITH_REVIEW", "PARTIAL"]).toContain(persistedRun.status);
  });

  it("a document with ONLY confident headings (no ambiguous candidates at all) costs exactly zero classifier calls through the REAL orchestrator - cost discipline holds end-to-end, not just in the quarantined pipeline or in isolation", async () => {
    const cleanText = "CREDIT AGREEMENT\n\nARTICLE VI NEGATIVE COVENANTS\n\nSection 6.01. Indebtedness. The Borrower will not incur any Indebtedness.\n\nSection 6.02. Liens. The Borrower will not create any Lien.\n";
    await uploadAndChunkDocument({ companyId: COMPANY_ID, filename: "credit-agreement-real-orch-clean.txt", data: Buffer.from(cleanText, "utf-8"), declaredType: "CREDIT_AGREEMENT" });

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
    expect(persistedSectionRefs).toEqual(["6.01", "6.02", "VI"]);
  });
});
