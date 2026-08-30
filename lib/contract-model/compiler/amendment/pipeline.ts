/**
 * Phase 2G - the amendment pipeline: deterministic parsing (§7) -> bounded
 * semantic interpretation for genuinely ambiguous operations only (§8) ->
 * deterministic validation of any semantic proposal (§11) -> flat
 * AmendmentEffectCandidate[] output. Chain/conflict resolution and
 * operative-state computation (chain.ts/operative-state.ts) are kept as
 * SEPARATE, per-instrument, per-asOfDate functions a caller invokes
 * afterward - this pipeline's own job is producing the evidence, not
 * answering one particular "as of" query.
 *
 * Reuses Phase 2A's structural index and Phase 2C's own already-resolved
 * PackageGraphResult (classifications, relationship candidates,
 * modification candidates, instruments) rather than re-detecting any of
 * it - task §2's own "reuse sound architecture, do not build a second
 * versioning system" applied concretely.
 */
import type { StructuralIndex } from "../structural-index";
import type { PackageDocumentInput, PackageGraphResult } from "../package-graph/types";
import type { StageCaller } from "../llm-caller";
import { resolveEffectiveDate } from "./effective-date";
import { parseDeterministicAmendmentEffects } from "./deterministic-parser";
import { detectMarkupExhibitEffects, type MarkupExhibitResolutionCandidate } from "./markup-exhibit";
import { detectScheduleModificationEffects, type ScheduleModificationResolutionCandidate } from "./schedule-modification";
import { interpretAmendmentClause, AMENDMENT_INTERPRETATION_PROMPT_VERSION } from "./semantic-interpreter";
import { validateSemanticAmendmentCandidate } from "./validation";
import { groupEffectsByProvision, buildProvisionChain } from "./chain";
import { verifyAmendmentEffectsIndependently } from "./independent-verification";
import { resolveOperativeDefinitionEvidence } from "./operative-state";
import type { AmendmentEffectCandidate, AmendmentPipelineSummary, AmendmentTarget } from "./types";

/**
 * Maps the generic agreement-name labels markup-exhibit.ts's own nearest-
 * preceding-mention scan can find in an amendment's body text to the real
 * DocumentType/identity evidence a resolved target document actually
 * carries - a general leveraged-finance naming-convention table, not a
 * CONMED-specific one (every label here is a generic agreement-type name,
 * never a party/company/deal name).
 */
function labelMatchesTarget(label: string, classificationType: string | undefined, agreementTypeLabel: string | null | undefined): boolean {
  const normalizedLabel = label.toLowerCase().replace(/[^a-z]+/g, " ").trim();
  if (agreementTypeLabel) {
    const normalizedIdentity = agreementTypeLabel.toLowerCase().replace(/[^a-z]+/g, " ").trim();
    if (normalizedIdentity === normalizedLabel || normalizedIdentity.includes(normalizedLabel) || normalizedLabel.includes(normalizedIdentity)) return true;
  }
  if (!classificationType) return false;
  if ((normalizedLabel.includes("guarantee") || normalizedLabel.includes("guaranty") || normalizedLabel.includes("collateral") || normalizedLabel.includes("security")) && classificationType === "GUARANTEE_AND_SECURITY_AGREEMENT") return true;
  if (normalizedLabel.includes("credit agreement") && (classificationType === "CREDIT_AGREEMENT" || classificationType === "AMENDED_AND_RESTATED_AGREEMENT")) return true;
  if (normalizedLabel.includes("indenture") && classificationType === "INDENTURE") return true;
  if (normalizedLabel.includes("intercreditor") && classificationType === "INTERCREDITOR_AGREEMENT") return true;
  return false;
}

export const AMENDMENT_PIPELINE_VERSION = `phase-2g-amendment-pipeline.v1+${AMENDMENT_INTERPRETATION_PROMPT_VERSION}`;

const AMENDMENT_SHAPED_TYPES = new Set(["AMENDMENT", "AMENDED_AND_RESTATED_AGREEMENT", "SUPPLEMENTAL_INDENTURE", "JOINDER"]);
/** Operations deterministic parsing could not classify precisely - exactly the case task §8 scopes AI interpretation to ("can identify the relevant source region and target but cannot reliably classify the legal transformation"). */
const AMBIGUOUS_OPERATIONS = new Set(["MODIFY_PROVISION", "UNKNOWN_CHANGE"]);

export interface AmendmentPipelineInput {
  documents: PackageDocumentInput[];
  packageGraph: PackageGraphResult;
  index: StructuralIndex;
}

/** Task §35 - counts how many semantic calls WOULD be made, before any are, so a caller can estimate cost first. Pure, zero-cost. */
export function countAmbiguousEffectsNeedingInterpretation(input: AmendmentPipelineInput): number {
  return runDeterministicPass(input).filter((e) => AMBIGUOUS_OPERATIONS.has(e.operation) && e.target.targetSectionRef !== null && e.status !== "UNRESOLVED").length;
}

function instrumentKeyForDocument(packageGraph: PackageGraphResult, documentId: string | null): string | null {
  if (!documentId) return null;
  const instrument = packageGraph.instruments.find((i) => i.documentIds.includes(documentId));
  if (instrument) return instrument.instrumentKey;
  // A resolved target document with no instrument grouping (e.g. a
  // cross-cutting composite guarantee/security document, correctly
  // excluded from instrument grouping per Phase 2F.3) is still a valid,
  // real amendment target - it is its own single-document "instrument"
  // for operative-state purposes, never dropped for lack of a group.
  return `instrument:${documentId}`;
}

function runDeterministicPass(input: AmendmentPipelineInput): AmendmentEffectCandidate[] {
  const { documents, packageGraph } = input;
  const classById = new Map(packageGraph.classifications.map((c) => [c.documentId, c] as const));
  const identityById = new Map(packageGraph.identities.map((i) => [i.documentId, i] as const));
  const results: AmendmentEffectCandidate[] = [];

  for (const doc of documents) {
    const classification = classById.get(doc.documentId);
    if (!classification || !AMENDMENT_SHAPED_TYPES.has(classification.type)) continue;

    const isFullRestatement = classification.type === "AMENDED_AND_RESTATED_AGREEMENT";
    const restatesEdge = isFullRestatement ? packageGraph.relationshipCandidates.find((r) => r.sourceDocumentId === doc.documentId && r.relationshipType === "RESTATES") : undefined;

    // §17 - every document this amendment RESOLVED an AMENDS/GUARANTEES/SECURES-etc edge to (multi-target amendments, task §11, produce more than one) - the real candidate set section-existence disambiguation checks against.
    const resolvedTargetDocumentIds = [...new Set(packageGraph.relationshipCandidates.filter((r) => r.sourceDocumentId === doc.documentId && r.status === "RESOLVED" && r.targetDocumentId).map((r) => r.targetDocumentId as string))];

    const effects = parseDeterministicAmendmentEffects({
      amendmentDocumentId: doc.documentId,
      amendmentText: doc.text,
      amendmentLabel: doc.label,
      isFullRestatement,
      restatementTargetDocumentId: restatesEdge?.targetDocumentId ?? null,
      restatementTargetInstrumentKey: restatesEdge?.targetDocumentId ? instrumentKeyForDocument(packageGraph, restatesEdge.targetDocumentId) : null,
      modificationCandidates: packageGraph.modificationCandidates,
      resolveEffectiveDate: () => resolveEffectiveDate({ amendmentText: doc.text, executionDate: identityById.get(doc.documentId)?.executionDate ?? null }),
      instrumentKeyForDocument: (targetDocId) => instrumentKeyForDocument(packageGraph, targetDocId),
      disambiguateMultiTargetSection:
        resolvedTargetDocumentIds.length > 1
          ? (sectionRef, definedTermRef) => {
              const matches = resolvedTargetDocumentIds.filter((targetDocId) => {
                // Phase 3F.1.2: existence-only check (which document has this
                // section at all), not identity resolution - findNodesByRef's
                // count is used rather than the deprecated singleton
                // getNodeByRef, since an ambiguous (multi-occurrence) match is
                // still real evidence the section exists in this document.
                if (sectionRef) return input.index.findNodesByRef(targetDocId, sectionRef).length > 0;
                if (definedTermRef) return !!input.index.getDefinitionFullText(definedTermRef, targetDocId);
                return false;
              });
              if (matches.length !== 1) return null;
              return { targetDocumentId: matches[0]!, targetInstrumentKey: instrumentKeyForDocument(packageGraph, matches[0]!) };
            }
          : undefined,
    });
    results.push(...effects);

    // §1/§17 - "marked/conformed exhibit" whole-document amendments (real,
    // generalized industry convention - see markup-exhibit.ts's own header)
    // are a SEPARATE detection pass from the section/definition-level
    // patterns above, since they carry no section/definition ref at all -
    // only a resolved DOCUMENT-level target, found the same way multi-
    // target section disambiguation is: checking each of the amendment's
    // own already-RESOLVED relationship targets' real classification/
    // identity evidence against the nearest-preceding agreement-name
    // mention, never a guess.
    const resolutionCandidates: (MarkupExhibitResolutionCandidate & ScheduleModificationResolutionCandidate)[] = resolvedTargetDocumentIds.map((targetDocId) => ({
      documentId: targetDocId,
      matchesLabel: (label: string) => labelMatchesTarget(label, classById.get(targetDocId)?.type, identityById.get(targetDocId)?.agreementTypeLabel),
    }));
    const withResolvedInstrument = (effects: ReturnType<typeof detectMarkupExhibitEffects>) =>
      effects.map((effect) => (effect.target.targetDocumentId ? { ...effect, target: { ...effect.target, targetInstrumentKey: instrumentKeyForDocument(packageGraph, effect.target.targetDocumentId) } } : effect));
    const wholeDocumentEffectiveDate = resolveEffectiveDate({ amendmentText: doc.text, executionDate: identityById.get(doc.documentId)?.executionDate ?? null });
    results.push(
      ...withResolvedInstrument(
        detectMarkupExhibitEffects({ amendmentDocumentId: doc.documentId, amendmentText: doc.text, amendmentLabel: doc.label, effectiveDate: wholeDocumentEffectiveDate, resolvedTargets: resolutionCandidates })
      )
    );
    results.push(
      ...withResolvedInstrument(
        detectScheduleModificationEffects({ amendmentDocumentId: doc.documentId, amendmentText: doc.text, amendmentLabel: doc.label, effectiveDate: wholeDocumentEffectiveDate, resolvedTargets: resolutionCandidates })
      )
    );
  }

  return results;
}

function getTargetCurrentText(index: StructuralIndex, target: AmendmentTarget): string | null {
  if (!target.targetDocumentId) return null;
  if (target.targetSectionRef) {
    // Phase 3F.1.2: an ambiguous target (multiple physical occurrences share
    // this legal reference) has no single "current text" to report - never
    // silently pick one; treat it the same as not-found.
    const resolution = index.resolveUniqueNodeByRef(target.targetDocumentId, target.targetSectionRef);
    return resolution.status === "UNIQUE" ? index.getNodeText(resolution.node.nodeId, "DESCENDANTS") : null;
  }
  if (target.targetDefinedTermRef) {
    // Phase 3F.1.5.R (sub-task 1, P0-2 family): this used to fall back to
    // `getDefinitionFullText(term)` with no documentId whenever the
    // already-resolved target document had no matching definition,
    // searching the whole index (every instrument/company) and feeding
    // whatever it found to the model as this amendment's own
    // "targetCurrentText" context - the same cross-document contamination
    // class as P0-2. `target.targetDocumentId` here is already a real,
    // specifically-resolved target (see runDeterministicPass's own
    // resolvedTargetDocumentIds/disambiguateMultiTargetSection above), so a
    // miss within it is a genuine NOT_FOUND, never a reason to widen scope.
    //
    // Phase 3F.1.6.RX-FINAL Workstream B (FINDING-2/3 audit of OTHER
    // definition-access paths with the same gap) - this call used to be
    // `index.getDefinitionFullText(target.targetDefinedTermRef,
    // target.targetDocumentId)` directly, which silently returns the FIRST
    // match (`.find()`) whenever `target.targetDocumentId` genuinely has
    // 2+ colliding physical definitions of the same term - the exact same
    // silent-guess-among-ambiguous-candidates gap fixed in
    // semantic/tools.ts's getDefinition, here feeding
    // interpretAmendmentClause's own real LLM call with a possibly-WRONG
    // definition's text as this amendment's authoritative "current text,"
    // never disclosed as a guess. Fixed the same way, with the SAME
    // primitive (never a second, parallel check): resolveUniqueDefinitionByRef
    // resolves the collision explicitly; an AMBIGUOUS result returns null
    // here (this function's own existing, established "no confident current
    // text" contract - the SECTION branch above already does the identical
    // thing for a colliding section reference via resolveUniqueNodeByRef),
    // never guessed. `target.targetDefinedTermRef` is unaffected when the
    // term is genuinely unique or genuinely absent (NOT_FOUND) in this
    // already-resolved target document.
    //
    // Phase 3F.1.6-terminal Part A (OPEN-2) - now routed through the same
    // canonical resolveOperativeDefinitionEvidence primitive semantic/
    // tools.ts's getDefinition uses, rather than a second, hand-rolled
    // resolveUniqueDefinitionByRef+getDefinitionFullText pair maintained in
    // parallel here - one temporal/definition-access discipline, not two.
    // No OperativeContractState exists yet at this pipeline stage (this
    // function runs WHILE amendment effects are still being discovered, in
    // order to feed one specific effect's own semantic interpretation -
    // operative state is computed only afterward, from the full effect
    // list this function is itself helping produce), so `operativeState:
    // null` is passed deliberately, never a chicken-and-egg workaround:
    // resolveOperativeDefinitionEvidence's own Branch 2 (base-document
    // fallback, AMBIGUOUS/UNIQUE/NOT_FOUND) is exactly, and only, what this
    // call site needs and previously implemented by hand. Behavior for
    // AMBIGUOUS/NOT_FOUND is unchanged (both yield null here, as before);
    // a UNIQUE match now also earns definition-supersession awareness (see
    // resolveOperativeDefinitionEvidence's own header) automatically,
    // though no NodeSupersessionIndex exists at this stage either, so this
    // call site is unaffected in practice today - it will benefit for free
    // if a future caller here ever gains one.
    const resolution = resolveOperativeDefinitionEvidence({ index, operativeState: null, term: target.targetDefinedTermRef, searchDocumentIds: [target.targetDocumentId] });
    return resolution.outcome === "FOUND" ? resolution.text : null;
  }
  return null;
}

export interface AmendmentPipelineResult {
  effects: AmendmentEffectCandidate[];
  unattachedEffects: AmendmentEffectCandidate[];
  totalConflictsAcrossPackage: number;
  summary: AmendmentPipelineSummary;
}

export async function runAmendmentPipeline(caller: StageCaller, input: AmendmentPipelineInput): Promise<AmendmentPipelineResult> {
  const start = performance.now();
  const deterministicEffects = runDeterministicPass(input);

  let semanticCallsMade = 0;
  let semanticEffectsFound = 0;
  let semanticEffectsRejectedByValidation = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  const finalEffects: AmendmentEffectCandidate[] = [];
  for (const effect of deterministicEffects) {
    const needsInterpretation = AMBIGUOUS_OPERATIONS.has(effect.operation) && (effect.target.targetSectionRef !== null || effect.target.targetDefinedTermRef !== null) && effect.status !== "UNRESOLVED";
    if (!needsInterpretation) {
      finalEffects.push(effect);
      continue;
    }

    const targetCurrentText = getTargetCurrentText(input.index, effect.target);
    const interpretation = await interpretAmendmentClause(caller, {
      amendmentDocumentId: effect.amendmentDocumentId,
      amendmentClauseText: effect.sourceExcerpt,
      target: effect.target,
      targetCurrentText,
      effectiveDate: effect.effectiveDate,
      sourceCitation: effect.sourceCitation,
    });
    semanticCallsMade++;
    const telemetry = caller.lastTelemetry();
    inputTokens += telemetry?.inputTokens ?? 0;
    outputTokens += telemetry?.outputTokens ?? 0;
    semanticEffectsFound++;

    const validated = validateSemanticAmendmentCandidate({ candidate: interpretation.candidate, amendmentClauseText: effect.sourceExcerpt });
    if (validated.resolutionMethod === "SEMANTIC_INTERPRETATION_REJECTED") semanticEffectsRejectedByValidation++;
    finalEffects.push(validated);
  }

  // Phase 3F.1.4 §6C - independent verification, wired in as a REAL gate
  // (the audit's own P0 finding: this function previously had zero real
  // callers outside one-off diagnostic scripts). Re-derives target
  // resolution directly against the structural index, deliberately never
  // sharing operative-state.ts's own buildProvisionView code path
  // (Architecture Invariant #17 - "the system that proposes and the
  // system that checks must not be the same pass"), so a RESOLVED effect
  // this SEPARATE check cannot itself confirm is downgraded to
  // REVIEW_REQUIRED before it ever reaches operative-state.ts's own
  // target-resolution consumption - real defense-in-depth against a
  // FUTURE regression there, not merely a second copy of the same fix.
  // Retained even after buildProvisionView's own P0 fix (this phase) per
  // the task's own explicit "err toward wiring it in" guidance: it is the
  // only check in the live pipeline that re-derives target resolution
  // from the raw index rather than consuming operative-state.ts's own
  // computation of it, so it remains meaningfully independent under
  // Architecture Invariant #17 despite still sharing Phase 2A's
  // structural-index substrate with it (Invariant #18's own disclosed
  // caveat - real but bounded independence, not full isolation).
  const verificationFindings = verifyAmendmentEffectsIndependently(finalEffects, input.documents, input.index);
  const findingByEffectId = new Map(verificationFindings.map((f) => [f.effectId, f] as const));
  const gatedEffects = finalEffects.map((effect) => {
    const finding = findingByEffectId.get(effect.effectId);
    if (!finding || finding.passed || effect.status !== "RESOLVED") return effect;
    return { ...effect, status: "REVIEW_REQUIRED" as const, unresolvedReason: `Independent verification failed: ${finding.issues.join(" ")}` };
  });

  const { unattachedEffects } = groupEffectsByProvision(gatedEffects);
  const { groups } = groupEffectsByProvision(gatedEffects);
  const totalConflictsAcrossPackage = groups.reduce((n, g) => n + buildProvisionChain(g).conflicts.length, 0);

  return {
    effects: gatedEffects,
    unattachedEffects,
    totalConflictsAcrossPackage,
    summary: {
      documentsProcessed: input.documents.length,
      deterministicEffectsFound: deterministicEffects.length,
      semanticCallsMade,
      semanticEffectsFound,
      semanticEffectsRejectedByValidation,
      conflictsDetected: totalConflictsAcrossPackage,
      wallClockMs: performance.now() - start,
      inputTokens,
      outputTokens,
    },
  };
}
