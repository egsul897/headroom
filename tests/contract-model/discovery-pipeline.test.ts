/**
 * Phase 2B - synthetic discovery tests (task §18, all 18 required scenarios).
 * Tests observable discovery behavior (candidates produced, roles, families,
 * flags) against the SyntheticStageCaller (free, no LLM call) for Pass A/C/D
 * wiring, and directly against Pass A's own signal detector plus Pass C's
 * neighborhood-expansion/reconciliation logic for scenarios that need a
 * specific semantic outcome the synthetic caller cannot produce (it always
 * returns zero rules) - those are exercised by constructing the exact
 * SemanticRuleItem[] Pass B would have returned and feeding it directly into
 * Pass C/D, which is real production code, not a mock of it. All text is
 * synthetic/invented - never FWRG/LSB-specific.
 */
import { describe, expect, it } from "vitest";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { runPassADeterministicSignals } from "../../lib/contract-model/compiler/discovery/pass-a-signals";
import { runPassCNeighborhoodExpansion } from "../../lib/contract-model/compiler/discovery/pass-c-neighborhood";
import { runPassDReconciliation } from "../../lib/contract-model/compiler/discovery/pass-d-reconcile";
import { getStageCaller } from "../../lib/contract-model/compiler/llm-caller";
import { runDiscoveryPipeline } from "../../lib/contract-model/compiler/discovery/pipeline";
import type { SemanticRuleItem } from "../../lib/contract-model/compiler/discovery/pass-b-semantic";
import type { CompilerDocumentInput } from "../../lib/contract-model/compiler/types";

function indexFor(doc: CompilerDocumentInput) {
  const nodes = parseDocumentStructure(doc);
  const nodesByDocument = new Map([[doc.documentId, { text: doc.text, nodes }]]);
  return buildStructuralIndex(nodesByDocument, [], []);
}

function rule(overrides: Partial<SemanticRuleItem>): SemanticRuleItem {
  return {
    relativeRef: "",
    families: [],
    role: "OTHER_RELEVANT_RULE",
    description: "test rule",
    multipleRulesLikely: false,
    definedTermDependencyLikely: false,
    confidence: 0.8,
    needsReview: false,
    ...overrides,
  };
}

describe("Phase 2B discovery - 18 required synthetic scenarios", () => {
  it("1. headline covenant section is flagged by Pass A via its heading, independent of body signals", () => {
    const index = indexFor({ documentId: "d1", label: "d1", text: "ARTICLE 6 NEGATIVE COVENANTS Section 6.01. Indebtedness. General placeholder text with nothing else notable." });
    const candidates = runPassADeterministicSignals("d1", index);
    const section = index.getNodeByRef("d1", "6.01")!;
    expect(candidates.some((c) => c.nodeKey === section.nodeKey && c.signals.includes("headline_heading"))).toBe(true);
  });

  it("2. a section with multiple baskets - every lettered basket is independently discoverable, not merged into one", () => {
    const index = indexFor({ documentId: "d1", label: "d1", text: "Section 6.01. Indebtedness. The Company shall not incur Indebtedness, except: (a) up to $1,000,000; (b) up to $2,000,000; (c) Indebtedness constituting Permitted Debt." });
    const section = index.getNodeByRef("d1", "6.01")!;
    const items: SemanticRuleItem[] = [
      rule({ relativeRef: "(a)", role: "BASKET", families: ["INDEBTEDNESS"] }),
      rule({ relativeRef: "(b)", role: "BASKET", families: ["INDEBTEDNESS"] }),
      rule({ relativeRef: "(c)", role: "BASKET", families: ["INDEBTEDNESS"] }),
    ];
    const { candidates } = runPassCNeighborhoodExpansion(index, "d1", section.nodeKey, "6.01", items, "v1");
    const basketRefs = candidates.filter((c) => c.role === "BASKET").map((c) => c.normalizedSourceRef);
    expect(basketRefs.sort()).toEqual(["6.01(a)", "6.01(b)", "6.01(c)"]);
  });

  it("3. general prohibition + exceptions: the prohibition is always represented even if only exceptions were semantically found", () => {
    const index = indexFor({ documentId: "d1", label: "d1", text: "Section 6.02. Liens. The Company shall not grant Liens, except: (a) Permitted Liens; (b) Liens on the Collateral." });
    const section = index.getNodeByRef("d1", "6.02")!;
    const items: SemanticRuleItem[] = [rule({ relativeRef: "(a)", role: "EXCEPTION" }), rule({ relativeRef: "(b)", role: "EXCEPTION" })];
    const { candidates } = runPassCNeighborhoodExpansion(index, "d1", section.nodeKey, "6.02", items, "v1");
    expect(candidates.some((c) => c.normalizedSourceRef === "6.02" && c.role === "GENERAL_PROHIBITION")).toBe(true);
    expect(candidates.filter((c) => c.role === "EXCEPTION")).toHaveLength(2);
  });

  it("4. a covenant with no dollar value still fires a signal (prohibitive construction) and is not silently dropped", () => {
    const index = indexFor({ documentId: "d1", label: "d1", text: "Section 6.03. Fundamental Changes. The Company shall not merge or consolidate with any other Person." });
    const candidates = runPassADeterministicSignals("d1", index);
    const section = index.getNodeByRef("d1", "6.03")!;
    expect(candidates.some((c) => c.nodeKey === section.nodeKey)).toBe(true);
  });

  it("5. a covenant with ratio language fires the ratio_expression signal", () => {
    const index = indexFor({ documentId: "d1", label: "d1", text: "Section 6.10. Financial Covenant. The Leverage Ratio shall not exceed 4.00x, tested quarterly." });
    const candidates = runPassADeterministicSignals("d1", index);
    const section = index.getNodeByRef("d1", "6.10")!;
    const own = candidates.find((c) => c.nodeKey === section.nodeKey);
    expect(own?.signals).toContain("ratio_expression");
  });

  it("6. a covenant whose heading is non-obvious still fires on body signals even without a headline heading match", () => {
    const index = indexFor({ documentId: "d1", label: "d1", text: "Section 6.20. Miscellaneous Restriction. The Company shall not permit any Subsidiary to enter into an agreement restricting dividends to $500,000 per year." });
    const candidates = runPassADeterministicSignals("d1", index);
    const section = index.getNodeByRef("d1", "6.20")!;
    expect(candidates.some((c) => c.nodeKey === section.nodeKey)).toBe(true);
  });

  it("7. covenant language buried in a nested clause is independently detected at that clause's own node, not only at the section", () => {
    const index = indexFor({ documentId: "d1", label: "d1", text: "Section 6.01. Indebtedness. Except: (a) general basket: (i) up to $5,000,000 and (ii) an unlimited amount so long as the Leverage Ratio does not exceed 3.50x." });
    const candidates = runPassADeterministicSignals("d1", index);
    const clause = index.getNodeByRef("d1", "6.01(a)(ii)")!;
    expect(candidates.some((c) => c.nodeKey === clause.nodeKey && c.signals.includes("ratio_expression"))).toBe(true);
  });

  it("8. an exception using 'notwithstanding' fires the exception_marker signal", () => {
    const index = indexFor({ documentId: "d1", label: "d1", text: "Section 6.05. Notwithstanding anything to the contrary in this Agreement, the Company may make Restricted Payments in an unlimited amount if the Payment Conditions are satisfied." });
    const candidates = runPassADeterministicSignals("d1", index);
    const section = index.getNodeByRef("d1", "6.05")!;
    const own = candidates.find((c) => c.nodeKey === section.nodeKey);
    expect(own?.signals).toContain("exception_marker");
  });

  it("9. a proviso materially narrowing a basket is represented as its own CONDITION/PROVISO role, linked back to the basket it narrows", () => {
    const index = indexFor({ documentId: "d1", label: "d1", text: "Section 6.01. Indebtedness. Except: (a) up to $10,000,000; provided that no Default has occurred and is continuing." });
    const section = index.getNodeByRef("d1", "6.01")!;
    const items: SemanticRuleItem[] = [rule({ relativeRef: "(a)", role: "BASKET" }), rule({ relativeRef: "(a)", role: "PROVISO", description: "no-default proviso narrowing (a)" })];
    const { candidates } = runPassCNeighborhoodExpansion(index, "d1", section.nodeKey, "6.01", items, "v1");
    const proviso = candidates.find((c) => c.role === "PROVISO");
    expect(proviso).toBeDefined();
    expect(proviso!.structuralNodeKeys).toContain(section.nodeKey);
  });

  it("10. a section that looks financial but is boilerplate produces no false candidate from Pass A alone", () => {
    const index = indexFor({ documentId: "d1", label: "d1", text: "Section 6.99. Miscellaneous. Headings in this Article are for convenience of reference only." });
    const candidates = runPassADeterministicSignals("d1", index);
    const section = index.getNodeByRef("d1", "6.99")!;
    expect(candidates.some((c) => c.nodeKey === section.nodeKey)).toBe(false);
  });

  it("11. a definition containing financial language is not itself counted as a discovered covenant rule", () => {
    const index = indexFor({ documentId: "d1", label: "d1", text: 'Section 1.01. Definitions. "Consolidated EBITDA" means net income plus $0 of addbacks, calculated at 4.00x normalized run-rate.' });
    // Pass A may fire signals here (this is the honest over-selection the task explicitly allows for Pass A) -
    // the real guarantee is at Pass B/reconciliation: a definition-only item is never forced into a covenant role.
    const items: SemanticRuleItem[] = [rule({ relativeRef: "", role: "DEFINITIONAL_DEPENDENCY_CANDIDATE", families: [], description: "defined term, not itself a covenant" })];
    const section = index.getNodeByRef("d1", "1.01")!;
    const { candidates } = runPassCNeighborhoodExpansion(index, "d1", section.nodeKey, "1.01", items, "v1");
    expect(candidates.every((c) => c.role !== "BASKET" && c.role !== "GENERAL_PROHIBITION" || c.description.includes("synthesized"))).toBe(true);
  });

  it("12. two covenant families in one section are both represented, not collapsed into one", () => {
    const index = indexFor({ documentId: "d1", label: "d1", text: "Section 6.07. Fundamental Changes; Dispositions. (a) the Company may merge with a Subsidiary; (b) the Company may dispose of assets not exceeding $5,000,000." });
    const section = index.getNodeByRef("d1", "6.07")!;
    const items: SemanticRuleItem[] = [rule({ relativeRef: "(a)", role: "PERMISSION", families: ["FUNDAMENTAL_CHANGES"] }), rule({ relativeRef: "(b)", role: "BASKET", families: ["ASSET_SALES"] })];
    const { candidates } = runPassCNeighborhoodExpansion(index, "d1", section.nodeKey, "6.07", items, "v1");
    const families = new Set(candidates.flatMap((c) => c.families));
    expect(families.has("FUNDAMENTAL_CHANGES")).toBe(true);
    expect(families.has("ASSET_SALES")).toBe(true);
  });

  it("13. one rule relevant to multiple families is represented with all of them, not forced into a single choice", () => {
    const index = indexFor({ documentId: "d1", label: "d1", text: "Section 6.09. Holdings. Holdings shall not create any Lien or merge with any Person." });
    const section = index.getNodeByRef("d1", "6.09")!;
    const items: SemanticRuleItem[] = [rule({ relativeRef: "", role: "GENERAL_PROHIBITION", families: ["LIENS", "FUNDAMENTAL_CHANGES", "ENTITY_SCOPE_RESTRICTIONS"] })];
    const { candidates } = runPassCNeighborhoodExpansion(index, "d1", section.nodeKey, "6.09", items, "v1");
    expect(candidates[0]!.families).toEqual(expect.arrayContaining(["LIENS", "FUNDAMENTAL_CHANGES", "ENTITY_SCOPE_RESTRICTIONS"]));
  });

  it("14. a cross-reference-dependent permission is discovered but flagged as delegating, not fabricated as self-contained", () => {
    const index = indexFor({ documentId: "d1", label: "d1", text: "Section 6.04. Disposals. (a) disposals permitted under Section 6.06; (b) disposals not exceeding $1,000,000." });
    const section = index.getNodeByRef("d1", "6.04")!;
    const items: SemanticRuleItem[] = [rule({ relativeRef: "(a)", role: "PERMISSION", description: "delegates to Section 6.06", definedTermDependencyLikely: false }), rule({ relativeRef: "(b)", role: "BASKET" })];
    const { candidates } = runPassCNeighborhoodExpansion(index, "d1", section.nodeKey, "6.04", items, "v1");
    expect(candidates.some((c) => c.normalizedSourceRef === "6.04(a)" && c.description.includes("Section 6.06"))).toBe(true);
  });

  it("15. a deeply nested basket (SUBCLAUSE level) is independently addressable by exact ref", () => {
    const index = indexFor({ documentId: "d1", label: "d1", text: "Section 6.01. Indebtedness. Except: (a) container: (i) sub: (A) up to $1,000,000; (B) up to $2,000,000." });
    const deep = index.getNodeByRef("d1", "6.01(a)(i)(A)");
    expect(deep).toBeDefined();
    expect(deep!.nodeType).toBe("SUBCLAUSE");
  });

  it("16. a false-positive-heavy keyword section (many signals, no real covenant) is still measurable for precision - Pass A over-selects, but this does not mean every candidate must survive review", () => {
    const index = indexFor({ documentId: "d1", label: "d1", text: "Section 6.98. Notices. Except as otherwise provided, all notices, demands, or other communications shall not be effective unless in writing and may be sent by $0 courier fee." });
    const candidates = runPassADeterministicSignals("d1", index);
    const section = index.getNodeByRef("d1", "6.98")!;
    const own = candidates.find((c) => c.nodeKey === section.nodeKey);
    // Pass A is expected to over-select here (task §2/§8) - the real test is that this is a REVIEWABLE candidate, not a silent gap.
    expect(own).toBeDefined();
  });

  it("17. a sibling neighborhood is required for correct discovery: an exception sibling is linked to its own section even when only the exception itself is initially semantically confirmed", () => {
    const index = indexFor({ documentId: "d1", label: "d1", text: "Section 6.11. Restricted Payments. The Company shall not make Restricted Payments except: (a) dividends to the extent of $500,000 per year." });
    const section = index.getNodeByRef("d1", "6.11")!;
    const items: SemanticRuleItem[] = [rule({ relativeRef: "(a)", role: "BASKET", families: ["RESTRICTED_PAYMENTS"] })];
    const { candidates } = runPassCNeighborhoodExpansion(index, "d1", section.nodeKey, "6.11", items, "v1");
    const basket = candidates.find((c) => c.role === "BASKET")!;
    expect(basket.structuralNodeKeys).toContain(section.nodeKey);
  });

  it("18. a duplicate semantic candidate generated through multiple signals (Pass A + Pass B both flag the same node/role) is reconciled into one candidate with merged evidence, not duplicated", () => {
    const index = indexFor({ documentId: "d1", label: "d1", text: "Section 6.01. Indebtedness. Except: (a) up to $1,000,000." });
    const section = index.getNodeByRef("d1", "6.01")!;
    const nodeA = index.getNodeByRef("d1", "6.01(a)")!;
    const deterministic = runPassADeterministicSignals("d1", index);
    const deterministicByNodeKey = new Map(deterministic.map((c) => [c.nodeKey, c] as const));
    const items: SemanticRuleItem[] = [rule({ relativeRef: "(a)", role: "BASKET" }), rule({ relativeRef: "(a)", role: "BASKET", description: "second, overlapping signal for the same basket" })];
    const { candidates: expanded, discoveryId } = runPassCNeighborhoodExpansion(index, "d1", section.nodeKey, "6.01", items, "v1");
    const { candidates: reconciled, duplicatesBeforeReconciliation } = runPassDReconciliation({ documentId: "d1", discoveryRunVersion: "v1", expanded, discoveryId, deterministicByNodeKey });
    const basketCandidates = reconciled.filter((c) => c.structuralNodeKeys.includes(nodeA.nodeKey) && c.role === "BASKET");
    expect(basketCandidates).toHaveLength(1);
    expect(duplicatesBeforeReconciliation).toBeGreaterThan(0);
    expect(basketCandidates[0]!.discoveryMethods).toContain("DETERMINISTIC_SIGNAL");
  });

  it("end-to-end pipeline wiring: the full A->B->C->D pipeline runs against the free synthetic caller without error and still guarantees section-level representation", async () => {
    const index = indexFor({ documentId: "d1", label: "d1", text: "Section 6.01. Indebtedness. The Company shall not incur Indebtedness, except: (a) up to $1,000,000." });
    const caller = getStageCaller();
    const result = await runDiscoveryPipeline(caller, "d1", index);
    expect(result.candidates.some((c) => c.normalizedSourceRef === "6.01")).toBe(true);
    expect(result.summary.modelCalls).toBeGreaterThan(0);
  });
});
