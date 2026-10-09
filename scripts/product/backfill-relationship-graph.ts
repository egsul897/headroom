/**
 * Backfill Neon KnowledgeRelationshipEdge from existing sources:
 * 1) agreement↔amendment discovery
 * 2) provision-level definition/xref/exception/condition/shared-capacity edges
 */
import { persistAmendmentGraph, persistProvisionGraph, loadAmendmentGraphCoverage } from "../../lib/product/legal-reasoning";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
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
          // Truncate huge byKind in logs if needed
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
