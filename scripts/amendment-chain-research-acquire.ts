/**
 * Research-only EDGAR acquisition for amendment-chain Phase 2.
 * Uses shared EdgarConnector (lib/connectors/edgar-connector.ts) — does not
 * create a competing source registry. Bytes land in .local-amendment-research/
 * (gitignored); git-safe acquisition ledger is written under docs/.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { EdgarConnector } from "../lib/connectors/edgar-connector";
import type { DiscoveredSourceItem } from "../lib/connectors/types";
import { createHash } from "crypto";

const UA = "Headroom/1.0 (contact: engineering@headroom-app.example)";
const BYTE_ROOT = ".local-amendment-research/bytes";
const LEDGER = "docs/amendment-chain-research/phase2/acquisition-ledger.json";

type Target = {
  chainId: string;
  docId: string;
  cik: string;
  accession: string;
  filename: string;
  sourceUri: string;
  role: string;
  title: string;
  notes?: string;
};

/**
 * Incremental targets. Existing ledger entries are preserved (merge by docId).
 * Do not re-list already-acquired docs unless correcting identity/filename.
 */
const TARGETS: Target[] = [
  // Matthews Am1 / Am3 / Am4 / Am5 (Am2 + base + Am6 already in ledger)
  {
    chainId: "matw-2020-03-27-third-ar-loan",
    docId: "matw-am1",
    cik: "0000063296",
    accession: "0000063296-21-000048",
    filename: "firstamendmenttothirdamend.htm",
    sourceUri: "https://www.sec.gov/Archives/edgar/data/63296/000006329621000048/firstamendmenttothirdamend.htm",
    role: "AMENDMENT",
    title: "First Amendment to Third A&R Loan Agreement",
  },
  {
    chainId: "matw-2020-03-27-third-ar-loan",
    docId: "matw-am3",
    cik: "0000063296",
    accession: "0000063296-22-000099",
    filename: "thirdamendmenttothirdamend.htm",
    sourceUri: "https://www.sec.gov/Archives/edgar/data/63296/000006329622000099/thirdamendmenttothirdamend.htm",
    role: "AMENDMENT",
    title: "Third Amendment to Third A&R Loan Agreement",
  },
  {
    chainId: "matw-2020-03-27-third-ar-loan",
    docId: "matw-am4",
    cik: "0000063296",
    accession: "0000063296-23-000044",
    filename: "fourthamendmenttothirdamen.htm",
    sourceUri: "https://www.sec.gov/Archives/edgar/data/63296/000006329623000044/fourthamendmenttothirdamen.htm",
    role: "AMENDMENT",
    title: "Fourth Amendment to Third A&R Loan Agreement",
  },
  {
    chainId: "matw-2020-03-27-third-ar-loan",
    docId: "matw-am5",
    cik: "0000063296",
    accession: "0000063296-24-000010",
    filename: "fifthamendmenttothirdamend.htm",
    sourceUri: "https://www.sec.gov/Archives/edgar/data/63296/000006329624000010/fifthamendmenttothirdamend.htm",
    role: "AMENDMENT",
    title: "Fifth Amendment to Third A&R Loan Agreement",
  },
  // DSGR Am2 filing is a 10-Q; body may summarize Second Amendment (EX-10.1 is image conformed CA)
  {
    chainId: "dsgr-2022-04-01-ar-credit",
    docId: "dsgr-am2-10q",
    cik: "0000703604",
    accession: "0000703604-24-000079",
    filename: "dsgr-20240630.htm",
    sourceUri: "https://www.sec.gov/Archives/edgar/data/703604/000070360424000079/dsgr-20240630.htm",
    role: "FILING_BODY",
    title: "10-Q body accompanying Second Amendment exhibit filing",
    notes: "Narrative summary only; not treated as operative amendment text. EX-10.1 remains image-based conformed CA.",
  },
];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function acquireOne(t: Target) {
  const connector = new EdgarConnector({ cik: t.cik, userAgent: UA });
  const item: DiscoveredSourceItem = {
    id: `${t.accession}:${t.filename}`,
    artifactType: "DOCUMENT",
    sourceIdentifier: t.accession,
    sourceUri: t.sourceUri,
    effectiveDate: null,
    summary: t.title,
  };
  const destDir = join(BYTE_ROOT, t.chainId);
  mkdirSync(destDir, { recursive: true });
  const dest = join(destDir, `${t.docId}__${t.filename}`);
  if (existsSync(dest)) {
    const buf = readFileSync(dest);
    const hash = createHash("sha256").update(buf).digest("hex");
    return {
      ...t,
      acquisitionStatus: "CACHED" as const,
      bytePath: dest,
      byteLength: buf.length,
      sha256: hash,
      contentHashFromConnector: null as string | null,
      error: null as string | null,
    };
  }
  let lastError: string | null = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const art = await connector.fetch(item);
      writeFileSync(dest, art.data);
      return {
        ...t,
        acquisitionStatus: "ACQUIRED" as const,
        bytePath: dest,
        byteLength: art.data.length,
        sha256: createHash("sha256").update(art.data).digest("hex"),
        contentHashFromConnector: art.contentHash,
        error: null as string | null,
      };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      const is429 = /429/.test(lastError);
      if (!is429 || attempt === 5) break;
      const backoff = 15000 * attempt;
      console.log(`  429 backoff ${backoff}ms (attempt ${attempt}/5)`);
      await sleep(backoff);
    }
  }
  return {
    ...t,
    acquisitionStatus: "FAILED" as const,
    bytePath: null as string | null,
    byteLength: null as number | null,
    sha256: null as string | null,
    contentHashFromConnector: null as string | null,
    error: lastError,
  };
}

async function main() {
  mkdirSync(BYTE_ROOT, { recursive: true });
  mkdirSync(join("docs/amendment-chain-research/phase2"), { recursive: true });

  const prior = existsSync(LEDGER)
    ? (JSON.parse(readFileSync(LEDGER, "utf8")) as {
        documents: Array<Record<string, unknown>>;
        corrections?: string[];
      })
    : { documents: [], corrections: [] };

  const byId = new Map<string, Record<string, unknown>>();
  for (const d of prior.documents) {
    byId.set(String(d.docId), d);
  }

  for (const t of TARGETS) {
    console.log("fetch", t.docId, t.accession);
    const r = await acquireOne(t);
    byId.set(t.docId, r as unknown as Record<string, unknown>);
    console.log(" ", r.acquisitionStatus, r.sha256?.slice(0, 12), r.byteLength, r.error ?? "");
    await sleep(1200); // stay under SEC fair-access pressure (retry-safe)
  }

  const corrections = [
    ...(prior.corrections ?? []),
    "matw-am1/am3/am4/am5 acquired (Phase 2 residual gap close)",
    "dsgr-am2-10q filing body acquired for wrapper discovery (not operative text)",
  ];

  const ledger = {
    generatedAt: new Date().toISOString(),
    acquisitionMethod:
      "EdgarConnector.fetch (lib/connectors/edgar-connector.ts) + existing fixture raw for CONMED omnibus/Am2",
    competingRegistryCreated: false,
    byteRoot: BYTE_ROOT,
    documents: [...byId.values()],
    corrections,
  };
  writeFileSync(LEDGER, JSON.stringify(ledger, null, 2));
  console.log("wrote", LEDGER, "docs", ledger.documents.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
