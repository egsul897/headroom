/**
 * Phase 3C Layer 3 (partial) - deterministic finding construction from
 * Layer 1's reconciliation output (task §14/§15). This is the
 * "deterministic-only" finding path task §31 wants classified separately
 * from semantic (Layer 2) findings - a strong, generic numeric-mismatch
 * signal doesn't need a model call to be reported (task §32's own cost
 * discipline: "we do not want to spend model calls checking whether
 * $35,000,000 exists in source").
 *
 * Severity lifts the CONCEPT from Phase 3B's grading.ts isDangerous
 * (materialError && sufficiency === "COMPLETE") without importing the
 * grading module itself (per the Independence Contract - grading.ts is a
 * benchmark-comparison tool with no role here): a numeric/addition
 * discrepancy is MATERIAL when the compiler's own output for this
 * candidate contains at least one confidently-COMPLETE rule/definition
 * (task §19's own "COMPLETE must face stronger scrutiny" - a confident
 * package with a hidden gap is exactly the dangerous shape), and UNCERTAIN
 * when the compiler already disclosed non-COMPLETE sufficiency everywhere
 * in this candidate (a real gap, but not a silently confident one - the
 * same distinction Phase 3B.1's own grading.ts MISSED_RULE-danger
 * refinement made, arrived at independently here since this module may
 * never import that one).
 */
import { computeSemanticVerificationFindingId } from "./identity";
import { SEMANTIC_VERIFIER_ALGORITHM_VERSION } from "./types";
import type { ReconciliationItem, ReconciliationResult, SemanticVerificationFinding, SemanticVerificationFindingType, SemanticVerificationSeverity, VerificationInput } from "./types";

function mapClassificationToFindingType(item: ReconciliationItem): SemanticVerificationFindingType {
  // FIX B: a free-text numeric assertion is its own finding class, and splits in two. A figure
  // asserted in a field that states what the rule MEANS is an unsupported assertion; the same
  // figure in a provenance excerpt is a claim about what the SOURCE SAYS, so an unsupported one
  // is a provenance defect - the excerpt is not the source, and quoting a figure into it can
  // never authenticate that figure.
  if (item.numericGrounding) {
    return item.numericGrounding.assertion.fieldClass === "SOURCE_QUOTATION_FIELD" ? "PROVENANCE_MISMATCH" : "UNSUPPORTED_NUMERIC_ASSERTION";
  }
  if (item.classification === "IR_ONLY") return "UNSUPPORTED_IR_ADDITION";
  if (item.classification === "NOT_ACCOUNTED_FOR") {
    // F-4: a figure present in the authenticated text of a definition the IR claims to represent, but absent from
    // that definition's own expression, is a misrepresented definition - not a missing basket of the section.
    if (item.sourceItem?.provenanceClass === "AUTHENTICATED_RETRIEVED") return "MISSING_DEFINITION_EFFECT";
    return item.sourceItem?.kind === "RATIO" ? "MISSING_RULE" : "MISSING_BASKET";
  }
  if (item.classification === "AMBIGUOUS") {
    // F-4: a compiler retrieval claim that failed authentication - the provenance the IR rests on is not the source.
    if (item.reason.includes("could not be authenticated")) return "PROVENANCE_MISMATCH";
    if (item.reason.includes("missing rule/basket")) return "MISSING_RULE";
    if (item.reason.includes("missing condition/exception")) return "MISSING_CONDITION";
    if (item.reason.includes("missing shared cap")) return "MISSING_SHARED_CAP";
    if (item.reason.includes("missing reclassification")) return "MISSING_RECLASSIFICATION";
    if (item.reason.includes("entity scope")) return "WRONG_ENTITY_SCOPE";
  }
  return "OTHER_MATERIAL_SEMANTIC_DISCREPANCY";
}

function determineDeterministicSeverity(item: ReconciliationItem, anyRuleOrDefinitionComplete: boolean): SemanticVerificationSeverity {
  if (item.classification === "NOT_ACCOUNTED_FOR" || item.classification === "IR_ONLY") {
    return anyRuleOrDefinitionComplete ? "MATERIAL" : "UNCERTAIN";
  }
  // AMBIGUOUS aggregate/structural signals are coarser and less individually reliable than an
  // exact numeric mismatch - always UNCERTAIN at this deterministic-only layer, pending Layer 2
  // confirmation (task §12's own "feed material unresolved discrepancies to adversarial
  // semantic review" - never auto-escalated to MATERIAL without either strong numeric evidence
  // or semantic confirmation).
  return "UNCERTAIN";
}

/**
 * Builds findings directly from Layer 1's own reconciliation output, with
 * no model call - verificationMethod is always DETERMINISTIC_ONLY here.
 * Layer 2 (when invoked) produces its own SEMANTIC_ONLY/BOTH findings
 * separately (reviewer.ts) - verify.ts (Layer 3/4) is what merges/dedupes
 * the two sets into one final per-candidate result.
 */
export function buildFindingsFromReconciliation(input: VerificationInput, reconciliation: ReconciliationResult): SemanticVerificationFinding[] {
  const { compilerInput, compilationResult } = input;
  const anyRuleOrDefinitionComplete = compilationResult.rules.some((r) => r.sufficiency === "COMPLETE") || compilationResult.definitions.some((d) => d.sufficiency === "COMPLETE");
  const now = new Date().toISOString();
  const findings: SemanticVerificationFinding[] = [];

  for (const item of reconciliation.items) {
    if (item.classification === "ACCOUNTED_FOR" || item.classification === "POSSIBLY_ACCOUNTED_FOR") continue;

    const findingType = mapClassificationToFindingType(item);
    // FIX B: a free-text assertion has no IR inventory item to borrow identity from - its own
    // rule/field path IS the location, and naming the exact field is the point (a reviewer must be
    // able to go straight to the sentence that made the claim).
    const assertion = item.numericGrounding?.assertion ?? null;
    const ruleOrDefinitionId = assertion?.ruleOrDefinitionId ?? item.irItems[0]?.ruleOrDefinitionId ?? null;
    const irPath = assertion?.fieldPath ?? item.irItems[0]?.irPath ?? null;
    const severity = determineDeterministicSeverity(item, anyRuleOrDefinitionComplete);
    const sourceCitation = item.sourceItem?.sourceCitation ?? compilerInput.sourceSectionRef ?? "(unknown)";
    const sourceEvidence = assertion
      ? "(no authenticated source figure supports this assertion - neither the candidate's own operative window nor any authenticated retrieved evidence states it)"
      : item.sourceItem?.rawText ?? "(no single source excerpt - an aggregate structural signal spanning the whole candidate's operative text)";
    const proposedIrEvidence = assertion
      ? `${assertion.fieldPath} asserts ${JSON.stringify(assertion.rawText)} (canonical ${assertion.normalizedValue}${assertion.unit ? ` ${assertion.unit}` : ""}) in: ${JSON.stringify(assertion.fieldText)}`
      : item.irItems.length > 0 ? item.irItems.map((i) => `${i.irPath}=${i.numericValue ?? i.textValue ?? "(non-value node)"}`).join("; ") : "(absent from compiled IR)";

    findings.push({
      findingId: computeSemanticVerificationFindingId(compilerInput.companyId, compilerInput.instrumentKey, compilerInput.candidateRef, findingType, ruleOrDefinitionId, irPath, sourceCitation, SEMANTIC_VERIFIER_ALGORITHM_VERSION),
      companyId: compilerInput.companyId,
      instrumentKey: compilerInput.instrumentKey,
      sourceDocumentId: compilerInput.sourceDocumentId,
      candidateRef: compilerInput.candidateRef,
      ruleOrDefinitionId,
      irPath,
      findingType,
      severity,
      sourceEvidence,
      sourceCitation,
      proposedIrEvidence,
      verifierReasoning: item.reason,
      deterministicSignals: [item.reason],
      verificationMethod: "DETERMINISTIC_ONLY",
      provider: null,
      model: null,
      verifierAlgorithmVersion: SEMANTIC_VERIFIER_ALGORITHM_VERSION,
      verifierPromptVersion: null,
      resolutionStatus: "OPEN",
      createdAt: now,
    });
  }

  return findings;
}
