import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { parseDocument } from "../lib/extraction/parse";
import { normalizeDraftingText, sha256Hex } from "../lib/drafting-novelty/normalize";
import type { AcquiredAgreementManifest } from "../lib/drafting-novelty/phase2-types";

const USER_AGENT = "Headroom/1.0 (contact: engineering@headroom-app.example)";
const root = "data/rare-covenant-drafting-discovery";

async function main(): Promise<void> {
  const manifests: AcquiredAgreementManifest[] = JSON.parse(readFileSync(`${root}/acquired-index.json`, "utf8"));
  const seen = new Set(manifests.map((m) => m.originalBytesHash));
  const seenKeys = new Set(manifests.map((m) => `${m.accessionNumber}:${m.exhibitFilename}`));
  const queue = JSON.parse(
    readFileSync("/tmp/ehb-wt/data/edgar-historical-backfill/run-100/acquisition-queue.json", "utf8"),
  ) as Array<{
    accessionNumber: string;
    filename: string;
    description: string;
    sourceUri: string;
    ticker?: string;
    cik: string;
    filingDate: string;
    form: string;
    priority: number;
  }>;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const toDirect = (u: string) => {
    const m = u.match(/ix\?doc=([^&]+)/);
    if (!m) return u;
    const path = decodeURIComponent(m[1]!);
    return path.startsWith("http") ? path : `https://www.sec.gov${path.startsWith("/") ? "" : "/"}${path}`;
  };
  const fetchBytes = async (url: string) => {
    for (let i = 0; i < 5; i++) {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "*/*" } });
      if (res.status === 429 || res.status >= 500) {
        await sleep(1500 * (i + 1));
        continue;
      }
      return { status: res.status, data: Buffer.from(await res.arrayBuffer()) };
    }
    return { status: 429, data: Buffer.alloc(0) };
  };

  for (const item of [...queue].sort((a, b) => b.priority - a.priority)) {
    if (manifests.length >= 100) break;
    const key = `${item.accessionNumber}:${item.filename}`;
    if (seenKeys.has(key)) continue;
    if (/coverpage|cover page/i.test(item.description)) continue;
    const url = toDirect(item.sourceUri);
    if (url.includes("ix?doc=")) continue;
    await sleep(700);
    const { status, data } = await fetchBytes(url);
    if (status !== 200 || data.length < 8000) continue;
    const hash = createHash("sha256").update(data).digest("hex");
    if (seen.has(hash)) continue;
    const parsed = await parseDocument(data, "text/html");
    const text = normalizeDraftingText(parsed.fullText);
    if (text.length < 3500) continue;
    const ticker = (item.ticker ?? "unk").toUpperCase();
    const sourceId = `edgar:${item.cik}:${item.accessionNumber}:${item.filename}`;
    const textRel = `${root}/extracted-text/${ticker.toLowerCase()}-${item.accessionNumber.replace(/-/g, "")}-${item.filename.replace(/[^\w.-]+/g, "_")}.txt`;
    writeFileSync(textRel, text);
    manifests.push({
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
    });
    seen.add(hash);
    seenKeys.add(key);
    // eslint-disable-next-line no-console
    console.log("added", ticker, text.length, item.description.slice(0, 60));
  }
  writeFileSync(`${root}/acquired-index.json`, `${JSON.stringify(manifests, null, 2)}\n`);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ acquired: manifests.length, issuers: new Set(manifests.map((m) => m.issuerCik)).size }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
