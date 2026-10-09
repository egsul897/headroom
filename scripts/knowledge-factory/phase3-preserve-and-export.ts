#!/usr/bin/env tsx
/**
 * Phase 3: inventory, acquisition manifest, canonical consumer export,
 * two independent consumer imports, replay + dedupe confirmation.
 *
 * Does not claim durability when Postgres/Blob are unavailable.
 */

import { mkdirSync, writeFileSync, copyFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { CorpusStore, defaultCorpusPaths } from "../../lib/knowledge-factory/store/corpus-store";
import { processAcquiredDocument } from "../../lib/knowledge-factory/pipeline/run";
import { probeDurability } from "../../lib/knowledge-factory/preservation/durability";
import { buildSourceInventory } from "../../lib/knowledge-factory/preservation/inventory";
import { buildAcquisitionManifest } from "../../lib/knowledge-factory/preservation/acquisition-manifest";
import { replayAgainstPilotTargets } from "../../lib/knowledge-factory/preservation/replay";
import { buildCanonicalConsumerExport, writeCanonicalExport } from "../../lib/knowledge-factory/export/build-canonical-export";
import { runDefinitionEncyclopediaImport } from "../../lib/knowledge-factory/consumers/definition-encyclopedia-import";
import { runDependencyAtlasImport } from "../../lib/knowledge-factory/consumers/dependency-atlas-import";
import { isFinancingDoc } from "../../lib/knowledge-factory/corpus/financing-filter";
import type { DiscoveredFilingDocument } from "../../lib/knowledge-factory/types";
import { hashBytes } from "../../lib/knowledge-factory/pipeline/text";

async function demonstrateDedupe(store: CorpusStore) {
  const financing = store.listSources().filter(isFinancingDoc);
  const sample = financing.find((s) => store.hasBytes(s.originalBytesHash));
  if (!sample) {
    return { ok: false, detail: "no financing bytes available for dedupe probe" };
  }
  const before = store.listSources().length;
  const bytes = store.readBytes(sample.originalBytesHash)!;
  const clone: DiscoveredFilingDocument = {
    sourceId: `${sample.sourceId}__phase3_dedupe_probe`,
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
    discoverySignals: ["phase3-dedupe-probe"],
  };
  const result = await processAcquiredDocument(store, {
    discovered: clone,
    bytes,
    contentHash: hashBytes(bytes),
    provenance: sample.provenance,
    usageRightsReviewStatus: sample.usageRightsReviewStatus,
  });
  const after = store.listSources().length;
  const probeRow = store.getSource(clone.sourceId);
  return {
    ok: result.wasDuplicate && probeRow === null && before === after,
    sampleSourceId: sample.sourceId,
    firstHash: sample.originalBytesHash,
    secondWasDuplicate: result.wasDuplicate,
    probeMaterialized: probeRow !== null,
    sourceCountBefore: before,
    sourceCountAfter: after,
  };
}

async function main() {
  const startingSha = process.env.PHASE3_STARTING_SHA ?? "b0e45f4721a621a0954ae5f2e2abc8e53460b988";
  const store = new CorpusStore(defaultCorpusPaths());
  const durability = probeDurability();

  const inventory = buildSourceInventory(store);
  const acquisition = buildAcquisitionManifest(store, durability);
  const exportDoc = buildCanonicalConsumerExport(store, {
    compact: true,
    durabilityClaim: durability.durable ? "VERIFIED_SHARED_STORAGE" : "NONE",
  });

  const docsPreservation = path.resolve("docs/knowledge-factory/preservation");
  const docsExport = path.resolve("docs/knowledge-factory/export/v1");
  const localExport = path.resolve(".local-knowledge-corpus/export/v1");
  mkdirSync(docsPreservation, { recursive: true });
  mkdirSync(docsExport, { recursive: true });
  mkdirSync(localExport, { recursive: true });

  writeFileSync(path.join(docsPreservation, "source-inventory.json"), JSON.stringify(inventory, null, 2));
  writeFileSync(path.join(docsPreservation, "acquisition-manifest.json"), JSON.stringify(acquisition, null, 2));
  writeFileSync(
    path.join(docsPreservation, "durability-probe.json"),
    JSON.stringify(durability, null, 2),
  );
  writeFileSync(
    path.join(docsPreservation, "recovery-procedure.md"),
    `# CKF acquisition recovery procedure

## Status

**Durability claim: NONE** in this environment.

${durability.missingPrerequisites.map((p) => `- Missing: ${p}`).join("\n")}

## Manifest

- Schema: \`${acquisition.schemaVersion}\`
- Content digest: \`${acquisition.contentDigest}\`
- Financing locators: ${acquisition.financingDocumentCount}
- Knowledge factory version: \`${acquisition.knowledgeFactoryVersion}\`
- Structural parser version: \`${acquisition.structuralParserVersion}\`

## Steps

1. Ensure \`HEADROOM_SEC_FETCH_OWNER=WS-CKF\` (coordinate with WS-EHB if contended).
2. Run:

\`\`\`bash
HEADROOM_SEC_FETCH_OWNER=WS-CKF npx tsx scripts/knowledge-factory/recover-from-manifest.ts
\`\`\`

3. The script fetches each \`archivesUrl\` / \`sourceUrl\`, verifies SHA-256 against \`rawContentSha256\`, and upserts via \`processAcquiredDocument\`.
4. Exact-byte duplicates do **not** create new canonical \`sourceId\` rows.
5. Rebuild consumer export:

\`\`\`bash
npx tsx scripts/knowledge-factory/phase3-preserve-and-export.ts
\`\`\`

## Fair access

${acquisition.recoveryProcedure.fairAccess}

## What this is not

- Not cross-VM durable storage.
- Not automatic legal verification or capacity promotion.
- Not a substitute for Postgres + object-storage persistence once approved credentials exist.
`,
  );

  // Full shards locally; git-safe copy of identity-complete shards under docs/.
  writeCanonicalExport(exportDoc, localExport, { writeFullEnvelope: true });
  writeCanonicalExport(exportDoc, docsExport, { writeFullEnvelope: false });

  // Compact contract identity file for peers (no bulky arrays).
  writeFileSync(
    path.join(docsExport, "consumer-contract.json"),
    JSON.stringify(
      {
        schemaVersion: exportDoc.schemaVersion,
        exportKind: exportDoc.exportKind,
        knowledgeFactoryVersion: exportDoc.knowledgeFactoryVersion,
        structuralParserVersion: exportDoc.structuralParserVersion,
        sourceVersionId: exportDoc.sourceVersionId,
        idempotencyKey: exportDoc.idempotencyKey,
        durabilityClaim: exportDoc.durabilityClaim,
        safety: exportDoc.safety,
        peerCoordination: exportDoc.peerCoordination,
        counts: exportDoc.counts,
        sliceDigests: exportDoc.sliceDigests,
        shards: {
          sources: "sources.json",
          structuralNodes: "structural-nodes.json",
          covenantCandidates: "covenant-candidates.json",
          definitions: "definitions.json",
          dependencyEdges: "dependency-edges.json",
          conditionExceptionRecords: "conditions-exceptions.json",
          documentRelationships: "document-relationships.json",
          unresolvedUncertainties: "unresolved-uncertainties.json",
        },
      },
      null,
      2,
    ),
  );

  const encyclopedia = runDefinitionEncyclopediaImport(exportDoc);
  const atlas = runDependencyAtlasImport(exportDoc);
  const sharedAcrossConsumers = atlas.sharedSourceIdsWithPeer(encyclopedia.pass1.canonicalSourceIds);

  const consumerReport = {
    generatedAt: new Date().toISOString(),
    canonicalExport: {
      schemaVersion: exportDoc.schemaVersion,
      sourceVersionId: exportDoc.sourceVersionId,
      idempotencyKey: exportDoc.idempotencyKey,
      counts: exportDoc.counts,
      docsExportDir: "docs/knowledge-factory/export/v1",
      localEnvelope: ".local-knowledge-corpus/export/v1/canonical-consumer-export.json",
    },
    definitionEncyclopedia: encyclopedia,
    dependencyAtlas: atlas,
    sharedCanonicalSourceIdentities: sharedAcrossConsumers,
    ok:
      encyclopedia.pass1.ok &&
      encyclopedia.pass2.ok &&
      encyclopedia.pass2.idempotent &&
      atlas.pass1.ok &&
      atlas.pass2.ok &&
      atlas.pass2.idempotent &&
      sharedAcrossConsumers,
  };
  writeFileSync(path.join(docsExport, "consumer-import-results.json"), JSON.stringify(consumerReport, null, 2));

  const replay = replayAgainstPilotTargets(store);
  writeFileSync(path.join(docsPreservation, "corpus-replay.json"), JSON.stringify(replay, null, 2));

  const dedupe = await demonstrateDedupe(store);
  writeFileSync(path.join(docsPreservation, "dedupe-confirmation.json"), JSON.stringify(dedupe, null, 2));

  const phase3Report = {
    mission: "HEADROOM — KNOWLEDGE FACTORY PHASE 3",
    startingSha,
    endingShaNote: "Set by commit after this script; see phase3-final-report.json post-commit.",
    sourcePreservationStatus: {
      inventorySchema: inventory.schemaVersion,
      inventoryPath: "docs/knowledge-factory/preservation/source-inventory.json",
      totalSources: inventory.counts.totalSources,
      financingDocuments: inventory.counts.financingDocuments,
      fixtureDocuments: inventory.counts.fixtureDocuments,
      bytesPresent: inventory.counts.bytesPresent,
      bytesMissing: inventory.counts.bytesMissing,
    },
    actualDurabilityStatus: {
      ...durability,
      claim: durability.durable ? "VERIFIED_SHARED_STORAGE" : "NONE",
      readAfterWriteVerified: false,
      independentSessionRetrievalVerified: false,
      reason: durability.durable
        ? "Shared storage credentials present — still require explicit RAW verification before claiming."
        : "No approved shared Postgres + object storage in this environment.",
    },
    canonicalSchemaExportIdentity: {
      schemaVersion: exportDoc.schemaVersion,
      exportKind: exportDoc.exportKind,
      sourceVersionId: exportDoc.sourceVersionId,
      idempotencyKey: exportDoc.idempotencyKey,
      docsPath: "docs/knowledge-factory/export/v1",
    },
    independentConsumerImportResults: {
      definitionEncyclopedia: {
        ok: encyclopedia.pass1.ok && encyclopedia.pass2.idempotent,
        sources: encyclopedia.pass1.canonicalSourceIds.length,
        definitionsUpsertedPass1: encyclopedia.pass1.definitionsUpserted,
        pass2Idempotent: encyclopedia.pass2.idempotent,
      },
      dependencyAtlas: {
        ok: atlas.pass1.ok && atlas.pass2.idempotent,
        sources: atlas.pass1.canonicalSourceIds.length,
        nodesUpsertedPass1: atlas.pass1.nodesUpserted,
        edgesUpsertedPass1: atlas.pass1.edgesUpserted,
        pass2Idempotent: atlas.pass2.idempotent,
      },
      sharedCanonicalSourceIdentities: sharedAcrossConsumers,
    },
    corpusReplayAndDedupe: {
      replay,
      dedupe,
    },
    missingInfrastructurePrerequisites: durability.missingPrerequisites,
    safetyBoundariesPreserved: exportDoc.safety,
    paidInferenceUsd: 0,
  };

  writeFileSync(path.join(docsPreservation, "phase3-report.json"), JSON.stringify(phase3Report, null, 2));

  // Keep a git-safe copy of pilot report adjacent for continuity.
  const pilotSrc = path.join(store.paths.manifests, "pilot-100-production-report.json");
  if (existsSync(pilotSrc)) {
    copyFileSync(pilotSrc, path.resolve("docs/knowledge-factory/manifests/pilot-100-production-report.json"));
  }

  console.log(JSON.stringify({
    ok: consumerReport.ok && replay.ok && dedupe.ok && !durability.durable,
    durabilityClaim: phase3Report.actualDurabilityStatus.claim,
    financing: inventory.counts.financingDocuments,
    exportSourceVersionId: exportDoc.sourceVersionId,
    consumerOk: consumerReport.ok,
    replayOk: replay.ok,
    dedupeOk: dedupe.ok,
    docsExport: docsExport,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
