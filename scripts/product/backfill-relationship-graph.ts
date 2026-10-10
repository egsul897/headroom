/**
 * Backfill Neon KnowledgeRelationshipEdge from existing sources:
 * 1) agreement↔amendment discovery
 * 2) provision-level definition/xref/exception/condition/shared-capacity edges
 *
 * Live (non-dry-run) corpus rebuild requires BOTH operator tokens:
 *   KF_MASS_PRECEDENT_LIVE_WRITE=I_AUTHORIZE_NEON_BULK_WRITE
 *   KF_GRAPH_REMEDIATION_RESUME=I_RESUME_GRAPH_WRITES_AFTER_REMEDIATION
 */
import { persistAmendmentGraph, persistProvisionGraph, loadAmendmentGraphCoverage } from "../../lib/product/legal-reasoning";
import { assertCorpusGraphWriteAuthorized } from "../../lib/knowledge-factory/continuous/graph-write-gate";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (!dryRun) {
    assertCorpusGraphWriteAuthorized("relationship-graph-backfill");
  }
  const amendment = await persistAmendmentGraph({ dryRun });
  const provision = await persistProvisionGraph({ dryRun, limit: 2000 });
  const coverage = await loadAmendmentGraphCoverage();
  console.log(
    JSON.stringify(
      {
        dryRun,
        amendment,
        provision: {
          ...provision,
        },
        coverageAfter: coverage,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
