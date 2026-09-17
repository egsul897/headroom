/**
 * Phase 2G §19/§20/§21/§23 - operative contract state computation. Pure
 * function of (base document's real structural/definitional evidence,
 * every AmendmentEffectCandidate targeting this instrument, an analysis
 * date) - never persists rendered text when it can be derived (task
 * §19), and always carries an explicit sufficiency status a future
 * consumer must check (task §23) rather than an implicit "this is
 * correct."
 *
 * Scope decision (disclosed, not silently incomplete): this V1 produces
 * an OperativeProvisionView only for provisions that have at least one
 * real recorded amendment effect - a section/definition never amended
 * has no special operative-state representation to add beyond "the base
 * document's own text governs," which Phase 2A's structural index
 * already answers directly. This keeps the output tractable and
 * meaningful (every real amendment touch is representable) without
 * enumerating hundreds of untouched base-document sections that carry no
 * amendment history at all.
 *
 * Phase 3F.1.4 Workstream D - CENTRAL FIX (the audit's single most severe
 * finding, P0-1/§M/§N of docs/phase-3f1-3-foundation-assurance-audit.md):
 * `buildProvisionView` previously set `currentText = effect.newText`
 * UNCONDITIONALLY whenever an applied effect carried captured replacement
 * text, without ever checking whether this provision's own base
 * reference (`group.ref`, the exact same SECTION legal reference or
 * DEFINITION term every effect in this group targets) actually resolved
 * to a UNIQUE physical node/definition in the base document.
 * `resolveUniqueNodeByRef`/the new `resolveUniqueDefinitionByRef` below
 * already return an honest UNIQUE/AMBIGUOUS/NOT_FOUND status - the
 * defect was this module discarding that honesty the moment `newText`
 * was present. Fixed by making `targetResolutionStatus` (derived once
 * per provision group, independent of any effect's own newText) the
 * SOLE gate on whether `currentText` may ever be populated: "we know
 * what the amendment says" (newText, preserved separately as
 * `attemptedText`) is never conflated with "we know exactly what
 * operative provision it changes" (`targetResolutionStatus === "UNIQUE"`).
 */
import type { StructuralIndex } from "../structural-index";
import type { DetectedDefinition } from "../structural-definitions";
import { groupEffectsByProvision, buildProvisionChain, computeOperativeDocument, normalizeDefinedTermRef, type ProvisionGroup } from "./chain";
import type { AmendmentEffectCandidate, NodeSupersessionIndex, NodeSupersessionRecord, NodeSupersessionResult, NodeSupersessionStatus, OperativeContractState, OperativeProvisionView, OperativeStateStatus, ProvisionStructuralHealthStatus, ProvisionTargetResolutionStatus } from "./types";

/**
 * Phase 3F.1.5.R (sub-task 3) - the fail-closed composition point named by
 * docs/foundation-remediation/13-remaining-foundation-risks.json's
 * "operativeStateHealthDiagnosticsGap": OPERATIVE_CONFIDENCE now requires
 * STRUCTURAL_HEALTH_SUFFICIENT, checked against the structural index's own
 * `healthDiagnostics()` (I1-I16) for the exact physical occurrence a
 * provision's base reference resolved to, plus every structural descendant
 * of it (a SECTION's own reported text is `getNodeText(nodeId,
 * "DESCENDANTS")` below - a corrupted descendant corrupts that text just as
 * surely as a corrupted node itself). Only `severity: "ERROR"` findings ever
 * gate anything here, exactly like every other consumer of this API - an
 * `"INFO"` finding (AMBIGUOUS_LEGAL_REFERENCE, DUPLICATE_LABEL_EXPECTED,
 * DUPLICATE_NORMALIZED_PATH, SECTION_NUMBER_SEQUENCE_ANOMALY) is a normal,
 * expected drafting reality per structural-index.ts's own header comment,
 * never a reason to withhold confidence.
 *
 * Deliberately independent of resolveUniqueNodeByRef/
 * resolveUniqueDefinitionByRef's own UNIQUE/AMBIGUOUS/NOT_FOUND axis: a
 * reference can be genuinely UNIQUE (exactly one physical occurrence
 * carries this legal reference) while that SAME occurrence is
 * independently known-corrupted at the structural layer - the exact
 * emergent, compound risk tests/foundation-audit/combined-failures.test.ts's
 * first describe block reproduces.
 */
function structuralHealthForNode(index: StructuralIndex, nodeId: string): { status: ProvisionStructuralHealthStatus; issues: string[] } {
  const relevantNodeIds = new Set<string>([nodeId, ...index.getDescendants(nodeId).map((d) => d.nodeId)]);
  const errors = index.healthDiagnostics().filter((f) => f.severity === "ERROR" && f.nodeId !== undefined && relevantNodeIds.has(f.nodeId));
  if (errors.length === 0) return { status: "STRUCTURAL_HEALTH_SUFFICIENT", issues: [] };
  return {
    status: "STRUCTURAL_HEALTH_UNSAFE",
    issues: errors.map((e) => `Structural index health check flags this provision's own resolved physical occurrence${e.nodeId === nodeId ? "" : " (or a structural descendant of it)"} as ${e.code}: ${e.message}`),
  };
}

const STRUCTURAL_HEALTH_SUFFICIENT_VACUOUS = { structuralHealthStatus: "STRUCTURAL_HEALTH_SUFFICIENT" as const, structuralHealthIssues: [] as string[] };

export interface OperativeStateInput {
  instrumentKey: string;
  baseDocumentId: string;
  asOfDate: string;
  index: StructuralIndex;
  /** Every amendment effect discovered anywhere in the package - filtered internally to this instrument's own provisions. */
  allEffects: AmendmentEffectCandidate[];
  /**
   * Phase 3F.1 §29-32/F3 - effects whose target could not be resolved to a
   * specific (instrument, section/definition) - e.g. target.kind is
   * "DOCUMENT" (a full restatement whose own target document is itself
   * ambiguous among multiple same-typed candidates), or targetInstrumentKey
   * is null - but which the CALLER has independently determined (from real
   * package/document topology - Phase 2C's package graph, never guessed
   * inside this function) genuinely belong to this instrument's own
   * document family. Never inferred here: attributing an effect to an
   * instrument it does not actually belong to would violate instrument
   * isolation (Architecture Invariants #20), so this is the caller's
   * affirmative, evidence-based assertion, not a default. Omit (or pass an
   * empty array) when the caller has no such knowledge - the function then
   * behaves exactly as before for the RESOLVED-with-zero-provisions case,
   * which remains honest whenever no unresolved activity is known at all.
   */
  unresolvedTargetEffectsForThisInstrument?: AmendmentEffectCandidate[];
}

/**
 * Phase 3F.1.4 §6A - a definition-target counterpart to
 * `StructuralIndex.resolveUniqueNodeByRef`, since the index itself
 * exposes no ambiguity-aware definition lookup (`getDefinition`'s own
 * `.find()` silently returns the FIRST match on a collision). Built
 * entirely from the index's already-public `allDefinitions()` surface -
 * deliberately independent of, and never gated behind, the
 * `index.getDefinition(...)` calls in `resolveBaseText` below (one of
 * which - the cross-document fallback on the line immediately following
 * this comment's own sibling call - is a separate, narrowly-scoped fix
 * owned by another workstream and intentionally left untouched here).
 * Scoped strictly to one documentId, exactly like resolveUniqueNodeByRef,
 * so a same-named definition living in a genuinely different document
 * never counts toward this document's own ambiguity/uniqueness verdict.
 *
 * Phase 3F.1.6.RX-FINAL Workstream B (FINDING-2/FINDING-3) - exported (was
 * module-private) so semantic/tools.ts's getDefinition can reuse this SAME
 * primitive for its own no-recorded-amendment fallback path, rather than
 * inventing a second, parallel "is this term ambiguous" check. This is the
 * definition-side counterpart to `StructuralIndex.resolveUniqueNodeByRef`,
 * which getOperativeProvision (semantic/tools.ts) already calls directly
 * for the SECTION case - getDefinition previously had no equivalent at all
 * for a term with 2+ colliding, never-amended physical definitions in the
 * same document (`index.getDefinition`'s own `.find()` silently returns
 * the first match on such a collision - see this function's own header
 * comment above).
 */
export type DefinitionResolution = { status: "UNIQUE"; definition: DetectedDefinition } | { status: "AMBIGUOUS"; candidates: DetectedDefinition[] } | { status: "NOT_FOUND" };

export function resolveUniqueDefinitionByRef(index: StructuralIndex, documentId: string, term: string): DefinitionResolution {
  const normalized = normalizeDefinedTermRef(term);
  const matches = index.allDefinitions().filter((d) => d.documentId === documentId && d.normalizedTerm === normalized);
  if (matches.length === 0) return { status: "NOT_FOUND" };
  if (matches.length === 1) return { status: "UNIQUE", definition: matches[0]! };
  return { status: "AMBIGUOUS", candidates: matches };
}

interface BaseTextResolution {
  text: string | null;
  nodeKey: string | null;
  nodeId: string | null;
  /** Phase 3F.1.4 §6A - the real, independently-derived resolution status of THIS provision's own base reference. The one field `buildProvisionView` must consult before ever trusting an applied effect's own newText as a confident answer. */
  targetResolutionStatus: ProvisionTargetResolutionStatus;
  /** Populated only when targetResolutionStatus !== "UNIQUE" - names AMBIGUOUS vs NOT_FOUND explicitly (task's own disclosure-quality fix: a reviewer must be told WHY, not just THAT something is unresolved). */
  targetResolutionReason: string | null;
  /** Real physical occurrence/definition identities the base reference matched when AMBIGUOUS (2+ genuinely distinct candidates) - never a guessed pick among them. Always empty for UNIQUE/NOT_FOUND. */
  candidateSourceNodeIds: string[];
  /** Phase 3F.1.5.R (sub-task 3) - see structuralHealthForNode's own header comment. STRUCTURAL_HEALTH_SUFFICIENT (vacuously) whenever targetResolutionStatus !== "UNIQUE", since no physical occurrence was resolved to check. */
  structuralHealthStatus: ProvisionStructuralHealthStatus;
  /** Populated only when structuralHealthStatus is STRUCTURAL_HEALTH_UNSAFE. */
  structuralHealthIssues: string[];
}

function resolveBaseText(group: ProvisionGroup, baseDocumentId: string, index: StructuralIndex): BaseTextResolution {
  if (group.kind === "SECTION") {
    // Phase 3F.1.2: resolveUniqueNodeByRef, not the deprecated getNodeByRef
    // wrapper, so an ambiguous section reference here is explicit (falls
    // through to null/not-found) rather than silently resolving to an
    // arbitrary same-labeled physical occurrence for operative-state
    // purposes - a materially worse failure mode than a plain miss, since
    // operative state is treated as authoritative downstream.
    const resolution = index.resolveUniqueNodeByRef(baseDocumentId, group.ref);
    if (resolution.status === "UNIQUE") {
      const node = resolution.node;
      // Phase 3F.1.5.R (sub-task 3) - a UNIQUE legal-reference match is
      // NECESSARY but no longer SUFFICIENT for a confidently-attached
      // text/status: the resolved physical occurrence itself (and every
      // structural descendant getNodeText("DESCENDANTS") below would pull
      // text from) must also clear the structural index's own health
      // diagnostics. text is withheld (never derived from a node the index
      // itself already flags as corrupted) whenever it is not.
      const health = structuralHealthForNode(index, node.nodeId);
      if (health.status === "STRUCTURAL_HEALTH_UNSAFE") {
        return { text: null, nodeKey: node.nodeKey, nodeId: node.nodeId, targetResolutionStatus: "UNIQUE", targetResolutionReason: null, candidateSourceNodeIds: [], structuralHealthStatus: health.status, structuralHealthIssues: health.issues };
      }
      return { text: index.getNodeText(node.nodeId, "DESCENDANTS"), nodeKey: node.nodeKey, nodeId: node.nodeId, targetResolutionStatus: "UNIQUE", targetResolutionReason: null, candidateSourceNodeIds: [], ...STRUCTURAL_HEALTH_SUFFICIENT_VACUOUS };
    }
    if (resolution.status === "AMBIGUOUS") {
      return {
        text: null,
        nodeKey: null,
        nodeId: null,
        targetResolutionStatus: "AMBIGUOUS",
        targetResolutionReason: `${resolution.candidates.length} distinct physical occurrences in the base document share the legal reference "${group.ref}" - the amendment's own target cannot be attached to a single provision without guessing which one governs.`,
        candidateSourceNodeIds: resolution.candidates.map((c) => c.nodeId),
        ...STRUCTURAL_HEALTH_SUFFICIENT_VACUOUS,
      };
    }
    return {
      text: null,
      nodeKey: null,
      nodeId: null,
      targetResolutionStatus: "NOT_FOUND",
      targetResolutionReason: `No section matching legal reference "${group.ref}" was found in the base document's own structural index.`,
      candidateSourceNodeIds: [],
      ...STRUCTURAL_HEALTH_SUFFICIENT_VACUOUS,
    };
  }
  // DEFINITION branch. Phase 3F.1.4 §6A: targetResolutionStatus is derived
  // from resolveUniqueDefinitionByRef's own document-scoped, independent
  // check - NEVER inferred from whether `def` below resolved to a
  // non-null value, exactly the same discipline the SECTION branch above
  // already applies via resolveUniqueNodeByRef's own status.
  //
  // Phase 3F.1.4 (P0-2 remediation, Workstream B, docs/foundation-assurance/
  // 12-fault-injection-results.json "cross-document definition leakage"):
  // `def` below no longer falls back to a documentId-less
  // `index.getDefinition(group.ref)` lookup - that fallback used to
  // silently match an unrelated document's own same-named definition
  // whenever the base document genuinely lacked one, proven by
  // tests/foundation-audit/combined-failures.test.ts's own "missing
  // definition... resolveBaseText silently falls back" case. `def` is now
  // scoped to baseDocumentId ONLY, mirroring the SECTION branch above
  // (resolveUniqueNodeByRef never falls back to an arbitrary/cross-document
  // match either). This is on top of, not instead of, the independent
  // docScoped uniqueness check immediately below - `def` is trusted for
  // TEXT EXTRACTION only, never as evidence of uniqueness on its own.
  const docScoped = resolveUniqueDefinitionByRef(index, baseDocumentId, group.ref);
  const def = index.getDefinition(group.ref, baseDocumentId);
  if (docScoped.status === "AMBIGUOUS") {
    return {
      text: null,
      nodeKey: null,
      nodeId: null,
      targetResolutionStatus: "AMBIGUOUS",
      targetResolutionReason: `${docScoped.candidates.length} distinct definitions of "${group.ref}" exist in the base document - the amendment's own target cannot be attached to a single provision without guessing which one governs.`,
      candidateSourceNodeIds: docScoped.candidates.map((d) => d.sourceNodeId).filter((id): id is string => id !== null),
      ...STRUCTURAL_HEALTH_SUFFICIENT_VACUOUS,
    };
  }
  if (docScoped.status === "NOT_FOUND") {
    // Phase 3F.1.4 §6A: a defined term genuinely absent from the base
    // document is the EXPECTED, correct state for a term this SAME
    // provision group's own amendment chain introduces for the first
    // time (ADD_DEFINITION) - never an error to flag as ambiguous/missing
    // evidence. Any other operation (REPLACE/MODIFY/DELETE_DEFINITION)
    // targeting a term genuinely absent from the base document is a real,
    // disclosable NOT_FOUND, exactly like the SECTION branch's own miss.
    const isAmendmentOriginatedTerm = group.effects.some((e) => e.operation === "ADD_DEFINITION");
    if (isAmendmentOriginatedTerm) {
      return { text: null, nodeKey: null, nodeId: null, targetResolutionStatus: "UNIQUE", targetResolutionReason: null, candidateSourceNodeIds: [], ...STRUCTURAL_HEALTH_SUFFICIENT_VACUOUS };
    }
    return {
      text: null,
      nodeKey: null,
      nodeId: null,
      targetResolutionStatus: "NOT_FOUND",
      targetResolutionReason: `No definition matching "${group.ref}" was found in the base document's own definitions.`,
      candidateSourceNodeIds: [],
      ...STRUCTURAL_HEALTH_SUFFICIENT_VACUOUS,
    };
  }
  // docScoped.status === "UNIQUE": the independent check confirms exactly
  // one real definition of this term in this document, so `def` (however
  // it was actually resolved above) is trusted for TEXT EXTRACTION only.
  if (!def) return { text: null, nodeKey: null, nodeId: null, targetResolutionStatus: "NOT_FOUND", targetResolutionReason: `No definition matching "${group.ref}" was found in the base document's own definitions.`, candidateSourceNodeIds: [], ...STRUCTURAL_HEALTH_SUFFICIENT_VACUOUS };
  // Phase 3F.1.5.R (sub-task 3) - same fail-closed composition as the
  // SECTION branch above: a UNIQUE definition match whose own declaring
  // physical occurrence (def.sourceNodeId) is independently flagged
  // corrupted by the structural index must not support a confidently-
  // attached definition text either. A definition with no recorded
  // sourceNodeId at all (the LLM DEFINITIONS-stage candidate path, which
  // never anchors one - see persistDefinedTerms' own header) has no
  // physical occurrence to check, so health is vacuously SUFFICIENT for it,
  // exactly like an AMBIGUOUS/NOT_FOUND verdict above.
  if (def.sourceNodeId) {
    const health = structuralHealthForNode(index, def.sourceNodeId);
    if (health.status === "STRUCTURAL_HEALTH_UNSAFE") {
      return { text: null, nodeKey: def.sourceNodeKey, nodeId: def.sourceNodeId, targetResolutionStatus: "UNIQUE", targetResolutionReason: null, candidateSourceNodeIds: [], structuralHealthStatus: health.status, structuralHealthIssues: health.issues };
    }
  }
  return { text: index.getDefinitionFullText(def.exactTerm, def.documentId) ?? null, nodeKey: def.sourceNodeKey, nodeId: def.sourceNodeId, targetResolutionStatus: "UNIQUE", targetResolutionReason: null, candidateSourceNodeIds: [], ...STRUCTURAL_HEALTH_SUFFICIENT_VACUOUS };
}

const DELETE_OPERATIONS = new Set(["DELETE_TEXT", "DELETE_DEFINITION", "REMOVE_COVENANT", "REMOVE_EXCEPTION"]);

function buildProvisionView(group: ProvisionGroup, baseDocumentId: string, asOfDate: string, index: StructuralIndex): OperativeProvisionView {
  const { fullChain, conflicts } = buildProvisionChain(group);
  const asOfMs = new Date(asOfDate).getTime();
  const appliedChain = fullChain.filter((e) => e.effectiveDate.date !== null && new Date(e.effectiveDate.date).getTime() <= asOfMs).map((e) => ({ ...e, appliedAsOfQuery: true }));

  const base = resolveBaseText(group, baseDocumentId, index);
  let currentText = base.text;
  let currentSourceDocumentId = baseDocumentId;
  let currentSourceNodeKey = base.nodeKey;
  let currentSourceNodeId = base.nodeId;
  const supersededSourceNodeKeys: string[] = [];
  const supersededSourceNodeIds: string[] = [];

  // Phase 3F.1.4 §6B - "here's what the amendment SAYS" (attemptedText)
  // is tracked separately from "here's what currently governs"
  // (currentText) precisely so useful amendment text is never discarded
  // merely because target attachment is unresolved.
  let attemptedText: string | null = null;
  let lastAppliedWasCleanDeletion = false;

  for (const applied of appliedChain) {
    const effect = group.effects.find((e) => e.effectId === applied.effectId)!;
    if (currentSourceNodeKey) supersededSourceNodeKeys.push(currentSourceNodeKey);
    if (currentSourceNodeId) supersededSourceNodeIds.push(currentSourceNodeId);
    if (DELETE_OPERATIONS.has(effect.operation)) {
      currentText = null;
      attemptedText = null;
      lastAppliedWasCleanDeletion = true;
    } else if (effect.newText) {
      currentText = effect.newText;
      attemptedText = effect.newText;
      lastAppliedWasCleanDeletion = false;
    } else {
      // Effect genuinely applies (real evidence, resolved target, real effective date) but did not supply capturable resulting text (e.g. a threshold change or a bare "is hereby amended" with no quoted replacement) - the FACT that this effect governs is known; the resulting TEXT is honestly not safely renderable, never fabricated.
      currentText = null;
      attemptedText = null;
      lastAppliedWasCleanDeletion = false;
    }
    currentSourceDocumentId = effect.amendmentDocumentId;
    currentSourceNodeKey = null;
    currentSourceNodeId = null;
  }

  const hasConflict = conflicts.some((c) => c.conflictType === "AMENDMENT_CONFLICT");
  const hasSequenceUnresolved = conflicts.some((c) => c.conflictType === "AMENDMENT_SEQUENCE_UNRESOLVED");
  const hasReviewOrUnresolvedEffect = group.effects.some((e) => e.status === "REVIEW_REQUIRED" || e.status === "UNRESOLVED");
  const targetUnresolved = base.targetResolutionStatus !== "UNIQUE";
  // Phase 3F.1.5.R (sub-task 3) - OPERATIVE_CONFIDENCE requires
  // STRUCTURAL_HEALTH_SUFFICIENT, not merely targetResolutionStatus ===
  // "UNIQUE". This is genuinely independent of targetUnresolved above: the
  // base reference can be a real, UNIQUE physical-occurrence match while
  // that SAME occurrence is separately flagged corrupted by the structural
  // index's own health diagnostics - see structuralHealthForNode's header
  // comment and tests/foundation-audit/combined-failures.test.ts's first
  // describe block for the exact compound scenario this closes.
  const structuralHealthUnsafe = base.structuralHealthStatus === "STRUCTURAL_HEALTH_UNSAFE";

  // Phase 3F.1.4 §6D - a genuinely CONFLICTED provision (same effective
  // date, same provision, different resulting text, no evidence-based
  // precedence rule) has NO single legitimate currentText - populating
  // one from whichever effect happens to be last in the (stably-sorted)
  // input array lets array-insertion order masquerade as legal
  // precedence (the audit's own re-confirmed P2 finding). candidateTexts
  // is sorted by effectId - NEVER by array/chain position - so the same
  // two real conflicting effects always produce the identical
  // candidateTexts value regardless of ingestion order.
  let candidateTexts: string[] = [];
  if (hasConflict) {
    const conflictedEffectIds = new Set(conflicts.filter((c) => c.conflictType === "AMENDMENT_CONFLICT").flatMap((c) => c.involvedEffectIds));
    candidateTexts = group.effects
      .filter((e) => conflictedEffectIds.has(e.effectId) && e.newText)
      .sort((a, b) => a.effectId.localeCompare(b.effectId))
      .map((e) => e.newText!);
    currentText = null;
    currentSourceNodeKey = null;
    currentSourceNodeId = null;
  } else if (targetUnresolved || structuralHealthUnsafe) {
    // Phase 3F.1.4 §6A (CENTRAL FINDING FIX) - never let the mere
    // presence of newText on an applied effect substitute for actually
    // knowing WHERE it applies. This is the exact line the P0 finding's
    // fix lives on: the OLD code set currentText = effect.newText purely
    // inside the loop above with no gate at all; the loop above now only
    // ever produces a value that is meaningful when the target resolved,
    // and this branch withholds it whenever it did not - regardless of
    // how confident-looking the captured newText is, and regardless of
    // whether any effect has even applied yet as of this query date (the
    // combined-failure "ambiguous target + not-yet-effective amendment"
    // finding: honesty about the base reference itself must never depend
    // on appliedChain being non-empty).
    //
    // Phase 3F.1.5.R (sub-task 3) - `structuralHealthUnsafe` withholds
    // currentText for exactly the same reason even when targetUnresolved is
    // false and an applied effect already overwrote currentText with its
    // own newText above: attaching that amendment's text to a physical
    // occurrence the structural index itself flags as corrupted (I1-I16
    // ERROR) is a confidence claim about WHERE the amendment applies that
    // the corrupted node cannot actually support, regardless of how
    // confident-looking the amendment's own captured text is. attemptedText
    // (set inside the loop above) is left untouched - "what the amendment
    // says" remains visible even when "where it safely applies" is not.
    currentText = null;
  }

  // Phase 3F.1.4 P3 - a well-evidenced deletion against a UNIQUELY
  // resolved target is a correct, INTENDED null-governance outcome, not a
  // derivation failure - it must never be conflated with "an effect
  // governs but its resulting text honestly could not be captured."
  const textMissingDespiteAppliedEffect = appliedChain.length > 0 && !hasConflict && !targetUnresolved && !structuralHealthUnsafe && currentText === null && !lastAppliedWasCleanDeletion;

  const unresolvedIssues: string[] = [];
  let status: OperativeStateStatus;
  if (hasConflict) {
    status = "OPERATIVE_STATE_CONFLICTED";
    unresolvedIssues.push(...conflicts.filter((c) => c.conflictType === "AMENDMENT_CONFLICT").map((c) => c.reason));
    unresolvedIssues.push("currentText is withheld for a genuinely conflicted provision (see candidateTexts for the real competing candidates) - no evidence-based precedence rule exists to prefer one over the other, and array/ingestion order is never treated as one.");
  } else if (hasSequenceUnresolved || hasReviewOrUnresolvedEffect) {
    status = "OPERATIVE_STATE_REVIEW_REQUIRED";
    unresolvedIssues.push(...conflicts.filter((c) => c.conflictType === "AMENDMENT_SEQUENCE_UNRESOLVED").map((c) => c.reason));
    unresolvedIssues.push(...group.effects.filter((e) => (e.status === "REVIEW_REQUIRED" || e.status === "UNRESOLVED") && e.unresolvedReason).map((e) => `${e.effectId}: ${e.unresolvedReason}`));
  } else if (targetUnresolved) {
    status = "OPERATIVE_STATE_PARTIAL";
    unresolvedIssues.push(
      `This provision's own target reference could not be confidently resolved in the base document (${base.targetResolutionStatus === "AMBIGUOUS" ? "ambiguous - multiple real candidates" : "not found"}): ${base.targetResolutionReason}`
    );
  } else if (structuralHealthUnsafe) {
    // Phase 3F.1.5.R (sub-task 3) - OPERATIVE_CONFIDENCE requires
    // STRUCTURAL_HEALTH_SUFFICIENT. This provision's base reference IS a
    // genuinely UNIQUE physical-occurrence match (targetUnresolved is
    // false here) - the uncertainty is not "which node" but "can this
    // node's own extraction be trusted at all," per the structural index's
    // own ERROR-severity health finding(s) below.
    status = "OPERATIVE_STATE_PARTIAL";
    unresolvedIssues.push(
      "OPERATIVE_CONFIDENCE requires STRUCTURAL_HEALTH_SUFFICIENT: this provision's own base reference resolved to a UNIQUE physical occurrence, but the structural index's own health diagnostics independently flag that occurrence (or a structural descendant of it) as corrupted - no confident operative text or status can be reported for it until the underlying structural extraction is corrected.",
      ...base.structuralHealthIssues
    );
  } else if (textMissingDespiteAppliedEffect) {
    status = "OPERATIVE_STATE_PARTIAL";
    unresolvedIssues.push("At least one real, resolved, dated amendment effect applies to this provision as of the analysis date, but its resulting text could not be safely derived from source evidence alone - the fact that it governs is known, its exact wording is not.");
  } else {
    status = "OPERATIVE_STATE_RESOLVED";
  }

  return {
    instrumentKey: group.instrumentKey,
    provisionKey: group.provisionKey,
    kind: group.kind,
    documentId: baseDocumentId,
    sectionRef: group.kind === "SECTION" ? group.ref : null,
    definedTermRef: group.kind === "DEFINITION" ? group.ref : null,
    asOfDate,
    currentSourceDocumentId,
    currentSourceNodeKey,
    currentSourceNodeId,
    currentText,
    fullChain,
    appliedChain,
    supersededSourceNodeKeys,
    supersededSourceNodeIds,
    status,
    unresolvedIssues,
    conflicts,
    targetResolutionStatus: base.targetResolutionStatus,
    targetResolutionReason: base.targetResolutionStatus === "UNIQUE" ? null : base.targetResolutionReason,
    candidateSourceNodeIds: base.candidateSourceNodeIds,
    structuralHealthStatus: base.structuralHealthStatus,
    structuralHealthIssues: base.structuralHealthIssues,
    attemptedText,
    reviewRequired: status !== "OPERATIVE_STATE_RESOLVED",
    candidateTexts,
  };
}

export function computeOperativeContractState(input: OperativeStateInput): OperativeContractState {
  const instrumentEffects = input.allEffects.filter((e) => e.target.targetInstrumentKey === input.instrumentKey);
  const { groups, unattachedEffects: unattachedFromResolved } = groupEffectsByProvision(instrumentEffects);

  const provisions = groups.map((g) => buildProvisionView(g, input.baseDocumentId, input.asOfDate, input.index));

  // Phase 3F.1 §29-32/F3 - the caller-asserted unresolved-target effects
  // combine with anything groupEffectsByProvision itself could not attach
  // (a resolved instrument but no resolvable section/definition ref) into
  // one honest "known but unattached" list. This is what prevents `status`
  // from defaulting to RESOLVED merely because `provisions` is empty - see
  // unattachedEffects on OperativeContractState for the full rationale.
  const unattachedEffects = [...unattachedFromResolved, ...(input.unresolvedTargetEffectsForThisInstrument ?? [])];

  const worstStatus = (statuses: OperativeStateStatus[]): OperativeStateStatus => {
    if (statuses.includes("OPERATIVE_STATE_CONFLICTED")) return "OPERATIVE_STATE_CONFLICTED";
    if (statuses.includes("OPERATIVE_STATE_REVIEW_REQUIRED")) return "OPERATIVE_STATE_REVIEW_REQUIRED";
    if (statuses.includes("OPERATIVE_STATE_PARTIAL")) return "OPERATIVE_STATE_PARTIAL";
    return "OPERATIVE_STATE_RESOLVED";
  };
  let status: OperativeStateStatus;
  if (provisions.length === 0) {
    // Genuinely nothing to report only when there is ALSO no known
    // unattached amendment activity for this instrument - a status
    // implying successful resolution must never coexist with real,
    // unresolved target ambiguity that prevented provisions from being
    // built at all (the exact DSGR first-blind F3 finding).
    status = unattachedEffects.length === 0 ? "OPERATIVE_STATE_RESOLVED" : "OPERATIVE_STATE_REVIEW_REQUIRED";
  } else {
    status = worstStatus(provisions.map((p) => p.status));
  }

  const byStatus: Record<string, number> = {};
  for (const p of provisions) byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
  const unattachedSummary = unattachedEffects.length > 0 ? ` ${unattachedEffects.length} additional effect(s) reference this instrument's amendment activity but could not be attached to any specific provision (unresolved target).` : "";
  const summary = `${provisions.length} amended provision(s) tracked for this instrument as of ${input.asOfDate}: ${Object.entries(byStatus).map(([k, v]) => `${v} ${k}`).join(", ") || "none"}.${unattachedSummary}`;

  // POST-3F.2 remediation (Unit B3) - additive: "which whole document is
  // operative" is a question the section/definition-scoped `provisions`
  // above structurally cannot answer (a full restatement's own effect is
  // DOCUMENT-kind and never attaches to a ProvisionGroup). Deliberately
  // uses input.allEffects (NOT the targetInstrumentKey-filtered
  // instrumentEffects above): a restatement effect's own target commonly
  // resolves to a DIFFERENT instrument key than its own amending
  // document's instrument (the predecessor's instrument, per instrument-
  // grouping.ts's RESOLVED-only merge criterion - a REVIEW_REQUIRED-level
  // chronological-predecessor resolution, by design, never merges two
  // documents into one instrument even when it correctly identifies the
  // relationship). allEffects is already correctly scoped to THIS
  // instrument's own document set at the call site (runAmendmentPipeline
  // is only ever given this instrument's own documents), so no additional
  // filtering is needed or correct here.
  const operativeDocument = computeOperativeDocument(input.baseDocumentId, input.allEffects, input.unresolvedTargetEffectsForThisInstrument ?? []);

  return { instrumentKey: input.instrumentKey, asOfDate: input.asOfDate, provisions, status, summary, unattachedEffects, operativeDocument };
}

export { normalizeDefinedTermRef };

/** Task §21 - getOperativeDefinition(term, instrument, asOfDate) equivalent. Returns null (not an error) when the term was never amended in this package - the base document's own definition (via index.getDefinition) remains the correct, unamended answer in that case. */
export function getOperativeDefinition(state: OperativeContractState, term: string): OperativeProvisionView | null {
  const normalized = normalizeDefinedTermRef(term);
  return state.provisions.find((p) => p.kind === "DEFINITION" && p.definedTermRef === normalized) ?? null;
}

// ---------------------------------------------------------------------------
// Phase 3F.1.5 Workstream B - P1-11 (Q8 supersession-awareness) fix.
// EVERYTHING BELOW THIS LINE IS NEW - added surgically as pure additions
// (no existing line above was changed) so this can merge cleanly alongside
// Workstream D's own work in this same file. See amendment/types.ts's own
// comment block (same phase/workstream tag) for the full design rationale.
//
// `buildNodeSupersessionIndex` generalizes the same nodeId-keyed lookup
// semantic-coverage/cross-reference-audit.ts's own `auditOperativeStateForUnits`
// already does ad hoc for ITS one subsystem (operativeState.provisions.find
// ((p) => p.supersededSourceNodeIds.includes(nodeId))) into a reusable,
// O(1)-lookup, multi-instrument, fail-closed-by-default utility any
// StructuralNode consumer can call - rather than every consumer
// reimplementing (or, as the audit found, simply never implementing) its
// own copy of this check.
// ---------------------------------------------------------------------------

/** A single OperativeContractState paired with the base documentId it was computed for (OperativeContractState itself does not carry this - see OperativeStateInput.baseDocumentId - so a caller supplies it here rather than this function guessing it from provisions[0], which would be wrong/undefined whenever provisions is empty). */
export interface OperativeStateForDocument {
  baseDocumentId: string;
  state: OperativeContractState;
}

/**
 * Builds a queryable supersession index from every OperativeContractState
 * the caller has actually computed for this analysis run. Deliberately
 * accepts a LIST (never a single state) - a real package can involve
 * several instruments/base documents, and a node-level consumer scanning
 * one document at a time still needs the whole package's knowledge to
 * correctly mark `coveredDocumentIds` (a document that was never analyzed
 * for amendments AT ALL must resolve UNKNOWN for every one of its nodes -
 * the fail-closed default `getNodeSupersessionStatus` falls back to
 * whenever the empty-array/no-index case applies).
 *
 * No document-specific assumption: this only ever reads generic
 * OperativeProvisionView fields (documentId, supersededSourceNodeIds,
 * candidateSourceNodeIds, appliedChain) already produced by
 * computeOperativeContractState above for ANY instrument's ANY provision -
 * it generalizes identically across FWRG/LSB/CONMED/DSGR or any future
 * document family.
 */
export function buildNodeSupersessionIndex(entries: OperativeStateForDocument[]): NodeSupersessionIndex {
  const coveredDocumentIds = new Set<string>();
  const supersededByNodeId = new Map<string, NodeSupersessionRecord>();
  const ambiguousNodeIds = new Set<string>();

  for (const { baseDocumentId, state } of entries) {
    coveredDocumentIds.add(baseDocumentId);
    for (const provision of state.provisions) {
      coveredDocumentIds.add(provision.documentId);

      // AMBIGUOUS target resolution (Phase 3F.1.4 §6A/§6B, unchanged by this
      // fix): the real physical occurrences that share a colliding legal
      // reference/definition term. Each one's OWN supersession status is
      // genuinely unknowable - the amendment could target any one of them,
      // never guessed here.
      for (const nodeId of provision.candidateSourceNodeIds) ambiguousNodeIds.add(nodeId);

      // KNOWN_SUPERSEDED: buildProvisionView's own loop (above in this file)
      // pushes the provision's ORIGINAL base nodeId into
      // supersededSourceNodeIds exactly once, on the first applied-chain
      // iteration - i.e. the earliest (appliedChain is date-sorted, oldest
      // first, per chain.ts's buildProvisionChain) effect that actually
      // applied as of this state's own asOfDate. That effect is the real,
      // disclosable provenance for "why is this superseded."
      if (provision.supersededSourceNodeIds.length === 0) continue;
      const supersedingEffect = provision.appliedChain[0] ?? null;
      for (const nodeId of provision.supersededSourceNodeIds) {
        // A node already recorded as superseded by an earlier-processed
        // state is left alone (first writer wins) rather than overwritten -
        // in practice one nodeId belongs to exactly one provision/instrument
        // by construction, so this is a defensive no-op, never a real
        // precedence decision.
        if (supersededByNodeId.has(nodeId)) continue;
        supersededByNodeId.set(nodeId, {
          nodeId,
          instrumentKey: provision.instrumentKey,
          provisionKey: provision.provisionKey,
          supersededByEffectId: supersedingEffect?.effectId ?? "(unknown-superseding-effect)",
          supersededByAmendmentDocumentId: supersedingEffect?.amendmentDocumentId ?? provision.currentSourceDocumentId,
          supersededEffectiveDate: supersedingEffect?.effectiveDate.date ?? null,
          supersessionKind: "PROVISION_LEVEL",
          supersedingOperativeDocumentId: null,
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // PRE-UNSEEN OPERATIVE-STATE INTEGRATION - whole-document currentness places
  // an upper bound on node/source currentness (docs/pre-unseen-operative-
  // integration/03-integration-design.json). Composes the ALREADY-COMPUTED,
  // authoritative computeOperativeDocument result (chain.ts) each entry's own
  // OperativeContractState already carries as `state.operativeDocument` -
  // never a second, independent version-chain computation. Gated strictly on
  // status === "RESOLVED": REVIEW_REQUIRED/NOT_APPLICABLE (forks, cycles,
  // unresolved restatement targets, ordinary amendments with no
  // RESTATE_AGREEMENT effect at all) leave this untouched, so uncertainty is
  // never converted into supersession and an ordinary amendment's own base
  // document never becomes historical merely because SOME section of it was
  // amended (computeOperativeDocument only ever resolves RESOLVED when a real
  // RESTATE_AGREEMENT effect exists - see chain.ts).
  // -------------------------------------------------------------------------
  const documentLevelSupersededDocuments = new Map<string, NodeSupersessionRecord>();
  for (const { baseDocumentId, state } of entries) {
    const opDoc = state.operativeDocument;
    if (!opDoc || opDoc.status !== "RESOLVED" || !opDoc.operativeDocumentId) continue;
    if (baseDocumentId === opDoc.operativeDocumentId) continue; // the operative document itself is never its own predecessor.
    if (!opDoc.predecessorDocumentIds.includes(baseDocumentId)) continue;
    if (documentLevelSupersededDocuments.has(baseDocumentId)) continue; // first-writer-wins, mirroring supersededByNodeId's own convention.
    // The direct successor edge for this document (never the transitive
    // ultimate operative document alone) - the real, disclosable provenance
    // for "why," mirroring supersededByNodeId's own "earliest applied effect"
    // provenance discipline above.
    const directEdge = opDoc.relationshipChain.find((e) => e.restatesDocumentId === baseDocumentId) ?? null;
    documentLevelSupersededDocuments.set(baseDocumentId, {
      nodeId: "", // filled in per-query with the real queried nodeId by getNodeSupersessionStatus - this template applies uniformly to every node in the document.
      instrumentKey: state.instrumentKey,
      provisionKey: `${baseDocumentId}::WHOLE_DOCUMENT`,
      supersededByEffectId: directEdge?.effectId ?? "(unknown-superseding-restatement-effect)",
      supersededByAmendmentDocumentId: directEdge?.documentId ?? opDoc.operativeDocumentId,
      supersededEffectiveDate: directEdge?.effectiveDate ?? null,
      supersessionKind: "DOCUMENT_LEVEL",
      supersedingOperativeDocumentId: opDoc.operativeDocumentId,
    });
  }

  return { coveredDocumentIds, supersededByNodeId, ambiguousNodeIds, documentLevelSupersededDocuments };
}

/** The honest default for a consumer that has not (yet, or ever) been wired to any real amendment/operative-state computation - every lookup against this resolves UNKNOWN_SUPERSESSION_STATUS, never CURRENT_OPERATIVE, since `coveredDocumentIds` is empty. This is what makes "no supersession index was supplied" fail closed rather than silently behaving exactly as the pre-fix code did (implicitly certifying every node current). */
export const EMPTY_SUPERSESSION_INDEX: NodeSupersessionIndex = { coveredDocumentIds: new Set(), supersededByNodeId: new Map(), ambiguousNodeIds: new Set(), documentLevelSupersededDocuments: new Map() };

/**
 * The single query primitive every bypass-prone StructuralNode consumer
 * should call before treating a physical node's own text as safely
 * current. Three-way, deterministic, fail-closed:
 *   - no nodeId supplied at all -> UNKNOWN (a supersession verdict is
 *     meaningless without a specific physical-occurrence identity - never
 *     answered at the bare document/label level).
 *   - nodeId is a real, disclosed superseded occurrence -> KNOWN_SUPERSEDED
 *     with full provenance.
 *   - nodeId is one of several colliding candidates for an amendment target
 *     the resolver could not uniquely attach -> UNKNOWN (never guessed).
 *   - nodeId's own documentId was never covered by any state this index was
 *     built from -> UNKNOWN (never assumed safe merely because nothing
 *     contradicts it - the whole point of this fix).
 *   - otherwise -> CURRENT_OPERATIVE (a document this index DOES cover, and
 *     this specific node was never recorded as superseded or ambiguous).
 */
export function getNodeSupersessionStatus(index: NodeSupersessionIndex, documentId: string, nodeId: string | null): NodeSupersessionResult {
  if (!nodeId) {
    return { status: "UNKNOWN_SUPERSESSION_STATUS", record: null, reason: "No specific physical structural-node identity (nodeId) was supplied - supersession status can only be determined for one real physical occurrence, never inferred for a bare document/section label." };
  }
  // PRE-UNSEEN OPERATIVE-STATE INTEGRATION - RULE 1 (governing invariant:
  // whole-document currentness places an upper bound on node/source
  // currentness). Checked BEFORE the pre-existing per-node record below: a
  // node whose own containing document was affirmatively established as a
  // RESOLVED historical predecessor cannot be trusted current regardless of
  // whether a specific provision-level effect also happens to target it.
  // Both branches return the same KNOWN_SUPERSEDED status (see types.ts's
  // own NodeSupersessionKind doc comment for why no new status literal was
  // added) - this ordering only affects which provenance a caller sees when
  // both could apply, never the trust outcome itself.
  const docLevelRecord = index.documentLevelSupersededDocuments.get(documentId);
  if (docLevelRecord) {
    const record: NodeSupersessionRecord = { ...docLevelRecord, nodeId };
    return {
      status: "KNOWN_SUPERSEDED",
      record,
      reason: `This physical occurrence's own containing document ("${documentId}") was affirmatively established as a historical predecessor of the resolved operative document "${record.supersedingOperativeDocumentId}" (restated by "${record.supersededByAmendmentDocumentId}" via effect "${record.supersededByEffectId}"${record.supersededEffectiveDate ? `, effective ${record.supersededEffectiveDate}` : ""}) - whole-document currentness places an upper bound on this node's own currentness, regardless of whether any section/definition-level amendment effect separately targets it.`,
    };
  }
  const record = index.supersededByNodeId.get(nodeId);
  if (record) {
    return { status: "KNOWN_SUPERSEDED", record, reason: `Superseded by amendment effect "${record.supersededByEffectId}" from document "${record.supersededByAmendmentDocumentId}"${record.supersededEffectiveDate ? `, effective ${record.supersededEffectiveDate}` : ""} - the operative-state resolver has already determined this physical occurrence's own text no longer governs.` };
  }
  if (index.ambiguousNodeIds.has(nodeId)) {
    return { status: "UNKNOWN_SUPERSESSION_STATUS", record: null, reason: "This physical occurrence is one of multiple real candidates sharing a legal reference/definition term that an amendment target could not be uniquely attached to - whether THIS specific occurrence is the one superseded cannot be determined without guessing." };
  }
  if (!index.coveredDocumentIds.has(documentId)) {
    return { status: "UNKNOWN_SUPERSESSION_STATUS", record: null, reason: `No operative-state computation covers document "${documentId}" - amendment/supersession status for this node was never checked, so it must not be assumed current.` };
  }
  return { status: "CURRENT_OPERATIVE", record: null, reason: "No recorded amendment effect supersedes this physical occurrence as of the analysis date the supplied operative state was computed for." };
}

// ---------------------------------------------------------------------------
// HEADROOM OPEN-2 (universal evidence-trust invariant, root-cause fix for the
// getOperativeProvision/getDefinition asymmetry - see semantic/tools.ts's own
// ToolExecutionOutcome.evidenceUnresolved header comment for the incident).
//
// ROOT CAUSE: getDefinition correctly derives ToolExecutionOutcome.
// evidenceUnresolved from its OWN resolution's `isCurrentTruth` boolean
// (resolveOperativeDefinitionEvidence, above). getOperativeProvision computes
// a real, equally-informative status (`OperativeProvisionView.status`) but
// its execute() body never translated that into evidenceUnresolved at all -
// not because the underlying signal didn't exist, but because each tool's
// execute() was independently deciding, in its own body, whether/how to set
// the flag. Two near-identical tools computing the same KIND of status
// object independently is exactly how one of them silently skipped the
// translation.
//
// FIX: one shared boolean primitive every CURRENT_OPERATIVE_EVIDENCE tool in
// semantic/tools.ts that resolves either vocabulary below calls - never a
// second copy of "which status values count as safe" per tool. Accepts BOTH
// status vocabularies a CURRENT_OPERATIVE_EVIDENCE tool in this codebase can
// produce:
//   - OperativeStateStatus - an OperativeProvisionView's own aggregate
//     status (getOperativeProvision's "a real view was found" branch,
//     getRelatedAmendments).
//   - NodeSupersessionStatus - a single physical node's own supersession
//     verdict (resolveNodeWithSupersessionAwareness's return value, already
//     used by getParentClause/getSiblingClauses/getReferencedProvision, and
//     getOperativeProvision's OWN raw base-document fallback branch, which
//     - independently found during this audit - never consulted
//     supersessionIndex at all, unlike its getDefinition sibling's
//     equivalent base-document fallback branch).
// Exactly one literal value per vocabulary is ever treated as positively
// confirmed current; every other value (OPERATIVE_STATE_CONFLICTED/PARTIAL/
// REVIEW_REQUIRED, KNOWN_SUPERSEDED, UNKNOWN_SUPERSESSION_STATUS) fails
// closed - `!isConfirmedCurrentOperativeEvidence(status)` is the ONE
// expression every one of those tools' execute() bodies assigns to
// `evidenceUnresolved`, so a future new CURRENT_OPERATIVE_EVIDENCE tool that
// forgets to set it produces `undefined`/falsy (fail-open) only if it also
// forgets to call this helper at all - the registry-iterating test in
// tests/contract-model/semantic-tools-operative-state-discipline.test.ts is
// the mechanical backstop for that remaining human-discipline step (a
// runner-level, fully-generic derivation was evaluated and rejected: each
// tool's result payload shape differs too much - some via a provision
// view's own `status`, some via a per-node `supersessionStatus`, some via
// neither field name at all - for ToolRunner.run to locate "the status"
// generically without per-tool knowledge of its own result shape; see
// docs/phase-3f1-human-architecture-decision/05-universal-evidence-trust-
// invariant.json for the full mechanism writeup).
// ---------------------------------------------------------------------------

export type CurrentOperativeEvidenceStatus = OperativeStateStatus | NodeSupersessionStatus;

/**
 * The SINGLE shared "is this positively confirmed current operative truth"
 * boolean every CURRENT_OPERATIVE_EVIDENCE-declared tool in semantic/tools.ts
 * derives its own ToolExecutionOutcome.evidenceUnresolved from. See the
 * header comment immediately above for the full rationale.
 */
export function isConfirmedCurrentOperativeEvidence(status: CurrentOperativeEvidenceStatus): boolean {
  return status === "OPERATIVE_STATE_RESOLVED" || status === "CURRENT_OPERATIVE";
}

// ---------------------------------------------------------------------------
// Phase 3F.1.6-terminal Part A (OPEN-2 / BLOCKER-5 / BLOCKER-6 remediation) -
// the canonical, single definition-access primitive both semantic/tools.ts's
// getDefinition AND amendment/pipeline.ts's getTargetCurrentText now share,
// so a definition's operative status is answered with ONE temporal
// discipline rather than two independently-maintained ones. See
// docs/phase-3f1-terminal-architecture-decision/04-definition-operative-fix.json
// for the full reproduction/fix writeup - the short version: getDefinition's
// own findProvisionView-based lookup used to compare the queried term with
// only `.trim().toLowerCase()` (leading/trailing whitespace only), unlike
// its SECTION-side sibling on the same line (full `.replace(/\s+/g, "")`)
// and unlike normalizeDefinedTermRef itself (the exact function already
// used to STORE OperativeProvisionView.definedTermRef in the first place).
// A term queried with irregular internal whitespace silently missed the
// stored view, fell through to a base-document fallback, and re-served
// stale pre-amendment text labeled OPERATIVE_STATE_RESOLVED even when a
// real, on-file CONFLICTED or PARTIAL amendment existed. Routing getDefinition
// through getOperativeDefinition (which already normalizes both sides via
// normalizeDefinedTermRef) closes that gap at the root rather than patching
// around the one reproduction.
// ---------------------------------------------------------------------------

/**
 * The unified status a definition's evidence carries - deliberately a
 * richer, distinct vocabulary from OperativeStateStatus (which describes a
 * PROVISION's aggregate amendment-chain health) because this function must
 * also describe definitions that were NEVER targeted by any amendment
 * effect at all (the base-document fallback), where no OperativeStateStatus
 * value applies:
 *   - CURRENT: confidently current, safe to treat as settled fact - either
 *     a fully-resolved amendment chain, or a genuinely never-amended,
 *     uniquely-resolved base-document definition with no known supersession.
 *   - KNOWN_SUPERSEDED: a real, disclosed record (via NodeSupersessionIndex)
 *     shows this exact physical base-document occurrence no longer governs,
 *     even though no DEFINITION-kind amendment effect targeted the TERM
 *     itself (e.g. its enclosing section was independently superseded).
 *   - OPERATIVE_STATE_UNRESOLVED: a real, on-file amendment conflict
 *     (OPERATIVE_STATE_CONFLICTED) or an otherwise-review-required chain
 *     state - no confident current text exists and none is fabricated.
 *   - AMBIGUOUS_TARGET: 2+ real, colliding physical definitions/candidates
 *     and no way to pick one without guessing - never guessed.
 *   - PARTIAL_AMENDMENT: a real, resolved, dated effect governs this exact
 *     term but supplied no capturable replacement text.
 *   - HISTORICAL_ONLY: a real amendment references this term but its own
 *     base-document target could not be confirmed to exist at all
 *     (targetResolutionStatus NOT_FOUND) - what the amendment SAYS
 *     (attemptedText) is disclosed for context, explicitly labeled
 *     historical/unconfirmed, never presented as current.
 *
 * Only `isCurrentTruth === true` (equivalently, `status === "CURRENT"`) may
 * ever be treated by a caller as settled, verified current fact - every
 * other status may still return `text` for context, but a caller MUST
 * label it as historical/unresolved and must not let it alone justify a
 * VERIFIED/current-truth downstream determination (see
 * ToolExecutionOutcome.evidenceUnresolved in semantic/tools.ts and
 * SemanticVerificationResult's own determineStatus in
 * semantic-verification/verify.ts for where this is enforced downstream).
 */
export type DefinitionEvidenceStatus = "CURRENT" | "KNOWN_SUPERSEDED" | "OPERATIVE_STATE_UNRESOLVED" | "AMBIGUOUS_TARGET" | "PARTIAL_AMENDMENT" | "HISTORICAL_ONLY";

export interface DefinitionEvidenceFound {
  outcome: "FOUND";
  status: DefinitionEvidenceStatus;
  /** Null whenever status !== "CURRENT" and no safe historical/attempted text exists either (CONFLICTED, PARTIAL_AMENDMENT, AMBIGUOUS never reaches this shape at all - see DefinitionEvidenceAmbiguous). */
  text: string | null;
  documentId: string;
  source: "amended" | "base-document";
  /** True iff status === "CURRENT" - the single field a caller should gate on rather than string-matching every status value. */
  isCurrentTruth: boolean;
  unresolvedIssues: string[];
  /**
   * Backward-compatible OperativeStateStatus-vocabulary echo, for callers
   * (getOperativeProvision's own sibling response shape, and every existing
   * test asserting on it) that already key off exactly
   * OPERATIVE_STATE_RESOLVED/PARTIAL/CONFLICTED/REVIEW_REQUIRED - the
   * SAME `view.status` this function derived `status` above from, never
   * re-derived or collapsed a second way. For the base-document fallback
   * (no view at all - Branch 2), there is no real OperativeProvisionView to
   * echo: CURRENT maps to the pre-existing "never amended" convention
   * (OPERATIVE_STATE_RESOLVED) and KNOWN_SUPERSEDED maps to
   * OPERATIVE_STATE_PARTIAL (the closest existing meaning - text exists but
   * is not confidently current), both newly-introduced by this fix and not
   * constrained by any pre-existing caller.
   */
  legacyStatus: OperativeStateStatus;
}

export interface DefinitionEvidenceAmbiguous {
  outcome: "AMBIGUOUS";
  status: "AMBIGUOUS_TARGET";
  reason: string;
  candidateCount: number;
  documentId: string;
}

export interface DefinitionEvidenceNotFound {
  outcome: "NOT_FOUND";
  reason: string;
}

export type DefinitionEvidenceResolution = DefinitionEvidenceFound | DefinitionEvidenceAmbiguous | DefinitionEvidenceNotFound;

export interface ResolveOperativeDefinitionEvidenceInput {
  index: StructuralIndex;
  /** Null/undefined - no amendment pipeline run exists for this instrument at all, a legitimate state (never amended is not an error) - resolution proceeds straight to the base-document fallback below. */
  operativeState: OperativeContractState | null | undefined;
  term: string;
  /** Documents to search, in order, ONLY when no OperativeProvisionView exists for this term (home document first, then real same-instrument siblings) - mirrors semantic/tools.ts's own getScopedDefinitionFullText ordering convention. Never widened beyond what the caller has already scoped (cross-instrument isolation is the caller's responsibility, unchanged by this function). */
  searchDocumentIds: string[];
  /** Optional - when supplied, a UNIQUE base-document (never individually amended) definition whose own physical occurrence this index independently knows to be superseded is labeled KNOWN_SUPERSEDED rather than CURRENT. Omitting this (or passing EMPTY_SUPERSESSION_INDEX) degrades to the pre-existing "never amended, never checked against wider supersession evidence" default of CURRENT - the same fail-open-for-genuinely-unchecked-cases discipline every other caller of getNodeSupersessionStatus already accepts when it has no index to consult. */
  supersessionIndex?: NodeSupersessionIndex;
}

/**
 * The single canonical primitive for "what is this defined term's real
 * operative evidence, right now" - reused verbatim by semantic/tools.ts's
 * getDefinition and amendment/pipeline.ts's getTargetCurrentText rather than
 * each maintaining its own parallel notion of "resolved enough to serve."
 * Pure function of already-computed state (never a new detection pass) -
 * exactly like every other primitive in this file.
 */
export function resolveOperativeDefinitionEvidence(input: ResolveOperativeDefinitionEvidenceInput): DefinitionEvidenceResolution {
  const { index, operativeState, term, searchDocumentIds } = input;

  // Branch 1: this term has real, on-file recorded amendment activity.
  // Deliberately normalizes BOTH sides with normalizeDefinedTermRef here
  // (never a bare `getOperativeDefinition`-style `p.definedTermRef ===
  // normalizeDefinedTermRef(term)` comparison that trusts definedTermRef
  // was already stored fully normalized) - production's own
  // buildProvisionView always stores it pre-normalized via chain.ts's
  // provisionKeyFor, but this is the exact SAME defensive discipline
  // findProvisionView's own SECTION-branch neighbor already applies (never
  // assume a field was stored in the exact shape you expect; normalize at
  // the comparison site too), and it costs nothing since normalizing an
  // already-normalized string is a no-op.
  const queryNormalized = normalizeDefinedTermRef(term);
  const view = operativeState?.provisions.find((p) => p.kind === "DEFINITION" && normalizeDefinedTermRef(p.definedTermRef ?? "") === queryNormalized) ?? null;
  if (view) {
    // A real, on-file OperativeProvisionView for this exact term is ALWAYS
    // disclosed (outcome FOUND, never a refusal) regardless of its own
    // targetResolutionStatus - mirroring getOperativeProvision's own
    // established "found" branch, which never refuses either once a view
    // exists (only its OWN separate raw-fallback branch, for a query with
    // NO view at all, ever refuses on ambiguity). A refusal here would
    // regress tests/contract-model/part-b-recert-blocker2-6-tools-
    // adversarial.test.ts's own frozen AMBIGUOUS-view fixture, which
    // expects `ok:true` with status/unresolvedIssues disclosed - exactly
    // like the SECTION-kind analog one test above it in that same file.
    if (view.targetResolutionStatus === "AMBIGUOUS") {
      return {
        outcome: "FOUND",
        status: "AMBIGUOUS_TARGET",
        text: null,
        documentId: view.documentId,
        source: "amended",
        isCurrentTruth: false,
        unresolvedIssues: view.unresolvedIssues,
        legacyStatus: view.status,
      };
    }
    if (view.targetResolutionStatus === "NOT_FOUND") {
      // A real amendment claims new text for this term, but the term's own
      // base-document target could not be confirmed to exist at all - this
      // is exactly the "useful amendment text is never discarded merely
      // because target attachment is unresolved" case buildProvisionView's
      // own header comment describes (attemptedText). Disclosed as
      // explicitly historical/unconfirmed - never as current.
      return { outcome: "FOUND", status: "HISTORICAL_ONLY", text: view.attemptedText, documentId: view.documentId, source: "amended", isCurrentTruth: false, unresolvedIssues: view.unresolvedIssues, legacyStatus: view.status };
    }
    let status: DefinitionEvidenceStatus;
    if (view.status === "OPERATIVE_STATE_CONFLICTED") status = "OPERATIVE_STATE_UNRESOLVED";
    else if (view.status === "OPERATIVE_STATE_PARTIAL") status = "PARTIAL_AMENDMENT";
    else if (view.status === "OPERATIVE_STATE_REVIEW_REQUIRED") status = "OPERATIVE_STATE_UNRESOLVED";
    else status = "CURRENT";
    return { outcome: "FOUND", status, text: view.currentText, documentId: view.documentId, source: "amended", isCurrentTruth: status === "CURRENT", unresolvedIssues: view.unresolvedIssues, legacyStatus: view.status };
  }

  // Branch 2: no recorded amendment activity for this term at all - resolve
  // directly against the base document(s), never guessing among multiple
  // colliding physical definitions of the same term within one document
  // (resolveUniqueDefinitionByRef's own AMBIGUOUS/UNIQUE/NOT_FOUND axis).
  for (const docId of searchDocumentIds) {
    const resolution = resolveUniqueDefinitionByRef(index, docId, term);
    if (resolution.status === "AMBIGUOUS") {
      return {
        outcome: "AMBIGUOUS",
        status: "AMBIGUOUS_TARGET",
        reason: `term "${term}" matches ${resolution.candidates.length} distinct physical definitions in document "${docId}", and it has no recorded amendment history to disambiguate it`,
        candidateCount: resolution.candidates.length,
        documentId: docId,
      };
    }
    if (resolution.status === "UNIQUE") {
      const fullText = index.getDefinitionFullText(resolution.definition.exactTerm, docId);
      if (!fullText) continue;
      // Phase 3F.1.6-terminal Part A - a UNIQUE, never-individually-amended
      // definition can still have its own physical occurrence independently
      // known-superseded (e.g. its enclosing section was itself replaced by
      // a SECTION-kind amendment effect, or a document-level restatement
      // recorded it) - checked here for the first time in getDefinition's
      // own base-document fallback, mirroring the SAME discipline every
      // other section-reading tool in semantic/tools.ts already applies via
      // resolveNodeWithSupersessionAwareness.
      const supersession = input.supersessionIndex ? getNodeSupersessionStatus(input.supersessionIndex, docId, resolution.definition.sourceNodeId) : null;
      if (supersession?.status === "KNOWN_SUPERSEDED") {
        return { outcome: "FOUND", status: "KNOWN_SUPERSEDED", text: fullText, documentId: docId, source: "base-document", isCurrentTruth: false, unresolvedIssues: [supersession.reason], legacyStatus: "OPERATIVE_STATE_PARTIAL" };
      }
      return { outcome: "FOUND", status: "CURRENT", text: fullText, documentId: docId, source: "base-document", isCurrentTruth: true, unresolvedIssues: [], legacyStatus: "OPERATIVE_STATE_RESOLVED" };
    }
  }
  return { outcome: "NOT_FOUND", reason: `no defined term matching "${term}" found in this instrument's documents` };
}

// ---------------------------------------------------------------------------
// Phase 3F.1 FIX-2 (trust-metadata-belongs-to-the-evidence-itself remediation)
// - the SECTION-kind counterpart to resolveOperativeDefinitionEvidence above,
// added so context-retrieval (Phase 2D) can route a SECTION/PROVISO/
// EXCEPTION/CONDITION/SHARED_CAP/CROSS_REFERENCE context item through the
// exact same amendment-aware resolution discipline semantic/tools.ts's own
// resolveNodeWithSupersessionAwareness already applies for the model's
// evidence tools - reusing the SAME DefinitionEvidenceResolution/
// DefinitionEvidenceStatus union (never a second, parallel vocabulary; see
// this module's own header note on "do not over-normalize if existing types
// already carry most of what's needed"). Deliberately NODE-based rather than
// ref-string-based: every context-retrieval call site that needs this
// already holds a real, previously-resolved StructuralNode (the candidate's
// own primary node, an ancestor, a child, a sibling, a cross-reference
// target) - re-resolving a bare ref string via resolveUniqueNodeByRef here
// would just redundantly repeat a uniqueness check the caller's own
// traversal already performed, and would risk a DIFFERENT answer than the
// one physical occurrence the caller actually has in hand.
// ---------------------------------------------------------------------------

export interface ResolveOperativeSectionEvidenceInput {
  /** Null/undefined - no amendment pipeline run exists for this instrument at all (never amended is not an error) - resolution proceeds straight to the supersession-only check below. */
  operativeState: OperativeContractState | null | undefined;
  /** The document this node's own OperativeProvisionView (if any) is anchored under - matches OperativeStateInput.baseDocumentId's own convention (every provision view in one instrument's OperativeContractState shares the same baseDocumentId, regardless of which real document a section physically lives in - see buildProvisionView's own `documentId: baseDocumentId`). */
  documentId: string;
  /** The already-resolved, real physical occurrence - never re-resolved from a bare ref string here (see this function's own header comment). */
  node: { nodeId: string; sectionRef: string };
  /** Optional - when supplied, a section with no recorded amendment activity of its own whose physical occurrence this index independently knows to be superseded (e.g. its enclosing section was independently replaced) is labeled KNOWN_SUPERSEDED rather than CURRENT. Omitting this (or passing EMPTY_SUPERSESSION_INDEX) degrades to the pre-existing "never amended, never checked against wider supersession evidence" default of CURRENT. */
  supersessionIndex?: NodeSupersessionIndex;
}

/**
 * The single canonical primitive for "what is this SECTION's real operative
 * evidence, right now" - mirrors resolveOperativeDefinitionEvidence's own
 * two-branch structure exactly (a real, on-file OperativeProvisionView for
 * this section takes priority; otherwise a supersession-only check against
 * the base-document occurrence the caller already resolved), reusing
 * OperativeProvisionView fields already computed by buildProvisionView above
 * rather than deriving anything new.
 */
export function resolveOperativeSectionEvidence(input: ResolveOperativeSectionEvidenceInput): DefinitionEvidenceResolution {
  const { operativeState, documentId, node, supersessionIndex } = input;
  const normalizedSection = node.sectionRef.replace(/\s+/g, "");
  const view = operativeState?.provisions.find((p) => p.kind === "SECTION" && (p.sectionRef ?? "").replace(/\s+/g, "") === normalizedSection) ?? null;

  if (view) {
    // A real, on-file OperativeProvisionView for this exact section is
    // ALWAYS disclosed (outcome FOUND, never a refusal) regardless of its
    // own targetResolutionStatus - mirroring resolveOperativeDefinitionEvidence's
    // own Branch 1 discipline above.
    if (view.targetResolutionStatus === "AMBIGUOUS") {
      return { outcome: "AMBIGUOUS", status: "AMBIGUOUS_TARGET", reason: view.targetResolutionReason ?? `Section "${node.sectionRef}" has an ambiguous amendment target.`, candidateCount: view.candidateSourceNodeIds.length, documentId: view.documentId };
    }
    if (view.targetResolutionStatus === "NOT_FOUND") {
      // A real amendment claims new text for this section, but the section's
      // own base-document target could not be confirmed to exist - disclosed
      // as explicitly historical/unconfirmed (attemptedText), never as
      // current, exactly mirroring the DEFINITION-side HISTORICAL_ONLY branch.
      return { outcome: "FOUND", status: "HISTORICAL_ONLY", text: view.attemptedText, documentId: view.documentId, source: "amended", isCurrentTruth: false, unresolvedIssues: view.unresolvedIssues, legacyStatus: view.status };
    }
    let status: DefinitionEvidenceStatus;
    if (view.status === "OPERATIVE_STATE_CONFLICTED") status = "OPERATIVE_STATE_UNRESOLVED";
    else if (view.status === "OPERATIVE_STATE_PARTIAL") status = "PARTIAL_AMENDMENT";
    else if (view.status === "OPERATIVE_STATE_REVIEW_REQUIRED") status = "OPERATIVE_STATE_UNRESOLVED";
    else status = "CURRENT";
    return { outcome: "FOUND", status, text: view.currentText, documentId: view.documentId, source: "amended", isCurrentTruth: status === "CURRENT", unresolvedIssues: view.unresolvedIssues, legacyStatus: view.status };
  }

  // No recorded amendment activity for this section at all - the caller
  // already holds a real, uniquely-resolved physical node (no ambiguity
  // check to repeat here); the only remaining question is whether that
  // SAME physical occurrence is independently known-superseded (e.g. its
  // enclosing section was itself replaced by a SECTION-kind amendment
  // effect elsewhere, or a document-level restatement recorded it) - the
  // exact same discipline getDefinition's own base-document fallback
  // already applies (Phase 3F.1.6-terminal Part A).
  if (supersessionIndex) {
    const supersession = getNodeSupersessionStatus(supersessionIndex, documentId, node.nodeId);
    if (supersession.status === "KNOWN_SUPERSEDED") {
      return { outcome: "FOUND", status: "KNOWN_SUPERSEDED", text: null, documentId, source: "base-document", isCurrentTruth: false, unresolvedIssues: [supersession.reason], legacyStatus: "OPERATIVE_STATE_PARTIAL" };
    }
  }
  return { outcome: "FOUND", status: "CURRENT", text: null, documentId, source: "base-document", isCurrentTruth: true, unresolvedIssues: [], legacyStatus: "OPERATIVE_STATE_RESOLVED" };
}
