import { readFileSync, existsSync } from "node:fs";
import { DOCUMENT_REGISTRY } from "./corpus";
import { extractUnitsFromDocument } from "./extract";
import { summarizeClusters } from "./cluster";
import { buildAcquisitionRecommendations, buildReviewerQueue, scoreNovelty } from "./score";
import {
  DRAFTING_NOVELTY_VERSION,
  type CorpusCoverageReport,
  type DocumentSource,
  type DraftingCategory,
  type DraftingUnit,
  type NoveltyRunResult,
} from "./types";

const ALL_CATEGORIES: DraftingCategory[] = [
  "COVENANT_STRUCTURE",
  "DEFINITION_FORMULATION",
  "BASKET_FORMULA",
  "PROVISO_PLACEMENT",
  "ENTITY_SCOPE",
  "AMENDMENT_MECHANISM",
  "SHARED_CAPACITY",
  "RECLASSIFICATION",
  "CROSS_DOCUMENT_RESTRICTION",
  "INTERCREDITOR_LIMITATION",
];

export function loadUnits(registry: DocumentSource[] = DOCUMENT_REGISTRY, repoRoot = process.cwd()): {
  units: DraftingUnit[];
  loaded: DocumentSource[];
  missing: DocumentSource[];
} {
  const loaded: DocumentSource[] = [];
  const missing: DocumentSource[] = [];
  const units: DraftingUnit[] = [];

  for (const doc of registry) {
    const abs = `${repoRoot}/${doc.path}`;
    if (!existsSync(abs)) {
      missing.push(doc);
      continue;
    }
    const raw = readFileSync(abs, "utf8");
    units.push(...extractUnitsFromDocument(doc, raw));
    loaded.push(doc);
  }

  units.sort((a, b) => a.unitId.localeCompare(b.unitId));
  return { units, loaded, missing };
}

export function buildCoverage(units: DraftingUnit[], loaded: DocumentSource[]): CorpusCoverageReport {
  const unitsByCategory = Object.fromEntries(
    ALL_CATEGORIES.map((c) => [c, { corpus: 0, probe: 0 }]),
  ) as CorpusCoverageReport["unitsByCategory"];

  for (const u of units) {
    unitsByCategory[u.category][u.role === "CORPUS" ? "corpus" : "probe"] += 1;
  }

  const corpusKeys = new Set(units.filter((u) => u.role === "CORPUS").map((u) => u.signature.key));
  const probeKeys = new Set(units.filter((u) => u.role === "PROBE").map((u) => u.signature.key));
  let shared = 0;
  let corpusOnly = 0;
  let probeOnly = 0;
  for (const k of corpusKeys) {
    if (probeKeys.has(k)) shared++;
    else corpusOnly++;
  }
  for (const k of probeKeys) if (!corpusKeys.has(k)) probeOnly++;

  const packageIds = [...new Set(loaded.map((d) => d.packageId))].sort();
  const packages = packageIds.map((packageId) => {
    const docs = loaded.filter((d) => d.packageId === packageId);
    const role = docs[0]!.role;
    return {
      packageId,
      role,
      documents: docs.length,
      units: units.filter((u) => u.packageId === packageId).length,
    };
  });

  return {
    corpusDocuments: loaded.filter((d) => d.role === "CORPUS").length,
    probeDocuments: loaded.filter((d) => d.role === "PROBE").length,
    corpusUnits: units.filter((u) => u.role === "CORPUS").length,
    probeUnits: units.filter((u) => u.role === "PROBE").length,
    unitsByCategory,
    signatureKeysTotal: new Set(units.map((u) => u.signature.key)).size,
    signatureKeysCorpusOnly: corpusOnly,
    signatureKeysProbeOnly: probeOnly,
    signatureKeysShared: shared,
    packages,
  };
}

export function runNoveltyDiscovery(options: {
  registry?: DocumentSource[];
  repoRoot?: string;
  queueLimit?: number;
} = {}): NoveltyRunResult & { missingDocuments: DocumentSource[] } {
  const { units, loaded, missing } = loadUnits(options.registry ?? DOCUMENT_REGISTRY, options.repoRoot ?? process.cwd());
  const findings = scoreNovelty(units);
  const reviewerQueue = buildReviewerQueue(findings, options.queueLimit ?? 40);
  const acquisitionRecommendations = buildAcquisitionRecommendations(findings);
  const clusters = summarizeClusters(units);
  const corpusCoverage = buildCoverage(units, loaded);

  return {
    version: DRAFTING_NOVELTY_VERSION,
    generatedAt: new Date().toISOString(),
    paidCalls: 0,
    productionLegalRulesModified: false,
    corpusCoverage,
    clusters,
    findings,
    reviewerQueue,
    acquisitionRecommendations,
    missingDocuments: missing,
  };
}
