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
import { SEMANTIC_COVERAGE_ALGORITHM_VERSION } from "./types";
import type { CrossSectionRelationshipFinding, CrossSectionRelationshipType, DangerousUnaccountedSemanticUnit, MaterialSemanticUnit, OperativeStateAuditFinding, SemanticUnitCoverageEntry } from "./types";

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
 *
 * Phase 3F.1.6.R BLOCKER-4 fix: `operativeState` is now explicitly
 * nullable and handled INSIDE this function - the one place every real
 * caller (semantic-coverage/pipeline.ts included) reaches for this
 * determination. A caller that could not resolve operative state at all is
 * not "nothing to check" - it is the single worst case this audit exists
 * to catch (Architecture Invariant #13: unresolved operative state must
 * never be silently treated as safely current). Every unit with a real
 * structural anchor is therefore flagged OPERATIVE_STATE_UNRESOLVED_FOR_UNIT
 * with a null provisionKey and an honest reason distinguishing "no
 * operative state was ever available" from "a specific provision's own
 * status is unresolved". Previously this null-handling lived in the
 * CALLER (`input.operativeState ? auditOperativeStateForUnits(...) : []`
 * in pipeline.ts) and defaulted to zero findings - a silent fail-OPEN any
 * future caller could reintroduce merely by copying that ternary. Moving
 * the fail-CLOSED behavior here means no caller can bypass it by omission.
 */
export function auditOperativeStateForUnits(units: MaterialSemanticUnit[], operativeState: OperativeContractState | null): OperativeStateAuditFinding[] {
  const findings: OperativeStateAuditFinding[] = [];

  for (const unit of units) {
    // Phase 3F.1.2: nodeId (real physical occurrence identity), never the
    // label-shaped structuralNodeKey - two distinct physical provisions
    // sharing a section-number label must never be conflated into one
    // supersession/coverage conclusion here.
    const nodeId = unit.anchors[0]?.structuralNodeId;
    if (!nodeId) continue;

    if (!operativeState) {
      findings.push({
        findingType: "OPERATIVE_STATE_UNRESOLVED_FOR_UNIT",
        semanticUnitId: unit.semanticUnitId,
        provisionKey: null,
        reasoning: `no OperativeContractState was available at all for this unit's instrument - whether this unit's own source text (node ${nodeId}) is still current-operative cannot be established with confidence, and per Architecture Invariant #13 an unresolved operative state must never be silently treated as safely current`,
        materiality: unit.materiality,
      });
      continue;
    }

    const supersededBy = operativeState.provisions.find((p) => p.supersededSourceNodeIds.includes(nodeId));
    if (supersededBy) {
      findings.push({ findingType: "STALE_SUPERSEDED_TEXT_CREDITED", semanticUnitId: unit.semanticUnitId, provisionKey: supersededBy.provisionKey, reasoning: `this unit was inventoried from a source node (${nodeId}) that Phase 2G's own operative-state resolution has already determined is SUPERSEDED for provision ${supersededBy.provisionKey} - crediting it as currently operative would contradict the authoritative operative-state conclusion`, materiality: unit.materiality });
      continue;
    }

    // Phase 3F.1.6.R BLOCKER-6 fix: a covering provision is now also found
    // via `candidateSourceNodeIds` - the real set of ambiguous-occurrence
    // node identities `buildProvisionView` records whenever
    // targetResolutionStatus is AMBIGUOUS (see amendment/types.ts). The
    // prior two-branch lookup (currentSourceNodeId exact match, or a bare
    // sectionRef string match) is structurally NULL for every AMBIGUOUS
    // DEFINITION-kind provision: DEFINITION-kind provisions never populate
    // sectionRef at all (only SECTION-kind does), and an AMBIGUOUS
    // resolution leaves currentSourceNodeId null by design (no single
    // occurrence was chosen) - so a unit anchored to one of the real
    // ambiguous candidate nodes was previously invisible to this audit
    // entirely. candidateSourceNodeIds is populated ONLY when
    // targetResolutionStatus !== "UNIQUE" (amendment/types.ts's own
    // contract), so this added branch can only ever widen matching for a
    // provision that is already non-RESOLVED - it can never turn a
    // genuinely resolved, current provision into a false match.
    const coveringProvision = operativeState.provisions.find(
      (p) => p.currentSourceNodeId === nodeId || (p.sectionRef && unit.anchors[0]?.sectionRef && p.sectionRef === unit.anchors[0].sectionRef) || p.candidateSourceNodeIds.includes(nodeId)
    );
    if (coveringProvision && coveringProvision.status !== "OPERATIVE_STATE_RESOLVED") {
      findings.push({ findingType: "OPERATIVE_STATE_UNRESOLVED_FOR_UNIT", semanticUnitId: unit.semanticUnitId, provisionKey: coveringProvision.provisionKey, reasoning: `this unit's covering provision (${coveringProvision.provisionKey}) has operative status ${coveringProvision.status}, not RESOLVED - its current governing text is itself uncertain${coveringProvision.targetResolutionStatus === "AMBIGUOUS" ? ` (matched via candidateSourceNodeIds: this unit's own source node is one of ${coveringProvision.candidateSourceNodeIds.length} real physical occurrences an amendment target could not be uniquely attached to)` : ""}`, materiality: unit.materiality });
    }
  }

  return findings;
}

/**
 * Phase 3F.1 §29-32/F3 - folds auditOperativeStateForUnits's own findings
 * back into the per-unit coverage entries/dangerous-unaccounted list before
 * document/package rollup. Root cause this closes: SemanticCoverageState
 * already defines OPERATIVE_STATE_UNRESOLVED and both document-coverage.ts's
 * gate check and package-coverage.ts's PACKAGE_OPERATIVE_STATE_UNRESOLVED
 * check already look for it - but reconciliation.ts never produces that
 * state for any unit, and this module's own findings were computed into a
 * separate, parallel list (operativeStateFindings) that neither rollup ever
 * read. Without this wiring, a unit whose own source text is STALE_
 * SUPERSEDED_TEXT_CREDITED or whose covering provision is itself unresolved
 * could still reach FULLY_REPRESENTED_VERIFIED from reconciliation.ts alone
 * - a "confident but wrong" operative-state answer (Architecture Invariants
 * #13) neither existing gate could ever actually catch.
 *
 * A finding OVERRIDES whatever reconciliation.ts computed for that unit
 * (operative-state uncertainty is more severe than an ordinary
 * representation-quality question - text that is not even confirmed
 * current cannot be "fully represented" in any meaningful sense). A
 * CRITICAL/MATERIAL unit not already dangerous-unaccounted for another
 * reason is added to dangerousUnaccounted too, since crediting stale or
 * unresolved-operative-state text as though it were safely current is
 * exactly the silent, dangerous failure mode this audit exists to catch.
 */
export function applyOperativeStateFindingsToCoverage(
  entries: SemanticUnitCoverageEntry[],
  dangerousUnaccounted: DangerousUnaccountedSemanticUnit[],
  findings: OperativeStateAuditFinding[],
  units: MaterialSemanticUnit[]
): { entries: SemanticUnitCoverageEntry[]; dangerousUnaccounted: DangerousUnaccountedSemanticUnit[] } {
  if (findings.length === 0) return { entries, dangerousUnaccounted };

  const findingByUnitId = new Map(findings.map((f) => [f.semanticUnitId, f]));
  const unitById = new Map(units.map((u) => [u.semanticUnitId, u]));

  const newEntries = entries.map((e) => {
    const finding = findingByUnitId.get(e.semanticUnitId);
    if (!finding) return e;
    return { ...e, coverageState: "OPERATIVE_STATE_UNRESOLVED" as const, reasoning: `${e.reasoning} | OVERRIDDEN by operative-state audit (${finding.findingType}): ${finding.reasoning}`, coverageAlgorithmVersion: SEMANTIC_COVERAGE_ALGORITHM_VERSION };
  });

  const alreadyDangerousIds = new Set(dangerousUnaccounted.map((d) => d.semanticUnitId));
  const newDangerous = [...dangerousUnaccounted];
  for (const f of findings) {
    if (f.materiality !== "CRITICAL" && f.materiality !== "MATERIAL") continue;
    if (alreadyDangerousIds.has(f.semanticUnitId)) continue;
    const unit = unitById.get(f.semanticUnitId);
    if (!unit) continue;
    newDangerous.push({ semanticUnitId: f.semanticUnitId, reason: "COMPILED_BUT_MATERIALLY_MISREPRESENTED", materiality: f.materiality, sourceEvidence: unit.excerptText, auditorReasoning: `operative-state audit finding (${f.findingType}): ${f.reasoning}` });
  }

  return { entries: newEntries, dangerousUnaccounted: newDangerous };
}
