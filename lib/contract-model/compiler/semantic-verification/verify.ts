/**
 * Phase 3C - the verifier's own public API: verifyCompiledCandidate.
 * Orchestrates Layer 1 (deterministic source/IR inventory + reconciliation
 * + deterministic-only findings) -> call-routing decision (task §32) ->
 * Layer 2 (adversarial semantic review, when routed to) -> Layer 3 (merge
 * deterministic + semantic findings, task §31's DETERMINISTIC_ONLY/
 * SEMANTIC_ONLY/BOTH classification) -> Layer 4 (status/trust gating,
 * task §17/§18).
 *
 * COMPILER OUTPUT IS NEVER MUTATED (task §16) - this function returns a
 * SemanticVerificationResult alongside the untouched SemanticCompilationResult
 * it was given; it never edits/repairs/replaces any IRRule/IRDefinition.
 */
import { buildSourceInventory } from "./source-inventory";
import { buildIrInventory } from "./ir-inventory";
import { reconcileInventories } from "./reconciliation";
import { buildFindingsFromReconciliation } from "./findings";
import { runAdversarialSemanticReview } from "./reviewer";
import { SEMANTIC_VERIFIER_ALGORITHM_VERSION } from "./types";
import type { IrInventory, ReconciliationResult, SemanticVerificationFinding, SemanticVerificationResult, SemanticVerificationSeverity, SemanticVerificationStatus, VerificationInput } from "./types";
import type { StageCaller } from "../llm-caller";
import type { SemanticCompilerInput } from "../semantic/types";

export interface VerifyOptions {
  /** Injectable for testing - defaults to the real getStageCaller() env-var-driven selection inside reviewer.ts when omitted. */
  reviewCaller?: StageCaller;
  /** Testing/override hooks - production code should never need either; the real routing decision is shouldInvokeSemanticReview below. */
  forceSemanticReview?: boolean;
  skipSemanticReview?: boolean;
}

/**
 * Task §32's own conservative-during-V1 call-routing discipline. Skips the
 * adversarial semantic review call ONLY for the narrowest, safest case task
 * §32 itself names as deterministic-only-worthy: a single compiled unit,
 * with every one of its numeric/structural signals already fully
 * reconciled, and no alternative-selection complexity (no MAX/MIN/IF/
 * SCHEDULE/UNLIMITED_CAPACITY branching) - "a straightforward fully
 * reconciled fixed basket with exact source/provenance." Every other case
 * (any unresolved discrepancy, multiple compiled units, or any alternation
 * complexity) is routed to Layer 2, erring toward MORE review rather than
 * less, exactly as §32 requires ("we are validating safety before
 * optimizing cost").
 */
function shouldInvokeSemanticReview(reconciliation: ReconciliationResult, irInventory: IrInventory): boolean {
  if (reconciliation.materialUnresolvedCount > 0) return true;
  const totalUnits = irInventory.ruleCount + irInventory.definitionCount;
  if (totalUnits > 1) return true;
  const hasAlternationOrUnlimitedCapacity = irInventory.items.some((i) => i.isAlternativeWithinSelection || i.kind === "UNLIMITED_CAPACITY_MARKER" || i.kind === "UNSUPPORTED_MARKER");
  if (hasAlternationOrUnlimitedCapacity) return true;
  return false;
}

const SEVERITY_RANK: Record<SemanticVerificationSeverity, number> = { NON_MATERIAL: 0, UNCERTAIN: 1, MATERIAL: 2 };
function maxSeverity(a: SemanticVerificationSeverity, b: SemanticVerificationSeverity): SemanticVerificationSeverity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

/**
 * Task §31's own required DETERMINISTIC_ONLY/SEMANTIC_ONLY/BOTH
 * classification: a semantic finding that concerns the SAME
 * rule/definition and the SAME finding type as an already-existing
 * deterministic finding is the same underlying discrepancy caught twice -
 * merged into one BOTH finding (keeping the deterministic finding's
 * stable, earlier-computed identity as canonical) rather than reported as
 * two separate findings.
 */
function mergeFindings(deterministic: SemanticVerificationFinding[], semantic: SemanticVerificationFinding[]): SemanticVerificationFinding[] {
  const merged: SemanticVerificationFinding[] = [];
  const usedDeterministicIdx = new Set<number>();

  for (const sem of semantic) {
    const detIdx = deterministic.findIndex((d, i) => !usedDeterministicIdx.has(i) && d.ruleOrDefinitionId === sem.ruleOrDefinitionId && d.findingType === sem.findingType);
    if (detIdx >= 0) {
      usedDeterministicIdx.add(detIdx);
      const det = deterministic[detIdx]!;
      merged.push({
        ...sem,
        findingId: det.findingId,
        severity: maxSeverity(det.severity, sem.severity),
        deterministicSignals: det.deterministicSignals,
        verificationMethod: "BOTH",
        verifierReasoning: `[deterministic] ${det.verifierReasoning} | [adversarial semantic review, confirming] ${sem.verifierReasoning}`,
      });
    } else {
      merged.push(sem);
    }
  }
  for (let i = 0; i < deterministic.length; i++) {
    if (!usedDeterministicIdx.has(i)) merged.push(deterministic[i]!);
  }
  return merged;
}

/**
 * Task §17/§18 - verification status, a dimension separate from
 * RepresentationSufficiency. Order matters: a failed required review always
 * wins over everything else; a MATERIAL finding always wins over context/
 * operative-state concerns (a real, confirmed gap is worse than merely
 * incomplete evidence); operative-state/context insufficiency is checked
 * BEFORE declaring a clean "no material gap" result, so this verifier never
 * blesses an IR as fully trusted merely because it matches text retrieved
 * under known-incomplete conditions (task §18's explicit requirement).
 */
function determineStatus(compilerInput: SemanticCompilerInput, findings: SemanticVerificationFinding[], semanticReviewInvoked: boolean, semanticReviewFailed: boolean): SemanticVerificationStatus {
  if (semanticReviewInvoked && semanticReviewFailed) return "VERIFICATION_FAILED";
  if (findings.some((f) => f.severity === "MATERIAL")) return "MATERIAL_DISCREPANCY";
  if (compilerInput.contextBundle.sufficiencyState !== "SUFFICIENT") return "VERIFICATION_INCOMPLETE";
  const lineage = compilerInput.operativeLineage;
  if (lineage && (lineage.operativeStatus === "OPERATIVE_STATE_CONFLICTED" || lineage.operativeStatus === "OPERATIVE_STATE_REVIEW_REQUIRED")) return "REVIEW_REQUIRED";
  if (findings.some((f) => f.severity === "UNCERTAIN")) return "REVIEW_REQUIRED";
  if (findings.length > 0) return "VERIFIED_WITH_NON_MATERIAL_FINDINGS";
  return "VERIFIED_NO_MATERIAL_GAP_FOUND";
}

export async function verifyCompiledCandidate(input: VerificationInput, options: VerifyOptions = {}): Promise<SemanticVerificationResult> {
  const { compilerInput, compilationResult } = input;

  const sourceInventory = buildSourceInventory(compilerInput.candidateRef, compilerInput.operativeSourceText, compilerInput.sourceDocumentId, compilerInput.sourceSectionRef ?? "(no section ref)", null);
  const irInventory = buildIrInventory(compilerInput.candidateRef, compilationResult.rules, compilationResult.definitions);
  const reconciliation = reconcileInventories(sourceInventory, irInventory);
  const deterministicFindings = buildFindingsFromReconciliation(input, reconciliation);

  const needsSemanticReview = options.skipSemanticReview ? false : options.forceSemanticReview || shouldInvokeSemanticReview(reconciliation, irInventory);

  let allFindings = deterministicFindings;
  let semanticReviewInvoked = false;
  let semanticReviewFailed = false;
  let semanticReviewSkippedReason: string | null = needsSemanticReview
    ? null
    : "deterministic reconciliation found a single, fully-reconciled, non-alternating compiled unit with no unresolved numeric/structural signal - conservative V1 routing (task §32) skipped adversarial semantic review";

  if (needsSemanticReview) {
    semanticReviewInvoked = true;
    const review = await runAdversarialSemanticReview(input, reconciliation, options.reviewCaller);
    semanticReviewFailed = review.failed;
    allFindings = mergeFindings(deterministicFindings, review.findings);
  }

  return {
    candidateRef: compilerInput.candidateRef,
    status: determineStatus(compilerInput, allFindings, semanticReviewInvoked, semanticReviewFailed),
    findings: allFindings,
    sourceInventory,
    irInventory,
    reconciliation,
    semanticReviewInvoked,
    semanticReviewSkippedReason,
    verifierAlgorithmVersion: SEMANTIC_VERIFIER_ALGORITHM_VERSION,
    verifiedAt: new Date().toISOString(),
  };
}
