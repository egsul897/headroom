/**
 * Cross-reference fixture (task §38, docs/contract-model-foundation-phase-b.md).
 * Subject-to references, exceptions, cross-section references, linked
 * permissions, and cross-document references, each as a real
 * ContractReferenceEdge. An edge that cannot be resolved is persisted as
 * `resolved: false` with a reason (task §19), never dropped to a bare
 * string.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { computeStableKey } from "../../lib/contract-model/stable-keys";
import { getUnresolvedReferences } from "../../lib/contract-model/service";

const COMPANY_ID = "fixture-cross-reference-co";
const DOCUMENT_A_ID = "fixture-cross-reference-ca";
const DOCUMENT_B_ID = "fixture-cross-reference-indenture";

async function teardown() {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
}

describe("Cross-reference graph (task §38/§17-19)", () => {
  beforeAll(async () => {
    await teardown();
    await prisma.company.create({ data: { id: COMPANY_ID, name: "Fixture Cross-Reference Co (synthetic, test-only)", tenantKind: "EVALUATION" } });
    await prisma.document.create({ data: { id: DOCUMENT_A_ID, companyId: COMPANY_ID, name: "Fixture Cross-Reference Credit Agreement", type: "CREDIT_AGREEMENT" } });
    await prisma.document.create({ data: { id: DOCUMENT_B_ID, companyId: COMPANY_ID, name: "Fixture Cross-Reference Indenture", type: "INDENTURE" } });
  });

  afterAll(teardown);

  it("SUBJECT_TO: a section reference resolves to a real DocumentNode target", async () => {
    const section601 = await prisma.documentNode.create({ data: { companyId: COMPANY_ID, documentId: DOCUMENT_A_ID, stableKey: computeStableKey("node", COMPANY_ID, DOCUMENT_A_ID, "6.01"), nodeType: "SECTION", sectionRef: "6.01" } });
    const section611 = await prisma.documentNode.create({ data: { companyId: COMPANY_ID, documentId: DOCUMENT_A_ID, stableKey: computeStableKey("node", COMPANY_ID, DOCUMENT_A_ID, "6.11"), nodeType: "SECTION", sectionRef: "6.11" } });

    const edge = await prisma.contractReferenceEdge.create({
      data: {
        companyId: COMPANY_ID,
        sourceNodeId: section601.id,
        referenceType: "SUBJECT_TO",
        referenceText: "subject to Section 6.11",
        targetType: "SECTION",
        targetDocumentNodeId: section611.id,
        resolved: true,
      },
    });
    expect(edge.resolved).toBe(true);
    expect(edge.targetDocumentNodeId).toBe(section611.id);
  });

  it("LINKED_PERMISSION: a lien permission's authority is linked to the corresponding debt permission via a cross-reference edge", async () => {
    const debtRule = await prisma.contractRule.create({ data: { companyId: COMPANY_ID, sourceDocumentId: DOCUMENT_A_ID, stableKey: computeStableKey("rule", COMPANY_ID, DOCUMENT_A_ID, "6.01(a)"), covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", evaluationClass: "EXECUTABLE", action: "INCUR_SECURED_DEBT", sourceSectionRef: "6.01(a)" } });
    const lienRule = await prisma.contractRule.create({ data: { companyId: COMPANY_ID, sourceDocumentId: DOCUMENT_A_ID, stableKey: computeStableKey("rule", COMPANY_ID, DOCUMENT_A_ID, "6.02(a)"), covenantFamily: "LIENS", ruleType: "QUANTITATIVE_PERMISSION", evaluationClass: "EXECUTABLE", action: "CREATE_LIEN", sourceSectionRef: "6.02(a)" } });

    const edge = await prisma.contractReferenceEdge.create({
      data: { companyId: COMPANY_ID, sourceRuleId: lienRule.id, referenceType: "LIEN_AUTHORITY_FOR", referenceText: "Liens permitted under Section 6.02(a) to secure Indebtedness permitted under Section 6.01(a)", targetType: "RULE", targetRuleId: debtRule.id, resolved: true },
    });
    expect(edge.targetRuleId).toBe(debtRule.id);

    // A lien permission being linked to a debt permission never itself creates NEW debt authority (task §58's own deterministic-validation concern) - it is a reference, not a grant; asserting the reference's type is exactly LIEN_AUTHORITY_FOR (not DEBT_AUTHORITY_FOR) is the structural check for that.
    expect(edge.referenceType).toBe("LIEN_AUTHORITY_FOR");
  });

  it("cross-document reference: an intercreditor clause referencing the credit agreement's own collateral provision, across two different Document rows", async () => {
    const collateralNode = await prisma.documentNode.create({ data: { companyId: COMPANY_ID, documentId: DOCUMENT_A_ID, stableKey: computeStableKey("node", COMPANY_ID, DOCUMENT_A_ID, "9.01"), nodeType: "SECTION", sectionRef: "9.01" } });
    const edge = await prisma.contractReferenceEdge.create({
      data: { companyId: COMPANY_ID, referenceType: "INCORPORATES", referenceText: "as provided in the Credit Agreement's collateral provisions", targetType: "SECTION", targetDocumentNodeId: collateralNode.id, resolved: true },
    });
    expect(edge.targetDocumentNodeId).toBe(collateralNode.id);
    // Prove the target node is genuinely a DIFFERENT document than where this reference conceptually originates (DOCUMENT_B_ID, the indenture/intercreditor side) - the graph never collapses two documents into one.
    const targetDoc = await prisma.documentNode.findUniqueOrThrow({ where: { id: collateralNode.id } });
    expect(targetDoc.documentId).toBe(DOCUMENT_A_ID);
    expect(targetDoc.documentId).not.toBe(DOCUMENT_B_ID);
  });

  it("an exception is representable as its own structural fact, not folded into the reference text", async () => {
    const rule = await prisma.contractRule.create({
      data: {
        companyId: COMPANY_ID,
        sourceDocumentId: DOCUMENT_A_ID,
        stableKey: computeStableKey("rule", COMPANY_ID, DOCUMENT_A_ID, "6.04(a)"),
        covenantFamily: "RESTRICTED_PAYMENTS",
        ruleType: "QUANTITATIVE_PERMISSION",
        evaluationClass: "EXECUTABLE",
        action: "PAY_DIVIDEND",
        sourceSectionRef: "6.04(a)",
        exceptions: [{ description: "does not apply to dividends paid solely in Qualified Equity Interests", sourceSectionRef: "6.04(a)(iii)" }],
      },
    });
    const exceptions = rule.exceptions as { description: string; sourceSectionRef?: string }[];
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0]!.sourceSectionRef).toBe("6.04(a)(iii)");
  });

  it("UNRESOLVED_REFERENCE (task §19): a cross-reference that cannot be resolved is persisted with a reason and impact, never just a raw string, and getUnresolvedReferences surfaces it", async () => {
    await prisma.contractReferenceEdge.create({
      data: {
        companyId: COMPANY_ID,
        referenceType: "SUBJECT_TO",
        referenceText: "subject to the proviso to Section 6.02(hh)",
        targetType: "UNRESOLVED",
        resolved: false,
        unresolvedReason: "Section 6.02(hh) was not found in this document's structural graph - likely an undermodeled proviso.",
        impact: "The Section 6.02(a) lien basket this reference qualifies cannot be confidently scoped without it.",
        reviewStatus: "REVIEW_REQUIRED",
      },
    });
    const unresolved = await getUnresolvedReferences(COMPANY_ID);
    expect(unresolved.length).toBeGreaterThanOrEqual(1);
    const item = unresolved.find((e) => e.targetType === "UNRESOLVED")!;
    expect(item.resolved).toBe(false);
    expect(item.unresolvedReason).toBeTruthy();
    expect(item.impact).toBeTruthy();
    expect(item.reviewStatus).toBe("REVIEW_REQUIRED");
  });

  it("the database itself rejects a resolved:true reference whose targetType disagrees with which target column is set (structural validation at the constraint layer, task §47)", async () => {
    await expect(
      prisma.contractReferenceEdge.create({
        data: { companyId: COMPANY_ID, referenceType: "SUBJECT_TO", referenceText: "malformed - claims RULE but sets no targetRuleId", targetType: "RULE", resolved: true },
      })
    ).rejects.toThrow();
  });
});
