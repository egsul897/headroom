/**
 * Acquire additional public financing agreements via the EXISTING EdgarConnector.
 *
 * Does not invent a second downloader or source registry.
 * Writes local bytes under data/rare-covenant-drafting-discovery/ (gitignored)
 * and KF-compatible source manifests for the knowledge factory to import.
 *
 * Fair-access: caches company_tickers.json once; backs off on HTTP 429.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { EdgarConnector } from "../connectors/edgar-connector";
import { parseDocument } from "../extraction/parse";
import { normalizeDraftingText, sha256Hex } from "./normalize";
import { allAcquisitionTickers } from "./issuers";
import type { AcquiredAgreementManifest } from "./phase2-types";
import type { DocumentSource } from "./types";

const DEFAULT_ROOT = "data/rare-covenant-drafting-discovery";
const USER_AGENT = "Headroom/1.0 (contact: engineering@headroom-app.example)";
const TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithBackoff(url: string, attempts = 6): Promise<{ status: number; text: string }> {
  let delay = 1500;
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "*/*" } });
    const text = await res.text();
    if (res.status !== 429 && res.status < 500) return { status: res.status, text };
    await sleep(delay + Math.floor(Math.random() * 500));
    delay = Math.min(30_000, delay * 2);
  }
  return { status: 429, text: "" };
}

async function loadTickerMap(cachePath: string): Promise<Map<string, { cik: string; title: string }>> {
  if (existsSync(cachePath)) {
    const raw = JSON.parse(readFileSync(cachePath, "utf8")) as Record<string, { cik: string; title: string }>;
    return new Map(Object.entries(raw));
  }
  const { status, text } = await fetchWithBackoff(TICKERS_URL);
  if (status !== 200) throw new Error(`Failed to fetch company_tickers.json (HTTP ${status})`);
  const data = JSON.parse(text) as Record<string, { cik_str: number; ticker: string; title: string }>;
  const map = new Map<string, { cik: string; title: string }>();
  for (const entry of Object.values(data)) {
    map.set(entry.ticker.toUpperCase(), { cik: String(entry.cik_str).padStart(10, "0"), title: entry.title });
  }
  const obj = Object.fromEntries(map.entries());
  mkdirSync(cachePath.replace(/\/[^/]+$/, ""), { recursive: true });
  writeFileSync(cachePath, `${JSON.stringify(obj)}\n`);
  return map;
}

function looksLikeCreditAgreement(summary: string, filename: string): boolean {
  const h = `${summary} ${filename}`.toLowerCase();
  if (/credit agreement|loan agreement|credit facility|term loan|revolving credit|abl |indenture|intercreditor/.test(h)) {
    // Prefer primary agreements over tiny administrative amendments when possible.
    return true;
  }
  return false;
}

function preferPrimary(summary: string): number {
  const s = summary.toLowerCase();
  if (/amended and restated credit agreement|credit agreement/.test(s) && !/amendment no|first amendment|second amendment/.test(s)) {
    return 3;
  }
  if (/indenture/.test(s)) return 2;
  if (/intercreditor/.test(s)) return 2;
  if (/amendment/.test(s)) return 1;
  return 0;
}

export async function acquireAgreementsViaEdgarConnector(options?: {
  targetCount?: number;
  tickers?: string[];
  rootDir?: string;
  filingsPerTicker?: number;
  maxPerTicker?: number;
  delayMs?: number;
}): Promise<{ manifests: AcquiredAgreementManifest[]; documentSources: DocumentSource[]; errors: string[] }> {
  const target = options?.targetCount ?? 100;
  const tickers = options?.tickers ?? allAcquisitionTickers();
  const root = options?.rootDir ?? DEFAULT_ROOT;
  const textDir = `${root}/extracted-text`;
  const manifestDir = `${root}/manifests`;
  mkdirSync(textDir, { recursive: true });
  mkdirSync(manifestDir, { recursive: true });

  const manifests: AcquiredAgreementManifest[] = [];
  const errors: string[] = [];
  const seenHashes = new Set<string>();

  // Resume from prior manifests if present.
  if (existsSync(`${root}/acquired-index.json`)) {
    try {
      const prior = JSON.parse(readFileSync(`${root}/acquired-index.json`, "utf8")) as AcquiredAgreementManifest[];
      for (const m of prior) {
        seenHashes.add(m.originalBytesHash);
        if (existsSync(m.textPath) || existsSync(`${process.cwd()}/${m.textPath}`)) {
          manifests.push(m);
        }
      }
    } catch {
      /* ignore corrupt resume */
    }
  }

  let tickerMap: Map<string, { cik: string; title: string }>;
  try {
    await sleep(2000);
    tickerMap = await loadTickerMap(`${root}/.sec-cache/company_tickers.json`);
  } catch (err) {
    return {
      manifests,
      documentSources: [],
      errors: [`ticker_map: ${err instanceof Error ? err.message : String(err)}`],
    };
  }

  for (const ticker of tickers) {
    if (manifests.length >= target) break;
    try {
      await sleep(options?.delayMs ?? 800);
      const resolved = tickerMap.get(ticker.toUpperCase());
      if (!resolved) {
        errors.push(`${ticker}: not in SEC ticker map`);
        continue;
      }
      const { cik, title } = resolved;
      const connector = new EdgarConnector({ cik, ticker });
      const items = await connector.discover({ limit: options?.filingsPerTicker ?? 20 });
      const ranked = items
        .filter((it) => looksLikeCreditAgreement(it.summary, it.id))
        .sort((a, b) => preferPrimary(b.summary) - preferPrimary(a.summary) || a.id.localeCompare(b.id));

      let taken = 0;
      for (const item of ranked) {
        if (manifests.length >= target || taken >= (options?.maxPerTicker ?? 2)) break;
        await sleep(options?.delayMs ?? 350);
        try {
          const raw = await connector.fetch(item);
          if (seenHashes.has(raw.contentHash)) continue;
          if (raw.data.length < 20_000) continue; // skip tiny exhibits
          const parsed = await parseDocument(raw.data, raw.mimeType ?? "text/html");
          const text = normalizeDraftingText(parsed.fullText);
          if (text.length < 8_000) continue;

          const accession = item.sourceIdentifier;
          const filename = item.id.split(":").pop() ?? "exhibit.htm";
          const sourceId = `edgar:${cik}:${accession}:${filename}`;
          const textRel = `${textDir}/${ticker.toLowerCase()}-${accession.replace(/-/g, "")}-${filename.replace(/[^\w.-]+/g, "_")}.txt`;
          writeFileSync(textRel, text, "utf8");

          const manifest: AcquiredAgreementManifest = {
            sourceId,
            issuerCik: cik,
            issuerTicker: ticker,
            issuerName: title,
            accessionNumber: accession,
            exhibitFilename: filename,
            sourceUrl: item.sourceUri ?? "",
            filingDate: item.effectiveDate ?? "",
            formType: item.summary.split(" ")[0] ?? "8-K",
            documentTitle: item.summary,
            originalBytesHash: raw.contentHash,
            normalizedTextHash: sha256Hex(text),
            byteSize: raw.data.length,
            textPath: textRel,
            acquisitionTimestamp: new Date().toISOString(),
            via: "EdgarConnector",
          };
          writeFileSync(`${manifestDir}/${createHash("sha256").update(sourceId).digest("hex").slice(0, 16)}.json`, `${JSON.stringify(manifest, null, 2)}\n`);
          manifests.push(manifest);
          seenHashes.add(raw.contentHash);
          taken++;
        } catch (err) {
          errors.push(`${ticker}/${item.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } catch (err) {
      errors.push(`${ticker}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  writeFileSync(`${root}/acquired-index.json`, `${JSON.stringify(manifests, null, 2)}\n`);

  const documentSources: DocumentSource[] = manifests.map((m) => ({
    documentId: m.sourceId,
    packageId: `edgar-${m.issuerTicker.toLowerCase()}`,
    role: "PROBE" as const,
    path: m.textPath,
    label: `${m.issuerTicker} ${m.documentTitle}`.slice(0, 160),
    publicSourceNote: `SEC EDGAR ${m.sourceUrl}`,
  }));

  return { manifests, documentSources, errors };
}
