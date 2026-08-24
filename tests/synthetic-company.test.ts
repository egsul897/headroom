import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma";
import {
  computeCovenantPosition,
  loadCompanyCovenantData,
  simulateAssetSale,
  simulateDebtIncurrence,
  simulateRestrictedPayment,
  type CompanyCovenantData,
  type CovenantPosition,
} from "../lib/covenant-engine";

/**
 * Acceptance test: a SECOND company, with its own document names, provision
 * codes, formula mix, financials, debt levels, and historical ledger usage -
 * none of them borrowed from Coherent - run through the exact same code path
 * every page uses (loadCompanyCovenantData -> computeCovenantPosition ->
 * simulate*), inserted directly into Postgres via Prisma (not through
 * prisma/seed-data.ts, and not via lib/coherent.ts, which only ever loads
 * Coherent's id). If this company's numbers come out right without any of
 * lib/covenant-engine.ts, lib/coherent.ts, or the app/ pages being touched,
 * the calculation + data-access layer is proven company-agnostic, not just
 * "generalized for Coherent's shape of data."
 *
 * Deliberately NOT exercised here: rendering the actual Next.js page routes
 * for this company. Those routes default to Coherent (DEFAULT_COMPANY_ID in
 * lib/coherent.ts) because there is intentionally no multi-tenant account
 * switcher - per explicit scope, this phase does not add one. Every function
 * a page calls is proven generic below; only the page-level "which company"
 * selection remains hardcoded to Coherent, which is a UI scope decision, not
 * a calculation-engine limitation.
 */

const COMPANY_ID = "acme-synthco-test";
const CA_DOC_ID = "acme-synthco-credit-agreement";
const NOTES_DOC_ID = "acme-synthco-secured-notes";

const FIN = {
  ebitda: 500,
  cash: 80,
  interestExpense: 40,
  cumulativeNetIncome: 90,
  equityProceedsSinceIssue: 0,
  assumedNewDebtRatePct: 7.25,
  totalDebt: 900,
  securedDebt: 600,
};

async function insertFixture() {
  await prisma.company.create({
    data: { id: COMPANY_ID, name: "Acme Synthetic Holdings, Inc.", ticker: "ASYN", cik: "0009999999" },
  });

  await prisma.document.create({
    data: {
      id: CA_DOC_ID,
      companyId: COMPANY_ID,
      name: "Term Loan Credit Agreement",
      type: "CREDIT_AGREEMENT",
      governs: "Term Loan B",
      capacityFormulas: {
        secured: { op: "MIN", items: [{ op: "REF", code: "leverage_covenant" }, { op: "REF", code: "coverage_covenant" }] },
        unsecured: { op: "MIN", items: [{ op: "REF", code: "leverage_covenant" }, { op: "REF", code: "coverage_covenant" }] },
      },
    },
  });

  await prisma.document.create({
    data: {
      id: NOTES_DOC_ID,
      companyId: COMPANY_ID,
      name: "Senior Secured Notes Indenture",
      type: "INDENTURE",
      governs: "Senior Secured Notes",
      capacityFormulas: {
        secured: {
          op: "MIN",
          items: [
            { op: "SUM", items: [{ op: "REF", code: "flat_debt_basket" }, { op: "REF", code: "grower_basket" }], label: "General debt baskets" },
            { op: "REF", code: "secured_leverage_prong" },
          ],
        },
        unsecured: { op: "REF", code: "unsecured_prong" },
      },
      rpWaterfall: {
        steps: [{ code: "builder_basket_rp" }, { code: "general_rp_basket" }],
        ratioGateCodeByKind: { dividend: "rp_gate_dividend", investment: "rp_gate_investment" },
      },
      assetSale: { thresholdCode: "excess_proceeds_thresh", reinvestmentWindowDays: 200 },
    },
  });

  const provisions: {
    id: string;
    documentId: string;
    code: string;
    basketName: string;
    sectionRef: string;
    formulaType: string;
    thresholdValue: number;
    params?: object;
  }[] = [
    { id: "asyn-p1", documentId: CA_DOC_ID, code: "leverage_covenant", basketName: "Maintenance leverage covenant", sectionRef: "§5.1(a)", formulaType: "LEVERAGE_RATIO_ROOM", thresholdValue: 4.0, params: { debtBasis: "total" } },
    { id: "asyn-p2", documentId: CA_DOC_ID, code: "coverage_covenant", basketName: "Maintenance coverage covenant", sectionRef: "§5.1(b)", formulaType: "COVERAGE_RATIO_ROOM", thresholdValue: 2.0 },
    { id: "asyn-p3", documentId: NOTES_DOC_ID, code: "flat_debt_basket", basketName: "Credit facilities basket", sectionRef: "§2.1(a)", formulaType: "FLAT_NET_OF_DEBT", thresholdValue: 1500, params: { netOfBasis: "secured" } },
    { id: "asyn-p4", documentId: NOTES_DOC_ID, code: "grower_basket", basketName: "General debt basket", sectionRef: "§2.1(b)", formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA", thresholdValue: 300, params: { pctEbitda: 0.5 } },
    { id: "asyn-p5", documentId: NOTES_DOC_ID, code: "secured_leverage_prong", basketName: "MILA — secured prong", sectionRef: "§2.1(c)", formulaType: "LEVERAGE_RATIO_ROOM", thresholdValue: 2.5, params: { debtBasis: "secured" } },
    { id: "asyn-p6", documentId: NOTES_DOC_ID, code: "unsecured_prong", basketName: "MILA — unsecured prong", sectionRef: "§2.1(d)", formulaType: "LEVERAGE_RATIO_ROOM", thresholdValue: 4.5, params: { debtBasis: "total" } },
    { id: "asyn-p7", documentId: NOTES_DOC_ID, code: "builder_basket_rp", basketName: "Builder basket", sectionRef: "§3.1(a)", formulaType: "BUILDER_BASKET", thresholdValue: 100, params: { pctEbitda: 0.2, cniSharePct: 0.5, includeEquityProceeds: true } },
    { id: "asyn-p8", documentId: NOTES_DOC_ID, code: "general_rp_basket", basketName: "General RP basket", sectionRef: "§3.1(b)", formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA", thresholdValue: 200, params: { pctEbitda: 0.3 } },
    { id: "asyn-p9", documentId: NOTES_DOC_ID, code: "rp_gate_dividend", basketName: "Ratio RP (unlimited) — dividends", sectionRef: "§3.1(c)(i)", formulaType: "RATIO_GATE", thresholdValue: 1.75, params: { debtBasis: "total" } },
    { id: "asyn-p10", documentId: NOTES_DOC_ID, code: "rp_gate_investment", basketName: "Ratio RP (unlimited) — investments", sectionRef: "§3.1(c)(ii)", formulaType: "RATIO_GATE", thresholdValue: 1.5, params: { debtBasis: "total" } },
    { id: "asyn-p11", documentId: NOTES_DOC_ID, code: "excess_proceeds_thresh", basketName: "Excess Proceeds threshold", sectionRef: "§4.1", formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA", thresholdValue: 40, params: { pctEbitda: 0.02 } },
  ];

  for (const p of provisions) {
    await prisma.covenantProvision.create({
      data: {
        id: p.id,
        companyId: COMPANY_ID,
        documentId: p.documentId,
        code: p.code,
        basketName: p.basketName,
        sectionRef: p.sectionRef,
        formulaType: p.formulaType as never,
        thresholdValue: p.thresholdValue,
        params: p.params,
      },
    });
  }

  await prisma.financialSnapshot.create({
    data: { id: "asyn-snap-1", companyId: COMPANY_ID, asOfDate: new Date("2026-01-01"), ...FIN },
  });

  // Historical usage BEFORE this test runs any simulation - proves the
  // synthetic company's numbers already reflect ledger state, not just a
  // pristine zero-usage fixture.
  await prisma.ledgerEntry.create({
    data: {
      id: "asyn-ledger-1",
      companyId: COMPANY_ID,
      date: new Date("2026-02-01"),
      description: "Prior-quarter dividend",
      basket: "DIVIDEND",
      amount: 50,
      direction: "DEBIT",
      source: "test fixture",
    },
  });
}

async function deleteFixture() {
  await prisma.ledgerEntry.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.financialSnapshot.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.covenantProvision.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.document.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
}

describe("a second, structurally different company runs through the same engine + data-access path", () => {
  let data: CompanyCovenantData;
  let position: CovenantPosition;

  beforeAll(async () => {
    await deleteFixture(); // in case a prior failed run left rows behind
    await insertFixture();
    data = await loadCompanyCovenantData(prisma, COMPANY_ID);
    position = computeCovenantPosition(data);
  });

  afterAll(async () => {
    await deleteFixture();
  });

  it("carries none of Coherent's identifiers", () => {
    const codes = data.provisions.map((p) => p.code);
    const docIds = data.documents.map((d) => d.id);
    expect(codes).not.toContain("mila_secured");
    expect(codes).not.toContain("ratio_debt_fccr");
    expect(docIds).not.toContain("coherent-2029-notes-indenture");
    expect(data.companyId).toBe(COMPANY_ID);
  });

  it("computes leverage metrics from this company's own financials", () => {
    expect(position.metrics.totalNetLeverage).toBeCloseTo(820 / 500, 9);
    expect(position.metrics.seniorSecuredNetLeverage).toBeCloseTo(520 / 500, 9);
    expect(position.metrics.fixedChargeCoverage).toBeCloseTo(12.5, 9);
  });

  it("Position: computes per-document and cross-document debt capacity", () => {
    const ca = position.documents.find((d) => d.documentId === CA_DOC_ID)!;
    const notes = position.documents.find((d) => d.documentId === NOTES_DOC_ID)!;

    expect(ca.securedStatus).toBe("modeled");
    expect(ca.securedCapacity).toBeCloseTo(1180, 6);
    expect(ca.unsecuredCapacity).toBeCloseTo(1180, 6);

    expect(notes.securedStatus).toBe("modeled");
    expect(notes.securedCapacity).toBeCloseTo(730, 6);
    expect(notes.unsecuredCapacity).toBeCloseTo(1430, 6);
    // The labeled SUM node surfaces as a named subtotal, same mechanism Coherent's "Lien capacity" uses.
    expect(notes.securedLabeledSubtotals.find((s) => s.label === "General debt baskets")?.value).toBeCloseTo(1200, 6);

    expect(position.crossDocumentSecured.status).toBe("modeled");
    expect(position.crossDocumentSecured.capacity).toBeCloseTo(730, 6);
    expect(position.crossDocumentSecured.bindingDocumentId).toBe(NOTES_DOC_ID);

    expect(position.crossDocumentUnsecured.status).toBe("modeled");
    expect(position.crossDocumentUnsecured.capacity).toBeCloseTo(1180, 6);
    expect(position.crossDocumentUnsecured.bindingDocumentId).toBe(CA_DOC_ID);
  });

  it("Simulate: secured debt incurrence clears under the notes' capacity and blocks over it", () => {
    const clears = simulateDebtIncurrence(data, position, 500, true);
    expect(clears.status).toBe("clear");
    expect(clears.overallCapacity).toBeCloseTo(730, 6);

    const blocks = simulateDebtIncurrence(data, position, 800, true);
    expect(blocks.status).toBe("blocked");
    expect(blocks.binding?.documentId).toBe(NOTES_DOC_ID);
  });

  it("Simulate: unsecured debt incurrence is bound by the credit agreement instead", () => {
    const sim = simulateDebtIncurrence(data, position, 1000, false);
    expect(sim.status).toBe("clear");
    expect(sim.overallCapacity).toBeCloseTo(1180, 6);
    expect(sim.binding?.documentId).toBe(CA_DOC_ID);
  });

  it("Simulate (non-debt): a restricted payment already reflects the prior quarter's $50M dividend usage", () => {
    const headroom = simulateRestrictedPayment(data, position, NOTES_DOC_ID, 0, "dividend");
    expect(headroom.status).toBe("clear");
    expect(headroom.poolUsed).toBeCloseTo(50, 6);
    // Builder basket would be 145 with zero usage; $50M already drawn leaves 95.
    expect(headroom.stepCapacitiesRemaining["builder_basket_rp"]).toBeCloseTo(95, 6);
    expect(headroom.stepCapacitiesRemaining["general_rp_basket"]).toBeCloseTo(200, 6);

    // A further $120M draw spends the already-reduced builder capacity first, then general.
    const draw = simulateRestrictedPayment(data, position, NOTES_DOC_ID, 120, "dividend");
    expect(draw.status).toBe("clear");
    expect(draw.steps).toEqual([
      { code: "builder_basket_rp", basketName: "Builder basket", sectionRef: "§3.1(a)", allocated: 95 },
      { code: "general_rp_basket", basketName: "General RP basket", sectionRef: "§3.1(b)", allocated: 25 },
    ]);
  });

  it("Simulate (asset sale): a different transaction type also runs cleanly for this company", () => {
    const sim = simulateAssetSale(data, position, NOTES_DOC_ID, 60, false);
    expect(sim.status).toBe("clear");
    expect(sim.excessProceedsThreshold).toBeCloseTo(40, 6);
    expect(sim.excessProceeds).toBeCloseTo(20, 6);
    expect(sim.offerTriggered).toBe(true);
  });
});
