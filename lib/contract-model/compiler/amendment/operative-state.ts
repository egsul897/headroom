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
import { groupEffectsByProvision, buildProvisionChain, normalizeDefinedTermRef, type ProvisionGroup } from "./chain";
import type { AmendmentEffectCandidate, NodeSupersessionIndex, NodeSupersessionRecord, NodeSupersessionResult, OperativeContractState, OperativeProvisionView, OperativeStateStatus, ProvisionStructuralHealthStatus, ProvisionTargetResolutionStatus } from "./types";

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
 */
type DefinitionResolution = { status: "UNIQUE"; definition: DetectedDefinition } | { status: "AMBIGUOUS"; candidates: DetectedDefinition[] } | { status: "NOT_FOUND" };

function resolveUniqueDefinitionByRef(index: StructuralIndex, documentId: string, term: string): DefinitionResolution {
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

  return { instrumentKey: input.instrumentKey, asOfDate: input.asOfDate, provisions, status, summary, unattachedEffects };
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
        });
      }
    }
  }

  return { coveredDocumentIds, supersededByNodeId, ambiguousNodeIds };
}

/** The honest default for a consumer that has not (yet, or ever) been wired to any real amendment/operative-state computation - every lookup against this resolves UNKNOWN_SUPERSESSION_STATUS, never CURRENT_OPERATIVE, since `coveredDocumentIds` is empty. This is what makes "no supersession index was supplied" fail closed rather than silently behaving exactly as the pre-fix code did (implicitly certifying every node current). */
export const EMPTY_SUPERSESSION_INDEX: NodeSupersessionIndex = { coveredDocumentIds: new Set(), supersededByNodeId: new Map(), ambiguousNodeIds: new Set() };

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
