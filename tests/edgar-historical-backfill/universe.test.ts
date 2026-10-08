import { describe, expect, it, vi } from "vitest";
import { SecAccessCoordinator } from "../../lib/edgar-historical-backfill/sec-access";
import { selectIssuerUniverse, rankFilingsForIndexFetch } from "../../lib/edgar-historical-backfill/submissions";
import type { FilingRef } from "../../lib/edgar-historical-backfill/types";

describe("issuer universe selection", () => {
  it("dedupes CIKs that appear under multiple tickers", async () => {
    const payload = {
      "0": { cik_str: 1, ticker: "AAA", title: "A" },
      "1": { cik_str: 1, ticker: "AAA.W", title: "A Warrant" },
      "2": { cik_str: 2, ticker: "BBB", title: "B" },
      "3": { cik_str: 3, ticker: "CCC", title: "C" },
    };
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })) as unknown as typeof fetch;
    const sec = new SecAccessCoordinator({ fetchImpl, cacheDir: null, maxRequestsPerSecond: 100, sleep: async () => {} });
    const issuers = await selectIssuerUniverse(sec, 10, { preferTickers: ["AAA"] });
    const ciks = issuers.map((i) => i.cik);
    expect(new Set(ciks).size).toBe(ciks.length);
    expect(issuers[0]!.ticker).toBe("AAA");
    expect(issuers).toHaveLength(3);
  });
});

describe("index fetch ranking", () => {
  it("reserves periodic 10-K/10-Q slots alongside high-signal 8-Ks", () => {
    const filings: FilingRef[] = [
      { cik: "1", accessionNumber: "a", form: "8-K", filingDate: "2025-01-01", items: "1.01,9.01" },
      { cik: "1", accessionNumber: "b", form: "8-K", filingDate: "2024-01-01", items: "1.01,9.01" },
      { cik: "1", accessionNumber: "c", form: "8-K", filingDate: "2023-01-01", items: "1.01,9.01" },
      { cik: "1", accessionNumber: "d", form: "8-K", filingDate: "2022-01-01", items: "1.01,9.01" },
      { cik: "1", accessionNumber: "e", form: "8-K", filingDate: "2021-01-01", items: "1.01,9.01" },
      { cik: "1", accessionNumber: "f", form: "10-K", filingDate: "2025-03-01" },
      { cik: "1", accessionNumber: "g", form: "10-Q", filingDate: "2025-05-01" },
    ];
    const picked = rankFilingsForIndexFetch(filings, 6);
    expect(picked.some((f) => f.form.startsWith("10-K") || f.form.startsWith("10-Q"))).toBe(true);
    expect(picked.length).toBeLessThanOrEqual(6);
  });
});
