/**
 * SEC EDGAR connector (docs/autonomous-retrieval-phase-a-foundation.md) - a
 * REAL, working connector against SEC EDGAR's public JSON APIs, no API key
 * required. SEC's fair-access policy requires every request carry a
 * descriptive User-Agent identifying the requester - DO NOT remove
 * DEFAULT_USER_AGENT below; SEC.gov returns 403 without one.
 *
 * Verified against the real, live SEC.gov from this sandbox (see
 * scripts/verify-edgar-connector.ts and
 * tests/connectors/edgar-connector.integration.test.ts) - this is not a
 * stub or a mock, unlike Phase 1's Anthropic/Blob connectors which genuinely
 * had no credentials available in that sandbox.
 *
 * Heuristic keyword match, not NLP (this codebase's own established
 * "pragmatic, not infrastructure for its own sake" philosophy - see
 * lib/extraction/chunk.ts's own header comment) - a real exhibit is
 * recognized by its filename/description containing one of a small, fixed
 * keyword list, exactly the four the task brief names.
 */

const DEFAULT_USER_AGENT = "Headroom/1.0 (contact: engineering@headroom-app.example)";
const TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const SUBMISSIONS_URL_PREFIX = "https://data.sec.gov/submissions/CIK";
const QUALIFYING_FORMS = new Set(["8-K", "10-K", "10-Q"]);
/** Case-insensitive substring match against an exhibit's filename + description + type text - exactly the four keywords the task brief names. "Amendment" alone catches the overwhelming majority of real credit-facility exhibits in practice (SEC exhibit filenames/descriptions for a new or amended credit agreement almost always contain one of these words - confirmed against real Ford Motor Co filings while building this connector, see the phase report). */
const EXHIBIT_KEYWORDS = /credit agreement|indenture|amendment|intercreditor/i;
/** Only real prose documents can contain contract text - excludes XBRL/.xsd/.xml/image exhibits even if a filename coincidentally matches a keyword. */
const PROSE_EXTENSIONS = new Set(["htm", "html", "txt"]);

import type { ConnectorCapability, ConnectorHealth, DiscoverOptions, DiscoveredSourceItem, RawSourceArtifact, SourceConnector, SourceDelta } from "./types";
import { computeContentHash } from "./dedup";

async function fetchText(url: string, userAgent: string): Promise<{ status: number; text: string }> {
  const res = await fetch(url, { headers: { "User-Agent": userAgent, Accept: "*/*" } });
  const text = await res.text();
  return { status: res.status, text };
}

/** Resolves a user-supplied ticker to a 10-digit zero-padded CIK via SEC's own static ticker->CIK mapping file. Fails closed (throws) on an unknown ticker or an unreachable SEC.gov - never silently falls back to a guessed CIK. */
export async function resolveCikForTicker(ticker: string, userAgent: string = DEFAULT_USER_AGENT): Promise<{ cik: string; title: string }> {
  const { status, text } = await fetchText(TICKERS_URL, userAgent);
  if (status !== 200) {
    throw new Error(`EdgarConnector: failed to fetch SEC's ticker->CIK mapping (HTTP ${status}) - cannot resolve ticker "${ticker}".`);
  }
  const data = JSON.parse(text) as Record<string, { cik_str: number; ticker: string; title: string }>;
  const normalizedTicker = ticker.trim().toUpperCase();
  for (const entry of Object.values(data)) {
    if (entry.ticker.toUpperCase() === normalizedTicker) {
      return { cik: String(entry.cik_str).padStart(10, "0"), title: entry.title };
    }
  }
  throw new Error(`EdgarConnector: ticker "${ticker}" was not found in SEC's company_tickers.json - cannot connect an EDGAR source without a resolvable CIK.`);
}

interface RecentFilings {
  form: string[];
  accessionNumber: string[];
  filingDate: string[];
  primaryDocument: string[];
}

interface ExhibitRow {
  description: string;
  type: string;
  href: string;
  filename: string;
}

/** Parses the plain <table class="tableFile">...</table> rows on a filing's own -index.htm page - a small, targeted regex parse (this codebase's own established preference over pulling in a full HTML parser for one table shape), not a general-purpose HTML parser. */
function parseIndexExhibitRows(html: string): ExhibitRow[] {
  const rows: ExhibitRow[] = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  const linkRegex = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i;

  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1] ?? "";
    const cells: string[] = [];
    let cellMatch: RegExpExecArray | null;
    cellRegex.lastIndex = 0;
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      cells.push(cellMatch[1] ?? "");
    }
    // The Data Files table is: Seq | Description | Document (a link) | Type | Size - exactly 5 cells.
    if (cells.length !== 5) continue;
    const [, description, documentCell, type] = cells;
    const linkMatch = linkRegex.exec(documentCell ?? "");
    if (!linkMatch) continue;
    const href = linkMatch[1] ?? "";
    const linkText = (linkMatch[2] ?? "").replace(/<[^>]+>/g, "").trim();
    const filename = href.split("/").pop() ?? linkText;
    rows.push({
      description: (description ?? "").replace(/<[^>]+>/g, "").trim(),
      type: (type ?? "").replace(/<[^>]+>/g, "").trim(),
      href,
      filename,
    });
  }
  return rows;
}

function isEligibleExhibit(row: ExhibitRow): boolean {
  const ext = row.filename.toLowerCase().split(".").pop() ?? "";
  if (!PROSE_EXTENSIONS.has(ext)) return false;
  const haystack = `${row.filename} ${row.description} ${row.type}`;
  return EXHIBIT_KEYWORDS.test(haystack);
}

function absoluteSecUrl(href: string): string {
  return href.startsWith("http") ? href : `https://www.sec.gov${href.startsWith("/") ? "" : "/"}${href}`;
}

export interface EdgarConnectorConfig {
  cik: string;
  ticker?: string;
  userAgent?: string;
}

export class EdgarConnector implements SourceConnector {
  private readonly cik: string;
  private readonly ticker?: string;
  private readonly userAgent: string;

  constructor(config: EdgarConnectorConfig) {
    this.cik = config.cik.padStart(10, "0");
    this.ticker = config.ticker;
    this.userAgent = config.userAgent ?? DEFAULT_USER_AGENT;
  }

  capabilities(): ConnectorCapability[] {
    return ["DOCUMENTS"];
  }

  private async loadRecentFilings(): Promise<RecentFilings> {
    const { status, text } = await fetchText(`${SUBMISSIONS_URL_PREFIX}${this.cik}.json`, this.userAgent);
    if (status !== 200) {
      throw new Error(`EdgarConnector: failed to fetch submissions for CIK ${this.cik} (HTTP ${status}).`);
    }
    const data = JSON.parse(text) as { filings: { recent: RecentFilings } };
    return data.filings.recent;
  }

  private indexUrlFor(accessionNumber: string): string {
    const accNoDashes = accessionNumber.replace(/-/g, "");
    const cikNoLeadingZeros = String(Number(this.cik));
    return `https://www.sec.gov/Archives/edgar/data/${cikNoLeadingZeros}/${accNoDashes}/${accessionNumber}-index.htm`;
  }

  /**
   * Walks filings.recent (task: "recent is fine for V1, don't over-engineer" -
   * filings.files for older filings is deliberately not implemented), opens
   * each qualifying filing's own index page (one real network request per
   * filing - capped by `limit`, default 25, to keep one discover() call
   * bounded), and returns one DiscoveredSourceItem per matching exhibit -
   * not per filing, so a review UI can list "found: 2024 10-K Exhibit 10.1"
   * exactly as the task brief specifies.
   */
  async discover(options: DiscoverOptions): Promise<DiscoveredSourceItem[]> {
    const recent = await this.loadRecentFilings();
    const limit = options.limit ?? 25;
    const sinceDate = options.since;

    const candidateFilings: { accessionNumber: string; filingDate: string; form: string }[] = [];
    for (let i = 0; i < recent.form.length && candidateFilings.length < limit; i++) {
      const form = recent.form[i]!;
      const filingDate = recent.filingDate[i]!;
      if (!QUALIFYING_FORMS.has(form)) continue;
      if (sinceDate && filingDate <= sinceDate) continue;
      candidateFilings.push({ accessionNumber: recent.accessionNumber[i]!, filingDate, form });
    }

    const items: DiscoveredSourceItem[] = [];
    for (const filing of candidateFilings) {
      const indexUrl = this.indexUrlFor(filing.accessionNumber);
      const { status, text } = await fetchText(indexUrl, this.userAgent);
      if (status !== 200) continue; // a single unreachable filing's index page must not abort the whole discovery pass
      const exhibitRows = parseIndexExhibitRows(text).filter(isEligibleExhibit);
      for (const row of exhibitRows) {
        items.push({
          id: `${filing.accessionNumber}:${row.filename}`,
          artifactType: "DOCUMENT",
          sourceIdentifier: filing.accessionNumber,
          sourceUri: absoluteSecUrl(row.href),
          effectiveDate: filing.filingDate,
          summary: `${filing.form} (filed ${filing.filingDate}) — ${row.description || row.type || row.filename}`,
        });
      }
    }
    return items;
  }

  async fetch(item: DiscoveredSourceItem): Promise<RawSourceArtifact> {
    if (!item.sourceUri) {
      throw new Error(`EdgarConnector.fetch: DiscoveredSourceItem ${item.id} has no sourceUri to fetch.`);
    }
    const res = await globalThis.fetch(item.sourceUri, { headers: { "User-Agent": this.userAgent, Accept: "*/*" } });
    if (res.status !== 200) {
      throw new Error(`EdgarConnector.fetch: HTTP ${res.status} fetching ${item.sourceUri}.`);
    }
    const arrayBuffer = await res.arrayBuffer();
    const data = Buffer.from(arrayBuffer);
    const ext = (item.sourceUri.split(".").pop() ?? "").toLowerCase();
    const mimeType = ext === "htm" || ext === "html" ? "text/html" : ext === "txt" ? "text/plain" : ext === "pdf" ? "application/pdf" : undefined;
    return { item, data, contentHash: computeContentHash(data), mimeType };
  }

  /**
   * Pragmatic implementation (task: "don't over-engineer"): re-runs the full
   * discovery pass and treats every item whose filing date is strictly after
   * `cursor` as NEW - a filed SEC document is immutable once filed, so
   * "changed since" is exactly "filed since", and no filing is ever
   * meaningfully UPDATED after the fact.
   */
  async syncSince(cursor: string | null): Promise<SourceDelta[]> {
    const items = await this.discover(cursor ? { since: cursor } : {});
    return items.map((item) => ({ changeType: "NEW" as const, item }));
  }

  /** A lightweight real GET confirming SEC.gov is reachable and returns 200 - the same endpoint resolveCikForTicker uses, so a successful healthCheck is a real signal that ticker resolution will also work. */
  async healthCheck(): Promise<ConnectorHealth> {
    try {
      const { status } = await fetchText(TICKERS_URL, this.userAgent);
      return status === 200 ? { ok: true } : { ok: false, message: `SEC.gov returned HTTP ${status}` };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }
}
