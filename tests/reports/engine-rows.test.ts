/**
 * Reviewer R1/R2 probes, through the REAL engine: buildCovenantOverview →
 * buildDebtRatioTests → buildRatioRowFromTest. No hand-made ratio rows.
 */
import { describe, expect, it } from "vitest";
import { buildCovenantOverview } from "@/lib/covenant-overview-builder";
import { buildDebtRatioTests, computeCovenantPosition, type CompanyCovenantData, type SolverNativeCompanyContext } from "@/lib/covenant-engine";
import { getFinancialPosition } from "@/lib/financial-core/position-service";
import { fact, type FinancialState } from "@/lib/financial-core/types";
import { buildComplianceReport, toCertificateModel } from "@/lib/reports/build";
import { buildKeyRatios, FCCR_NOT_DETERMINABLE, type RatioRowLike } from "@/lib/reports/key-ratios";

const CO = "engine-probe-co";
const AS_OF = new Date("2027-03-31T00:00:00.000Z");
const DOC = "engine-probe-ca";

// EBITDA 100, interest 30, debt 600, cash 100 ⇒ TNL 5.0x, EBITDA/interest 3.33x.
const state: FinancialState = {
  id: "s1", companyId: CO, asOfDate: AS_OF, periodType: "ACTUAL", scope: { kind: "CONSOLIDATED" }, effectiveFrom: null, effectiveTo: null,
  balanceSheetFacts: { cash: fact(100, "REPORTED", AS_OF), totalDebtPrincipal: fact(600, "REPORTED", AS_OF), securedDebtPrincipal: fact(400, "REPORTED", AS_OF) },
  incomeStatementFacts: { gaapEbitda: fact(100, "REPORTED", AS_OF), cumulativeNetIncomeSinceIssue: fact(10, "REPORTED", AS_OF), equityProceedsSinceIssue: fact(0, "REPORTED", AS_OF), interestExpense: fact(30, "REPORTED", AS_OF) },
  covenantMetricFacts: { assumedNewDebtRatePct: fact(6, "ASSUMED", AS_OF) },
};
const covenantData: CompanyCovenantData = {
  companyId: CO,
  documents: [{ id: DOC, name: "Credit Agreement", type: "CREDIT_AGREEMENT", governs: "Term Loan" }],
  provisions: [
    // Incurrence tests (ratio debt baskets), exactly what the Reviewer probed.
    { id: "ratio-debt", documentId: DOC, code: "rd", basketName: "Ratio Debt", sectionRef: "§7.03(r)", formulaType: "LEVERAGE_RATIO_ROOM", thresholdValue: 3.0, params: {} },
    { id: "ratio-cov", documentId: DOC, code: "rc", basketName: "Ratio Debt (coverage)", sectionRef: "§7.03(s)", formulaType: "COVERAGE_RATIO_ROOM", thresholdValue: 2.0, params: {} },
  ],
  financials: { ebitda: 100, cash: 100, interestExpense: 30, cumulativeNetIncome: 10, equityProceedsSinceIssue: 0, assumedNewDebtRatePct: 6, totalDebt: 600, securedDebt: 400 },
  ledger: [],
};
const solver: SolverNativeCompanyContext = {
  permissions: [], relationships: [], sharedConstraints: [], collateralScopes: [], ruleActivationConditions: [], coverageDeclarations: [], ratioProvisions: [],
  activationState: { asOfDate: AS_OF, series: {}, events: [], usageCounts: {}, unknownKeys: new Set() },
  asOfDate: AS_OF, entityClasses: ["BORROWER"], incurringEntity: { id: "b", name: "Probe Co" }, guarantorStatus: "GUARANTOR", collateralPools: [], requestedLienPriority: [],
};
const core = buildCovenantOverview({
  asOfDate: AS_OF, covenantData, financialPosition: getFinancialPosition(state, [], [], AS_OF, []), solverContext: solver,
  permissionRows: [], coverageDeclarations: [], documentNameById: new Map([[DOC, "Credit Agreement"]]),
});
const overview = { company: { id: CO, name: "Probe Co" }, ...core };
const ratioRows = core.covenantFamilies.flatMap((f) => f.rows).filter((r) => r.kind === "RATIO") as unknown as RatioRowLike[];

describe("engine probe sanity (the rows really come from buildDebtRatioTests)", () => {
  it("both incurrence tests are MODELED engine rows; the coverage row is EBITDA/interest", () => {
    const tests = buildDebtRatioTests(covenantData, computeCovenantPosition(covenantData), 0, false);
    expect(tests.map((t) => t.provisionId).sort()).toEqual(["ratio-cov", "ratio-debt"]);
    const cov = ratioRows.find((r) => /Fixed Charge/.test(r.name))!;
    expect(cov.status).toBe("MODELED");
    expect(cov.currentRatio).toBeCloseTo(100 / 30);
    const lev = ratioRows.find((r) => /Ratio Debt$/.test(r.name))!;
    expect(lev.currentRatio).toBeCloseTo(5.0);
  });
});

describe("R2: incurrence tests never become a covenant PASS/FAIL on the certificate", () => {
  const r = buildComplianceReport(CO, overview);
  const m = toCertificateModel(r);
  it("no line is evaluated (the engine does not flag maintenance covenants) — the 3.00x ratio-debt basket at 5.0x is NOT a FAIL", () => {
    expect(m.lines.length).toBeGreaterThan(0);
    for (const l of m.lines) expect(l).toMatchObject({ evaluated: null, required: null, actual: null, headroom: null });
    for (const c of r.certificate) expect(c).toMatchObject({ testKind: "NOT_FLAGGED", result: "NOT_EVALUATED" });
    expect(JSON.stringify(r.certificate)).not.toMatch(/IN_COMPLIANCE|NOT_IN_COMPLIANCE/);
  });
  it("a row the engine flags INCURRENCE is excluded; a flagged MAINTENANCE row passes through only the engine's verdict", () => {
    const flagged = {
      ...overview,
      covenantFamilies: overview.covenantFamilies.map((f) => ({
        ...f,
        rows: f.rows.map((row) => (row.kind !== "RATIO" ? row : /Fixed Charge/.test(row.name) ? { ...row, testKind: "INCURRENCE" as const } : { ...row, testKind: "MAINTENANCE" as const })),
      })),
    };
    const fr = buildComplianceReport(CO, flagged);
    expect(fr.certificate.find((c) => /Fixed Charge/.test(c.covenant))).toBeUndefined();
    // MAINTENANCE but no engine verdict ⇒ still NOT_EVALUATED (the report does not re-derive one).
    expect(fr.certificate.every((c) => c.result === "NOT_EVALUATED")).toBe(true);
    expect(toCertificateModel(fr).lines.every((l) => l.evaluated === null)).toBe(true);
  });
});

describe("R1: FCCR is never the generic EBITDA/interest row", () => {
  const metrics = { genericGrossLeverage: { status: "OK", value: 6.0 }, genericNetLeverage: { status: "OK", value: 5.0 }, genericSecuredLeverage: { status: "OK", value: 3.0 }, genericInterestCoverage: { status: "OK", value: 100 / 30 } };
  const k = buildKeyRatios(metrics, ratioRows);
  const by = (id: string) => k.find((x) => x.id === id)!;
  it("FCCR is NOT DETERMINABLE with the real 'Fixed Charge / Interest Coverage' engine row present", () => {
    expect(by("fccr")).toMatchObject({ value: null, limitLabel: null, clause: null, source: FCCR_NOT_DETERMINABLE });
    expect(JSON.stringify(k)).not.toMatch(/as defined in/);
  });
  it("incurrence basket limits are never paired with key ratios; generic values are labelled generic", () => {
    for (const x of k) expect(x.limitLabel).toBeNull();
    expect(by("interest").source).toMatch(/^Generic position metric/);
    expect(by("net")).toMatchObject({ value: 5.0, clause: null });
  });
  it("only an engine-flagged maintenance row under the agreement's FCCR definition is used", () => {
    const row = ratioRows.find((r) => /Fixed Charge/.test(r.name))!;
    expect(buildKeyRatios(null, [{ ...row, testKind: "INCURRENCE", agreementDefinedMetric: "FIXED_CHARGE_COVERAGE" }])[4]!.value).toBeNull();
    expect(buildKeyRatios(null, [{ ...row, testKind: "MAINTENANCE" }])[4]!.value).toBeNull();
    expect(buildKeyRatios(null, [{ ...row, testKind: "MAINTENANCE", agreementDefinedMetric: "FIXED_CHARGE_COVERAGE" }])[4]).toMatchObject({ value: row.currentRatio, clause: "Credit Agreement §7.03(s)" });
  });
});
