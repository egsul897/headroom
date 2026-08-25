/**
 * CsvFinancialConnector - hand-rolled CSV parsing (quoted fields, malformed
 * rows fail closed) and the discover()/fetch() connector contract.
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
  it("parses well-formed rows", () => {
    const csv = "metricName,value,asOfDate,unit,notes\ncash,1500000,2026-06-30,USD,quarter-end\ncovenant_ebitda,42000000,2026-06-30,USD,";
    const { rows, errors } = parseFinancialCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ metricName: "cash", value: 1500000, asOfDate: "2026-06-30", unit: "USD" });
    expect(rows[1]!.notes).toBeUndefined();
  });

  it("fails closed on a non-numeric value - never coerces to 0", () => {
    const csv = "metricName,value,asOfDate\ncash,not-a-number,2026-06-30";
    const { rows, errors } = parseFinancialCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.error).toMatch(/value/);
  });

  it("fails closed on a blank value cell - never coerces blank to 0", () => {
    const csv = "metricName,value,asOfDate\ncash,,2026-06-30";
    const { rows, errors } = parseFinancialCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
  });

  it("fails closed on an unparseable date", () => {
    const csv = "metricName,value,asOfDate\ncash,100,not-a-date";
    const { rows, errors } = parseFinancialCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.error).toMatch(/asOfDate/);
  });

  it("fails closed on a missing metricName, while still processing every other valid row in the same file", () => {
    const csv = "metricName,value,asOfDate\n,100,2026-06-30\ncash,200,2026-06-30";
    const { rows, errors } = parseFinancialCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.metricName).toBe("cash");
    expect(errors).toHaveLength(1);
  });
});

describe("CsvFinancialConnector", () => {
  const csv = "metricName,value,asOfDate,unit\ncash,1500000,2026-06-30,USD\ntotal_debt,9000000,2026-06-30,USD\nbad-row,not-a-number,2026-06-30,USD";

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

  it("fetch() returns the exact parsed row as rawPayload, with a reproducible contentHash", async () => {
    const connector = new CsvFinancialConnector({ rawCsv: Buffer.from(csv) });
    const items = await connector.discover({});
    const raw = await connector.fetch(items[0]!);
    expect(raw.rawPayload).toMatchObject({ metricName: "cash", value: 1500000 });
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
