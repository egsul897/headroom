/**
 * Phase 3E §154 - document-root traversal + high-recall router tests.
 * Uses the same real parse -> detect -> buildStructuralIndex pipeline every
 * other phase's tests use (buildTestIndex) - never a mocked StructuralIndex.
 */
import { describe, expect, it } from "vitest";
import { routeDocument, routePackageDocuments } from "../../lib/contract-model/compiler/semantic-coverage/router";
import { buildTestIndex } from "./context-retrieval-test-utils";

const SAMPLE_DOCUMENT = `
ARTICLE VI. NEGATIVE COVENANTS

Section 6.01 Indebtedness. The Borrower shall not, and shall not permit any Restricted Subsidiary to, create, incur, assume or suffer to exist any Indebtedness, except:

(a) Indebtedness existing on the Closing Date in an aggregate principal amount not to exceed $10,000,000;
(b) Indebtedness incurred to finance the acquisition of fixed assets in an aggregate amount not to exceed $5,000,000 at any time outstanding;
(c) unsecured Indebtedness of the Borrower to any Restricted Subsidiary.

Section 6.02 Liens. The Borrower shall not, and shall not permit any Restricted Subsidiary to, create or suffer to exist any Lien on any property, except Permitted Liens.

Section 1.01 Definitions.

"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication, the sum of (a) Consolidated Interest Expense, (b) provision for taxes, and (c) depreciation and amortization expense, in each case for such period.

Section 9.01 Signatures.

IN WITNESS WHEREOF, the parties have caused this Agreement to be duly executed by their respective officers thereunto duly authorized, as of the date first written above.
`;

function buildIndex() {
  return buildTestIndex([{ documentId: "doc-1", label: "Credit Agreement", text: SAMPLE_DOCUMENT }]);
}

describe("Phase 3E router: routeDocument (task §154)", () => {
  it("routes the entire document root - never a hand-selected section subset", () => {
    const index = buildIndex();
    const result = routeDocument("doc-1", index);
    expect(result.totalNodesScanned).toBeGreaterThan(0);
    // Every admitted region must correspond to a real node scanned from allNodes(), not an externally supplied hint list.
    expect(result.admittedNodeCount).toBeLessThanOrEqual(result.totalNodesScanned);
  });

  it("admits the Indebtedness prohibition section via INDEPENDENT_SIGNAL", () => {
    const index = buildIndex();
    const result = routeDocument("doc-1", index);
    const indebtedness = result.regions.find((r) => r.sectionRef?.includes("6.01") && !r.sectionRef.includes("("));
    expect(indebtedness).toBeDefined();
    expect(indebtedness!.admissionReasons).toContain("INDEPENDENT_SIGNAL");
  });

  it("admits each enumerated exception carve-out with its own quantitative cap as its own region (high recall on multi-item baskets)", () => {
    const index = buildIndex();
    const result = routeDocument("doc-1", index);
    const carveoutA = result.regions.find((r) => r.excerptText.includes("$10,000,000"));
    const carveoutB = result.regions.find((r) => r.excerptText.includes("$5,000,000"));
    expect(carveoutA).toBeDefined();
    expect(carveoutB).toBeDefined();
  });

  it("admits the definitions section via DEFINITION_NODE even though it contains no prohibition/permission language", () => {
    const index = buildIndex();
    const result = routeDocument("doc-1", index);
    const definition = result.regions.find((r) => r.excerptText.includes("Consolidated EBITDA"));
    expect(definition).toBeDefined();
    expect(definition!.admissionReasons).toContain("DEFINITION_NODE");
  });

  it("never admits pure boilerplate with zero independent signal and no headline/definition shape", () => {
    const index = buildIndex();
    const result = routeDocument("doc-1", index);
    const boilerplate = result.regions.find((r) => r.excerptText.includes("IN WITNESS WHEREOF"));
    expect(boilerplate).toBeUndefined();
  });

  it("every region is content-derived and stable across repeated calls (reproducibility, Architecture Invariants #21)", () => {
    const index = buildIndex();
    const first = routeDocument("doc-1", index);
    const second = routeDocument("doc-1", index);
    expect(first.regions.map((r) => r.regionId).sort()).toEqual(second.regions.map((r) => r.regionId).sort());
  });

  it("routePackageDocuments routes every document in the package independently", () => {
    const index = buildTestIndex([
      { documentId: "doc-1", label: "Credit Agreement", text: SAMPLE_DOCUMENT },
      { documentId: "doc-2", label: "Second Document", text: SAMPLE_DOCUMENT.replace("6.01", "7.01").replace("6.02", "7.02") },
    ]);
    const results = routePackageDocuments(["doc-1", "doc-2"], index);
    expect(results).toHaveLength(2);
    expect(results[0]!.documentId).toBe("doc-1");
    expect(results[1]!.documentId).toBe("doc-2");
    expect(results[1]!.regions.length).toBeGreaterThan(0);
  });
});
