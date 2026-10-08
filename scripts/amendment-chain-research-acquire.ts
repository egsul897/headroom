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

const TARGETS: Target[] = [
  // CONMED
  {
    chainId: "cnmd-seventh-ar-to-eighth-ar",
    docId: "cnmd-seventh-ar",
    cik: "0000816956",
    accession: "0001193125-21-217426",
    filename: "d170717dex102.htm",
    sourceUri: "https://www.sec.gov/Archives/edgar/data/816956/000119312521217426/d170717dex102.htm",
    role: "RESTATEMENT",
    title: "Seventh Amended and Restated Credit Agreement (EX-10.2)",
  },
  // Matthews Second Amendment
  {
    chainId: "matw-2020-03-27-third-ar-loan",
    docId: "matw-am2",
    cik: "0000063296",
    accession: "0000063296-22-000060",
    filename: "secondamendmenttothirdamen.htm",
    sourceUri: "https://www.sec.gov/Archives/edgar/data/63296/000006329622000060/secondamendmenttothirdamen.htm",
    role: "AMENDMENT",
    title: "Second Amendment to Third A&R Loan Agreement",
  },
  // DSGR First + Second
  {
    chainId: "dsgr-2022-04-01-ar-credit",
    docId: "dsgr-am1",
    cik: "0000703604",
    accession: "0001193125-23-163984",
    filename: "d511994dex101.htm",
    sourceUri: "https://www.sec.gov/Archives/edgar/data/703604/000119312523163984/d511994dex101.htm",
    role: "AMENDMENT",
    title: "First Amendment to Amended and Restated Credit Agreement",
  },
  {
    chainId: "dsgr-2022-04-01-ar-credit",
    docId: "dsgr-am2",
    cik: "0000703604",
    accession: "0000703604-24-000079",
    filename: "dsg-secondamendmenttocre.htm",
    sourceUri: "https://www.sec.gov/Archives/edgar/data/703604/000070360424000079/dsg-secondamendmenttocre.htm",
    role: "AMENDMENT",
    title: "Second Amendment to Amended and Restated Credit Agreement",
  },
  // Coherent original + Am1-3 (+ re-verify Am4/Am5)
  {
    chainId: "cohr-2022-07-01-credit-agreement",
    docId: "cohr-ca-orig",
    cik: "0000820318",
    accession: "0001193125-22-186770",
    filename: "d307343dex101.htm",
    sourceUri: "https://www.sec.gov/Archives/edgar/data/820318/000119312522186770/d307343dex101.htm",
    role: "ORIGINAL",
    title: "Credit Agreement dated July 1, 2022",
  },
  {
    chainId: "cohr-2022-07-01-credit-agreement",
    docId: "cohr-am1",
    cik: "0000820318",
    accession: "0000820318-23-000009",
    filename: "ex1001-amendmentno1tocredi.htm",
    sourceUri: "https://www.sec.gov/Archives/edgar/data/820318/000082031823000009/ex1001-amendmentno1tocredi.htm",
    role: "AMENDMENT",
    title: "Amendment No. 1 to Credit Agreement",
  },
  {
    chainId: "cohr-2022-07-01-credit-agreement",
    docId: "cohr-am2",
    cik: "0000820318",
    accession: "0001193125-24-085009",
    filename: "d794721dex101.htm",
    sourceUri: "https://www.sec.gov/Archives/edgar/data/820318/000119312524085009/d794721dex101.htm",
    role: "AMENDMENT",
    title: "Amendment No. 2 to Credit Agreement",
  },
  {
    chainId: "cohr-2022-07-01-credit-agreement",
    docId: "cohr-am3",
    cik: "0000820318",
    accession: "0001193125-25-002808",
    filename: "d891952dex101.htm",
    sourceUri: "https://www.sec.gov/Archives/edgar/data/820318/000119312525002808/d891952dex101.htm",
    role: "AMENDMENT",
    title: "Amendment No. 3 to Credit Agreement",
  },
  {
    chainId: "cohr-2022-07-01-credit-agreement",
    docId: "cohr-am4",
    cik: "0000820318",
    accession: "0001193125-25-220656",
    filename: "d854664dex101.htm",
    sourceUri: "https://www.sec.gov/Archives/edgar/data/820318/000119312525220656/d854664dex101.htm",
    role: "AMENDMENT",
    title: "Amendment No. 4",
  },
  {
    chainId: "cohr-2022-07-01-credit-agreement",
    docId: "cohr-am5",
    cik: "0000820318",
    accession: "0001193125-25-220656",
    filename: "d854664dex102.htm",
    sourceUri: "https://www.sec.gov/Archives/edgar/data/820318/000119312525220656/d854664dex102.htm",
    role: "AMENDMENT",
    title: "Amendment No. 5",
  },
  // Internap original + early amendments
  {
    chainId: "inap-2017-04-06-credit-agreement",
    docId: "inap-ca-orig",
    cik: "0001056386",
    accession: "0001571049-17-003250",
    filename: "t1700214_ex10-1.htm",
    sourceUri: "https://www.sec.gov/Archives/edgar/data/1056386/000157104917003250/t1700214_ex10-1.htm",
    role: "ORIGINAL",
    title: "Credit Agreement dated April 6, 2017 (EX-10.1)",
  },
  {
    chainId: "inap-2017-04-06-credit-agreement",
    docId: "inap-am1",
    cik: "0001056386",
    accession: "0001628280-17-008032",
    filename: "exhibit109firstamendmentto.htm",
    sourceUri: "https://www.sec.gov/Archives/edgar/data/1056386/000162828017008032/exhibit109firstamendmentto.htm",
    role: "AMENDMENT",
    title: "First Amendment to Credit Agreement",
  },
  {
    chainId: "inap-2017-04-06-credit-agreement",
    docId: "inap-am7",
    cik: "0001056386",
    accession: "0001140361-19-019513",
    filename: "ex10_1.htm",
    sourceUri: "https://www.sec.gov/Archives/edgar/data/1056386/000114036119019513/ex10_1.htm",
    role: "AMENDMENT",
    title: "Seventh Amendment to Credit Agreement",
  },
  // Matthews base + Am6 re-verify
  {
    chainId: "matw-2020-03-27-third-ar-loan",
    docId: "matw-third-ar",
    cik: "0000063296",
    accession: "0000063296-20-000040",
    filename: "ex101loanagreement.htm",
    sourceUri: "https://www.sec.gov/Archives/edgar/data/63296/000006329620000040/ex101loanagreement.htm",
    role: "RESTATEMENT",
    title: "Third Amended and Restated Loan Agreement",
  },
  {
    chainId: "matw-2020-03-27-third-ar-loan",
    docId: "matw-am6",
    cik: "0000063296",
    accession: "0001193125-24-224129",
    filename: "d872508dex102.htm",
    sourceUri: "https://www.sec.gov/Archives/edgar/data/63296/000119312524224129/d872508dex102.htm",
    role: "AMENDMENT",
    title: "Sixth Amendment",
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
    return {
      ...t,
      acquisitionStatus: "FAILED" as const,
      bytePath: null as string | null,
      byteLength: null as number | null,
      sha256: null as string | null,
      contentHashFromConnector: null as string | null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function main() {
  mkdirSync(BYTE_ROOT, { recursive: true });
  const results = [];
  for (const t of TARGETS) {
    console.log("fetch", t.docId, t.accession);
    const r = await acquireOne(t);
    results.push(r);
    console.log(" ", r.acquisitionStatus, r.sha256?.slice(0, 12), r.byteLength, r.error ?? "");
    await sleep(350); // stay under fair-access pressure
  }

  // Record CONMED omnibus blackline from existing fixture raw (embedded exhibits)
  const omnibusRaw =
    "tests/fixtures/unseen-packages/conmed-2025-credit-facility/raw-source/ex10-1-first-omnibus-amendment-2026-06-01.htm";
  const oBuf = readFileSync(omnibusRaw);
  results.push({
    chainId: "cnmd-seventh-ar-to-eighth-ar",
    docId: "cnmd-omnibus-2026",
    cik: "0000816956",
    accession: "0002077096-26-000190",
    filename: "ea029246401ex10-1.htm",
    sourceUri: "https://www.sec.gov/Archives/edgar/data/816956/000207709626000190/ea029246401ex10-1.htm",
    role: "OMNIBUS_AMENDMENT",
    title: "First Omnibus Amendment (includes embedded Amended CA / GCA blackline exhibits)",
    notes:
      "SEC filing lists only EX-10.1; Amended Credit Agreement and Amended GCA blacklines are incorporated by attachment inside EX-10.1 (not separate accession exhibits). Existing fixture raw-source used; sha256 recorded.",
    acquisitionStatus: "FIXTURE_RAW_PRESENT",
    bytePath: omnibusRaw,
    byteLength: oBuf.length,
    sha256: createHash("sha256").update(oBuf).digest("hex"),
    contentHashFromConnector: null,
    error: null,
  });

  // CONMED Second Amendment fixture raw
  const am2Raw =
    "tests/fixtures/unseen-packages/conmed-2025-credit-facility/raw-source/ex10-2-second-amendment-2022-08-02.htm";
  const a2 = readFileSync(am2Raw);
  results.push({
    chainId: "cnmd-seventh-ar-to-eighth-ar",
    docId: "cnmd-second-am-2022",
    cik: "0000816956",
    accession: "0001193125-22-209154",
    filename: "d220699dex102.htm",
    sourceUri: "https://www.sec.gov/Archives/edgar/data/816956/000119312522209154/d220699dex102.htm",
    role: "AMENDMENT",
    title: "Second Amendment to Seventh A&R",
    acquisitionStatus: "FIXTURE_RAW_PRESENT",
    bytePath: am2Raw,
    byteLength: a2.length,
    sha256: createHash("sha256").update(a2).digest("hex"),
    contentHashFromConnector: null,
    error: null,
  });

  const ledger = {
    generatedAt: new Date().toISOString(),
    acquisitionMethod: "EdgarConnector.fetch (lib/connectors/edgar-connector.ts) + existing fixture raw for CONMED omnibus/Am2",
    competingRegistryCreated: false,
    byteRoot: BYTE_ROOT,
    documents: results,
  };
  writeFileSync(LEDGER, JSON.stringify(ledger, null, 2));
  console.log("wrote", LEDGER, "docs", results.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
