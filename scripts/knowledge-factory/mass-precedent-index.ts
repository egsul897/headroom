/**
 * Rebuild compact retrieval index from existing mass-precedent corpus store.
 *   npm run kf:mass-precedent-index
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import {
  openMassPrecedentCorpus,
  writePrecedentRetrievalIndex,
} from "../../lib/knowledge-factory/mass-precedent";

const OUT_DIR = "docs/knowledge-factory/mass-precedent";

async function main() {
  const store = openMassPrecedentCorpus();
  const index = writePrecedentRetrievalIndex(store, path.join(OUT_DIR, "retrieval-index.json"));
  writeFileSync(
    path.join(OUT_DIR, "operational-dashboard.json"),
    JSON.stringify(
      {
        schemaVersion: "knowledge-factory.mass-precedent-ops.v1",
        generatedAt: index.generatedAt,
        authenticDocumentsAcquiredOnDisk: index.totals.sources,
        originalDocumentsPersistedInNeon: 0,
        distinctIssuersIndexed: index.totals.distinctIssuers,
        definitionsExtracted: index.totals.definitions,
        covenantProvisionsExtracted: index.totals.covenantCandidates,
        dependencyCrossReferences: index.totals.crossReferences,
        amendmentsLinked: index.totals.amendmentRelationships,
        precedentsIndexedAndSearchable: index.totals.sources,
        familyHistogram: index.familyHistogram,
        neonBlocker: "OWNER_APPROVAL_REQUIRED_BEFORE_MIGRATE_OR_BULK_PRECEDENT_BACKFILL",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify({ ok: true, totals: index.totals }, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
