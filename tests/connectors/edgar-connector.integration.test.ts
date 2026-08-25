/**
 * REAL, non-mocked integration test against the live SEC.gov
 * (docs/autonomous-retrieval-phase-a-foundation.md, task's own "this MUST
 * actually work" requirement). No stubs, no fixtures - every assertion below
 * is against a byte-for-byte real HTTP response from data.sec.gov/www.sec.gov.
 * See scripts/verify-edgar-connector.ts for the broader, human-readable
 * verification run (with real counts) referenced in the phase report.
 *
 * Kept deliberately network-light and deterministic:
 *  - resolveCikForTicker/healthCheck: one real request each.
 *  - discover(): a small `limit` (bounded network calls, tolerant of zero
 *    matches within that small window - the CONNECTOR MECHANICS are what
 *    this asserts, not "this specific ticker has a match in its most recent
 *    3 filings", which is not something a test should depend on).
 *  - fetch(): a hardcoded real, historical, already-filed SEC exhibit URL
 *    (Ford Motor Co's Twentieth Amendment to its Credit Agreement, filed
 *    2023-04-26 - a permanent, immutable EDGAR document that will never
 *    change or disappear) - fast, deterministic, strongly asserted.
 */
import { describe, expect, it } from "vitest";
import { EdgarConnector, resolveCikForTicker } from "../../lib/connectors/edgar-connector";
import { parseDocument } from "../../lib/extraction/parse";
import { computeContentHash } from "../../lib/connectors/dedup";

const FORD_TICKER = "F";
const FORD_CIK = "0000037996";
// A real, historical, already-filed SEC exhibit - immutable once filed.
const KNOWN_REAL_EXHIBIT_URL = "https://www.sec.gov/Archives/edgar/data/37996/000003799623000025/ford-twentiethamendmentagr.htm";

describe("EdgarConnector (real SEC.gov, no mocks)", () => {
  it("resolves a real ticker to its real CIK via SEC's own company_tickers.json", async () => {
    const { cik, title } = await resolveCikForTicker(FORD_TICKER);
    expect(cik).toBe(FORD_CIK);
    expect(title.toUpperCase()).toContain("FORD");
  }, 30000);

  it("fails closed on an unresolvable ticker rather than guessing a CIK", async () => {
    await expect(resolveCikForTicker("ZZZZZZ-not-a-real-ticker")).rejects.toThrow(/was not found/);
  }, 30000);

  it("healthCheck() is a real, successful GET against SEC.gov", async () => {
    const connector = new EdgarConnector({ cik: FORD_CIK, ticker: FORD_TICKER });
    const health = await connector.healthCheck();
    expect(health.ok).toBe(true);
  }, 30000);

  it("discover() makes real requests against data.sec.gov/www.sec.gov and returns well-formed items when it finds any", async () => {
    const connector = new EdgarConnector({ cik: FORD_CIK, ticker: FORD_TICKER });
    const items = await connector.discover({ limit: 5 });
    expect(Array.isArray(items)).toBe(true);
    for (const item of items) {
      expect(item.artifactType).toBe("DOCUMENT");
      expect(item.sourceUri).toMatch(/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\//);
      expect(item.sourceIdentifier).toMatch(/^\d{10}-\d{2}-\d{6}$/);
      expect(typeof item.summary).toBe("string");
      expect(item.summary.length).toBeGreaterThan(0);
    }
  }, 60000);

  it("fetch() downloads a real exhibit's actual bytes with a correct, reproducible content hash", async () => {
    const connector = new EdgarConnector({ cik: FORD_CIK, ticker: FORD_TICKER });
    const item = {
      id: "known-exhibit",
      artifactType: "DOCUMENT" as const,
      sourceIdentifier: "0000037996-23-000025",
      sourceUri: KNOWN_REAL_EXHIBIT_URL,
      summary: "Twentieth Amendment to Credit Agreement",
    };
    const raw = await connector.fetch(item);
    expect(raw.data.length).toBeGreaterThan(1000);
    expect(raw.mimeType).toBe("text/html");
    expect(raw.contentHash).toBe(computeContentHash(raw.data));
    expect(raw.contentHash).toMatch(/^[0-9a-f]{64}$/);
  }, 30000);

  it("the fetched real exhibit parses (via the additive HTML parse path) into real contract prose, not garbage", async () => {
    const connector = new EdgarConnector({ cik: FORD_CIK, ticker: FORD_TICKER });
    const item = {
      id: "known-exhibit",
      artifactType: "DOCUMENT" as const,
      sourceIdentifier: "0000037996-23-000025",
      sourceUri: KNOWN_REAL_EXHIBIT_URL,
      summary: "Twentieth Amendment to Credit Agreement",
    };
    const raw = await connector.fetch(item);
    const parsed = await parseDocument(raw.data, raw.mimeType ?? "text/html");
    expect(parsed.fullText.length).toBeGreaterThan(500);
    expect(parsed.fullText.toUpperCase()).toContain("AMENDMENT");
    expect(parsed.fullText).not.toMatch(/<[a-z][\s\S]*>/i); // no leftover HTML tags
  }, 30000);

  it("syncSince(null) delegates to discover() and marks every result NEW", async () => {
    const connector = new EdgarConnector({ cik: FORD_CIK, ticker: FORD_TICKER });
    const deltas = await connector.syncSince(null);
    for (const delta of deltas.slice(0, 5)) {
      expect(delta.changeType).toBe("NEW");
    }
  }, 60000);
});
