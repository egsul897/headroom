/**
 * PHASE 4D - the typed effect model: what a stated effect reads, what it writes, and whether the
 * set of effects can be evaluated in one deterministic pass at all.
 *
 * The distinction this module exists to draw (mission §19):
 *
 *   A deterministic one-pass recomputation - a caller states that an input would be different, and
 *   a capacity that depends on that input is evaluated once against the adjusted view.
 *
 *   A fixed point - the amount of an effect depends on a quantity that the same effect changes, so
 *   the answer is the solution of an equation rather than the result of an evaluation.
 *
 * The second is detected from the read/write STRUCTURE of the stated effects, never from what a
 * transaction is called. Phase 4D refuses it: it does not iterate, bisect, converge or solve.
 */
import type { SimulationLimitation, TransactionEffect, TransactionEffectKind } from "./types";
import { RESERVED_EFFECT_KINDS, SUPPORTED_EFFECT_KINDS } from "./types";

export interface EffectClassification {
  effectId: string;
  kind: TransactionEffectKind;
  supported: boolean;
  reason: string;
}

/** Supported-or-explicit. An unknown or reserved effect is never silently ignored. */
export function classifyEffects(effects: readonly TransactionEffect[]): { classified: EffectClassification[]; limitations: SimulationLimitation[] } {
  const limitations: SimulationLimitation[] = [];
  const seen = new Map<string, number>();
  for (const e of effects) seen.set(e.effectId, (seen.get(e.effectId) ?? 0) + 1);
  for (const [id, n] of [...seen.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (n > 1) limitations.push({ code: "DUPLICATE_EFFECT_IDENTITY", message: `effect id ${id} is carried by ${n} effects; proposed ledger identity derives from it, so it must be unique and nothing is chosen between the bearers`, refs: [id] });
  }
  const classified = effects.map((e) => {
    const supported = SUPPORTED_EFFECT_KINDS.includes(e.kind);
    if (!supported) {
      const reason = RESERVED_EFFECT_KINDS[e.kind] ?? `the effect kind ${e.kind} is not part of the Phase-4D vocabulary`;
      limitations.push({ code: "UNSUPPORTED_TRANSACTION_EFFECT", message: `effect ${e.effectId} states ${e.kind}, which this version does not execute: ${reason}`, refs: [e.effectId] });
      return { effectId: e.effectId, kind: e.kind, supported: false, reason };
    }
    return { effectId: e.effectId, kind: e.kind, supported: true, reason: "executed by the typed effect model" };
  });
  return { classified, limitations };
}

/** What each effect writes, as opaque symbols. Never a label, always a target identity. */
export function writesOf(e: TransactionEffect): string[] {
  switch (e.kind) {
    case "CHANGE_METRIC": return [`metric:${e.metricKey}`];
    case "ACTIVATE_EVENT": case "DEACTIVATE_EVENT": return [`event:${e.eventDescription}`];
    case "CONSUME_CAPACITY": return [`capacity:${e.capacityNodeId}`];
    case "RESTORE_CAPACITY": case "SUPERSEDE_LEDGER_USAGE": return [`usage:${e.usageId}`];
    case "APPLY_RECLASSIFICATION": return [`capacity:rule:${e.election.sourceRuleId}`, `capacity:rule:${e.election.destinationRuleId}`];
    default: return [];
  }
}

/**
 * What each effect reads. A capacity draw reads every financial input and event its own capacity
 * expression depends on, taken from the Phase-4B dependency manifest of the rule behind it - which
 * is why a metric adjustment feeding that capacity is visible to this module as structure.
 */
export function readsOf(e: TransactionEffect, capacityReads: ReadonlyMap<string, readonly string[]>): string[] {
  switch (e.kind) {
    case "CONSUME_CAPACITY": return [...(capacityReads.get(e.capacityNodeId) ?? [])];
    case "APPLY_RECLASSIFICATION": return [...(capacityReads.get(`capacity:rule:${e.election.sourceRuleId}`) ?? [])];
    default: return [];
  }
}

export interface EffectCycle {
  effectIds: string[];
  symbols: string[];
  kind: "FIXED_POINT_REQUIRED" | "TRANSACTION_EFFECT_DEPENDENCY_CYCLE";
  explanation: string;
}

/**
 * Detect a cycle over the directed effect-dependency graph.
 *
 * An edge A -> B exists when B reads a symbol A writes, or when B explicitly declares that its own
 * magnitude depends on A. A cycle that passes through a capacity draw reading a value the cycle
 * itself writes is a fixed point; any other cycle is a self-referential specification. Neither is
 * evaluable in one pass, and Phase 4D returns rather than iterating.
 */
export function detectEffectCycles(effects: readonly TransactionEffect[], capacityReads: ReadonlyMap<string, readonly string[]>): EffectCycle[] {
  const byId = new Map(effects.map((e) => [e.effectId, e]));
  const writers = new Map<string, string[]>();
  for (const e of effects) for (const w of writesOf(e)) writers.set(w, [...(writers.get(w) ?? []), e.effectId]);

  const out = new Map<string, { to: string; via: string }[]>();
  const addEdge = (from: string, to: string, via: string) => { if (from !== to || via.startsWith("declared")) out.set(from, [...(out.get(from) ?? []), { to, via }]); };
  for (const e of effects) {
    for (const r of readsOf(e, capacityReads)) for (const w of writers.get(r) ?? []) addEdge(w, e.effectId, r);
    // `e depends on d` means d must be evaluated first, so the edge runs from d to e.
    for (const d of [...(e.dependsOnEffectIds ?? [])].sort()) if (byId.has(d)) addEdge(d, e.effectId, `declared:${d}`);
  }

  const colour = new Map<string, 0 | 1 | 2>();
  const stack: { id: string; via: string | null }[] = [];
  const cycles: EffectCycle[] = [];
  const seen = new Set<string>();
  const walk = (id: string, via: string | null) => {
    const c = colour.get(id) ?? 0;
    if (c === 1) {
      const at = stack.findIndex((s) => s.id === id);
      if (at < 0) return;
      const ring = stack.slice(at);
      const effectIds = ring.map((s) => s.id);
      const symbols = [...ring.slice(1).map((s) => s.via!), ...(via ? [via] : [])].filter(Boolean);
      const key = [...effectIds].sort().join("|");
      if (seen.has(key)) return;
      seen.add(key);
      const writtenInCycle = new Set(effectIds.flatMap((x) => writesOf(byId.get(x)!)));
      const isFixedPoint = effectIds.some((x) => { const e = byId.get(x)!; return e.kind === "CONSUME_CAPACITY" && readsOf(e, capacityReads).some((r) => writtenInCycle.has(r)); });
      cycles.push({
        effectIds, symbols,
        kind: isFixedPoint ? "FIXED_POINT_REQUIRED" : "TRANSACTION_EFFECT_DEPENDENCY_CYCLE",
        explanation: isFixedPoint
          ? `a capacity draw in this cycle depends on a value the same cycle changes, so the amount is the solution of an equation rather than the result of one evaluation; Phase 4D does not iterate or solve`
          : `these effects declare a self-referential dependency, so no evaluation order exists`,
      });
      return;
    }
    if (c === 2) return;
    colour.set(id, 1);
    stack.push({ id, via });
    for (const edge of [...(out.get(id) ?? [])].sort((a, b) => (a.to < b.to ? -1 : a.to > b.to ? 1 : a.via < b.via ? -1 : 1))) walk(edge.to, edge.via);
    stack.pop();
    colour.set(id, 2);
  };
  for (const id of [...byId.keys()].sort()) walk(id, null);
  return cycles;
}

// ---------------------------------------------------------------------------
// Composition conflicts (Phase-4D remediation)
// ---------------------------------------------------------------------------

/**
 * The semantic target an effect ASSIGNS a state to, where two effects naming the same target must
 * agree or the transaction is ambiguous. This is target identity, never an effect id and never a
 * label, so no conflict is ever resolved by array order, map insertion order or id sorting.
 */
export function assignmentTargetOf(e: TransactionEffect): { target: string; assigned: string } | null {
  switch (e.kind) {
    case "ACTIVATE_EVENT": return { target: `event:${e.eventDescription}@${e.asOf ?? "none"}`, assigned: "ACTIVE" };
    case "DEACTIVATE_EVENT": return { target: `event:${e.eventDescription}@${e.asOf ?? "none"}`, assigned: "INACTIVE" };
    case "CHANGE_METRIC": return {
      target: `metric:${e.metricKey}@${e.period ?? "none"}/${e.asOf ?? "none"}`,
      // A SET fixes a value; two SETs of different values disagree. Two DELTAs accumulate and are
      // only reported as disagreeing when one of them is a SET.
      assigned: e.adjustment.kind === "SET" ? `SET:${JSON.stringify(e.adjustment.value)}` : "DELTA",
    };
    default: return null;
  }
}

/** The historical ledger identity an effect claims as its predecessor, if any. */
export function predecessorUsageOf(e: TransactionEffect): string | null {
  return e.kind === "RESTORE_CAPACITY" || e.kind === "SUPERSEDE_LEDGER_USAGE" ? e.usageId : null;
}

/**
 * Structural composition conflicts, detected before anything is evaluated.
 *
 * Each class fails closed rather than picking a winner:
 *  - two effects claiming the same historical usage as predecessor would create competing
 *    successors for one immutable record;
 *  - two effects assigning incompatible states to one event or metric target would otherwise be
 *    resolved by whichever happened to be written last;
 *  - a dependency naming an effect that does not exist is a malformed transaction, not a no-op;
 *  - a dependency pointing forward contradicts the stated sequential order.
 */
export function detectCompositionConflicts(effects: readonly TransactionEffect[]): SimulationLimitation[] {
  const out: SimulationLimitation[] = [];
  const position = new Map<string, number>();
  effects.forEach((e, i) => { if (!position.has(e.effectId)) position.set(e.effectId, i); });

  // Competing successors for one historical usage identity.
  const byPredecessor = new Map<string, string[]>();
  for (const e of effects) {
    const u = predecessorUsageOf(e);
    if (u) byPredecessor.set(u, [...(byPredecessor.get(u) ?? []), e.effectId]);
  }
  for (const [usageId, ids] of [...byPredecessor.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (ids.length > 1) {
      out.push({
        code: "CONFLICTING_LEDGER_SUCCESSOR",
        message: `effects ${[...ids].sort().join(", ")} each claim usage ${usageId} as their predecessor; one historical record may have at most one successor in a single transaction, and nothing is chosen between them`,
        refs: [usageId, ...[...ids].sort()],
      });
    }
  }

  // Incompatible assignments to one event or metric target.
  const byTarget = new Map<string, { effectId: string; assigned: string }[]>();
  for (const e of effects) {
    const t = assignmentTargetOf(e);
    if (t) byTarget.set(t.target, [...(byTarget.get(t.target) ?? []), { effectId: e.effectId, assigned: t.assigned }]);
  }
  for (const [target, xs] of [...byTarget.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const distinct = [...new Set(xs.map((x) => x.assigned))].sort();
    // Several DELTAs against one metric accumulate; they do not disagree.
    const disagrees = distinct.length > 1 || (distinct.length === 1 && distinct[0]!.startsWith("SET:") && xs.length > 1);
    if (!disagrees) continue;
    const ids = xs.map((x) => x.effectId).sort();
    out.push({
      code: target.startsWith("event:") ? "CONFLICTING_EVENT_STATE" : "CONFLICTING_METRIC_ADJUSTMENT",
      message: `effects ${ids.join(", ")} assign incompatible states (${distinct.join(", ")}) to ${target}; the outcome would depend on evaluation order alone, so the transaction is refused rather than resolved`,
      refs: [target, ...ids],
    });
  }

  // Dependency integrity. A dangling edge is never silently dropped.
  for (const e of effects) {
    for (const d of [...(e.dependsOnEffectIds ?? [])].sort()) {
      if (!position.has(d)) {
        out.push({
          code: "INVALID_EFFECT_DEPENDENCY",
          message: `effect ${e.effectId} declares a dependency on ${d}, which this transaction does not carry; a dependency that names nothing is a malformed transaction and is never ignored`,
          refs: [e.effectId, d],
        });
        continue;
      }
      const here = position.get(e.effectId)!;
      const there = position.get(d)!;
      if (there > here) {
        out.push({
          code: "EFFECT_DEPENDENCY_CONTRADICTS_ORDER",
          message: `effect ${e.effectId} is stated at position ${here + 1} but depends on ${d} at position ${there + 1}; effects apply in the stated order, so a dependency may not point forward`,
          refs: [e.effectId, d],
        });
      }
    }
  }
  return out;
}
