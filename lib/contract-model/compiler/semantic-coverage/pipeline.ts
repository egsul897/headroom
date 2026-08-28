/**
 * Phase 3E - runSemanticCoverageAudit: the one entry point wiring every
 * layer together (router.ts -> unit-hypothesis.ts -> [ai-inventory.ts,
 * optional] -> freeze.ts -> reconciliation.ts -> family/document/package
 * coverage -> cross-reference-audit.ts), mirroring coverage-audit/pipeline.ts's
 * own single-entry-point convention (Phase 2E) and semantic-verification/verify.ts's
 * own orchestration shape (Phase 3C). A declared reconciliation-stage
 * module - the caller supplies every real Phase 2B/2C/2G/3B/3C output;
 * this module never re-derives any of them.
 *
 * FREEZE-BEFORE-LOAD (types.ts's own Independence Contract requirement):
 * this function computes and freezes each document's inventory (Layers
 * A/B/[C]) BEFORE it ever touches compiledResults/verifiedCandidateRefs/
 * operativeState - the call order below is the concrete mechanism behind
 * that disclosed procedural requirement.
 */
import type { StructuralIndex } from "../structural-index";
import type { DiscoveredCandidate } from "../discovery/types";
import type { OperativeContractState } from "../amendment/types";
import { routeDocument } from "./router";
import { hypothesizeUnitsForDocument } from "./unit-hypothesis";
import { runBoundedAiInventoryForRegion } from "./ai-inventory";
import type { StageCaller } from "../llm-caller";
import { freezeSourceInventory } from "./freeze";
import { reconcileFrozenInventory, type CompiledCandidateResult } from "./reconciliation";
import { computeDocumentCoverage } from "./document-coverage";
import { computePackageCoverage } from "./package-coverage";
import { applyOperativeStateFindingsToCoverage, auditCrossSectionRelationships, auditOperativeStateForUnits } from "./cross-reference-audit";
import type { MaterialSemanticUnit, OperativeStateAuditFinding, PackageCoverageResult, CrossSectionRelationshipFinding } from "./types";

export interface DocumentAuditInput {
  documentId: string;
  /** True when this document's structural parsing is so degraded even the raw-source fallback (router.ts's own path) could not produce a usable inventory - the caller sets this from its own knowledge of the parse; the audit itself cannot always tell "zero real signal" apart from "zero units admitted because the router failed" without this explicit flag. */
  auditIncomplete?: boolean;
}

export interface SemanticCoverageAuditInput {
  companyId: string;
  packageKey: string;
  instrumentKey: string | null;
  index: StructuralIndex;
  documents: DocumentAuditInput[];
  discoveredCandidates: DiscoveredCandidate[];
  compiledResults: CompiledCandidateResult[];
  verifiedCandidateRefs: Set<string>;
  operativeState: OperativeContractState | null;
  operativeVersionRef: string | null;
  /** When supplied, Layer C (bounded AI inventory) runs once per router-admitted region; omit to run Layers A/B only (a legitimate, cheaper, deterministic-only configuration - task's own "must work at multiple cost/completeness tiers"). */
  aiCaller?: StageCaller;
  structuralParserVersion: string;
  providerIdentity: string | null;
}

export interface DocumentAuditOutput {
  documentId: string;
  units: MaterialSemanticUnit[];
  crossSectionFindings: CrossSectionRelationshipFinding[];
  operativeStateFindings: OperativeStateAuditFinding[];
  aiInventoryFailed: boolean;
  aiInventoryRejectedQuotes: number;
}

export interface SemanticCoverageAuditResult {
  packageCoverage: PackageCoverageResult;
  documentDetails: DocumentAuditOutput[];
  frozenContentHash: string;
}

export async function runSemanticCoverageAudit(input: SemanticCoverageAuditInput): Promise<SemanticCoverageAuditResult> {
  const documentDetails: DocumentAuditOutput[] = [];
  const documentCoverages = [];
  const auditIncompleteDocumentIds: string[] = [];
  const allUnitFingerprints: { documentId: string; text: string }[] = [];

  for (const doc of input.documents) {
    if (doc.auditIncomplete) {
      auditIncompleteDocumentIds.push(doc.documentId);
      continue;
    }

    // Layer A/B - deterministic, always runs first.
    const routing = routeDocument(doc.documentId, input.index);
    const hypothesisCtx = { companyId: input.companyId, packageKey: input.packageKey, instrumentKey: input.instrumentKey, operativeVersionRef: input.operativeVersionRef };
    let units = hypothesizeUnitsForDocument(routing, input.index, hypothesisCtx);

    // Layer C - bounded AI inventory, one call per router-admitted region, only when a caller was supplied.
    let aiInventoryFailed = false;
    let aiInventoryRejectedQuotes = 0;
    if (input.aiCaller) {
      for (const region of routing.regions) {
        const fullText = region.structuralNodeKey ? input.index.getNodeText(region.structuralNodeKey, "OWN") : (input.index.getDocumentText(region.documentId) ?? "").slice(region.charStart, region.charEnd);
        const alreadyFound = units.filter((u) => u.anchors.some((a) => a.documentId === region.documentId && a.structuralNodeKey === region.structuralNodeKey));
        const aiResult = await runBoundedAiInventoryForRegion(region, fullText, alreadyFound, { ...hypothesisCtx, headingHint: null }, input.aiCaller);
        if (aiResult.failed) aiInventoryFailed = true;
        aiInventoryRejectedQuotes += aiResult.rejectedUnverifiableQuotes;
        units = [...units, ...aiResult.units];
      }
    }

    // FREEZE - must happen before anything below reads compiledResults/verifiedCandidateRefs/operativeState.
    const frozen = freezeSourceInventory({ companyId: input.companyId, packageKey: input.packageKey, instrumentKey: input.instrumentKey, documentIds: [doc.documentId], units });
    allUnitFingerprints.push({ documentId: doc.documentId, text: frozen.frozenContentHash });

    // Reconciliation + rollup - the only stage permitted to read Phase 2B/3B/3C real output.
    const { entries: reconciledEntries, dangerousUnaccounted: reconciledDangerous } = reconcileFrozenInventory({ frozenInventory: frozen, discoveredCandidates: input.discoveredCandidates, compiledResults: input.compiledResults, verifiedCandidateRefs: input.verifiedCandidateRefs });
    const documentRules = input.compiledResults.flatMap((c) => c.rules);
    const crossSectionFindings = auditCrossSectionRelationships(units, documentRules);
    const operativeStateFindings = input.operativeState ? auditOperativeStateForUnits(units, input.operativeState) : [];
    // Phase 3F.1 §29-32/F3 - fold operative-state findings back into coverage
    // BEFORE rollup, so OPERATIVE_STATE_UNRESOLVED (already checked by both
    // document-coverage.ts's gate and package-coverage.ts's package status)
    // actually becomes reachable rather than a dead branch.
    const { entries, dangerousUnaccounted } = applyOperativeStateFindingsToCoverage(reconciledEntries, reconciledDangerous, operativeStateFindings, units);

    documentCoverages.push(computeDocumentCoverage(doc.documentId, units, entries, dangerousUnaccounted));
    documentDetails.push({ documentId: doc.documentId, units, crossSectionFindings, operativeStateFindings, aiInventoryFailed, aiInventoryRejectedQuotes });
  }

  const packageCoverage = computePackageCoverage({
    companyId: input.companyId,
    packageKey: input.packageKey,
    documents: documentCoverages,
    auditIncompleteDocumentIds,
    structuralParserVersion: input.structuralParserVersion,
    aiInventoryPromptVersion: input.aiCaller ? "phase-3e-semantic-coverage-prompt.v1" : null,
    providerIdentity: input.providerIdentity,
    frozenContentHash: allUnitFingerprints.map((f) => f.text).join(","),
  });

  return { packageCoverage, documentDetails, frozenContentHash: packageCoverage.contentIdentity };
}
