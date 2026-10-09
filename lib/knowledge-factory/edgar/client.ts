/**
 * Production-quality EDGAR discovery/acquisition for the knowledge factory.
 * Additive to lib/connectors/edgar-connector.ts — does not replace company onboarding.
 */

import { createHash } from "node:crypto";
import { SecHttpClient, type SecHttpClientConfig } from "./http";
import {
  collectDebtSignals,
  isMaterialContractExhibitType,
  isPriorityForm,
  PROSE_EXTENSIONS,
} from "./forms";
import type { DiscoveredFilingDocument, ExhibitMetadata, FilingMetadata, IssuerIdentity } from "../types";

const TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const SUBMISSIONS_URL_PREFIX = "https://data.sec.gov/submissions/CIK";

export interface EdgarKnowledgeClientConfig extends SecHttpClientConfig {
  includeOlderFilings?: boolean;
  requireDebtSignal?: boolean;
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
  sequence?: string;
  sizeBytes?: number;
}

export class EdgarKnowledgeClient {
  readonly http: SecHttpClient;
  private readonly includeOlderFilings: boolean;
  private readonly requireDebtSignal: boolean;

  constructor(config: EdgarKnowledgeClientConfig = {}) {
    this.http = new SecHttpClient(config);
    this.includeOlderFilings = config.includeOlderFilings ?? true;
    this.requireDebtSignal = config.requireDebtSignal ?? true;
  }

  async resolveCikForTicker(ticker: string): Promise<IssuerIdentity> {
    const { status, text } = await this.http.getText(TICKERS_URL);
    if (status !== 200) {
      throw new Error(`EdgarKnowledgeClient: ticker map HTTP ${status}`);
    }
    const data = JSON.parse(text) as Record<string, { cik_str: number; ticker: string; title: string }>;
    const normalized = ticker.trim().toUpperCase();
    for (const entry of Object.values(data)) {
      if (entry.ticker.toUpperCase() === normalized) {
        return { cik: String(entry.cik_str).padStart(10, "0"), ticker: entry.ticker, name: entry.title };
      }
    }
    throw new Error(`EdgarKnowledgeClient: ticker "${ticker}" not found`);
  }

  async loadIssuer(cik: string): Promise<{ issuer: IssuerIdentity; recent: RecentFilings; olderFiles: { name: string; filingCount: number }[] }> {
    const padded = cik.padStart(10, "0");
    const { status, text } = await this.http.getText(`${SUBMISSIONS_URL_PREFIX}${padded}.json`);
    if (status !== 200) {
      throw new Error(`EdgarKnowledgeClient: submissions HTTP ${status} for CIK ${padded}`);
    }
    const data = JSON.parse(text) as {
      cik: string | number;
      name: string;
      tickers?: string[];
      filings: { recent: RecentFilings; files?: { name: string; filingCount: number }[] };
    };
    return {
      issuer: {
        cik: padded,
        name: data.name,
        ticker: data.tickers?.[0],
      },
      recent: data.filings.recent,
      olderFiles: data.filings.files ?? [],
    };
  }

  async discoverForCik(
    cik: string,
    options: { since?: string; filingLimit?: number; includeOlder?: boolean } = {},
  ): Promise<DiscoveredFilingDocument[]> {
    const { issuer, recent, olderFiles } = await this.loadIssuer(cik);
    const filingLimit = options.filingLimit ?? 50;
    const filings: FilingMetadata[] = [];

    for (let i = 0; i < recent.form.length && filings.length < filingLimit; i++) {
      const form = recent.form[i]!;
      const filingDate = recent.filingDate[i]!;
      if (!isPriorityForm(form)) continue;
      if (options.since && filingDate <= options.since) continue;
      filings.push({
        accessionNumber: recent.accessionNumber[i]!,
        formType: form,
        filingDate,
        primaryDocument: recent.primaryDocument[i],
        issuer,
      });
    }

    if ((options.includeOlder ?? this.includeOlderFilings) && filings.length < filingLimit) {
      for (const file of olderFiles) {
        if (filings.length >= filingLimit) break;
        const older = await this.loadOlderFilingChunk(issuer.cik, file.name);
        for (const f of older) {
          if (filings.length >= filingLimit) break;
          if (!isPriorityForm(f.formType)) continue;
          if (options.since && f.filingDate <= options.since) continue;
          filings.push(f);
        }
      }
    }

    const out: DiscoveredFilingDocument[] = [];
    for (const filing of filings) {
      try {
        const exhibits = await this.listExhibits(filing);
        for (const exhibit of exhibits) {
          const signals = collectDebtSignals(`${exhibit.filename} ${exhibit.description} ${exhibit.exhibitType}`);
          const material = isMaterialContractExhibitType(exhibit.exhibitType);
          if (this.requireDebtSignal && signals.length === 0) {
            // Do not assume Exhibit 10 alone is a credit agreement.
            continue;
          }
          if (!this.requireDebtSignal && signals.length === 0 && !material) continue;
          const discoverySignals = signals.length > 0 ? signals : material ? ["material_contract_exhibit"] : [];
          const sourceId = makeSourceId(filing.accessionNumber, exhibit.filename);
          out.push({ sourceId, filing, exhibit, discoverySignals });
        }
      } catch {
        // One filing index failure must not abort the issuer pass.
        continue;
      }
    }
    return out;
  }

  async listExhibits(filing: FilingMetadata): Promise<ExhibitMetadata[]> {
    const indexUrl = indexUrlFor(filing.issuer.cik, filing.accessionNumber);
    const { status, text } = await this.http.getText(indexUrl);
    if (status !== 200) {
      throw new Error(`EdgarKnowledgeClient: index HTTP ${status} for ${filing.accessionNumber}`);
    }
    return parseIndexExhibitRows(text)
      .filter((row) => {
        const ext = row.filename.toLowerCase().split(".").pop() ?? "";
        return PROSE_EXTENSIONS.has(ext);
      })
      .map((row) => ({
        filename: row.filename,
        description: row.description,
        exhibitType: row.type,
        sourceUrl: absoluteSecUrl(row.href),
        sequence: row.sequence,
        sizeBytes: row.sizeBytes,
      }));
  }

  async fetchDocument(doc: DiscoveredFilingDocument): Promise<{ bytes: Buffer; contentHash: string; fromCache: boolean }> {
    const res = await this.http.get(doc.exhibit.sourceUrl);
    if (res.status !== 200) {
      throw new Error(`EdgarKnowledgeClient: fetch HTTP ${res.status} for ${doc.exhibit.sourceUrl}`);
    }
    const contentHash = createHash("sha256").update(res.body).digest("hex");
    return { bytes: res.body, contentHash, fromCache: res.fromCache };
  }

  async healthCheck(): Promise<{ ok: boolean; message?: string }> {
    try {
      const { status } = await this.http.getText(TICKERS_URL);
      return status === 200 ? { ok: true } : { ok: false, message: `HTTP ${status}` };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  private async loadOlderFilingChunk(cik: string, fileName: string): Promise<FilingMetadata[]> {
    const padded = cik.padStart(10, "0");
    const url = `https://data.sec.gov/submissions/${fileName}`;
    const { status, text } = await this.http.getText(url);
    if (status !== 200) return [];
    const data = JSON.parse(text) as RecentFilings;
    const out: FilingMetadata[] = [];
    for (let i = 0; i < data.form.length; i++) {
      out.push({
        accessionNumber: data.accessionNumber[i]!,
        formType: data.form[i]!,
        filingDate: data.filingDate[i]!,
        primaryDocument: data.primaryDocument?.[i],
        issuer: { cik: padded },
      });
    }
    return out;
  }
}

export function makeSourceId(accessionNumber: string, filename: string): string {
  return `edgar:${accessionNumber}:${filename}`.toLowerCase();
}

export function indexUrlFor(cik: string, accessionNumber: string): string {
  const accNoDashes = accessionNumber.replace(/-/g, "");
  const cikNoLeadingZeros = String(Number(cik));
  return `https://www.sec.gov/Archives/edgar/data/${cikNoLeadingZeros}/${accNoDashes}/${accessionNumber}-index.htm`;
}

export function absoluteSecUrl(href: string): string {
  return href.startsWith("http") ? href : `https://www.sec.gov${href.startsWith("/") ? "" : "/"}${href}`;
}

export function parseIndexExhibitRows(html: string): ExhibitRow[] {
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
    if (cells.length < 4) continue;
    // Common shapes: Seq|Description|Document|Type|Size  OR Description|Document|Type|Size
    let sequence: string | undefined;
    let description: string;
    let documentCell: string;
    let type: string;
    let sizeCell: string | undefined;
    if (cells.length >= 5) {
      sequence = stripTags(cells[0] ?? "");
      description = stripTags(cells[1] ?? "");
      documentCell = cells[2] ?? "";
      type = stripTags(cells[3] ?? "");
      sizeCell = stripTags(cells[4] ?? "");
    } else {
      description = stripTags(cells[0] ?? "");
      documentCell = cells[1] ?? "";
      type = stripTags(cells[2] ?? "");
      sizeCell = stripTags(cells[3] ?? "");
    }
    const linkMatch = linkRegex.exec(documentCell);
    if (!linkMatch) continue;
    const href = linkMatch[1] ?? "";
    const linkText = stripTags(linkMatch[2] ?? "");
    const filename = href.split("/").pop() ?? linkText;
    const sizeBytes = sizeCell ? Number(String(sizeCell).replace(/,/g, "")) : undefined;
    rows.push({
      description,
      type,
      href,
      filename,
      sequence,
      sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : undefined,
    });
  }
  return rows;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").trim();
}

export function validateSourceUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "www.sec.gov" || u.hostname === "data.sec.gov" || u.hostname.endsWith(".sec.gov"));
  } catch {
    return false;
  }
}
