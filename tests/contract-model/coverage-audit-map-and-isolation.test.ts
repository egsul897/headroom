/**
 * Phase 2E - coverage map semantics (task §35), tenant/instrument
 * isolation (task §39), and idempotency (task §38).
 */
import { describe, expect, it } from "vitest";
import { buildSourceCoverageInventory } from "../../lib/contract-model/compiler/coverage-audit/source-inventory";
import { auditDiscoveryCoverage } from "../../lib/contract-model/compiler/coverage-audit/discovery-comparison";
import { buildCoverageMap } from "../../lib/contract-model/compiler/coverage-audit/coverage-map";
import { runIndependentCoverageAudit } from "../../lib/contract-model/compiler/coverage-audit/pipeline";
import { buildTestIndex, makeCandidate } from "./coverage-audit-test-utils";

describe("Phase 2E coverage map (task §35)", () => {
  it("a clean region with no findings is AUDITED_NO_GAP_FOUND, never conflated with 'correct'", () => {
    const text = `SECTION 6.01. Indebtedness . The Borrower shall not incur Indebtedness in excess of $5,000,000.`;
    const index = buildTestIndex([{ documentId: "doc", label: "CA", text }]);
    const regions = buildSourceCoverageInventory("doc", index, { companyId: "c", packageKey: "p", instrumentKey: null });
    const node = index.getNodeByRef("doc", "6.01")!;
    const candidates = [makeCandidate({ documentId: "doc", structuralNodeKeys: [node.nodeKey], normalizedSourceRef: "6.01" })];
    const findings = auditDiscoveryCoverage(regions, candidates, index);
    const map = buildCoverageMap(regions, findings, new Set(candidates.flatMap((c) => c.structuralNodeKeys)));
    const entry = map.find((m) => m.sectionRef === "6.01")!;
    expect(entry.state).toBe("AUDITED_NO_GAP_FOUND");
    expect(entry.primaryDiscovered).toBe(true);
  });

  it("a region with a material finding is AUDITED_GAP_FOUND", () => {
    const text = `SECTION 6.01. Indebtedness . The Borrower shall not incur Indebtedness in excess of $5,000,000.`;
    const index = buildTestIndex([{ documentId: "doc", label: "CA", text }]);
    const regions = buildSourceCoverageInventory("doc", index, { companyId: "c", packageKey: "p", instrumentKey: null });
    const findings = auditDiscoveryCoverage(regions, [], index);
    const map = buildCoverageMap(regions, findings, new Set());
    const entry = map.find((m) => m.sectionRef === "6.01")!;
    expect(entry.state).toBe("AUDITED_GAP_FOUND");
    expect(entry.primaryDiscovered).toBe(false);
    expect(entry.materialFindingCount).toBeGreaterThan(0);
  });

  it("an uncertain-only region is AUDIT_UNCERTAIN, not silently equated with clean", () => {
    const text = `SECTION 6.06. Investments . The Borrower may make Investments in joint ventures so long as such Investments are consistent with past practice.`;
    const index = buildTestIndex([{ documentId: "doc", label: "CA", text }]);
    const regions = buildSourceCoverageInventory("doc", index, { companyId: "c", packageKey: "p", instrumentKey: null });
    const findings = auditDiscoveryCoverage(regions, [], index);
    const map = buildCoverageMap(regions, findings, new Set());
    const entry = map.find((m) => m.sectionRef === "6.06")!;
    expect(entry.state).toBe("AUDIT_UNCERTAIN");
  });
});

describe("Phase 2E tenant/instrument isolation (task §39)", () => {
  it("company A's audit run never reads or references company B's identifiers", () => {
    const textA = `SECTION 6.01. Indebtedness . The Borrower shall not incur Indebtedness in excess of $5,000,000.`;
    const indexA = buildTestIndex([{ documentId: "docA", label: "CA-A", text: textA }]);
    const result = runIndependentCoverageAudit({
      companyId: "company-a",
      packageKey: "package-a",
      instrumentKey: null,
      documentIds: ["docA"],
      index: indexA,
      candidates: [],
      packageGraph: null,
      bundles: [],
    });
    expect(result.regions.every((r) => r.companyId === "company-a")).toBe(true);
    expect(result.findings.every((f) => f.companyId === "company-a")).toBe(true);
    expect(JSON.stringify(result)).not.toContain("company-b");
  });
});

describe("Phase 2E idempotency (task §38)", () => {
  it("repeated unchanged audits produce equivalent findings with stable identities and no duplicates", () => {
    const text = `SECTION 6.01. Indebtedness . The Borrower shall not incur Indebtedness in excess of $5,000,000. SECTION 6.06. Investments . The Borrower may make Investments in joint ventures so long as such Investments are consistent with past practice.`;
    const index = buildTestIndex([{ documentId: "doc", label: "CA", text }]);
    const input = { companyId: "c", packageKey: "p", instrumentKey: null, documentIds: ["doc"], index, candidates: [], packageGraph: null, bundles: [] };
    const run1 = runIndependentCoverageAudit(input);
    const run2 = runIndependentCoverageAudit(input);

    expect(run1.contentIdentity).toBe(run2.contentIdentity);
    expect(run1.regions.map((r) => r.regionId).sort()).toEqual(run2.regions.map((r) => r.regionId).sort());
    expect(run1.findings.map((f) => f.findingId).sort()).toEqual(run2.findings.map((f) => f.findingId).sort());

    const regionIds = run1.regions.map((r) => r.regionId);
    expect(new Set(regionIds).size).toBe(regionIds.length);
    const findingIds = run1.findings.map((f) => f.findingId);
    expect(new Set(findingIds).size).toBe(findingIds.length);
  });
});
