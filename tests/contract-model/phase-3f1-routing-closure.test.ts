/**
 * Phase 3F.1 Workstream A (F1) - hierarchical routing closure. The DSGR
 * first-blind run's actual root cause was in ROUTING, not classification:
 * an operative prohibition and its lettered exception-list items are
 * separate structural nodes, each evaluated in isolation by the original
 * router. A qualitative basket item with no inline dollar/percentage/
 * keyword token of its own (e.g. "intercompany advances made in the
 * ordinary course of business") was never routed at all - no downstream
 * materiality fix (Workstream B) can recover a unit that was never
 * hypothesized because its region was never admitted.
 *
 * All fixture text is invented for this file - no DSGR-specific content
 * (task §4's explicit prohibition, this session's established
 * anti-overfitting discipline).
 *
 * Covers task §38/§41/§44/§45 points: routing closure (child/sibling/
 * chapeau/proviso/ancestor), boundedness (depth cap, per-seed node cap,
 * closureStats), and false-positive control (non-operative seeds must not
 * sweep in unrelated children).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { StructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import type { StructuralNode } from "../../lib/contract-model/compiler/types";
import { closeRoutedRegions, MAX_CLOSURE_DEPTH, MAX_CLOSURE_NODES_PER_SEED, routeDocument } from "../../lib/contract-model/compiler/semantic-coverage/router";
import type { RoutedRegion } from "../../lib/contract-model/compiler/semantic-coverage/types";
import { buildTestIndex } from "./context-retrieval-test-utils";

function buildIndex(text: string) {
  return buildTestIndex([{ documentId: "doc-1", label: "Credit Agreement", text }]);
}

function regionAt(regions: RoutedRegion[], sectionRef: string): RoutedRegion | undefined {
  return regions.find((r) => r.sectionRef === sectionRef);
}

// ---------------------------------------------------------------------------
// End-to-end tests through the real parser -> router pipeline.
// ---------------------------------------------------------------------------

describe("Phase 3F.1 F1 - end-to-end child + sibling closure (the exact DSGR-confirmed gap)", () => {
  const DOCUMENT = `
ARTICLE VI. NEGATIVE COVENANTS

Section 6.01 Indebtedness. The Borrower shall not, and shall not permit any Subsidiary to, create, incur, assume or suffer to exist any Indebtedness, except:

(a) Indebtedness existing on the Closing Date in an aggregate principal amount not to exceed $10,000,000;
(b) intercompany advances made in the ordinary course of business;
(c) obligations arising under normal trade credit terms extended by suppliers.
`;

  it("11. admits qualitative exception-list items with zero local signal via CHILD_OF_ROUTED_COVENANT_REGION, closing the exact routing gap the original router missed", () => {
    const index = buildIndex(DOCUMENT);
    const result = routeDocument("doc-1", index);
    const itemB = regionAt(result.regions, "6.01(b)");
    const itemC = regionAt(result.regions, "6.01(c)");
    expect(itemB).toBeDefined();
    expect(itemC).toBeDefined();
    expect(itemB!.admissionReasons).toContain("CHILD_OF_ROUTED_COVENANT_REGION");
    expect(itemC!.admissionReasons).toContain("CHILD_OF_ROUTED_COVENANT_REGION");
    expect(itemB!.closureDepth).toBe(1);
    expect(itemB!.closureSourceNodeKey).toBe("doc-1::6.01");
  });

  it("12. the operative chapeau itself is still admitted via its own local signal (closure is additive, never a replacement for the seed pass)", () => {
    const index = buildIndex(DOCUMENT);
    const result = routeDocument("doc-1", index);
    const chapeau = regionAt(result.regions, "6.01");
    expect(chapeau).toBeDefined();
    expect(chapeau!.admissionReasons).toContain("INDEPENDENT_SIGNAL");
    expect(chapeau!.closureDepth).toBe(0);
  });

  it("13. closureStats reports a nonzero, bounded expansion for this document", () => {
    const index = buildIndex(DOCUMENT);
    const result = routeDocument("doc-1", index);
    expect(result.closureStats.closureAdmittedRegionCount).toBeGreaterThan(0);
    expect(result.closureStats.expansionFactor).toBeGreaterThan(0);
    expect(result.closureStats.capped).toBe(false);
  });
});

describe("Phase 3F.1 F1 - end-to-end chapeau + sibling closure from a non-prohibitory enumeration", () => {
  const DOCUMENT = `
Section 6.06 Ordinary Course Limitations. The Borrower will comply with the limitations set forth below:

(a) intercompany advances made in the ordinary course of business;
(b) payments in an aggregate amount not to exceed $1,000,000 in any fiscal year;
(c) advances to employees for relocation expenses in the ordinary course of business.
`;

  it("14. the chapeau (no independent signal, non-headline heading) is admitted via CHAPEAU_OF_ROUTED_ENUMERATION once one of its list items independently qualifies", () => {
    const index = buildIndex(DOCUMENT);
    const result = routeDocument("doc-1", index);
    const chapeau = regionAt(result.regions, "6.06");
    expect(chapeau).toBeDefined();
    expect(chapeau!.admissionReasons).toContain("CHAPEAU_OF_ROUTED_ENUMERATION");
  });

  it("15/16. sibling items with no local signal of their own are admitted via SIBLING_IN_ROUTED_EXCEPTION_LIST once a sibling in the same list independently qualifies", () => {
    const index = buildIndex(DOCUMENT);
    const result = routeDocument("doc-1", index);
    const itemA = regionAt(result.regions, "6.06(a)");
    const itemC = regionAt(result.regions, "6.06(c)");
    expect(itemA).toBeDefined();
    expect(itemC).toBeDefined();
    expect(itemA!.admissionReasons).toContain("SIBLING_IN_ROUTED_EXCEPTION_LIST");
    expect(itemC!.admissionReasons).toContain("SIBLING_IN_ROUTED_EXCEPTION_LIST");
  });
});

describe("Phase 3F.1 F1 - false-positive control (closure must not become 'route the whole document')", () => {
  const DOCUMENT = `
ARTICLE VI. NEGATIVE COVENANTS

Section 6.02 Liens. The following exceptions apply:

(a) encumbrances arising by operation of law in the ordinary course of business.

Section 1.01 Definitions.

"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication, certain customary addbacks in the ordinary course of business.

(a) certain customary addbacks are further described in the ordinary course of business.
`;

  it("17. a HEADLINE_SECTION/FAMILY_HEADLINE-only seed (no prohibition/permission/exception signal) does NOT trigger CHILD_OF_ROUTED_COVENANT_REGION closure - a bare family-keyword hit is not an operative scope", () => {
    const index = buildIndex(DOCUMENT);
    const result = routeDocument("doc-1", index);
    const chapeau = regionAt(result.regions, "6.02");
    expect(chapeau).toBeDefined();
    expect(chapeau!.admissionReasons).toContain("HEADLINE_SECTION");
    const child = regionAt(result.regions, "6.02(a)");
    expect(child).toBeUndefined();
  });

  it("18. a DEFINITION_NODE-only seed does NOT trigger CHILD_OF_ROUTED_COVENANT_REGION closure - definitions are admitted for their own reason, not as an operative scope to expand from", () => {
    const index = buildIndex(DOCUMENT);
    const result = routeDocument("doc-1", index);
    const child = regionAt(result.regions, "1.01(a)");
    expect(child).toBeUndefined();
  });

  it("19/20. routing is deterministic and idempotent across repeated calls, including closure-admitted regions", () => {
    const index = buildIndex(DOCUMENT);
    const first = routeDocument("doc-1", index);
    const second = routeDocument("doc-1", index);
    expect(first.regions.map((r) => r.regionId).sort()).toEqual(second.regions.map((r) => r.regionId).sort());
    expect(first.closureStats).toEqual(second.closureStats);
  });
});

// ---------------------------------------------------------------------------
// Direct unit tests against closeRoutedRegions with a hand-built fake index -
// exercises ANCESTOR_SCOPE_CONTEXT and the per-seed node cap deterministically,
// independent of real-parser structural quirks.
// ---------------------------------------------------------------------------

interface FakeNode {
  node: StructuralNode;
  text: string;
  childKeys: string[];
}

function node(overrides: Partial<StructuralNode> & { nodeKey: string; sectionRef: string }): StructuralNode {
  return {
    documentId: "doc",
    nodeType: "SECTION",
    heading: "",
    charStart: 0,
    charEnd: 0,
    ordinal: 0,
    parentSectionRef: null,
    // Fake-index test harness: nodeId is given the same value as nodeKey
    // (both already unique per node within a single test's fixture) so
    // every call site below keeps working unchanged; parentNodeId is
    // derived from parentSectionRef using this file's own "doc::<ref>"
    // nodeKey convention. buildFakeIndex's own child/parent traversal is
    // driven by FakeNode.childKeys, never by this field, so it only needs
    // to be a well-typed, non-colliding value, not independently exercised.
    nodeId: overrides.nodeKey,
    parentNodeId: overrides.parentSectionRef ? `doc::${overrides.parentSectionRef}` : null,
    ...overrides,
  };
}

function buildFakeIndex(fakeNodes: FakeNode[]): StructuralIndex {
  const byId = new Map(fakeNodes.map((n) => [n.node.nodeId, n] as const));
  const parentOf = new Map<string, string>();
  for (const n of fakeNodes) for (const c of n.childKeys) parentOf.set(c, n.node.nodeId);
  return {
    getChildren: (nodeId: string) => (byId.get(nodeId)?.childKeys ?? []).map((k) => byId.get(k)!.node),
    getParent: (nodeId: string) => {
      const p = parentOf.get(nodeId);
      return p ? byId.get(p)!.node : undefined;
    },
    getNodeText: (nodeId: string) => byId.get(nodeId)?.text ?? "",
    getDocumentText: () => "",
    allNodes: () => fakeNodes.map((n) => n.node),
    searchStructuralNodes: () => [],
  } as unknown as StructuralIndex;
}

function seedRegionFor(n: StructuralNode, detectedSignals: string[]): RoutedRegion {
  return {
    regionId: `seed-${n.nodeId}`,
    documentId: "doc",
    structuralNodeKey: n.nodeKey,
    structuralNodeId: n.nodeId,
    sectionRef: n.sectionRef,
    charStart: 0,
    charEnd: 0,
    excerptText: "",
    detectedSignals,
    admissionReasons: ["INDEPENDENT_SIGNAL"],
    fromRawSourceFallback: false,
    routingAlgorithmVersion: "test",
    closureDepth: 0,
    closureSourceNodeKey: null,
    closureSourceNodeId: null,
  };
}

describe("Phase 3F.1 F1 - closeRoutedRegions unit tests: ANCESTOR_SCOPE_CONTEXT", () => {
  it("21. climbs exactly one bounded hop past the chapeau to an ancestor ARTICLE whose heading independently carries a family headline, when that ancestor was not itself admitted (an ARTICLE-level node is never eligible for HEADLINE_SECTION, which is SECTION-only)", () => {
    const article = node({ nodeKey: "doc::VI", sectionRef: "VI", nodeType: "ARTICLE", heading: "ARTICLE VI. INDEBTEDNESS" });
    const section = node({ nodeKey: "doc::6.09", sectionRef: "6.09", nodeType: "SECTION", heading: "Section 6.09 Additional Restrictions", parentSectionRef: "VI" });
    const item = node({ nodeKey: "doc::6.09(a)", sectionRef: "6.09(a)", nodeType: "SUBSECTION", parentSectionRef: "6.09" });
    const fakeNodes: FakeNode[] = [
      { node: article, text: "ARTICLE VI. INDEBTEDNESS", childKeys: ["doc::6.09"] },
      { node: section, text: "The following limitations shall apply to the Borrower's ordinary course operations:", childKeys: ["doc::6.09(a)"] },
      { node: item, text: "the Borrower may enter into operating leases with an aggregate annual rent not to exceed $2,000,000.", childKeys: [] },
    ];
    const index = buildFakeIndex(fakeNodes);
    const seed = seedRegionFor(item, ["currency_value", "aggregate_amount"]);
    const { closureRegions, stats } = closeRoutedRegions([seed], fakeNodes.map((n) => n.node), index, "doc");

    const chapeauRegion = closureRegions.find((r) => r.structuralNodeKey === "doc::6.09");
    const ancestorRegion = closureRegions.find((r) => r.structuralNodeKey === "doc::VI");
    expect(chapeauRegion).toBeDefined();
    expect(chapeauRegion!.admissionReasons).toContain("CHAPEAU_OF_ROUTED_ENUMERATION");
    expect(ancestorRegion).toBeDefined();
    expect(ancestorRegion!.admissionReasons).toContain("ANCESTOR_SCOPE_CONTEXT");
    expect(ancestorRegion!.closureDepth).toBe(2);
    expect(stats.maxClosureDepth).toBe(2);
  });

  it("22. does NOT climb past the ancestor when the ancestor's own heading carries no family headline - bounded, not a document-wide walk", () => {
    const article = node({ nodeKey: "doc::VI", sectionRef: "VI", nodeType: "ARTICLE", heading: "ARTICLE VI. MISCELLANEOUS" });
    const section = node({ nodeKey: "doc::6.09", sectionRef: "6.09", nodeType: "SECTION", heading: "Section 6.09 Additional Restrictions", parentSectionRef: "VI" });
    const item = node({ nodeKey: "doc::6.09(a)", sectionRef: "6.09(a)", nodeType: "SUBSECTION", parentSectionRef: "6.09" });
    const fakeNodes: FakeNode[] = [
      { node: article, text: "ARTICLE VI. MISCELLANEOUS", childKeys: ["doc::6.09"] },
      { node: section, text: "The following limitations shall apply:", childKeys: ["doc::6.09(a)"] },
      { node: item, text: "the Borrower may enter into operating leases with an aggregate annual rent not to exceed $2,000,000.", childKeys: [] },
    ];
    const index = buildFakeIndex(fakeNodes);
    const seed = seedRegionFor(item, ["currency_value"]);
    const { closureRegions } = closeRoutedRegions([seed], fakeNodes.map((n) => n.node), index, "doc");
    expect(closureRegions.find((r) => r.structuralNodeKey === "doc::VI")).toBeUndefined();
  });
});

describe("Phase 3F.1 F1 - closeRoutedRegions unit tests: TRAILING_PROVISO_OF_ROUTED_REGION", () => {
  it("23. admits an immediately-following continuation paragraph with no independent signal of its own", () => {
    const chapeau = node({ nodeKey: "doc::6.01", sectionRef: "6.01", ordinal: 0 });
    const proviso = node({ nodeKey: "doc::6.02", sectionRef: "6.02", ordinal: 1 });
    const fakeNodes: FakeNode[] = [
      { node: chapeau, text: "The Borrower shall not incur Indebtedness.", childKeys: [] },
      { node: proviso, text: "provided, that clause 6.01 above shall apply only to advances made after the Closing Date.", childKeys: [] },
    ];
    const index = buildFakeIndex(fakeNodes);
    const seed = seedRegionFor(chapeau, ["shall_not"]);
    const { closureRegions } = closeRoutedRegions([seed], fakeNodes.map((n) => n.node), index, "doc");
    const provisoRegion = closureRegions.find((r) => r.structuralNodeKey === "doc::6.02");
    expect(provisoRegion).toBeDefined();
    expect(provisoRegion!.admissionReasons).toContain("TRAILING_PROVISO_OF_ROUTED_REGION");
  });

  it("24. does NOT admit a following paragraph that is not proviso-shaped text (ordinary next section, no continuation language)", () => {
    const chapeau = node({ nodeKey: "doc::6.01", sectionRef: "6.01", ordinal: 0 });
    const nextSection = node({ nodeKey: "doc::6.02", sectionRef: "6.02", ordinal: 1 });
    const fakeNodes: FakeNode[] = [
      { node: chapeau, text: "The Borrower shall not incur Indebtedness.", childKeys: [] },
      { node: nextSection, text: "The Borrower shall maintain its corporate existence.", childKeys: [] },
    ];
    const index = buildFakeIndex(fakeNodes);
    const seed = seedRegionFor(chapeau, ["shall_not"]);
    const { closureRegions } = closeRoutedRegions([seed], fakeNodes.map((n) => n.node), index, "doc");
    expect(closureRegions.find((r) => r.structuralNodeKey === "doc::6.02")).toBeUndefined();
  });
});

describe("Phase 3F.1 F1 - closeRoutedRegions unit tests: boundedness (per-seed node cap)", () => {
  it("25. a large flat enumeration under one operative seed is capped at MAX_CLOSURE_NODES_PER_SEED, disclosed via stats.capped - never an unbounded walk", () => {
    const N = 60;
    const chapeau = node({ nodeKey: "doc::6.01", sectionRef: "6.01" });
    const children: FakeNode[] = Array.from({ length: N }, (_, i) => ({
      node: node({ nodeKey: `doc::6.01(${i})`, sectionRef: `6.01(${i})`, ordinal: i }),
      text: `clause number ${i} carries no signal words of any kind.`,
      childKeys: [],
    }));
    const fakeNodes: FakeNode[] = [{ node: chapeau, text: "The Borrower shall not incur Indebtedness, except:", childKeys: children.map((c) => c.node.nodeKey) }, ...children];
    const index = buildFakeIndex(fakeNodes);
    const seed = seedRegionFor(chapeau, ["shall_not", "except"]);
    const { closureRegions, stats } = closeRoutedRegions([seed], fakeNodes.map((n) => n.node), index, "doc");

    expect(stats.capped).toBe(true);
    expect(closureRegions.length).toBeLessThan(N);
    expect(closureRegions.length).toBe(MAX_CLOSURE_NODES_PER_SEED - 1);
    expect(stats.largestClosureGroupSize).toBe(MAX_CLOSURE_NODES_PER_SEED);
  });

  it("26. a small enumeration well under the cap is never marked capped", () => {
    const chapeau = node({ nodeKey: "doc::6.01", sectionRef: "6.01" });
    const children: FakeNode[] = Array.from({ length: 3 }, (_, i) => ({
      node: node({ nodeKey: `doc::6.01(${i})`, sectionRef: `6.01(${i})`, ordinal: i }),
      text: `clause number ${i} carries no signal words of any kind.`,
      childKeys: [],
    }));
    const fakeNodes: FakeNode[] = [{ node: chapeau, text: "The Borrower shall not incur Indebtedness, except:", childKeys: children.map((c) => c.node.nodeKey) }, ...children];
    const index = buildFakeIndex(fakeNodes);
    const seed = seedRegionFor(chapeau, ["shall_not", "except"]);
    const { stats } = closeRoutedRegions([seed], fakeNodes.map((n) => n.node), index, "doc");
    expect(stats.capped).toBe(false);
    expect(stats.closureAdmittedRegionCount).toBe(3);
  });

  it("27. the closure BFS never descends past MAX_CLOSURE_DEPTH", () => {
    // A deep chain of nested enumerated items: 6.01 -> (a) -> (a)(i) -> (a)(i)(A) -> (a)(i)(A)(I) -> ...
    const chapeau = node({ nodeKey: "doc::6.01", sectionRef: "6.01" });
    const chain: FakeNode[] = [];
    let parentKey = "doc::6.01";
    for (let depth = 1; depth <= MAX_CLOSURE_DEPTH + 2; depth++) {
      const key = `doc::level-${depth}`;
      chain.push({ node: node({ nodeKey: key, sectionRef: `${"6.01"}${"(x)".repeat(depth)}`, ordinal: 0 }), text: `nested level ${depth} with no signal words.`, childKeys: [] });
      const parentEntry = parentKey === "doc::6.01" ? undefined : chain.find((c) => c.node.nodeKey === parentKey);
      if (parentEntry) parentEntry.childKeys.push(key);
      parentKey = key;
    }
    // Wire the chapeau's own single child.
    const fakeNodes: FakeNode[] = [{ node: chapeau, text: "The Borrower shall not incur Indebtedness, except:", childKeys: [chain[0]!.node.nodeKey] }, ...chain];
    const index = buildFakeIndex(fakeNodes);
    const seed = seedRegionFor(chapeau, ["shall_not", "except"]);
    const { closureRegions } = closeRoutedRegions([seed], fakeNodes.map((n) => n.node), index, "doc");
    expect(Math.max(...closureRegions.map((r) => r.closureDepth))).toBeLessThanOrEqual(MAX_CLOSURE_DEPTH);
    // The deepest constructed nodes (beyond MAX_CLOSURE_DEPTH) must never appear.
    expect(closureRegions.find((r) => r.structuralNodeKey === chain[chain.length - 1]!.node.nodeKey)).toBeUndefined();
  });
});

describe("Phase 3F.1 F1 - closeRoutedRegions unit tests: raw-source-fallback seeds are inert for closure", () => {
  it("28. a raw-source-fallback seed (no structural node) is skipped entirely - nothing to expand from", () => {
    const rawSeed: RoutedRegion = {
      regionId: "raw-1",
      documentId: "doc",
      structuralNodeKey: null,
      structuralNodeId: null,
      sectionRef: null,
      charStart: 0,
      charEnd: 10,
      excerptText: "raw text",
      detectedSignals: ["shall_not"],
      admissionReasons: ["RAW_SOURCE_FALLBACK"],
      fromRawSourceFallback: true,
      routingAlgorithmVersion: "test",
      closureDepth: 0,
      closureSourceNodeKey: null,
      closureSourceNodeId: null,
    };
    const index = buildFakeIndex([]);
    const { closureRegions, stats } = closeRoutedRegions([rawSeed], [], index, "doc");
    expect(closureRegions).toHaveLength(0);
    expect(stats.closureAdmittedRegionCount).toBe(0);
    expect(stats.capped).toBe(false);
  });

  it("29. a raw-source-fallback seed coexisting with a real structural operative seed does not interfere with that seed's own closure - mixed seed lists are handled independently", () => {
    const chapeau = node({ nodeKey: "doc::6.01", sectionRef: "6.01" });
    const child = node({ nodeKey: "doc::6.01(a)", sectionRef: "6.01(a)" });
    const fakeNodes: FakeNode[] = [
      { node: chapeau, text: "The Borrower shall not incur Indebtedness, except:", childKeys: ["doc::6.01(a)"] },
      { node: child, text: "advances made in the ordinary course of business, with no signal words.", childKeys: [] },
    ];
    const index = buildFakeIndex(fakeNodes);
    const rawSeed: RoutedRegion = {
      regionId: "raw-1",
      documentId: "doc",
      structuralNodeKey: null,
      structuralNodeId: null,
      sectionRef: null,
      charStart: 500,
      charEnd: 600,
      excerptText: "unrelated raw-fallback text elsewhere in the document",
      detectedSignals: ["hereby_amended"],
      admissionReasons: ["RAW_SOURCE_FALLBACK"],
      fromRawSourceFallback: true,
      routingAlgorithmVersion: "test",
      closureDepth: 0,
      closureSourceNodeKey: null,
      closureSourceNodeId: null,
    };
    const structuralSeed = seedRegionFor(chapeau, ["shall_not", "except"]);
    const { closureRegions, stats } = closeRoutedRegions([rawSeed, structuralSeed], fakeNodes.map((n) => n.node), index, "doc");
    expect(closureRegions.find((r) => r.structuralNodeKey === "doc::6.01(a)")).toBeDefined();
    expect(stats.seedRegionCount).toBe(2);
    expect(stats.closureAdmittedRegionCount).toBe(1);
  });
});

describe("Phase 3F.1 F1 - independence (task §21/§29): closure introduces no new forbidden-module dependency and no package-specific lookup", () => {
  it("30. router.ts's own source carries no discovery/context-retrieval/compiler/verifier/precedent import - closure was added without widening the Independence Contract boundary", () => {
    const source = fs.readFileSync(path.join(__dirname, "../../lib/contract-model/compiler/semantic-coverage/router.ts"), "utf-8");
    const importLines = source.split("\n").filter((l) => /^\s*import\b/.test(l));
    const forbidden = [/discovery\//, /context-retrieval\//, /semantic\/compile/, /semantic\/caller/, /semantic\/package-compile/, /semantic-verification\//, /semantic-precedent\//];
    for (const pattern of forbidden) {
      expect(importLines.some((l) => pattern.test(l)), `router.ts must not import anything matching ${pattern}`).toBe(false);
    }
  });

  it("31. no closure trigger set (OPERATIVE_CLOSURE_TRIGGER_SIGNALS) or regex in router.ts's EXECUTABLE source (comments stripped - a doc-comment explaining the DSGR-motivated root cause is expected and is not production logic, task §4's own distinction) references a package-specific identifier", () => {
    const source = fs.readFileSync(path.join(__dirname, "../../lib/contract-model/compiler/semantic-coverage/router.ts"), "utf-8");
    const codeOnly = source
      .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
      .split("\n")
      .filter((l) => !/^\s*\/\//.test(l)) // whole-line // comments
      .join("\n");
    const forbiddenTokens = [/dsgr/i, /distribution solutions group/i];
    for (const pattern of forbiddenTokens) {
      expect(pattern.test(codeOnly), `router.ts's executable code must not reference ${pattern}`).toBe(false);
    }
  });
});
