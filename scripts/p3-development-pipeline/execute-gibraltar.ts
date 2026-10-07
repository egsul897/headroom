/**
 * Gibraltar DEVELOPMENT execution. Offline stages always run.
 * Pass B runs only when AI_GATEWAY_API_KEY or ANTHROPIC_API_KEY is set.
 * No synthetic Pass B.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runOfflineDevelopmentPipeline } from "./run-offline";

const PACKAGE_DIR = "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement";
const OUT = path.join(PACKAGE_DIR, "development-pipeline/execution.json");

async function main() {
  const result = await runOfflineDevelopmentPipeline({
    packageDir: PACKAGE_DIR,
    documentId: "gibraltar-doc-a-2026-02-02-credit-agreement",
    label: "Gibraltar Industries, Inc. Credit Agreement dated as of February 2, 2026 (EX-10.1)",
    rawHtmlRelative: "raw-html/ef20064499_ex10-1.htm",
    extractedTextRelative: "extracted-text/credit-agreement.txt",
    provenanceRelative: "provenance.json",
    frozenBodyPath: "docs/architecture/PHASE-3-TRACK-D.FROZEN.md",
    expectedFrozenSha256: "f782f2f98537c8b76a8a4506c92a51e74c40a0a8eafd203b7343eaa0a21aede3",
    passBCommand: 'AI_GATEWAY_API_KEY="$AI_GATEWAY_API_KEY" npx tsx scripts/p3-development-pipeline/execute-gibraltar.ts',
  });
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(result, null, 2) + "\n");
  const escalation = result.providerExecutionRequired;
  if (escalation) {
    process.stdout.write(`${escalation.code}\nprovider: ${escalation.provider}\nmodel: ${escalation.model}\ncommand: ${escalation.command}\nexpectedMaxCostUsd: ${escalation.expectedMaxCostUsd}\npipelineStageUnlocked: ${escalation.pipelineStageUnlocked}\nsectionsToCall: ${escalation.sectionsToCall}\n`);
  }
  process.stdout.write(`passA: ${result.offline.passACandidates} builderRows: ${result.paths.builder.rows.length} reclassRows: ${result.paths.reclass.rows.length} assetRows: ${result.paths.assetDispositions.rows.length}\n`);
  process.stdout.write(`704: ${result.investigations.assetDispositions704.resolution} cited: ${result.investigations.builderBasket.citedRefResolution}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
