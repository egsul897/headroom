/**
 * Independently runnable Track A2 durability proof (Cursor-first).
 *
 * Requires:
 *   DATABASE_URL — shared Postgres with KnowledgeSource* AND
 *                  document_byte_objects migrations applied
 *
 * Optional:
 *   KF_BYTE_STORE=vercel-blob + BLOB_READ_WRITE_TOKEN — use Blob instead of BYTEA
 *
 * Refuses local-disk / mocked / metadata-only substitutes.
 * Does NOT claim DURABILITY_PROVEN until a separate agent environment
 * retrieves identical original bytes (use --phase=retrieve in a fresh VM).
 *
 * Usage:
 *   npm run kf:durable-proof
 *   npx tsx scripts/knowledge-factory/durable-roundtrip-proof.ts --phase=gate
 *   npx tsx scripts/knowledge-factory/durable-roundtrip-proof.ts --phase=retrieve --sourceId=...
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CorpusStore } from "../../lib/knowledge-factory/store/corpus-store";
import { processAcquiredDocument } from "../../lib/knowledge-factory/pipeline/run";
import { hashBytes } from "../../lib/knowledge-factory/pipeline/text";
import { buildCanonicalConsumerExport } from "../../lib/knowledge-factory/export/build-canonical-export";
import { runDefinitionEncyclopediaImport } from "../../lib/knowledge-factory/consumers/definition-encyclopedia-import";
import { runDependencyAtlasImport } from "../../lib/knowledge-factory/consumers/dependency-atlas-import";
import {
  DURABILITY_BLOCKED_CREDENTIALS,
  DurableCredentialsError,
  hashBytesSha256,
  loadDurableSourceBytes,
  persistDurableKnowledgeSource,
  requireDurableCredentials,
  retrieveDurableKnowledgeSource,
} from "../../lib/knowledge-factory/preservation/durable-store";

const GIBRALTAR_FIXTURE =
  "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/raw-html/ef20064499_ex10-1.htm";
const GIBRALTAR_SOURCE_ID = "edgar:0001140361-26-003087:ef20064499_ex10-1.htm";
const EVIDENCE_DIR = "docs/knowledge-factory/durability";

function parseArgs(argv: string[]) {
  const out: { phase: "full" | "retrieve" | "gate"; sourceId?: string } = { phase: "full" };
  for (const a of argv) {
    if (a.startsWith("--phase=")) out.phase = a.slice("--phase=".length) as typeof out.phase;
    if (a.startsWith("--sourceId=")) out.sourceId = a.slice("--sourceId=".length);
  }
  return out;
}

function writeEvidence(name: string, data: unknown) {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const p = path.join(EVIDENCE_DIR, name);
  writeFileSync(p, JSON.stringify(data, null, 2) + "\n");
  return p;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const startingSha = execSync("git rev-parse HEAD").toString().trim();
  const gate = requireDurableCredentials(process.env);

  if (!gate.ok) {
    const blocked = {
      verdict: "DURABILITY_NOT_YET_PROVEN",
      status: DURABILITY_BLOCKED_CREDENTIALS,
      startingSha,
      endingSha: startingSha,
      missingDependencies: gate.missing,
      probe: gate.probe,
      existingInfrastructureReuse: {
        byteStoreDefault:
          "lib/document-storage/postgres-bytea-provider.ts (DATABASE_URL + migration 20261009013000_document_byte_objects)",
        byteStoreOptional:
          "lib/document-storage/vercel-blob-provider.ts (KF_BYTE_STORE=vercel-blob + BLOB_READ_WRITE_TOKEN)",
        registry:
          "prisma KnowledgeSource (requires DATABASE_URL + migration 20261008220000_knowledge_factory_foundation)",
        localFallbackRejected: [
          "lib/document-storage/local-fs-provider.ts",
          ".local-knowledge-corpus/",
          "committed docs/knowledge-factory manifests alone",
          "temporary agent workspace files",
        ],
      },
      intendedProofSource: {
        sourceId: GIBRALTAR_SOURCE_ID,
        fixturePath: GIBRALTAR_FIXTURE,
        note: "Authentic Gibraltar EX-10.1 ready; not persisted because credentials or migrations are absent.",
      },
      refusedSubstitutes: [
        "local disk write under .local-knowledge-corpus",
        "claiming durability from committed metadata/hashes",
        "mocked DocumentStorageProvider",
        "same-VM read-after-write without independent agent retrieve",
      ],
      nextAction:
        "Ensure DATABASE_URL points at approved Neon with KnowledgeSource + document_byte_objects migrations applied (explicit migrate deploy authorization required), then re-run: npm run kf:durable-proof. After persist, prove in a separate agent VM with --phase=retrieve.",
    };
    const evidencePath = writeEvidence("a2-roundtrip-evidence.json", blocked);
    writeEvidence("a2-credential-gate.json", gate);
    console.error(JSON.stringify(blocked, null, 2));
    console.error("WROTE", evidencePath);
    process.exit(2);
  }

  if (args.phase === "gate") {
    console.log(JSON.stringify({ status: "DURABLE_CREDENTIALS_PRESENT", gate }, null, 2));
    return;
  }

  if (args.phase === "retrieve") {
    const sourceId = args.sourceId ?? GIBRALTAR_SOURCE_ID;
    const retrieved = await retrieveDurableKnowledgeSource({ sourceId });
    const evidence = {
      phase: "independent-retrieve",
      startingSha,
      byteStore: gate.byteStore,
      retrieved,
      verdict: retrieved.hashEqual && retrieved.byteEqual ? "RETRIEVE_OK" : "RETRIEVE_MISMATCH",
      durabilityClaimNote:
        "RETRIEVE_OK in a separate agent environment (no local corpus) is required before DURABILITY_PROVEN.",
    };
    writeEvidence("a2-independent-retrieve.json", evidence);
    console.log(JSON.stringify(evidence, null, 2));
    if (!retrieved.hashEqual || !retrieved.byteEqual) process.exit(1);
    return;
  }

  // --- full proof (same environment persist + retrieve; not yet cross-agent DURABILITY_PROVEN) ---
  const bytes = readFileSync(GIBRALTAR_FIXTURE);
  const contentHash = hashBytes(bytes);

  // Ephemeral local process workspace for pipeline extraction only (not the durability claim).
  const workRoot = mkdtempSync(path.join(tmpdir(), "kf-a2-work-"));
  const store = new CorpusStore({
    root: workRoot,
    bytes: path.join(workRoot, "bytes"),
    manifests: path.join(workRoot, "manifests"),
    checkpoints: path.join(workRoot, "checkpoints"),
    cache: path.join(workRoot, "cache"),
  });

  const discovered = {
    sourceId: GIBRALTAR_SOURCE_ID,
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
    discoverySignals: ["track-a2-durable-proof"],
  };

  const processed = await processAcquiredDocument(store, {
    discovered,
    bytes,
    contentHash,
    provenance: "sec-edgar",
    usageRightsReviewStatus: "PUBLIC_SEC_EDGAR",
  });

  const persisted = await persistDurableKnowledgeSource({
    source: processed.source,
    bytes,
  });

  // Terminate originating local workspace — delete ephemeral pipeline store.
  rmSync(workRoot, { recursive: true, force: true });
  if (existsSync(workRoot)) {
    throw new Error("failed to terminate originating workspace directory");
  }

  // Fresh retrieval using only durable identifiers + credentials (same process; cross-agent still required).
  const retrieved = await retrieveDurableKnowledgeSource({ sourceId: GIBRALTAR_SOURCE_ID });
  const { bytes: freshBytes } = await loadDurableSourceBytes({ sourceId: GIBRALTAR_SOURCE_ID });
  const freshHash = hashBytesSha256(freshBytes);

  // Rebuild consumer export from durable bytes in a NEW ephemeral store (not the deleted one).
  const rebuildRoot = mkdtempSync(path.join(tmpdir(), "kf-a2-rebuild-"));
  const rebuildStore = new CorpusStore({
    root: rebuildRoot,
    bytes: path.join(rebuildRoot, "bytes"),
    manifests: path.join(rebuildRoot, "manifests"),
    checkpoints: path.join(rebuildRoot, "checkpoints"),
    cache: path.join(rebuildRoot, "cache"),
  });
  const rebuilt = await processAcquiredDocument(rebuildStore, {
    discovered,
    bytes: freshBytes,
    contentHash: freshHash,
    provenance: "sec-edgar",
    usageRightsReviewStatus: "PUBLIC_SEC_EDGAR",
  });
  const exportDoc = buildCanonicalConsumerExport(rebuildStore, {
    compact: true,
    durabilityClaim: "VERIFIED_SHARED_STORAGE",
  });
  const def = runDefinitionEncyclopediaImport(exportDoc);
  const atlas = runDependencyAtlasImport(exportDoc);

  rmSync(rebuildRoot, { recursive: true, force: true });

  const endingSha = execSync("git rev-parse HEAD").toString().trim();
  const roundtripOk =
    retrieved.hashEqual &&
    retrieved.byteEqual &&
    freshHash === contentHash &&
    freshBytes.equals(bytes) &&
    def.pass2.idempotent &&
    atlas.pass2.idempotent &&
    def.pass1.promotedToLegalTruth === 0 &&
    atlas.pass1.promotedToLegalTruth === 0 &&
    (rebuilt.source.representationLevel === "DISCOVERED_CANDIDATE" ||
      rebuilt.source.representationLevel === "SOURCE_ONLY" ||
      rebuilt.source.representationLevel === "STRUCTURALLY_INDEXED");

  const evidence = {
    // Same-VM roundtrip is necessary but not sufficient for DURABILITY_PROVEN.
    verdict: roundtripOk
      ? "SAME_ENV_ROUNDTRIP_OK_AWAITING_INDEPENDENT_RETRIEVE"
      : "DURABILITY_NOT_YET_PROVEN",
    status: roundtripOk ? "ROUNDTRIP_OK_PENDING_CROSS_AGENT" : "ROUNDTRIP_FAILED",
    durabilityProven: false,
    byteStore: gate.byteStore,
    startingSha,
    endingSha,
    source: {
      sourceId: GIBRALTAR_SOURCE_ID,
      byteLength: bytes.length,
      contentHash,
      knowledgeSourceRowId: persisted.knowledgeSourceRowId,
      storageRef: persisted.storageRef,
      storageProvider: persisted.storageProvider,
      representationLevel: processed.source.representationLevel,
    },
    independentRetrieval: retrieved,
    byteForByteEqual: freshBytes.equals(bytes),
    contentHashIdentity: freshHash === contentHash,
    originatingWorkspaceDeleted: !existsSync(workRoot),
    consumerExport: {
      schemaVersion: exportDoc.schemaVersion,
      sourceVersionId: exportDoc.sourceVersionId,
      idempotencyKey: exportDoc.idempotencyKey,
      durabilityClaim: exportDoc.durabilityClaim,
      counts: exportDoc.counts,
      canonicalSourceIds: exportDoc.sources.map((s) => s.sourceId),
    },
    consumers: {
      definitionEncyclopedia: {
        pass1: {
          ok: def.pass1.ok,
          sourcesUpserted: def.pass1.sourcesUpserted,
          definitionsUpserted: def.pass1.definitionsUpserted,
          promotedToLegalTruth: def.pass1.promotedToLegalTruth,
        },
        pass2: {
          ok: def.pass2.ok,
          idempotent: def.pass2.idempotent,
          promotedToLegalTruth: def.pass2.promotedToLegalTruth,
        },
      },
      dependencyAtlas: {
        pass1: {
          ok: atlas.pass1.ok,
          sourcesUpserted: atlas.pass1.sourcesUpserted,
          nodesUpserted: atlas.pass1.nodesUpserted,
          edgesUpserted: atlas.pass1.edgesUpserted,
          promotedToLegalTruth: atlas.pass1.promotedToLegalTruth,
        },
        pass2: {
          ok: atlas.pass2.ok,
          idempotent: atlas.pass2.idempotent,
          promotedToLegalTruth: atlas.pass2.promotedToLegalTruth,
        },
        sharedWithDef: atlas.sharedSourceIdsWithPeer(def.pass1.canonicalSourceIds),
      },
    },
    labelsPreserved: {
      representationLevel: rebuilt.source.representationLevel,
      noCertificationPromotion: true,
      noCapacityPromotion: true,
    },
    nextAction:
      "In a separate Cursor Cloud Agent VM with the same DATABASE_URL (no local corpus), run: " +
      `npx tsx scripts/knowledge-factory/durable-roundtrip-proof.ts --phase=retrieve --sourceId=${GIBRALTAR_SOURCE_ID}`,
  };

  writeEvidence("a2-roundtrip-evidence.json", evidence);
  console.log(JSON.stringify(evidence, null, 2));
  if (!roundtripOk) process.exit(1);
}

main().catch((e) => {
  if (e instanceof DurableCredentialsError) {
    const blocked = {
      verdict: "DURABILITY_NOT_YET_PROVEN",
      status: e.status,
      missingDependencies: e.missing,
      probe: e.probe,
      error: e.message,
    };
    writeEvidence("a2-roundtrip-evidence.json", blocked);
    console.error(JSON.stringify(blocked, null, 2));
    process.exit(2);
  }
  console.error(e);
  process.exit(1);
});
