#!/usr/bin/env tsx
/**
 * Build Definition Encyclopedia artifacts into docs/definition-encyclopedia/.
 * Usage: npx tsx scripts/definition-encyclopedia/build.ts
 */
import { resolve } from "node:path";
import { buildAndWrite } from "../../lib/definition-encyclopedia/build";

const root = resolve(__dirname, "../..");
const result = buildAndWrite(root);
const s = result.exportDoc.stats;
const p2 = result.phase2Summary;
console.log(
  JSON.stringify(
    {
      outputDir: result.outputDir,
      filesWritten: result.filesWritten.map((p) => p.replace(root + "/", "")),
      definitionExampleCount: s.definitionExampleCount,
      sourceDocumentCount: s.sourceDocumentCount,
      targetMet: s.targetMet,
      missingCanonicalTerms: s.missingCanonicalTerms,
      amendmentChangeCount: s.amendmentChangeCount,
      dependencyEdgeCount: s.dependencyEdgeCount,
      provenanceValidated: result.exportDoc.definitions.filter((d) => d.provenanceValidated).length,
      phase2: {
        additionalDefinitionExamples: p2.additionalDefinitionExamples,
        acquiredSourceDocuments: p2.acquiredSourceDocuments,
        acquiredDistinctIssuers: p2.acquiredDistinctIssuers,
        targets: p2.targets,
        exactGapCoverage: p2.exactGapCoverage,
        extractionAudit: p2.extractionAudit,
        dependencyAudit: p2.dependencyAudit,
        forwardingResolved: p2.forwardingResolved,
        forwardingUnresolved: p2.forwardingUnresolved,
        importReplayOk: p2.importReplayOk,
        newDefinitionFamilies: p2.newDefinitionFamilies,
      },
    },
    null,
    2,
  ),
);
