/**
 * Consume WS-EHB acquisition-queue.json via HTTP fetch (no second downloader stack).
 * Converts ix?doc= viewer URLs to direct Archives URLs. Shares fair-access backoff.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { parseDocument } from "../extraction/parse";
import { normalizeDraftingText, sha256Hex } from "./normalize";
import type { AcquiredAgreementManifest } from "./phase2-types";
import type { DocumentSource } from "./types";

const USER_AGENT = "Headroom/1.0 (contact: engineering@headroom-app.example)";

export interface EhbQueueItem {
  queueId: string;
  priority: number;
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
  status?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function toDirectArchiveUrl(sourceUri: string): string {
  if (sourceUri.includes("ix?doc=")) {
    const m = sourceUri.match(/ix\?doc=([^&]+)/);
    if (m?.[1]) {
      const path = decodeURIComponent(m[1]);
      return path.startsWith("http") ? path : `https://www.sec.gov${path.startsWith("/") ? "" : "/"}${path}`;
    }
  }
  return sourceUri;
}

async function fetchBytes(url: string): Promise<{ status: number; data: Buffer; mimeType?: string }> {
  let delay = 1200;
  for (let i = 0; i < 6; i++) {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "*/*" } });
    if (res.status === 429 || res.status >= 500) {
      await sleep(delay + Math.floor(Math.random() * 400));
      delay = Math.min(30_000, delay * 2);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const ext = (url.split(".").pop() ?? "").toLowerCase();
    const mimeType = ext === "htm" || ext === "html" ? "text/html" : ext === "txt" ? "text/plain" : undefined;
    return { status: res.status, data: buf, mimeType };
  }
  return { status: 429, data: Buffer.alloc(0) };
}

export async function consumeEhbAcquisitionQueue(options: {
  queuePath: string;
  targetCount?: number;
  rootDir?: string;
  delayMs?: number;
  existing?: AcquiredAgreementManifest[];
}): Promise<{ manifests: AcquiredAgreementManifest[]; documentSources: DocumentSource[]; errors: string[] }> {
  const root = options.rootDir ?? "data/rare-covenant-drafting-discovery";
  const textDir = `${root}/extracted-text`;
  const manifestDir = `${root}/manifests`;
  mkdirSync(textDir, { recursive: true });
  mkdirSync(manifestDir, { recursive: true });

  const queue = JSON.parse(readFileSync(options.queuePath, "utf8")) as EhbQueueItem[];
  const manifests = [...(options.existing ?? [])];
  const seen = new Set(manifests.map((m) => m.originalBytesHash));
  const seenKeys = new Set(manifests.map((m) => `${m.accessionNumber}:${m.exhibitFilename}`));
  const errors: string[] = [];
  const target = options.targetCount ?? 100;

  const ranked = [...queue].sort((a, b) => b.priority - a.priority || a.queueId.localeCompare(b.queueId));

  for (const item of ranked) {
    if (manifests.length >= target) break;
    const key = `${item.accessionNumber}:${item.filename}`;
    if (seenKeys.has(key)) continue;
    // Prefer substantive agreement bodies over cover/update pages.
    if (/coverpage|cover page|update$/i.test(item.description) && !/exhibit/i.test(item.description)) {
      continue;
    }
    const url = toDirectArchiveUrl(item.sourceUri);
    if (url.includes("ix?doc=")) {
      errors.push(`${item.queueId}: unresolved viewer URL`);
      continue;
    }
    await sleep(options.delayMs ?? 900);
    try {
      const { status, data, mimeType } = await fetchBytes(url);
      if (status !== 200) {
        errors.push(`${item.ticker}/${item.filename}: HTTP ${status}`);
        continue;
      }
      if (data.length < 15_000) continue;
      const hash = createHash("sha256").update(data).digest("hex");
      if (seen.has(hash)) continue;
      const parsed = await parseDocument(data, mimeType ?? "text/html");
      const text = normalizeDraftingText(parsed.fullText);
      if (text.length < 6_000) continue;

      const ticker = (item.ticker ?? "unk").toUpperCase();
      const sourceId = `edgar:${item.cik}:${item.accessionNumber}:${item.filename}`;
      const textRel = `${textDir}/${ticker.toLowerCase()}-${item.accessionNumber.replace(/-/g, "")}-${item.filename.replace(/[^\w.-]+/g, "_")}.txt`;
      writeFileSync(textRel, text, "utf8");
      const manifest: AcquiredAgreementManifest = {
        sourceId,
        issuerCik: item.cik,
        issuerTicker: ticker,
        issuerName: ticker,
        accessionNumber: item.accessionNumber,
        exhibitFilename: item.filename,
        sourceUrl: url,
        filingDate: item.filingDate,
        formType: item.form,
        documentTitle: `${item.form} ${item.description}`.slice(0, 200),
        originalBytesHash: hash,
        normalizedTextHash: sha256Hex(text),
        byteSize: data.length,
        textPath: textRel,
        acquisitionTimestamp: new Date().toISOString(),
        via: "EdgarConnector",
      };
      // via note: body fetch uses same SEC fair-access UA pattern as EdgarConnector; queue from WS-EHB.
      writeFileSync(`${manifestDir}/${createHash("sha256").update(sourceId).digest("hex").slice(0, 16)}.json`, `${JSON.stringify(manifest, null, 2)}\n`);
      manifests.push(manifest);
      seen.add(hash);
      seenKeys.add(key);
    } catch (err) {
      errors.push(`${item.ticker}/${item.filename}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  writeFileSync(`${root}/acquired-index.json`, `${JSON.stringify(manifests, null, 2)}\n`);
  const documentSources: DocumentSource[] = manifests.map((m) => ({
    documentId: m.sourceId,
    packageId: `edgar-${m.issuerTicker.toLowerCase()}`,
    role: "PROBE",
    path: m.textPath,
    label: `${m.issuerTicker} ${m.documentTitle}`.slice(0, 160),
    publicSourceNote: `SEC EDGAR ${m.sourceUrl}`,
  }));
  return { manifests, documentSources, errors };
}

export function loadExistingAcquired(rootDir = "data/rare-covenant-drafting-discovery"): AcquiredAgreementManifest[] {
  const p = `${rootDir}/acquired-index.json`;
  if (!existsSync(p)) return [];
  try {
    return JSON.parse(readFileSync(p, "utf8")) as AcquiredAgreementManifest[];
  } catch {
    return [];
  }
}
