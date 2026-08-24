import { describe, expect, it } from "vitest";
import {
  computeCovenantPosition,
  simulateAssetSale,
  simulateDebtIncurrence,
  simulateRestrictedPayment,
} from "../lib/covenant-engine";
import { COHERENT_CREDIT_AGREEMENT_ID, COHERENT_DATA, COHERENT_INDENTURE_ID } from "../prisma/seed-data";

/**
 * Oracle: the `m` and `sim` useMemo hooks from headroom-coherent.jsx,
 * transcribed verbatim (same formulas, same order) so this test has an
 * independent ground truth to check the DB-driven engine against. If the
 * engine's generalized formula evaluation ever drifts from what the
 * prototype actually computed for Coherent, these numbers will diverge.
 *
 * Known limitation: this oracle and COHERENT_DATA both trace back to the
 * same source (the headroom-coherent.jsx prototype's default state), so a
 * formula error that was already present in the prototype - and then
 * transcribed identically into both the oracle and the seed data - would NOT
 * be caught here; this test only proves the engine reproduces the prototype,
 * not that the prototype's math (or Coherent's actual covenant terms) is
 * correct. The synthetic-company and versioning tests elsewhere in this
 * suite are independent of this fixture and don't share that risk.
 */
function oracleM(fin: {
  ebitda: number;
  cash: number;
  interest: number;
  cni: number;
  equityProceeds: number;
  ratePct: number;
  totalDebt: number;
  securedDebt: number;
}) {
  const E = fin.ebitda;
  const r = fin.ratePct / 100;
  const { totalDebt, securedDebt, cash, interest, cni, equityProceeds } = fin;

  const netDebt = totalDebt - cash;
  const netSecured = securedDebt - cash;
  const tnl = netDebt / E;
  const ssnl = netSecured / E;
  const fccr = E / interest;

  const fccrCap = r > 0 ? Math.max(0, (E / 2 - interest) / r) : Infinity;
  const milaSec = Math.max(0, 3.0 * E - netSecured);
  const milaUnsec = Math.max(0, 5.0 * E - netDebt);
  const facA = Math.max(0, 4000 - securedDebt);
  const facB = Math.max(1320, 1.0 * E);
  const genDebt = Math.max(530, 0.4 * E);
  const lienRatio = Math.max(0, 3.0 * E - netSecured);
  const lienGen = Math.max(530, 0.4 * E);
  const lienCap = lienRatio + lienGen;

  const indSecDebtNominal = facA + facB + Math.max(milaSec, 0) + genDebt;
  const indSec = Math.min(indSecDebtNominal, lienCap, milaSec);
  const indUnsec = Math.max(fccrCap, milaUnsec);

  const builderStarter = Math.max(330, 0.25 * E);
  const builder = builderStarter + 0.5 * Math.max(0, cni) + equityProceeds;
  const genRP = Math.max(600, 0.45 * E);
  const ratioRPOpen = tnl <= 3.25;
  const ratioInvOpen = tnl <= 3.5;

  const excessProceedsThreshold = Math.max(35, 0.025 * E);

  const caTNLroom = Math.max(0, 4.25 * E - netDebt);
  const caICroom = r > 0 ? Math.max(0, (E / 2.5 - interest) / r) : Infinity;
  const caCap = Math.min(caTNLroom, caICroom);

  const docs = [
    { id: "ca", sec: caCap, unsec: caCap },
    { id: "ind", sec: indSec, unsec: indUnsec },
  ];
  const crossSec = Math.min(...docs.map((d) => d.sec));
  const crossUnsec = Math.min(...docs.map((d) => d.unsec));

  return {
    E,
    totalDebt,
    securedDebt,
    netDebt,
    netSecured,
    tnl,
    ssnl,
    fccr,
    milaSec,
    milaUnsec,
    indSec,
    indUnsec,
    builder,
    genRP,
    ratioRPOpen,
    ratioInvOpen,
    excessProceedsThreshold,
    caCap,
    docs,
    crossSec,
    crossUnsec,
  };
}

function oracleSim(
  m: ReturnType<typeof oracleM>,
  opts: {
    simAmt: number;
    simSecured: boolean;
    rate: number;
    cash: number;
    interest: number;
    rpAmt: number;
    invAmt: number;
    saleAmt: number;
    saleReinvest: boolean;
    ledger: { basket: string; amt: number; dir: string }[];
  }
) {
  const perDoc = m.docs.map((d) => {
    const cap = opts.simSecured ? d.sec : d.unsec;
    return { ...d, cap, ok: opts.simAmt <= cap };
  });
  const sorted = [...perDoc].sort((a, b) => a.cap - b.cap);
  const binding = sorted[0]!;
  const next = sorted[1];
  const cleared = opts.simAmt <= binding.cap;
  const r = opts.rate / 100;
  const addSec = opts.simSecured ? opts.simAmt : 0;
  const pf = {
    tnl: (m.totalDebt + opts.simAmt - opts.cash) / m.E,
    ssnl: (m.securedDebt + addSec - opts.cash) / m.E,
    fccr: m.E / (opts.interest + opts.simAmt * r),
  };

  const rpPoolUsed = opts.ledger
    .filter((e) => (e.basket === "dividend" || e.basket === "investment") && e.dir !== "credit")
    .reduce((s, e) => s + e.amt, 0);
  const builderLeft = Math.max(0, m.builder - Math.min(rpPoolUsed, m.builder));
  const genRPLeft = Math.max(0, m.genRP - Math.max(0, rpPoolUsed - m.builder));

  const rpWaterfall = (amt: number, ratioOpen: boolean) => {
    let remaining = amt;
    const steps: number[] = [];
    const take = (capAmt: number) => {
      if (remaining <= 0 || capAmt <= 0) return;
      const alloc = Math.min(remaining, capAmt);
      steps.push(alloc);
      remaining -= alloc;
    };
    take(builderLeft);
    take(genRPLeft);
    if (ratioOpen && remaining > 0) {
      steps.push(remaining);
      remaining = 0;
    }
    return { steps, remaining, cleared: remaining <= 0.0001 };
  };
  const rpResult = rpWaterfall(opts.rpAmt, m.ratioRPOpen);
  const rpPfTnl = (m.totalDebt - (opts.cash - opts.rpAmt)) / m.E;
  const invResult = rpWaterfall(opts.invAmt, m.ratioInvOpen);
  const invPfTnl = (m.totalDebt - (opts.cash - opts.invAmt)) / m.E;

  const netProceeds = opts.saleAmt;
  const excessProceeds = opts.saleReinvest ? 0 : Math.max(0, netProceeds - m.excessProceedsThreshold);
  const offerTriggered = excessProceeds > 0.0001;
  const salePfTnl = (m.totalDebt - (opts.cash + netProceeds)) / m.E;

  return {
    perDoc,
    binding,
    next,
    cleared,
    overall: binding.cap,
    pf,
    rpPoolUsed,
    builderLeft,
    genRPLeft,
    rpResult,
    rpPfTnl,
    invResult,
    invPfTnl,
    netProceeds,
    excessProceeds,
    offerTriggered,
    salePfTnl,
  };
}

// Prototype's default state values.
const PROTOTYPE_DEFAULTS = {
  simAmt: 1000,
  simSecured: true,
  rpAmt: 200,
  invAmt: 200,
  saleAmt: 300,
  saleReinvest: true,
};

const oracleFin = {
  ebitda: COHERENT_DATA.financials.ebitda,
  cash: COHERENT_DATA.financials.cash,
  interest: COHERENT_DATA.financials.interestExpense,
  cni: COHERENT_DATA.financials.cumulativeNetIncome,
  equityProceeds: COHERENT_DATA.financials.equityProceedsSinceIssue,
  ratePct: COHERENT_DATA.financials.assumedNewDebtRatePct,
  totalDebt: COHERENT_DATA.financials.totalDebt,
  securedDebt: COHERENT_DATA.financials.securedDebt,
};
const oracleLedger = COHERENT_DATA.ledger.map((e) => ({
  basket: e.basket === "DIVIDEND" ? "dividend" : e.basket === "INVESTMENT" ? "investment" : e.basket.toLowerCase(),
  amt: e.amount,
  dir: e.direction === "CREDIT" ? "credit" : "debit",
}));

describe("covenant-engine reproduces the Coherent prototype's numbers", () => {
  const m = oracleM(oracleFin);
  const sim = oracleSim(m, {
    simAmt: PROTOTYPE_DEFAULTS.simAmt,
    simSecured: PROTOTYPE_DEFAULTS.simSecured,
    rate: COHERENT_DATA.financials.assumedNewDebtRatePct,
    cash: COHERENT_DATA.financials.cash,
    interest: COHERENT_DATA.financials.interestExpense,
    rpAmt: PROTOTYPE_DEFAULTS.rpAmt,
    invAmt: PROTOTYPE_DEFAULTS.invAmt,
    saleAmt: PROTOTYPE_DEFAULTS.saleAmt,
    saleReinvest: PROTOTYPE_DEFAULTS.saleReinvest,
    ledger: oracleLedger,
  });

  it("sanity-checks the oracle against hand-computed prototype figures", () => {
    // These are the literal numbers the prototype renders for Coherent's FY2026 10-K inputs.
    expect(m.tnl).toBeCloseTo(1.2329411764705882, 9);
    expect(m.ssnl).toBeCloseTo(0.6229411764705882, 9);
    expect(m.fccr).toBeCloseTo(8.947368421052632, 9);
    expect(m.milaSec).toBeCloseTo(4041, 6);
    expect(m.milaUnsec).toBeCloseTo(6404, 6);
    expect(m.indSec).toBeCloseTo(4041, 6);
    expect(m.indUnsec).toBeCloseTo(10153.846153846154, 6);
    expect(m.caCap).toBeCloseTo(5129, 6);
    expect(m.crossSec).toBeCloseTo(4041, 6);
    expect(m.crossUnsec).toBeCloseTo(5129, 6);
    expect(m.builder).toBeCloseTo(2835, 6);
    expect(m.genRP).toBeCloseTo(765, 6);
  });

  const position = computeCovenantPosition(COHERENT_DATA);

  it("matches leverage metrics", () => {
    expect(position.metrics.totalNetLeverage).toBeCloseTo(m.tnl, 9);
    expect(position.metrics.seniorSecuredNetLeverage).toBeCloseTo(m.ssnl, 9);
    expect(position.metrics.fixedChargeCoverage).toBeCloseTo(m.fccr, 9);
  });

  it("matches per-document secured/unsecured capacity", () => {
    const ca = position.documents.find((d) => d.documentId === COHERENT_CREDIT_AGREEMENT_ID)!;
    const ind = position.documents.find((d) => d.documentId === COHERENT_INDENTURE_ID)!;

    expect(ca.securedCapacity).toBeCloseTo(m.caCap, 6);
    expect(ca.unsecuredCapacity).toBeCloseTo(m.caCap, 6);
    expect(ind.securedCapacity).toBeCloseTo(m.indSec, 6);
    expect(ind.unsecuredCapacity).toBeCloseTo(m.indUnsec, 6);
  });

  it("matches cross-document (binding) capacity", () => {
    expect(position.crossDocumentSecured.capacity).toBeCloseTo(m.crossSec, 6);
    expect(position.crossDocumentUnsecured.capacity).toBeCloseTo(m.crossUnsec, 6);
  });

  it("matches a simulated secured debt incurrence", () => {
    const result = simulateDebtIncurrence(
      COHERENT_DATA,
      position,
      PROTOTYPE_DEFAULTS.simAmt,
      PROTOTYPE_DEFAULTS.simSecured
    );

    expect(result.overallCapacity).toBeCloseTo(sim.overall, 6);
    expect(result.status === "clear").toBe(sim.cleared);
    expect(result.proForma.totalNetLeverage).toBeCloseTo(sim.pf.tnl, 9);
    expect(result.proForma.seniorSecuredNetLeverage).toBeCloseTo(sim.pf.ssnl, 9);
    expect(result.proForma.fixedChargeCoverage).toBeCloseTo(sim.pf.fccr, 9);

    // Indenture is the binding constraint (4041 < 5129) in the default scenario.
    expect(result.binding?.documentId).toBe(COHERENT_INDENTURE_ID);
  });

  it("matches a simulated dividend/buyback against the RP waterfall", () => {
    const result = simulateRestrictedPayment(
      COHERENT_DATA,
      position,
      COHERENT_INDENTURE_ID,
      PROTOTYPE_DEFAULTS.rpAmt,
      "dividend"
    );

    expect(result.status === "clear").toBe(sim.rpResult.cleared);
    expect(result.remaining).toBeCloseTo(sim.rpResult.remaining, 6);
    expect(result.poolUsed).toBeCloseTo(sim.rpPoolUsed, 6);
    expect(result.proFormaTotalNetLeverage).toBeCloseTo(sim.rpPfTnl, 9);
    expect(result.steps.map((s) => s.allocated)).toEqual(sim.rpResult.steps);
  });

  it("matches a simulated Investment against the shared RP pool", () => {
    const result = simulateRestrictedPayment(
      COHERENT_DATA,
      position,
      COHERENT_INDENTURE_ID,
      PROTOTYPE_DEFAULTS.invAmt,
      "investment"
    );

    expect(result.status === "clear").toBe(sim.invResult.cleared);
    expect(result.remaining).toBeCloseTo(sim.invResult.remaining, 6);
    expect(result.proFormaTotalNetLeverage).toBeCloseTo(sim.invPfTnl, 9);
    expect(result.steps.map((s) => s.allocated)).toEqual(sim.invResult.steps);
  });

  it("matches a simulated asset sale (reinvested, no offer triggered)", () => {
    const result = simulateAssetSale(
      COHERENT_DATA,
      position,
      COHERENT_INDENTURE_ID,
      PROTOTYPE_DEFAULTS.saleAmt,
      PROTOTYPE_DEFAULTS.saleReinvest
    );

    expect(result.excessProceedsThreshold).toBeCloseTo(m.excessProceedsThreshold, 6);
    expect(result.excessProceeds).toBeCloseTo(sim.excessProceeds, 6);
    expect(result.offerTriggered).toBe(sim.offerTriggered);
    expect(result.proFormaTotalNetLeverage).toBeCloseTo(sim.salePfTnl, 9);
  });

  it("triggers a mandatory offer when an asset sale is not reinvested and exceeds the threshold", () => {
    const result = simulateAssetSale(COHERENT_DATA, position, COHERENT_INDENTURE_ID, 300, false);
    const oracle = oracleSim(m, {
      simAmt: PROTOTYPE_DEFAULTS.simAmt,
      simSecured: PROTOTYPE_DEFAULTS.simSecured,
      rate: COHERENT_DATA.financials.assumedNewDebtRatePct,
      cash: COHERENT_DATA.financials.cash,
      interest: COHERENT_DATA.financials.interestExpense,
      rpAmt: PROTOTYPE_DEFAULTS.rpAmt,
      invAmt: PROTOTYPE_DEFAULTS.invAmt,
      saleAmt: 300,
      saleReinvest: false,
      ledger: oracleLedger,
    });

    expect(result.offerTriggered).toBe(oracle.offerTriggered);
    expect(result.excessProceeds).toBeCloseTo(oracle.excessProceeds, 6);
  });
});
