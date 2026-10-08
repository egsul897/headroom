/**
 * Build the Definition Encyclopedia corpus + knowledge-factory export.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PRIORITY_CANONICAL_TERMS } from "./priority-terms";
import { ENCYCLOPEDIA_SOURCES } from "./sources";
import { extractPriorityDefinitionsFromText, loadSourceText, priorityDependencyUniverse, sha256Hex } from "./extract";
import {
  buildAlternativeFormulations,
  buildDependencyGraph,
  collectSemanticTraps,
  collectUnusualDrafting,
  detectAmendmentChanges,
} from "./analyze";
import {
  DEFINITION_ENCYCLOPEDIA_SCHEMA_VERSION,
  KNOWLEDGE_FACTORY_EXPORT_KIND,
  KnowledgeFactoryExportSchema,
  type DefinitionExample,
  type KnowledgeFactoryExport,
  type SourceIdentity,
} from "./schema";

export const TARGET_MINIMUM_EXAMPLES = 100;
export const GENERATOR_VERSION = "1.0.0";

export interface BuildResult {
  exportDoc: KnowledgeFactoryExport;
  outputDir: string;
  filesWritten: string[];
}

export function buildEncyclopediaCorpus(repoRoot: string): KnowledgeFactoryExport {
  const root = resolve(repoRoot);
  const universe = priorityDependencyUniverse();

  const sources: SourceIdentity[] = [];
  const definitions: DefinitionExample[] = [];

  for (const spec of ENCYCLOPEDIA_SOURCES) {
    const loaded = loadSourceText(root, spec);
    if (!loaded) continue;
    sources.push(loaded.identity);
    definitions.push(...extractPriorityDefinitionsFromText(loaded.text, loaded.identity, universe));
  }

  // Stable ordering for deterministic exports
  definitions.sort((a, b) => {
    const c = a.canonicalTerm.localeCompare(b.canonicalTerm);
    if (c !== 0) return c;
    const s = a.source.sourceId.localeCompare(b.source.sourceId);
    if (s !== 0) return s;
    return a.charStart - b.charStart;
  });

  const dependencyGraph = buildDependencyGraph(definitions);
  const alternativeFormulations = buildAlternativeFormulations(definitions);
  const unusualDrafting = collectUnusualDrafting(definitions);
  const semanticTraps = collectSemanticTraps(definitions);
  const amendmentChanges = detectAmendmentChanges(definitions);

  const coverage: Record<string, number> = {};
  for (const term of PRIORITY_CANONICAL_TERMS) coverage[term] = 0;
  for (const ex of definitions) coverage[ex.canonicalTerm] = (coverage[ex.canonicalTerm] ?? 0) + 1;
  const missingCanonicalTerms = PRIORITY_CANONICAL_TERMS.filter((t) => (coverage[t] ?? 0) === 0);

  // Deterministic "generatedAt": content digest of example identities + text hashes
  // (avoids wall-clock churn across rebuilds while remaining a valid ISO-like stamp).
  const contentDigest = sha256Hex(
    definitions.map((d) => `${d.exampleId}:${d.exactTextSha256}:${d.source.textSha256}`).join("|"),
  );
  const generatedAt = `content-sha256:${contentDigest}`;

  const exportDoc: KnowledgeFactoryExport = {
    schemaVersion: DEFINITION_ENCYCLOPEDIA_SCHEMA_VERSION,
    exportKind: KNOWLEDGE_FACTORY_EXPORT_KIND,
    generatedAt,
    generator: {
      name: "headroom-definition-encyclopedia",
      version: GENERATOR_VERSION,
      paidInference: false,
      mergesCertificationOrForeignSchema: false,
    },
    sources,
    definitions,
    dependencyGraph,
    alternativeFormulations,
    unusualDrafting,
    semanticTraps,
    amendmentChanges,
    stats: {
      sourceDocumentCount: sources.length,
      definitionExampleCount: definitions.length,
      priorityCanonicalCoverage: coverage,
      missingCanonicalTerms,
      dependencyEdgeCount: dependencyGraph.edges.length,
      alternativeFormulationGroupCount: alternativeFormulations.length,
      unusualDraftingCount: unusualDrafting.length,
      semanticTrapCount: semanticTraps.length,
      amendmentChangeCount: amendmentChanges.length,
      targetMinimumExamples: TARGET_MINIMUM_EXAMPLES,
      targetMet: definitions.length >= TARGET_MINIMUM_EXAMPLES,
    },
    searchableIndexPath: "docs/definition-encyclopedia/search-index.jsonl",
  };

  return KnowledgeFactoryExportSchema.parse(exportDoc);
}

function toSearchRecord(ex: DefinitionExample) {
  return {
    exampleId: ex.exampleId,
    canonicalTerm: ex.canonicalTerm,
    exactTerm: ex.exactTerm,
    normalizedTerm: ex.normalizedTerm,
    sourceId: ex.source.sourceId,
    packageKey: ex.source.packageKey,
    agreementVersion: ex.source.agreementVersion,
    section: ex.section,
    declarationKind: ex.declarationKind,
    textSha256: ex.exactTextSha256,
    sourceTextSha256: ex.source.textSha256,
    dependencyTerms: ex.dependencies.map((d) => d.normalizedTerm),
    exceptionKinds: [...new Set(ex.embeddedExceptions.map((e) => e.kind))],
    calculationKinds: [...new Set(ex.calculations.map((c) => c.kind))],
    unusualDraftingFlags: ex.unusualDraftingFlags,
    semanticTrapFlags: ex.semanticTrapFlags,
    // Bounded searchable snippet (not a substitute for exactText in the full export).
    snippet: ex.exactText.slice(0, 400).replace(/\s+/g, " ").trim(),
  };
}

export function writeEncyclopediaArtifacts(repoRoot: string, exportDoc: KnowledgeFactoryExport): BuildResult {
  const outputDir = resolve(repoRoot, "docs/definition-encyclopedia");
  mkdirSync(outputDir, { recursive: true });

  const filesWritten: string[] = [];
  const write = (name: string, content: string) => {
    const path = join(outputDir, name);
    writeFileSync(path, content, "utf8");
    filesWritten.push(path);
  };

  write("knowledge-factory-export.json", JSON.stringify(exportDoc, null, 2) + "\n");
  write(
    "definitions.json",
    JSON.stringify(
      {
        schemaVersion: exportDoc.schemaVersion,
        count: exportDoc.definitions.length,
        definitions: exportDoc.definitions,
      },
      null,
      2,
    ) + "\n",
  );
  write(
    "dependency-graph.json",
    JSON.stringify({ schemaVersion: exportDoc.schemaVersion, ...exportDoc.dependencyGraph }, null, 2) + "\n",
  );
  write(
    "alternative-formulations.json",
    JSON.stringify(
      {
        schemaVersion: exportDoc.schemaVersion,
        equivalenceClaim: false as const,
        groups: exportDoc.alternativeFormulations,
      },
      null,
      2,
    ) + "\n",
  );
  write(
    "unusual-drafting.json",
    JSON.stringify({ schemaVersion: exportDoc.schemaVersion, findings: exportDoc.unusualDrafting }, null, 2) + "\n",
  );
  write(
    "semantic-traps.json",
    JSON.stringify({ schemaVersion: exportDoc.schemaVersion, traps: exportDoc.semanticTraps }, null, 2) + "\n",
  );
  write(
    "amendment-changes.json",
    JSON.stringify({ schemaVersion: exportDoc.schemaVersion, changes: exportDoc.amendmentChanges }, null, 2) + "\n",
  );
  write("stats.json", JSON.stringify(exportDoc.stats, null, 2) + "\n");
  write("sources.json", JSON.stringify({ sources: exportDoc.sources }, null, 2) + "\n");

  const jsonl = exportDoc.definitions.map((ex) => JSON.stringify(toSearchRecord(ex))).join("\n") + "\n";
  write("search-index.jsonl", jsonl);

  write("README.md", renderReadme(exportDoc));
  write("MISSION-REPORT.md", renderMissionReport(exportDoc));

  return { exportDoc, outputDir, filesWritten };
}

function renderReadme(doc: KnowledgeFactoryExport): string {
  const covLines = Object.entries(doc.stats.priorityCanonicalCoverage)
    .map(([k, v]) => `| ${k} | ${v} |`)
    .join("\n");
  return `# Definition Encyclopedia

Source-backed corpus of defined terms from credit agreements and related debt instruments.

- **Schema:** \`${doc.schemaVersion}\`
- **Export kind:** \`${doc.exportKind}\` (knowledge-factory compatible)
- **Examples:** ${doc.stats.definitionExampleCount} (target ≥ ${doc.stats.targetMinimumExamples}: **${doc.stats.targetMet ? "MET" : "NOT MET"}**)
- **Sources:** ${doc.stats.sourceDocumentCount}
- **Paid inference:** none
- **Foreign schema / certification merges:** none

## Artifacts

| File | Role |
| --- | --- |
| \`knowledge-factory-export.json\` | Full structured export |
| \`definitions.json\` | Definition examples only |
| \`search-index.jsonl\` | Searchable one-record-per-line index |
| \`dependency-graph.json\` | Cross-definition dependency edges |
| \`alternative-formulations.json\` | Grouped near-formulations (**not** legal equivalents) |
| \`unusual-drafting.json\` | Unusual drafting flags |
| \`semantic-traps.json\` | Semantic trap signals |
| \`amendment-changes.json\` | Same-term text changes across versions |
| \`stats.json\` | Counts and coverage |
| \`sources.json\` | Source identities + content SHA-256 |

## Priority coverage

| Canonical term | Example count |
| --- | ---: |
${covLines}

Missing canonical terms (no independently sourced definition found in catalogued fixtures): ${
    doc.stats.missingCanonicalTerms.length ? doc.stats.missingCanonicalTerms.join(", ") : "(none)"
  }

## Invariants

1. Every \`exactText\` is a byte-equal slice of its source at \`charStart\`.
2. Alternative formulation groups never claim legal equivalence (\`equivalenceClaim: false\`).
3. No paid model calls in generation.
4. Does not mutate Prisma / DefinedTermNode / certification schemas.
`;
}

function renderMissionReport(doc: KnowledgeFactoryExport): string {
  return `# Definition Encyclopedia — Mission Report

## Counts

- Independently sourced definition examples: **${doc.stats.definitionExampleCount}**
- Source documents: **${doc.stats.sourceDocumentCount}**
- Dependency edges: **${doc.stats.dependencyEdgeCount}**
- Alternative formulation groups: **${doc.stats.alternativeFormulationGroupCount}**
- Unusual drafting findings: **${doc.stats.unusualDraftingCount}**
- Semantic trap findings: **${doc.stats.semanticTrapCount}**
- Amendment-change pairs: **${doc.stats.amendmentChangeCount}**
- Target (≥${doc.stats.targetMinimumExamples}): **${doc.stats.targetMet ? "MET" : "NOT MET"}**

## Provenance

- Generator: ${doc.generator.name}@${doc.generator.version}
- Paid inference: ${doc.generator.paidInference}
- Merges / certification / foreign schema modifications: ${doc.generator.mergesCertificationOrForeignSchema}
- Provenance-validated examples: ${doc.definitions.filter((d) => d.provenanceValidated).length}/${doc.definitions.length}

## Missing priority terms

${
    doc.stats.missingCanonicalTerms.length
      ? doc.stats.missingCanonicalTerms.map((t) => `- ${t}`).join("\n")
      : "- (none)"
  }

## Amendment change samples

${doc.amendmentChanges
  .filter((c) => c.textChanged)
  .slice(0, 12)
  .map(
    (c) =>
      `- \`${c.normalizedTerm}\` in \`${c.packageKey}\`: ${c.beforeAgreementVersion} → ${c.afterAgreementVersion} (${c.observation})`,
  )
  .join("\n") || "- (no textual changes detected among paired versions)"}
`;
}

export function buildAndWrite(repoRoot: string): BuildResult {
  const exportDoc = buildEncyclopediaCorpus(repoRoot);
  return writeEncyclopediaArtifacts(repoRoot, exportDoc);
}
