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
 */
import type { StructuralIndex } from "../structural-index";
import { groupEffectsByProvision, buildProvisionChain, normalizeDefinedTermRef, type ProvisionGroup } from "./chain";
import type { AmendmentEffectCandidate, OperativeContractState, OperativeProvisionView, OperativeStateStatus } from "./types";

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

function resolveBaseText(group: ProvisionGroup, baseDocumentId: string, index: StructuralIndex): { text: string | null; nodeKey: string | null } {
  if (group.kind === "SECTION") {
    const node = index.getNodeByRef(baseDocumentId, group.ref);
    if (!node) return { text: null, nodeKey: null };
    return { text: index.getNodeText(node.nodeKey, "DESCENDANTS"), nodeKey: node.nodeKey };
  }
  const def = index.getDefinition(group.ref, baseDocumentId) ?? index.getDefinition(group.ref);
  if (!def) return { text: null, nodeKey: null };
  return { text: index.getDefinitionFullText(def.exactTerm, def.documentId) ?? null, nodeKey: def.sourceNodeKey };
}

function buildProvisionView(group: ProvisionGroup, baseDocumentId: string, asOfDate: string, index: StructuralIndex): OperativeProvisionView {
  const { fullChain, conflicts } = buildProvisionChain(group);
  const asOfMs = new Date(asOfDate).getTime();
  const appliedChain = fullChain.filter((e) => e.effectiveDate.date !== null && new Date(e.effectiveDate.date).getTime() <= asOfMs).map((e) => ({ ...e, appliedAsOfQuery: true }));

  const base = resolveBaseText(group, baseDocumentId, index);
  let currentText = base.text;
  let currentSourceDocumentId = baseDocumentId;
  let currentSourceNodeKey = base.nodeKey;
  const supersededSourceNodeKeys: string[] = [];

  for (const applied of appliedChain) {
    const effect = group.effects.find((e) => e.effectId === applied.effectId)!;
    if (currentSourceNodeKey) supersededSourceNodeKeys.push(currentSourceNodeKey);
    if (effect.operation === "DELETE_TEXT" || effect.operation === "DELETE_DEFINITION" || effect.operation === "REMOVE_COVENANT" || effect.operation === "REMOVE_EXCEPTION") {
      currentText = null;
      currentSourceDocumentId = effect.amendmentDocumentId;
      currentSourceNodeKey = null;
    } else if (effect.newText) {
      currentText = effect.newText;
      currentSourceDocumentId = effect.amendmentDocumentId;
      currentSourceNodeKey = null;
    } else {
      // Effect genuinely applies (real evidence, resolved target, real effective date) but did not supply capturable resulting text (e.g. a threshold change or a bare "is hereby amended" with no quoted replacement) - the FACT that this effect governs is known; the resulting TEXT is honestly not safely renderable, never fabricated.
      currentText = null;
      currentSourceDocumentId = effect.amendmentDocumentId;
      currentSourceNodeKey = null;
    }
  }

  const hasConflict = conflicts.some((c) => c.conflictType === "AMENDMENT_CONFLICT");
  const hasSequenceUnresolved = conflicts.some((c) => c.conflictType === "AMENDMENT_SEQUENCE_UNRESOLVED");
  const hasReviewOrUnresolvedEffect = group.effects.some((e) => e.status === "REVIEW_REQUIRED" || e.status === "UNRESOLVED");
  const textMissingDespiteAppliedEffect = appliedChain.length > 0 && currentText === null;

  const unresolvedIssues: string[] = [];
  let status: OperativeStateStatus;
  if (hasConflict) {
    status = "OPERATIVE_STATE_CONFLICTED";
    unresolvedIssues.push(...conflicts.filter((c) => c.conflictType === "AMENDMENT_CONFLICT").map((c) => c.reason));
  } else if (hasSequenceUnresolved || hasReviewOrUnresolvedEffect) {
    status = "OPERATIVE_STATE_REVIEW_REQUIRED";
    unresolvedIssues.push(...conflicts.filter((c) => c.conflictType === "AMENDMENT_SEQUENCE_UNRESOLVED").map((c) => c.reason));
    unresolvedIssues.push(...group.effects.filter((e) => (e.status === "REVIEW_REQUIRED" || e.status === "UNRESOLVED") && e.unresolvedReason).map((e) => `${e.effectId}: ${e.unresolvedReason}`));
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
    currentText,
    fullChain,
    appliedChain,
    supersededSourceNodeKeys,
    status,
    unresolvedIssues,
    conflicts,
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
