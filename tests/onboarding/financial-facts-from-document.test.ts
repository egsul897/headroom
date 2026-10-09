import { describe, expect, it } from "vitest";
import { parseFinancialFactsFromText } from "../../lib/onboarding/financial-facts-from-document";

const CERTIFICATE = `COMPLIANCE CERTIFICATE
As of June 30, 2026

Consolidated EBITDA: $1,700 million
Total Debt: $3,258 million
Secured Debt: $2,221 million
Unrestricted Cash: $1,162 million
Interest Expense: $190 million
`;

describe("parseFinancialFactsFromText", () => {
  it("extracts labeled certificate figures with declared million units", () => {
    const rows = parseFinancialFactsFromText(CERTIFICATE);
    const byMetric = Object.fromEntries(rows.map((r) => [r.metricName, r]));
    const ebitda = byMetric.covenant_ebitda!;
    const totalDebt = byMetric.total_debt!;
    const securedDebt = byMetric.secured_debt!;
    const cash = byMetric.cash!;
    const interest = byMetric.interest_expense!;
    expect(ebitda).toBeDefined();
    expect(totalDebt).toBeDefined();
    expect(securedDebt).toBeDefined();
    expect(cash).toBeDefined();
    expect(interest).toBeDefined();
    expect(ebitda.value).toBe(1700);
    expect(totalDebt.value).toBe(3258);
    expect(securedDebt.value).toBe(2221);
    expect(cash.value).toBe(1162);
    expect(interest.value).toBe(190);
    expect(ebitda.asOfDate).toBe("2026-06-30");
    expect(ebitda.originalUnit).toBe("USD_MILLIONS");
  });

  it("does not invent facts when the period or units are missing", () => {
    expect(parseFinancialFactsFromText("EBITDA: 1700\nTotal Debt: 3258")).toEqual([]);
    expect(parseFinancialFactsFromText("As of June 30, 2026\nEBITDA: 1700")).toEqual([]);
  });

  it("skips a metric when two conflicting amounts appear", () => {
    const text = `As of 2026-06-30
Consolidated EBITDA: $1,700 million
Consolidated EBITDA: $1,800 million
Cash: $100 million
`;
    const rows = parseFinancialFactsFromText(text);
    expect(rows.find((r) => r.metricName === "covenant_ebitda")).toBeUndefined();
    expect(rows.find((r) => r.metricName === "cash")?.value).toBe(100);
  });
});
