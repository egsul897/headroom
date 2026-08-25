/**
 * Adversarial tests (task §23). Pure in-memory FinancialState/Facility/
 * DebtEvent fixtures - no Postgres round-trip needed since every function
 * under test here is a pure function of its inputs (capital-structure.ts,
 * liquidity.ts, metrics.ts, interest.ts, maturity.ts, scenario.ts,
 * solver-adapter.ts, provenance.ts). Company B (missing borrowing base) and
 * Company D (contractual solver unavailable) already cover those two §23
 * cases with real Postgres-backed fixtures - not duplicated here.
 */
import { describe, expect, it } from "vitest";
import { computeInterestResult, computeWeightedAverageRatePct } from "../../lib/financial-core/interest";
import { computeLiquidityPosition } from "../../lib/financial-core/liquidity";
import { computeMaturityAnalytics } from "../../lib/financial-core/maturity";
import { computeGenericFinancialMetrics } from "../../lib/financial-core/metrics";
import { buildCapitalStructureSummary } from "../../lib/financial-core/capital-structure";
import { getFinancialPosition } from "../../lib/financial-core/position-service";
import { blocksContractualDependent, isStale } from "../../lib/financial-core/provenance";
import { runScenario } from "../../lib/financial-core/scenario";
import { projectToLegacySnapshot } from "../../lib/financial-core/solver-adapter";
import { fact } from "../../lib/financial-core/types";
import type { DebtEvent, Facility, FinancialState, Scenario } from "../../lib/financial-core/types";

const COMPANY_ID = "adversarial-fixture-co";
const AS_OF = new Date("2027-01-01T00:00:00.000Z");

function state(overrides: Partial<FinancialState> = {}): FinancialState {
  return {
    id: "adv-state-1",
    companyId: COMPANY_ID,
    asOfDate: AS_OF,
    periodType: "ACTUAL",
    scope: { kind: "CONSOLIDATED" },
    effectiveFrom: null,
    effectiveTo: null,
    balanceSheetFacts: { cash: fact(100, "REPORTED", AS_OF), totalDebtPrincipal: fact(0, "RECONSTRUCTED", AS_OF), securedDebtPrincipal: fact(0, "RECONSTRUCTED", AS_OF) },
    incomeStatementFacts: { gaapEbitda: fact(200, "REPORTED", AS_OF), cumulativeNetIncomeSinceIssue: fact(0, "REPORTED", AS_OF), equityProceedsSinceIssue: fact(0, "REPORTED", AS_OF), interestExpense: fact(10, "REPORTED", AS_OF) },
    covenantMetricFacts: { assumedNewDebtRatePct: fact(6, "ASSUMED", AS_OF) },
    ...overrides,
  };
}

function facility(id: string, overrides: Partial<Facility> = {}): Facility {
  return {
    id,
    companyId: COMPANY_ID,
    name: id,
    facilityType: "TERM_LOAN",
    currency: { code: "USD" },
    originalPrincipal: 100,
    secured: false,
    couponType: "FIXED",
    couponPct: 5,
    maturityDate: new Date("2030-01-01"),
    issuedDate: new Date("2026-01-01"),
    obligorEntityClasses: [],
    guarantorEntityClasses: [],
    collateralPoolIds: [],
    originatingPermissionIds: [],
    effectiveFrom: null,
    effectiveTo: null,
    ...overrides,
  };
}

function issuance(facilityId: string, amount: number, date = new Date("2026-01-01")): DebtEvent {
  return { id: `${facilityId}-issuance-${date.getTime()}`, companyId: COMPANY_ID, facilityId, eventType: "ISSUANCE", date, amount, provenance: fact(amount, "REPORTED", date) };
}

describe("Adversarial: EBITDA/interest edge cases (task §23)", () => {
  it("zero EBITDA: generic leverage ratios are UNAVAILABLE_INVALID_DENOMINATOR, never zero/Infinity", () => {
    const s = state({ incomeStatementFacts: { ...state().incomeStatementFacts, gaapEbitda: fact(0, "REPORTED", AS_OF) } });
    const cs = buildCapitalStructureSummary(COMPANY_ID, AS_OF, [facility("f1")], [issuance("f1", 100)], 100);
    const interest = computeInterestResult(COMPANY_ID, [facility("f1")], [issuance("f1", 100)], AS_OF, []);
    const metrics = computeGenericFinancialMetrics(s, cs, interest);
    // EBITDA is the DENOMINATOR for leverage ratios - zero EBITDA makes those invalid.
    expect(metrics.genericGrossLeverage.status).toBe("UNAVAILABLE_INVALID_DENOMINATOR");
    expect(metrics.genericGrossLeverage.value).toBeNull();
    expect(metrics.genericNetLeverage.status).toBe("UNAVAILABLE_INVALID_DENOMINATOR");
    // EBITDA is the NUMERATOR for interest coverage - zero EBITDA over positive interest is a legitimate, computable 0x coverage, not an invalid-denominator case.
    expect(metrics.genericInterestCoverage.status).toBe("OK");
    expect(metrics.genericInterestCoverage.value).toBe(0);
  });

  it("missing EBITDA (neither gaapEbitda nor covenantEbitda): metrics MISSING_INPUT and projectToLegacySnapshot is NOT_COMPUTABLE", () => {
    const s = state({ incomeStatementFacts: { cumulativeNetIncomeSinceIssue: fact(0, "REPORTED", AS_OF), equityProceedsSinceIssue: fact(0, "REPORTED", AS_OF), interestExpense: fact(10, "REPORTED", AS_OF) } });
    const cs = buildCapitalStructureSummary(COMPANY_ID, AS_OF, [], [], 100);
    const interest = computeInterestResult(COMPANY_ID, [], [], AS_OF, []);
    const metrics = computeGenericFinancialMetrics(s, cs, interest);
    expect(metrics.genericGrossLeverage.status).toBe("UNAVAILABLE_MISSING_INPUT");
    expect(metrics.genericNetLeverage.status).toBe("UNAVAILABLE_MISSING_INPUT");
    expect(metrics.genericInterestCoverage.status).toBe("UNAVAILABLE_MISSING_INPUT");

    const projection = projectToLegacySnapshot(s);
    expect(projection.status).toBe("NOT_COMPUTABLE");
  });

  it("zero total annualized interest: generic interest coverage is UNAVAILABLE_INVALID_DENOMINATOR, never a manufactured Infinity", () => {
    // No facilities at all -> zero debt -> zero interest.
    const cs = buildCapitalStructureSummary(COMPANY_ID, AS_OF, [], [], 100);
    const interest = computeInterestResult(COMPANY_ID, [], [], AS_OF, []);
    expect(interest.totalAnnualizedCashInterest).toBe(0);
    const metrics = computeGenericFinancialMetrics(state(), cs, interest);
    expect(metrics.genericInterestCoverage.status).toBe("UNAVAILABLE_INVALID_DENOMINATOR");
    expect(metrics.genericInterestCoverage.value).not.toBe(Infinity);
    expect(metrics.genericInterestCoverage.value).toBeNull();
  });

  it("missing benchmark assumption: surfaced, never silently defaulted; company-wide WAC becomes unavailable, not partially computed", () => {
    const floatingFacility = facility("f-float", { couponType: "FLOATING", marginBps: 300, referenceRate: "LIBOR-NOT-SUPPLIED" });
    const fixedFacility = facility("f-fixed", { couponType: "FIXED", couponPct: 6 });
    const events = [issuance("f-float", 100), issuance("f-fixed", 100)];
    const interest = computeInterestResult(COMPANY_ID, [floatingFacility, fixedFacility], events, AS_OF, []); // no assumptions supplied at all
    const floatResult = interest.perInstrument.find((i) => i.facilityId === "f-float")!;
    expect(floatResult.status).toBe("MISSING_BENCHMARK_ASSUMPTION");
    expect(floatResult.annualizedCashInterest).toBeNull();
    expect(interest.hasMissingBenchmarkAssumption).toBe(true);
    // Fail closed: WAC is null, not silently computed over only the fixed instrument (which would understate true exposure).
    expect(computeWeightedAverageRatePct(interest)).toBeNull();
  });
});

describe("Adversarial: liquidity edge cases (task §23)", () => {
  it("overdrawn revolver (drawn exceeds commitment): negative availability surfaced, never clamped to zero or hidden", () => {
    const revolver = facility("f-rev", { facilityType: "REVOLVER", commitmentAmount: 100, secured: true });
    // 130 drawn against a 100 commitment - an inconsistent-but-real state a bank error/late-booked draw could produce.
    const events = [issuance("f-rev", 130)];
    const liquidity = computeLiquidityPosition(state(), [revolver], events, AS_OF);
    expect(liquidity.revolverDrawn).toBe(130);
    expect(liquidity.revolverAvailability).toBe(-30);
    expect(liquidity.revolverAvailabilityStatus).toBe("AVAILABLE"); // the input is well-formed; the RESULT is simply negative
  });

  it("LC usage alone exceeding what would otherwise be available: also surfaced as negative, never hidden", () => {
    const revolver = facility("f-rev2", { facilityType: "REVOLVER", commitmentAmount: 100, secured: true });
    const events = [issuance("f-rev2", 80), { id: "lc-1", companyId: COMPANY_ID, facilityId: "f-rev2", eventType: "LC_ISSUANCE" as const, date: new Date("2026-06-01"), amount: 30, provenance: fact(30, "REPORTED", AS_OF) }];
    const liquidity = computeLiquidityPosition(state(), [revolver], events, AS_OF);
    // 100 - 80 drawn - 30 LC = -10
    expect(liquidity.revolverAvailability).toBe(-10);
    expect(liquidity.undrawnCommitment).toBe(-10);
  });
});

describe("Adversarial: maturity bucket boundary (task §23)", () => {
  it("a maturity exactly 12 months out (by the documented day-count convention) is included in the 12-month bucket; one millisecond later is not", () => {
    const DAYS_PER_YEAR = 365.25;
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const exactlyTwelveMonths = new Date(AS_OF.getTime() + 12 * (DAYS_PER_YEAR / 12) * MS_PER_DAY);
    const oneMsAfter = new Date(exactlyTwelveMonths.getTime() + 1);

    const atBoundary = computeMaturityAnalytics(COMPANY_ID, [facility("f-boundary", { maturityDate: exactlyTwelveMonths })], [issuance("f-boundary", 50)], AS_OF);
    expect(atBoundary.dueWithin12Months).toBe(50);

    const justBeyond = computeMaturityAnalytics(COMPANY_ID, [facility("f-boundary2", { maturityDate: oneMsAfter })], [issuance("f-boundary2", 50)], AS_OF);
    expect(justBeyond.dueWithin12Months).toBe(0);
    expect(justBeyond.dueWithin24Months).toBe(50);
  });

  it("maturity wall buckets always sum to exactly total outstanding principal", () => {
    const facilities = [
      facility("w1", { maturityDate: new Date("2028-01-01") }),
      facility("w2", { maturityDate: new Date("2028-06-01") }), // same year as w1 - must combine into one bucket
      facility("w3", { maturityDate: new Date("2031-01-01") }),
    ];
    const events = [issuance("w1", 40), issuance("w2", 60), issuance("w3", 25)];
    const wall = computeMaturityAnalytics(COMPANY_ID, facilities, events, AS_OF);
    const total = wall.maturityWall.reduce((s, e) => s + e.principalMaturing, 0);
    expect(total).toBe(125);
    expect(wall.maturityWall.find((e) => e.year === 2028)?.principalMaturing).toBe(100);
  });
});

describe("Adversarial: scenario fail-closed validation (task §23/§29)", () => {
  const baseState = state({ balanceSheetFacts: { cash: fact(50, "REPORTED", AS_OF), totalDebtPrincipal: fact(100, "RECONSTRUCTED", AS_OF), securedDebtPrincipal: fact(0, "RECONSTRUCTED", AS_OF) } });
  const baseFacilities = [facility("adv-tl", { originalPrincipal: 100 }), facility("adv-rev", { facilityType: "REVOLVER", commitmentAmount: 60, originalPrincipal: 60, secured: true })];
  const baseEvents = [issuance("adv-tl", 100)];

  it("transaction larger than available cash (DIVIDEND) fails closed", () => {
    const scenario: Scenario = { id: "s-div", companyId: COMPANY_ID, baseFinancialStateId: baseState.id, actions: [{ kind: "DIVIDEND", amount: 999 }] };
    expect(() => runScenario(scenario, baseState, baseFacilities, baseEvents, AS_OF)).toThrow(/exceeding available cash/);
  });

  it("revolver draw larger than availability fails closed", () => {
    const scenario: Scenario = { id: "s-draw", companyId: COMPANY_ID, baseFinancialStateId: baseState.id, actions: [{ kind: "DRAW_REVOLVER", facilityId: "adv-rev", amount: 999 }] };
    expect(() => runScenario(scenario, baseState, baseFacilities, baseEvents, AS_OF)).toThrow(/exceeds available capacity/);
  });

  it("repayment larger than outstanding debt fails closed", () => {
    const scenario: Scenario = { id: "s-repay", companyId: COMPANY_ID, baseFinancialStateId: baseState.id, actions: [{ kind: "DEBT_REPAYMENT", facilityId: "adv-tl", amount: 200 }] };
    expect(() => runScenario(scenario, baseState, baseFacilities, baseEvents, AS_OF)).toThrow(/exceeds its outstanding principal/);
  });

  it("acquisition sources/uses imbalance fails closed", () => {
    const scenario: Scenario = {
      id: "s-acq-imbalance",
      companyId: COMPANY_ID,
      baseFinancialStateId: baseState.id,
      actions: [{ kind: "ACQUISITION", purchasePrice: 800, cashConsideration: 100, revolverFunding: null, newDebtFunding: null, acquiredEbitda: 50, synergyEbitda: 0, transactionFees: 0 }],
    };
    expect(() => runScenario(scenario, baseState, baseFacilities, baseEvents, AS_OF)).toThrow(/do not equal purchase price/);
  });

  it("duplicate action ordering: two repayments on the same facility are validated cumulatively, not independently against the base state", () => {
    // Outstanding = 100. Repay 60 (leaves 40), then repay 60 again - the
    // SECOND repayment must fail because only 40 remains, proving each
    // action is validated against the state produced by the PRIOR action,
    // not re-checked against the original base state (which alone would
    // have permitted both, since 60 <= 100 twice over).
    const richState = state({ balanceSheetFacts: { cash: fact(500, "REPORTED", AS_OF), totalDebtPrincipal: fact(100, "RECONSTRUCTED", AS_OF), securedDebtPrincipal: fact(0, "RECONSTRUCTED", AS_OF) } });
    const scenario: Scenario = { id: "s-dup", companyId: COMPANY_ID, baseFinancialStateId: richState.id, actions: [{ kind: "DEBT_REPAYMENT", facilityId: "adv-tl", amount: 60 }, { kind: "DEBT_REPAYMENT", facilityId: "adv-tl", amount: 60 }] };
    expect(() => runScenario(scenario, richState, baseFacilities, baseEvents, AS_OF)).toThrow(/exceeds its outstanding principal/);
  });

  it("scenario action ordering produces genuinely different results - forward order succeeds, reverse order fails closed", () => {
    const tightCashState = state({ balanceSheetFacts: { cash: fact(50, "REPORTED", AS_OF), totalDebtPrincipal: fact(0, "RECONSTRUCTED", AS_OF), securedDebtPrincipal: fact(0, "RECONSTRUCTED", AS_OF) } });
    const issueThenDividend: Scenario = {
      id: "s-order-1",
      companyId: COMPANY_ID,
      baseFinancialStateId: tightCashState.id,
      actions: [
        { kind: "DEBT_ISSUANCE", amount: 100, useOfProceeds: "GENERAL_CORPORATE", facilityDraft: { name: "Bridge Loan", facilityType: "TERM_LOAN", secured: false, couponType: "FIXED", couponPct: 5 } },
        { kind: "DIVIDEND", amount: 120 },
      ],
    };
    const dividendThenIssue: Scenario = { ...issueThenDividend, id: "s-order-2", actions: [...issueThenDividend.actions].reverse() };

    const forward = runScenario(issueThenDividend, tightCashState, [], [], AS_OF);
    expect(forward.proFormaState.balanceSheetFacts.cash.value).toBe(30); // 50 + 100 - 120

    expect(() => runScenario(dividendThenIssue, tightCashState, [], [], AS_OF)).toThrow(/exceeding available cash/);
  });

  it("non-mutation: base state/facilities/events are byte-identical before and after runScenario, including a scenario that throws", () => {
    const stateSnapshot = JSON.parse(JSON.stringify(baseState));
    const facilitiesSnapshot = JSON.parse(JSON.stringify(baseFacilities));
    const eventsSnapshot = JSON.parse(JSON.stringify(baseEvents));

    const okScenario: Scenario = { id: "s-nomut-ok", companyId: COMPANY_ID, baseFinancialStateId: baseState.id, actions: [{ kind: "CHANGE_EBITDA", ebitdaDelta: 5 }] };
    runScenario(okScenario, baseState, baseFacilities, baseEvents, AS_OF);
    expect(JSON.parse(JSON.stringify(baseState))).toEqual(stateSnapshot);
    expect(JSON.parse(JSON.stringify(baseFacilities))).toEqual(facilitiesSnapshot);
    expect(JSON.parse(JSON.stringify(baseEvents))).toEqual(eventsSnapshot);

    const throwingScenario: Scenario = { id: "s-nomut-throw", companyId: COMPANY_ID, baseFinancialStateId: baseState.id, actions: [{ kind: "DEBT_REPAYMENT", facilityId: "adv-tl", amount: 99999 }] };
    expect(() => runScenario(throwingScenario, baseState, baseFacilities, baseEvents, AS_OF)).toThrow();
    expect(JSON.parse(JSON.stringify(baseState))).toEqual(stateSnapshot);
    expect(JSON.parse(JSON.stringify(baseFacilities))).toEqual(facilitiesSnapshot);
    expect(JSON.parse(JSON.stringify(baseEvents))).toEqual(eventsSnapshot);
  });
});

describe("Adversarial: staleness and disputed facts (task §23)", () => {
  it("a fact past its staleness window is flagged stale; a fact within its window is not", () => {
    const staleFact = fact(100, "REPORTED", new Date("2026-10-01"), { maxAgeDays: 30 }); // ~92 days before AS_OF
    const freshFact = fact(100, "REPORTED", new Date("2026-12-20"), { maxAgeDays: 30 }); // ~12 days before AS_OF
    expect(isStale(staleFact, AS_OF)).toBe(true);
    expect(isStale(freshFact, AS_OF)).toBe(false);
  });

  it("a DISPUTED fact blocks a contractual dependent regardless of staleness; a stale (non-disputed) fact also blocks", () => {
    const disputedFresh = fact(100, "REPORTED", AS_OF, { reviewStatus: "DISPUTED" });
    const staleVerified = fact(100, "REPORTED", new Date("2026-01-01"), { reviewStatus: "VERIFIED", maxAgeDays: 30 });
    const freshVerified = fact(100, "REPORTED", AS_OF, { reviewStatus: "VERIFIED", maxAgeDays: 30 });
    expect(blocksContractualDependent(disputedFresh, AS_OF)).toBe(true);
    expect(blocksContractualDependent(staleVerified, AS_OF)).toBe(true);
    expect(blocksContractualDependent(freshVerified, AS_OF)).toBe(false);
  });

  it("a stale fact surfaces as a dashboard warning with an explicit staleness badge, without hard-failing the position", () => {
    const staleEbitdaState = state({ incomeStatementFacts: { ...state().incomeStatementFacts, gaapEbitda: fact(200, "REPORTED", new Date("2026-01-01"), { maxAgeDays: 60 }) } });
    const position = getFinancialPosition(staleEbitdaState, [], [], AS_OF);
    const entry = position.provenanceIndex["incomeStatementFacts.gaapEbitda"];
    expect(entry).toBeDefined();
    expect(entry!.isStale).toBe(true);
    expect(entry!.stalenessDays).toBeGreaterThan(60);
    expect(position.warnings.some((w) => w.category === "STALE_INPUT" && w.description.includes("gaapEbitda"))).toBe(true);
    // Not suppressed - the metric is still computed using the stale value.
    expect(position.metrics.genericGrossLeverage.status).toBe("OK");
  });

  it("a DISPUTED fact surfaces as a dashboard warning too", () => {
    const disputedCashState = state({ balanceSheetFacts: { ...state().balanceSheetFacts, cash: fact(100, "REPORTED", AS_OF, { reviewStatus: "DISPUTED" }) } });
    const position = getFinancialPosition(disputedCashState, [], [], AS_OF);
    expect(position.warnings.some((w) => w.category === "DISPUTED_FACT")).toBe(true);
  });
});
