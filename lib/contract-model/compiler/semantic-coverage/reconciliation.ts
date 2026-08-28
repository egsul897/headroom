/**
 * Phase 3E §157 - reconciliation: source inventory vs compiled/verified IR.
 * This is a RECONCILIATION-STAGE module (per types.ts's own Independence
 * Contract carve-out) - the only kind of file in this directory allowed to
 * read Phase 2B/3B/3C real output. It never generates or edits the source
 * inventory; it only classifies, per FROZEN unit, whether the compiled/
 * verified IR adequately represents it. Callers MUST have already frozen
 * the inventory (freeze.ts) before calling this module - see types.ts's
 * FREEZE-BEFORE-LOAD contract.
 *
 * DISTINCTION FROM PHASE 3C's OWN reconciliation.ts: that module compares
 * ONE candidate's source-side economic inventory against THAT SAME
 * candidate's own compiled IR - it has no way to notice a semantic unit for
 * which no candidate was ever discovered at all. This module operates over
 * the WHOLE document's frozen unit inventory and Phase 2B's REAL discovery
 * output, so "no candidate was ever discovered here" is itself a real,
 * classifiable outcome (DANGEROUS_UNACCOUNTED / NO_CANDIDATE_EVER_DISCOVERED)
 * - the central capability Phase 3C cannot have by construction.
 *
 * Reuses Phase 3C's own ir-inventory.ts (buildIrInventory) directly - a
 * pure, judgment-free flattening of IRRule/IRDefinition into typed items,
 * not a verification conclusion - rather than re-deriving a second IR
 * walker for the same expression tree shapes.
 */
import type { DiscoveredCandidate } from "../discovery/types";
import type { IRDefinition, IRRule } from "../../ir/types";
import { buildIrInventory } from "../semantic-verification/ir-inventory";
import type { IrInventoryItem } from "../semantic-verification/types";
import { computeCoverageEntryId } from "./identity";
import type { DangerousUnaccountedReason, DangerousUnaccountedSemanticUnit, FrozenSourceInventory, MaterialSemanticUnit, SemanticCoverageState, SemanticUnitCoverageEntry } from "./types";
import { SEMANTIC_COVERAGE_ALGORITHM_VERSION } from "./types";

const NUMERIC_TOLERANCE_RELATIVE = 1e-6;

function numbersMatch(a: number, b: number): boolean {
  if (a === 0 || b === 0) return Math.abs(a - b) < 1e-9;
  return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)) < NUMERIC_TOLERANCE_RELATIVE;
}

/** Independently authored (never imported from source-inventory.ts's own private parseMoney - a small, generic utility, not compiler reasoning). Extracts the single most prominent numeric economic value a MaterialSemanticUnit's own excerpt states, if any. */
export function extractNumericValue(text: string): number | null {
  const money = text.match(/[$£€]\s?([\d,]+(?:\.\d+)?)/);
  if (money) {
    const value = Number(money[1]!.replace(/,/g, ""));
    if (Number.isFinite(value)) return value;
  }
  const pct = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pct) {
    const value = Number(pct[1]);
    if (Number.isFinite(value)) return value / 100;
  }
  return null;
}

/** Generic containment check (no company/package-specific logic): a discovered candidate covers a unit when the unit's own structural node IS one of the candidate's nodes, or is nested under one (task's own real drafting pattern: "6.01(a)" nests under "6.01"). Raw-source-fallback-anchored units (no structural node) are never covered by any candidate - Phase 2B's own discovery never saw that text, which is itself real, material information this reconciliation surfaces rather than approximates. */
function candidatesCoveringUnit(unit: MaterialSemanticUnit, candidates: DiscoveredCandidate[]): DiscoveredCandidate[] {
  const anchor = unit.anchors[0];
  if (!anchor || !anchor.structuralNodeKey) return [];
  return candidates.filter((c) => c.documentId === anchor.documentId && c.structuralNodeKeys.some((ck) => anchor.structuralNodeKey === ck || anchor.structuralNodeKey!.startsWith(ck)));
}

/** Finds the compiled IR rule whose own provenance citation corresponds to this unit's anchor - the anchor-based matching this reconciliation relies on primarily (a stronger, more specific signal than "does this number appear ANYWHERE in the whole document's compiled IR"). */
function findAnchoredRule(unit: MaterialSemanticUnit, rules: IRRule[]): IRRule | null {
  const citation = unit.anchors[0]?.sourceCitation;
  if (!citation) return null;
  return rules.find((r) => {
    const rc = r.provenance?.sourceCitation;
    return rc ? rc === citation || citation.startsWith(rc) || rc.startsWith(citation) : false;
  }) ?? null;
}

export interface CompiledCandidateResult {
  candidateRef: string;
  rules: IRRule[];
  definitions: IRDefinition[];
}

export interface ReconciliationInput {
  frozenInventory: FrozenSourceInventory;
  /** Every candidate Phase 2B discovered for this document/package - used only to check whether a unit's own source region was ever discovered at all. */
  discoveredCandidates: DiscoveredCandidate[];
  /** Every compiled result for every candidate that WAS compiled. */
  compiledResults: CompiledCandidateResult[];
  /** candidateRefs for which Phase 3C ran and found no unresolved MATERIAL finding - promotes FULLY_REPRESENTED_REVIEW_REQUIRED to FULLY_REPRESENTED_VERIFIED for units anchored to that candidate's rules. */
  verifiedCandidateRefs: Set<string>;
}

export interface ReconciliationOutput {
  entries: SemanticUnitCoverageEntry[];
  dangerousUnaccounted: DangerousUnaccountedSemanticUnit[];
}

function dangerous(unit: MaterialSemanticUnit, reason: DangerousUnaccountedReason): DangerousUnaccountedSemanticUnit | null {
  if (unit.materiality !== "CRITICAL" && unit.materiality !== "MATERIAL") return null;
  return { semanticUnitId: unit.semanticUnitId, reason, materiality: unit.materiality, sourceEvidence: unit.excerptText, auditorReasoning: `no adequate compiled/verified IR representation found for this ${unit.materiality} unit, and it was not itself surfaced as unresolved/review-required (${reason})` };
}

function entry(unit: MaterialSemanticUnit, coverageState: SemanticCoverageState, matchedIrIds: string[], missingEconomicElement: string | null, reasoning: string): SemanticUnitCoverageEntry {
  return { semanticUnitId: unit.semanticUnitId, coverageState, matchedIrIds, missingEconomicElement, reasoning, materiality: unit.materiality, coverageAlgorithmVersion: SEMANTIC_COVERAGE_ALGORITHM_VERSION };
}

function reconcileOneUnit(unit: MaterialSemanticUnit, input: ReconciliationInput): { entry: SemanticUnitCoverageEntry; dangerous: DangerousUnaccountedSemanticUnit | null } {
  const coveringCandidates = candidatesCoveringUnit(unit, input.discoveredCandidates);

  if (coveringCandidates.length === 0) {
    if (unit.materiality === "INFORMATIONAL") return { entry: entry(unit, "UNREPRESENTED", [], null, "no discovered candidate covers this unit's source region, but the unit itself is INFORMATIONAL - not treated as dangerous"), dangerous: null };
    if (unit.materiality === "REVIEW_UNCERTAIN") return { entry: entry(unit, "AMBIGUOUS_MATCH", [], null, "no discovered candidate covers this unit's source region, and the unit's own materiality is uncertain - requires human review rather than a confident dangerous classification"), dangerous: null };
    return { entry: entry(unit, "UNREPRESENTED", [], null, "no Phase 2B discovered candidate was ever generated covering this unit's own source region - this is a discovery-stage gap, not a compiler-stage one"), dangerous: dangerous(unit, "NO_CANDIDATE_EVER_DISCOVERED") };
  }

  const compiledByRef = new Map(input.compiledResults.map((c) => [c.candidateRef, c]));
  const compiledCovering = coveringCandidates.map((c) => compiledByRef.get(c.discoveryId)).filter((c): c is CompiledCandidateResult => c !== undefined);

  if (compiledCovering.length === 0) {
    if (unit.materiality === "INFORMATIONAL" || unit.materiality === "REVIEW_UNCERTAIN") return { entry: entry(unit, "SOURCE_CONTEXT_INCOMPLETE", [], null, "a candidate was discovered for this unit's region but never compiled to IR"), dangerous: null };
    return { entry: entry(unit, "UNREPRESENTED", [], null, "a candidate was discovered for this unit's region but never compiled to IR - discovery succeeded, compilation never ran"), dangerous: dangerous(unit, "CANDIDATE_DISCOVERED_NEVER_COMPILED") };
  }

  const allCompiledRules = compiledCovering.flatMap((c) => c.rules);
  const allCompiledDefinitions = compiledCovering.flatMap((c) => c.definitions);
  const anchoredRule = findAnchoredRule(unit, allCompiledRules);
  const numericValue = extractNumericValue(unit.excerptText);

  if (!anchoredRule) {
    // No rule anchored specifically to this unit's own citation. Fall back to a
    // whole-candidate-set numeric search (task's own generalized-shape signal,
    // mirroring Phase 3C's reconcileNumericItems) before concluding the unit is
    // unaccounted for - it may legitimately have been folded into a broader rule.
    if (numericValue !== null) {
      const items: IrInventoryItem[] = compiledCovering.flatMap((c) => buildIrInventory(c.candidateRef, c.rules, c.definitions).items);
      const matched = items.filter((i) => (i.kind === "AMOUNT" || i.kind === "PERCENT" || i.kind === "RATIO") && i.numericValue !== null && numbersMatch(i.numericValue, numericValue));
      if (matched.length > 0) return { entry: entry(unit, "FULLY_REPRESENTED_REVIEW_REQUIRED", matched.map((m) => m.ruleOrDefinitionId), null, `no rule is anchored to this unit's exact citation, but its numeric value ${numericValue} appears elsewhere in the covering candidate(s)' compiled IR - review required to confirm this is the same economic figure, not a coincidental match`), dangerous: null };
    }
    if (unit.materiality === "INFORMATIONAL" || unit.materiality === "REVIEW_UNCERTAIN") return { entry: entry(unit, "AMBIGUOUS_MATCH", [], null, "no compiled rule is anchored to this unit's citation and no matching numeric value was found elsewhere"), dangerous: null };
    return { entry: entry(unit, "UNREPRESENTED", [], null, "the covering candidate(s) were compiled, but no compiled rule is anchored to this unit's own citation and no matching economic value appears anywhere in their IR"), dangerous: dangerous(unit, "COMPILED_BUT_UNIT_OMITTED_FROM_IR") };
  }

  const verified = coveringCandidates.some((c) => input.verifiedCandidateRefs.has(c.discoveryId));
  const fullState: SemanticCoverageState = verified ? "FULLY_REPRESENTED_VERIFIED" : "FULLY_REPRESENTED_REVIEW_REQUIRED";

  if (numericValue !== null) {
    const ruleItems = buildIrInventory("anchored", [anchoredRule], []).items;
    const matched = ruleItems.some((i) => (i.kind === "AMOUNT" || i.kind === "PERCENT" || i.kind === "RATIO") && i.numericValue !== null && numbersMatch(i.numericValue, numericValue));
    if (matched) return { entry: entry(unit, fullState, [anchoredRule.ruleId], null, `anchored compiled rule ${anchoredRule.ruleId} carries a matching numeric value ${numericValue}`), dangerous: null };
    return { entry: entry(unit, "PARTIALLY_REPRESENTED", [anchoredRule.ruleId], "capacityExpression", `a compiled rule (${anchoredRule.ruleId}) is anchored to this unit's own citation, but its own numeric value ${numericValue} does not appear in that rule's capacityExpression or elsewhere in it`), dangerous: null };
  }

  // Non-numeric unit (condition/definitional/qualitative permission/exception) with an
  // anchored rule found: this deterministic reconciliation cannot yet verify condition/
  // exception/entity-scope fidelity at fine grain (a disclosed v1 limitation, not a false
  // claim of full verification) - it reports the anchored match at REVIEW_REQUIRED
  // confidence rather than either silently passing it as VERIFIED or falsely flagging it
  // UNREPRESENTED merely because deterministic fine-grained matching is out of scope here.
  return { entry: entry(unit, fullState === "FULLY_REPRESENTED_VERIFIED" ? "FULLY_REPRESENTED_VERIFIED" : "FULLY_REPRESENTED_REVIEW_REQUIRED", [anchoredRule.ruleId], null, `a compiled rule (${anchoredRule.ruleId}) is anchored to this non-numeric unit's own citation - fine-grained condition/exception/entity-scope fidelity is not deterministically re-checked by this reconciliation pass (relies on Phase 3C verification, if it ran, for that)`), dangerous: null };
}

export function reconcileFrozenInventory(input: ReconciliationInput): ReconciliationOutput {
  const entries: SemanticUnitCoverageEntry[] = [];
  const dangerousUnaccounted: DangerousUnaccountedSemanticUnit[] = [];
  for (const unit of input.frozenInventory.units) {
    const result = reconcileOneUnit(unit, input);
    entries.push(result.entry);
    if (result.dangerous) dangerousUnaccounted.push(result.dangerous);
  }
  return { entries, dangerousUnaccounted };
}

/** Convenience id for a coverage entry, exported so callers can cite a stable identity alongside the entry itself when persisting/reporting. */
export function coverageEntryId(entry: SemanticUnitCoverageEntry): string {
  return computeCoverageEntryId(entry.semanticUnitId, entry.coverageState);
}
