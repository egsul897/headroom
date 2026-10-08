#!/usr/bin/env npx tsx
/**
 * CLI — Covenant Precedent Research Interface
 *
 * Usage:
 *   npx tsx scripts/covenant-precedent-research.ts "Find credit agreements with a $25 million general debt basket"
 *   npx tsx scripts/covenant-precedent-research.ts --issuer DSGR --family INDEBTEDNESS --amount 25000000
 *   npx tsx scripts/covenant-precedent-research.ts --json --operative-only "springing leverage covenants"
 *
 * Hybrid lexical/structural retrieval only — no paid vector calls.
 */

import {
  DEFAULT_RESEARCH_CORPUS_PATH,
  formatResearchResponse,
  ingestDefaultDiscoveryPackages,
  loadResearchCorpusFromFile,
  parseResearchQuery,
  retrieveResearch,
  tryLoadResearchCorpusFromDb,
  type ResearchIntent,
  type StructuredQueryInput,
} from "../lib/covenant-research";

function usage(): never {
  console.error(`Covenant Precedent Research Interface

Usage:
  npx tsx scripts/covenant-precedent-research.ts [options] "<natural language query>"

Options:
  --issuer <id|ticker|name>     Filter by issuer (repeatable)
  --agreement-type <TYPE>       Filter by agreement type (repeatable)
  --family <COVENANT_FAMILY>    Filter / prefer covenant family (repeatable)
  --amount <USD>                Money amount filter (e.g. 25000000)
  --date-from <YYYY-MM-DD>      Filing date lower bound
  --date-to <YYYY-MM-DD>        Filing date upper bound
  --condition <TYPE>            Condition type filter (e.g. NO_DEFAULT)
  --intent <INTENT>             Force a research intent
  --operative-only              Only CURRENT_OPERATIVE entries
  --limit <n>                   Max hits (default 10)
  --corpus <path>               Corpus JSON path (default fixture corpus)
  --from-db                     Also try SemanticTruthRecord projection (falls back if empty)
  --with-discovery-ingest       Merge FWRG/LSB discovery-candidate fixtures into the corpus
  --json                        Emit JSON instead of text
  --help                        Show this help

Results are source-backed retrieval hits — not legal opinions or approved capacity.
`);
  process.exit(2);
}

function parseArgs(argv: string[]): {
  structured: StructuredQueryInput;
  limit: number;
  corpusPath: string;
  fromDb: boolean;
  withDiscoveryIngest: boolean;
  asJson: boolean;
} {
  const structured: StructuredQueryInput = {};
  let limit = 10;
  let corpusPath = DEFAULT_RESEARCH_CORPUS_PATH;
  let fromDb = false;
  let withDiscoveryIngest = false;
  let asJson = false;
  const issuers: string[] = [];
  const agreementTypes: string[] = [];
  const families: string[] = [];
  const conditions: string[] = [];
  const textParts: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = () => {
      const v = argv[++i];
      if (v == null) usage();
      return v;
    };
    switch (a) {
      case "--help":
      case "-h":
        usage();
        break;
      case "--issuer":
        issuers.push(next());
        break;
      case "--agreement-type":
        agreementTypes.push(next());
        break;
      case "--family":
        families.push(next());
        break;
      case "--amount":
        structured.amountUsd = Number(next());
        break;
      case "--date-from":
        structured.dateFrom = next();
        break;
      case "--date-to":
        structured.dateTo = next();
        break;
      case "--condition":
        conditions.push(next());
        break;
      case "--intent":
        structured.intent = next() as ResearchIntent;
        break;
      case "--operative-only":
        structured.operativeOnly = true;
        break;
      case "--limit":
        limit = Number(next());
        break;
      case "--corpus":
        corpusPath = next();
        break;
      case "--from-db":
        fromDb = true;
        break;
      case "--with-discovery-ingest":
        withDiscoveryIngest = true;
        break;
      case "--json":
        asJson = true;
        break;
      default:
        if (a.startsWith("-")) {
          console.error(`Unknown option: ${a}`);
          usage();
        }
        textParts.push(a);
        break;
    }
  }

  structured.text = textParts.join(" ").trim() || undefined;
  if (issuers.length) structured.issuer = issuers;
  if (agreementTypes.length) structured.agreementType = agreementTypes;
  if (families.length) structured.family = families;
  if (conditions.length) structured.conditionType = conditions;

  if (!structured.text && structured.amountUsd == null && !structured.intent && !structured.family) {
    usage();
  }

  return { structured, limit, corpusPath, fromDb, withDiscoveryIngest, asJson };
}

async function main() {
  const { structured, limit, corpusPath, fromDb, withDiscoveryIngest, asJson } = parseArgs(process.argv.slice(2));

  let corpus = loadResearchCorpusFromFile(corpusPath);
  if (withDiscoveryIngest) {
    const ingested = ingestDefaultDiscoveryPackages();
    const seen = new Set(corpus.map((e) => e.entryId));
    for (const e of ingested) {
      if (!seen.has(e.entryId)) {
        corpus.push(e);
        seen.add(e.entryId);
      }
    }
  }
  if (fromDb) {
    const dbEntries = await tryLoadResearchCorpusFromDb();
    if (dbEntries.length > 0) {
      const seen = new Set(corpus.map((e) => e.entryId));
      for (const e of dbEntries) {
        if (!seen.has(e.entryId)) corpus.push(e);
      }
    }
  }

  const query = parseResearchQuery(structured);
  const response = retrieveResearch(query, { corpus, limit });

  if (asJson) {
    console.log(JSON.stringify(response, null, 2));
  } else {
    process.stdout.write(formatResearchResponse(response));
  }

  if (response.refused) process.exit(3);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
