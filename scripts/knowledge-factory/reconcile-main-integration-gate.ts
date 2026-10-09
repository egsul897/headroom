/**
 * One-shot integration gate for PR #154 reconcile against origin/main.
 * Exercises authentic Gibraltar fixture → canonical export → DEF/Atlas consumers.
 * Non-promoting; durability claimed honestly from probeDurability().
 */
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CorpusStore } from "../../lib/knowledge-factory/store/corpus-store";
import { processAcquiredDocument } from "../../lib/knowledge-factory/pipeline/run";
import { hashBytes } from "../../lib/knowledge-factory/pipeline/text";
import { probeDurability } from "../../lib/knowledge-factory/preservation/durability";
import { buildCanonicalConsumerExport, writeCanonicalExport } from "../../lib/knowledge-factory/export/build-canonical-export";
import { runDefinitionEncyclopediaImport } from "../../lib/knowledge-factory/consumers/definition-encyclopedia-import";
import { runDependencyAtlasImport } from "../../lib/knowledge-factory/consumers/dependency-atlas-import";
import {
  CONSUMER_EXPORT_SCHEMA_VERSION,
  type CanonicalConsumerExport,
} from "../../lib/knowledge-factory/export/consumer-contract";
import type { AtlasImportResult } from "../../lib/knowledge-factory/consumers/dependency-atlas-import";
import type { EncyclopediaImportResult } from "../../lib/knowledge-factory/consumers/definition-encyclopedia-import";

function summarizeDef(r: EncyclopediaImportResult) {
  return {
    ok: r.ok,
    pass: r.pass,
    sourcesUpserted: r.sourcesUpserted,
    sourcesSkipped: r.sourcesSkipped,
    definitionsUpserted: r.definitionsUpserted,
    definitionsSkipped: r.definitionsSkipped,
    idempotent: r.idempotent,
    promotedToLegalTruth: r.promotedToLegalTruth,
    capacityCalculationAllowed: r.capacityCalculationAllowed,
    errors: r.errors,
  };
}

function summarizeAtlas(r: AtlasImportResult) {
  return {
    ok: r.ok,
    pass: r.pass,
    sourcesUpserted: r.sourcesUpserted,
    nodesUpserted: r.nodesUpserted,
    edgesUpserted: r.edgesUpserted,
    nodesSkipped: r.nodesSkipped,
    edgesSkipped: r.edgesSkipped,
    idempotent: r.idempotent,
    promotedToLegalTruth: r.promotedToLegalTruth,
    errors: r.errors,
  };
}

function loadCommittedExport(committedPath: string): CanonicalConsumerExport {
  const loadShard = (name: string) => JSON.parse(readFileSync(path.join(committedPath, name), "utf8"));
  const contract = loadShard("consumer-contract.json");
  const manifest = loadShard("manifest.json");
  return {
    schemaVersion: CONSUMER_EXPORT_SCHEMA_VERSION,
    exportKind: "ckf-canonical-readonly-corpus",
    producer: manifest.producer ?? "knowledge-factory",
    knowledgeFactoryVersion: contract.knowledgeFactoryVersion,
    structuralParserVersion: contract.structuralParserVersion,
    sourceVersionId: contract.sourceVersionId,
    idempotencyKey: contract.idempotencyKey,
    durabilityClaim: "NONE",
    safety: contract.safety,
    generatedAt: manifest.generatedAt ?? new Date().toISOString(),
    peerCoordination: contract.peerCoordination,
    counts: contract.counts,
    sliceDigests: contract.sliceDigests,
    sources: loadShard("sources.json"),
    structuralNodes: loadShard("structural-nodes.json"),
    covenantCandidates: loadShard("covenant-candidates.json"),
    definitions: loadShard("definitions.json"),
    dependencyEdges: loadShard("dependency-edges.json"),
    conditionExceptionRecords: loadShard("conditions-exceptions.json"),
    documentRelationships: loadShard("document-relationships.json"),
    unresolvedUncertainties: loadShard("unresolved-uncertainties.json"),
  };
}

async function main() {
  const outDir = path.join("docs/knowledge-factory/integration-gate");
  mkdirSync(outDir, { recursive: true });

  const durability = probeDurability(process.env);
  const fixturePath =
    "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/raw-html/ef20064499_ex10-1.htm";
  const bytes = readFileSync(fixturePath);
  const contentHash = hashBytes(bytes);

  const root = mkdtempSync(path.join(tmpdir(), "kf-reconcile-"));
  const store = new CorpusStore({
    root,
    bytes: path.join(root, "bytes"),
    manifests: path.join(root, "manifests"),
    checkpoints: path.join(root, "checkpoints"),
    cache: path.join(root, "cache"),
  });

  const discovered = {
    sourceId: "edgar:0001140361-26-003087:ef20064499_ex10-1.htm",
    filing: {
      accessionNumber: "0001140361-26-003087",
      formType: "8-K",
      filingDate: "2026-02-02",
      issuer: {
        cik: "0000912562",
        ticker: "ROCK",
        name: "GIBRALTAR INDUSTRIES, INC.",
      },
    },
    exhibit: {
      filename: "ef20064499_ex10-1.htm",
      description: "CREDIT AGREEMENT dated as of February 2, 2026",
      exhibitType: "EX-10.1",
      sourceUrl:
        "https://www.sec.gov/Archives/edgar/data/912562/000114036126003087/ef20064499_ex10-1.htm",
    },
    discoverySignals: ["integration-reconcile-authentic-gibraltar"],
  };

  const pass1 = await processAcquiredDocument(store, {
    discovered,
    bytes,
    contentHash,
    provenance: "sec-edgar",
    usageRightsReviewStatus: "PUBLIC_SEC_EDGAR",
  });
  const pass2 = await processAcquiredDocument(store, {
    discovered: { ...discovered, sourceId: `${discovered.sourceId}:alias-replay` },
    bytes,
    contentHash,
    provenance: "sec-edgar",
    usageRightsReviewStatus: "PUBLIC_SEC_EDGAR",
  });

  const exportDoc = buildCanonicalConsumerExport(store, { compact: true, durabilityClaim: "NONE" });
  writeCanonicalExport(exportDoc, path.join(root, "export-v1"));

  const defFresh = runDefinitionEncyclopediaImport(exportDoc);
  const atlasFresh = runDependencyAtlasImport(exportDoc);

  const committed = loadCommittedExport("docs/knowledge-factory/export/v1");
  const defCommitted = runDefinitionEncyclopediaImport(committed);
  const atlasCommitted = runDependencyAtlasImport(committed);

  const aal = committed.sources.find((s) => s.sourceId.includes("0000006201-22-000097"));
  const rockInCommitted = committed.sources.some(
    (s) => s.issuerCik === "0000912562" || (s.issuerTicker || "").toUpperCase() === "ROCK",
  );

  const result = {
    mission: "CKF PR #154 main reconcile integration gate",
    startingPrHead: "0e5b3e75b284caee2072444847d8ebf9a01938e2",
    mainShaAtReconcile: "4fb1ab7e6ab34a722f901a69e5a29906b27e4f68",
    reconcileHead: execSync("git rev-parse HEAD").toString().trim(),
    durability: {
      status: durability.durable ? "DURABLE" : "DURABILITY_NOT_PROVEN",
      probe: durability,
    },
    authenticSourceRun: {
      fixturePath,
      sourceId: discovered.sourceId,
      accessionNumber: discovered.filing.accessionNumber,
      issuerCik: discovered.filing.issuer.cik,
      bodyBytes: bytes.length,
      contentHash,
      pass1: {
        wasDuplicate: pass1.wasDuplicate,
        sourceId: pass1.source.sourceId,
        representationLevel: pass1.source.representationLevel,
        structuralNodeCount: pass1.structuralNodeCount,
        candidateCount: pass1.candidateCount,
        definitionCount: pass1.definitionCount,
        conditionExceptionCount: pass1.conditionExceptionCount,
        processingMs: pass1.processingMs,
      },
      pass2AliasReplay: {
        wasDuplicate: pass2.wasDuplicate,
        canonicalSourceId: pass2.source.sourceId,
        note: "Second ingest with alias sourceId must not create a new canonical row",
      },
      export: {
        schemaVersion: exportDoc.schemaVersion,
        sourceVersionId: exportDoc.sourceVersionId,
        idempotencyKey: exportDoc.idempotencyKey,
        durabilityClaim: exportDoc.durabilityClaim,
        counts: exportDoc.counts,
        safety: exportDoc.safety,
      },
      consumersFreshExport: {
        definitionEncyclopedia: {
          pass1: summarizeDef(defFresh.pass1),
          pass2: summarizeDef(defFresh.pass2),
          sharedSourceIdsWithExport: defFresh.sharedSourceIdsWithExport,
        },
        dependencyAtlas: {
          pass1: summarizeAtlas(atlasFresh.pass1),
          pass2: summarizeAtlas(atlasFresh.pass2),
          sharedSourceIdsWithExport: atlasFresh.sharedSourceIdsWithExport,
        },
      },
    },
    committedExportConsumers: {
      schemaVersion: committed.schemaVersion,
      sourceCount: committed.sources.length,
      sampleAuthenticSource: aal
        ? {
            sourceId: aal.sourceId,
            issuerCik: aal.issuerCik,
            accessionNumber: aal.accessionNumber,
            originalBytesHash: aal.originalBytesHash,
            representationLevel: aal.representationLevel,
          }
        : null,
      gibraltarPresentInCommittedExport: rockInCommitted,
      definitionEncyclopedia: {
        pass1: summarizeDef(defCommitted.pass1),
        pass2: summarizeDef(defCommitted.pass2),
        sharedSourceIdsWithExport: defCommitted.sharedSourceIdsWithExport,
      },
      dependencyAtlas: {
        pass1: summarizeAtlas(atlasCommitted.pass1),
        pass2: summarizeAtlas(atlasCommitted.pass2),
        sharedSourceIdsWithExport: atlasCommitted.sharedSourceIdsWithExport,
        sharedWithDefPeer: atlasCommitted.sharedSourceIdsWithPeer(defCommitted.pass1.canonicalSourceIds),
      },
    },
    defOnMainAdapterNote:
      "lib/definition-encyclopedia/kf-import-adapter.ts emits CKF-shaped records FROM the encyclopedia (reverse direction). Forward consume of consumer-export.v1 is implemented by lib/knowledge-factory/consumers/definition-encyclopedia-import.ts and was exercised above.",
  };

  const outPath = path.join(outDir, "main-reconcile-results.json");
  writeFileSync(outPath, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
  console.log("WROTE", outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
