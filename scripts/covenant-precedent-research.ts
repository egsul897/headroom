#!/usr/bin/env npx tsx
/**
 * CLI — Covenant Precedent Research Interface (Phase 3)
 *
 * Usage:
 *   npx tsx scripts/covenant-precedent-research.ts "Find credit agreements with a $25 million general debt basket"
 *   npx tsx scripts/covenant-precedent-research.ts --phase3-corpus --as-of 2024-06-01 --operative-only "Restricted Payments"
 *   npx tsx scripts/covenant-precedent-research.ts --report-corpus
 *   npx tsx scripts/covenant-precedent-research.ts --eval-held-out
 *   npx tsx scripts/covenant-precedent-research.ts --eval-independent --phase3-corpus
 */

import {
  DEFAULT_RESEARCH_CORPUS_PATH,
  buildPhase2ResearchCorpus,
  buildPhase3ResearchCorpus,
  evaluateHeldOutRetrieval,
  evaluateIndependentRetrieval,
  formatResearchResponse,
  ingestDefaultDiscoveryPackages,
  loadResearchCorpusFromFile,
  parseResearchQuery,
  probeCanonicalExportAdapters,
  probeKnowledgeFactoryIntegrations,
  retrieveResearch,
  tryLoadResearchCorpusFromDb,
  type ResearchIntent,
  type StructuredQueryInput,
} from "../lib/covenant-research";

function usage(): never {
  console.error(`Covenant Precedent Research Interface (Phase 3)

Usage:
  npx tsx scripts/covenant-precedent-research.ts [options] "<natural language query>"

Options:
  --issuer <id|ticker|name>     Filter by issuer (repeatable)
  --agreement-type <TYPE>       Filter by agreement type (repeatable)
  --family <COVENANT_FAMILY>    Filter / prefer covenant family (repeatable)
  --amount <USD>                Money amount filter (e.g. 25000000)
  --date-from <YYYY-MM-DD>      Filing date lower bound
  --date-to <YYYY-MM-DD>        Filing date upper bound
  --as-of <YYYY-MM-DD>          Amendment-aware as-of date
  --condition <TYPE>            Condition type filter (e.g. NO_DEFAULT)
  --intent <INTENT>             Force a research intent
  --operative-only              Only CURRENT_OPERATIVE (as-of aware)
  --limit <n>                   Max hits (default 10)
  --corpus <path>               Curated corpus JSON path
  --phase2-corpus               Build corpus from curated + phase2 discovery/compiled fixtures
  --phase3-corpus               Build corpus from phase2 + SUP + Gibraltar structure + CKF exports
  --with-discovery-ingest       Legacy: merge FWRG/LSB discovery only
  --from-db                     Try SemanticTruthRecord projection (falls back if empty)
  --report-corpus               Print corpus build + knowledge-factory + adapter status JSON and exit
  --eval-held-out               Run Phase-2 held-out retrieval metrics JSON and exit
  --eval-independent            Run issuer-disjoint independent eval metrics JSON and exit
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
  phase2Corpus: boolean;
  phase3Corpus: boolean;
  reportCorpus: boolean;
  evalHeldOut: boolean;
  evalIndependent: boolean;
  asJson: boolean;
} {
  const structured: StructuredQueryInput = {};
  let limit = 10;
  let corpusPath = DEFAULT_RESEARCH_CORPUS_PATH;
  let fromDb = false;
  let withDiscoveryIngest = false;
  let phase2Corpus = false;
  let phase3Corpus = false;
  let reportCorpus = false;
  let evalHeldOut = false;
  let evalIndependent = false;
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
      case "--as-of":
        structured.asOfDate = next();
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
      case "--phase2-corpus":
        phase2Corpus = true;
        break;
      case "--phase3-corpus":
        phase3Corpus = true;
        break;
      case "--report-corpus":
        reportCorpus = true;
        break;
      case "--eval-held-out":
        evalHeldOut = true;
        break;
      case "--eval-independent":
        evalIndependent = true;
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

  if (
    !reportCorpus &&
    !evalHeldOut &&
    !evalIndependent &&
    !structured.text &&
    structured.amountUsd == null &&
    !structured.intent &&
    !structured.family
  ) {
    usage();
  }

  return {
    structured,
    limit,
    corpusPath,
    fromDb,
    withDiscoveryIngest,
    phase2Corpus,
    phase3Corpus,
    reportCorpus,
    evalHeldOut,
    evalIndependent,
    asJson,
  };
}

async function loadCorpus(opts: {
  corpusPath: string;
  fromDb: boolean;
  withDiscoveryIngest: boolean;
  phase2Corpus: boolean;
  phase3Corpus: boolean;
}) {
  if (opts.phase3Corpus) {
    return buildPhase3ResearchCorpus().entries;
  }
  if (opts.phase2Corpus) {
    return buildPhase2ResearchCorpus().entries;
  }
  let corpus = loadResearchCorpusFromFile(opts.corpusPath);
  if (opts.withDiscoveryIngest) {
    const ingested = ingestDefaultDiscoveryPackages();
    const seen = new Set(corpus.map((e) => e.entryId));
    for (const e of ingested) {
      if (!seen.has(e.entryId)) {
        corpus.push(e);
        seen.add(e.entryId);
      }
    }
  }
  if (opts.fromDb) {
    const dbEntries = await tryLoadResearchCorpusFromDb();
    const seen = new Set(corpus.map((e) => e.entryId));
    for (const e of dbEntries) {
      if (!seen.has(e.entryId)) corpus.push(e);
    }
  }
  return corpus;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.reportCorpus) {
    const report = args.phase2Corpus ? buildPhase2ResearchCorpus() : buildPhase3ResearchCorpus();
    const { entries: _e, ...summary } = report;
    console.log(
      JSON.stringify(
        {
          corpus: summary,
          knowledgeFactory: probeKnowledgeFactoryIntegrations(),
          canonicalAdapters: probeCanonicalExportAdapters(),
          databaseIntegrationStatus: process.env.DATABASE_URL
            ? "DATABASE_URL_PRESENT_UNVERIFIED_SAFE_TEST"
            : "DB_INTEGRATION_UNVERIFIED",
        },
        null,
        2,
      ),
    );
    return;
  }

  const corpus = await loadCorpus(args);

  if (args.evalIndependent) {
    const evalReport = evaluateIndependentRetrieval(corpus);
    console.log(JSON.stringify(evalReport, null, 2));
    return;
  }

  if (args.evalHeldOut) {
    const evalReport = evaluateHeldOutRetrieval(corpus);
    console.log(JSON.stringify(evalReport, null, 2));
    return;
  }

  const query = parseResearchQuery(args.structured);
  const response = retrieveResearch(query, { corpus, limit: args.limit });

  if (args.asJson) {
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
