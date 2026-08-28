/**
 * Phase 2E - definition-content coverage audit (task §16). Independently
 * inspects a definition's own REAL full text (via Phase 2A's
 * getDefinitionFullText - low-level infra) for sub-structure signals
 * (inclusions/exclusions/addbacks/deductions/caps/time-limits/anti-
 * duplication) and compares against what the Phase 2D bundle actually
 * retrieved for that same definition - retrieving the top-level
 * definition alone is not sufficient if the bundle's own stored excerpt
 * dropped economically material sub-structure (task §16's own
 * instruction).
 */
import type { StructuralIndex } from "../structural-index";
import type { CovenantContextBundle } from "../context-retrieval/types";
import { computeFindingId } from "./identity";
import { COVERAGE_AUDIT_ALGORITHM_VERSION, type AuditFinding } from "./types";

interface SubstructureSignal {
  name: string;
  re: RegExp;
}

const SUBSTRUCTURE_SIGNALS: SubstructureSignal[] = [
  { name: "inclusion", re: /\bincludes?\b/i },
  { name: "exclusion", re: /\b(?:excludes?|other than|does not include)\b/i },
  { name: "addback", re: /\b(?:plus|add(?:ed)? back)\b/i },
  { name: "deduction", re: /\b(?:minus|less)\b/i },
  { name: "cap", re: /\bshall not exceed\b/i },
  { name: "time_limit", re: /\b(?:four consecutive fiscal quarters|Test Period|trailing twelve.month)\b/i },
  { name: "anti_duplication", re: /\bwithout duplication\b/i },
  { name: "entity_scope", re: /\b(?:Restricted|Unrestricted) Subsidiar(?:y|ies)\b/ },
];

function detectSubstructure(text: string): Set<string> {
  return new Set(SUBSTRUCTURE_SIGNALS.filter((s) => s.re.test(text)).map((s) => s.name));
}

export function auditDefinitionCompleteness(bundle: CovenantContextBundle, index: StructuralIndex, documentId: string, companyId: string, packageKey: string, instrumentKey: string | null): AuditFinding[] {
  const findings: AuditFinding[] = [];
  for (const item of bundle.items) {
    if (item.type !== "DEFINITION" && item.type !== "DEFINITION_DEPENDENCY") continue;
    const realFullText = index.getDefinitionFullText(item.normalizedRef, item.documentId) ?? "";
    if (!realFullText) continue;
    const realSignals = detectSubstructure(realFullText);
    const excerptSignals = detectSubstructure(item.excerptText);
    const missing = [...realSignals].filter((s) => !excerptSignals.has(s));
    if (missing.length === 0) continue;

    const evidence = `"${item.normalizedRef}"'s own real full text carries sub-structure signal(s) [${missing.join(", ")}] not present in the bundle's retrieved excerpt for this definition.`;
    findings.push({
      findingId: computeFindingId(item.documentId, item.structuralNodeId, "MISSING_DEFINITION_DEPENDENCY", evidence),
      companyId,
      packageKey,
      instrumentKey,
      documentId: item.documentId,
      structuralNodeKey: item.structuralNodeKey,
      structuralNodeId: item.structuralNodeId,
      sourceCitation: item.sourceCitation,
      findingType: "MISSING_DEFINITION_DEPENDENCY",
      materiality: "MATERIAL",
      sourceEvidence: evidence,
      auditorReasoning: "Independent re-read of this definition's own real full text (Phase 2A's getDefinitionFullText) found sub-structure the bundle's own stored excerpt does not contain - retrieving the top-level definition alone is not sufficient when the economics depend on nested/excluded/capped sub-structure.",
      comparisonResult: "CONTEXT_ITEM_MISSING",
      rootCauseSubsystem: "CONTEXT_RETRIEVAL_PHASE_2D",
      affectedDiscoveryId: bundle.originatingDiscoveryId,
      affectedBundleId: bundle.bundleId,
      resolutionStatus: "OPEN",
      auditAlgorithmVersion: COVERAGE_AUDIT_ALGORITHM_VERSION,
      semanticPromptVersion: null,
      providerIdentity: null,
      provenance: "definition-audit.ts - comparison stage",
    });
  }
  return findings;
}
