import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma";
import { computeCovenantPosition, loadCompanyCovenantData } from "../lib/covenant-engine";

/**
 * Acceptance test: amendment precedence is resolved purely by the
 * effectiveFrom/effectiveTo date-range filter in
 * lib/covenant-engine.ts's `effectiveDateFilter` - there is no document-name
 * or document-type special-casing anywhere in that logic. Three versions of
 * the SAME provision code, on the SAME document, prove:
 *   1. a transaction dated before the amendment sees the original threshold,
 *   2. a transaction dated on/after the amendment's effective date sees the
 *      amended threshold,
 *   3. a future-dated amendment that hasn't taken effect yet does not affect
 *      "today" (the default asOfDate).
 * Document-level effectiveFrom/effectiveTo dating goes through the exact
 * same `effectiveDateFilter` function, so it isn't duplicated here.
 */

const COMPANY_ID = "acme-versioning-test";
const DOC_ID = "acme-versioning-doc";
const CODE = "leverage_covenant";

const FIN = {
  ebitda: 100,
  cash: 0,
  interestExpense: 10,
  cumulativeNetIncome: 0,
  equityProceedsSinceIssue: 0,
  assumedNewDebtRatePct: 5,
  totalDebt: 0,
  securedDebt: 0,
};

async function insertFixture() {
  await prisma.company.create({
    data: { id: COMPANY_ID, name: "Versioning Test Co.", ticker: "VERS", cik: "0008888888" },
  });

  await prisma.document.create({
    data: {
      id: DOC_ID,
      companyId: COMPANY_ID,
      name: "Test Credit Agreement",
      type: "CREDIT_AGREEMENT",
      capacityFormulas: { secured: { op: "REF", code: CODE }, unsecured: { op: "REF", code: CODE } },
    },
  });

  // Original: effective 2024-01-01 through (not including) 2024-07-01.
  await prisma.covenantProvision.create({
    data: {
      id: "vers-p-original",
      companyId: COMPANY_ID,
      documentId: DOC_ID,
      code: CODE,
      basketName: "Maintenance leverage covenant",
      sectionRef: "§5.1(a) (original)",
      formulaType: "LEVERAGE_RATIO_ROOM",
      thresholdValue: 3.0,
      params: { debtBasis: "total" },
      effectiveFrom: new Date("2024-01-01"),
      effectiveTo: new Date("2024-07-01"),
    },
  });

  // Amendment No. 1: effective 2024-07-01 onward (open-ended - still current today).
  await prisma.covenantProvision.create({
    data: {
      id: "vers-p-amendment-1",
      companyId: COMPANY_ID,
      documentId: DOC_ID,
      code: CODE,
      basketName: "Maintenance leverage covenant",
      sectionRef: "§5.1(a) (as amended, Amendment No. 1)",
      formulaType: "LEVERAGE_RATIO_ROOM",
      thresholdValue: 4.0,
      params: { debtBasis: "total" },
      effectiveFrom: new Date("2024-07-01"),
      effectiveTo: null,
    },
  });

  // Amendment No. 2: signed but not yet effective - starts 2099.
  await prisma.covenantProvision.create({
    data: {
      id: "vers-p-amendment-2-future",
      companyId: COMPANY_ID,
      documentId: DOC_ID,
      code: CODE,
      basketName: "Maintenance leverage covenant",
      sectionRef: "§5.1(a) (as amended, Amendment No. 2)",
      formulaType: "LEVERAGE_RATIO_ROOM",
      thresholdValue: 999,
      params: { debtBasis: "total" },
      effectiveFrom: new Date("2099-01-01"),
      effectiveTo: null,
    },
  });

  await prisma.financialSnapshot.create({
    data: { id: "vers-snap-1", companyId: COMPANY_ID, asOfDate: new Date("2024-01-01"), ...FIN },
  });
}

async function deleteFixture() {
  await prisma.financialSnapshot.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.covenantProvision.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.document.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
}

describe("amendment precedence via effectiveFrom/effectiveTo date-range filtering only", () => {
  beforeAll(async () => {
    await deleteFixture();
    await insertFixture();
  });

  afterAll(async () => {
    await deleteFixture();
  });

  it("a transaction dated before the amendment sees only the original threshold", async () => {
    const data = await loadCompanyCovenantData(prisma, COMPANY_ID, new Date("2024-06-30"));
    expect(data.provisions).toHaveLength(1);
    expect(data.provisions[0]!.thresholdValue).toBe(3.0);
    expect(data.provisions[0]!.sectionRef).toContain("original");

    const position = computeCovenantPosition(data);
    const doc = position.documents.find((d) => d.documentId === DOC_ID)!;
    expect(doc.securedCapacity).toBeCloseTo(3.0 * 100, 6); // threshold * EBITDA, zero debt/cash
  });

  it("a transaction dated exactly on the amendment's effective date sees only the amended threshold", async () => {
    const data = await loadCompanyCovenantData(prisma, COMPANY_ID, new Date("2024-07-01"));
    expect(data.provisions).toHaveLength(1);
    expect(data.provisions[0]!.thresholdValue).toBe(4.0);
    expect(data.provisions[0]!.sectionRef).toContain("Amendment No. 1");

    const position = computeCovenantPosition(data);
    const doc = position.documents.find((d) => d.documentId === DOC_ID)!;
    expect(doc.securedCapacity).toBeCloseTo(4.0 * 100, 6);
  });

  it("a future-dated amendment does not affect a transaction dated today", async () => {
    const data = await loadCompanyCovenantData(prisma, COMPANY_ID, new Date());
    expect(data.provisions).toHaveLength(1);
    expect(data.provisions[0]!.thresholdValue).toBe(4.0);
    expect(data.provisions[0]!.sectionRef).not.toContain("Amendment No. 2");
  });
});
