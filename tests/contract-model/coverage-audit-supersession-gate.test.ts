/**
 * Phase 3F.1.6.R BLOCKER-3 fix (certification finding SUPER-2).
 *
 * The prior remediation phase (3F.1.5.R) labeled coverage-audit/source-
 * inventory.ts (and its sibling INVENTORY_GENERATION_FILES) as
 * "PROTECTED_BY_INDEPENDENCE_INVARIANT" - implying supersession awareness
 * was categorically out of scope for this subsystem. Certification (Phase
 * 3F.1.6) found that claim unsupported by the actual independence-contract
 * test (tests/contract-model/coverage-audit-independence.test.ts never
 * mentions amendment/* at all), and found the real, current behavior
 * genuinely unsafe: buildSourceCoverageInventory scans EVERY structural
 * node's own text - including a node whose text has since been fully
 * superseded by a later amendment - and produced CoverageRegion/
 * AuditFinding records with no supersession disposition of any kind.
 *
 * THE FIX (see coverage-audit/types.ts's own OPERATIVE-STATE DISCLOSURE
 * header for the full design writeup): the independence contract itself is
 * UNCHANGED and remains true - source-inventory.ts/signals.ts/
 * materiality.ts/context-inventory.ts still import NOTHING from amendment/*
 * (this file's first describe block re-confirms the mechanical guarantee
 * is untouched). What changed is that runIndependentCoverageAudit
 * (pipeline.ts - explicitly NOT one of the independence-protected files)
 * now accepts an OPTIONAL trailing `supersessionIndex` and re-tags every
 * region/finding/coverageMap entry's own `supersessionStatus`/
 * `supersessionReason` post-hoc, defaulting to UNKNOWN_SUPERSESSION_STATUS
 * (never CURRENT_OPERATIVE by omission) when omitted.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildSourceCoverageInventory } from "../../lib/contract-model/compiler/coverage-audit/source-inventory";
import { runIndependentCoverageAudit } from "../../lib/contract-model/compiler/coverage-audit/pipeline";
import { buildTestIndex } from "./coverage-audit-test-utils";
import type { NodeSupersessionIndex, NodeSupersessionRecord } from "../../lib/contract-model/compiler/amendment/types";

const AUDIT_DIR = path.join(__dirname, "../../lib/contract-model/compiler/coverage-audit");

describe("BLOCKER-3 fix: the independence contract's own mechanical guarantee is UNCHANGED", () => {
  it("source-inventory.ts (and every other INVENTORY_GENERATION_FILE) still imports NOTHING from amendment/* - the fix lives entirely at the orchestration layer", () => {
    for (const file of ["source-inventory.ts", "signals.ts", "materiality.ts", "context-inventory.ts"]) {
      const content = fs.readFileSync(path.join(AUDIT_DIR, file), "utf-8");
      const importLines = content.split("\n").filter((l) => /^\s*import\b/.test(l));
      const amendmentImports = importLines.filter((l) => /amendment\//.test(l));
      expect(amendmentImports, `${file} must never import from amendment/* - found: ${amendmentImports.join(" | ")}`).toHaveLength(0);
    }
  });

  it("pipeline.ts (NOT independence-protected) is the one file allowed to import amendment/* for this fix", () => {
    const content = fs.readFileSync(path.join(AUDIT_DIR, "pipeline.ts"), "utf-8");
    expect(content).toMatch(/from "\.\.\/amendment\/(types|operative-state)"/);
  });
});

describe("BLOCKER-3 fix: independent inventory defaults to UNKNOWN_SUPERSESSION_STATUS, never CURRENT_OPERATIVE by omission", () => {
  it("buildSourceCoverageInventory (called directly, no pipeline involved) marks every region UNKNOWN_SUPERSESSION_STATUS", () => {
    const text = `SECTION 6.01. Indebtedness . The Borrower shall not incur Indebtedness in excess of $5,000,000.`;
    const index = buildTestIndex([{ documentId: "doc", label: "CA", text }]);
    const regions = buildSourceCoverageInventory("doc", index, { companyId: "c", packageKey: "p", instrumentKey: null });
    expect(regions.length).toBeGreaterThan(0);
    expect(regions.every((r) => r.supersessionStatus === "UNKNOWN_SUPERSESSION_STATUS")).toBe(true);
    expect(regions.every((r) => r.supersessionReason.length > 0)).toBe(true);
  });

  it("runIndependentCoverageAudit called WITHOUT a supersessionIndex defaults every region/finding/coverageMap entry to UNKNOWN_SUPERSESSION_STATUS", () => {
    const text = `SECTION 6.01. Indebtedness . The Borrower shall not incur Indebtedness in excess of $5,000,000.`;
    const index = buildTestIndex([{ documentId: "doc", label: "CA", text }]);
    const result = runIndependentCoverageAudit({ companyId: "c", packageKey: "p", instrumentKey: null, documentIds: ["doc"], index, candidates: [], packageGraph: null, bundles: [] });
    expect(result.regions.length).toBeGreaterThan(0);
    expect(result.regions.every((r) => r.supersessionStatus === "UNKNOWN_SUPERSESSION_STATUS")).toBe(true);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings.every((f) => f.supersessionStatus === "UNKNOWN_SUPERSESSION_STATUS")).toBe(true);
    expect(result.coverageMap.every((m) => m.supersessionStatus === "UNKNOWN_SUPERSESSION_STATUS")).toBe(true);
  });
});

describe("BLOCKER-3 fix: a real supersessionIndex correctly re-tags the independent inventory post-hoc", () => {
  it("a region/finding/coverageMap entry anchored to a KNOWN_SUPERSEDED node is accurately tagged, without source-inventory.ts itself ever consulting amendment/* directly", () => {
    const documentId = "doc";
    const text = `SECTION 6.01. Indebtedness . The Borrower shall not incur Indebtedness in excess of $5,000,000.`;
    const index = buildTestIndex([{ documentId, label: "CA", text }]);
    const node = index.getNodeByRef(documentId, "6.01")!;

    const record: NodeSupersessionRecord = { nodeId: node.nodeId, instrumentKey: "instrument-1", provisionKey: "6.01", supersededByEffectId: "eff-1", supersededByAmendmentDocumentId: "amend-doc", supersededEffectiveDate: "2024-06-01" };
    const supersessionIndex: NodeSupersessionIndex = { coveredDocumentIds: new Set([documentId]), supersededByNodeId: new Map([[node.nodeId, record]]), ambiguousNodeIds: new Set() };

    const result = runIndependentCoverageAudit({ companyId: "c", packageKey: "p", instrumentKey: null, documentIds: [documentId], index, candidates: [], packageGraph: null, bundles: [], supersessionIndex });

    const region = result.regions.find((r) => r.structuralNodeId === node.nodeId)!;
    expect(region).toBeDefined();
    expect(region.supersessionStatus).toBe("KNOWN_SUPERSEDED");
    expect(region.supersessionReason).toMatch(/eff-1|amend-doc/);

    const relatedFindings = result.findings.filter((f) => f.structuralNodeId === node.nodeId);
    expect(relatedFindings.length).toBeGreaterThan(0);
    expect(relatedFindings.every((f) => f.supersessionStatus === "KNOWN_SUPERSEDED")).toBe(true);

    const mapEntry = result.coverageMap.find((m) => m.regionId === region.regionId)!;
    expect(mapEntry.supersessionStatus).toBe("KNOWN_SUPERSEDED");
  });

  it("a document never covered by the supplied supersessionIndex resolves UNKNOWN, never CURRENT_OPERATIVE - fail-closed even with a real (but incomplete) index supplied", () => {
    const documentId = "doc-not-covered";
    const text = `SECTION 6.01. Indebtedness . The Borrower shall not incur Indebtedness in excess of $5,000,000.`;
    const index = buildTestIndex([{ documentId, label: "CA", text }]);
    const supersessionIndex: NodeSupersessionIndex = { coveredDocumentIds: new Set(["some-other-doc"]), supersededByNodeId: new Map(), ambiguousNodeIds: new Set() };
    const result = runIndependentCoverageAudit({ companyId: "c", packageKey: "p", instrumentKey: null, documentIds: [documentId], index, candidates: [], packageGraph: null, bundles: [], supersessionIndex });
    expect(result.regions.length).toBeGreaterThan(0);
    expect(result.regions.every((r) => r.supersessionStatus === "UNKNOWN_SUPERSESSION_STATUS")).toBe(true);
  });

  it("a node the supersessionIndex genuinely covers and does NOT mark superseded/ambiguous correctly resolves CURRENT_OPERATIVE", () => {
    const documentId = "doc";
    const text = `SECTION 6.01. Indebtedness . The Borrower shall not incur Indebtedness in excess of $5,000,000.`;
    const index = buildTestIndex([{ documentId, label: "CA", text }]);
    const supersessionIndex: NodeSupersessionIndex = { coveredDocumentIds: new Set([documentId]), supersededByNodeId: new Map(), ambiguousNodeIds: new Set() };
    const result = runIndependentCoverageAudit({ companyId: "c", packageKey: "p", instrumentKey: null, documentIds: [documentId], index, candidates: [], packageGraph: null, bundles: [], supersessionIndex });
    expect(result.regions.length).toBeGreaterThan(0);
    expect(result.regions.every((r) => r.supersessionStatus === "CURRENT_OPERATIVE")).toBe(true);
  });
});

/**
 * Phase 3F.1.6.RX Workstream B - BLOCKER-3 independent runtime trace (item
 * 5's own explicit ask: confirm actual behavior differs MEANINGFULLY with
 * vs. without a supersessionIndex, not that the parameter is merely
 * plumbed through unused). Every existing test above checks ONE node's own
 * tag in isolation. This trace instead builds a REAL 2-section document
 * where the two sections are GENUINELY DIFFERENT (one superseded, one
 * not) and confirms:
 *   - the RAW mode (buildSourceCoverageInventory called directly, and
 *     runIndependentCoverageAudit with no supersessionIndex) is BLIND to
 *     this real difference - both sections tag identically (UNKNOWN),
 *     never accidentally differentiating them by chance;
 *   - the OPERATIVE mode (a real supersessionIndex supplied) correctly
 *     DIFFERENTIATES the two real, different sections - proving the
 *     parameter's presence causes a genuine, input-dependent behavioral
 *     difference, not a decorative pass-through that always resolves the
 *     same way regardless of what the index actually says.
 */
describe("BLOCKER-3 independent trace: raw mode is genuinely blind to a REAL difference the operative mode correctly detects", () => {
  const documentId = "doc-two-sections";
  const text = `SECTION 6.01. Indebtedness . The Borrower shall not incur Indebtedness in excess of $5,000,000.\n\nSECTION 6.02. Liens . The Borrower shall not create any Lien in excess of $2,000,000.`;

  function buildRegionsFor(supersessionIndex?: NodeSupersessionIndex) {
    const index = buildTestIndex([{ documentId, label: "CA", text }]);
    const node601 = index.getNodeByRef(documentId, "6.01")!;
    const node602 = index.getNodeByRef(documentId, "6.02")!;
    const result = runIndependentCoverageAudit({ companyId: "c", packageKey: "p", instrumentKey: null, documentIds: [documentId], index, candidates: [], packageGraph: null, bundles: [], supersessionIndex });
    return { result, node601, node602 };
  }

  it("RAW mode: two genuinely different real sections (one superseded in reality, one not) tag IDENTICALLY when no supersessionIndex is supplied - the raw scan has no way to tell them apart, and honestly does not pretend to", () => {
    // No index at all - the honest "never checked" case. Note: the REAL
    // superseded/not-superseded fact about 6.01 vs 6.02 is established
    // below (in the OPERATIVE mode test) using the SAME document/nodeIds -
    // this test proves the raw path is blind to that same real fact.
    const { result, node601, node602 } = buildRegionsFor(undefined);
    const region601 = result.regions.find((r) => r.structuralNodeId === node601.nodeId)!;
    const region602 = result.regions.find((r) => r.structuralNodeId === node602.nodeId)!;
    expect(region601).toBeDefined();
    expect(region602).toBeDefined();
    expect(region601.supersessionStatus).toBe(region602.supersessionStatus);
    expect(region601.supersessionStatus).toBe("UNKNOWN_SUPERSESSION_STATUS");
  });

  it("OPERATIVE mode: the SAME two real sections, with a real supersessionIndex reflecting that 6.01 (not 6.02) was actually superseded, now correctly DIFFERENTIATE - proving the parameter's effect is genuinely input-dependent, not a constant re-tag", () => {
    const index = buildTestIndex([{ documentId, label: "CA", text }]);
    const node601 = index.getNodeByRef(documentId, "6.01")!;
    const node602 = index.getNodeByRef(documentId, "6.02")!;
    const supersessionIndex: NodeSupersessionIndex = {
      coveredDocumentIds: new Set([documentId]),
      supersededByNodeId: new Map([[node601.nodeId, { nodeId: node601.nodeId, instrumentKey: "instrument-1", provisionKey: "6.01", supersededByEffectId: "eff-1", supersededByAmendmentDocumentId: "amend-doc", supersededEffectiveDate: "2024-06-01" }]]),
      ambiguousNodeIds: new Set(),
    };
    const result = runIndependentCoverageAudit({ companyId: "c", packageKey: "p", instrumentKey: null, documentIds: [documentId], index, candidates: [], packageGraph: null, bundles: [], supersessionIndex });
    const region601 = result.regions.find((r) => r.structuralNodeId === node601.nodeId)!;
    const region602 = result.regions.find((r) => r.structuralNodeId === node602.nodeId)!;
    // The two real, different sections now correctly resolve DIFFERENTLY -
    // not both UNKNOWN (the raw-mode result above), and not both the same
    // value by coincidence.
    expect(region601.supersessionStatus).toBe("KNOWN_SUPERSEDED");
    expect(region602.supersessionStatus).toBe("CURRENT_OPERATIVE");
    expect(region601.supersessionStatus).not.toBe(region602.supersessionStatus);

    // Findings inherit the SAME real per-node differentiation (never
    // uniformly re-tagged regardless of which node a finding traces to).
    const findings601 = result.findings.filter((f) => f.structuralNodeId === node601.nodeId);
    const findings602 = result.findings.filter((f) => f.structuralNodeId === node602.nodeId);
    if (findings601.length > 0) expect(findings601.every((f) => f.supersessionStatus === "KNOWN_SUPERSEDED")).toBe(true);
    if (findings602.length > 0) expect(findings602.every((f) => f.supersessionStatus === "CURRENT_OPERATIVE")).toBe(true);
  });

  it("buildSourceCoverageInventory itself (called directly, bypassing pipeline.ts entirely) is identically raw regardless of what a real amendment resolution WOULD say - confirms the raw/operative split is a real architectural boundary (source-inventory.ts truly cannot see amendment/* data), not merely an unexercised code path", () => {
    const index = buildTestIndex([{ documentId, label: "CA", text }]);
    const node601 = index.getNodeByRef(documentId, "6.01")!;
    const regionsDirect = buildSourceCoverageInventory(documentId, index, { companyId: "c", packageKey: "p", instrumentKey: null });
    const region601Direct = regionsDirect.find((r) => r.structuralNodeId === node601.nodeId)!;
    // Even though we (the test) KNOW 6.01 is "superseded" in this same
    // scenario (established above), the direct call - which has no
    // supersessionIndex parameter at all, by construction - cannot possibly
    // know that: source-inventory.ts has zero import from amendment/*.
    expect(region601Direct.supersessionStatus).toBe("UNKNOWN_SUPERSESSION_STATUS");
  });
});
