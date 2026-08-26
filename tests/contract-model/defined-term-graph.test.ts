/**
 * Nested-definition fixture (task §37, docs/contract-model-foundation-phase-b.md).
 * Ratio -> EBITDA -> Adjusted EBITDA -> Net Income -> Addbacks -> Cap ->
 * Pro Forma Adjustment. Verifies dependency traversal, stable keys, cycle
 * detection, and unresolved-dependency handling.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { computeStableKey } from "../../lib/contract-model/stable-keys";
import { getDefinedTermDependencies } from "../../lib/contract-model/service";

const COMPANY_ID = "fixture-nested-definitions-co";
const DOCUMENT_ID = "fixture-nested-definitions-ca";

async function teardown() {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
}

async function createTerm(termName: string) {
  const stableKey = computeStableKey("term", COMPANY_ID, DOCUMENT_ID, termName);
  return prisma.definedTermNode.create({ data: { companyId: COMPANY_ID, documentId: DOCUMENT_ID, stableKey, termName, normalizedName: termName.toLowerCase() } });
}

describe("Defined-term dependency graph - nested definitions (task §37)", () => {
  beforeAll(async () => {
    await teardown();
    await prisma.company.create({ data: { id: COMPANY_ID, name: "Fixture Nested Definitions Co (synthetic, test-only)", tenantKind: "EVALUATION" } });
    await prisma.document.create({ data: { id: DOCUMENT_ID, companyId: COMPANY_ID, name: "Fixture Nested Definitions Credit Agreement", type: "CREDIT_AGREEMENT" } });

    const ratio = await createTerm("Consolidated Total Leverage Ratio");
    const ebitda = await createTerm("Consolidated EBITDA");
    const adjustedEbitda = await createTerm("Adjusted EBITDA");
    const netIncome = await createTerm("Consolidated Net Income");
    const addbacks = await createTerm("Addbacks");
    const cap = await createTerm("Addback Cap");
    const proForma = await createTerm("Pro Forma Adjustment");

    await prisma.definedTermDependencyEdge.create({ data: { companyId: COMPANY_ID, fromTermId: ratio.id, dependencyType: "USES_TERM", toTermId: ebitda.id } });
    await prisma.definedTermDependencyEdge.create({ data: { companyId: COMPANY_ID, fromTermId: ebitda.id, dependencyType: "USES_TERM", toTermId: adjustedEbitda.id } });
    await prisma.definedTermDependencyEdge.create({ data: { companyId: COMPANY_ID, fromTermId: adjustedEbitda.id, dependencyType: "USES_TERM", toTermId: netIncome.id } });
    await prisma.definedTermDependencyEdge.create({ data: { companyId: COMPANY_ID, fromTermId: adjustedEbitda.id, dependencyType: "INCLUDES_TERM", toTermId: addbacks.id } });
    await prisma.definedTermDependencyEdge.create({ data: { companyId: COMPANY_ID, fromTermId: addbacks.id, dependencyType: "SUBJECT_TO_CAP", toTermId: cap.id } });
    await prisma.definedTermDependencyEdge.create({ data: { companyId: COMPANY_ID, fromTermId: netIncome.id, dependencyType: "SUBJECT_TO_CONDITION", toTermId: proForma.id } });
    // A dependency on a financial input, not another term - toTermId is null by design (task §16).
    await prisma.definedTermDependencyEdge.create({ data: { companyId: COMPANY_ID, fromTermId: netIncome.id, dependencyType: "USES_FINANCIAL_INPUT", toFinancialInputKey: "CONSOLIDATED_NET_INCOME" } });
  });

  afterAll(teardown);

  it("traverses the full nested dependency chain from the top-level ratio down to every leaf term", async () => {
    const ratio = await prisma.definedTermNode.findFirstOrThrow({ where: { companyId: COMPANY_ID, termName: "Consolidated Total Leverage Ratio" } });
    const result = await getDefinedTermDependencies(COMPANY_ID, ratio.id);
    const visitedNames = await prisma.definedTermNode.findMany({ where: { id: { in: result.visitedTermIds } }, select: { termName: true } });
    const names = new Set(visitedNames.map((t) => t.termName));
    expect(names).toEqual(
      new Set(["Consolidated Total Leverage Ratio", "Consolidated EBITDA", "Adjusted EBITDA", "Consolidated Net Income", "Addbacks", "Addback Cap", "Pro Forma Adjustment"])
    );
    expect(result.cycleDetected).toBe(false);
    expect(result.maxDepthReached).toBe(false);
    // The USES_FINANCIAL_INPUT edge is collected (it is a real dependency) even though it has no term to traverse into.
    expect(result.edges.some((e) => e.dependencyType === "USES_FINANCIAL_INPUT" && e.toFinancialInputKey === "CONSOLIDATED_NET_INCOME")).toBe(true);
  });

  it("stable keys are deterministic - the exact same inputs always produce the exact same key, independent of the row's own generated id", async () => {
    const term = await prisma.definedTermNode.findFirstOrThrow({ where: { companyId: COMPANY_ID, termName: "Consolidated EBITDA" } });
    expect(term.stableKey).toBe(computeStableKey("term", COMPANY_ID, DOCUMENT_ID, "Consolidated EBITDA"));
    expect(term.stableKey).not.toContain(term.id);
  });

  it("detects a cycle instead of infinite-looping when two terms depend on each other", async () => {
    const a = await createTerm("Cyclic Term A");
    const b = await createTerm("Cyclic Term B");
    await prisma.definedTermDependencyEdge.create({ data: { companyId: COMPANY_ID, fromTermId: a.id, dependencyType: "USES_TERM", toTermId: b.id } });
    await prisma.definedTermDependencyEdge.create({ data: { companyId: COMPANY_ID, fromTermId: b.id, dependencyType: "USES_TERM", toTermId: a.id } });

    const result = await getDefinedTermDependencies(COMPANY_ID, a.id);
    expect(result.cycleDetected).toBe(true);
    // Terminates - the very fact this test completes within vitest's default
    // timeout is itself part of the proof this never infinite-loops.
    expect(result.visitedTermIds.length).toBeGreaterThan(0);
  });

  it("an unresolved dependency (no toTermId, no toFinancialInputKey - a dangling USES_SECTION reference) is representable and does not break traversal", async () => {
    const orphan = await createTerm("Orphan-Dependent Term");
    await prisma.definedTermDependencyEdge.create({ data: { companyId: COMPANY_ID, fromTermId: orphan.id, dependencyType: "USES_SECTION", toSectionRef: "Section 1.07(unresolved)" } });
    const result = await getDefinedTermDependencies(COMPANY_ID, orphan.id);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]!.toSectionRef).toBe("Section 1.07(unresolved)");
    expect(result.edges[0]!.toTermId).toBeNull();
  });
});
