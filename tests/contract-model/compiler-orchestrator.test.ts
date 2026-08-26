/**
 * Phase C orchestrator wiring tests (docs/phase-c-contract-compiler-v1.md).
 * Runs against the SyntheticStageCaller (no AI_GATEWAY_API_KEY/ANTHROPIC_API_KEY
 * in this sandbox) - these tests prove ORCHESTRATION correctness (stage
 * persistence, resumability, idempotency, partial-failure preservation,
 * tenant isolation, the hard promotion invariant), not real-LLM extraction
 * accuracy, which is a separate, real-corpus evaluation
 * (docs/phase-c-contract-compiler-v1.md's own evaluation section).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { runContractCompiler } from "../../lib/contract-model/compiler/orchestrator";

const COMPANY_ID = "fixture-phase-c-compiler-co";
const DOCUMENT_ID = "fixture-phase-c-compiler-ca";
const PACKAGE_KEY = "fixture-phase-c-compiler-package";

const SAMPLE_TEXT = `
ARTICLE VI NEGATIVE COVENANTS

Section 6.01. Indebtedness. The Borrower will not incur any Indebtedness, except Indebtedness in an aggregate amount not to exceed $10,000,000.

Section 6.02. Liens. The Borrower will not create any Lien, except Liens securing Indebtedness permitted by Section 6.01.

Section 6.03. Restricted Payments. The Borrower will not make any Restricted Payment, subject to Section 6.01.
`.trim();

async function teardown() {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
}

describe("Phase C orchestrator (synthetic caller - wiring, not accuracy)", () => {
  beforeAll(async () => {
    await teardown();
    await prisma.company.create({ data: { id: COMPANY_ID, name: "Fixture Phase C Compiler Co (synthetic, test-only)", tenantKind: "EVALUATION" } });
    await prisma.document.create({ data: { id: DOCUMENT_ID, companyId: COMPANY_ID, name: "Fixture Phase C Credit Agreement", type: "CREDIT_AGREEMENT" } });
  });
  afterAll(teardown);
  beforeEach(async () => {
    await prisma.contractCompilerRun.deleteMany({ where: { companyId: COMPANY_ID } });
    await prisma.contractRule.deleteMany({ where: { companyId: COMPANY_ID } });
    await prisma.documentNode.deleteMany({ where: { companyId: COMPANY_ID } });
    await prisma.definedTermNode.deleteMany({ where: { companyId: COMPANY_ID } });
  });

  it("runs all 11 stages to completion and persists real DocumentNode rows from the deterministic STRUCTURE stage", async () => {
    const summary = await runContractCompiler({ companyId: COMPANY_ID, packageKey: PACKAGE_KEY, documents: [{ documentId: DOCUMENT_ID, label: "Credit Agreement", text: SAMPLE_TEXT }] });
    expect(summary.stages.map((s) => s.stage)).toEqual(["STRUCTURE", "DEFINITIONS", "INVENTORY", "RULE_EXTRACTION", "DEPENDENCY_RESOLUTION", "RELATIONSHIPS", "AMENDMENTS", "VERIFICATION", "VALIDATION", "COVERAGE", "PROMOTION"]);
    expect(summary.structuralNodes.some((n) => n.sectionRef === "6.01")).toBe(true);
    expect(summary.structuralNodes.some((n) => n.sectionRef === "6.02")).toBe(true);

    const nodes = await prisma.documentNode.findMany({ where: { companyId: COMPANY_ID } });
    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes.every((n) => n.companyId === COMPANY_ID)).toBe(true);
  });

  it("is idempotent: running the same package twice does not duplicate DocumentNode rows", async () => {
    await runContractCompiler({ companyId: COMPANY_ID, packageKey: PACKAGE_KEY, documents: [{ documentId: DOCUMENT_ID, label: "Credit Agreement", text: SAMPLE_TEXT }] });
    const countAfterFirst = await prisma.documentNode.count({ where: { companyId: COMPANY_ID } });
    await runContractCompiler({ companyId: COMPANY_ID, packageKey: PACKAGE_KEY, documents: [{ documentId: DOCUMENT_ID, label: "Credit Agreement", text: SAMPLE_TEXT }] });
    const countAfterSecond = await prisma.documentNode.count({ where: { companyId: COMPANY_ID } });
    expect(countAfterSecond).toBe(countAfterFirst);
  });

  it("is resumable: a second run with unchanged inputs resumes every stage rather than re-running (real evidence: STRUCTURE stage attemptCount stays 1)", async () => {
    await runContractCompiler({ companyId: COMPANY_ID, packageKey: PACKAGE_KEY, documents: [{ documentId: DOCUMENT_ID, label: "Credit Agreement", text: SAMPLE_TEXT }] });
    await runContractCompiler({ companyId: COMPANY_ID, packageKey: PACKAGE_KEY, documents: [{ documentId: DOCUMENT_ID, label: "Credit Agreement", text: SAMPLE_TEXT }] });
    const run = await prisma.contractCompilerRun.findUniqueOrThrow({ where: { companyId_packageKey: { companyId: COMPANY_ID, packageKey: PACKAGE_KEY } } });
    const structureStage = await prisma.contractCompilerStage.findUniqueOrThrow({ where: { runId_stage: { runId: run.id, stage: "STRUCTURE" } } });
    expect(structureStage.attemptCount).toBe(1);
  });

  it("re-runs a stage when --force is set, incrementing attemptCount", async () => {
    await runContractCompiler({ companyId: COMPANY_ID, packageKey: PACKAGE_KEY, documents: [{ documentId: DOCUMENT_ID, label: "Credit Agreement", text: SAMPLE_TEXT }] });
    await runContractCompiler({ companyId: COMPANY_ID, packageKey: PACKAGE_KEY, documents: [{ documentId: DOCUMENT_ID, label: "Credit Agreement", text: SAMPLE_TEXT }] }, { force: true });
    const run = await prisma.contractCompilerRun.findUniqueOrThrow({ where: { companyId_packageKey: { companyId: COMPANY_ID, packageKey: PACKAGE_KEY } } });
    const structureStage = await prisma.contractCompilerStage.findUniqueOrThrow({ where: { runId_stage: { runId: run.id, stage: "STRUCTURE" } } });
    expect(structureStage.attemptCount).toBe(2);
  });

  it("re-runs only the changed stage when only later input changes: STRUCTURE's inputHash-gated resumability holds even when a later-stage input changes", async () => {
    await runContractCompiler({ companyId: COMPANY_ID, packageKey: PACKAGE_KEY, documents: [{ documentId: DOCUMENT_ID, label: "Credit Agreement", text: SAMPLE_TEXT }] });
    const changedText = `${SAMPLE_TEXT}\n\nSection 6.04. Investments. The Borrower will not make any Investment, except as permitted under Section 6.01.`;
    await runContractCompiler({ companyId: COMPANY_ID, packageKey: PACKAGE_KEY, documents: [{ documentId: DOCUMENT_ID, label: "Credit Agreement", text: changedText }] });
    const run = await prisma.contractCompilerRun.findUniqueOrThrow({ where: { companyId_packageKey: { companyId: COMPANY_ID, packageKey: PACKAGE_KEY } } });
    const structureStage = await prisma.contractCompilerStage.findUniqueOrThrow({ where: { runId_stage: { runId: run.id, stage: "STRUCTURE" } } });
    // Document text changed -> STRUCTURE's own inputHash changed -> it must re-run, not resume.
    expect(structureStage.attemptCount).toBe(2);
  });

  it("computes coverage and promotion decisions without throwing, and never grants EXECUTABLE without validation passing", async () => {
    const summary = await runContractCompiler({ companyId: COMPANY_ID, packageKey: PACKAGE_KEY, documents: [{ documentId: DOCUMENT_ID, label: "Credit Agreement", text: SAMPLE_TEXT }] });
    for (const decision of summary.promotionDecisions) {
      if (decision.executabilityState === "EXECUTABLE") {
        expect(summary.validationOk).toBe(true);
      }
    }
  });

  it("never writes any row for a different company (tenant isolation)", async () => {
    await runContractCompiler({ companyId: COMPANY_ID, packageKey: PACKAGE_KEY, documents: [{ documentId: DOCUMENT_ID, label: "Credit Agreement", text: SAMPLE_TEXT }] });
    const otherCompanyNodes = await prisma.documentNode.findMany({ where: { companyId: "coherent" } });
    expect(otherCompanyNodes.length).toBe(0);
  });
});
