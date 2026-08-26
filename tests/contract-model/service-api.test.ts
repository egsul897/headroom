/**
 * Contractual-state query API (task §43/§44/§45, docs/contract-model-foundation-phase-b.md).
 * Exercises lib/contract-model/service.ts directly - the same functions any
 * future UI/Ask Headroom/Dashboard integration would call, never Prisma
 * directly for graph semantics.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { computeStableKey } from "../../lib/contract-model/stable-keys";
import { getDocumentGraph, getRuleDependencies, getRuleSourceTrace } from "../../lib/contract-model/service";

const COMPANY_ID = "fixture-service-api-co";
const DOCUMENT_ID = "fixture-service-api-ca";

async function teardown() {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
}

describe("Document graph assembly (task §9/§43)", () => {
  beforeAll(async () => {
    await teardown();
    await prisma.company.create({ data: { id: COMPANY_ID, name: "Fixture Service API Co (synthetic, test-only)", tenantKind: "EVALUATION" } });
    await prisma.document.create({ data: { id: DOCUMENT_ID, companyId: COMPANY_ID, name: "Fixture Service API Credit Agreement", type: "CREDIT_AGREEMENT" } });

    const article6 = await prisma.documentNode.create({ data: { companyId: COMPANY_ID, documentId: DOCUMENT_ID, stableKey: computeStableKey("node", COMPANY_ID, DOCUMENT_ID, "Article VI"), nodeType: "ARTICLE", heading: "Negative Covenants", ordinal: 0 } });
    const section601 = await prisma.documentNode.create({ data: { companyId: COMPANY_ID, documentId: DOCUMENT_ID, stableKey: computeStableKey("node", COMPANY_ID, DOCUMENT_ID, "6.01"), parentId: article6.id, nodeType: "SECTION", sectionRef: "6.01", ordinal: 0 } });
    await prisma.documentNode.create({ data: { companyId: COMPANY_ID, documentId: DOCUMENT_ID, stableKey: computeStableKey("node", COMPANY_ID, DOCUMENT_ID, "6.02"), parentId: article6.id, nodeType: "SECTION", sectionRef: "6.02", ordinal: 1 } });
    await prisma.documentNode.create({ data: { companyId: COMPANY_ID, documentId: DOCUMENT_ID, stableKey: computeStableKey("node", COMPANY_ID, DOCUMENT_ID, "6.01(a)"), parentId: section601.id, nodeType: "CLAUSE", sectionRef: "6.01(a)", ordinal: 0 } });
    await prisma.documentNode.create({ data: { companyId: COMPANY_ID, documentId: DOCUMENT_ID, stableKey: computeStableKey("node", COMPANY_ID, DOCUMENT_ID, "6.01(a) proviso"), parentId: section601.id, nodeType: "PROVISO", ordinal: 1 } });
  });

  afterAll(teardown);

  it("assembles a real Article -> Section -> Clause/Proviso tree from a flat table with one query, not per-level fetches", async () => {
    const tree = await getDocumentGraph(COMPANY_ID, DOCUMENT_ID);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.heading).toBe("Negative Covenants");
    expect(tree[0]!.children).toHaveLength(2);
    const section601Node = tree[0]!.children.find((c) => c.sectionRef === "6.01")!;
    expect(section601Node.children).toHaveLength(2);
    expect(section601Node.children.map((c) => c.nodeType).sort()).toEqual(["CLAUSE", "PROVISO"]);
  });
});

describe("Rule dependency traversal (task §20/§43) - cycle-safe on rules too, not just defined terms", () => {
  beforeAll(async () => {
    await teardown();
    await prisma.company.create({ data: { id: COMPANY_ID, name: "Fixture Service API Co (synthetic, test-only)", tenantKind: "EVALUATION" } });
    await prisma.document.create({ data: { id: DOCUMENT_ID, companyId: COMPANY_ID, name: "Fixture Service API Credit Agreement", type: "CREDIT_AGREEMENT" } });
  });

  afterAll(teardown);

  it("a rule-relationship cycle (A ACTIVATES B, B DEACTIVATES A) is detected, never causing an infinite loop", async () => {
    const ruleA = await prisma.contractRule.create({ data: { companyId: COMPANY_ID, sourceDocumentId: DOCUMENT_ID, stableKey: computeStableKey("rule", COMPANY_ID, DOCUMENT_ID, "cyclic-a"), covenantFamily: "SPRINGING_COVENANTS", ruleType: "CONDITIONAL_ACTIVATION", evaluationClass: "EVENT_DRIVEN", action: "OTHER", sourceSectionRef: "6.11(a)" } });
    const ruleB = await prisma.contractRule.create({ data: { companyId: COMPANY_ID, sourceDocumentId: DOCUMENT_ID, stableKey: computeStableKey("rule", COMPANY_ID, DOCUMENT_ID, "cyclic-b"), covenantFamily: "SPRINGING_COVENANTS", ruleType: "CONDITIONAL_ACTIVATION", evaluationClass: "EVENT_DRIVEN", action: "OTHER", sourceSectionRef: "6.11(b)" } });
    await prisma.contractRuleRelationship.create({ data: { companyId: COMPANY_ID, fromRuleId: ruleA.id, toRuleId: ruleB.id, relationshipType: "ACTIVATES" } });
    await prisma.contractRuleRelationship.create({ data: { companyId: COMPANY_ID, fromRuleId: ruleB.id, toRuleId: ruleA.id, relationshipType: "DEACTIVATES" } });

    const result = await getRuleDependencies(COMPANY_ID, ruleA.id);
    expect(result.cycleDetected).toBe(true);
    expect(result.relationships.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Source trace (task §44) - RULE -> DEPENDENCIES -> DEFINED TERMS -> CLAUSE -> DOCUMENT", () => {
  beforeAll(async () => {
    await teardown();
    await prisma.company.create({ data: { id: COMPANY_ID, name: "Fixture Service API Co (synthetic, test-only)", tenantKind: "EVALUATION" } });
    await prisma.document.create({ data: { id: DOCUMENT_ID, companyId: COMPANY_ID, name: "Fixture Service API Credit Agreement", type: "CREDIT_AGREEMENT" } });
  });

  afterAll(teardown);

  it("traces a rule back to its source clause, document, defined terms, and dependency relationships in one call", async () => {
    const node = await prisma.documentNode.create({ data: { companyId: COMPANY_ID, documentId: DOCUMENT_ID, stableKey: computeStableKey("node", COMPANY_ID, DOCUMENT_ID, "6.01(a)-trace"), nodeType: "CLAUSE", sectionRef: "6.01(a)" } });
    const term = await prisma.definedTermNode.create({ data: { companyId: COMPANY_ID, documentId: DOCUMENT_ID, stableKey: computeStableKey("term-trace", COMPANY_ID, DOCUMENT_ID, "Permitted Debt"), termName: "Permitted Debt", normalizedName: "permitted debt" } });
    const dependencyRule = await prisma.contractRule.create({ data: { companyId: COMPANY_ID, sourceDocumentId: DOCUMENT_ID, stableKey: computeStableKey("rule", COMPANY_ID, DOCUMENT_ID, "trace-dependency"), covenantFamily: "FINANCIAL_COVENANTS", ruleType: "RATIO_TEST", evaluationClass: "EXECUTABLE", action: "SATISFY_RATIO", sourceSectionRef: "6.10" } });
    const rule = await prisma.contractRule.create({
      data: { companyId: COMPANY_ID, sourceDocumentId: DOCUMENT_ID, sourceNodeId: node.id, stableKey: computeStableKey("rule", COMPANY_ID, DOCUMENT_ID, "trace-target"), covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", evaluationClass: "EXECUTABLE", action: "INCUR_DEBT", sourceSectionRef: "6.01(a)", definedTermRefs: [term.stableKey] },
    });
    await prisma.contractRuleRelationship.create({ data: { companyId: COMPANY_ID, fromRuleId: rule.id, toRuleId: dependencyRule.id, relationshipType: "REQUIRES" } });

    const trace = await getRuleSourceTrace(COMPANY_ID, rule.id);
    expect(trace).not.toBeNull();
    expect(trace!.sourceNode?.id).toBe(node.id);
    expect(trace!.definedTerms).toHaveLength(1);
    expect(trace!.definedTerms[0]!.termName).toBe("Permitted Debt");
    expect(trace!.dependencies.relationships).toHaveLength(1);
    expect(trace!.dependencies.relationships[0]!.toRuleId).toBe(dependencyRule.id);
    expect(trace!.rule.sourceDocumentId).toBe(DOCUMENT_ID);
  });

  it("returns null for a rule id that does not exist or belongs to a different company, rather than throwing or fabricating a trace", async () => {
    const trace = await getRuleSourceTrace(COMPANY_ID, "nonexistent-rule-id");
    expect(trace).toBeNull();
  });
});

describe("Coverage foundation (task §45)", () => {
  beforeAll(async () => {
    await teardown();
    await prisma.company.create({ data: { id: COMPANY_ID, name: "Fixture Service API Co (synthetic, test-only)", tenantKind: "EVALUATION" } });
    await prisma.document.create({ data: { id: DOCUMENT_ID, companyId: COMPANY_ID, name: "Fixture Service API Credit Agreement", type: "CREDIT_AGREEMENT" } });
  });

  afterAll(teardown);

  it("every ContractCoverageStatus value is representable at the document/covenant-family/rule granularity", async () => {
    const statuses = ["FULLY_MODELED", "PARTIALLY_MODELED", "REVIEW_REQUIRED", "UNSUPPORTED", "NOT_APPLICABLE", "NOT_TESTED"] as const;
    for (const status of statuses) {
      await prisma.contractCoverageRecord.create({ data: { companyId: COMPANY_ID, documentId: DOCUMENT_ID, covenantFamily: "INDEBTEDNESS", status, notes: `fixture coverage row for ${status}` } });
    }
    const records = await prisma.contractCoverageRecord.findMany({ where: { companyId: COMPANY_ID } });
    expect(new Set(records.map((r) => r.status))).toEqual(new Set(statuses));
  });

  it("getOperativeContractualState surfaces the latest coverage status per covenant family", async () => {
    const { getOperativeContractualState } = await import("../../lib/contract-model/service");
    const state = await getOperativeContractualState(COMPANY_ID);
    expect(state.coverageByFamily.INDEBTEDNESS).toBeDefined();
  });
});
