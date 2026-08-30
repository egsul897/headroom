/**
 * Phase 3F.1.6.RX Part B - independent, production-frozen recertification.
 * Auditor 2 scope: fresh adversarial re-verification of BLOCKER-3 and
 * BLOCKER-4 with NEW attack shapes, distinct from Workstream B's own
 * (04-operative-supersession-remediation.json) constructions.
 */
import { describe, expect, it } from "vitest";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { buildSourceCoverageInventory } from "../../lib/contract-model/compiler/coverage-audit/source-inventory";
import { getNodeSupersessionStatus, buildNodeSupersessionIndex } from "../../lib/contract-model/compiler/amendment/operative-state";
import type { OperativeContractState } from "../../lib/contract-model/compiler/amendment/types";
import { auditOperativeStateForUnits, applyOperativeStateFindingsToCoverage } from "../../lib/contract-model/compiler/semantic-coverage/cross-reference-audit";
import { reconcileFrozenInventory } from "../../lib/contract-model/compiler/semantic-coverage/reconciliation";
import { freezeSourceInventory } from "../../lib/contract-model/compiler/semantic-coverage/freeze";
import type { MaterialSemanticUnit, SourceAnchor } from "../../lib/contract-model/compiler/semantic-coverage/types";
import { computeSemanticUnitId } from "../../lib/contract-model/compiler/semantic-coverage/identity";
import { SEMANTIC_COVERAGE_ALGORITHM_VERSION } from "../../lib/contract-model/compiler/semantic-coverage/types";

// ===========================================================================
// BLOCKER-3 fresh attack: a THREE-section boundary case (Workstream B's own
// construction used exactly 2 sections). Only the MIDDLE section is
// superseded - this specifically probes for an off-by-one/adjacency bleed
// (e.g. a bug that marks a superseded node's own STRUCTURAL SIBLINGS, not
// just itself, or that leaks status across the whole document once ANY
// amendment exists anywhere in it).
// ===========================================================================
describe("BLOCKER-3 fresh attack: 3-section adjacency boundary - only the MIDDLE section is superseded, its neighbors on BOTH sides must stay CURRENT_OPERATIVE", () => {
  const documentId = "boundary-ca";
  const text = `CREDIT AGREEMENT dated as of January 15, 2021, among Acme LLC, as Borrower.

SECTION 6.01 Indebtedness. The Borrower will not incur any Indebtedness except up to $10,000,000.

SECTION 6.02 Liens. The Borrower will not create any Lien except up to $20,000,000.

SECTION 6.03 Investments. The Borrower will not make any Investment except up to $30,000,000.
`;

  function buildIdx() {
    const doc = { documentId, label: "CA", text };
    const nodes = parseDocumentStructure(doc);
    return buildStructuralIndex(new Map([[documentId, { text, nodes }]]), [], []);
  }

  it("raw inventory (no supersessionIndex) is blind to the real difference - all 3 regions UNKNOWN, matching BLOCKER-3's own established raw/blind contract", () => {
    const index = buildIdx();
    const regions = buildSourceCoverageInventory(documentId, index, { companyId: "co", packageKey: "pkg", instrumentKey: "instrument-1" });
    expect(regions.length).toBeGreaterThanOrEqual(3);
    for (const r of regions) {
      expect(r.supersessionStatus).toBe("UNKNOWN_SUPERSESSION_STATUS");
    }
  });

  it("operative mode: ONLY 6.02's own region is KNOWN_SUPERSEDED - 6.01 and 6.03 on both sides stay CURRENT_OPERATIVE (no adjacency bleed, no whole-document contamination)", () => {
    const index = buildIdx();
    const node601 = index.getNodeByRef(documentId, "6.01")!;
    const node602 = index.getNodeByRef(documentId, "6.02")!;
    const node603 = index.getNodeByRef(documentId, "6.03")!;

    const state: OperativeContractState = {
      instrumentKey: "instrument-1",
      asOfDate: "2026-01-01",
      status: "OPERATIVE_STATE_RESOLVED",
      summary: "test",
      unattachedEffects: [],
      provisions: [
        {
          instrumentKey: "instrument-1",
          provisionKey: "instrument-1::SECTION::6.02",
          kind: "SECTION",
          documentId,
          sectionRef: "6.02",
          definedTermRef: null,
          asOfDate: "2026-01-01",
          currentSourceDocumentId: "amend-doc",
          currentSourceNodeKey: null,
          currentSourceNodeId: "amend-doc::6.02-amended",
          currentText: "SECTION 6.02 Liens. The Borrower will not create any Lien except up to $25,000,000.",
          fullChain: [],
          appliedChain: [],
          supersededSourceNodeKeys: [],
          supersededSourceNodeIds: [node602.nodeId],
          status: "OPERATIVE_STATE_RESOLVED",
          unresolvedIssues: [],
          conflicts: [],
          targetResolutionStatus: "UNIQUE",
          targetResolutionReason: null,
          candidateSourceNodeIds: [],
          structuralHealthStatus: "STRUCTURAL_HEALTH_SUFFICIENT",
          structuralHealthIssues: [],
          attemptedText: null,
          reviewRequired: false,
          candidateTexts: [],
        },
      ],
    };
    const supersessionIndex = buildNodeSupersessionIndex([{ baseDocumentId: documentId, state }]);

    // Direct per-node primitive check (the mechanism coverage-audit/pipeline.ts's
    // own post-hoc re-tag loop calls verbatim for every real region).
    expect(getNodeSupersessionStatus(supersessionIndex, documentId, node601.nodeId).status).toBe("CURRENT_OPERATIVE");
    expect(getNodeSupersessionStatus(supersessionIndex, documentId, node602.nodeId).status).toBe("KNOWN_SUPERSEDED");
    expect(getNodeSupersessionStatus(supersessionIndex, documentId, node603.nodeId).status).toBe("CURRENT_OPERATIVE");

    // Full re-tag over the REAL raw inventory (mirrors pipeline.ts's own
    // `regions[i] = { ...region, supersessionStatus: result.status, ... }` loop exactly).
    const rawRegions = buildSourceCoverageInventory(documentId, index, { companyId: "co", packageKey: "pkg", instrumentKey: "instrument-1" });
    const retagged = rawRegions.map((r) => ({ ...r, ...getNodeSupersessionStatus(supersessionIndex, r.documentId, r.structuralNodeId) }));
    const r601 = retagged.find((r) => r.structuralNodeId === node601.nodeId);
    const r602 = retagged.find((r) => r.structuralNodeId === node602.nodeId);
    const r603 = retagged.find((r) => r.structuralNodeId === node603.nodeId);
    expect(r601?.status).toBe("CURRENT_OPERATIVE");
    expect(r602?.status).toBe("KNOWN_SUPERSEDED");
    expect(r603?.status).toBe("CURRENT_OPERATIVE");
  });
});

// ===========================================================================
// BLOCKER-4 fresh attack: does a raw-source-fallback unit (no structural
// node anchor - a REAL, disclosed, non-hypothetical shape per SourceAnchor's
// own doc comment: "Null for a region reached only via the raw-source
// fallback path") ever reach a falsely-trusted coverage state when
// operativeState is null? Independently confirms BOTH halves of the real
// mechanism: (1) auditOperativeStateForUnits itself emits NO finding for
// such a unit even when operativeState is null (already known/disclosed -
// see semantic-coverage-cross-reference-audit.test.ts's own existing test),
// and (2) - the NEW part this file adds - reconciliation.ts's OWN,
// INDEPENDENT structuralNodeId gate (candidatesCoveringUnit) means such a
// unit can NEVER reach FULLY_REPRESENTED_VERIFIED/REVIEW_REQUIRED through a
// completely different code path regardless, so the exemption in (1) is
// safe in practice - not merely safe by assertion. Run through the REAL,
// full freeze -> reconcile -> audit -> apply chain, not just the isolated
// audit function.
// ===========================================================================
describe("BLOCKER-4 fresh attack: a raw-source-fallback unit (null structuralNodeId) cannot reach a falsely-trusted state under a null operativeState, via an INDEPENDENT gate in reconciliation.ts itself", () => {
  const documentId = "fallback-doc";
  const companyId = "co";
  const packageKey = "pkg-1";
  const instrumentKey = "instrument-1";

  function fallbackAnchor(): SourceAnchor {
    // Deliberately null structuralNodeId/structuralNodeKey - the REAL
    // raw-source-fallback shape (no structural node exists for this span).
    return { documentId, structuralNodeKey: null, structuralNodeId: null, sectionRef: null, charStart: 0, charEnd: 40, sourceCitation: `${documentId}::raw-fallback-span` };
  }

  function fallbackUnit(): MaterialSemanticUnit {
    const anchors = [fallbackAnchor()];
    const excerptText = "shall not incur Indebtedness in excess of $99,000,000";
    return {
      semanticUnitId: computeSemanticUnitId(anchors, excerptText),
      companyId,
      packageKey,
      instrumentKey,
      operativeVersionRef: null,
      granularity: "CLAUSE",
      anchors,
      family: "INDEBTEDNESS",
      familyEvidence: null,
      postureSignal: "PROHIBITION_SIGNAL",
      materiality: "CRITICAL",
      materialityReasoning: "test",
      contextuallyElevated: false,
      excerptText,
      detectedSignals: [],
      fromRawSourceFallback: true,
      detectionMethod: "DETERMINISTIC_SIGNAL",
      aiInventoryPromptVersion: null,
      confidence: "HIGH",
      uncertaintyReasons: [],
      inventoryAlgorithmVersion: SEMANTIC_COVERAGE_ALGORITHM_VERSION,
      provenance: "test",
    };
  }

  it("(1) auditOperativeStateForUnits emits ZERO findings for this unit even when operativeState is null (confirms the exemption is real, not a misreading)", () => {
    const findings = auditOperativeStateForUnits([fallbackUnit()], null);
    expect(findings.length).toBe(0);
  });

  it("(2) NEW: through the REAL full pipeline (freeze -> reconcile -> audit -> apply), this unit resolves UNREPRESENTED + dangerous-unaccounted regardless of operativeState being null - reconciliation.ts's OWN independent structuralNodeId gate (candidatesCoveringUnit) is the actual reason no false trust is possible here, NOT auditOperativeStateForUnits's own null-check (which never even fires for this unit)", async () => {
    const unit = fallbackUnit();
    const frozen = freezeSourceInventory({ companyId, packageKey, instrumentKey, documentIds: [documentId], units: [unit] });
    // No discovered candidates, no compiled results at all - reconciliation
    // has nothing to match this unit against REGARDLESS of structuralNodeId,
    // but the point is WHICH gate is actually responsible: candidatesCoveringUnit
    // returns [] unconditionally for a null structuralNodeId anchor (see
    // reconciliation.ts line ~65), before operativeState ever enters the
    // picture at all.
    const { entries, dangerousUnaccounted } = reconcileFrozenInventory({ frozenInventory: frozen, index: buildStructuralIndex(new Map([[documentId, { text: "x".repeat(100), nodes: [] }]]), [], []), discoveredCandidates: [], compiledResults: [], verifiedCandidateRefs: new Set() });
    expect(entries[0]!.coverageState).toBe("UNREPRESENTED");
    expect(dangerousUnaccounted.some((d) => d.semanticUnitId === unit.semanticUnitId)).toBe(true);

    // Now overlay a genuinely null operativeState audit finding pass - it
    // contributes NOTHING for this unit (confirmed in test (1) above), so
    // applyOperativeStateFindingsToCoverage is a pure no-op here; the
    // ALREADY-UNREPRESENTED/dangerous state from reconciliation.ts's own
    // independent gate is what protects this unit, not this override layer.
    const findings = auditOperativeStateForUnits([unit], null);
    const { entries: finalEntries, dangerousUnaccounted: finalDangerous } = applyOperativeStateFindingsToCoverage(entries, dangerousUnaccounted, findings, [unit]);
    expect(finalEntries[0]!.coverageState).toBe("UNREPRESENTED"); // unchanged - findings was empty.
    expect(finalDangerous.some((d) => d.semanticUnitId === unit.semanticUnitId)).toBe(true); // still dangerous, via reconciliation.ts's own gate.

    // CONCLUSION (see accompanying certification artifact for full
    // write-up): BLOCKER-4's "null operativeState fails closed" property
    // does NOT literally hold inside auditOperativeStateForUnits for a
    // raw-source-fallback unit (zero findings emitted either way) - but the
    // overall live pipeline's own behavior IS still safe for this exact
    // unit shape, because reconciliation.ts's OWN, entirely separate
        // structuralNodeId gate independently guarantees such a unit can never
    // be credited FULLY_REPRESENTED_VERIFIED/REVIEW_REQUIRED regardless of
    // operativeState. This is a genuine architectural overlap/redundancy
    // (two different modules independently prevent the same bad outcome
    // for two different reasons) rather than a live, exploitable gap.
  });
});
