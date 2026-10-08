/**
 * Rate-limited EDGAR exhibit acquisition for WS-DEF corpus expansion.
 *
 * Coordinates with WS-EHB acquisition-queue items when present; otherwise
 * discovers via the existing EdgarConnector. Not a second source registry —
 * writes only under data/definition-encyclopedia/ (WS-DEF runtime).
 *
 * Fair-access: identifying User-Agent, ≤2 concurrent, ~400ms min spacing.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { EdgarConnector, resolveCikForTicker } from "@/lib/connectors/edgar-connector";
import { parseDocument } from "@/lib/extraction/parse";

export const DEF_ENC_USER_AGENT =
  "HeadroomDefinitionEncyclopedia/1.0 (contact: engineering@headroom-app.example; research; respectful fair-access; WS-DEF)";

export interface AcquiredDocumentMeta {
  sourceId: string;
  issuerCik: string;
  issuerTicker?: string;
  issuerTitle?: string;
  accessionNumber?: string;
  filingDate?: string;
  formType?: string;
  sourceUri: string;
  exhibitFilename?: string;
  documentLabel: string;
  documentType: "CREDIT_AGREEMENT" | "INDENTURE" | "AMENDMENT" | "ANCILLARY" | "DEFINITIONS_EXCERPT" | "OTHER";
  agreementVersion: string;
  packageKey: string;
  documentId: string;
  originalBytesHash: string;
  textSha256: string;
  textByteLength: number;
  textPath: string;
  acquisitionTimestamp: string;
  discoverySource: "EHB_QUEUE" | "EDGAR_CONNECTOR" | "FIXTURE";
  representationLevel: "SOURCE_ONLY";
  verificationStatus: "SOURCE_ONLY";
}

export interface EhbQueueItem {
  queueId: string;
  cik: string;
  ticker?: string;
  accessionNumber: string;
  filingDate: string;
  form: string;
  exhibitType: string;
  filename: string;
  description: string;
  documentKind: string;
  sourceUri: string;
  agreementIdentityKey: string;
  relevanceScore: number;
  status: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function sha256(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}

function mapDocType(kind: string, summary: string): AcquiredDocumentMeta["documentType"] {
  const h = `${kind} ${summary}`.toLowerCase();
  if (h.includes("indenture")) return "INDENTURE";
  if (h.includes("amendment") || h.includes("waiver") || h.includes("consent")) return "AMENDMENT";
  if (h.includes("guarantee") || h.includes("security") || h.includes("collateral") || h.includes("intercreditor")) return "ANCILLARY";
  if (h.includes("credit") || h.includes("term loan") || h.includes("abl") || h.includes("restatement")) return "CREDIT_AGREEMENT";
  return "OTHER";
}

let lastFetchAt = 0;
async function fairFetch(url: string): Promise<{ status: number; buf: Buffer }> {
  const wait = Math.max(0, 450 - (Date.now() - lastFetchAt));
  if (wait) await sleep(wait);
  lastFetchAt = Date.now();
  const res = await fetch(url, { headers: { "User-Agent": DEF_ENC_USER_AGENT, Accept: "*/*" } });
  const ab = await res.arrayBuffer();
  return { status: res.status, buf: Buffer.from(ab) };
}

export function loadEhbQueue(queuePath: string): EhbQueueItem[] {
  if (!existsSync(queuePath)) return [];
  const raw = JSON.parse(readFileSync(queuePath, "utf8"));
  const items = Array.isArray(raw) ? raw : (raw.items ?? raw.queue ?? []);
  return items as EhbQueueItem[];
}

/** Prefer one primary financing document per issuer for diversity counting. */
export function selectDiverseQueueItems(items: EhbQueueItem[], maxIssuers: number, maxDocs: number): EhbQueueItem[] {
  const preferredKinds = new Set(["CREDIT_AGREEMENT", "RESTATEMENT", "TERM_LOAN_AGREEMENT", "ABL_AGREEMENT", "INDENTURE"]);
  const byCik = new Map<string, EhbQueueItem[]>();
  for (const it of items) {
    if (it.status && it.status !== "QUEUED" && it.status !== "DONE") continue;
    const list = byCik.get(it.cik) ?? [];
    list.push(it);
    byCik.set(it.cik, list);
  }
  const selected: EhbQueueItem[] = [];
  for (const [, list] of [...byCik.entries()].slice(0, maxIssuers)) {
    const ranked = [...list].sort((a, b) => {
      const ap = preferredKinds.has(a.documentKind) ? 0 : 1;
      const bp = preferredKinds.has(b.documentKind) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0);
    });
    const top = ranked[0];
    if (top) selected.push(top);
    if (selected.length >= maxDocs) break;
  }
  return selected;
}

/** Normalize SEC viewer URLs (ix?doc=) to direct archive document URLs. */
export function normalizeSecDocumentUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.pathname.includes("/ix") && u.searchParams.get("doc")) {
      const doc = u.searchParams.get("doc")!;
      return doc.startsWith("http") ? doc : `https://www.sec.gov${doc.startsWith("/") ? "" : "/"}${doc}`;
    }
  } catch {
    // keep original
  }
  return url;
}

export async function acquireFromUri(args: {
  repoRoot: string;
  sourceUri: string;
  meta: Omit<
    AcquiredDocumentMeta,
    "originalBytesHash" | "textSha256" | "textByteLength" | "textPath" | "acquisitionTimestamp" | "representationLevel" | "verificationStatus"
  >;
}): Promise<AcquiredDocumentMeta | null> {
  const outDir = resolve(args.repoRoot, "data/definition-encyclopedia/acquired");
  mkdirSync(outDir, { recursive: true });
  const fetchUrl = normalizeSecDocumentUrl(args.sourceUri);
  const { status, buf } = await fairFetch(fetchUrl);
  if (status !== 200 || buf.length < 500) return null;

  const mime = args.sourceUri.toLowerCase().endsWith(".txt") ? "text/plain" : "text/html";
  let text: string;
  try {
    const parsed = await parseDocument(buf, mime);
    text = parsed.fullText;
  } catch {
    text = buf.toString("utf8");
  }
  if (text.replace(/\s+/g, " ").trim().length < 400) return null;

  const textSha256 = sha256(text);
  const textPath = join(outDir, `${args.meta.sourceId}.txt`);
  mkdirSync(dirname(textPath), { recursive: true });
  writeFileSync(textPath, text, "utf8");

  const record: AcquiredDocumentMeta = {
    ...args.meta,
    originalBytesHash: sha256(buf),
    textSha256,
    textByteLength: Buffer.byteLength(text, "utf8"),
    textPath: textPath.replace(resolve(args.repoRoot) + "/", ""),
    acquisitionTimestamp: new Date().toISOString(),
    representationLevel: "SOURCE_ONLY",
    verificationStatus: "SOURCE_ONLY",
  };
  writeFileSync(join(outDir, `${args.meta.sourceId}.meta.json`), JSON.stringify(record, null, 2) + "\n");
  return record;
}

export async function acquireFromEhbQueue(args: {
  repoRoot: string;
  queuePath: string;
  maxIssuers: number;
  maxDocs: number;
}): Promise<AcquiredDocumentMeta[]> {
  const items = selectDiverseQueueItems(loadEhbQueue(args.queuePath), args.maxIssuers, args.maxDocs);
  const out: AcquiredDocumentMeta[] = [];
  for (const it of items) {
    const sourceId = `ehb:${it.cik}:${it.accessionNumber}:${it.filename}`.replace(/[^a-zA-Z0-9:_.-]+/g, "_");
    const meta = await acquireFromUri({
      repoRoot: args.repoRoot,
      sourceUri: it.sourceUri,
      meta: {
        sourceId,
        issuerCik: it.cik,
        issuerTicker: it.ticker,
        accessionNumber: it.accessionNumber,
        filingDate: it.filingDate,
        formType: it.form,
        sourceUri: it.sourceUri,
        exhibitFilename: it.filename,
        documentLabel: `${it.ticker ?? it.cik} ${it.description || it.filename} (${it.filingDate})`,
        documentType: mapDocType(it.documentKind, `${it.description} ${it.filename}`),
        agreementVersion: `${it.filingDate} ${it.documentKind}`,
        packageKey: `edgar-${it.cik}`,
        documentId: sourceId,
        discoverySource: "EHB_QUEUE",
      },
    });
    if (meta) out.push(meta);
  }
  return out;
}

/** Fallback discovery via EdgarConnector when EHB queue is empty/incomplete. */
export async function acquireViaEdgarConnector(args: {
  repoRoot: string;
  tickers: string[];
  maxIssuers: number;
  maxDocsPerIssuer?: number;
  filingLimit?: number;
}): Promise<AcquiredDocumentMeta[]> {
  const out: AcquiredDocumentMeta[] = [];
  const seenCik = new Set<string>();
  const maxPer = args.maxDocsPerIssuer ?? 1;

  for (const ticker of args.tickers) {
    if (seenCik.size >= args.maxIssuers) break;
    if (out.length >= args.maxIssuers * maxPer) break;
    let cik: string;
    let title: string;
    try {
      ({ cik, title } = await resolveCikForTicker(ticker, DEF_ENC_USER_AGENT));
    } catch {
      continue;
    }
    if (seenCik.has(cik)) continue;

    const connector = new EdgarConnector({ cik, ticker, userAgent: DEF_ENC_USER_AGENT });
    let items;
    try {
      items = await connector.discover({ limit: args.filingLimit ?? 20 });
    } catch {
      continue;
    }
    if (items.length === 0) continue;

    // Prefer credit-agreement-ish summaries over bare amendments for issuer diversity.
    const ranked = [...items].sort((a, b) => {
      const score = (s: string) => {
        const x = s.toLowerCase();
        if (x.includes("amended and restated") && x.includes("credit")) return 0;
        if (x.includes("credit agreement") && !x.includes("amendment no")) return 1;
        if (x.includes("term loan")) return 2;
        if (x.includes("indenture") && !x.includes("supplemental")) return 3;
        if (x.includes("amendment")) return 5;
        return 4;
      };
      return score(a.summary) - score(b.summary);
    });

    let got = 0;
    for (const item of ranked) {
      if (got >= maxPer) break;
      let raw;
      try {
        raw = await connector.fetch(item);
      } catch {
        continue;
      }
      const mime = raw.mimeType ?? "text/html";
      let text: string;
      try {
        text = (await parseDocument(raw.data, mime)).fullText;
      } catch {
        text = raw.data.toString("utf8");
      }
      if (text.replace(/\s+/g, " ").trim().length < 800) continue;

      const sourceId = `edgar:${cik}:${sha256(raw.data).slice(0, 12)}`;
      const outDir = resolve(args.repoRoot, "data/definition-encyclopedia/acquired");
      mkdirSync(outDir, { recursive: true });
      const textPath = join(outDir, `${sourceId.replace(/:/g, "_")}.txt`);
      writeFileSync(textPath, text, "utf8");
      if (!item.sourceUri) continue;
      const sourceUri = item.sourceUri;
      const filingDate = item.effectiveDate ?? "unknown-date";
      const formMatch = item.summary.match(/^(\S+)/);
      const formType = formMatch?.[1];
      const record: AcquiredDocumentMeta = {
        sourceId,
        issuerCik: cik,
        issuerTicker: ticker,
        issuerTitle: title,
        accessionNumber: item.sourceIdentifier,
        filingDate,
        formType,
        sourceUri,
        exhibitFilename: sourceUri.split("/").pop(),
        documentLabel: `${ticker} — ${item.summary}`,
        documentType: mapDocType("", item.summary),
        agreementVersion: `${filingDate} ${item.summary}`.slice(0, 160),
        packageKey: `edgar-${cik}`,
        documentId: sourceId,
        originalBytesHash: raw.contentHash,
        textSha256: sha256(text),
        textByteLength: Buffer.byteLength(text, "utf8"),
        textPath: textPath.replace(resolve(args.repoRoot) + "/", ""),
        acquisitionTimestamp: new Date().toISOString(),
        discoverySource: "EDGAR_CONNECTOR",
        representationLevel: "SOURCE_ONLY",
        verificationStatus: "SOURCE_ONLY",
      };
      writeFileSync(join(outDir, `${sourceId.replace(/:/g, "_")}.meta.json`), JSON.stringify(record, null, 2) + "\n");
      out.push(record);
      got += 1;
    }
    if (got > 0) seenCik.add(cik);
  }
  return out;
}

/** Diversified issuer tickers for expansion (issuers not limited to Phase-1 fixtures). */
export const EXPANSION_TICKER_UNIVERSE = [
  "F", "AAL", "DAL", "UAL", "LUV", "ALK", "BA", "GD", "LMT", "NOC", "RTX", "TXT",
  "MAR", "HLT", "H", "WH", "CCL", "RCL", "NCLH",
  "BXP", "VNO", "SLG", "KRC", "HIW", "CUZ", "JBGS", "DEI",
  "CNMD", "MATW", "COHR", "ROCK", "JBLU",
  "HAL", "SLB", "BKR", "FTI", "NOV",
  "CAT", "DE", "CMI", "PCAR", "WAB",
  "MMM", "HON", "GE", "EMR", "ETN", "ROK",
  "EMN", "DD", "DOW", "LYB", "CE",
  "IP", "PKG", "SON",
  "NUE", "STLD", "CLF",
  "AA", "FCX", "NEM",
  "MOS", "CF", "ADM", "BG",
  "TSN", "HRL", "CAG", "CPB", "SJM",
  "GIS", "K", "MKC", "HSY",
  "KO", "PEP", "MNST",
  "MCD", "YUM", "QSR", "DPZ", "CMG",
  "SBUX", "DRI", "EAT", "BLMN",
  "TJX", "ROST", "DG", "DLTR", "BBY",
  "LOW", "HD", "TSCO",
  "ANF", "AEO", "URBN",
  "PVH", "RL", "VFC", "HBI",
  "NKE", "LULU", "UAA",
  "HAS", "MAT", "EA", "TTWO",
  "DIS", "NFLX", "PARA", "WBD",
  "CMCSA", "CHTR", "VZ", "T", "TMUS",
  // Additional diversified issuers for Phase-2 scale-up
  "AAPL", "MSFT", "IBM", "ORCL", "CSCO", "INTC", "AMD", "QCOM", "AVGO", "TXN",
  "JPM", "BAC", "WFC", "C", "USB", "PNC", "TFC", "COF",
  "XOM", "CVX", "COP", "EOG", "PXD", "OXY", "MPC", "VLO", "PSX",
  "UNH", "JNJ", "PFE", "MRK", "ABBV", "LLY", "BMY", "AMGN", "GILD", "BIIB",
  "WMT", "AMZN", "COST", "TGT", "KR",
  "UPS", "FDX", "UNP", "CSX", "NSC", "DAL",
  "GM", "F", "TSLA", "RIVN",
  "DUK", "SO", "NEE", "D", "EXC", "AEP", "SRE",
  "AMT", "PLD", "CCI", "EQIX", "SPG", "O", "WELL",
  "SYY", "USFD", "PFGC",
  "GPC", "AZO", "ORLY", "AAP",
  "PHM", "DHI", "LEN", "NVR", "TOL",
  "WY", "IP", "PKG",
  "BALL", "CCK", "SLGN",
  "SEE", "AVY", "GPK",
] as const;
