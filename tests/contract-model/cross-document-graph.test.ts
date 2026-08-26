/**
 * Cross-document fixture (task §40, docs/contract-model-foundation-phase-b.md) -
 * a Credit Agreement, an Indenture, and an Intercreditor Agreement, proving
 * debt authority, lien authority, a cross-document shared cap, and a
 * priority/collateral effect are all representable WITHOUT collapsing the
 * three documents into one.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { computeStableKey } from "../../lib/contract-model/stable-keys";

const COMPANY_ID = "fixture-cross-document-co";
const CREDIT_AGREEMENT_ID = "fixture-cross-document-ca";
const INDENTURE_ID = "fixture-cross-document-indenture";
const INTERCREDITOR_ID = "fixture-cross-document-intercreditor";

async function teardown() {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
}

describe("Cross-document graph (task §40)", () => {
  beforeAll(async () => {
    await teardown();
    await prisma.company.create({ data: { id: COMPANY_ID, name: "Fixture Cross-Document Co (synthetic, test-only)", tenantKind: "EVALUATION" } });
    await prisma.document.create({ data: { id: CREDIT_AGREEMENT_ID, companyId: COMPANY_ID, name: "Fixture Credit Agreement", type: "CREDIT_AGREEMENT" } });
    await prisma.document.create({ data: { id: INDENTURE_ID, companyId: COMPANY_ID, name: "Fixture Indenture", type: "INDENTURE" } });
    await prisma.document.create({ data: { id: INTERCREDITOR_ID, companyId: COMPANY_ID, name: "Fixture Intercreditor Agreement", type: "INTERCREDITOR_AGREEMENT" } });

    // Debt authority (Credit Agreement) and lien authority (Indenture) as separate rules on separate documents.
    const debtRule = await prisma.contractRule.create({ data: { companyId: COMPANY_ID, sourceDocumentId: CREDIT_AGREEMENT_ID, stableKey: computeStableKey("rule", COMPANY_ID, CREDIT_AGREEMENT_ID, "6.01"), covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", evaluationClass: "EXECUTABLE", action: "INCUR_SECURED_DEBT", thresholdValue: 500, thresholdUnit: "USD_MILLIONS", sourceSectionRef: "6.01" } });
    const lienRule = await prisma.contractRule.create({ data: { companyId: COMPANY_ID, sourceDocumentId: INDENTURE_ID, stableKey: computeStableKey("rule", COMPANY_ID, INDENTURE_ID, "4.09"), covenantFamily: "LIENS", ruleType: "QUANTITATIVE_PERMISSION", evaluationClass: "EXECUTABLE", action: "CREATE_LIEN", sourceSectionRef: "4.09" } });

    // Cross-document shared cap - a shared-capacity relationship between a Credit Agreement rule and an Indenture rule.
    await prisma.contractRuleRelationship.create({ data: { companyId: COMPANY_ID, fromRuleId: debtRule.id, toRuleId: lienRule.id, relationshipType: "SHARES_CAPACITY_WITH", sourceSectionRef: "Intercreditor Agreement §2.01", notes: "Both baskets draw against the same $500M shared secured-debt cap." } });

    // Priority/collateral effect - the Intercreditor Agreement governs both.
    await prisma.documentRelationshipEdge.create({ data: { companyId: COMPANY_ID, sourceDocumentId: INTERCREDITOR_ID, targetDocumentId: CREDIT_AGREEMENT_ID, relationshipType: "GOVERNS", scopeNote: "First-lien priority over shared collateral" } });
    await prisma.documentRelationshipEdge.create({ data: { companyId: COMPANY_ID, sourceDocumentId: INTERCREDITOR_ID, targetDocumentId: INDENTURE_ID, relationshipType: "GOVERNS", scopeNote: "Second-lien priority over shared collateral" } });
    await prisma.documentRelationshipEdge.create({ data: { companyId: COMPANY_ID, sourceDocumentId: CREDIT_AGREEMENT_ID, targetDocumentId: INTERCREDITOR_ID, relationshipType: "INTERCREDITOR_WITH" } });
    await prisma.documentRelationshipEdge.create({ data: { companyId: COMPANY_ID, sourceDocumentId: INDENTURE_ID, targetDocumentId: INTERCREDITOR_ID, relationshipType: "INTERCREDITOR_WITH" } });
  });

  afterAll(teardown);

  it("debt authority and lien authority remain on their own separate documents, never collapsed into one", async () => {
    const rules = await prisma.contractRule.findMany({ where: { companyId: COMPANY_ID } });
    const bySourceDocument = new Map(rules.map((r) => [r.action, r.sourceDocumentId]));
    expect(bySourceDocument.get("INCUR_SECURED_DEBT")).toBe(CREDIT_AGREEMENT_ID);
    expect(bySourceDocument.get("CREATE_LIEN")).toBe(INDENTURE_ID);
    expect(bySourceDocument.get("INCUR_SECURED_DEBT")).not.toBe(bySourceDocument.get("CREATE_LIEN"));
  });

  it("a single ContractRuleRelationship edge represents the cross-document shared cap between the two documents' own rules", async () => {
    const relationship = await prisma.contractRuleRelationship.findFirstOrThrow({ where: { companyId: COMPANY_ID, relationshipType: "SHARES_CAPACITY_WITH" }, include: { fromRule: true, toRule: true } });
    expect(relationship.fromRule.sourceDocumentId).toBe(CREDIT_AGREEMENT_ID);
    expect(relationship.toRule.sourceDocumentId).toBe(INDENTURE_ID);
  });

  it("the Intercreditor Agreement's priority/collateral effect over both other documents is a real, queryable graph, not a flattened summary", async () => {
    const governsEdges = await prisma.documentRelationshipEdge.findMany({ where: { companyId: COMPANY_ID, sourceDocumentId: INTERCREDITOR_ID, relationshipType: "GOVERNS" } });
    expect(governsEdges).toHaveLength(2);
    const targets = new Set(governsEdges.map((e) => e.targetDocumentId));
    expect(targets).toEqual(new Set([CREDIT_AGREEMENT_ID, INDENTURE_ID]));

    const intercreditorEdges = await prisma.documentRelationshipEdge.findMany({ where: { companyId: COMPANY_ID, relationshipType: "INTERCREDITOR_WITH" } });
    expect(intercreditorEdges).toHaveLength(2);
  });

  it("three real, independent Document rows exist - the graph never merges them", async () => {
    const documents = await prisma.document.findMany({ where: { companyId: COMPANY_ID } });
    expect(documents).toHaveLength(3);
    expect(new Set(documents.map((d) => d.type))).toEqual(new Set(["CREDIT_AGREEMENT", "INDENTURE", "INTERCREDITOR_AGREEMENT"]));
  });
});
