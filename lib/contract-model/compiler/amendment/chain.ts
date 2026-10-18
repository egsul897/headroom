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

export type ComputeOperativeDocumentOptions = {
  /**
   * When set, only restatement edges effective on or before this ISO date
   * participate in tip selection. Future-dated restatements must not become
   * the operative tip for a historical as-of query (PAI-01).
   */
  asOfDate?: string | null;
};

/**
 * POST-3F.2 remediation (Unit B3) - see types.ts's own OperativeDocumentResolution
 * doc comment for the full rationale. Builds a directed graph over
 * RESOLVED RESTATE_AGREEMENT effects (successor = amendmentDocumentId "restates"
 * predecessor = target.targetDocumentId) and finds its own un-superseded
 * end - the document nothing else restates. Fails safe (REVIEW_REQUIRED,
 * never a guess) on any unresolved target, non-RESOLVED edge with a named
 * target, fork, or cycle; NOT_APPLICABLE when this instrument has no
 * restatement activity at all (or none effective as of `asOfDate`).
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
export function computeOperativeDocument(
  baseDocumentId: string,
  allEffects: AmendmentEffectCandidate[],
  unresolvedRestatementEffects: AmendmentEffectCandidate[] = [],
  options: ComputeOperativeDocumentOptions = {},
): OperativeDocumentResolution {
  const restatementEffects = allEffects.filter((e) => e.operation === "RESTATE_AGREEMENT");
  const unresolvedRestatements = unresolvedRestatementEffects.filter((e) => e.operation === "RESTATE_AGREEMENT");

  if (restatementEffects.length === 0 && unresolvedRestatements.length === 0) {
    return { status: "NOT_APPLICABLE", operativeDocumentId: null, predecessorDocumentIds: [], relationshipChain: [], reviewReason: null };
  }

  // Missing target document always blocks (genuine unknown link).
  const notResolvedTarget = [...restatementEffects, ...unresolvedRestatements].filter(
    (e) => e.target.kind !== "DOCUMENT" || !e.target.targetDocumentId,
  );
  if (notResolvedTarget.length > 0) {
    return {
      status: "REVIEW_REQUIRED",
      operativeDocumentId: null,
      predecessorDocumentIds: [],
      relationshipChain: [],
      reviewReason: `${notResolvedTarget.length} restatement effect(s) relevant to this instrument have an unresolved target document - which whole document currently governs cannot be determined without guessing (effect(s): ${notResolvedTarget.map((e) => e.effectId).join(", ")}).`,
    };
  }

  // PAI-02: REVIEW_REQUIRED / non-RESOLVED edges with a named target must not
  // produce a confident RESOLVED tip. Inferential chronological predecessors
  // remain provision-level REVIEW_REQUIRED — the whole-document answer follows.
  const nonResolvedEdges = [...restatementEffects, ...unresolvedRestatements].filter((e) => e.status !== "RESOLVED");
  if (nonResolvedEdges.length > 0) {
    return {
      status: "REVIEW_REQUIRED",
      operativeDocumentId: null,
      predecessorDocumentIds: [],
      relationshipChain: [],
      reviewReason: `${nonResolvedEdges.length} restatement effect(s) are not RESOLVED (status: ${[...new Set(nonResolvedEdges.map((e) => e.status))].join(", ")}) — which whole document currently governs cannot be designated without human confirmation (effect(s): ${nonResolvedEdges.map((e) => e.effectId).join(", ")}).`,
    };
  }

  const asOf = options.asOfDate ?? null;
  // EffectiveDateResult.date is the date AS EXTRACTED from document text -
  // a human-format string ("August 9, 2022") from the real detector, ISO
  // only in hand-built fixtures. Every sibling consumer parses it before
  // comparing (buildProvisionChain's sort, buildProvisionView's
  // applied-chain filter both use `new Date(...)`); comparing it against
  // an ISO as-of date as a raw string is lexicographic nonsense
  // ("August 9, 2022" > "2026-01-01" as strings) that silently discarded
  // every real restatement edge as "future-dated" and collapsed RESOLVED
  // chains to NOT_APPLICABLE - no restatement was ever recognized once an
  // as-of date was supplied. Parse both sides. A non-null date string
  // that cannot be parsed at all is treated exactly like a missing date:
  // it cannot be placed on a timeline, so it fails closed below.
  const parseDateMs = (d: string | null | undefined): number | null => {
    if (!d) return null;
    const ms = new Date(d).getTime();
    return Number.isNaN(ms) ? null : ms;
  };
  const asOfMs = asOf ? parseDateMs(asOf) : null;
  if (asOf && asOfMs === null) {
    return {
      status: "REVIEW_REQUIRED",
      operativeDocumentId: null,
      predecessorDocumentIds: [],
      relationshipChain: [],
      reviewReason: `The as-of date supplied for this operative-document query ("${asOf}") could not be parsed as a date - restatement edges cannot be placed relative to it, so no whole document can be safely designated as currently operative.`,
    };
  }
  // PAI-01: only edges effective on or before asOf participate when asOf is supplied.
  // Undated/unparseable edges with asOf supplied cannot be placed on a timeline — fail closed.
  const datedForAsOf = restatementEffects.filter((e) => {
    if (!asOf) return true;
    const ms = parseDateMs(e.effectiveDate.date);
    if (ms === null) return false;
    return ms <= asOfMs!;
  });
  if (asOf) {
    const undated = restatementEffects.filter((e) => parseDateMs(e.effectiveDate.date) === null);
    if (undated.length > 0) {
      return {
        status: "REVIEW_REQUIRED",
        operativeDocumentId: null,
        predecessorDocumentIds: [],
        relationshipChain: [],
        reviewReason: `${undated.length} restatement effect(s) lack a usable effective date and cannot be placed relative to as-of ${asOf} (effect(s): ${undated.map((e) => e.effectId).join(", ")}).`,
      };
    }
    if (datedForAsOf.length === 0) {
      // Future-only restatements: nothing is yet operative as a restatement tip.
      return { status: "NOT_APPLICABLE", operativeDocumentId: null, predecessorDocumentIds: [], relationshipChain: [], reviewReason: null };
    }
  }

  const graphEffects = asOf ? datedForAsOf : restatementEffects;
  const edges = graphEffects.map((e) => ({
    successor: e.amendmentDocumentId,
    predecessor: e.target.targetDocumentId!,
    effectId: e.effectId,
    confidence: e.confidence,
    effectiveDate: e.effectiveDate.date,
  }));

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
