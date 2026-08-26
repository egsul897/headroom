/**
 * Amendment fixture (task §39, docs/contract-model-foundation-phase-b.md) -
 * Base Credit Agreement -> Amendment 1 -> Amendment 2, modeling a threshold
 * change, a definition change, a new exception, and a deleted clause. No
 * LLM needed (task's own instruction). Verifies historical state is
 * preserved, effective periods are correct, and the operative version as of
 * a selected date is correct (task §12/§27's getOperativeContractualState).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { computeStableKey } from "../../lib/contract-model/stable-keys";
import { getOperativeContractualState } from "../../lib/contract-model/service";

const COMPANY_ID = "fixture-amendment-versioning-co";
const BASE_CA_ID = "fixture-amendment-versioning-base-ca";
const AMENDMENT_1_ID = "fixture-amendment-versioning-amend1";
const AMENDMENT_2_ID = "fixture-amendment-versioning-amend2";

const ORIGINAL_DATE = new Date("2020-01-01");
const AMENDMENT_1_DATE = new Date("2022-06-01");
const AMENDMENT_2_DATE = new Date("2024-03-01");

async function teardown() {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
}

describe("Amendment effects + operative version model (task §12/§13/§39)", () => {
  let originalDebtRuleId: string;
  let amendedDebtRuleId: string;
  let originalEbitdaTermId: string;
  let amendedEbitdaTermId: string;
  let deletedClauseRuleId: string;

  beforeAll(async () => {
    await teardown();
    await prisma.company.create({ data: { id: COMPANY_ID, name: "Fixture Amendment Versioning Co (synthetic, test-only)", tenantKind: "EVALUATION" } });
    await prisma.document.create({ data: { id: BASE_CA_ID, companyId: COMPANY_ID, name: "Fixture Base Credit Agreement", type: "CREDIT_AGREEMENT", effectiveFrom: ORIGINAL_DATE } });
    await prisma.document.create({ data: { id: AMENDMENT_1_ID, companyId: COMPANY_ID, name: "Fixture Amendment No. 1", type: "AMENDMENT", effectiveFrom: AMENDMENT_1_DATE, supersedesDocumentId: BASE_CA_ID } });
    await prisma.document.create({ data: { id: AMENDMENT_2_ID, companyId: COMPANY_ID, name: "Fixture Amendment No. 2", type: "AMENDMENT", effectiveFrom: AMENDMENT_2_DATE, supersedesDocumentId: AMENDMENT_1_ID } });

    await prisma.documentRelationshipEdge.create({ data: { companyId: COMPANY_ID, sourceDocumentId: AMENDMENT_1_ID, targetDocumentId: BASE_CA_ID, relationshipType: "AMENDS", effectiveDate: AMENDMENT_1_DATE } });
    await prisma.documentRelationshipEdge.create({ data: { companyId: COMPANY_ID, sourceDocumentId: AMENDMENT_2_ID, targetDocumentId: AMENDMENT_1_ID, relationshipType: "AMENDS", effectiveDate: AMENDMENT_2_DATE } });

    // --- MODIFY_THRESHOLD: general debt basket $50M -> $75M as of Amendment 1 ---
    const originalDebtRule = await prisma.contractRule.create({
      data: { companyId: COMPANY_ID, sourceDocumentId: BASE_CA_ID, stableKey: computeStableKey("rule", COMPANY_ID, BASE_CA_ID, "6.01(a)", "v1"), covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", evaluationClass: "EXECUTABLE", action: "INCUR_DEBT", thresholdValue: 50, thresholdUnit: "USD_MILLIONS", sourceSectionRef: "6.01(a)", effectiveFrom: ORIGINAL_DATE, effectiveTo: AMENDMENT_1_DATE },
    });
    originalDebtRuleId = originalDebtRule.id;
    const amendedDebtRule = await prisma.contractRule.create({
      data: { companyId: COMPANY_ID, sourceDocumentId: AMENDMENT_1_ID, stableKey: computeStableKey("rule", COMPANY_ID, BASE_CA_ID, "6.01(a)", "v2"), covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", evaluationClass: "EXECUTABLE", action: "INCUR_DEBT", thresholdValue: 75, thresholdUnit: "USD_MILLIONS", sourceSectionRef: "6.01(a)", effectiveFrom: AMENDMENT_1_DATE },
    });
    amendedDebtRuleId = amendedDebtRule.id;
    await prisma.contractRule.update({ where: { id: originalDebtRuleId }, data: { supersededByRuleId: amendedDebtRuleId } });
    await prisma.amendmentEffect.create({
      data: { companyId: COMPANY_ID, amendmentDocumentId: AMENDMENT_1_ID, effectType: "MODIFY_THRESHOLD", targetRuleId: originalDebtRuleId, effectiveDate: AMENDMENT_1_DATE, description: "General debt basket increased from $50M to $75M", oldValueSnapshot: { thresholdValue: 50 }, newValueSnapshot: { thresholdValue: 75 }, sourceSectionRef: "Amendment No. 1 §2.01" },
    });

    // --- MODIFY_DEFINITION: Consolidated EBITDA definition changed as of Amendment 1 ---
    const originalEbitdaTerm = await prisma.definedTermNode.create({ data: { companyId: COMPANY_ID, documentId: BASE_CA_ID, stableKey: computeStableKey("term", COMPANY_ID, BASE_CA_ID, "Consolidated EBITDA", "v1"), termName: "Consolidated EBITDA", normalizedName: "consolidated ebitda", effectiveFrom: ORIGINAL_DATE, effectiveTo: AMENDMENT_1_DATE } });
    originalEbitdaTermId = originalEbitdaTerm.id;
    const amendedEbitdaTerm = await prisma.definedTermNode.create({ data: { companyId: COMPANY_ID, documentId: AMENDMENT_1_ID, stableKey: computeStableKey("term", COMPANY_ID, BASE_CA_ID, "Consolidated EBITDA", "v2"), termName: "Consolidated EBITDA", normalizedName: "consolidated ebitda", effectiveFrom: AMENDMENT_1_DATE } });
    amendedEbitdaTermId = amendedEbitdaTerm.id;
    await prisma.amendmentEffect.create({
      data: { companyId: COMPANY_ID, amendmentDocumentId: AMENDMENT_1_ID, effectType: "MODIFY_DEFINITION", targetTermId: originalEbitdaTermId, effectiveDate: AMENDMENT_1_DATE, description: "Consolidated EBITDA definition amended to add a new addback category", sourceSectionRef: "Amendment No. 1 §2.02" },
    });

    // --- ADD_EXCEPTION as of Amendment 2 (does not change the debt rule's own effective window - purely additive) ---
    await prisma.amendmentEffect.create({
      data: { companyId: COMPANY_ID, amendmentDocumentId: AMENDMENT_2_ID, effectType: "ADD_EXCEPTION", targetRuleId: amendedDebtRuleId, effectiveDate: AMENDMENT_2_DATE, description: "Added an exception for debt incurred to finance a Permitted Acquisition", sourceSectionRef: "Amendment No. 2 §3.01" },
    });

    // --- DELETE_TEXT/REMOVE_COVENANT: a reporting clause deleted entirely as of Amendment 2 (no successor rule) ---
    const deletedClauseRule = await prisma.contractRule.create({
      data: { companyId: COMPANY_ID, sourceDocumentId: BASE_CA_ID, stableKey: computeStableKey("rule", COMPANY_ID, BASE_CA_ID, "6.01(k)"), covenantFamily: "REPORTING_INFORMATION", ruleType: "REPORTING_OBLIGATION", evaluationClass: "MONITORABLE", action: "DELIVER_NOTICE", sourceSectionRef: "6.01(k)", effectiveFrom: ORIGINAL_DATE, effectiveTo: AMENDMENT_2_DATE },
    });
    deletedClauseRuleId = deletedClauseRule.id;
    await prisma.amendmentEffect.create({
      data: { companyId: COMPANY_ID, amendmentDocumentId: AMENDMENT_2_ID, effectType: "REMOVE_COVENANT", targetRuleId: deletedClauseRuleId, effectiveDate: AMENDMENT_2_DATE, description: "Section 6.01(k)'s notice requirement was deleted in its entirety", sourceSectionRef: "Amendment No. 2 §3.02" },
    });
  });

  afterAll(teardown);

  it("historical state is preserved - the original rule/term rows still exist, unmodified in content, after being superseded", async () => {
    const originalRule = await prisma.contractRule.findUniqueOrThrow({ where: { id: originalDebtRuleId } });
    expect(originalRule.thresholdValue?.toNumber()).toBe(50);
    expect(originalRule.supersededByRuleId).toBe(amendedDebtRuleId);

    const originalTerm = await prisma.definedTermNode.findUniqueOrThrow({ where: { id: originalEbitdaTermId } });
    expect(originalTerm.documentId).toBe(BASE_CA_ID);
  });

  it("operative-as-of-date BEFORE Amendment 1 resolves to the ORIGINAL $50M threshold and EBITDA definition", async () => {
    const state = await getOperativeContractualState(COMPANY_ID, new Date("2021-01-01"));
    const debtRule = state.operativeRules.find((r) => r.id === originalDebtRuleId || r.id === amendedDebtRuleId);
    expect(debtRule?.id).toBe(originalDebtRuleId);
    expect(debtRule?.thresholdValue?.toNumber()).toBe(50);

    const ebitdaTerm = state.operativeDefinedTerms.find((t) => t.id === originalEbitdaTermId || t.id === amendedEbitdaTermId);
    expect(ebitdaTerm?.id).toBe(originalEbitdaTermId);
  });

  it("operative-as-of-date AFTER Amendment 1 but BEFORE Amendment 2 resolves to the AMENDED $75M threshold, and the reporting clause is still operative (not yet deleted)", async () => {
    const state = await getOperativeContractualState(COMPANY_ID, new Date("2023-01-01"));
    const debtRule = state.operativeRules.find((r) => r.id === originalDebtRuleId || r.id === amendedDebtRuleId);
    expect(debtRule?.id).toBe(amendedDebtRuleId);
    expect(debtRule?.thresholdValue?.toNumber()).toBe(75);

    expect(state.operativeRules.some((r) => r.id === deletedClauseRuleId)).toBe(true);
  });

  it("operative-as-of-date AFTER Amendment 2 no longer includes the deleted reporting clause", async () => {
    const state = await getOperativeContractualState(COMPANY_ID, new Date("2025-01-01"));
    expect(state.operativeRules.some((r) => r.id === deletedClauseRuleId)).toBe(false);
    // The amended debt rule (with its Amendment-2 exception layered on top via AmendmentEffect, not a new rule version) is still operative.
    expect(state.operativeRules.some((r) => r.id === amendedDebtRuleId)).toBe(true);
  });

  it("the AmendmentEffect rows themselves form a complete, queryable audit trail of what changed and when", async () => {
    const effects = await prisma.amendmentEffect.findMany({ where: { companyId: COMPANY_ID }, orderBy: { effectiveDate: "asc" } });
    expect(effects.map((e) => e.effectType)).toEqual(["MODIFY_THRESHOLD", "MODIFY_DEFINITION", "ADD_EXCEPTION", "REMOVE_COVENANT"]);
  });

  it("the document relationship graph represents both AMENDS edges without collapsing the three documents into one", async () => {
    const edges = await prisma.documentRelationshipEdge.findMany({ where: { companyId: COMPANY_ID }, orderBy: { effectiveDate: "asc" } });
    expect(edges).toHaveLength(2);
    expect(edges[0]).toMatchObject({ sourceDocumentId: AMENDMENT_1_ID, targetDocumentId: BASE_CA_ID, relationshipType: "AMENDS" });
    expect(edges[1]).toMatchObject({ sourceDocumentId: AMENDMENT_2_ID, targetDocumentId: AMENDMENT_1_ID, relationshipType: "AMENDS" });
  });
});
