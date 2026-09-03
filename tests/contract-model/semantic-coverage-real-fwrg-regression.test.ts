/**
 * Phase 3E §161 - regression test asserting against the real, zero-cost,
 * whole-document FWRG Article 6 audit (scripts/phase-3e-real-fwrg-regression.ts).
 * Reuses that script's own real-evidence loaders directly - no new model
 * calls, no re-derivation of the real Phase 2A/2B/3B evidence.
 */
import { describe, expect, it } from "vitest";
import type { StructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import type { DiscoveredCandidate } from "../../lib/contract-model/compiler/discovery/types";
import type { OperativeContractState } from "../../lib/contract-model/compiler/amendment/types";
import { loadFwrgLsbStructuralIndex } from "../../scripts/phase-3b-real-regression";
import { loadRealDiscoveredCandidates as loadRealDiscoveredCandidatesLegacy, loadRealCompiledResults, DOCUMENT_ID } from "../../scripts/phase-3e-real-fwrg-regression";
import { runSemanticCoverageAudit } from "../../lib/contract-model/compiler/semantic-coverage/pipeline";

// scripts/phase-3e-real-package-regression.ts's own preserved discovery-run
// fixture predates Phase 3F.1.2's nodeId field - it only ever carries the
// legacy label-shaped structuralNodeKeys (the script itself is frozen,
// out-of-scope evidence-replay code, never edited here). Backfill real
// structuralNodeIds by resolving each key's own section reference against
// this run's real index, never a synthetic placeholder - the pipeline's own
// primaryNodeId/ancestor-chain lookups need a real, resolvable occurrence id.
function withRealNodeIds(candidates: DiscoveredCandidate[], index: StructuralIndex): DiscoveredCandidate[] {
  return candidates.map((c) => ({
    ...c,
    structuralNodeIds: c.structuralNodeKeys.map((key) => index.getNodeByRef(DOCUMENT_ID, key.slice(key.indexOf("::") + 2))?.nodeId ?? ""),
  }));
}

function loadRealDiscoveredCandidates(index: StructuralIndex): DiscoveredCandidate[] {
  return withRealNodeIds(loadRealDiscoveredCandidatesLegacy(), index);
}

// Phase 3F.1.6.R BLOCKER-4 fix: auditOperativeStateForUnits now fails
// CLOSED (flags every unit) when operativeState is null. This real-package
// regression is not exercising the operative-state check (no amendment
// pipeline evidence was loaded for this fixture); a real, RESOLVED,
// empty-provisions OperativeContractState (not null) is the honest input.
const REAL_REGRESSION_OPERATIVE_STATE: OperativeContractState = { instrumentKey: "fwrg-instrument", asOfDate: "2026-01-01", provisions: [], status: "OPERATIVE_STATE_RESOLVED", summary: "no amendment-pipeline evidence loaded for this regression fixture", unattachedEffects: [] };

describe("Phase 3E real FWRG Article 6 regression (task #161) - $0 cost, real evidence only", () => {
  it("audits the ENTIRE real 396-node document root - never a hand-selected section subset", async () => {
    const { index } = loadFwrgLsbStructuralIndex();
    const discoveredCandidates = loadRealDiscoveredCandidates(index);
    expect(discoveredCandidates.length).toBe(252);
    expect(index.allNodes().filter((n) => n.documentId === DOCUMENT_ID).length).toBe(396) /* F-2 (Phase 3 Chewy remediation 2): inline cross-reference / spelled-numeral markers such as 'clauses (i) through (iv)' are no longer structural labels - see docs/phase-3-remediation-f2 */;
  });

  it("produces a real, non-trivial semantic unit inventory (never zero units on a real 252-candidate document)", async () => {
    const { index } = loadFwrgLsbStructuralIndex();
    const discoveredCandidates = loadRealDiscoveredCandidates(index);
    const compiledResults = loadRealCompiledResults(discoveredCandidates);

    const result = await runSemanticCoverageAudit({
      companyId: "fwrg-real-regression",
      packageKey: "fwrg-2021-credit-agreement",
      instrumentKey: null,
      index,
      documents: [{ documentId: DOCUMENT_ID }],
      discoveredCandidates,
      compiledResults,
      verifiedCandidateRefs: new Set(),
      operativeState: REAL_REGRESSION_OPERATIVE_STATE,
      operativeVersionRef: null,
      structuralParserVersion: "phase-2a-structural-index",
      providerIdentity: null,
    });

    const doc = result.packageCoverage.documents[0]!;
    expect(doc.units.length).toBeGreaterThan(100);
    // Real, disclosed fact: only ~5 of 252 real candidates have real preserved compiled IR in
    // this codebase's actual history - the honest gate result must reflect that, never a
    // fabricated pass.
    expect(doc.gateStatus).toBe("DOCUMENT_GATE_FAILED");
    expect(result.packageCoverage.status).toBe("PACKAGE_SEMANTICALLY_INCOMPLETE");
    expect(doc.dangerousUnaccounted.length).toBeGreaterThan(0);
  });

  it("correctly reconciles the ~5 real candidates that DO have real preserved compiled IR as FULLY_REPRESENTED, not dangerous", async () => {
    const { index } = loadFwrgLsbStructuralIndex();
    const discoveredCandidates = loadRealDiscoveredCandidates(index);
    const compiledResults = loadRealCompiledResults(discoveredCandidates);
    expect(compiledResults.length).toBeGreaterThanOrEqual(5);

    const result = await runSemanticCoverageAudit({
      companyId: "fwrg-real-regression",
      packageKey: "fwrg-2021-credit-agreement",
      instrumentKey: null,
      index,
      documents: [{ documentId: DOCUMENT_ID }],
      discoveredCandidates,
      compiledResults,
      verifiedCandidateRefs: new Set(),
      operativeState: REAL_REGRESSION_OPERATIVE_STATE,
      operativeVersionRef: null,
      structuralParserVersion: "phase-2a-structural-index",
      providerIdentity: null,
    });

    const doc = result.packageCoverage.documents[0]!;
    const compiledDiscoveryIds = new Set(compiledResults.map((c) => c.candidateRef));
    const fullyRepresentedCount = doc.coverageEntries.filter((e) => e.coverageState === "FULLY_REPRESENTED_VERIFIED" || e.coverageState === "FULLY_REPRESENTED_REVIEW_REQUIRED").length;
    expect(fullyRepresentedCount).toBeGreaterThan(0);
    // None of the compiled candidates' own units should appear in the dangerous-unaccounted list.
    const unitsFromCompiledCandidates = doc.units.filter((u) => u.anchors.some((a) => compiledDiscoveryIds.has(discoveredCandidates.find((c) => c.structuralNodeKeys.some((k) => k === a.structuralNodeKey || (a.structuralNodeKey?.startsWith(k) ?? false)))?.discoveryId ?? "")));
    const dangerousFromCompiled = doc.dangerousUnaccounted.filter((d) => unitsFromCompiledCandidates.some((u) => u.semanticUnitId === d.semanticUnitId));
    expect(dangerousFromCompiled.length).toBe(0);
  });

  it("is reproducible - two independent runs over the same real evidence produce identical package status and unit counts", async () => {
    const runOnce = async () => {
      const { index } = loadFwrgLsbStructuralIndex();
      const discoveredCandidates = loadRealDiscoveredCandidates(index);
      const compiledResults = loadRealCompiledResults(discoveredCandidates);
      return runSemanticCoverageAudit({
        companyId: "fwrg-real-regression",
        packageKey: "fwrg-2021-credit-agreement",
        instrumentKey: null,
        index,
        documents: [{ documentId: DOCUMENT_ID }],
        discoveredCandidates,
        compiledResults,
        verifiedCandidateRefs: new Set(),
        operativeState: REAL_REGRESSION_OPERATIVE_STATE,
        operativeVersionRef: null,
        structuralParserVersion: "phase-2a-structural-index",
        providerIdentity: null,
      });
    };
    const first = await runOnce();
    const second = await runOnce();
    expect(first.packageCoverage.status).toBe(second.packageCoverage.status);
    expect(first.documentDetails[0]!.units.length).toBe(second.documentDetails[0]!.units.length);
    expect(first.documentDetails[0]!.units.map((u) => u.semanticUnitId).sort()).toEqual(second.documentDetails[0]!.units.map((u) => u.semanticUnitId).sort());
  });
});
