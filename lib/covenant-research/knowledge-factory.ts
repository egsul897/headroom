/**
 * Knowledge-factory integration probes (legacy surface inventory).
 *
 * Prefer versioned adapters in canonical-adapters.ts for export consumption.
 * Consume canonical exports when present; never duplicate persistent schemas.
 * Where an export is unavailable or incompatible, report a blocker.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

export type KnowledgeFactorySurface =
  | "EDGAR_BACKFILL"
  | "DEFINITION_ENCYCLOPEDIA"
  | "BASKET_FORMULA_LIBRARY"
  | "NEGATIVE_COVENANT_EXCEPTION_DATABASE"
  | "DEPENDENCY_ATLAS"
  | "SOURCE_TO_COVENANT_DATASET"
  | "PRECEDENT_COMPARISON_INTELLIGENCE";

export interface KnowledgeFactoryIntegrationStatus {
  surface: KnowledgeFactorySurface;
  status: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE" | "INCOMPATIBLE";
  blocker: string | null;
  observedPaths: string[];
  consumeMode: "NONE" | "READ_ONLY_EXPORT" | "REUSE_EXISTING_FIXTURE";
}

function findPaths(globs: string[]): string[] {
  const hits: string[] = [];
  for (const g of globs) {
    const abs = resolve(process.cwd(), g);
    if (existsSync(abs)) hits.push(g);
  }
  return hits;
}

function dirNonEmpty(rel: string): boolean {
  const abs = resolve(process.cwd(), rel);
  if (!existsSync(abs) || !statSync(abs).isDirectory()) return false;
  return readdirSync(abs).length > 0;
}

/**
 * Probe the repository for knowledge-factory canonical exports.
 * This is intentionally conservative: named product surfaces that do not yet
 * exist as export directories/files are reported as blockers, not invented.
 */
export function probeKnowledgeFactoryIntegrations(): KnowledgeFactoryIntegrationStatus[] {
  const edgarPaths = findPaths([
    "tests/fixtures/unseen-packages",
    "lib/connectors/edgar-connector.ts",
  ]);
  const defPaths = findPaths([
    "tests/fixtures/unseen-packages/phase-3f-first-blind-run/stage1-all-definitions.json",
    "tests/fixtures/unseen-packages/phase-3-validation-chwy-run/stage1-all-definitions.json",
  ]);
  const depPaths = findPaths([
    "tests/fixtures/unseen-packages/phase-3f-first-blind-run/stage1-all-references.json",
    "lib/contract-model/compiler/context-retrieval",
  ]);
  const compiledPaths = findPaths([
    "tests/fixtures/unseen-packages/phase-3f-first-blind-run/stage6-compiled-results.json",
    "lib/contract-model/ir",
  ]);
  const precedentPaths = findPaths([
    "lib/contract-model/compiler/semantic-precedent",
    "tests/contract-model/semantic-precedent-retrieval.test.ts",
  ]);

  const namedExportRoots = [
    "exports/definition-encyclopedia",
    "exports/basket-formula-library",
    "exports/negative-covenant-exception-database",
    "exports/dependency-atlas",
    "exports/source-to-covenant-dataset",
    "exports/edgar-backfill",
    "exports/precedent-comparison-intelligence",
  ];
  const anyNamedExport = namedExportRoots.some((p) => dirNonEmpty(p) || existsSync(resolve(process.cwd(), p)));

  return [
    {
      surface: "EDGAR_BACKFILL",
      status: edgarPaths.length ? "PARTIAL" : "UNAVAILABLE",
      blocker: anyNamedExport
        ? null
        : "No canonical EDGAR Backfill export directory (exports/edgar-backfill). Reusing pinned unseen-package fixtures and edgar-connector code only.",
      observedPaths: edgarPaths,
      consumeMode: "REUSE_EXISTING_FIXTURE",
    },
    {
      surface: "DEFINITION_ENCYCLOPEDIA",
      status: defPaths.length ? "PARTIAL" : "UNAVAILABLE",
      blocker:
        "No Definition Encyclopedia canonical export. Stage-1 definition JSON fixtures exist and are readable; no encyclopedia schema/export contract found.",
      observedPaths: defPaths,
      consumeMode: defPaths.length ? "REUSE_EXISTING_FIXTURE" : "NONE",
    },
    {
      surface: "BASKET_FORMULA_LIBRARY",
      status: "UNAVAILABLE",
      blocker:
        "No Basket Formula Library export or module path found. Compiled IR capacityExpression trees are not a substitute library export.",
      observedPaths: compiledPaths,
      consumeMode: "NONE",
    },
    {
      surface: "NEGATIVE_COVENANT_EXCEPTION_DATABASE",
      status: "UNAVAILABLE",
      blocker:
        "No Negative Covenant Exception Database export found. Discovery candidates with EXCEPTION roles are not a dedicated exception DB.",
      observedPaths: [],
      consumeMode: "NONE",
    },
    {
      surface: "DEPENDENCY_ATLAS",
      status: depPaths.length ? "PARTIAL" : "UNAVAILABLE",
      blocker:
        "No Dependency Atlas canonical export. Structural reference JSON + context-retrieval code exist; atlas export contract missing.",
      observedPaths: depPaths,
      consumeMode: depPaths.length ? "REUSE_EXISTING_FIXTURE" : "NONE",
    },
    {
      surface: "SOURCE_TO_COVENANT_DATASET",
      status: compiledPaths.length ? "PARTIAL" : "UNAVAILABLE",
      blocker:
        "No Source-to-Covenant Dataset export package. Research ingest reads discovery/compiled fixtures directly rather than a dataset export.",
      observedPaths: compiledPaths,
      consumeMode: "REUSE_EXISTING_FIXTURE",
    },
    {
      surface: "PRECEDENT_COMPARISON_INTELLIGENCE",
      status: precedentPaths.length ? "PARTIAL" : "UNAVAILABLE",
      blocker:
        "Phase 3D semantic-precedent module exists for compiler advisory retrieval, but no research-facing Precedent Comparison Intelligence export is wired. Not duplicated into a second truth DB.",
      observedPaths: precedentPaths,
      consumeMode: "NONE",
    },
  ];
}

export function knowledgeFactoryBlockers(): KnowledgeFactoryIntegrationStatus[] {
  return probeKnowledgeFactoryIntegrations().filter((s) => s.status !== "AVAILABLE");
}
