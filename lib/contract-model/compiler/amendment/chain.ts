/**
 * Phase 2G §12/§13/§22 - amendment chain construction + conflict
 * detection. Groups every resolved AmendmentEffectCandidate by the
 * single provision (a section ref or a defined term, scoped to one
 * instrument) it targets, orders each group by EFFECTIVE-DATE evidence
 * (never amendment number alone - task's own explicit instruction), and
 * flags real ambiguity rather than picking silently.
 */
import type { AmendmentChainEntry, AmendmentConflict, AmendmentEffectCandidate, OperativeDocumentResolution } from "./types";

export interface ProvisionGroup {
  instrumentKey: string;
  kind: "SECTION" | "DEFINITION";
  ref: string;
  provisionKey: string;
  effects: AmendmentEffectCandidate[];
}

export function normalizeDefinedTermRef(term: string): string {
  return term.replace(/\s+/g, " ").trim().toLowerCase();
}

function provisionKeyFor(effect: AmendmentEffectCandidate): { kind: "SECTION" | "DEFINITION"; ref: string } | null {
  if (!effect.target.targetInstrumentKey) return null;
  if (effect.target.targetSectionRef) return { kind: "SECTION", ref: effect.target.targetSectionRef };
  if (effect.target.targetDefinedTermRef) return { kind: "DEFINITION", ref: normalizeDefinedTermRef(effect.target.targetDefinedTermRef) };
  return null;
}

/** Effects with no resolvable (instrument, section/definition) target are never silently dropped - they are excluded from provision grouping (since there is nothing to attach a chain entry to) but returned separately for the pipeline summary to surface. */
export function groupEffectsByProvision(effects: AmendmentEffectCandidate[]): { groups: ProvisionGroup[]; unattachedEffects: AmendmentEffectCandidate[] } {
  const byKey = new Map<string, ProvisionGroup>();
  const unattached: AmendmentEffectCandidate[] = [];

  for (const effect of effects) {
    const p = provisionKeyFor(effect);
    if (!p) {
      unattached.push(effect);
      continue;
    }
    const provisionKey = `${effect.target.targetInstrumentKey}::${p.kind}::${p.ref}`;
    if (!byKey.has(provisionKey)) byKey.set(provisionKey, { instrumentKey: effect.target.targetInstrumentKey!, kind: p.kind, ref: p.ref, provisionKey, effects: [] });
    byKey.get(provisionKey)!.effects.push(effect);
  }

  return { groups: [...byKey.values()], unattachedEffects: unattached };
}

export interface ChainResult {
  fullChain: AmendmentChainEntry[];
  conflicts: AmendmentConflict[];
}

/** Builds one provision's full chronological amendment chain plus any conflicts within it. Effects whose effective date cannot be safely established (CONDITIONAL_UNRESOLVED/UNKNOWN) are placed at the END of the chain (never silently ordered as if dated), and each contributes an AMENDMENT_SEQUENCE_UNRESOLVED conflict - task §22's own "amendment target resolves... stated effective date conditional and unresolved" scenario. */
export function buildProvisionChain(group: ProvisionGroup): ChainResult {
  const conflicts: AmendmentConflict[] = [];

  const dated = group.effects.filter((e) => e.effectiveDate.date !== null);
  const undated = group.effects.filter((e) => e.effectiveDate.date === null);

  dated.sort((a, b) => new Date(a.effectiveDate.date!).getTime() - new Date(b.effectiveDate.date!).getTime());

  // §22 - two effects on the SAME provision sharing the identical effective date is a real conflict (which one actually governs cannot be determined from date alone).
  for (let i = 0; i < dated.length - 1; i++) {
    if (dated[i]!.effectiveDate.date === dated[i + 1]!.effectiveDate.date) {
      conflicts.push({
        conflictType: "AMENDMENT_CONFLICT",
        provisionKey: group.provisionKey,
        involvedEffectIds: [dated[i]!.effectId, dated[i + 1]!.effectId],
        reason: `Two amendment effects targeting the same provision (${group.ref}) share the identical effective date (${dated[i]!.effectiveDate.date}) - which one actually governs cannot be determined from date evidence alone.`,
      });
    }
  }

  for (const u of undated) {
    conflicts.push({
      conflictType: "AMENDMENT_SEQUENCE_UNRESOLVED",
      provisionKey: group.provisionKey,
      involvedEffectIds: [u.effectId],
      reason: `An amendment effect targeting ${group.ref} has an effective date that could not be safely established (${u.effectiveDate.status}: ${u.effectiveDate.reason}) - its position in the amendment chain is unknown, so it cannot be safely applied or safely excluded.`,
    });
  }

  const orderedEffects = [...dated, ...undated];
  const fullChain: AmendmentChainEntry[] = orderedEffects.map((e) => ({
    effectId: e.effectId,
    amendmentDocumentId: e.amendmentDocumentId,
    operation: e.operation,
    effectiveDate: e.effectiveDate,
    sourceCitation: e.sourceCitation,
    appliedAsOfQuery: false,
  }));

  return { fullChain, conflicts };
}

/**
 * POST-3F.2 remediation (Unit B3) - see types.ts's own OperativeDocumentResolution
 * doc comment for the full rationale. Builds a directed graph over
 * RESTATE_AGREEMENT effects (successor = amendmentDocumentId "restates"
 * predecessor = target.targetDocumentId) and finds its own un-superseded
 * end - the document nothing else restates. Fails safe (REVIEW_REQUIRED,
 * never a guess) on any unresolved target, fork (two documents claiming to
 * restate the same predecessor), or cycle; NOT_APPLICABLE when this
 * instrument has no restatement activity at all.
 *
 * `unresolvedRestatementEffects` mirrors computeOperativeContractState's
 * own `unresolvedTargetEffectsForThisInstrument` parameter - restatement
 * effects the CALLER has independently determined (from real package/
 * document topology) belong to this instrument's document family despite
 * carrying an unresolved target. Their mere presence is enough to force
 * REVIEW_REQUIRED (never RESOLVED) even when the fully-resolved effects
 * alone would otherwise form a clean chain - an instrument with ANY known
 * unresolved restatement activity can never be confidently designated.
 */
export function computeOperativeDocument(baseDocumentId: string, allEffects: AmendmentEffectCandidate[], unresolvedRestatementEffects: AmendmentEffectCandidate[] = []): OperativeDocumentResolution {
  const restatementEffects = allEffects.filter((e) => e.operation === "RESTATE_AGREEMENT");
  const unresolvedRestatements = unresolvedRestatementEffects.filter((e) => e.operation === "RESTATE_AGREEMENT");

  if (restatementEffects.length === 0 && unresolvedRestatements.length === 0) {
    return { status: "NOT_APPLICABLE", operativeDocumentId: null, predecessorDocumentIds: [], relationshipChain: [], reviewReason: null };
  }

  // A restatement effect only blocks document-graph resolution when it has
  // NO target document at all (status UNRESOLVED, targetDocumentId null - a
  // genuinely unknown link). A REVIEW_REQUIRED effect with a real
  // targetDocumentId (e.g. DETERMINISTIC_CHRONOLOGICAL_PREDECESSOR's
  // inferential-but-unambiguous resolution, or DETERMINISTIC_TYPE_ONLY_MATCH)
  // still names a concrete document and is used to build the graph - the
  // underlying effect's own REVIEW_REQUIRED/lower-confidence status already
  // flags that specific provision-level effect for human confirmation
  // (see deterministic-parser.ts), which is a separate concern from whether
  // the document-identity GRAPH itself is unambiguous. A graph built only
  // from confirmed-with-a-target links can still be a clean single chain.
  const notResolved = [...restatementEffects, ...unresolvedRestatements].filter((e) => e.target.kind !== "DOCUMENT" || !e.target.targetDocumentId);
  if (notResolved.length > 0) {
    return {
      status: "REVIEW_REQUIRED",
      operativeDocumentId: null,
      predecessorDocumentIds: [],
      relationshipChain: [],
      reviewReason: `${notResolved.length} restatement effect(s) relevant to this instrument have an unresolved target document - which whole document currently governs cannot be determined without guessing (effect(s): ${notResolved.map((e) => e.effectId).join(", ")}).`,
    };
  }

  const edges = restatementEffects.map((e) => ({ successor: e.amendmentDocumentId, predecessor: e.target.targetDocumentId!, effectId: e.effectId, confidence: e.confidence, effectiveDate: e.effectiveDate.date }));

  const successorsOf = new Map<string, string[]>();
  for (const edge of edges) {
    const arr = successorsOf.get(edge.predecessor) ?? [];
    arr.push(edge.successor);
    successorsOf.set(edge.predecessor, arr);
  }
  const forked = [...successorsOf.entries()].filter(([, successors]) => new Set(successors).size > 1);
  if (forked.length > 0) {
    return {
      status: "REVIEW_REQUIRED",
      operativeDocumentId: null,
      predecessorDocumentIds: [],
      relationshipChain: [],
      reviewReason: `More than one document claims to restate the same predecessor (${forked.map(([pred, succs]) => `${pred} restated by [${[...new Set(succs)].join(", ")}]`).join("; ")}) - a genuine fork, never resolved by guessing which is authoritative.`,
    };
  }

  const successors = new Set(edges.map((e) => e.successor));
  const predecessors = new Set(edges.map((e) => e.predecessor));
  const allNodes = new Set([...successors, ...predecessors]);
  const terminalCandidates = [...successors].filter((id) => !predecessors.has(id));

  if (!allNodes.has(baseDocumentId)) {
    // This instrument's own base document is not part of the resolved restatement graph at all - conservative: never claim an operative document for an unrelated chain.
    return { status: "NOT_APPLICABLE", operativeDocumentId: null, predecessorDocumentIds: [], relationshipChain: [], reviewReason: null };
  }

  if (terminalCandidates.length !== 1) {
    return {
      status: "REVIEW_REQUIRED",
      operativeDocumentId: null,
      predecessorDocumentIds: [],
      relationshipChain: [],
      reviewReason:
        terminalCandidates.length === 0
          ? "The restatement relationships resolved for this instrument form a cycle - no document is ever the un-superseded end of the chain, so no document can be safely designated as currently operative."
          : `${terminalCandidates.length} distinct documents (${terminalCandidates.join(", ")}) are each the un-superseded end of a separate restatement chain - this instrument's document family is not a single connected chain, so no single operative document can be safely designated.`,
    };
  }

  const operativeDocumentId = terminalCandidates[0]!;
  const predecessorDocumentIds = [...allNodes].filter((id) => id !== operativeDocumentId);
  const relationshipChain = edges
    .slice()
    .sort((a, b) => (a.effectiveDate && b.effectiveDate ? new Date(a.effectiveDate).getTime() - new Date(b.effectiveDate).getTime() : 0))
    .map((e) => ({ documentId: e.successor, restatesDocumentId: e.predecessor, effectId: e.effectId, confidence: e.confidence, effectiveDate: e.effectiveDate }));

  return { status: "RESOLVED", operativeDocumentId, predecessorDocumentIds, relationshipChain, reviewReason: null };
}
