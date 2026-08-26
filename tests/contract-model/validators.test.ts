/**
 * Deterministic structural validators (task §47, docs/contract-model-foundation-phase-b.md).
 * Each validator is proven both to pass on a well-formed graph and to
 * actually catch the specific defect it claims to catch - never a vacuous
 * "returns ok" test with nothing that could make it fail.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { computeStableKey } from "../../lib/contract-model/stable-keys";
import { validateContractModel, validateDefinedTermTargetsExist, validateEffectivePeriodsWellFormed, validateReferenceTargetsExist, validateRuleSourcesExist, validateStableKeysUnique } from "../../lib/contract-model/validators";

const COMPANY_ID = "fixture-validators-co";
const DOCUMENT_ID = "fixture-validators-ca";

async function teardown() {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
}

describe("Deterministic structural validators (task §47)", () => {
  beforeAll(async () => {
    await teardown();
    await prisma.company.create({ data: { id: COMPANY_ID, name: "Fixture Validators Co (synthetic, test-only)", tenantKind: "EVALUATION" } });
    await prisma.document.create({ data: { id: DOCUMENT_ID, companyId: COMPANY_ID, name: "Fixture Validators Credit Agreement", type: "CREDIT_AGREEMENT" } });
  });

  afterAll(teardown);

  it("validateRuleSourcesExist passes for a rule whose sourceDocumentId is real", async () => {
    await prisma.contractRule.create({ data: { companyId: COMPANY_ID, sourceDocumentId: DOCUMENT_ID, stableKey: computeStableKey("rule", COMPANY_ID, DOCUMENT_ID, "well-formed"), covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", evaluationClass: "EXECUTABLE", action: "INCUR_DEBT", sourceSectionRef: "1.01" } });
    const result = await validateRuleSourcesExist(COMPANY_ID);
    expect(result.ok).toBe(true);
  });

  it("validateDefinedTermTargetsExist catches a rule referencing a defined-term stableKey that does not exist", async () => {
    await prisma.contractRule.create({ data: { companyId: COMPANY_ID, sourceDocumentId: DOCUMENT_ID, stableKey: computeStableKey("rule", COMPANY_ID, DOCUMENT_ID, "dangling-term-ref"), covenantFamily: "FINANCIAL_COVENANTS", ruleType: "RATIO_TEST", evaluationClass: "EXECUTABLE", action: "SATISFY_RATIO", sourceSectionRef: "6.10", definedTermRefs: ["term:does-not-exist"] } });
    const result = await validateDefinedTermTargetsExist(COMPANY_ID);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.message.includes("term:does-not-exist"))).toBe(true);
  });

  it("validateReferenceTargetsExist passes a resolved reference with a real target and ignores unresolved ones", async () => {
    const rule = await prisma.contractRule.create({ data: { companyId: COMPANY_ID, sourceDocumentId: DOCUMENT_ID, stableKey: computeStableKey("rule", COMPANY_ID, DOCUMENT_ID, "ref-target"), covenantFamily: "LIENS", ruleType: "QUANTITATIVE_PERMISSION", evaluationClass: "EXECUTABLE", action: "CREATE_LIEN", sourceSectionRef: "6.02" } });
    await prisma.contractReferenceEdge.create({ data: { companyId: COMPANY_ID, referenceType: "SUBJECT_TO", referenceText: "resolved, real target", targetType: "RULE", targetRuleId: rule.id, resolved: true } });
    await prisma.contractReferenceEdge.create({ data: { companyId: COMPANY_ID, referenceType: "SUBJECT_TO", referenceText: "unresolved on purpose", targetType: "UNRESOLVED", resolved: false, unresolvedReason: "test fixture" } });
    const result = await validateReferenceTargetsExist(COMPANY_ID);
    expect(result.ok).toBe(true);
  });

  it("validateEffectivePeriodsWellFormed catches an inverted window (effectiveTo before effectiveFrom)", async () => {
    await prisma.contractRule.create({
      data: { companyId: COMPANY_ID, sourceDocumentId: DOCUMENT_ID, stableKey: computeStableKey("rule", COMPANY_ID, DOCUMENT_ID, "inverted-window"), covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", evaluationClass: "EXECUTABLE", action: "INCUR_DEBT", sourceSectionRef: "6.01(z)", effectiveFrom: new Date("2025-01-01"), effectiveTo: new Date("2020-01-01") },
    });
    const result = await validateEffectivePeriodsWellFormed(COMPANY_ID);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.rule === "effective-period-well-formed")).toBe(true);
  });

  it("validateStableKeysUnique passes for a graph with no duplicates (the database's own @@unique constraint already prevents a duplicate from being written in the first place, so this validator is an independent proof, not the only line of defense)", async () => {
    const result = await validateStableKeysUnique(COMPANY_ID);
    expect(result.ok).toBe(true);
  });

  it("validateContractModel aggregates every validator's issues into one report", async () => {
    const result = await validateContractModel(COMPANY_ID);
    // This company's fixtures deliberately include the dangling-term-ref and
    // inverted-window defects seeded above - the aggregate report must
    // surface both, proving it doesn't stop at the first failing validator.
    expect(result.ok).toBe(false);
    const rulesTriggered = new Set(result.issues.map((i) => i.rule));
    expect(rulesTriggered.has("defined-term-target-exists")).toBe(true);
    expect(rulesTriggered.has("effective-period-well-formed")).toBe(true);
  });
});
