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
