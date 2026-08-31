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
import { EMPTY_SUPERSESSION_INDEX, buildNodeSupersessionIndex, resolveOperativeDefinitionEvidence } from "../amendment/operative-state";
import type { NodeSupersessionIndex } from "../amendment/types";
import { buildIrInventory } from "./ir-inventory";
import { reconcileInventories } from "./reconciliation";
import { buildFindingsFromReconciliation } from "./findings";
import { runAdversarialSemanticReview } from "./reviewer";
import type { SemanticReviewResult } from "./reviewer";
import { classifyConditionSuspicion, type ConditionSuspicionCache, type ConditionSuspicionResult } from "./condition-suspicion-classifier";
import { SEMANTIC_VERIFIER_ALGORITHM_VERSION } from "./types";
import type { IrInventory, ReconciliationResult, SemanticVerificationFinding, SemanticVerificationResult, SemanticVerificationSeverity, SemanticVerificationStatus, SourceInventory, VerificationInput } from "./types";
import type { StageCaller } from "../llm-caller";
import type { SemanticCompilationResult, SemanticCompilerInput } from "../semantic/types";

export interface VerifyOptions {
  /** Injectable for testing - defaults to the real getStageCaller() env-var-driven selection inside reviewer.ts when omitted. */
  reviewCaller?: StageCaller;
  /** Injectable for testing - defaults to the real getStageCaller() env-var-driven selection inside condition-suspicion-classifier.ts when omitted. Deliberately a SEPARATE injection point from reviewCaller (they are two independent calls with two independent schemas/prompts), even though both typically resolve to the same provider/model in production. */
  conditionSuspicionCaller?: StageCaller;
  /** Injectable for testing/isolation - defaults to condition-suspicion-classifier.ts's own module-level singleton when omitted. */
  conditionSuspicionCache?: ConditionSuspicionCache;
  /** Testing/override hooks - production code should never need either; the real routing decision is shouldInvokeSemanticReviewDeterministic + the condition-suspicion classifier below. */
  forceSemanticReview?: boolean;
  skipSemanticReview?: boolean;
}

/**
 * Task §32's own conservative-during-V1 call-routing discipline, Layer 1 of
 * a now-TWO-layer routing decision (Phase 3F.1-terminal Architecture
 * Decision, Part A - see this function's caller, verifyCompiledCandidate,
 * for the second, semantic layer). This function alone decides whether the
 * DETERMINISTIC evidence already forces review: a single compiled unit,
 * with every one of its numeric/structural signals already fully
 * reconciled, and no alternative-selection complexity (no MAX/MIN/IF/
 * SCHEDULE/UNLIMITED_CAPACITY branching) - "a straightforward fully
 * reconciled fixed basket with exact source/provenance." Every other case
 * (any unresolved discrepancy, multiple compiled units, or any alternation
 * complexity) is routed to Layer 2, erring toward MORE review rather than
 * less, exactly as §32 requires ("we are validating safety before
 * optimizing cost"). Returning `false` here does NOT by itself mean review
 * is skipped any more - it only means the deterministic layer has nothing
 * to say against skipping; the condition-suspicion classifier still gets
 * the final word (see verifyCompiledCandidate) before a skip is allowed.
 */
function shouldInvokeSemanticReviewDeterministic(reconciliation: ReconciliationResult, irInventory: IrInventory): boolean {
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
 * Phase 3F.1.6.RX Workstream E precision fix (independent adversarial
 * attack on BLOCKER-9's fix - see docs/phase-3f1-6-rx-final-blocker-
 * closure/07-verifier-remediation.json). reconciliation.ts's buildAggregateSignals
 * raises a coarse AMBIGUOUS structural signal from as little as ONE
 * source-side conditional/exception/proviso marker (BLOCKER-9's own fix,
 * intentionally lowered from >=2), and findings.ts's determineDeterministicSeverity
 * intentionally, correctly classifies every AMBIGUOUS signal UNCERTAIN
 * "pending Layer 2 confirmation" rather than auto-declaring MATERIAL - but
 * before this fix, that "pending" state never actually resolved: mergeFindings/
 * maxSeverity above can only ever RAISE a deterministic finding's severity
 * when a semantic finding of the same ruleOrDefinitionId+findingType merges
 * into it, never LOWER it - so a single, wholly benign, unrelated
 * conditional-looking word anywhere in a candidate's operative text (e.g. a
 * stray "unless"/"except that" in unrelated boilerplate, on a rule that in
 * fact has zero real conditions) permanently pinned this candidate's status
 * at REVIEW_REQUIRED, even once a REAL, independent adversarial reviewer -
 * given the exact same deterministic signal in its own prompt (reviewer.ts's
 * buildUserContent's "investigate each, do not merely rubber-stamp"
 * instruction) - read the real source text and reported nothing wrong at
 * all. That is a genuine, demonstrable precision regression made much more
 * likely by BLOCKER-9's own threshold fix (a single stray marker is far
 * more common than two), not merely a hypothetical: see this phase's own
 * new adversarial benign-condition-form matrix.
 *
 * This downgrades an AMBIGUOUS-origin UNCERTAIN finding to NON_MATERIAL
 * (never deletes it - full audit trail is preserved) ONLY when ALL of:
 *  (1) it is still purely DETERMINISTIC_ONLY (never touches a finding Layer
 *      2 actually merged into, confirming it - that finding's severity
 *      already correctly reflects the confirmation via maxSeverity);
 *  (2) the semantic review that ran was a REAL review, not the no-credential
 *      SyntheticStageCaller fallback (isSynthetic) - a stub's inevitable
 *      empty response must never be mistaken for an independent judgment
 *      that nothing is wrong (this is exactly why isSynthetic threads
 *      through from reviewer.ts as part of this same fix);
 *  (3) the review did not itself independently report ANY finding of the
 *      same findingType for this candidate (which would mean it DID confirm
 *      the concern, just not merged onto this exact deterministic entry
 *      because aggregate signals carry no single ruleOrDefinitionId - the
 *      confirming finding's own severity still drives status untouched).
 *
 * A hard NOT_ACCOUNTED_FOR/IR_ONLY numeric-evidence finding is NEVER
 * touched by this (verificationMethod alone does not gate it - reason-string
 * membership in `ambiguousReasons` does, and only reconciliation.ts's
 * buildAggregateSignals ever produces those exact reason strings) - real
 * numeric evidence keeps its severity regardless of whether a model call
 * happens to notice it, preserving BLOCKER-9's own recall guarantee
 * unconditionally.
 */
function downgradeUnconfirmedAmbiguousFindings(findings: SemanticVerificationFinding[], reconciliation: ReconciliationResult, review: SemanticReviewResult): SemanticVerificationFinding[] {
  if (review.failed || review.isSynthetic) return findings;
  const ambiguousReasons = new Set(reconciliation.items.filter((i) => i.classification === "AMBIGUOUS").map((i) => i.reason));
  if (ambiguousReasons.size === 0) return findings;
  const semanticFindingTypes = new Set(review.findings.map((f) => f.findingType));

  return findings.map((f) => {
    const isUnconfirmedAmbiguousOrigin = f.verificationMethod === "DETERMINISTIC_ONLY" && f.severity === "UNCERTAIN" && ambiguousReasons.has(f.verifierReasoning) && !semanticFindingTypes.has(f.findingType);
    if (!isUnconfirmedAmbiguousOrigin) return f;
    return {
      ...f,
      severity: "NON_MATERIAL",
      verifierReasoning: `${f.verifierReasoning} [downgraded to NON_MATERIAL: an independent adversarial semantic review (Layer 2) examined this exact candidate, including this deterministic signal, and reported no confirming finding of this type]`,
    };
  });
}

/**
 * Phase 3F.1.6-terminal Part A (OPEN-2 / BLOCKER-5 / BLOCKER-6) -
 * `toolCallLog` is the SAME real-evidence record `compilationResult`
 * already carries (semantic/types.ts's ToolCallLogEntry.evidenceUnresolved,
 * set by getDefinition et al. via resolveOperativeDefinitionEvidence). A
 * candidate whose own compilation relied on a getDefinition-class call that
 * itself could not confirm current operative truth (a real, on-file
 * amendment conflict/partial/ambiguous-target state, or a known-superseded
 * base-document occurrence) must never be blessed VERIFIED - see
 * determineStatus's own header comment below for why this belongs in that
 * same priority tier.
 */
function hasUnresolvedDefinitionEvidence(compilationResult: Pick<SemanticCompilationResult, "toolCallLog">): boolean {
  return compilationResult.toolCallLog.some((entry) => entry.evidenceUnresolved === true);
}

/**
 * Phase 3F.1 FIX-2 ("the actual safety gate must not require any tool
 * call") - INDEPENDENT of hasUnresolvedDefinitionEvidence above (which can
 * only ever see something if a tool was actually called): true when the
 * context bundle this candidate's own compilation was built from ITSELF
 * carried unresolved operative evidence (a CONFLICTED/AMBIGUOUS/PARTIAL/
 * superseded definition or section excerpt embedded directly in the
 * model's first-turn prompt - see compile.ts's own
 * inputHasUnresolvedOperativeEvidence, computed from the SAME bundle this
 * verifier's own compilerInput carries). This is what closes the reproduced
 * exploit at the VERIFIER layer too: a compilation whose toolCallLog is
 * completely EMPTY (the model answered on turn 1, zero tool calls) can
 * still never reach VERIFIED_NO_MATERIAL_GAP_FOUND when its own input
 * already embedded stale/conflicted evidence.
 */
function hasUnresolvedContextBundleEvidence(compilationResult: Pick<SemanticCompilationResult, "inputHasUnresolvedOperativeEvidence">): boolean {
  return compilationResult.inputHasUnresolvedOperativeEvidence === true;
}

/**
 * Phase 3F.1 FIX-2 (§5, defense in depth - "optional but preferred where
 * practical") - independent of whether any context item happened to be
 * marked unresolved or any tool was called: for every IRDefinition this
 * candidate's own compilation actually emitted, directly re-resolves that
 * exact term's CURRENT operative status against the real operativeState/
 * structuralIndex this compilation's own toolAccess already carries (the
 * SAME canonical resolveOperativeDefinitionEvidence primitive
 * semantic/tools.ts's getDefinition and context-retrieval's own
 * resolveDefinitionEvidenceState already rely on - never a second, parallel
 * definition-access discipline). Catches the residual case where a term
 * genuinely never appeared in the context bundle Phase 2D happened to
 * assemble (a real, on-file amendment scoping gap) but the compiled IR
 * still references it. AMBIGUOUS/NOT_FOUND outcomes are conservatively
 * treated as unresolved too (never assumed safe merely because this
 * independent re-check itself could not confirm currency).
 */
function hasStaleReferencedDefinition(compilerInput: SemanticCompilerInput, compilationResult: Pick<SemanticCompilationResult, "definitions">, supersessionIndex: NodeSupersessionIndex): boolean {
  const { operativeState, structuralIndex } = compilerInput.toolAccess;
  return compilationResult.definitions.some((def) => {
    const resolution = resolveOperativeDefinitionEvidence({ index: structuralIndex, operativeState, term: def.termName, searchDocumentIds: [def.sourceDocumentId ?? compilerInput.sourceDocumentId], supersessionIndex });
    return resolution.outcome !== "FOUND" || !resolution.isCurrentTruth;
  });
}

/**
 * Task §17/§18 - verification status, a dimension separate from
 * RepresentationSufficiency. Order matters: a failed required review always
 * wins over everything else; a MATERIAL finding always wins over context/
 * operative-state concerns (a real, confirmed gap is worse than merely
 * incomplete evidence); operative-state/context insufficiency is checked
 * BEFORE declaring a clean "no material gap" result, so this verifier never
 * blesses an IR as fully trusted merely because it matches text retrieved
 * under known-incomplete conditions (task §18's explicit requirement) - a
 * discipline Phase 3F.1.6-terminal Part A (OPEN-2) extends via
 * hasUnresolvedDefinitionEvidence above to cover a DEPENDENCY definition the
 * candidate's own provision text was never itself amended but nonetheless
 * relied on for meaning (e.g. a getDefinition call this compilation attempt
 * made that itself returned a real, on-file CONFLICTED/PARTIAL/AMBIGUOUS
 * amendment state, or a known-superseded base-document occurrence) - never
 * blessed VERIFIED_NO_MATERIAL_GAP_FOUND/VERIFIED_WITH_NON_MATERIAL_FINDINGS
 * merely because the candidate's own numbers happen to reconcile against
 * the IR.
 */
function determineStatus(
  compilerInput: SemanticCompilerInput,
  findings: SemanticVerificationFinding[],
  semanticReviewInvoked: boolean,
  semanticReviewFailed: boolean,
  sourceInventory: SourceInventory,
  compilationResult: Pick<SemanticCompilationResult, "toolCallLog" | "inputHasUnresolvedOperativeEvidence" | "definitions">,
  supersessionIndex: NodeSupersessionIndex
): SemanticVerificationStatus {
  if (semanticReviewInvoked && semanticReviewFailed) return "VERIFICATION_FAILED";
  if (findings.some((f) => f.severity === "MATERIAL")) return "MATERIAL_DISCREPANCY";
  if (compilerInput.contextBundle.sufficiencyState !== "SUFFICIENT") return "VERIFICATION_INCOMPLETE";
  const lineage = compilerInput.operativeLineage;
  if (lineage && (lineage.operativeStatus === "OPERATIVE_STATE_CONFLICTED" || lineage.operativeStatus === "OPERATIVE_STATE_REVIEW_REQUIRED")) return "REVIEW_REQUIRED";
  // Phase 3F.1 FIX-2 - forced from EITHER source (tool-call-derived OR
  // context-bundle-derived), never only the tool-call one; plus the
  // independent defense-in-depth re-check against every emitted
  // IRDefinition's own CURRENT operative status (§5).
  if (hasUnresolvedDefinitionEvidence(compilationResult) || hasUnresolvedContextBundleEvidence(compilationResult) || hasStaleReferencedDefinition(compilerInput, compilationResult, supersessionIndex)) return "REVIEW_REQUIRED";
  // Phase 3F.1.5 Workstream B (P1-11/Q8 fix) - an AFFIRMATIVELY confirmed
  // KNOWN_SUPERSEDED verdict (never UNKNOWN_SUPERSESSION_STATUS - that case
  // is left to the same honest-but-not-blocking treatment
  // compilerInput.operativeLineage === null already receives above, per
  // this module's own established "never amended is a legitimate state"
  // discipline) means the very source text this candidate's reconciliation
  // was built against is real, disclosed, no-longer-governing text - this
  // must never be silently blessed as VERIFIED_NO_MATERIAL_GAP_FOUND
  // merely because its numbers happen to reconcile against the IR. Only
  // reachable when a caller actually supplied both a real physical nodeId
  // and a real OperativeContractState (see verifyCompiledCandidate above) -
  // never triggered merely because supersession was never checked, which
  // is exactly the fail-closed-without-being-fail-loud distinction task
  // §23 already draws for the rest of this pipeline.
  if (sourceInventory.supersessionStatus === "KNOWN_SUPERSEDED") return "REVIEW_REQUIRED";
  if (findings.some((f) => f.severity === "UNCERTAIN")) return "REVIEW_REQUIRED";
  if (findings.length > 0) return "VERIFIED_WITH_NON_MATERIAL_FINDINGS";
  return "VERIFIED_NO_MATERIAL_GAP_FOUND";
}

export async function verifyCompiledCandidate(input: VerificationInput, options: VerifyOptions = {}): Promise<SemanticVerificationResult> {
  const { compilerInput, compilationResult } = input;

  // Phase 3F.1.5 Workstream B (P1-11/Q8 fix) - real physical node identity
  // and the real, already-computed OperativeContractState for this exact
  // instrument are both already present on compilerInput (toolAccess is an
  // "allowed input" per this module's own independence contract above -
  // operative contract state/lineage - and toolAccess.structuralIndex is
  // the same shared, allowed low-level navigation primitive). Resolving
  // both here, rather than inside source-inventory.ts itself, keeps that
  // module a pure function of its own explicit arguments (no index/state
  // reach-around) while still giving it everything it needs to answer
  // honestly. A section ref that does not resolve to a UNIQUE physical
  // node (ambiguous or not found) intentionally yields nodeId === null,
  // which getNodeSupersessionStatus resolves to UNKNOWN_SUPERSESSION_STATUS
  // - never guessed.
  const structuralIndex = compilerInput.toolAccess.structuralIndex;
  const nodeResolution = compilerInput.sourceSectionRef ? structuralIndex.resolveUniqueNodeByRef(compilerInput.sourceDocumentId, compilerInput.sourceSectionRef) : null;
  const structuralNodeId = nodeResolution?.status === "UNIQUE" ? nodeResolution.node.nodeId : null;
  const supersessionIndex = compilerInput.toolAccess.operativeState ? buildNodeSupersessionIndex([{ baseDocumentId: compilerInput.sourceDocumentId, state: compilerInput.toolAccess.operativeState }]) : EMPTY_SUPERSESSION_INDEX;

  const sourceInventory = buildSourceInventory(compilerInput.candidateRef, compilerInput.operativeSourceText, compilerInput.sourceDocumentId, compilerInput.sourceSectionRef ?? "(no section ref)", null, structuralNodeId, supersessionIndex);
  const irInventory = buildIrInventory(compilerInput.candidateRef, compilationResult.rules, compilationResult.definitions);
  const reconciliation = reconcileInventories(sourceInventory, irInventory);
  const deterministicFindings = buildFindingsFromReconciliation(input, reconciliation);

  // Phase 3F.1-terminal Architecture Decision, Part A - TWO-GATE routing
  // (see docs/phase-3f1-terminal-architecture-decision/02-architecture-
  // decision.json). Gate 1 (deterministic) can only ever FORCE review, never
  // skip it on its own authority. A skip is allowed ONLY when Gate 1 finds
  // nothing AND Gate 2 - a real, source-only semantic classifier reading the
  // raw operative text with no compiled-IR bias - explicitly reports
  // NO_MATERIAL_CONDITION_SUSPECTED. Gate 2 is called ONLY when Gate 1 alone
  // would otherwise allow a skip (cost discipline - never call it when
  // deterministic evidence, an explicit forceSemanticReview, or an explicit
  // skipSemanticReview already decided the outcome without needing it).
  // Gate 2's MATERIAL_CONDITION_POSSIBLE, its UNCERTAIN, and any call
  // failure/throw/timeout (classifyConditionSuspicion never throws - a
  // failure is itself represented as status:"UNCERTAIN", failed:true) are
  // ALL treated identically here: every one of them forces review. Only an
  // EXPLICIT, successful NO_MATERIAL_CONDITION_SUSPECTED can ever contribute
  // to a skip.
  const deterministicForcesReview = shouldInvokeSemanticReviewDeterministic(reconciliation, irInventory);
  let conditionSuspicion: ConditionSuspicionResult | null = null;
  let needsSemanticReview: boolean;
  if (options.skipSemanticReview) {
    needsSemanticReview = false;
  } else if (options.forceSemanticReview) {
    needsSemanticReview = true;
  } else if (deterministicForcesReview) {
    needsSemanticReview = true;
  } else {
    conditionSuspicion = await classifyConditionSuspicion(compilerInput.operativeSourceText, { companyId: compilerInput.companyId, instrumentKey: compilerInput.instrumentKey, sourceDocumentId: compilerInput.sourceDocumentId }, options.conditionSuspicionCaller, options.conditionSuspicionCache);
    needsSemanticReview = conditionSuspicion.status !== "NO_MATERIAL_CONDITION_SUSPECTED";
  }

  let allFindings = deterministicFindings;
  let semanticReviewInvoked = false;
  let semanticReviewFailed = false;
  let semanticReviewSkippedReason: string | null = null;
  if (!needsSemanticReview) {
    semanticReviewSkippedReason = options.skipSemanticReview
      ? "caller explicitly requested skipSemanticReview (test/synthetic-scenario/zero-cost-preview override) - production code should not rely on this"
      : `deterministic reconciliation found a single, fully-reconciled, non-alternating compiled unit with no unresolved numeric/structural signal, AND the source-only condition-suspicion classifier (${conditionSuspicion?.provider ?? "(unknown)"}/${conditionSuspicion?.model ?? "(unknown)"}) explicitly reported NO_MATERIAL_CONDITION_SUSPECTED with zero evidence spans - conservative two-gate V1 routing (task §32 + this phase's Architecture Decision) skipped adversarial semantic review`;
  }

  if (needsSemanticReview) {
    semanticReviewInvoked = true;
    const review = await runAdversarialSemanticReview(input, reconciliation, options.reviewCaller, conditionSuspicion);
    semanticReviewFailed = review.failed;
    allFindings = mergeFindings(deterministicFindings, review.findings);
    allFindings = downgradeUnconfirmedAmbiguousFindings(allFindings, reconciliation, review);
  }

  return {
    candidateRef: compilerInput.candidateRef,
    status: determineStatus(compilerInput, allFindings, semanticReviewInvoked, semanticReviewFailed, sourceInventory, compilationResult, supersessionIndex),
    findings: allFindings,
    sourceInventory,
    irInventory,
    reconciliation,
    semanticReviewInvoked,
    semanticReviewSkippedReason,
    conditionSuspicion,
    verifierAlgorithmVersion: SEMANTIC_VERIFIER_ALGORITHM_VERSION,
    verifiedAt: new Date().toISOString(),
  };
}
