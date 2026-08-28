/**
 * Phase 3E §159 - cross-section relationship + cross-document/operative-
 * state audits. A declared reconciliation-stage module (reads compiled IR
 * and Phase 2G's real OperativeContractState).
 *
 * Two distinct jobs, kept separate:
 *
 * 1. auditCrossSectionRelationships - a shared cap, reclassification/
 *    redesignation right, cross-reference permission, or incorporated
 *    condition connects TWO OR MORE units/rules. reconciliation.ts's own
 *    per-unit check can only ask "does THIS unit's own anchored rule carry
 *    a shared-cap/dependency item" - it cannot ask "does the relationship
 *    this unit's signal implies actually connect to a REAL second rule
 *    anywhere in this document's compiled IR." This module answers the
 *    second, document-wide question - the concrete risk being two baskets
 *    that each individually look FULLY_REPRESENTED while the shared
 *    aggregate limit between them was silently dropped (a real
 *    double-counting exposure no per-unit check alone can see).
 *
 * 2. auditOperativeStateForUnits - "operative state is authoritative,
 *    never credit stale historical text" (task's own instruction, North
 *    Star §10, Architecture Invariants #13). Reuses Phase 2G's real
 *    OperativeContractState directly rather than re-deriving amendment
 *    precedence logic a second time - this module only ever asks whether
 *    the source text a unit was inventoried from is STILL the operative
 *    text as of the audit date, never re-computes precedence itself.
 */
import type { IRRule } from "../../ir/types";
import type { OperativeContractState } from "../amendment/types";
import { buildIrInventory } from "../semantic-verification/ir-inventory";
import type { CrossSectionRelationshipFinding, CrossSectionRelationshipType, MaterialSemanticUnit, OperativeStateAuditFinding } from "./types";

const RELATIONSHIP_SIGNAL_NAMES: Record<CrossSectionRelationshipType, string[]> = {
  SHARED_CAP: ["shared_cap"],
  RECLASSIFICATION_OR_REDESIGNATION: ["reclassification", "redesignation"],
  CROSS_REFERENCE_PERMISSION: ["subject_to", "notwithstanding"],
  INCORPORATED_CONDITION: ["so_long_as", "provided_that"],
};

function irEncodesRelationship(items: ReturnType<typeof buildIrInventory>["items"], type: CrossSectionRelationshipType): boolean {
  switch (type) {
    case "SHARED_CAP":
      return items.some((i) => i.kind === "SHARED_CAP_RELATIONSHIP");
    case "RECLASSIFICATION_OR_REDESIGNATION":
      return items.some((i) => i.kind === "DEPENDENCY" && (i.textValue?.includes("RECLASSIFIABLE_TO") || i.textValue?.includes("REDESIGNATES_TO")));
    case "CROSS_REFERENCE_PERMISSION":
      return items.some((i) => i.kind === "DEPENDENCY" && i.textValue?.startsWith("RULE_REFERENCE"));
    case "INCORPORATED_CONDITION":
      return items.some((i) => i.kind === "CONDITION");
  }
}

/**
 * Document-wide (never per-unit) check: for each relationship type where at
 * least one unit's own detected signal implies it should exist somewhere in
 * this document, confirms a corresponding IR-level relationship is actually
 * present anywhere among the document's compiled rules. Only emits a
 * finding when NOT found - a present relationship is not itself reported
 * here (reconciliation.ts's own per-unit entries already cover the positive
 * case); this module exists specifically to catch the document-wide
 * negative case reconciliation.ts cannot see by construction.
 */
export function auditCrossSectionRelationships(units: MaterialSemanticUnit[], compiledRules: IRRule[]): CrossSectionRelationshipFinding[] {
  const items = buildIrInventory("cross-section-audit", compiledRules, []).items;
  const findings: CrossSectionRelationshipFinding[] = [];

  for (const type of Object.keys(RELATIONSHIP_SIGNAL_NAMES) as CrossSectionRelationshipType[]) {
    const signalNames = RELATIONSHIP_SIGNAL_NAMES[type];
    const implyingUnits = units.filter((u) => u.detectedSignals.some((s) => signalNames.includes(s)));
    if (implyingUnits.length === 0) continue;
    const found = irEncodesRelationship(items, type);
    if (found) continue;
    const worstMateriality = implyingUnits.some((u) => u.materiality === "CRITICAL") ? "CRITICAL" : implyingUnits.some((u) => u.materiality === "MATERIAL") ? "MATERIAL" : "REVIEW_UNCERTAIN";
    findings.push({
      relationshipType: type,
      sourceUnitIds: implyingUnits.map((u) => u.semanticUnitId),
      found: false,
      reasoning: `${implyingUnits.length} semantic unit(s) carry a signal implying a ${type} relationship, but no corresponding relationship appears anywhere in this document's compiled IR - each individual unit/rule may still look fully represented on its own while the relationship BETWEEN them is silently missing`,
      materiality: worstMateriality,
    });
  }

  return findings;
}

/**
 * Checks each unit's own source anchor against the real OperativeContractState
 * for its instrument - flags a unit inventoried from text Phase 2G has
 * already determined is superseded (STALE_SUPERSEDED_TEXT_CREDITED), or
 * whose covering provision's own operative status is not RESOLVED
 * (OPERATIVE_STATE_UNRESOLVED_FOR_UNIT). Never re-derives amendment
 * precedence - only ever reads Phase 2G's own real conclusion.
 */
export function auditOperativeStateForUnits(units: MaterialSemanticUnit[], operativeState: OperativeContractState): OperativeStateAuditFinding[] {
  const findings: OperativeStateAuditFinding[] = [];

  for (const unit of units) {
    const nodeKey = unit.anchors[0]?.structuralNodeKey;
    if (!nodeKey) continue;

    const supersededBy = operativeState.provisions.find((p) => p.supersededSourceNodeKeys.includes(nodeKey));
    if (supersededBy) {
      findings.push({ findingType: "STALE_SUPERSEDED_TEXT_CREDITED", semanticUnitId: unit.semanticUnitId, provisionKey: supersededBy.provisionKey, reasoning: `this unit was inventoried from a source node (${nodeKey}) that Phase 2G's own operative-state resolution has already determined is SUPERSEDED for provision ${supersededBy.provisionKey} - crediting it as currently operative would contradict the authoritative operative-state conclusion`, materiality: unit.materiality });
      continue;
    }

    const coveringProvision = operativeState.provisions.find((p) => p.currentSourceNodeKey === nodeKey || (p.sectionRef && unit.anchors[0]?.sectionRef && p.sectionRef === unit.anchors[0].sectionRef));
    if (coveringProvision && coveringProvision.status !== "OPERATIVE_STATE_RESOLVED") {
      findings.push({ findingType: "OPERATIVE_STATE_UNRESOLVED_FOR_UNIT", semanticUnitId: unit.semanticUnitId, provisionKey: coveringProvision.provisionKey, reasoning: `this unit's covering provision (${coveringProvision.provisionKey}) has operative status ${coveringProvision.status}, not RESOLVED - its current governing text is itself uncertain`, materiality: unit.materiality });
    }
  }

  return findings;
}
