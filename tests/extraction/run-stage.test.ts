/**
 * End-to-end (real Postgres) test of the staged-extraction pipeline:
 * chunking -> persistence -> ExtractionRun/ExtractionStage creation ->
 * runExtractionStage -> ExtractionCandidate persistence, plus the specific
 * partial-failure/retry scenario the task requires: stage A succeeds, stage
 * B is forced to fail, stage B is retried, stage A's candidates are
 * unaffected.
 *
 * Isolated fixture company/document inserted via real Prisma calls,
 * following the exact pattern tests/financial-core/synthetic-company-a.test.ts
 * already established - never touching Coherent's or Matthews' data.
 */
import type { ExtractionStageKind } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { chunkDocument } from "../../lib/extraction/chunk";
import { persistDocumentChunks } from "../../lib/extraction/persist-chunks";
import { createExtractionRun } from "../../lib/extraction/pipeline";
import type {
  ContractExtractionProvider,
  CoverageGapInput,
  CoverageGapResult,
  DefinitionExtractionInput,
  DefinitionExtractionResult,
  FinancialInputExtractionInput,
  FinancialInputExtractionResult,
  PermissionExtractionInput,
  PermissionExtractionResult,
  RelationshipExtractionInput,
  RelationshipExtractionResult,
  StructureExtractionInput,
  StructureExtractionResult,
} from "../../lib/extraction/provider";
import { runExtractionStage, StageAlreadyCompleteError } from "../../lib/extraction/run-stage";
import { SyntheticExtractionProvider } from "../../lib/extraction/synthetic-provider";

const COMPANY_ID = "fixture-onboarding-pipeline-co";
const DOCUMENT_TEXT = [
  "THIS CREDIT AGREEMENT is dated as of January 1, 2026.",
  "",
  "ARTICLE I",
  "DEFINITIONS",
  "",
  "SECTION 1.01. Defined Terms.",
  '"Consolidated EBITDA" means, for any period, Consolidated Net Income plus interest, taxes, depreciation and amortization.',
  "",
  "ARTICLE VI",
  "NEGATIVE COVENANTS",
  "",
  "SECTION 6.01. Indebtedness. The Borrower will not, and will not permit any Restricted Subsidiary to, create, incur, assume or suffer to exist any Indebtedness, except up to $50 million of Indebtedness under the Loan Documents.",
  "",
  "SECTION 6.02. Liens. The Borrower will not create a Lien on any asset to secure Indebtedness in excess of $50 million.",
].join("\n");

/**
 * Wraps SyntheticExtractionProvider, throwing for whichever stages are
 * named in `failStages` - the deterministic partial-failure injection this
 * test needs. Everything else delegates straight through, so its output is
 * exactly what SyntheticExtractionProvider itself would have produced.
 */
class FlakyProvider implements ContractExtractionProvider {
  private readonly inner = new SyntheticExtractionProvider();
  constructor(private readonly failStages: Set<ExtractionStageKind>) {}

  private assertNotFailing(stage: ExtractionStageKind): void {
    if (this.failStages.has(stage)) {
      throw new Error(`FlakyProvider: simulated failure for stage ${stage}`);
    }
  }

  async extractDocumentStructure(input: StructureExtractionInput): Promise<StructureExtractionResult> {
    this.assertNotFailing("STRUCTURE");
    return this.inner.extractDocumentStructure(input);
  }
  async extractDefinitions(input: DefinitionExtractionInput): Promise<DefinitionExtractionResult> {
    this.assertNotFailing("DEFINITIONS");
    return this.inner.extractDefinitions(input);
  }
  async extractPermissions(input: PermissionExtractionInput): Promise<PermissionExtractionResult> {
    this.assertNotFailing("PERMISSIONS");
    return this.inner.extractPermissions(input);
  }
  async extractRelationships(input: RelationshipExtractionInput): Promise<RelationshipExtractionResult> {
    this.assertNotFailing("RELATIONSHIPS");
    return this.inner.extractRelationships(input);
  }
  async extractCoverageGaps(input: CoverageGapInput): Promise<CoverageGapResult> {
    this.assertNotFailing("COVERAGE");
    return this.inner.extractCoverageGaps(input);
  }
  async extractFinancialInputs(input: FinancialInputExtractionInput): Promise<FinancialInputExtractionResult> {
    this.assertNotFailing("FINANCIAL_INPUTS");
    return this.inner.extractFinancialInputs(input);
  }
}

async function teardown() {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
}

describe("staged extraction pipeline (real database)", () => {
  let documentId: string;

  beforeAll(async () => {
    await teardown();
    await prisma.company.create({ data: { id: COMPANY_ID, name: "Fixture Onboarding Pipeline Co (synthetic, test-only)" } });
    const document = await prisma.document.create({
      data: { companyId: COMPANY_ID, name: "Fixture Credit Agreement", type: "CREDIT_AGREEMENT", source: "user-upload", typeConfirmedByUser: false, amendmentRelationshipConfirmedByUser: false },
    });
    documentId = document.id;

    const chunks = chunkDocument({ pages: [{ pageNumber: 1, text: DOCUMENT_TEXT }], fullText: DOCUMENT_TEXT });
    await persistDocumentChunks(documentId, chunks);
  });

  afterAll(async () => {
    await teardown();
  });

  it("runs STRUCTURE to completion and persists a kind-appropriate, round-tripping candidate", async () => {
    const run = await createExtractionRun({ companyId: COMPANY_ID, documentId, provider: "synthetic-test", model: "n/a", promptVersion: "test", schemaVersion: "test" });
    const result = await runExtractionStage(run.id, "STRUCTURE", new FlakyProvider(new Set()));

    expect(result.status).toBe("COMPLETE");
    expect(result.candidateCount).toBeGreaterThan(0);

    const stageRow = await prisma.extractionStage.findUniqueOrThrow({ where: { extractionRunId_stage: { extractionRunId: run.id, stage: "STRUCTURE" } } });
    expect(stageRow.status).toBe("COMPLETE");
    expect(stageRow.error).toBeNull();
    expect(stageRow.attemptCount).toBe(1);

    const candidates = await prisma.extractionCandidate.findMany({ where: { extractionRunId: run.id, kind: "DOCUMENT_RELATIONSHIP" } });
    expect(candidates).toHaveLength(1);
    const candidate = candidates[0]!;
    expect(candidate.reviewStatus).toBe("PENDING");
    expect(candidate.sourceDocumentId).toBe(documentId);
    expect(candidate.sourceChunkIds.length).toBeGreaterThan(0);
    // Kind-appropriate proposedValue round-trip: exactly the DOCUMENT_RELATIONSHIP shape, not some other kind's fields.
    const proposedValue = candidate.proposedValue as { documentType: string; articleOutline: unknown[] };
    expect(proposedValue.documentType).toBe("CREDIT_AGREEMENT");
    expect(Array.isArray(proposedValue.articleOutline)).toBe(true);

    // --- Partial failure + retry scenario (the task's exact required proof) ---
    const structureCandidateIdsBefore = candidates.map((c) => c.id).sort();

    const failing = await runExtractionStage(run.id, "DEFINITIONS", new FlakyProvider(new Set(["DEFINITIONS"])));
    expect(failing.status).toBe("FAILED");
    expect(failing.error).toMatch(/simulated failure/);

    const definitionsStageAfterFailure = await prisma.extractionStage.findUniqueOrThrow({ where: { extractionRunId_stage: { extractionRunId: run.id, stage: "DEFINITIONS" } } });
    expect(definitionsStageAfterFailure.status).toBe("FAILED");
    expect(definitionsStageAfterFailure.error).toMatch(/simulated failure/);
    expect(definitionsStageAfterFailure.attemptCount).toBe(1);
    expect(await prisma.extractionCandidate.count({ where: { extractionStageId: definitionsStageAfterFailure.id } })).toBe(0);

    // STRUCTURE's row and candidates must be byte-for-byte untouched by DEFINITIONS' failure.
    const structureStageAfterFailure = await prisma.extractionStage.findUniqueOrThrow({ where: { extractionRunId_stage: { extractionRunId: run.id, stage: "STRUCTURE" } } });
    expect(structureStageAfterFailure.status).toBe("COMPLETE");
    expect(structureStageAfterFailure.attemptCount).toBe(1);
    const structureCandidatesAfterFailure = await prisma.extractionCandidate.findMany({ where: { extractionRunId: run.id, kind: "DOCUMENT_RELATIONSHIP" } });
    expect(structureCandidatesAfterFailure.map((c) => c.id).sort()).toEqual(structureCandidateIdsBefore);

    // Retry DEFINITIONS with a non-failing provider.
    const retried = await runExtractionStage(run.id, "DEFINITIONS", new FlakyProvider(new Set()));
    expect(retried.status).toBe("COMPLETE");
    expect(retried.candidateCount).toBeGreaterThan(0);

    const definitionsStageAfterRetry = await prisma.extractionStage.findUniqueOrThrow({ where: { extractionRunId_stage: { extractionRunId: run.id, stage: "DEFINITIONS" } } });
    expect(definitionsStageAfterRetry.status).toBe("COMPLETE");
    expect(definitionsStageAfterRetry.error).toBeNull();
    expect(definitionsStageAfterRetry.attemptCount).toBe(2); // one failed attempt + one successful retry

    const definedTermCandidates = await prisma.extractionCandidate.findMany({ where: { extractionRunId: run.id, kind: "DEFINED_TERM" } });
    expect(definedTermCandidates.length).toBeGreaterThan(0);
    const defined = definedTermCandidates[0]!.proposedValue as { termName: string; sectionRef: string; fullText: string };
    expect(defined.termName).toBe("Consolidated EBITDA");

    // STRUCTURE is STILL untouched after the retry.
    const structureStageAfterRetry = await prisma.extractionStage.findUniqueOrThrow({ where: { extractionRunId_stage: { extractionRunId: run.id, stage: "STRUCTURE" } } });
    expect(structureStageAfterRetry.attemptCount).toBe(1);
    const structureCandidatesAfterRetry = await prisma.extractionCandidate.findMany({ where: { extractionRunId: run.id, kind: "DOCUMENT_RELATIONSHIP" } });
    expect(structureCandidatesAfterRetry.map((c) => c.id).sort()).toEqual(structureCandidateIdsBefore);

    // A COMPLETE stage refuses to be re-run at all (never silently clobbered).
    await expect(runExtractionStage(run.id, "STRUCTURE", new FlakyProvider(new Set()))).rejects.toBeInstanceOf(StageAlreadyCompleteError);
  });

  it("runs PERMISSIONS and persists a PERMISSION candidate whose proposedValue matches the Permission-shaped schema (formulaType/thresholdValue/measurementBasis, not some other kind's fields)", async () => {
    const run = await createExtractionRun({ companyId: COMPANY_ID, documentId, provider: "synthetic-test", model: "n/a", promptVersion: "test", schemaVersion: "test" });
    const provider = new FlakyProvider(new Set());
    await runExtractionStage(run.id, "STRUCTURE", provider);
    await runExtractionStage(run.id, "DEFINITIONS", provider);
    const result = await runExtractionStage(run.id, "PERMISSIONS", provider);

    expect(result.status).toBe("COMPLETE");
    const permissionCandidates = await prisma.extractionCandidate.findMany({ where: { extractionRunId: run.id, kind: "PERMISSION" } });
    expect(permissionCandidates.length).toBeGreaterThan(0);
    const proposed = permissionCandidates[0]!.proposedValue as { grantType: string; formulaType: string; thresholdValue: number; measurementBasis: string };
    expect(["DEBT_INCURRENCE", "LIEN"]).toContain(proposed.grantType);
    expect(proposed.formulaType).toBe("FLAT_AMOUNT");
    expect(typeof proposed.thresholdValue).toBe("number");
    expect(proposed.measurementBasis).toBe("CUMULATIVE_INCURRED");
  });

  it("flags a COVERAGE-stage gap placeholder as REVIEW_REQUIRED, never PENDING", async () => {
    // A fresh document with a Lien/Indebtedness section but run only through COVERAGE (no PERMISSIONS stage ever modeled it), so COVERAGE must find the gap.
    const gapDocument = await prisma.document.create({
      data: { companyId: COMPANY_ID, name: "Fixture Gap Document", type: "CREDIT_AGREEMENT", source: "user-upload" },
    });
    const gapText = "ARTICLE VI\nSECTION 6.03. Additional Indebtedness. The Borrower may incur additional Indebtedness under this Section.";
    const chunks = chunkDocument({ pages: [{ pageNumber: 1, text: gapText }], fullText: gapText });
    await persistDocumentChunks(gapDocument.id, chunks);

    const run = await createExtractionRun({ companyId: COMPANY_ID, documentId: gapDocument.id, provider: "synthetic-test", model: "n/a", promptVersion: "test", schemaVersion: "test" });
    const provider = new FlakyProvider(new Set());
    await runExtractionStage(run.id, "STRUCTURE", provider);
    await runExtractionStage(run.id, "DEFINITIONS", provider);
    await runExtractionStage(run.id, "PERMISSIONS", provider); // synthetic PERMISSIONS never models 6.03 (no dollar-figure sentence there)
    const coverageResult = await runExtractionStage(run.id, "COVERAGE", provider);

    expect(coverageResult.status).toBe("COMPLETE");
    const gapCandidates = await prisma.extractionCandidate.findMany({ where: { extractionRunId: run.id, extractionStageId: (await prisma.extractionStage.findUniqueOrThrow({ where: { extractionRunId_stage: { extractionRunId: run.id, stage: "COVERAGE" } } })).id } });
    expect(gapCandidates.length).toBeGreaterThan(0);
    for (const c of gapCandidates) {
      expect(c.reviewStatus).toBe("REVIEW_REQUIRED");
      expect((c.proposedValue as { modelingStatus: string }).modelingStatus).toBe("KNOWN_NOT_MODELED");
    }
  });

  it("never persists anything resembling a raw chain-of-thought trace in rationale (a discipline check on this repo's own synthetic fixtures - it proves SyntheticExtractionProvider's rationale text stays short and structured, not that a live LLM response could never contain one)", async () => {
    const candidates = await prisma.extractionCandidate.findMany({ where: { companyId: COMPANY_ID }, select: { rationale: true } });
    expect(candidates.length).toBeGreaterThan(0);
    const reasoningMarkers = /step \d|let me think|first,? i|chain of thought|<thinking>|reasoning:/i;
    for (const c of candidates) {
      if (!c.rationale) continue;
      expect(c.rationale.length).toBeLessThanOrEqual(1000);
      expect(c.rationale).not.toMatch(reasoningMarkers);
    }
  });
});
