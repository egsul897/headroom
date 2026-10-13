/**
 * Held-out independent calculation oracles for the Autonomous Financial Computation audit.
 *
 * IMMUTABLE CONTRACT: expected values / refusal codes below are derived outside the engine
 * under audit. Do not edit expectations to match a failing engine — fix production code, or
 * record a confirmed defect / representation gap in docs/autonomous-financial-computation-audit/.
 *
 * Scope: complementary to covenant-capacity-mathematics and peer dashboard/compiler agents.
 * These cases stress financial-definition composition, dependency completeness, and arithmetic
 * edges that basket templates do not trivially cover.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { evaluateExpression } from "@/lib/contract-model/runtime/evaluate-expression";
import { buildDependencyGraph } from "@/lib/contract-model/runtime/dependency-graph";
import { buildFinancialDependencyManifest } from "@/lib/contract-model/runtime/input/manifest";
import { EMPTY_RESOLVER, metricInput } from "@/lib/contract-model/runtime/input-resolver";
import {
  ADD,
  CMP,
  DIV,
  DURING,
  MAX,
  METRIC,
  MIN,
  MONEY,
  MUL,
  PCT,
  RATIO,
  SUB,
  TERM,
  definition,
  m,
  metrics,
  resetIds,
  resolver,
  SRC,
} from "../contract-model/runtime/helpers";

beforeEach(resetIds);

const ev = (expression: Parameters<typeof evaluateExpression>[0]["expression"], inputs = EMPTY_RESOLVER) =>
  evaluateExpression({ expression, inputs });

/** Independent oracle: net debt with cash-netting cap and non-negative floor. */
function oracleNetDebt(grossDebt: number, cash: number, cashCap: number): number {
  return Math.max(0, grossDebt - Math.min(cash, cashCap));
}

/** Independent oracle: leverage when denominator is positive; refuse otherwise. */
function oracleLeverage(netDebt: number, ebitda: number): { ok: true; value: number } | { ok: false; reason: "NON_POSITIVE_DENOMINATOR" } {
  if (ebitda <= 0) return { ok: false, reason: "NON_POSITIVE_DENOMINATOR" };
  return { ok: true, value: netDebt / ebitda };
}

/** Independent oracle for algebraic addback cap E = B + min(A, c·E) when A,B,c ≥ 0. */
function oracleCappedAddbackFixedPoint(base: number, addbacks: number, capFraction: number): number {
  // E = B + min(A, c·E). If A ≤ c·(B+A) then uncapped E = B+A; else E = B/(1-c).
  const uncapped = base + addbacks;
  if (addbacks <= capFraction * uncapped) return uncapped;
  return base / (1 - capFraction);
}

describe("A — financial definition composition (adversarial, hand-authored IR)", () => {
  it("cash netting with floor: MAX(0, Debt − MIN(Cash, Cap)) matches independent oracle", () => {
    const gross = 250_000_000;
    const cash = 140_000_000;
    const cap = 100_000_000;
    const expected = oracleNetDebt(gross, cash, cap);
    expect(expected).toBe(150_000_000);

    const expr = MAX(
      MONEY(0),
      SUB(METRIC("Gross Debt"), MIN(METRIC("Unrestricted Cash"), MONEY(cap))),
    );
    const res = ev(
      expr,
      metrics(
        ["Gross Debt", m(String(gross))],
        ["Unrestricted Cash", m(String(cash))],
      ),
    );
    expect(res.status).toBe("EXECUTABLE");
    expect(res.value).toMatchObject({ type: "MONEY", amount: String(expected) });
  });

  it("fail-closed: missing cash for netting is NEEDS_INPUT, never zero cash", () => {
    const expr = SUB(METRIC("Gross Debt"), MIN(METRIC("Unrestricted Cash"), MONEY(100_000_000)));
    const res = ev(expr, metrics(["Gross Debt", m("250000000")]));
    expect(res.status).toBe("NEEDS_INPUT");
    expect(res.value).toBeNull();
    expect(res.missingInputKeys).toContain("Unrestricted Cash");
  });

  it("cross-currency cash netting fails closed (no FX invent)", () => {
    const expr = SUB(METRIC("Gross Debt"), METRIC("Cash EUR"));
    const res = ev(
      expr,
      resolver({
        metrics: [
          metricInput("Gross Debt", m("100", "USD"), SRC),
          metricInput("Cash EUR", m("40", "EUR"), SRC),
        ],
      }),
    );
    expect(res.status).toBe("ERROR");
    expect(res.diagnostics.at(-1)!.code).toBe("CURRENCY_MISMATCH_NO_CONVERSION_MODELED");
    expect(res.value).toBeNull();
  });

  it("REPRESENTATION GAP: recursive addback cap self-reference is CYCLE, not fixed-point solve", () => {
    // Contract pattern: "plus the lesser of (x) addbacks and (y) 15% of Consolidated EBITDA"
    // where Consolidated EBITDA is the term being defined. Algebraic oracle exists; IR has no
    // FIXED_POINT / SOLVE_FOR primitive, so honest encoding via DEFINED_TERM self-reference cycles.
    const calc = ADD(
      METRIC("CNI"),
      MIN(METRIC("Qualified Addbacks"), MUL(PCT(0.15), TERM("Consolidated EBITDA"))),
    );
    const def = definition("ir-definition:ce2", "Consolidated EBITDA", calc);
    const res = ev(
      TERM("Consolidated EBITDA"),
      resolver({
        definitions: [def],
        metrics: [
          metricInput("CNI", m("100000000"), SRC),
          metricInput("Qualified Addbacks", m("40000000"), SRC),
        ],
      }),
    );

    const oracle = oracleCappedAddbackFixedPoint(100_000_000, 40_000_000, 0.15);
    expect(oracle).toBeCloseTo(100_000_000 / 0.85, 5);

    expect(res.status).toBe("ERROR");
    expect(res.value).toBeNull();
    expect(res.diagnostics.some((d) => d.code === "CYCLE")).toBe(true);
  });

  it("non-recursive template encoding of addback cap disagrees with true fixed-point law", () => {
    // Approximation sometimes used in hand IR: MIN(A, 15%*(CNI+A)) added to CNI — NOT the true fixed point.
    const cni = 100_000_000;
    const addbacks = 40_000_000;
    const approxCapBase = cni + addbacks;
    const cappedAdd = Math.min(addbacks, 0.15 * approxCapBase);
    const approxTotal = cni + cappedAdd;
    const trueFixed = oracleCappedAddbackFixedPoint(cni, addbacks, 0.15);
    expect(approxTotal).not.toBeCloseTo(trueFixed, 0);

    const expr = ADD(
      METRIC("CNI"),
      MIN(METRIC("Qualified Addbacks"), MUL(PCT(0.15), ADD(METRIC("CNI"), METRIC("Qualified Addbacks")))),
    );
    const res = ev(
      expr,
      metrics(
        ["CNI", m(String(cni))],
        ["Qualified Addbacks", m(String(addbacks))],
      ),
    );
    expect(res.status).toBe("EXECUTABLE");
    expect(res.value).toMatchObject({ type: "MONEY", amount: String(approxTotal) });
    expect(Number((res.value as { amount: string }).amount)).not.toBeCloseTo(trueFixed, 0);
  });
});

describe("B — calculation dependency discovery / information request", () => {
  it("manifest enumerates every metric leaf for composed net-debt + leverage with period key", () => {
    const netDebt = MAX(
      MONEY(0),
      SUB(METRIC("Gross Debt"), MIN(METRIC("Unrestricted Cash"), MONEY(100_000_000))),
    );
    const ebitda = DURING(METRIC("Consolidated EBITDA"), "four consecutive fiscal quarters most recently ended");
    const expr = DIV(netDebt, ebitda, "RATIO");

    const manifest = buildFinancialDependencyManifest({
      expression: expr,
      companyId: "co-adv",
      instrumentKey: "inst-adv",
      asOf: "2026-06-30",
    });
    const keys = manifest.dependencies.map((d) => d.key).sort();
    expect(keys).toEqual(["Consolidated EBITDA", "Gross Debt", "Unrestricted Cash"]);
    expect(manifest.dependencies.every((d) => d.status === "REQUIRED")).toBe(true);
    const ebitdaDep = manifest.dependencies.find((d) => d.key === "Consolidated EBITDA")!;
    expect(ebitdaDep.period).toEqual({
      kind: "VERBATIM_CONTRACT_PERIOD_KEY",
      key: "four consecutive fiscal quarters most recently ended",
    });
    // Manifest does not classify verified/missing/stale — only structural need.
    expect("fulfillmentState" in (manifest.dependencies[0] as object)).toBe(false);
  });

  it("dependency graph expands definition chains and lists runtime inputs", () => {
    const def = definition(
      "ir-definition:nd",
      "Consolidated Net Debt",
      SUB(METRIC("Gross Debt"), MIN(METRIC("Unrestricted Cash"), MONEY(75_000_000))),
    );
    const expr = DIV(TERM("Consolidated Net Debt"), METRIC("Consolidated EBITDA"), "RATIO");
    const g = buildDependencyGraph(expr, resolver({ definitions: [def] }));
    expect(g.cycles).toEqual([]);
    expect(g.dependencyTrace.map((d) => d.key).sort()).toEqual([
      "Consolidated EBITDA",
      "Gross Debt",
      "Unrestricted Cash",
    ]);
    expect(g.nodes.some((n) => n.kind === "DEFINITION" && n.id === "definition:ir-definition:nd")).toBe(true);
  });

  it("GAP: manifest InputKind lacks reviewer-decision and corporate-structure", () => {
    const manifest = buildFinancialDependencyManifest({
      expression: METRIC("Consolidated EBITDA"),
      companyId: "co",
      instrumentKey: "inst",
    });
    const kinds = new Set(manifest.dependencies.map((d) => d.inputKind));
    expect(kinds.has("METRIC")).toBe(true);
    expect([...kinds]).toEqual(["METRIC"]);
    // Documented absence — these strings are not runtime InputKind values today.
    expect(["REVIEWER_DECISION", "CORPORATE_STRUCTURE", "HISTORICAL_USAGE"].some((k) => kinds.has(k as "METRIC"))).toBe(false);
  });
});

describe("C — independent mathematical verification (held-out oracles)", () => {
  it("exact rational precision: 1/3 remains exact as a non-terminating fraction string", () => {
    const res = ev(DIV(MONEY(1), MONEY(3), "RATIO"));
    expect(res.status).toBe("EXECUTABLE");
    expect(res.value).toMatchObject({ type: "RATIO", value: "1/3" });
  });

  it("division by zero is ERROR; negative denominator evaluates (policy gap vs leverage oracle)", () => {
    const zero = ev(DIV(MONEY(100), MONEY(0), "RATIO"));
    expect(zero.status).toBe("ERROR");
    expect(zero.diagnostics.at(-1)!.code).toBe("DIVISION_BY_ZERO");

    const negOracle = oracleLeverage(100, -10);
    expect(negOracle).toEqual({ ok: false, reason: "NON_POSITIVE_DENOMINATOR" });

    const neg = ev(DIV(MONEY(100), MONEY(-10), "RATIO"));
    // CONFIRMED BEHAVIOR: engine returns EXECUTABLE negative ratio; independent leverage oracle refuses.
    expect(neg.status).toBe("EXECUTABLE");
    expect(neg.value).toMatchObject({ type: "RATIO", value: "-10" });
  });

  it("ratio boundary COMPARE is exact at equality (no float drift)", () => {
    const left = DIV(MONEY(375_000_000), MONEY(100_000_000), "RATIO");
    const res = ev(CMP(left, "LTE", RATIO(3.75)));
    expect(res.status).toBe("EXECUTABLE");
    expect(res.value).toMatchObject({ type: "BOOLEAN", value: true });
  });

  it("grower MAX(flat, pct×metric) with missing metric: NEEDS_INPUT + lower bound, never flat as answer", () => {
    const flat = 75_000_000;
    const expr = MAX(MONEY(flat), MUL(PCT(0.125), METRIC("Consolidated EBITDA")));
    const res = ev(expr);
    expect(res.status).toBe("NEEDS_INPUT");
    expect(res.value).toBeNull();
    expect(res.bounds).toEqual({ knownLowerBound: expect.objectContaining({ amount: String(flat) }) });
  });

  it("shared-capacity style MIN of two growers needs both metrics — missing either fails closed", () => {
    const shared = MIN(
      MAX(MONEY(50_000_000), MUL(PCT(0.1), METRIC("EBITDA"))),
      MAX(MONEY(40_000_000), MUL(PCT(0.05), METRIC("Total Assets"))),
    );
    const onlyEbitda = ev(shared, metrics(["EBITDA", m("600000000")]));
    expect(onlyEbitda.status).toBe("NEEDS_INPUT");
    expect(onlyEbitda.missingInputKeys).toContain("Total Assets");
    expect(onlyEbitda.value).toBeNull();

    const both = ev(
      shared,
      metrics(["EBITDA", m("600000000")], ["Total Assets", m("900000000")]),
    );
    // Independent: min(max(50, 60), max(40, 45)) = min(60, 45) = 45
    expect(both.status).toBe("EXECUTABLE");
    expect(both.value).toMatchObject({ amount: "45000000" });
  });
});
