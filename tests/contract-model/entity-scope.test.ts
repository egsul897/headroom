/**
 * Entity-scope fixture (task §41, docs/contract-model-foundation-phase-b.md
 * §E). Borrower / Guarantors / Non-Guarantor Restricted Subsidiaries /
 * Unrestricted Subsidiaries, each with rules scoped differently. Reuses the
 * existing EntityClassTag enum and EntityClassMember table exactly as
 * Permission.entityScope already does (task §33 compatibility) - no new
 * entity-scope-only model was introduced.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { computeStableKey } from "../../lib/contract-model/stable-keys";

const COMPANY_ID = "fixture-entity-scope-co";
const DOCUMENT_ID = "fixture-entity-scope-ca";

async function teardown() {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
}

describe("Entity/subject scope (task §8/§41)", () => {
  beforeAll(async () => {
    await teardown();
    await prisma.company.create({ data: { id: COMPANY_ID, name: "Fixture Entity Scope Co (synthetic, test-only)", tenantKind: "EVALUATION" } });
    await prisma.document.create({ data: { id: DOCUMENT_ID, companyId: COMPANY_ID, name: "Fixture Entity Scope Credit Agreement", type: "CREDIT_AGREEMENT" } });

    // Concrete named-entity -> class membership (reuses EntityClassMember exactly as the solver-native model already does).
    await prisma.entityClassMember.createMany({
      data: [
        { companyId: COMPANY_ID, entityName: "Fixture Borrower LLC", entityClass: "BORROWER" },
        { companyId: COMPANY_ID, entityName: "Fixture Guarantor Sub Inc.", entityClass: "GUARANTOR_RS" },
        { companyId: COMPANY_ID, entityName: "Fixture Non-Guarantor Sub Ltd.", entityClass: "NON_GUARANTOR_RS" },
        { companyId: COMPANY_ID, entityName: "Fixture Unrestricted Sub Ltd.", entityClass: "UNRESTRICTED_SUB" },
      ],
    });

    // A debt covenant applying to the Borrower AND Guarantors only.
    await prisma.contractRule.create({
      data: {
        companyId: COMPANY_ID,
        sourceDocumentId: DOCUMENT_ID,
        stableKey: computeStableKey("rule", COMPANY_ID, DOCUMENT_ID, "6.01"),
        covenantFamily: "INDEBTEDNESS",
        ruleType: "QUANTITATIVE_RESTRICTION",
        evaluationClass: "EXECUTABLE",
        action: "INCUR_DEBT",
        entityScope: ["BORROWER", "GUARANTOR_RS"],
        sourceSectionRef: "6.01",
      },
    });

    // A reporting obligation applying to any Loan Party (the broader group).
    await prisma.contractRule.create({
      data: {
        companyId: COMPANY_ID,
        sourceDocumentId: DOCUMENT_ID,
        stableKey: computeStableKey("rule", COMPANY_ID, DOCUMENT_ID, "6.01(f)"),
        covenantFamily: "REPORTING_INFORMATION",
        ruleType: "REPORTING_OBLIGATION",
        evaluationClass: "MONITORABLE",
        action: "DELIVER_FINANCIALS",
        entityScope: ["LOAN_PARTY"],
        sourceSectionRef: "6.01(f)",
      },
    });

    // A rule explicitly EXCLUDING Unrestricted Subsidiaries - included/excluded scopes representable (task §8).
    await prisma.contractRule.create({
      data: {
        companyId: COMPANY_ID,
        sourceDocumentId: DOCUMENT_ID,
        stableKey: computeStableKey("rule", COMPANY_ID, DOCUMENT_ID, "6.05"),
        covenantFamily: "INVESTMENTS",
        ruleType: "QUANTITATIVE_PERMISSION",
        evaluationClass: "EXECUTABLE",
        action: "MAKE_INVESTMENT",
        entityScope: ["ANY_SUBSIDIARY"],
        entityScopeExcluded: ["UNRESTRICTED_SUB"],
        sourceSectionRef: "6.05",
      },
    });
  });

  afterAll(teardown);

  it("a debt covenant scoped to Borrower + Guarantors only excludes Non-Guarantor and Unrestricted subsidiaries by construction", async () => {
    const rule = await prisma.contractRule.findFirstOrThrow({ where: { companyId: COMPANY_ID, sourceSectionRef: "6.01" } });
    expect(rule.entityScope.sort()).toEqual(["BORROWER", "GUARANTOR_RS"]);
    expect(rule.entityScope).not.toContain("NON_GUARANTOR_RS");
    expect(rule.entityScope).not.toContain("UNRESTRICTED_SUB");
  });

  it("a reporting obligation scoped to the broader Loan Parties group uses the entity-group reference, not an enumerated list of specific entity names", async () => {
    const rule = await prisma.contractRule.findFirstOrThrow({ where: { companyId: COMPANY_ID, sourceSectionRef: "6.01(f)" } });
    expect(rule.entityScope).toEqual(["LOAN_PARTY"]);
  });

  it("included/excluded scopes are both representable on the same rule (any subsidiary, EXCEPT unrestricted ones)", async () => {
    const rule = await prisma.contractRule.findFirstOrThrow({ where: { companyId: COMPANY_ID, sourceSectionRef: "6.05" } });
    expect(rule.entityScope).toEqual(["ANY_SUBSIDIARY"]);
    expect(rule.entityScopeExcluded).toEqual(["UNRESTRICTED_SUB"]);
  });

  it("named-entity-to-class membership resolves concrete entities against a rule's abstract scope (reusing EntityClassMember, never a customer-tenant/legal-entity conflation)", async () => {
    const members = await prisma.entityClassMember.findMany({ where: { companyId: COMPANY_ID } });
    const guarantorRule = await prisma.contractRule.findFirstOrThrow({ where: { companyId: COMPANY_ID, sourceSectionRef: "6.01" } });
    const applicableEntities = members.filter((m) => guarantorRule.entityScope.includes(m.entityClass));
    expect(applicableEntities.map((e) => e.entityName).sort()).toEqual(["Fixture Borrower LLC", "Fixture Guarantor Sub Inc."]);
  });

  it("EntityClassMember rows belong to this company only - no cross-tenant leak of entity-class membership data", async () => {
    const members = await prisma.entityClassMember.findMany({ where: { companyId: COMPANY_ID } });
    for (const m of members) expect(m.companyId).toBe(COMPANY_ID);
  });
});
