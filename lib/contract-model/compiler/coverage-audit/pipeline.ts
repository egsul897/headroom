/**
 * Phase 2E - runIndependentCoverageAudit: the one entry point. Runs the
 * independent source-side inventory (zero Phase 2B/2D input), then the
 * comparison stages (which do read Phase 2B/2D/2C real output), and
 * assembles the coverage map + performance stats. Deterministic-only V1 -
 * no semantic layer was needed (see the final report §8/§33).
 */
import type { StructuralIndex } from "../structural-index";
import type { DiscoveredCandidate } from "../discovery/types";
import type { PackageGraphResult } from "../package-graph/types";
import type { CovenantContextBundle } from "../context-retrieval/types";
import { buildSourceCoverageInventory, type SourceInventoryOptions } from "./source-inventory";
import { auditDiscoveryCoverage } from "./discovery-comparison";
import { auditContextCoverage } from "./context-comparison";
import { auditDefinitionCompleteness } from "./definition-audit";
import { buildCoverageMap } from "./coverage-map";
import { computeContentIdentity } from "./identity";
import { COVERAGE_AUDIT_ALGORITHM_VERSION, type AuditFinding, type CoverageAuditRunResult, type CoverageRegion } from "./types";

export interface AuditPackageInput {
  companyId: string;
  packageKey: string;
  instrumentKey: string | null;
  documentIds: string[];
  index: StructuralIndex;
  candidates: DiscoveredCandidate[];
  packageGraph: PackageGraphResult | null;
  /** One bundle per audited covenant - the auditor does not build its own bundles; it audits whatever the real Phase 2D pipeline already produced for the candidates the caller chooses to audit context coverage for. */
  bundles: CovenantContextBundle[];
}

export function runIndependentCoverageAudit(input: AuditPackageInput): CoverageAuditRunResult {
  const start = Date.now();
  const options: SourceInventoryOptions = { companyId: input.companyId, packageKey: input.packageKey, instrumentKey: input.instrumentKey };

  const regions: CoverageRegion[] = [];
  for (const documentId of input.documentIds) {
    regions.push(...buildSourceCoverageInventory(documentId, input.index, options));
  }
  const deterministicWallClockMs = Date.now() - start;

  const comparisonStart = Date.now();
  const findings: AuditFinding[] = [];
  findings.push(...auditDiscoveryCoverage(regions, input.candidates, input.index));

  for (const bundle of input.bundles) {
    const nodeKey = bundle.originatingStructuralNodeKeys[0];
    if (!nodeKey) continue;
    findings.push(
      ...auditContextCoverage({
        companyId: input.companyId,
        packageKey: input.packageKey,
        instrumentKey: input.instrumentKey,
        documentId: bundle.originatingDocumentId,
        nodeKey,
        index: input.index,
        packageGraph: input.packageGraph,
        bundle,
      })
    );
    findings.push(...auditDefinitionCompleteness(bundle, input.index, bundle.originatingDocumentId, input.companyId, input.packageKey, input.instrumentKey));
  }
  const comparisonWallClockMs = Date.now() - comparisonStart;

  const discoveredNodeKeys = new Set(input.candidates.flatMap((c) => c.structuralNodeKeys));
  const coverageMap = buildCoverageMap(regions, findings, discoveredNodeKeys);

  const contentIdentity = computeContentIdentity({
    companyId: input.companyId,
    packageKey: input.packageKey,
    structuralParserVersion: "phase-2a-structural-index",
    auditAlgorithmVersion: COVERAGE_AUDIT_ALGORITHM_VERSION,
    semanticPromptVersion: null,
    providerIdentity: null,
    readSpans: regions.map((r) => ({ documentId: r.documentId, text: r.excerptText })),
  });

  const materialFindings = findings.filter((f) => f.materiality === "MATERIAL").length;
  const uncertainFindings = findings.filter((f) => f.materiality === "UNCERTAIN").length;

  return {
    companyId: input.companyId,
    packageKey: input.packageKey,
    regions,
    findings,
    coverageMap,
    auditAlgorithmVersion: COVERAGE_AUDIT_ALGORITHM_VERSION,
    contentIdentity,
    performance: {
      documentsAudited: input.documentIds.length,
      structuralRegionsAudited: regions.length,
      independentCandidates: regions.length,
      deterministicWallClockMs,
      semanticRegionsReviewed: 0,
      semanticWallClockMs: 0,
      comparisonWallClockMs,
      totalFindings: findings.length,
      materialFindings,
      uncertainFindings,
      semanticCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
    },
  };
}
