/**
 * Event/obligation fixture (task §42/§25, docs/contract-model-foundation-phase-b.md).
 * Annual financials due 90 days after fiscal year end; an asset sale's
 * 365-day reinvestment period triggering a mandatory prepayment if unused.
 * Representation only - no scheduling/notification engine this phase.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { computeStableKey } from "../../lib/contract-model/stable-keys";

const COMPANY_ID = "fixture-event-obligation-co";
const DOCUMENT_ID = "fixture-event-obligation-ca";

async function teardown() {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
}

describe("Event/obligation representation foundation (task §25/§42)", () => {
  beforeAll(async () => {
    await teardown();
    await prisma.company.create({ data: { id: COMPANY_ID, name: "Fixture Event Obligation Co (synthetic, test-only)", tenantKind: "EVALUATION" } });
    await prisma.document.create({ data: { id: DOCUMENT_ID, companyId: COMPANY_ID, name: "Fixture Event Obligation Credit Agreement", type: "CREDIT_AGREEMENT" } });

    const reportingRule = await prisma.contractRule.create({
      data: { companyId: COMPANY_ID, sourceDocumentId: DOCUMENT_ID, stableKey: computeStableKey("rule", COMPANY_ID, DOCUMENT_ID, "6.01(a)"), covenantFamily: "REPORTING_INFORMATION", ruleType: "REPORTING_OBLIGATION", evaluationClass: "MONITORABLE", action: "DELIVER_FINANCIALS", sourceSectionRef: "6.01(a)" },
    });
    await prisma.contractEventObligation.create({
      data: {
        companyId: COMPANY_ID,
        stableKey: computeStableKey("obligation", COMPANY_ID, DOCUMENT_ID, "6.01(a)", "annual-financials"),
        sourceRuleId: reportingRule.id,
        eventType: "FISCAL_YEAR_END",
        conditionDescription: null,
        deadlineKind: "DAYS_AFTER_EVENT",
        deadlineDays: 90,
        requiredAction: "DELIVER_FINANCIALS",
        sourceSectionRef: "6.01(a)",
      },
    });

    const assetSaleRule = await prisma.contractRule.create({
      data: { companyId: COMPANY_ID, sourceDocumentId: DOCUMENT_ID, stableKey: computeStableKey("rule", COMPANY_ID, DOCUMENT_ID, "6.06(a)"), covenantFamily: "MANDATORY_PREPAYMENTS", ruleType: "MANDATORY_ACTION", evaluationClass: "EVENT_DRIVEN", action: "MAKE_MANDATORY_PREPAYMENT", sourceSectionRef: "6.06(a)" },
    });
    await prisma.contractEventObligation.create({
      data: {
        companyId: COMPANY_ID,
        stableKey: computeStableKey("obligation", COMPANY_ID, DOCUMENT_ID, "6.06(a)", "asset-sale-reinvestment"),
        sourceRuleId: assetSaleRule.id,
        eventType: "ASSET_SALE",
        conditionDescription: "Net cash proceeds not reinvested within the reinvestment period",
        deadlineKind: "DAYS_AFTER_EVENT",
        deadlineDays: 365,
        requiredAction: "MAKE_MANDATORY_PREPAYMENT",
        sourceSectionRef: "6.06(a)",
      },
    });
  });

  afterAll(teardown);

  it("annual financial statements: a fiscal-year-end event with a 90-day deadline to deliver financials is fully representable", async () => {
    const obligation = await prisma.contractEventObligation.findFirstOrThrow({ where: { companyId: COMPANY_ID, eventType: "FISCAL_YEAR_END" } });
    expect(obligation.deadlineKind).toBe("DAYS_AFTER_EVENT");
    expect(obligation.deadlineDays).toBe(90);
    expect(obligation.requiredAction).toBe("DELIVER_FINANCIALS");
    expect(obligation.satisfactionState).toBe("PENDING");
  });

  it("asset sale reinvestment: a 365-day conditional deadline triggering a mandatory prepayment only if the condition (unused proceeds) holds", async () => {
    const obligation = await prisma.contractEventObligation.findFirstOrThrow({ where: { companyId: COMPANY_ID, eventType: "ASSET_SALE" } });
    expect(obligation.deadlineDays).toBe(365);
    expect(obligation.conditionDescription).toContain("reinvestment period");
    expect(obligation.requiredAction).toBe("MAKE_MANDATORY_PREPAYMENT");
  });

  it("an obligation's satisfaction state is representable across its full lifecycle without a scheduling engine actually driving it (task §25's own 'representation only' scope)", async () => {
    const obligation = await prisma.contractEventObligation.findFirstOrThrow({ where: { companyId: COMPANY_ID, eventType: "FISCAL_YEAR_END" } });
    const satisfied = await prisma.contractEventObligation.update({ where: { id: obligation.id }, data: { satisfactionState: "SATISFIED" } });
    expect(satisfied.satisfactionState).toBe("SATISFIED");
    const reverted = await prisma.contractEventObligation.update({ where: { id: obligation.id }, data: { satisfactionState: "PENDING" } });
    expect(reverted.satisfactionState).toBe("PENDING");
  });

  it("each obligation links back to the ContractRule it originates from, so a future Dashboard could trace WHY the deadline exists", async () => {
    const obligation = await prisma.contractEventObligation.findFirstOrThrow({ where: { companyId: COMPANY_ID, eventType: "ASSET_SALE" }, include: { sourceRule: true } });
    expect(obligation.sourceRule?.sourceSectionRef).toBe("6.06(a)");
    expect(obligation.sourceRule?.covenantFamily).toBe("MANDATORY_PREPAYMENTS");
  });
});
