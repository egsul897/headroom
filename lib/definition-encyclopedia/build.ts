/**
 * Build the Definition Encyclopedia corpus + knowledge-factory export (Phase 2).
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { PRIORITY_CANONICAL_TERMS } from "./priority-terms";
import { ENCYCLOPEDIA_SOURCES } from "./sources";
import { loadAcquiredSourceSpecs, distinctIssuerCount } from "./acquired-sources";
import { extractPriorityDefinitionsFromText, loadSourceText, priorityDependencyUniverse, sha256Hex } from "./extract";
import {
  buildAlternativeFormulations,
  buildDependencyGraph,
  collectSemanticTraps,
  collectUnusualDrafting,
  detectAmendmentChanges,
} from "./analyze";
import { resolveAllForwardingInDocument } from "./forwarding";
import { auditExtractionCompleteness } from "./extraction-audit";
import { auditDependencyEdges } from "./dependency-audit";
import { reconcileAmendmentChanges } from "./amendment-integrity";
import { assertIdempotentImport, buildKfImportBatch } from "./kf-import-adapter";
import { countExactGapHits, PHASE2_EXACT_GAP_TERMS, ALL_EXTRACTION_FAMILIES } from "./phase2-terms";
import {
  DEFINITION_ENCYCLOPEDIA_SCHEMA_VERSION,
  KNOWLEDGE_FACTORY_EXPORT_KIND,
  KnowledgeFactoryExportSchema,
  type DefinitionExample,
  type KnowledgeFactoryExport,
  type SourceIdentity,
} from "./schema";

export const TARGET_MINIMUM_EXAMPLES = 100;
export const PHASE1_BASELINE_EXAMPLES = 120;
export const PHASE2_TARGET_ADDITIONAL_EXAMPLES = 500;
export const PHASE2_TARGET_NEW_DOCUMENTS = 100;
export const PHASE2_TARGET_NEW_ISSUERS = 50;
export const GENERATOR_VERSION = "2.0.0";

export interface BuildResult {
  exportDoc: KnowledgeFactoryExport;
  outputDir: string;
  filesWritten: string[];
  phase2Summary: Phase2Summary;
}

export interface Phase2Summary {
  totalDefinitionExamples: number;
  phase1BaselineExamples: number;
  additionalDefinitionExamples: number;
  totalSourceDocuments: number;
  fixtureSourceDocuments: number;
  acquiredSourceDocuments: number;
  acquiredDistinctIssuers: number;
  newDefinitionFamilies: string[];
  exactGapCoverage: Record<string, number>;
  forwardingResolved: number;
  forwardingUnresolved: number;
  extractionAudit: {
    documentsSampled: number;
    meanPrecision: number;
    meanRecall: number;
  };
  dependencyAudit: {
    reportedEdges: number;
    directReferences: number;
    mereLexicalRisk: number;
    cycles: number;
    diamonds: number;
  };
  amendmentAuthorityUnresolved: number;
  importReplayOk: boolean;
  importIdempotencyKey: string;
  targets: {
    additionalExamples: { target: number; actual: number; met: boolean };
    newDocuments: { target: number; actual: number; met: boolean };
    newIssuers: { target: number; actual: number; met: boolean };
  };
  coordination: {
    ehbQueueConsumed: boolean;
    kfAdapterEmitted: boolean;
    foreignSchemaModified: false;
    paidInference: false;
  };
}

export function buildEncyclopediaCorpus(repoRoot: string): KnowledgeFactoryExport {
  const root = resolve(repoRoot);
  const universe = priorityDependencyUniverse();
  const acquired = loadAcquiredSourceSpecs(root);
  const allSpecs = [...ENCYCLOPEDIA_SOURCES, ...acquired.specs];

  const sources: SourceIdentity[] = [];
  const definitions: DefinitionExample[] = [];

  for (const spec of allSpecs) {
    const loaded = loadSourceText(root, spec);
    if (!loaded) continue;
    sources.push(loaded.identity);
    definitions.push(...extractPriorityDefinitionsFromText(loaded.text, loaded.identity, universe));
  }

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
  for (const family of ALL_EXTRACTION_FAMILIES) {
    if (!(family.canonical in coverage)) coverage[family.canonical] = 0;
  }
  for (const ex of definitions) coverage[ex.canonicalTerm] = (coverage[ex.canonicalTerm] ?? 0) + 1;
  const missingCanonicalTerms = PRIORITY_CANONICAL_TERMS.filter((t) => (coverage[t] ?? 0) === 0);

  const contentDigest = sha256Hex(
    definitions.map((d) => `${d.exampleId}:${d.exactTextSha256}:${d.source.textSha256}`).join("|"),
  );

  const exportDoc: KnowledgeFactoryExport = {
    schemaVersion: DEFINITION_ENCYCLOPEDIA_SCHEMA_VERSION,
    exportKind: KNOWLEDGE_FACTORY_EXPORT_KIND,
    generatedAt: `content-sha256:${contentDigest}`,
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
    snippet: ex.exactText.slice(0, 400).replace(/\s+/g, " ").trim(),
  };
}

function buildPhase2Artifacts(repoRoot: string, exportDoc: KnowledgeFactoryExport): {
  summary: Phase2Summary;
  bundles: Record<string, unknown>;
} {
  const root = resolve(repoRoot);
  const acquired = loadAcquiredSourceSpecs(root);
  const fixtureCount = ENCYCLOPEDIA_SOURCES.filter((s) => existsSync(resolve(root, s.retrievalPath))).length;

  // Forwarding resolutions across all sources
  const forwarding: ReturnType<typeof resolveAllForwardingInDocument> = [];
  for (const src of exportDoc.sources) {
    const abs = resolve(root, src.retrievalPath);
    if (!existsSync(abs)) continue;
    const text = readFileSync(abs, "utf8");
    forwarding.push(
      ...resolveAllForwardingInDocument({
        text,
        documentId: src.documentId,
        sourceId: src.sourceId,
        agreementVersion: src.agreementVersion,
      }),
    );
  }
  // Attach exampleIds when available
  const bySourceTerm = new Map(exportDoc.definitions.map((d) => [`${d.source.sourceId}::${d.normalizedTerm}`, d]));
  for (const f of forwarding) {
    const ex = bySourceTerm.get(`${f.sourceId}::${f.normalizedTerm}`);
    if (ex) f.exampleId = ex.exampleId;
  }

  // Extraction audit on up to 6 independently sampled docs (mix fixture + acquired)
  const sampleSources = [
    ...exportDoc.sources.filter((s) => !s.sourceId.startsWith("edgar:") && !s.sourceId.startsWith("ehb:")).slice(0, 3),
    ...exportDoc.sources.filter((s) => s.sourceId.startsWith("edgar:") || s.sourceId.startsWith("ehb:")).slice(0, 3),
  ];
  const extractionAudits = sampleSources.map((src) => {
    const text = readFileSync(resolve(root, src.retrievalPath), "utf8");
    return auditExtractionCompleteness({
      sourceId: src.sourceId,
      documentId: src.documentId,
      text,
      textSha256: src.textSha256,
    });
  });
  const meanPrecision =
    extractionAudits.length === 0 ? 0 : extractionAudits.reduce((a, r) => a + r.precision, 0) / extractionAudits.length;
  const meanRecall =
    extractionAudits.length === 0 ? 0 : extractionAudits.reduce((a, r) => a + r.recall, 0) / extractionAudits.length;

  const depAudit = auditDependencyEdges({
    definitions: exportDoc.definitions,
    edges: exportDoc.dependencyGraph.edges,
  });
  // Slim validated edges for on-disk (full validated array can be huge)
  const depAuditSlim = {
    reportedEdgeCount: depAudit.reportedEdgeCount,
    countsByClass: depAudit.countsByClass,
    mereLexicalMatchRiskCount: depAudit.mereLexicalMatchRiskCount,
    directReferenceCount: depAudit.directReferenceCount,
    diamondPatterns: depAudit.diamondPatterns,
    cycles: depAudit.cycles,
    sampleValidated: depAudit.validated.slice(0, 100),
  };

  const amendmentIntegrity = reconcileAmendmentChanges({
    changes: exportDoc.amendmentChanges,
    definitions: exportDoc.definitions,
  });

  const acquiredMetaBySourceId: Record<string, Record<string, unknown>> = {};
  for (const m of acquired.metas) acquiredMetaBySourceId[m.sourceId] = m as unknown as Record<string, unknown>;
  const importBatch = buildKfImportBatch(exportDoc, acquiredMetaBySourceId);
  const importReplay = buildKfImportBatch(exportDoc, acquiredMetaBySourceId);
  const idempotency = assertIdempotentImport(importBatch, importReplay);

  const phase1FamilyNames = new Set(PRIORITY_CANONICAL_TERMS);
  const phase2FamilyNames = new Set(ALL_EXTRACTION_FAMILIES.map((f) => f.canonical));
  const presentFamilies = Object.entries(exportDoc.stats.priorityCanonicalCoverage)
    .filter(([, n]) => n > 0)
    .map(([k]) => k);
  // Only curated Phase-2 conceptual families — not raw inventory labels.
  const newDefinitionFamilies = presentFamilies.filter((f) => phase2FamilyNames.has(f) && !phase1FamilyNames.has(f));

  const additional = Math.max(0, exportDoc.definitions.length - PHASE1_BASELINE_EXAMPLES);
  const acquiredDocs = acquired.metas.length;
  const acquiredIssuers = distinctIssuerCount(acquired.metas);

  const ehbQueueConsumed = acquired.metas.some((m) => m.discoverySource === "EHB_QUEUE");

  const summary: Phase2Summary = {
    totalDefinitionExamples: exportDoc.definitions.length,
    phase1BaselineExamples: PHASE1_BASELINE_EXAMPLES,
    additionalDefinitionExamples: additional,
    totalSourceDocuments: exportDoc.sources.length,
    fixtureSourceDocuments: fixtureCount,
    acquiredSourceDocuments: acquiredDocs,
    acquiredDistinctIssuers: acquiredIssuers,
    newDefinitionFamilies,
    exactGapCoverage: countExactGapHits(exportDoc.definitions),
    forwardingResolved: forwarding.filter((f) => f.status.startsWith("RESOLVED_")).length,
    forwardingUnresolved: forwarding.filter((f) => f.status.startsWith("UNRESOLVED_")).length,
    extractionAudit: {
      documentsSampled: extractionAudits.length,
      meanPrecision,
      meanRecall,
    },
    dependencyAudit: {
      reportedEdges: depAudit.reportedEdgeCount,
      directReferences: depAudit.directReferenceCount,
      mereLexicalRisk: depAudit.mereLexicalMatchRiskCount,
      cycles: depAudit.cycles.length,
      diamonds: depAudit.diamondPatterns.length,
    },
    amendmentAuthorityUnresolved: amendmentIntegrity.filter((a) =>
      a.authorityStatus.includes("UNRESOLVED") || a.authorityStatus === "TEXT_OBSERVATION_ONLY" || a.authorityStatus === "LEGAL_EFFECT_UNRESOLVED",
    ).length,
    importReplayOk: idempotency.ok,
    importIdempotencyKey: importBatch.stats.idempotencyKey,
    targets: {
      additionalExamples: {
        target: PHASE2_TARGET_ADDITIONAL_EXAMPLES,
        actual: additional,
        met: additional >= PHASE2_TARGET_ADDITIONAL_EXAMPLES,
      },
      newDocuments: {
        target: PHASE2_TARGET_NEW_DOCUMENTS,
        actual: acquiredDocs,
        met: acquiredDocs >= PHASE2_TARGET_NEW_DOCUMENTS,
      },
      newIssuers: {
        target: PHASE2_TARGET_NEW_ISSUERS,
        actual: acquiredIssuers,
        met: acquiredIssuers >= PHASE2_TARGET_NEW_ISSUERS,
      },
    },
    coordination: {
      ehbQueueConsumed: !!ehbQueueConsumed,
      kfAdapterEmitted: true,
      foreignSchemaModified: false,
      paidInference: false,
    },
  };

  return {
    summary,
    bundles: {
      "forwarding-resolutions.json": {
        schemaVersion: "definition-encyclopedia-forwarding.v1",
        count: forwarding.length,
        capacityCalculationAllowed: false,
        resolutions: forwarding,
      },
      "extraction-audit.json": {
        schemaVersion: "definition-encyclopedia-extraction-audit.v1",
        documentsSampled: extractionAudits.length,
        meanPrecision,
        meanRecall,
        audits: extractionAudits.map((a) => ({
          ...a,
          // Bound missed/false lists for disk size
          missedDefinitions: a.missedDefinitions.slice(0, 50),
          falseDetections: a.falseDetections.slice(0, 50),
        })),
      },
      "dependency-edge-audit.json": {
        schemaVersion: "definition-encyclopedia-dependency-audit.v1",
        ...depAuditSlim,
      },
      "amendment-integrity.json": {
        schemaVersion: "definition-encyclopedia-amendment-integrity.v1",
        legalEffectClaim: "NONE",
        records: amendmentIntegrity,
      },
      "kf-import-batch.json": importBatch,
      "phase2-summary.json": summary,
      "exact-gap-coverage.json": {
        note: "Exact-term hits only — conceptual family membership is not counted here.",
        gaps: PHASE2_EXACT_GAP_TERMS,
        counts: countExactGapHits(exportDoc.definitions),
      },
      "corpus-manifest.json": {
        artifact: "definition-encyclopedia-corpus-manifest",
        workstreamId: "WS-DEF",
        schemaVersion: DEFINITION_ENCYCLOPEDIA_SCHEMA_VERSION,
        exactSourceProvenance: true,
        stableContentIdentities: true,
        sourceTextHashes: true,
        compilerOrModelVersions: { generator: GENERATOR_VERSION, paidInference: false },
        confidenceAndUncertaintyLabels: ["SOURCE_ONLY", "UNRESOLVED", "TEXT_OBSERVATION_ONLY"],
        verificationStatus: "SOURCE_ONLY",
        duplicateDetection: "contentHash/textSha256",
        deterministicReplay: true,
        actualRecordCounts: {
          sources: exportDoc.sources.length,
          definitions: exportDoc.definitions.length,
          dependencyEdges: exportDoc.dependencyGraph.edges.length,
        },
        independentQualityMetrics: {
          extractionMeanPrecision: meanPrecision,
          extractionMeanRecall: meanRecall,
          dependencyDirectReferenceCount: depAudit.directReferenceCount,
          dependencyMereLexicalRiskCount: depAudit.mereLexicalMatchRiskCount,
        },
      },
    },
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

  // Full export can be large under inventory mode — still the KF delivery artifact.
  write("knowledge-factory-export.json", JSON.stringify(exportDoc, null, 2) + "\n");
  const familyDefs = exportDoc.definitions.filter((d) => d.alternativeFormulationGroup.startsWith("alt-group:"));
  const inventoryDefs = exportDoc.definitions.filter((d) => d.alternativeFormulationGroup.startsWith("inventory:"));
  write(
    "definitions-family.json",
    JSON.stringify({ schemaVersion: exportDoc.schemaVersion, count: familyDefs.length, definitions: familyDefs }, null, 2) + "\n",
  );
  write(
    "definitions-inventory.jsonl",
    inventoryDefs.map((d) => JSON.stringify(d)).join("\n") + (inventoryDefs.length ? "\n" : ""),
  );
  // Compact pointer (avoids a third full copy of exactText beside the KF export).
  write(
    "definitions.json",
    JSON.stringify(
      {
        schemaVersion: exportDoc.schemaVersion,
        count: exportDoc.definitions.length,
        familyCount: familyDefs.length,
        inventoryCount: inventoryDefs.length,
        familyPath: "docs/definition-encyclopedia/definitions-family.json",
        inventoryPath: "docs/definition-encyclopedia/definitions-inventory.jsonl",
        fullExportPath: "docs/definition-encyclopedia/knowledge-factory-export.json",
      },
      null,
      2,
    ) + "\n",
  );
  write("dependency-graph.json", JSON.stringify({ schemaVersion: exportDoc.schemaVersion, ...exportDoc.dependencyGraph }, null, 2) + "\n");
  write(
    "alternative-formulations.json",
    JSON.stringify({ schemaVersion: exportDoc.schemaVersion, equivalenceClaim: false as const, groups: exportDoc.alternativeFormulations }, null, 2) +
      "\n",
  );
  write("unusual-drafting.json", JSON.stringify({ schemaVersion: exportDoc.schemaVersion, findings: exportDoc.unusualDrafting }, null, 2) + "\n");
  write("semantic-traps.json", JSON.stringify({ schemaVersion: exportDoc.schemaVersion, traps: exportDoc.semanticTraps }, null, 2) + "\n");
  write("amendment-changes.json", JSON.stringify({ schemaVersion: exportDoc.schemaVersion, changes: exportDoc.amendmentChanges }, null, 2) + "\n");
  write("stats.json", JSON.stringify(exportDoc.stats, null, 2) + "\n");
  write("sources.json", JSON.stringify({ sources: exportDoc.sources }, null, 2) + "\n");
  write("search-index.jsonl", exportDoc.definitions.map((ex) => JSON.stringify(toSearchRecord(ex))).join("\n") + "\n");

  const { summary, bundles } = buildPhase2Artifacts(repoRoot, exportDoc);
  for (const [name, body] of Object.entries(bundles)) {
    write(name, JSON.stringify(body, null, 2) + "\n");
  }

  write("README.md", renderReadme(exportDoc, summary));
  write("MISSION-REPORT.md", renderMissionReport(exportDoc, summary));
  write("PHASE2-REPORT.md", renderPhase2Report(summary));

  return { exportDoc, outputDir, filesWritten, phase2Summary: summary };
}

function renderReadme(doc: KnowledgeFactoryExport, s: Phase2Summary): string {
  return `# Definition Encyclopedia (Phase 2)

- **Schema:** \`${doc.schemaVersion}\` · generator ${doc.generator.version}
- **Examples:** ${doc.stats.definitionExampleCount} (Phase-1 baseline ${s.phase1BaselineExamples}; additional ${s.additionalDefinitionExamples})
- **Sources:** ${doc.stats.sourceDocumentCount} (${s.fixtureSourceDocuments} fixtures + ${s.acquiredSourceDocuments} acquired; ${s.acquiredDistinctIssuers} distinct acquired issuers)
- **Paid inference / foreign schema mods:** none
- **KF import adapter:** \`kf-import-batch.json\` (idempotency \`${s.importIdempotencyKey.slice(0, 16)}…\`, replay ok=${s.importReplayOk})

## Phase-2 targets (not success claims)

| Target | Actual | Met |
| --- | ---: | --- |
| +500 definition examples | ${s.additionalDefinitionExamples} | ${s.targets.additionalExamples.met} |
| +100 financing documents | ${s.acquiredSourceDocuments} | ${s.targets.newDocuments.met} |
| +50 unseen issuers | ${s.acquiredDistinctIssuers} | ${s.targets.newIssuers.met} |

See \`PHASE2-REPORT.md\` and \`phase2-summary.json\`.
`;
}

function renderMissionReport(doc: KnowledgeFactoryExport, s: Phase2Summary): string {
  return `# Definition Encyclopedia — Mission Report

## Counts

- Total definition examples: **${doc.stats.definitionExampleCount}**
- Additional vs Phase-1 baseline (120): **${s.additionalDefinitionExamples}**
- Source documents: **${doc.stats.sourceDocumentCount}** (acquired **${s.acquiredSourceDocuments}**, issuers **${s.acquiredDistinctIssuers}**)
- Dependency edges: **${doc.stats.dependencyEdgeCount}**
- Forwarding resolved/unresolved: **${s.forwardingResolved}** / **${s.forwardingUnresolved}**
- Import replay ok: **${s.importReplayOk}**

## Exact gap coverage (exact terms only)

${Object.entries(s.exactGapCoverage)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n")}
`;
}

function renderPhase2Report(s: Phase2Summary): string {
  return `# Phase 2 Report — Real Precedent Expansion

## Targets vs actuals

| Metric | Target | Actual | Met |
| --- | ---: | ---: | --- |
| Additional definition examples | ${s.targets.additionalExamples.target} | ${s.targets.additionalExamples.actual} | ${s.targets.additionalExamples.met} |
| New financing documents | ${s.targets.newDocuments.target} | ${s.targets.newDocuments.actual} | ${s.targets.newDocuments.met} |
| Previously unseen issuers | ${s.targets.newIssuers.target} | ${s.targets.newIssuers.actual} | ${s.targets.newIssuers.met} |

## Quality

- Extraction audit (n=${s.extractionAudit.documentsSampled}): mean precision=${s.extractionAudit.meanPrecision.toFixed(4)}, mean recall=${s.extractionAudit.meanRecall.toFixed(4)}
- Dependency edges: ${s.dependencyAudit.reportedEdges} reported; direct=${s.dependencyAudit.directReferences}; lexical-risk=${s.dependencyAudit.mereLexicalRisk}; cycles=${s.dependencyAudit.cycles}; diamonds=${s.dependencyAudit.diamonds}
- Forwarding: resolved=${s.forwardingResolved}, unresolved=${s.forwardingUnresolved} (capacity calc forbidden on forwarding alone)
- Amendment authority unresolved / observation-only: ${s.amendmentAuthorityUnresolved}
- New definition families present: ${s.newDefinitionFamilies.join(", ") || "(none)"}

## Coordination

- EHB queue consumed: ${s.coordination.ehbQueueConsumed}
- KF adapter emitted: ${s.coordination.kfAdapterEmitted}
- Foreign schema modified: ${s.coordination.foreignSchemaModified}
- Paid inference: ${s.coordination.paidInference}
`;
}

export function buildAndWrite(repoRoot: string): BuildResult {
  const exportDoc = buildEncyclopediaCorpus(repoRoot);
  return writeEncyclopediaArtifacts(repoRoot, exportDoc);
}
