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
import type { AmendmentEffectCandidate, OperativeContractState, OperativeProvisionView, OperativeStateStatus, ProvisionTargetResolutionStatus } from "./types";

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
      return { text: index.getNodeText(node.nodeId, "DESCENDANTS"), nodeKey: node.nodeKey, nodeId: node.nodeId, targetResolutionStatus: "UNIQUE", targetResolutionReason: null, candidateSourceNodeIds: [] };
    }
    if (resolution.status === "AMBIGUOUS") {
      return {
        text: null,
        nodeKey: null,
        nodeId: null,
        targetResolutionStatus: "AMBIGUOUS",
        targetResolutionReason: `${resolution.candidates.length} distinct physical occurrences in the base document share the legal reference "${group.ref}" - the amendment's own target cannot be attached to a single provision without guessing which one governs.`,
        candidateSourceNodeIds: resolution.candidates.map((c) => c.nodeId),
      };
    }
    return {
      text: null,
      nodeKey: null,
      nodeId: null,
      targetResolutionStatus: "NOT_FOUND",
      targetResolutionReason: `No section matching legal reference "${group.ref}" was found in the base document's own structural index.`,
      candidateSourceNodeIds: [],
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
      return { text: null, nodeKey: null, nodeId: null, targetResolutionStatus: "UNIQUE", targetResolutionReason: null, candidateSourceNodeIds: [] };
    }
    return {
      text: null,
      nodeKey: null,
      nodeId: null,
      targetResolutionStatus: "NOT_FOUND",
      targetResolutionReason: `No definition matching "${group.ref}" was found in the base document's own definitions.`,
      candidateSourceNodeIds: [],
    };
  }
  // docScoped.status === "UNIQUE": the independent check confirms exactly
  // one real definition of this term in this document, so `def` (however
  // it was actually resolved above) is trusted for TEXT EXTRACTION only.
  if (!def) return { text: null, nodeKey: null, nodeId: null, targetResolutionStatus: "NOT_FOUND", targetResolutionReason: `No definition matching "${group.ref}" was found in the base document's own definitions.`, candidateSourceNodeIds: [] };
  return { text: index.getDefinitionFullText(def.exactTerm, def.documentId) ?? null, nodeKey: def.sourceNodeKey, nodeId: def.sourceNodeId, targetResolutionStatus: "UNIQUE", targetResolutionReason: null, candidateSourceNodeIds: [] };
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
  } else if (targetUnresolved) {
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
    currentText = null;
  }

  // Phase 3F.1.4 P3 - a well-evidenced deletion against a UNIQUELY
  // resolved target is a correct, INTENDED null-governance outcome, not a
  // derivation failure - it must never be conflated with "an effect
  // governs but its resulting text honestly could not be captured."
  const textMissingDespiteAppliedEffect = appliedChain.length > 0 && !hasConflict && !targetUnresolved && currentText === null && !lastAppliedWasCleanDeletion;

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
