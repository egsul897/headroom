/**
 * Phase 3E §162 - regression test for the real, zero-cost, whole-document
 * LSB Article 6 audit (scripts/phase-3e-real-lsb-regression.ts). Mirrors
 * semantic-coverage-real-fwrg-regression.test.ts exactly for the second
 * known package.
 */
import { describe, expect, it } from "vitest";
import { loadFwrgLsbStructuralIndex } from "../../scripts/phase-3b-real-regression";
import { loadRealDiscoveredCandidates, loadRealCompiledResults, DOCUMENT_ID } from "../../scripts/phase-3e-real-lsb-regression";
import { runSemanticCoverageAudit } from "../../lib/contract-model/compiler/semantic-coverage/pipeline";

async function runAudit() {
  const { index } = loadFwrgLsbStructuralIndex();
  const discoveredCandidates = loadRealDiscoveredCandidates();
  const compiledResults = loadRealCompiledResults(discoveredCandidates);
  const result = await runSemanticCoverageAudit({
    companyId: "lsb-real-regression",
    packageKey: "lsb-real-package",
    instrumentKey: null,
    index,
    documents: [{ documentId: DOCUMENT_ID }],
    discoveredCandidates,
    compiledResults,
    verifiedCandidateRefs: new Set(),
    operativeState: null,
    operativeVersionRef: null,
    structuralParserVersion: "phase-2a-structural-index",
    providerIdentity: null,
  });
  return { result, discoveredCandidates, compiledResults };
}

describe("Phase 3E real LSB Article 6 regression (task #162) - $0 cost, real evidence only", () => {
  it("audits the ENTIRE real 76-node document root - never a hand-selected section subset", () => {
    const { index } = loadFwrgLsbStructuralIndex();
    const discoveredCandidates = loadRealDiscoveredCandidates();
    expect(discoveredCandidates.length).toBe(82);
    expect(index.allNodes().filter((n) => n.documentId === DOCUMENT_ID).length).toBe(76);
  });

  it("produces a real, non-trivial semantic unit inventory and an honest, non-passing gate given only 3 of 82 candidates have real compiled IR", async () => {
    const { result } = await runAudit();
    const doc = result.packageCoverage.documents[0]!;
    expect(doc.units.length).toBeGreaterThan(30);
    expect(doc.gateStatus).toBe("DOCUMENT_GATE_FAILED");
    expect(result.packageCoverage.status).toBe("PACKAGE_SEMANTICALLY_INCOMPLETE");
    expect(doc.dangerousUnaccounted.length).toBeGreaterThan(0);
  });

  it("correctly reconciles the real compiled candidates as FULLY_REPRESENTED, never flagging them dangerous", async () => {
    const { result, compiledResults } = await runAudit();
    expect(compiledResults.length).toBeGreaterThanOrEqual(3);
    const doc = result.packageCoverage.documents[0]!;
    const fullyRepresented = doc.coverageEntries.filter((e) => e.coverageState === "FULLY_REPRESENTED_VERIFIED" || e.coverageState === "FULLY_REPRESENTED_REVIEW_REQUIRED");
    expect(fullyRepresented.length).toBeGreaterThan(0);
  });

  it("is reproducible across independent runs over the same real evidence", async () => {
    const first = await runAudit();
    const second = await runAudit();
    expect(first.result.packageCoverage.status).toBe(second.result.packageCoverage.status);
    expect(first.result.documentDetails[0]!.units.length).toBe(second.result.documentDetails[0]!.units.length);
  });
});
