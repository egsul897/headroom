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
    },
    null,
    2,
  ),
);
