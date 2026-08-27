/**
 * Tenant/workspace isolation (task §29/§80, docs/contract-model-foundation-phase-b.md).
 * Customer A must never reference or retrieve Customer B's contract-model
 * objects. Every new Phase B model carries companyId; this proves both that
 * query-level filtering already holds and that lib/contract-model/validators.ts's
 * validateTenantIsolation would catch it if it ever didn't.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { computeStableKey } from "../../lib/contract-model/stable-keys";
import { validateTenantIsolation } from "../../lib/contract-model/validators";
import { getRulesByCovenantFamily, getUnresolvedReferences, getInstruments, getDocumentsForInstrument } from "../../lib/contract-model/service";

const COMPANY_A = "fixture-tenant-isolation-co-a";
const COMPANY_B = "fixture-tenant-isolation-co-b";
const DOCUMENT_A = "fixture-tenant-isolation-ca-a";
const DOCUMENT_B = "fixture-tenant-isolation-ca-b";

async function teardown() {
  await prisma.company.deleteMany({ where: { id: { in: [COMPANY_A, COMPANY_B] } } });
}

describe("Tenant/workspace isolation (task §29/§80)", () => {
  beforeAll(async () => {
    await teardown();
    await prisma.company.create({ data: { id: COMPANY_A, name: "Fixture Tenant Isolation Co A (synthetic, test-only)", tenantKind: "EVALUATION" } });
    await prisma.company.create({ data: { id: COMPANY_B, name: "Fixture Tenant Isolation Co B (synthetic, test-only)", tenantKind: "EVALUATION" } });
    await prisma.document.create({ data: { id: DOCUMENT_A, companyId: COMPANY_A, name: "Fixture Tenant Isolation Co A Credit Agreement", type: "CREDIT_AGREEMENT" } });
    await prisma.document.create({ data: { id: DOCUMENT_B, companyId: COMPANY_B, name: "Fixture Tenant Isolation Co B Credit Agreement", type: "CREDIT_AGREEMENT" } });

    await prisma.contractRule.create({ data: { companyId: COMPANY_A, sourceDocumentId: DOCUMENT_A, stableKey: computeStableKey("rule", COMPANY_A, DOCUMENT_A, "6.01"), covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", evaluationClass: "EXECUTABLE", action: "INCUR_DEBT", sourceSectionRef: "6.01" } });
    await prisma.contractRule.create({ data: { companyId: COMPANY_B, sourceDocumentId: DOCUMENT_B, stableKey: computeStableKey("rule", COMPANY_B, DOCUMENT_B, "6.01"), covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", evaluationClass: "EXECUTABLE", action: "INCUR_DEBT", sourceSectionRef: "6.01" } });

    await prisma.contractReferenceEdge.create({ data: { companyId: COMPANY_A, referenceType: "SUBJECT_TO", referenceText: "Company A's own unresolved reference", targetType: "UNRESOLVED", resolved: false, unresolvedReason: "test fixture" } });
    await prisma.contractReferenceEdge.create({ data: { companyId: COMPANY_B, referenceType: "SUBJECT_TO", referenceText: "Company B's own unresolved reference", targetType: "UNRESOLVED", resolved: false, unresolvedReason: "test fixture" } });
  });

  afterAll(teardown);

  it("a Company A query never returns a Company B rule, even though both share the exact same covenant family and action", async () => {
    const rulesA = await getRulesByCovenantFamily(COMPANY_A, "INDEBTEDNESS");
    expect(rulesA).toHaveLength(1);
    expect(rulesA[0]!.companyId).toBe(COMPANY_A);
    expect(rulesA[0]!.sourceDocumentId).toBe(DOCUMENT_A);

    const rulesB = await getRulesByCovenantFamily(COMPANY_B, "INDEBTEDNESS");
    expect(rulesB).toHaveLength(1);
    expect(rulesB[0]!.companyId).toBe(COMPANY_B);
  });

  it("getUnresolvedReferences is scoped per company - Company A never sees Company B's unresolved items", async () => {
    const unresolvedA = await getUnresolvedReferences(COMPANY_A);
    expect(unresolvedA.every((r) => r.companyId === COMPANY_A)).toBe(true);
    expect(unresolvedA.some((r) => r.referenceText.includes("Company B"))).toBe(false);
  });

  it("validateTenantIsolation passes cleanly for two companies with parallel but unconnected graphs", async () => {
    const result = await validateTenantIsolation(COMPANY_A, COMPANY_B);
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("validateTenantIsolation actually catches a real cross-tenant leak if one is deliberately introduced", async () => {
    const ruleB = await prisma.contractRule.findFirstOrThrow({ where: { companyId: COMPANY_B } });
    // Deliberately misconfigured: a Company A reference pointing at a Company B rule - exactly the leak task §29 forbids.
    await prisma.contractReferenceEdge.create({ data: { companyId: COMPANY_A, referenceType: "SUBJECT_TO", referenceText: "deliberately cross-tenant for this test", targetType: "RULE", targetRuleId: ruleB.id, resolved: true } });

    const result = await validateTenantIsolation(COMPANY_A, COMPANY_B);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.rule === "tenant-isolation")).toBe(true);
  });

  it("Phase 2C package-graph tables (DebtInstrument/DocumentRelationshipEdge) are tenant-scoped, and validateTenantIsolation catches a deliberately introduced cross-tenant relationship edge", async () => {
    const instrumentA = await prisma.debtInstrument.create({ data: { companyId: COMPANY_A, baseDocumentId: DOCUMENT_A, name: "Company A's own instrument" } });
    const instrumentB = await prisma.debtInstrument.create({ data: { companyId: COMPANY_B, baseDocumentId: DOCUMENT_B, name: "Company B's own instrument" } });
    await prisma.document.update({ where: { id: DOCUMENT_A }, data: { instrumentId: instrumentA.id } });
    await prisma.document.update({ where: { id: DOCUMENT_B }, data: { instrumentId: instrumentB.id } });

    const instrumentsA = await getInstruments(COMPANY_A);
    expect(instrumentsA).toHaveLength(1);
    expect(instrumentsA[0]!.id).toBe(instrumentA.id);
    const membersA = await getDocumentsForInstrument(instrumentA.id);
    expect(membersA.map((d) => d.id)).toEqual([DOCUMENT_A]);

    // Deliberately misconfigured: a Company A relationship edge pointing at Company B's document.
    await prisma.documentRelationshipEdge.create({ data: { companyId: COMPANY_A, sourceDocumentId: DOCUMENT_A, targetDocumentId: DOCUMENT_B, relationshipType: "AMENDS", sourceCitation: "deliberately cross-tenant for this test" } });

    const result = await validateTenantIsolation(COMPANY_A, COMPANY_B);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.message.includes("DocumentRelationshipEdge"))).toBe(true);
  });
});
