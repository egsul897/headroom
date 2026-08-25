/**
 * Phase 4 - permission graph loading and evaluation.
 *
 * Builds an in-memory index over a company's Permission/PermissionRelationship
 * rows (design doc §C.3) and provides generic evaluators for:
 *  - which relationship (if any) holds between two permissions, or within an
 *    ALTERNATIVE/MUTUALLY_EXCLUSIVE group;
 *  - AUTOMATIC_LINKED_PERMISSION / EQUAL_AND_RATABLE_PULLUP traversal (which
 *    lien legs an included debt leg pulls in automatically);
 *  - PARAMETER_ADJUSTMENT_TRIGGER edges out of a permission;
 *  - dynamic-activation `StatePredicate` evaluation (design doc §I).
 *
 * Every relationship/predicate evaluated here is looked up by data (a real
 * PermissionRelationship/RuleActivationCondition row with its own
 * `sourceProvision`), never inferred or hardcoded per company/document/
 * basket. An unestablished relationship between two permissions is reported
 * as `undefined`/`"UNKNOWN"`, never silently treated as any of the other,
 * more specific relationship types, and never as `Infinity`/unlimited.
 */

import type { ActivationState, Permission, PermissionRelationship, RuleActivationCondition, SeriesComparator, StatePredicate } from "./types";

// ---------------------------------------------------------------------------
// Graph construction
// ---------------------------------------------------------------------------

export interface PermissionGraph {
  permissionsById: Map<string, Permission>;
  relationships: PermissionRelationship[];
  relationshipsByFrom: Map<string, PermissionRelationship[]>;
  relationshipsByTo: Map<string, PermissionRelationship[]>;
  /** groupKey -> every permission id that participates in a relationship carrying that group key (either side). */
  groupMembers: Map<string, Set<string>>;
}

export function buildPermissionGraph(permissions: Permission[], relationships: PermissionRelationship[]): PermissionGraph {
  const permissionsById = new Map(permissions.map((p) => [p.id, p]));
  const relationshipsByFrom = new Map<string, PermissionRelationship[]>();
  const relationshipsByTo = new Map<string, PermissionRelationship[]>();
  const groupMembers = new Map<string, Set<string>>();

  for (const r of relationships) {
    if (!permissionsById.has(r.fromPermissionId) || !permissionsById.has(r.toPermissionId)) {
      throw new Error(`PermissionRelationship ${r.id} references a permission id not present in the supplied permission set.`);
    }
    if (!relationshipsByFrom.has(r.fromPermissionId)) relationshipsByFrom.set(r.fromPermissionId, []);
    relationshipsByFrom.get(r.fromPermissionId)!.push(r);
    if (!relationshipsByTo.has(r.toPermissionId)) relationshipsByTo.set(r.toPermissionId, []);
    relationshipsByTo.get(r.toPermissionId)!.push(r);

    if (r.groupKey) {
      if (!groupMembers.has(r.groupKey)) groupMembers.set(r.groupKey, new Set());
      groupMembers.get(r.groupKey)!.add(r.fromPermissionId);
      groupMembers.get(r.groupKey)!.add(r.toPermissionId);
    }
  }

  return { permissionsById, relationships, relationshipsByFrom, relationshipsByTo, groupMembers };
}

/** Every relationship (in either direction) directly connecting two permission ids - deliberately plural: two permissions may carry more than one relationship row is NOT expected in well-formed data, but this never silently picks one if it happens. */
export function relationshipsBetween(graph: PermissionGraph, aId: string, bId: string): PermissionRelationship[] {
  const fromA = graph.relationshipsByFrom.get(aId) ?? [];
  const toA = graph.relationshipsByTo.get(aId) ?? [];
  return [...fromA, ...toA].filter((r) => (r.fromPermissionId === bId || r.toPermissionId === bId) && r.fromPermissionId !== r.toPermissionId);
}

/**
 * The single relationship type governing how two permissions combine, or
 * `undefined` if no PermissionRelationship row exists between them at all -
 * the fail-closed default (design doc §C.3 `UNKNOWN`'s note: "never
 * inferred"). Callers must treat `undefined` and the explicit `"UNKNOWN"`
 * enum value identically: neither permits combining the two permissions in
 * an election without the resulting election being `NOT_EVALUABLE`
 * (design doc §E.4 step 6 / §U.3).
 */
export function relationshipTypeBetween(graph: PermissionGraph, aId: string, bId: string): PermissionRelationship["relationshipType"] | undefined {
  const rels = relationshipsBetween(graph, aId, bId);
  if (rels.length === 0) return undefined;
  // Multiple distinct relationship rows between the same pair is a data
  // error in a well-formed fixture; surface it rather than silently picking
  // one, since disagreeing rows would otherwise be a silent double-count/
  // contradiction risk.
  const distinctTypes = new Set(rels.map((r) => r.relationshipType));
  if (distinctTypes.size > 1) {
    throw new Error(`Permissions ${aId} and ${bId} are connected by ${distinctTypes.size} conflicting relationship types: ${[...distinctTypes].join(", ")}.`);
  }
  return rels[0]!.relationshipType;
}

/** Every other permission id in the same ALTERNATIVE (or MUTUALLY_EXCLUSIVE) group as `permissionId`, via either a shared groupKey or a direct pairwise relationship of the given type. */
export function groupPeers(graph: PermissionGraph, permissionId: string, relationshipType: "ALTERNATIVE" | "MUTUALLY_EXCLUSIVE"): Set<string> {
  const peers = new Set<string>();
  for (const r of [...(graph.relationshipsByFrom.get(permissionId) ?? []), ...(graph.relationshipsByTo.get(permissionId) ?? [])]) {
    if (r.relationshipType !== relationshipType) continue;
    if (r.groupKey && graph.groupMembers.has(r.groupKey)) {
      for (const member of graph.groupMembers.get(r.groupKey)!) if (member !== permissionId) peers.add(member);
    } else {
      const other = r.fromPermissionId === permissionId ? r.toPermissionId : r.fromPermissionId;
      peers.add(other);
    }
  }
  return peers;
}

/** Lien (or other) permissions automatically pulled in once `debtPermissionId` is included in an election - AUTOMATIC_LINKED_PERMISSION and EQUAL_AND_RATABLE_PULLUP edges, design doc §C.3/§E.3. */
export function automaticallyLinkedPermissions(graph: PermissionGraph, debtPermissionId: string): { permissionId: string; relationship: PermissionRelationship }[] {
  const out: { permissionId: string; relationship: PermissionRelationship }[] = [];
  for (const r of graph.relationshipsByFrom.get(debtPermissionId) ?? []) {
    if (r.relationshipType === "AUTOMATIC_LINKED_PERMISSION" || r.relationshipType === "EQUAL_AND_RATABLE_PULLUP") {
      out.push({ permissionId: r.toPermissionId, relationship: r });
    }
  }
  return out;
}

/** PARAMETER_ADJUSTMENT_TRIGGER edges out of `permissionId` - design doc §C.3/§D `parameterAdjustmentsTriggered`. */
export function parameterAdjustmentTriggersFrom(graph: PermissionGraph, permissionId: string): PermissionRelationship[] {
  return (graph.relationshipsByFrom.get(permissionId) ?? []).filter((r) => r.relationshipType === "PARAMETER_ADJUSTMENT_TRIGGER");
}

// ---------------------------------------------------------------------------
// §I - Dynamic activation predicate evaluation
// ---------------------------------------------------------------------------

function compare(comparator: SeriesComparator, actual: number | string | boolean, threshold: number | string | boolean): boolean {
  switch (comparator) {
    case "gte":
      return actual >= threshold;
    case "lte":
      return actual <= threshold;
    case "gt":
      return actual > threshold;
    case "lt":
      return actual < threshold;
    case "eq":
      return actual === threshold;
    default: {
      const exhaustive: never = comparator;
      throw new Error(`Unknown comparator: ${String(exhaustive)}`);
    }
  }
}

/** Every entry in a named series at or before `asOf`, sorted most-recent-first. `undefined` if the series is explicitly marked unknown or has no entries at all with data present (distinguished from "series exists but empty", which is a real "never observed" fact, not missing data). */
function seriesAsOf(state: ActivationState, seriesKey: string, asOf: Date): { asOf: Date; value: number | string | boolean }[] | "UNKNOWN" {
  if (state.unknownKeys.has(seriesKey)) return "UNKNOWN";
  const entries = state.series[seriesKey] ?? [];
  return entries.filter((e) => e.asOf.getTime() <= asOf.getTime()).sort((a, b) => b.asOf.getTime() - a.asOf.getTime());
}

/**
 * Evaluates one `StatePredicate` against `ActivationState` as of a date.
 * Fail-closed per design doc §I: missing/unresolved data returns `"UNKNOWN"`,
 * never a silent default in either direction. This is the ONLY place
 * StatePredicate semantics are interpreted - no per-permission/per-company
 * override exists anywhere else in the solver.
 */
export function evaluateStatePredicate(predicate: StatePredicate, state: ActivationState, asOf: Date): boolean | "UNKNOWN" {
  switch (predicate.kind) {
    case "POINT_IN_TIME": {
      const entries = seriesAsOf(state, predicate.seriesKey, asOf);
      if (entries === "UNKNOWN" || entries.length === 0) return "UNKNOWN";
      return compare(predicate.comparator, entries[0]!.value, predicate.threshold);
    }
    case "CONTINUITY_WINDOW": {
      const entries = seriesAsOf(state, predicate.seriesKey, asOf);
      if (entries === "UNKNOWN") return "UNKNOWN";
      if (entries.length < predicate.minConsecutivePeriods) return "UNKNOWN"; // insufficient history to confirm or deny the window
      const window = entries.slice(0, predicate.minConsecutivePeriods);
      return window.every((e) => compare(predicate.comparator, e.value, predicate.threshold));
    }
    case "EVENT_TRIGGERED": {
      if (state.unknownKeys.has(`event:${predicate.sinceEvent}`)) return "UNKNOWN";
      const sinceOccurrences = state.events.filter((e) => e.type === predicate.sinceEvent && e.asOf.getTime() <= asOf.getTime());
      if (sinceOccurrences.length === 0) return false; // never triggered - a confirmed "not active", not unknown
      const latestSince = sinceOccurrences.reduce((a, b) => (b.asOf > a.asOf ? b : a));
      if (!predicate.until) return true;
      const untilOccurrences = state.events.filter(
        (e) => e.type === predicate.until && e.asOf.getTime() <= asOf.getTime() && e.asOf.getTime() > latestSince.asOf.getTime()
      );
      return untilOccurrences.length === 0;
    }
    case "USAGE_LIMITED": {
      if (state.unknownKeys.has(predicate.usageKey)) return "UNKNOWN";
      const uses = (state.usageCounts[predicate.usageKey] ?? []).filter((u) => u.asOf.getTime() <= asOf.getTime());
      if (uses.length >= predicate.maxUses) return false;
      if (predicate.minSpacingPeriods && uses.length > 0) {
        const mostRecent = uses.reduce((a, b) => (b.asOf > a.asOf ? b : a));
        const periodMs = (predicate.periodUnit === "DAY" ? 1 : 91) * 24 * 60 * 60 * 1000;
        const periodsSince = (asOf.getTime() - mostRecent.asOf.getTime()) / periodMs;
        if (periodsSince < predicate.minSpacingPeriods) return false;
      }
      return true;
    }
    default: {
      const exhaustive: never = predicate;
      throw new Error(`Unknown StatePredicate kind: ${String((exhaustive as StatePredicate).kind)}`);
    }
  }
}

export type ParameterResolutionOutcome = { status: "RESOLVED"; value: number } | { status: "UNKNOWN" };

export function resolveParameterValue(condition: RuleActivationCondition, state: ActivationState, asOf: Date): ParameterResolutionOutcome {
  if (!condition.parameterResolution) return { status: "UNKNOWN" };
  const entries = seriesAsOf(state, condition.parameterResolution.seriesKey, asOf);
  if (entries === "UNKNOWN" || entries.length === 0) return { status: "UNKNOWN" };
  const current = entries[0]!.value;
  if (typeof current !== "number") return { status: "UNKNOWN" };
  const sorted = [...condition.parameterResolution.steps].sort((a, b) => b.thresholdAtLeast - a.thresholdAtLeast);
  const step = sorted.find((s) => current >= s.thresholdAtLeast);
  return { status: "RESOLVED", value: step ? step.value : condition.parameterResolution.belowAllStepsValue };
}

/** Every RuleActivationCondition applicable to a given permission (directly, or company-wide, or via a named covenant section id it names). */
export function activationConditionsFor(
  conditions: RuleActivationCondition[],
  permissionId: string,
  sectionRefs: string[]
): RuleActivationCondition[] {
  return conditions.filter(
    (c) => c.appliesTo.companyWide || c.appliesTo.permissionId === permissionId || (c.appliesTo.covenantSectionIds ?? []).some((s) => sectionRefs.includes(s))
  );
}

/**
 * Resolves whether a permission is APPLICABILITY-active as of a date,
 * folding every applicable RuleActivationCondition with `effect ===
 * "APPLICABILITY"` (AND-combined - all must resolve active for the
 * permission to be active). Fail-closed per design doc §I: an `"UNKNOWN"`
 * predicate never defaults to "active" for a springing/liquidity-gated rule,
 * and never defaults to "inactive" for a whole-package suspension rule -
 * both surface as `"UNKNOWN"` here, and it is the caller's (election
 * layer's) job to turn that into `REVIEW_REQUIRED`, never a silent
 * direction-specific default.
 */
export function resolveApplicability(
  conditions: RuleActivationCondition[],
  permissionId: string,
  sectionRefs: string[],
  state: ActivationState,
  asOf: Date
): { active: boolean | "UNKNOWN"; evaluated: { conditionId: string; result: boolean | "UNKNOWN" }[] } {
  const applicable = activationConditionsFor(conditions, permissionId, sectionRefs).filter((c) => c.effect === "APPLICABILITY");
  if (applicable.length === 0) return { active: true, evaluated: [] };
  const evaluated = applicable.map((c) => ({ conditionId: c.id, result: evaluateStatePredicate(c.predicate, state, asOf) }));
  if (evaluated.some((e) => e.result === "UNKNOWN")) return { active: "UNKNOWN", evaluated };
  return { active: evaluated.every((e) => e.result === true), evaluated };
}
