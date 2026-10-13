/**
 * Integrated path: FIXED_POINT / uncapped EBITDA build-up → leverage ratio
 * with fulfillment join + non-positive denominator refusal.
 *
 * SYNTHETIC_LABELED component packs — not Neon / not certificate-as-derived.
 */
import { describe, expect, it } from "vitest";
import { evaluateExpression } from "@/lib/contract-model/runtime/evaluate-expression";
import { evaluateLeverageOrCoverageRatio } from "@/lib/contract-model/runtime/leverage-ratio";
import { buildFinancialInformationRequest } from "@/lib/contract-model/runtime/input/information-request";
import type { FinancialSnapshot } from "@/lib/contract-model/runtime/input/types";
import { fixtureInputResolver, metricInput } from "@/lib/contract-model/runtime/input-resolver";
import { rationalFromNumber } from "@/lib/contract-model/runtime/decimal";
import { money } from "@/lib/contract-model/runtime/values";
import { withExpressionId } from "@/lib/contract-model/ir/identity";
import {
  calculateContractualLeverage,
  coherentEbitdaBuildupLeverageRequest,
  matthewsEbitdaBuildupLeverageRequest,
  COHERENT_EBITDA_COMPONENTS,
  COHERENT_FINANCIALS,
  MATTHEWS_FINANCIALS,
  compileMatthewsEbitdaBuildup,
  coherentTotalNetLeverageRequest,
} from "@/lib/product/contractual-leverage";
import { ADD, DIV, METRIC, MONEY, MUL, PCT, MIN, TERM, definition, m, resetIds } from "../contract-model/runtime/helpers";
import { beforeEach } from "vitest";

beforeEach(resetIds);

describe("FIXED_POINT_ADDBACK_CAP runtime", () => {
  it("solves E = B + min(A, c·E) exactly (uncapped branch)", () => {
    const expr = withExpressionId({
      kind: "FIXED_POINT_ADDBACK_CAP",
      type: "MONEY",
      base: MONEY(1500),
      addbacks: MONEY(200),
      capFraction: 0.15,
      capBase: "RESULT",
      eligibility: null,
    });
    const res = evaluateExpression({ expression: expr, inputs: fixtureInputResolver({}) });
    expect(res.status).toBe("EXECUTABLE");
    expect(res.value).toMatchObject({ type: "MONEY", amount: "1700" });
  });

  it("solves capped branch E = B/(1−c) exactly", () => {
    // B=100, A=40, c=0.15 → A > 0.15·140 → E = 100/0.85
    const expr = withExpressionId({
      kind: "FIXED_POINT_ADDBACK_CAP",
      type: "MONEY",
      base: MONEY(100),
      addbacks: MONEY(40),
      capFraction: 0.15,
      capBase: "RESULT",
      eligibility: null,
    });
    const res = evaluateExpression({ expression: expr, inputs: fixtureInputResolver({}) });
    expect(res.status).toBe("EXECUTABLE");
    // 100/0.85 = 10000/85 = 2000/17
    expect(res.value).toMatchObject({ type: "MONEY", amount: "2000/17" });
  });

  it("preserves ordinary CYCLE for DEFINED_TERM self-reference (not a substitute for FIXED_POINT)", () => {
    const calc = ADD(METRIC("CNI"), MIN(METRIC("Qualified Addbacks"), MUL(PCT(0.15), TERM("Consolidated EBITDA"))));
    const def = definition("ir-definition:ce-cycle", "Consolidated EBITDA", calc);
    const res = evaluateExpression({
      expression: TERM("Consolidated EBITDA"),
      inputs: fixtureInputResolver({
        definitions: [def],
        metrics: [
          metricInput("CNI", m("100"), { source: "t", sourceVersion: "1" }),
          metricInput("Qualified Addbacks", m("40"), { source: "t", sourceVersion: "1" }),
        ],
      }),
    });
    expect(res.status).toBe("ERROR");
    expect(res.diagnostics.some((d) => d.code === "CYCLE")).toBe(true);
  });

  it("refuses negative base rather than inventing a sign convention", () => {
    const expr = withExpressionId({
      kind: "FIXED_POINT_ADDBACK_CAP",
      type: "MONEY",
      base: MONEY(-10),
      addbacks: MONEY(5),
      capFraction: 0.15,
      capBase: "RESULT",
      eligibility: null,
    });
    const res = evaluateExpression({ expression: expr, inputs: fixtureInputResolver({}) });
    expect(res.status).toBe("ERROR");
    expect(res.diagnostics.at(-1)!.code).toBe("FIXED_POINT_CAP_UNSUPPORTED");
  });
});

describe("leverage/coverage non-positive denominator boundary", () => {
  it("refuses negative EBITDA at leverage boundary; generic DIVIDE still evaluates", () => {
    const ratio = DIV(MONEY(100), MONEY(-10), "RATIO");
    const generic = evaluateExpression({ expression: ratio, inputs: fixtureInputResolver({}) });
    expect(generic.status).toBe("EXECUTABLE");
    expect(generic.value).toMatchObject({ value: "-10" });

    const leverage = evaluateLeverageOrCoverageRatio({
      expression: ratio,
      inputs: fixtureInputResolver({}),
      ratioKind: "LEVERAGE",
    });
    expect(leverage.status).toBe("ERROR");
    expect(leverage.diagnostics.some((d) => d.code === "NON_POSITIVE_DENOMINATOR")).toBe(true);
    expect(leverage.value).toBeNull();
  });
});

describe("information-request fulfillment join", () => {
  it("marks missing required metrics and never treats them as zero", () => {
    const snapshot: FinancialSnapshot = {
      snapshotId: "snap-1",
      version: "v1",
      companyId: "co",
      asOf: "2026-06-30",
      reportingPeriod: "TTM",
      status: "APPROVED",
      supersedesSnapshotId: null,
      inputs: [
        {
          identity: {
            companyId: "co",
            scope: { kind: "INSTRUMENT_LEVEL", instrumentKey: "inst" },
            inputKind: "METRIC",
            key: "Gross Debt",
            identityStrength: "CONTRACT_NAME_ONLY",
            period: { kind: "NOT_PERIOD_SPECIFIC" },
            asOf: { kind: "NOT_AS_OF_SPECIFIC" },
            valueType: "MONEY",
            currency: "USD",
          },
          value: money(rationalFromNumber(100), "USD", { exprId: null, inputKeys: ["Gross Debt"] }),
          sourceVersion: "cert-1",
        },
      ],
      provenance: { source: "test", sourceVersion: "1" },
      review: { reviewedBy: "tester", reviewedAt: "2026-06-30", approvalRef: "apr-1" },
    };
    const ratio = DIV(METRIC("Gross Debt"), METRIC("Consolidated EBITDA"), "RATIO");
    const req = buildFinancialInformationRequest({
      expression: ratio,
      snapshots: [snapshot],
      companyId: "co",
      instrumentKey: "inst",
    });
    expect(req.executable).toBe(false);
    expect(req.summary.MISSING).toBeGreaterThanOrEqual(1);
    expect(req.blocking.some((b) => b.dependency.key === "Consolidated EBITDA")).toBe(true);
    expect(req.blocking.some((b) => b.requestText?.includes("not be treated as zero"))).toBe(true);
  });
});

describe("Coherent FIXED_POINT EBITDA build-up → Total Net Leverage", () => {
  it("derives EBITDA 1700 from components and computes leverage matching seed financials", () => {
    const result = calculateContractualLeverage(coherentEbitdaBuildupLeverageRequest());
    expect(result.status).toBe("COMPUTED");
    expect(result.ebitdaBuildupKind).toBe("COHERENT_CAPPED_ADDBACK");
    expect(result.derivedEbitdaMillions).toBeCloseTo(1700, 6);
    expect(result.debtHeadroomIsVerifiedCapacity).toBe(false);
    expect(result.limitations.some((l) => /not verified available debt capacity/i.test(l))).toBe(true);
    const expectedRatio =
      (COHERENT_FINANCIALS.totalDebt! - COHERENT_FINANCIALS.cash!) / 1700;
    expect(result.currentRatio).toBeCloseTo(expectedRatio, 6);
    expect(result.formulaDisplay).toMatch(/FIXED_POINT/);
  });

  it("fails closed when a build-up component is missing (does not use certificate EBITDA)", () => {
    const { "Restructuring Integration Transaction Costs": _drop, ...rest } = COHERENT_EBITDA_COMPONENTS;
    const result = calculateContractualLeverage(
      coherentEbitdaBuildupLeverageRequest(rest, { ...COHERENT_FINANCIALS, ebitda: 1700 }),
    );
    expect(result.status).toBe("MISSING_INPUTS");
    expect(result.currentRatio).toBeNull();
    expect(result.missingRequirements.some((m) => /Restructuring/i.test(m))).toBe(true);
  });
});

describe("Matthews uncapped SUM EBITDA build-up → Secured Net Leverage (second definition)", () => {
  it("derives EBITDA from uncapped limbs and computes secured net leverage", () => {
    const buildup = compileMatthewsEbitdaBuildup({
      companyId: "matthews",
      instrumentKey: "matthews-indenture-2027-notes",
      documentId: "matthews-indenture-2027-notes",
      sectionRef: "§1.01",
      excerpt: "Consolidated EBITDA",
    });
    expect(buildup.kind).toBe("MATTHEWS_UNCAPPED_SUM");
    expect(buildup.requiredMetricKeys).not.toContain("Restructuring Integration Transaction Costs");

    const result = calculateContractualLeverage(matthewsEbitdaBuildupLeverageRequest());
    expect(result.status).toBe("COMPUTED");
    expect(result.ebitdaBuildupKind).toBe("MATTHEWS_UNCAPPED_SUM");
    expect(result.derivedEbitdaMillions).toBeCloseTo(128.313, 6);
    const expectedRatio =
      (MATTHEWS_FINANCIALS.securedDebt! - MATTHEWS_FINANCIALS.cash!) / 128.313;
    expect(result.currentRatio).toBeCloseTo(expectedRatio, 6);
    expect(result.debtHeadroomIsVerifiedCapacity).toBe(false);
  });
});

describe("caller-supplied EBITDA path still works (labeled not independently derived)", () => {
  it("computes Coherent TNL from black-box contractual EBITDA with disclosure", () => {
    const result = calculateContractualLeverage(coherentTotalNetLeverageRequest());
    expect(result.status).toBe("COMPUTED");
    expect(result.limitations.some((l) => /not independently derived/i.test(l))).toBe(true);
    expect(result.debtHeadroomIsVerifiedCapacity).toBe(false);
  });
});
