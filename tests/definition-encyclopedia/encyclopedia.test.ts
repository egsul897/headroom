import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  TARGET_MINIMUM_EXAMPLES,
  buildAndWrite,
  buildEncyclopediaCorpus,
} from "@/lib/definition-encyclopedia/build";
import { KnowledgeFactoryExportSchema } from "@/lib/definition-encyclopedia/schema";
import { ENCYCLOPEDIA_SOURCES } from "@/lib/definition-encyclopedia/sources";
import { PRIORITY_CANONICAL_TERMS } from "@/lib/definition-encyclopedia/priority-terms";
import { sha256Hex } from "@/lib/definition-encyclopedia/extract";

const REPO_ROOT = resolve(__dirname, "../..");

describe("definition encyclopedia corpus", () => {
  const exportDoc = buildEncyclopediaCorpus(REPO_ROOT);

  it("meets the independently-sourced example target or honestly reports shortfall", () => {
    expect(exportDoc.stats.targetMinimumExamples).toBe(TARGET_MINIMUM_EXAMPLES);
    expect(exportDoc.stats.definitionExampleCount).toBe(exportDoc.definitions.length);
    expect(exportDoc.stats.definitionExampleCount).toBeGreaterThanOrEqual(TARGET_MINIMUM_EXAMPLES);
    expect(exportDoc.stats.targetMet).toBe(true);
  });

  it("uses a knowledge-factory–compatible schema without paid inference or foreign merges", () => {
    const parsed = KnowledgeFactoryExportSchema.parse(exportDoc);
    expect(parsed.schemaVersion).toBe("headroom-definition-encyclopedia.v1");
    expect(parsed.exportKind).toBe("definition-encyclopedia-corpus");
    expect(parsed.generator.paidInference).toBe(false);
    expect(parsed.generator.mergesCertificationOrForeignSchema).toBe(false);
  });

  it("validates provenance: every exactText is a byte-equal source slice", () => {
    expect(exportDoc.definitions.length).toBeGreaterThan(0);
    for (const ex of exportDoc.definitions) {
      expect(ex.provenanceValidated).toBe(true);
      const abs = resolve(REPO_ROOT, ex.source.retrievalPath);
      expect(existsSync(abs)).toBe(true);
      const text = readFileSync(abs, "utf8");
      expect(sha256Hex(text)).toBe(ex.source.textSha256);
      expect(text.slice(ex.charStart, ex.charEnd)).toBe(ex.exactText);
      expect(sha256Hex(ex.exactText)).toBe(ex.exactTextSha256);
    }
  });

  it("covers multiple independent source documents and priority families", () => {
    expect(exportDoc.sources.length).toBeGreaterThanOrEqual(10);
    expect(exportDoc.sources.length).toBe(ENCYCLOPEDIA_SOURCES.filter((s) => existsSync(resolve(REPO_ROOT, s.retrievalPath))).length);
    const covered = Object.entries(exportDoc.stats.priorityCanonicalCoverage).filter(([, n]) => n > 0).map(([k]) => k);
    expect(covered.length).toBeGreaterThanOrEqual(15);
    for (const term of PRIORITY_CANONICAL_TERMS) {
      expect(exportDoc.stats.priorityCanonicalCoverage).toHaveProperty(term);
    }
  });

  it("builds a dependency graph and never claims alternative-formulation equivalence", () => {
    expect(exportDoc.dependencyGraph.nodes.length).toBe(exportDoc.definitions.length);
    expect(exportDoc.dependencyGraph.edges.length).toBeGreaterThan(0);
    for (const group of exportDoc.alternativeFormulations) {
      expect(group.equivalenceClaim).toBe(false);
      expect(group.exampleIds.length).toBeGreaterThan(0);
    }
  });

  it("records unusual drafting, semantic traps, and amendment-change pairs when present", () => {
    expect(exportDoc.unusualDrafting.length).toBe(exportDoc.stats.unusualDraftingCount);
    expect(exportDoc.semanticTraps.length).toBe(exportDoc.stats.semanticTrapCount);
    expect(exportDoc.amendmentChanges.length).toBe(exportDoc.stats.amendmentChangeCount);
    // Amendment lineages exist in DSGR / SUP / Riot packages.
    expect(exportDoc.amendmentChanges.length).toBeGreaterThan(0);
    const changed = exportDoc.amendmentChanges.filter((c) => c.textChanged);
    expect(changed.length).toBeGreaterThan(0);
  });

  it("writes searchable artifacts that match the in-memory corpus", () => {
    const written = buildAndWrite(REPO_ROOT);
    expect(written.filesWritten.length).toBeGreaterThanOrEqual(10);
    const exportPath = resolve(REPO_ROOT, "docs/definition-encyclopedia/knowledge-factory-export.json");
    const indexPath = resolve(REPO_ROOT, "docs/definition-encyclopedia/search-index.jsonl");
    expect(existsSync(exportPath)).toBe(true);
    expect(existsSync(indexPath)).toBe(true);
    const onDisk = KnowledgeFactoryExportSchema.parse(JSON.parse(readFileSync(exportPath, "utf8")));
    expect(onDisk.definitions.length).toBe(written.exportDoc.definitions.length);
    const lines = readFileSync(indexPath, "utf8").trim().split("\n");
    expect(lines.length).toBe(onDisk.definitions.length);
    const first = JSON.parse(lines[0]!);
    expect(first).toHaveProperty("exampleId");
    expect(first).toHaveProperty("snippet");
    expect(first).toHaveProperty("sourceTextSha256");
  });
});
