#!/usr/bin/env tsx
/**
 * Bounded real-world CKF production pilot targeting ~100 distinct financing documents.
 *
 * Coordinates with WS-EHB via docs/knowledge-factory/coordination/ehb-handoff-summary.json
 * (consumer copy of EHB's committed handoff). CKF owns download/registry.
 *
 * Persistence: local durable corpus under .local-knowledge-corpus/ (gitignored bytes).
 * DATABASE_URL is not required; absence is reported honestly.
 *
 * Usage:
 *   HEADROOM_SEC_FETCH_OWNER=WS-CKF npx tsx scripts/knowledge-factory/run-pilot-100.ts
 *   npx tsx scripts/knowledge-factory/run-pilot-100.ts --target 100 --no-network  # reprocess + report only
 */

import { mkdirSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { EdgarKnowledgeClient } from "../../lib/knowledge-factory/edgar/client";
import { CorpusStore, defaultCorpusPaths } from "../../lib/knowledge-factory/store/corpus-store";
import {
  processAcquiredDocument,
  ingestIssuerFromEdgar,
  finalizeCorpusIndex,
} from "../../lib/knowledge-factory/pipeline/run";
import { loadEhbHandoffPackage, handoffToDiscovered } from "../../lib/knowledge-factory/coordination/ehb-handoff";
import { attachInstrumentIdentity } from "../../lib/knowledge-factory/pipeline/instrument-identity";
import { stratifiedPilotPlan } from "../../lib/knowledge-factory/corpus/issuer-sample";
import type { DiscoveredFilingDocument } from "../../lib/knowledge-factory/types";
import {
  NON_DEBT_TITLE as NON_DEBT,
  isDebtSource,
  isFinancingDoc,
} from "../../lib/knowledge-factory/corpus/financing-filter";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(name);
}

async function reprocessExisting(store: CorpusStore): Promise<number> {
  let n = 0;
  for (const s of store.listSources()) {
    const bytes = store.readBytes(s.originalBytesHash);
    if (!bytes) continue;
    const discovered: DiscoveredFilingDocument = {
      sourceId: s.sourceId,
      filing: {
        accessionNumber: s.accessionNumber,
        formType: s.formType,
        filingDate: s.filingDate,
        issuer: { cik: s.issuerCik, ticker: s.issuerTicker, name: s.issuerName },
      },
      exhibit: {
        filename: s.exhibitFilename,
        description: s.documentTitle,
        exhibitType: "EX-10",
        sourceUrl: s.sourceUrl,
      },
      discoverySignals: ["reprocess"],
    };
    await processAcquiredDocument(store, {
      discovered,
      bytes,
      contentHash: s.originalBytesHash,
      provenance: s.provenance,
      usageRightsReviewStatus: s.usageRightsReviewStatus,
    });
    const updated = store.getSource(s.sourceId);
    if (updated) store.upsertSource(attachInstrumentIdentity(updated));
    n += 1;
  }
  return n;
}

async function acquireFromEhb(store: CorpusStore, client: EdgarKnowledgeClient): Promise<{ acquired: number; duplicates: number; errors: string[] }> {
  const handoffPath = path.resolve("docs/knowledge-factory/coordination/ehb-handoff-summary.json");
  const pkg = loadEhbHandoffPackage(handoffPath);
  let acquired = 0;
  let duplicates = 0;
  const errors: string[] = [];
  const claims: Record<string, string> = store.readJson("ehb-claims.json") ?? {};

  for (const doc of pkg.documents) {
    const discovered = handoffToDiscovered(doc);
    claims[doc.ehbQueueId ?? discovered.sourceId] = "CLAIMED";
    try {
      const { bytes, contentHash, fromCache } = await client.fetchDocument(discovered);
      const result = await processAcquiredDocument(store, {
        discovered,
        bytes,
        contentHash,
        provenance: "ehb-handoff",
        usageRightsReviewStatus: "PUBLIC_SEC_EDGAR",
      });
      if (result.wasDuplicate) {
        duplicates += 1;
        claims[doc.ehbQueueId ?? discovered.sourceId] = "DONE_DUPLICATE";
      } else {
        acquired += 1;
        claims[doc.ehbQueueId ?? discovered.sourceId] = "DONE";
      }
      if (!fromCache) {
        /* counted in http metrics */
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${discovered.sourceId}: ${msg}`);
      claims[doc.ehbQueueId ?? discovered.sourceId] = "FAILED";
    }
  }
  store.writeJson("ehb-claims.json", claims);
  return { acquired, duplicates, errors };
}

async function topUpFromIssuers(
  store: CorpusStore,
  client: EdgarKnowledgeClient,
  target: number,
): Promise<{ acquired: number; errors: string[] }> {
  let financing = store.listSources().filter(isFinancingDoc).length;
  let acquired = 0;
  const errors: string[] = [];
  const seeds = stratifiedPilotPlan(100);
  for (const seed of seeds) {
    if (financing >= target) break;
    try {
      const before = new Set(store.listSources().map((s) => s.sourceId));
      const r = await ingestIssuerFromEdgar(store, client, { ticker: seed.ticker }, { maxDocuments: 3, filingLimit: 150 });
      for (const id of r.sourceIds) {
        if (before.has(id)) continue;
        const s = store.getSource(id);
        if (s && isFinancingDoc(s)) {
          acquired += 1;
          financing += 1;
        }
      }
      console.log(`topup ${seed.ticker}: downloaded=${r.downloaded} financing=${financing}/${target}`);
    } catch (err) {
      errors.push(`${seed.ticker}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { acquired, errors };
}

async function demonstrateDedupe(store: CorpusStore, client: EdgarKnowledgeClient): Promise<{
  sampleSourceId: string;
  firstHash: string;
  secondWasDuplicate: boolean;
  sourceCountBefore: number;
  sourceCountAfter: number;
}> {
  const financing = store.listSources().filter(isFinancingDoc);
  if (financing.length === 0) {
    throw new Error("dedupe demo requires at least one financing document");
  }
  const sample = financing[0]!;
  const bytes = store.readBytes(sample.originalBytesHash);
  if (!bytes) throw new Error("missing bytes for dedupe sample");
  const before = store.listSources().length;
  // Re-ingest under a different sourceId claiming the same bytes.
  const clone: DiscoveredFilingDocument = {
    sourceId: `${sample.sourceId}__dedupe_probe`,
    filing: {
      accessionNumber: sample.accessionNumber,
      formType: sample.formType,
      filingDate: sample.filingDate,
      issuer: { cik: sample.issuerCik, ticker: sample.issuerTicker, name: sample.issuerName },
    },
    exhibit: {
      filename: sample.exhibitFilename,
      description: sample.documentTitle,
      exhibitType: "EX-10.1",
      sourceUrl: sample.sourceUrl,
    },
    discoverySignals: ["dedupe-probe"],
  };
  const result = await processAcquiredDocument(store, {
    discovered: clone,
    bytes,
    contentHash: sample.originalBytesHash,
    provenance: sample.provenance,
    usageRightsReviewStatus: sample.usageRightsReviewStatus,
  });
  const after = store.listSources().length;
  // Ensure probe sourceId was not materialized as a new financing row.
  const probeRow = store.getSource(clone.sourceId);
  return {
    sampleSourceId: sample.sourceId,
    firstHash: sample.originalBytesHash,
    secondWasDuplicate: result.wasDuplicate && probeRow === null,
    sourceCountBefore: before,
    sourceCountAfter: after,
  };
}

function buildReport(store: CorpusStore, extras: Record<string, unknown>) {
  const all = store.listSources();
  const financing = all.filter(isFinancingDoc);
  const fixtures = all.filter((s) => s.provenance.startsWith("fixture"));
  const falsePositives = all.filter((s) => isDebtSource(s) && NON_DEBT.test(`${s.documentTitle} ${s.exhibitFilename}`));

  let structuralNodes = 0;
  let ambiguous = 0;
  let candidates = 0;
  let definitions = 0;
  let crossRefs = 0;
  let conditions = 0;
  const instruments = new Set<string>();

  for (const s of [...financing, ...fixtures]) {
    const nodes = store.loadStructuralNodes(s.sourceId);
    structuralNodes += nodes.length;
    ambiguous += nodes.filter((n) => n.ambiguous).length;
    candidates += store.loadCandidates(s.sourceId).length;
    definitions += store.loadDefinitions(s.sourceId).length;
    crossRefs += store.loadCrossReferences(s.sourceId).length;
    conditions += store.loadConditions(s.sourceId).length;
    if (s.instrumentIdentity) instruments.add(s.instrumentIdentity);
  }

  const uncertainty = (store.readJson("uncertainty-queue.json") as unknown[] | null) ?? [];
  const rels = store.loadRelationships();

  return {
    generatedAt: new Date().toISOString(),
    persistence: {
      mode: process.env.DATABASE_URL ? "POSTGRES_AVAILABLE_BUT_LOCAL_CORPUS_USED" : "LOCAL_DURABLE_CORPUS_STORE",
      databaseUrlPresent: Boolean(process.env.DATABASE_URL),
      localRoot: store.paths.root,
      limitation:
        "Bulk bytes and per-document JSON manifests persist under .local-knowledge-corpus/ (gitignored). Git holds git-safe summary manifests under docs/knowledge-factory/manifests/. No Vercel Blob / Postgres credentials in this environment — do not claim cross-VM durability.",
    },
    coordination: {
      ehbBranch: "cursor/edgar-historical-backfill-c45c",
      ehbHandoffPath: "docs/knowledge-factory/coordination/ehb-handoff-summary.json",
      secFetchOwner: process.env.HEADROOM_SEC_FETCH_OWNER ?? "(unset — solo/local pilot allowed)",
    },
    counts: {
      downloadedFinancingDocuments: financing.length,
      uniqueInstrumentIdentities: instruments.size,
      structuralNodes,
      ambiguousStructuralNodes: ambiguous,
      covenantCandidates: candidates,
      definitions,
      dependencyEdgesCrossReferences: crossRefs,
      conditionExceptionRecords: conditions,
      documentRelationships: rels.length,
      unresolvedUncertaintyItems: uncertainty.length,
      verifiedExamples: financing.filter((s) => s.representationLevel === "REVIEWER_VERIFIED" || s.representationLevel === "CERTIFIED").length,
      semanticHypotheses: financing.filter((s) => s.representationLevel === "SEMANTIC_HYPOTHESIS").length,
      fixtureDocumentsSeparate: fixtures.length,
      falsePositiveExhibitsExcluded: falsePositives.length,
    },
    ...extras,
  };
}

async function main() {
  const target = Number(arg("--target") ?? "100");
  const noNetwork = flag("--no-network");
  process.env.HEADROOM_SEC_FETCH_OWNER = process.env.HEADROOM_SEC_FETCH_OWNER || "WS-CKF";

  const store = new CorpusStore(defaultCorpusPaths());
  const client = new EdgarKnowledgeClient({
    cacheDir: path.join(store.paths.cache, "sec"),
    logDir: path.join(store.paths.root, "logs"),
    cacheOnly: noNetwork,
  });

  console.log("reprocessing existing corpus for instruments/conditions…");
  const reprocessed = await reprocessExisting(store);

  let ehb = { acquired: 0, duplicates: 0, errors: [] as string[] };
  let topup = { acquired: 0, errors: [] as string[] };
  if (!noNetwork) {
    console.log("acquiring EHB handoff queue…");
    ehb = await acquireFromEhb(store, client);
    console.log(`ehb acquired=${ehb.acquired} duplicates=${ehb.duplicates} errors=${ehb.errors.length}`);
    const financing = store.listSources().filter(isFinancingDoc).length;
    if (financing < target) {
      console.log(`topping up from diversified issuers (${financing}/${target})…`);
      topup = await topUpFromIssuers(store, client, target);
    }
  }

  finalizeCorpusIndex(store);
  const dedupe = await demonstrateDedupe(store, client);
  const report = buildReport(store, {
    pilot: { target, reprocessed, ehb, topup, reached: store.listSources().filter(isFinancingDoc).length },
    dedupeDemonstration: dedupe,
    paidInference: { enabled: false, actualSpendUsd: 0 },
    legalCertification: "NONE — discovery/structural levels only",
  });

  store.writeJson("pilot-100-production-report.json", report);
  const outDir = path.resolve("docs/knowledge-factory/manifests");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "pilot-100-production-report.json"), JSON.stringify(report, null, 2));
  if (existsSync(path.join(store.paths.manifests, "corpus-stats.json"))) {
    copyFileSync(path.join(store.paths.manifests, "corpus-stats.json"), path.join(outDir, "corpus-stats.json"));
  }
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
