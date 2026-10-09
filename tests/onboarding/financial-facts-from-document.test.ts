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
    expect(byMetric.covenant_ebitda.value).toBe(1700);
    expect(byMetric.total_debt.value).toBe(3258);
    expect(byMetric.secured_debt.value).toBe(2221);
    expect(byMetric.cash.value).toBe(1162);
    expect(byMetric.interest_expense.value).toBe(190);
    expect(byMetric.covenant_ebitda.asOfDate).toBe("2026-06-30");
    expect(byMetric.covenant_ebitda.originalUnit).toBe("USD_MILLIONS");
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
