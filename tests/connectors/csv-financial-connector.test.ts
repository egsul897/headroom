/**
 * CsvFinancialConnector - hand-rolled CSV parsing (quoted fields, malformed
 * rows fail closed), the discover()/fetch() connector contract, and unit
 * normalization (docs/autonomous-ingestion-production-readiness.md) - a
 * value with no declared unit, an unrecognized unit, or a unit incompatible
 * with its metric is a parse error, never a silent guess.
 */
import { describe, expect, it } from "vitest";
import { CsvFinancialConnector, parseFinancialCsv } from "../../lib/connectors/csv-financial-connector";
import { parseCsvRows } from "../../lib/connectors/csv-parse";

describe("parseCsvRows (hand-rolled CSV parser)", () => {
  it("handles quoted fields with embedded commas", () => {
    const rows = parseCsvRows('a,"b, with comma",c\n1,2,3');
    expect(rows).toEqual([
      ["a", "b, with comma", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles escaped double-quotes inside a quoted field", () => {
    const rows = parseCsvRows('a,"he said ""hi""",c');
    expect(rows).toEqual([["a", 'he said "hi"', "c"]]);
  });

  it("handles a file with no trailing newline", () => {
    const rows = parseCsvRows("a,b\n1,2");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("drops a wholly-blank trailing line", () => {
    const rows = parseCsvRows("a,b\n1,2\n");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parseFinancialCsv - fail-closed row validation", () => {
  it("parses well-formed rows and normalizes into the metric's canonical unit", () => {
    const csv = "metricName,value,asOfDate,unit,notes\ncash,1.5,2026-06-30,USD_MILLIONS,quarter-end\ncovenant_ebitda,42,2026-06-30,USD_MILLIONS,";
    const { rows, errors } = parseFinancialCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ metricName: "cash", value: 1.5, canonicalUnit: "USD_MILLIONS", originalValue: 1.5, originalUnit: "USD_MILLIONS", withinSanityBounds: true });
    expect(rows[1]!.notes).toBeUndefined();
  });

  it("fails closed on a non-numeric value - never coerces to 0", () => {
    const csv = "metricName,value,asOfDate,unit\ncash,not-a-number,2026-06-30,USD";
    const { rows, errors } = parseFinancialCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.error).toMatch(/value/);
  });

  it("fails closed on a blank value cell - never coerces blank to 0", () => {
    const csv = "metricName,value,asOfDate,unit\ncash,,2026-06-30,USD";
    const { rows, errors } = parseFinancialCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
  });

  it("fails closed on an unparseable date", () => {
    const csv = "metricName,value,asOfDate,unit\ncash,100,not-a-date,USD";
    const { rows, errors } = parseFinancialCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.error).toMatch(/asOfDate/);
  });

  it("fails closed on a missing metricName, while still processing every other valid row in the same file", () => {
    const csv = "metricName,value,asOfDate,unit\n,100,2026-06-30,USD\ncash,200,2026-06-30,USD";
    const { rows, errors } = parseFinancialCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.metricName).toBe("cash");
    expect(errors).toHaveLength(1);
  });

  // --- Unit normalization (docs/autonomous-ingestion-production-readiness.md) ---

  it("fails closed on a missing unit column - never assumes a global convention", () => {
    const csv = "metricName,value,asOfDate\ncash,125000000,2026-06-30";
    const { rows, errors } = parseFinancialCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.error).toMatch(/unit/i);
  });

  it("fails closed on an unrecognized unit string", () => {
    const csv = "metricName,value,asOfDate,unit\ncash,125,2026-06-30,DOLLARS";
    const { rows, errors } = parseFinancialCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.error).toMatch(/unit must be one of/);
  });

  it("fails closed on an unrecognized metricName - never guesses a unit for it", () => {
    const csv = "metricName,value,asOfDate,unit\nsome_unknown_metric,100,2026-06-30,USD_MILLIONS";
    const { rows, errors } = parseFinancialCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.error).toMatch(/unrecognized/i);
  });

  it("fails closed on a unit incompatible with the metric's own canonical kind (PERCENT declared for a dollar metric)", () => {
    const csv = "metricName,value,asOfDate,unit\ncash,7.5,2026-06-30,PERCENT";
    const { rows, errors } = parseFinancialCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.error).toMatch(/incompatible|expects a/i);
  });

  it("the exact regression this fix closes: a raw dollar figure (USD) for a millions-denominated metric normalizes correctly instead of being silently treated as already-in-millions", () => {
    const csv = "metricName,value,asOfDate,unit\ncash,125000000,2026-06-30,USD";
    const { rows, errors } = parseFinancialCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ value: 125, canonicalUnit: "USD_MILLIONS", originalValue: 125000000, originalUnit: "USD", withinSanityBounds: true });
  });

  it("normalizes USD_THOUSANDS correctly", () => {
    const csv = "metricName,value,asOfDate,unit\ntotal_debt,750000,2026-06-30,USD_THOUSANDS";
    const { rows } = parseFinancialCsv(csv);
    expect(rows[0]).toMatchObject({ value: 750, canonicalUnit: "USD_MILLIONS" });
  });

  it("normalizes PERCENT correctly for a percent-denominated metric", () => {
    const csv = "metricName,value,asOfDate,unit\nassumed_new_debt_rate_pct,7.5,2026-06-30,PERCENT";
    const { rows } = parseFinancialCsv(csv);
    expect(rows[0]).toMatchObject({ value: 7.5, canonicalUnit: "PERCENT" });
  });

  it("normalizes RATIO into PERCENT for a percent-denominated metric (0.075 -> 7.5)", () => {
    const csv = "metricName,value,asOfDate,unit\nassumed_new_debt_rate_pct,0.075,2026-06-30,RATIO";
    const { rows } = parseFinancialCsv(csv);
    expect(rows[0]!.value).toBeCloseTo(7.5, 10);
    expect(rows[0]!.canonicalUnit).toBe("PERCENT");
  });

  it("inconsistent units across rows for the SAME metric each normalize correctly on their own (not required to share a unit)", () => {
    const csv = "metricName,value,asOfDate,unit\ncash,1.5,2026-06-30,USD_MILLIONS\ncash,1500000,2026-07-31,USD";
    const { rows, errors } = parseFinancialCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.value).toBeCloseTo(1.5, 10);
    expect(rows[1]!.value).toBeCloseTo(1.5, 10);
    expect(rows[0]!.originalUnit).toBe("USD_MILLIONS");
    expect(rows[1]!.originalUnit).toBe("USD");
  });

  it("extreme-magnitude sanity check: a value that normalizes far beyond any real company's scale is NOT rejected, but is flagged withinSanityBounds:false with a clear note", () => {
    // A plausible mistake: entering a raw dollar figure in a field the
    // reviewer THINKS is millions, but declaring USD_MILLIONS anyway -
    // produces an implausible $125 trillion cash balance.
    const csv = "metricName,value,asOfDate,unit\ncash,125000000,2026-06-30,USD_MILLIONS";
    const { rows, errors } = parseFinancialCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.withinSanityBounds).toBe(false);
    expect(rows[0]!.sanityNote).toMatch(/sanity ceiling/);
  });

  it("a value within normal magnitude is not flagged", () => {
    const csv = "metricName,value,asOfDate,unit\ncash,125,2026-06-30,USD_MILLIONS";
    const { rows } = parseFinancialCsv(csv);
    expect(rows[0]!.withinSanityBounds).toBe(true);
    expect(rows[0]!.sanityNote).toBeUndefined();
  });
});

describe("CsvFinancialConnector", () => {
  const csv = "metricName,value,asOfDate,unit\ncash,1.5,2026-06-30,USD_MILLIONS\ntotal_debt,9,2026-06-30,USD_MILLIONS\nbad-row,not-a-number,2026-06-30,USD_MILLIONS";

  it("capabilities() declares financial-facts-shaped capabilities", () => {
    const connector = new CsvFinancialConnector({ rawCsv: Buffer.from(csv) });
    expect(connector.capabilities()).toContain("FINANCIAL_FACTS");
  });

  it("discover() returns one item per valid row and reports the malformed row via getLastParseErrors()", async () => {
    const connector = new CsvFinancialConnector({ rawCsv: Buffer.from(csv), sourceLabel: "test.csv" });
    const items = await connector.discover({});
    expect(items).toHaveLength(2);
    expect(items[0]!.artifactType).toBe("FINANCIAL_RECORD");
    expect(connector.getLastParseErrors()).toHaveLength(1);
  });

  it("fetch() returns the normalized value plus original value/unit in rawPayload, with a reproducible contentHash", async () => {
    const connector = new CsvFinancialConnector({ rawCsv: Buffer.from(csv) });
    const items = await connector.discover({});
    const raw = await connector.fetch(items[0]!);
    expect(raw.rawPayload).toMatchObject({ metricName: "cash", value: 1.5, canonicalUnit: "USD_MILLIONS", originalValue: 1.5, originalUnit: "USD_MILLIONS" });
    expect(raw.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("two connector instances parsing the SAME csv bytes produce the SAME contentHash for the same row (deterministic re-parse, needed for the ingestion job runner's stateless FETCH stage)", async () => {
    const bytes = Buffer.from(csv);
    const a = new CsvFinancialConnector({ rawCsv: bytes });
    const itemsA = await a.discover({});
    const rawA = await a.fetch(itemsA[0]!);

    const b = new CsvFinancialConnector({ rawCsv: bytes });
    const itemsB = await b.discover({});
    const rawB = await b.fetch(itemsB[0]!);

    expect(rawA.contentHash).toBe(rawB.contentHash);
  });

  it("discover() throws a clear error when no bytes are available at all (fail closed, no silent empty result)", async () => {
    const connector = new CsvFinancialConnector({});
    await expect(connector.discover({})).rejects.toThrow(/no CSV bytes available/);
  });

  it("healthCheck() is always ok - purely local parsing, no external dependency", async () => {
    const connector = new CsvFinancialConnector({ rawCsv: Buffer.from(csv) });
    expect(await connector.healthCheck()).toEqual({ ok: true });
  });
});
