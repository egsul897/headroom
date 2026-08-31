/**
 * Phase 3F.1.6.R Workstream F (BLOCKER-10 remediation) - golden end-to-end
 * coverage for lib/contract-model/analysis/orchestrator.ts's
 * runContractAnalysis: the ONE authoritative live contract-analysis
 * orchestration boundary. Exercises the REAL, unmodified production
 * pipeline (structural analysis -> persistence -> package relationships ->
 * amendment/operative state -> discovery -> context retrieval -> semantic
 * compilation -> independent verification -> whole-document semantic
 * coverage -> explicit ClaimReviewItem persistence -> completed
 * AnalysisRun), the SAME function app/[companyId]/onboarding/documents/actions.ts's
 * real runExtractionAction calls (see live-contract-analysis-app-action.test.ts
 * for a second proof going through that literal server action).
 *
 * LLM calls are deterministically SCRIPTED (ScriptedStageCaller/
 * ScriptedSemanticCaller below), mirroring this codebase's own established
 * test convention for multi-stage pipeline tests (e.g.
 * tests/contract-model/phase-2f2-discovery-schema-robustness.test.ts's own
 * ScriptedStageCaller) - never a real network call, and never a mock of any
 * PRODUCTION logic itself (normalization, reconciliation, coverage,
 * safe-failure are all real). Real Postgres required.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import { prisma } from "../../lib/prisma";
import { getDocumentStorageProvider } from "../../lib/document-storage";
import { uploadAndChunkDocument } from "../../lib/onboarding/documents";
import { runContractAnalysis } from "../../lib/contract-model/analysis/orchestrator";
import { computeAnalysisPackageKey, CONTRACT_ANALYSIS_ORCHESTRATOR_VERSION } from "../../lib/contract-model/analysis/identity";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { SemanticCaller, SemanticCallerResult } from "../../lib/contract-model/compiler/semantic/caller";
import type { SemanticCompilerInput } from "../../lib/contract-model/compiler/semantic/types";
import { SubmitCompilationSchema } from "../../lib/contract-model/compiler/semantic/wire-schema";
import type { AnalyzerCallTelemetry } from "../../lib/contract-model/analyzer/telemetry";

const COMPANY_ID = "live-analysis-orchestrator-test";

/**
 * Real credit-agreement-shaped text with TWO real material negative
 * covenants, deliberately each a SINGLE, non-enumerated basket (no (a)/(b)
 * sub-items) - so the independent verifier's own "does the source contain
 * more apparent independent units than were compiled" structural-
 * completeness check (semantic-verification/findings.ts) has nothing to
 * legitimately flag, keeping this a genuinely clean, unambiguous "one
 * basket, one compiled rule, fully reconciled" case for 6.01, per verify.ts's
 * own §32 routing discipline. 6.01 (Indebtedness, $10,000,000) is scripted
 * to be discovered + compiled + verified below ("the trusted case" - must
 * NOT produce a review item). 6.02 (Liens, $2,000,000) is deliberately never
 * discovered by the scripted caller at all ("the untrusted case" - a real
 * material claim reaching semantic-coverage's independent, deterministic
 * Layer A/B detection with nothing crediting it, which MUST produce a real
 * persisted ClaimReviewItem - this is the actual safe-failure architecture
 * this file proves is live-wired, not simulated).
 */
const DOCUMENT_TEXT = `CREDIT AGREEMENT

ARTICLE I. DEFINITIONS

Section 1.01 Certain Defined Terms. As used in this Agreement, the following terms have the meanings set forth below:

"Borrower" means the Company.
"Restricted Subsidiary" means any Subsidiary of the Borrower that is not an Unrestricted Subsidiary.
"Closing Date" means the date of this Agreement.

ARTICLE VI. NEGATIVE COVENANTS

Section 6.01 Indebtedness. The Borrower shall not, and shall not permit any Restricted Subsidiary to, create, incur, assume or suffer to exist any Indebtedness in an aggregate principal amount at any time outstanding in excess of $10,000,000.

Section 6.02 Liens. The Borrower shall not, and shall not permit any Restricted Subsidiary to, create or suffer to exist any Lien on any property in an aggregate amount in excess of $2,000,000.
`;

/** Test-only mock StageCaller matching by userContent substring - real StageCaller interface, never a partial stand-in (mirrors phase-2f2-discovery-schema-robustness.test.ts's own ScriptedStageCaller, generalized to content-matching so this test never has to predict exact call count/order across Pass A's own deterministic section-flagging heuristics). Any unmatched call gets a safe, schema-default (empty) response - the same "zero cost, zero fabricated content" discipline llm-caller.ts's own SyntheticStageCaller establishes. */
class ScriptedStageCaller implements StageCaller {
  providerName = "test-scripted";
  model = "test-v1";
  isSynthetic = true;
  public callLog: { stage: string; content: string }[] = [];
  constructor(private readonly respond: (stage: string, content: string) => unknown = () => ({})) {}
  async call<T>(schema: ZodType<T>, stage: string, _systemPrompt: string, content: string): Promise<T> {
    this.callLog.push({ stage, content });
    return schema.parse(this.respond(stage, content));
  }
  lastTelemetry(): AnalyzerCallTelemetry | null {
    return null;
  }
}

/** Test-only mock SemanticCaller matching by sourceSectionRef - implements the real SemanticCaller interface. */
class ScriptedSemanticCaller implements SemanticCaller {
  providerName = "test-scripted";
  model = "test-v1";
  isSynthetic = true;
  public compiledSectionRefs: (string | null)[] = [];
  constructor(private readonly respond: (input: SemanticCompilerInput) => unknown = () => ({})) {}
  async compile(input: SemanticCompilerInput): Promise<SemanticCallerResult> {
    this.compiledSectionRefs.push(input.sourceSectionRef);
    const submission = SubmitCompilationSchema.parse(this.respond(input));
    return { submission, rawSubmission: submission, toolCallLog: [], telemetry: null, failureReason: null, failureDetail: null };
  }
}

/** Discovers exactly 6.01 as a real BASKET covenant (relativeRef "" composes to the section's own ref, "6.01" - see pass-c-neighborhood.ts's resolveRelativeRef); every other section (including 6.02) returns zero rules, so nothing ever credits 6.02's own real covenant text. */
function discoveryScript(_stage: string, content: string): unknown {
  if (content.includes('Section: 6.01 - "Indebtedness')) {
    return { rules: [{ relativeRef: "", families: ["INDEBTEDNESS"], role: "BASKET", description: "Indebtedness basket up to $10,000,000.", multipleRulesLikely: false, definedTermDependencyLikely: false, confidence: 0.95, needsReview: false }] };
  }
  return { rules: [] };
}

/** Compiles 6.01 into a rule whose MONEY capacityExpression matches its own real source text EXACTLY ($10,000,000) - the shape task §32/verify.ts's own routing discipline treats as a "straightforward fully reconciled fixed basket," so Layer 1 deterministic reconciliation alone credits it VERIFIED_NO_MATERIAL_GAP_FOUND with zero adversarial review calls needed. */
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
          // Real source text names both the Borrower and any Restricted
          // Subsidiary (via "ANY_SUBSIDIARY" - the generic restricted-
          // subsidiary tag, EntityClassTag's own vocabulary) as in scope -
          // the independent verifier's own deterministic entity-scope
          // check (semantic-verification/findings.ts) flags a
          // WRONG_ENTITY_SCOPE finding when the source text names entities
          // this field leaves empty, so this must genuinely reflect the
          // real source text to reach a clean VERIFIED_NO_MATERIAL_GAP_FOUND
          // (never fabricated merely to silence the check).
          entityScope: ["BORROWER", "ANY_SUBSIDIARY"],
          capacityExpression: { kind: "MONEY", amount: 10_000_000, currency: "USD" },
          sufficiency: "COMPLETE",
          // Must match semantic-coverage's OWN real citation convention
          // (`${documentId}::${sectionRef}` - see unit-hypothesis.ts's own
          // anchor.sourceCitation construction) so reconciliation.ts's
          // findAnchoredRule can actually match this compiled rule's
          // provenance to the independently-hypothesized MaterialSemanticUnit
          // for this exact clause - normalize.ts's own provenanceFor() uses
          // this field verbatim as IRRule.provenance.sourceCitation, never
          // recomputing it from sourceSectionRef.
          citation: `${input.sourceDocumentId}::6.01`,
          excerpt: "Indebtedness in an aggregate principal amount at any time outstanding in excess of $10,000,000",
        },
      ],
    };
  }
  return {};
}

async function uploadTestDocument(filenameSuffix: string): Promise<string> {
  const { document } = await uploadAndChunkDocument({ companyId: COMPANY_ID, filename: `credit-agreement-${filenameSuffix}.txt`, data: Buffer.from(DOCUMENT_TEXT, "utf-8"), declaredType: "CREDIT_AGREEMENT" });
  return document.id;
}

async function cleanupCompanyState() {
  await prisma.claimReviewItem.deleteMany({ where: { companyId: COMPANY_ID } });
  // AnalysisRunIssue cascades on runId when analysisRuns below are deleted,
  // but is deleted explicitly first for clarity and so a future re-order of
  // these statements can never accidentally rely on cascade ordering.
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
  await prisma.company.create({ data: { id: COMPANY_ID, name: "Live analysis orchestrator test co", onboardingStatus: "ONBOARDING" } });
});

afterAll(async () => {
  await cleanupCompanyState();
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
});

beforeEach(async () => {
  await cleanupCompanyState();
});

function scriptedCallers() {
  return {
    discoveryCaller: new ScriptedStageCaller(discoveryScript),
    amendmentCaller: new ScriptedStageCaller(),
    verificationCaller: new ScriptedStageCaller(),
    semanticCaller: new ScriptedSemanticCaller(semanticCompileScript),
  };
}

describe("runContractAnalysis - end-to-end wiring (BLOCKER-10)", () => {
  it("STARTED_TO_COMPLETION: a real document set produces a real completed AnalysisRun composing every real stage", async () => {
    await uploadTestDocument("main");
    const result = await runContractAnalysis({ companyId: COMPANY_ID }, { callers: scriptedCallers() });

    expect(result.outcome).toBe("STARTED_TO_COMPLETION");
    expect(result.runId).toBeTruthy();
    expect(result.instruments.length).toBe(1);
    expect(result.instruments[0]!.discoveredCandidateCount).toBeGreaterThanOrEqual(1);

    const persistedRun = await prisma.analysisRun.findUniqueOrThrow({ where: { id: result.runId! } });
    expect(persistedRun.analysisAlgorithmVersion).toBe(CONTRACT_ANALYSIS_ORCHESTRATOR_VERSION);
    expect(["COMPLETED", "COMPLETED_WITH_REVIEW"]).toContain(persistedRun.status);
    expect(persistedRun.completedAt).not.toBeNull();

    // Real structural persistence actually happened (task step "structural analysis -> persistence").
    const persistedNodes = await prisma.documentNode.count({ where: { companyId: COMPANY_ID } });
    expect(persistedNodes).toBeGreaterThan(0);
  });

  it("POSITIVE CASE: the real, un-discovered 6.02 Liens covenant produces a persisted OPEN_REVIEW ClaimReviewItem via the ONE real wired safe-failure emission point", async () => {
    await uploadTestDocument("positive");
    const result = await runContractAnalysis({ companyId: COMPANY_ID }, { callers: scriptedCallers() });
    expect(result.outcome).toBe("STARTED_TO_COMPLETION");
    expect(result.status).toBe("COMPLETED_WITH_REVIEW");
    expect(result.openReviewItemCount).toBeGreaterThan(0);

    const reviewItems = await prisma.claimReviewItem.findMany({ where: { companyId: COMPANY_ID, status: "OPEN_REVIEW" } });
    expect(reviewItems.length).toBeGreaterThan(0);
    // At least one open review item is genuinely anchored to the 6.02 Liens
    // text this scripted discovery caller never credited - proving this is
    // a real, specific, material-claim-shaped review item, not diagnostic
    // noise (task's own "prefer high precision, real material uncertainty").
    const liensReview = reviewItems.find((r) => r.sourceEvidence.includes("Lien") || r.sourceEvidence.includes("$2,000,000"));
    expect(liensReview).toBeDefined();
    expect(liensReview!.materiality).toMatch(/CRITICAL|MATERIAL/);
  });

  it("NEGATIVE CASE: the real, discovered+compiled+verified 6.01 covenant produces NO bogus review item for that same claim", async () => {
    await uploadTestDocument("negative");
    const result = await runContractAnalysis({ companyId: COMPANY_ID }, { callers: scriptedCallers() });

    const reviewItems = await prisma.claimReviewItem.findMany({ where: { companyId: COMPANY_ID } });
    // Every persisted review item (there should be at least the real 6.02
    // gap) must NOT be anchored to the 6.01 $10,000,000 basket this
    // scripted pipeline discovered, compiled, and verified end-to-end - a
    // trusted, fully-represented, fully-verified material claim must never
    // produce a bogus review item.
    const bogusReviewForTrustedClaim = reviewItems.find((r) => r.sourceEvidence.includes("10,000,000"));
    expect(bogusReviewForTrustedClaim).toBeUndefined();

    // Confirms this is a real, positive finding (discovery+compilation+
    // verification actually ran and actually credited this exact candidate
    // as verified, not merely an absence of evidence either way). NOTE
    // (disclosed scope boundary - see 19-contract-truth-ownership-map.json):
    // the compiled IRRule itself is NOT asserted against a `ContractRule`
    // Prisma row here, because it is never persisted there - `ContractRule`
    // is populated only by the legacy Phase-C `CandidateContractRule`
    // persistence path (compiler/persistence.ts), a different data shape
    // this orchestrator does not use. lib/contract-model/compiler/semantic/
    // compile.ts's own header comment discloses that IRRule/IRDefinition
    // persistence was deliberately deferred ("none in V1, by deliberate
    // design... a future Postgres-backed implementation... is a drop-in
    // swap, not a redesign") - adding that durable IR store is a separate,
    // larger scope this workstream's charter does not ask for (compose the
    // existing modules, never re-architect one of them), so this assertion
    // checks the in-memory instrument-level outcome runContractAnalysis
    // itself returns instead.
    const instrument = result.instruments[0]!;
    expect(instrument.verifiedCount).toBeGreaterThanOrEqual(1);
    const trustedUnit = instrument.documentDetails.flatMap((d) => d.units).find((u) => u.excerptText.includes("10,000,000"));
    expect(trustedUnit).toBeDefined();
    const trustedEntry = instrument.packageCoverage.documents.flatMap((d) => d.coverageEntries).find((e) => e.semanticUnitId === trustedUnit!.semanticUnitId);
    expect(trustedEntry?.coverageState).toBe("FULLY_REPRESENTED_VERIFIED");
  });

  it("FAILURE PROPAGATION: the untrusted 6.02 claim's review item and the trusted 6.01 claim's verified coverage coexist in the SAME run - one uncertain claim never discards an unrelated valid one", async () => {
    await uploadTestDocument("propagation");
    const result = await runContractAnalysis({ companyId: COMPANY_ID }, { callers: scriptedCallers() });
    expect(result.outcome).toBe("STARTED_TO_COMPLETION");

    const instrument = result.instruments[0]!;
    expect(instrument.verifiedCount).toBeGreaterThanOrEqual(1);
    const openReview = await prisma.claimReviewItem.count({ where: { companyId: COMPANY_ID, status: "OPEN_REVIEW" } });
    expect(openReview).toBeGreaterThan(0);
  });

  it("IDEMPOTENCY: re-triggering over the identical document set resolves to the SAME AnalysisRun row and does not duplicate ClaimReviewItem rows", async () => {
    await uploadTestDocument("idempotency");
    const first = await runContractAnalysis({ companyId: COMPANY_ID }, { callers: scriptedCallers() });
    const firstReviewIds = (await prisma.claimReviewItem.findMany({ where: { companyId: COMPANY_ID } })).map((r) => r.id).sort();

    const second = await runContractAnalysis({ companyId: COMPANY_ID }, { callers: scriptedCallers() });
    const secondReviewIds = (await prisma.claimReviewItem.findMany({ where: { companyId: COMPANY_ID } })).map((r) => r.id).sort();

    expect(second.runId).toBe(first.runId);
    expect(await prisma.analysisRun.count({ where: { companyId: COMPANY_ID } })).toBe(1);
    expect(secondReviewIds).toEqual(firstReviewIds); // same rows updated in place, never duplicated
  });

  it("NEW DOCUMENT VERSION: adding a genuinely new document changes the packageKey and runs an independent, second AnalysisRun", async () => {
    const doc1 = await uploadTestDocument("newdoc-a");
    const first = await runContractAnalysis({ companyId: COMPANY_ID }, { callers: scriptedCallers() });
    expect(first.documentIds).toEqual([doc1]);

    await uploadTestDocument("newdoc-b");
    const second = await runContractAnalysis({ companyId: COMPANY_ID }, { callers: scriptedCallers() });

    expect(second.packageKey).not.toBe(first.packageKey);
    expect(second.documentIds.length).toBe(2);
    expect(await prisma.analysisRun.count({ where: { companyId: COMPANY_ID } })).toBe(2);
  });

  it("ALGORITHM VERSION BUMP: an identical document set analyzed under a different algorithm version identity mints a second, independent AnalysisRun (reprocessing)", async () => {
    await uploadTestDocument("algo-version");
    const documents = await prisma.document.findMany({ where: { companyId: COMPANY_ID } });
    const packageKey = computeAnalysisPackageKey(COMPANY_ID, documents.map((d) => d.id));

    const first = await runContractAnalysis({ companyId: COMPANY_ID }, { callers: scriptedCallers() });
    expect(first.packageKey).toBe(packageKey);

    // Simulates a future algorithm-version bump by directly inserting a row
    // under a different identity - proving the schema's own
    // @@unique([companyId, packageKey, analysisAlgorithmVersion]) really
    // does treat a version bump as an independent identity, without needing
    // this test to fork the orchestrator's own version constant.
    await prisma.analysisRun.create({ data: { companyId: COMPANY_ID, packageKey, documentIds: documents.map((d) => d.id), analysisAlgorithmVersion: "phase-3f1-6-r.live-contract-analysis.v2-test-only", status: "PENDING" } });
    expect(await prisma.analysisRun.count({ where: { companyId: COMPANY_ID, packageKey } })).toBe(2);
  });

  it("CONCURRENT DUPLICATE TRIGGER: a RUNNING row for the identical identity is not double-run", async () => {
    await uploadTestDocument("concurrent");
    const documents = await prisma.document.findMany({ where: { companyId: COMPANY_ID } });
    const packageKey = computeAnalysisPackageKey(COMPANY_ID, documents.map((d) => d.id));

    await prisma.analysisRun.create({ data: { companyId: COMPANY_ID, packageKey, documentIds: documents.map((d) => d.id), analysisAlgorithmVersion: CONTRACT_ANALYSIS_ORCHESTRATOR_VERSION, status: "RUNNING", startedAt: new Date() } });

    const result = await runContractAnalysis({ companyId: COMPANY_ID }, { callers: scriptedCallers() });
    expect(result.outcome).toBe("SKIPPED_ALREADY_RUNNING");
    expect(await prisma.analysisRun.count({ where: { companyId: COMPANY_ID, packageKey } })).toBe(1);
  });

  it("SKIPPED_NO_CONTRACT_DOCUMENTS: a company with zero contract-shaped documents is a real, honest no-op (never a fabricated AnalysisRun)", async () => {
    const result = await runContractAnalysis({ companyId: COMPANY_ID }, { callers: scriptedCallers() });
    expect(result.outcome).toBe("SKIPPED_NO_CONTRACT_DOCUMENTS");
    expect(result.runId).toBeNull();
    expect(await prisma.analysisRun.count({ where: { companyId: COMPANY_ID } })).toBe(0);
  });

  it("FATAL INGESTION FAILURE routes to FAILED, not a silent success: a Document row with no storageRef fails the whole run explicitly", async () => {
    await prisma.document.create({ data: { companyId: COMPANY_ID, name: "no-blob.txt", type: "CREDIT_AGREEMENT", source: "engineer-authored", typeConfirmedByUser: true, amendmentRelationshipConfirmedByUser: true } });
    const result = await runContractAnalysis({ companyId: COMPANY_ID }, { callers: scriptedCallers() });
    expect(result.outcome).toBe("FAILED");
    expect(result.fatalError).not.toBeNull();
    const persistedRun = await prisma.analysisRun.findUniqueOrThrow({ where: { id: result.runId! } });
    expect(persistedRun.status).toBe("FAILED");
    expect(persistedRun.fatalError).not.toBeNull();
  });
});

describe("getDocumentStorageProvider sanity (test infra check)", () => {
  it("is the local filesystem provider in this sandbox (BLOB_READ_WRITE_TOKEN unset)", () => {
    expect(getDocumentStorageProvider().constructor.name).toBe("LocalFilesystemStorageProvider");
  });
});
