/**
 * Phase 2E - context-coverage comparison (task §14/§15/§17/§18/§19/§20).
 * COMPARISON STAGE ONLY: reads a real Phase 2D CovenantContextBundle
 * solely to check whether the independent context inventory
 * (context-inventory.ts, built with zero knowledge of the bundle) is
 * actually represented in it.
 */
import type { CovenantContextBundle } from "../context-retrieval/types";
import type { PackageGraphResult } from "../package-graph/types";
import type { StructuralIndex } from "../structural-index";
import { buildIndependentContextExpectations } from "./context-inventory";
import { computeFindingId } from "./identity";
import { COVERAGE_AUDIT_ALGORITHM_VERSION, type AuditFinding } from "./types";

function hasItem(bundle: CovenantContextBundle, normalizedRef: string, types: string[]): boolean {
  const norm = normalizedRef.toLowerCase().replace(/\s+/g, " ").trim();
  return bundle.items.some((i) => types.includes(i.type) && i.normalizedRef.toLowerCase().replace(/\s+/g, " ").trim() === norm);
}

function hasUnresolved(bundle: CovenantContextBundle, text: string): boolean {
  const norm = text.toLowerCase().trim();
  return bundle.unresolvedDependencies.some((u) => u.sourceText.toLowerCase().trim() === norm || u.citation.toLowerCase().includes(norm));
}

export interface ContextComparisonInput {
  companyId: string;
  packageKey: string;
  instrumentKey: string | null;
  documentId: string;
  nodeKey: string;
  index: StructuralIndex;
  packageGraph: PackageGraphResult | null;
  bundle: CovenantContextBundle;
}

export function auditContextCoverage(input: ContextComparisonInput): AuditFinding[] {
  const { companyId, packageKey, instrumentKey, documentId, nodeKey, index, packageGraph, bundle } = input;
  const expectations = buildIndependentContextExpectations(documentId, nodeKey, index, packageGraph);
  const findings: AuditFinding[] = [];

  const push = (findingType: AuditFinding["findingType"], sourceCitation: string, structuralNodeKey: string | null, sourceEvidence: string, reasoning: string, comparisonResult: AuditFinding["comparisonResult"], rootCause: AuditFinding["rootCauseSubsystem"], materiality: AuditFinding["materiality"] = "MATERIAL") => {
    findings.push({
      findingId: computeFindingId(documentId, structuralNodeKey, findingType, sourceEvidence),
      companyId,
      packageKey,
      instrumentKey,
      documentId,
      structuralNodeKey,
      sourceCitation,
      findingType,
      materiality,
      sourceEvidence,
      auditorReasoning: reasoning,
      comparisonResult,
      rootCauseSubsystem: rootCause,
      affectedDiscoveryId: bundle.originatingDiscoveryId,
      affectedBundleId: bundle.bundleId,
      resolutionStatus: "OPEN",
      auditAlgorithmVersion: COVERAGE_AUDIT_ALGORITHM_VERSION,
      semanticPromptVersion: null,
      providerIdentity: null,
      provenance: "context-comparison.ts - comparison stage (real Phase 2D bundle read here only, never during independent context-inventory generation)",
    });
  };

  for (const ref of expectations.parentSectionRefs) {
    if (!hasItem(bundle, ref, ["PARENT_SCOPE", "OPERATIVE_SOURCE"])) push("MISSING_PARENT_CONTEXT", `${documentId}::${ref}`, null, `Ancestor section ${ref} is independently required parent scope.`, "Independent ancestor-chain scan found a parent section not represented as a PARENT_SCOPE/OPERATIVE_SOURCE item in the bundle.", "CONTEXT_ITEM_MISSING", "CONTEXT_RETRIEVAL_PHASE_2D");
  }
  for (const ref of expectations.childSectionRefs) {
    if (!hasItem(bundle, ref, ["CHILD_RULE"])) push("MISSING_CHILD_CONTEXT", `${documentId}::${ref}`, null, `Direct child section ${ref} is independently a distinct child rule.`, "Independent child-node scan found a direct child not represented as a CHILD_RULE item in the bundle.", "CONTEXT_ITEM_MISSING", "CONTEXT_RETRIEVAL_PHASE_2D");
  }
  const siblingTypeMap: Record<import("./context-inventory").IndependentSiblingRole, { type: string; findingType: AuditFinding["findingType"] }> = {
    SHARED_CAP: { type: "SHARED_CAP", findingType: "MISSING_SHARED_CAP" },
    PROVISO: { type: "PROVISO", findingType: "MISSING_PROVISO" },
    EXCEPTION: { type: "EXCEPTION", findingType: "MISSING_EXCEPTION" },
    CONDITION: { type: "CONDITION", findingType: "MISSING_CONDITION" },
    ENTITY_SCOPE: { type: "ENTITY_SCOPE", findingType: "MISSING_ENTITY_SCOPE" },
  };
  // CONDITION/ENTITY_SCOPE are the two weakest, most ambiguous sibling
  // signal categories - a clause-level sibling matching one of these could
  // genuinely be a global modifier of the audited covenant, OR simply an
  // unrelated, independently-operative sibling basket that happens to
  // contain "so long as"/an entity-type mention of its own. PROVISO/
  // EXCEPTION/SHARED_CAP are stronger, more standard "trailing modifier"
  // drafting signals (provided that/notwithstanding/except/an aggregate
  // cap spanning named clauses) and remain MATERIAL; the weaker two are
  // reported UNCERTAIN rather than a fabricated MATERIAL claim (task §10's
  // own "do not suppress UNCERTAIN findings... do not fabricate
  // certainty") - measured directly against the real FWRG/LSB audit run,
  // which is where this distinction was found to matter.
  const AMBIGUOUS_SIBLING_ROLES = new Set(["CONDITION", "ENTITY_SCOPE"]);
  for (const sib of expectations.siblings) {
    const { type, findingType } = siblingTypeMap[sib.role]!;
    const materiality: AuditFinding["materiality"] = AMBIGUOUS_SIBLING_ROLES.has(sib.role) ? "UNCERTAIN" : "MATERIAL";
    if (!hasItem(bundle, sib.sectionRef, [type, "SIBLING_CONTEXT"])) push(findingType, `${documentId}::${sib.sectionRef}`, sib.nodeKey, `Sibling ${sib.sectionRef} independently carries a ${sib.role} signal.`, `Independent sibling scan matched a ${sib.role}-shaped keyword in ${sib.sectionRef}'s own text, not represented as a ${type} item in the bundle.`, "CONTEXT_ITEM_MISSING", "CONTEXT_RETRIEVAL_PHASE_2D", materiality);
  }
  for (const def of expectations.definitions) {
    const findingType = def.depth === 1 ? "MISSING_DEFINITION" : "MISSING_DEFINITION_DEPENDENCY";
    if (hasItem(bundle, def.exactTerm, ["DEFINITION", "DEFINITION_DEPENDENCY"])) continue;
    if (hasUnresolved(bundle, def.exactTerm)) continue; // already surfaced as unresolved - not silently dropped, no gap to report (Phase 2D behaved correctly by disclosing it).
    push(findingType, `${documentId}::${def.exactTerm}`, null, `"${def.exactTerm}" (depth ${def.depth}) is independently used in this covenant's own operative text and is declared in this document.`, `Independent definition scan found "${def.exactTerm}" declared and used, but it is neither retrieved as a DEFINITION/DEFINITION_DEPENDENCY item nor surfaced as an unresolved dependency - a silent absence.`, "CONTEXT_ITEM_MISSING", "CONTEXT_RETRIEVAL_PHASE_2D");
  }
  for (const xref of expectations.crossReferences) {
    if (!xref.material) continue; // administrative reference - correctly not required to be followed (task §17).
    if (hasItem(bundle, xref.normalizedTarget, ["CROSS_REFERENCE", "CALCULATION_PROVISION"])) continue;
    if (hasUnresolved(bundle, xref.normalizedTarget)) continue;
    push("SILENT_UNRESOLVED_DEPENDENCY", `${documentId}::${xref.normalizedTarget}`, null, `Cross-reference to ${xref.normalizedTarget} independently classified material (${xref.reason}).`, "Independent reference scan found a material cross-reference neither retrieved nor surfaced as unresolved.", "CONTEXT_ITEM_MISSING", "CONTEXT_RETRIEVAL_PHASE_2D");
  }
  for (const lead of expectations.amendmentLeads) {
    const m = lead.modification;
    const already = bundle.items.some((i) => (i.type === "AMENDMENT_LEAD" || i.type === "SUPPLEMENT_LEAD") && i.excerptText.includes(m.sourceText.slice(0, 40)));
    if (already) continue;
    push("MISSING_AMENDMENT_LEAD", `${m.sourceDocumentId}::${m.targetSectionRef ?? m.targetDefinedTermRef ?? "unknown target"}`, null, `Modification candidate (${m.operation}) targeting ${m.targetSectionRef ?? m.targetDefinedTermRef} from ${m.sourceDocumentId} independently found via Phase 2C package topology.`, "Independent read of Phase 2C's real ModificationCandidate[] found a candidate targeting this covenant's own scope, not represented as an AMENDMENT_LEAD/SUPPLEMENT_LEAD item in the bundle.", "AMENDMENT_LEAD_MISSING", "CONTEXT_RETRIEVAL_PHASE_2D");
  }
  for (const cdLead of expectations.crossDocumentLeads) {
    const l = cdLead.lead;
    const already = bundle.items.some((i) => i.type === "CROSS_DOCUMENT_REFERENCE" || i.type === "INTERCREDITOR_LEAD") && bundle.unresolvedDependencies.some((u) => u.citation.includes(l.namedAgreementHint));
    if (bundle.items.some((i) => (i.type === "CROSS_DOCUMENT_REFERENCE" || i.type === "INTERCREDITOR_LEAD") && i.reason.includes(l.namedAgreementHint))) continue;
    if (bundle.unresolvedDependencies.some((u) => u.citation.includes(l.namedAgreementHint) || u.sourceText.includes(l.namedAgreementHint))) continue;
    if (already) continue;
    push("MISSING_CROSS_DOCUMENT_REFERENCE", `${l.sourceDocumentId}::${l.namedAgreementHint}`, null, `Cross-document reference lead "${l.namedAgreementHint}" independently found via Phase 2C package topology, appears in this covenant's own operative text.`, "Independent read of Phase 2C's real CrossDocumentReferenceLead[] found a lead whose named-agreement hint appears in this covenant's own text, not represented in the bundle.", "AMENDMENT_LEAD_MISSING", "CONTEXT_RETRIEVAL_PHASE_2D");
  }

  return findings;
}
