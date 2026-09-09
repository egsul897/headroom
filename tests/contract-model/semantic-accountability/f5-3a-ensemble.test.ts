/**
 * F-5.3A - dual-pass semantic ensemble: trust invariants (mission section 21) and generic anti-enumeration scenarios
 * (section 22). Every scenario is an invented drafting SHAPE; nothing is a real provision. No model call anywhere: both
 * "passes" are scripted wire submissions normalized by the real Pass A post-processing, then reconciled by ensemble.ts.
 */
import { describe, expect, it } from "vitest";
import { buildEnsembleInventory, canonicalEnsembleJson, selectByPolicy, type EnsembleInventory } from "../../../lib/contract-model/compiler/semantic-accountability/ensemble";
import { normalizeInventorySubmission } from "../../../lib/contract-model/compiler/semantic-accountability/inventory";
import { partitionSourceSlots } from "../../../lib/contract-model/compiler/semantic-accountability/slots";
import { resolveSourceContext } from "../../../lib/contract-model/compiler/semantic-accountability/source-context";
import type { FrozenSemanticInventory, SemanticInventoryItem } from "../../../lib/contract-model/compiler/semantic-accountability/types";
import type { WireInventoryItem } from "../../../lib/contract-model/compiler/semantic-accountability/wire-schema";
import { buildTestIndex } from "../context-retrieval-test-utils";

const DOC = "f5-3a-synthetic-doc";
const TEXT = [
  "ARTICLE VII",
  "NEGATIVE COVENANTS",
  "",
  "SECTION 7.09. Omega Restrictions. The Company shall not, and shall not permit any Subsidiary to, make any Omega Payment, other than Omega Payments to a Loan Party; provided that the Company may make Omega Payments so long as no Default has occurred and is continuing.",
  "(a) Omega Payments in an aggregate amount not to exceed the greater of (x) $50,000,000 and (y) 12.5% of Total Assets;",
  "(b) Omega Payments equal to the sum of (i) cash proceeds, (ii) retained earnings and (iii) equity contributions received after the Closing Date;",
  "(c) Omega Payments permitted pursuant to Section 7.04(b) in an amount not to exceed $7,000,000 in any fiscal year.",
  "(d) The Company shall deliver a compliance certificate within ninety (90) days after the end of each fiscal year, and the Company shall maintain its corporate existence.",
  "",
  "SECTION 7.04. Indebtedness. The Company may incur Indebtedness as set out in clauses (b)(1) through (b)(12).",
].join("\n");

const built = (() => {
  const index = buildTestIndex([{ documentId: DOC, label: "synthetic", text: TEXT }]);
  const anchor = index.findNodesByRef(DOC, "7.09")[0]!;
  const operativeText = index.getNodeText(anchor.nodeId, "DESCENDANTS");
  const sourceContext = resolveSourceContext({ index, documentId: DOC, operativeSourceText: operativeText, anchorNodeId: anchor.nodeId, operativeCharStart: anchor.charStart, documentText: TEXT });
  const partition = partitionSourceSlots({ sourceContext, structuralIndex: index });
  return { index, sourceContext, partition };
})();
const CREF = "f5-3a-unit";
const wire = (localRef: string, role: string, excerpt: string, extra: Partial<WireInventoryItem> = {}): WireInventoryItem => ({ localRef, semanticRole: role, proposition: `${role}: ${excerpt.slice(0, 40)}`, excerpt, regionId: null, quantitativeValues: [], referencedTerms: [], referencedSections: [], parentRef: null, relatedRefs: [], materiality: "CRITICAL", ambiguity: "NONE", ambiguityReason: null, operative: "OPERATIVE", ...extra });

/** A scripted single pass: the real normalizer over scripted wire, frozen into an inventory shape (no model). */
function pass(items: WireInventoryItem[]): FrozenSemanticInventory {
  const r = normalizeInventorySubmission({ candidateRef: CREF, sourceContext: built.sourceContext, structuralIndex: built.index }, items, built.partition);
  return { candidateRef: CREF, items: r.items, uninventoriedValues: [], unaccountedSource: [], sourceCoverage: { regionsConsidered: ["operative"], countsByDisposition: {}, charsByDisposition: {}, accountedCharFraction: 1, externallyAccountedRegions: [] }, gapReinventory: null, inventoryStatus: "INVENTORY_OK", inventoryStatusReason: "scripted", rejectedUnverifiableItems: r.rejectedUnverifiable, rejectedDuplicateItems: r.rejectedDuplicates, sourceContextState: built.sourceContext.state, frozenContentHash: `scripted-${items.map((i) => i.localRef).join("+")}`, frozenAt: "2026-01-01T00:00:00.000Z", algorithmVersion: "semantic-accountability.v5", promptVersion: "semantic-inventory-prompt.v5", provider: "scripted", model: "scripted", telemetryCostUsd: null };
}
const ensemble = (a: WireInventoryItem[], b: WireInventoryItem[], order: "ab" | "ba" = "ab"): EnsembleInventory => {
  const passes = [{ passId: "pass-1", inventory: pass(a) }, { passId: "pass-2", inventory: pass(b) }];
  return buildEnsembleInventory({ candidateRef: CREF, sourceContext: built.sourceContext, structuralIndex: built.index, partition: built.partition, passes: order === "ab" ? passes : [...passes].reverse() });
};
const find = (e: EnsembleInventory, needle: string): SemanticInventoryItem => e.items.find((i) => i.sourceSpan.excerpt === needle) ?? e.items.find((i) => i.sourceSpan.excerpt.startsWith(needle)) ?? e.items.find((i) => i.sourceSpan.excerpt.includes(needle))!;

const PROHIBITION = "The Company shall not, and shall not permit any Subsidiary to, make any Omega Payment";
const EXCEPTION = "other than Omega Payments to a Loan Party";
const PROVISO = "so long as no Default has occurred and is continuing";
const FORMULA = "the sum of (i) cash proceeds, (ii) retained earnings and (iii) equity contributions received after the Closing Date";

describe("F-5.3A anti-enumeration scenarios (mission section 22)", () => {
  it("A. pass 1 finds prohibition + exception, pass 2 only the prohibition: union keeps both, the exception is SINGLE_RUN and forces review", () => {
    const e = ensemble([wire("p", "PROHIBITION", PROHIBITION), wire("x", "EXCEPTION", EXCEPTION, { parentRef: "p" })], [wire("q", "PROHIBITION", PROHIBITION)]);
    expect(e.items).toHaveLength(2);
    expect(find(e, PROHIBITION).support).toMatchObject({ supportStatus: "CORROBORATED", supportingPasses: ["pass-1", "pass-2"] });
    expect(find(e, EXCEPTION).support).toMatchObject({ supportStatus: "SINGLE_RUN", supportingPasses: ["pass-1"] });
    expect(find(e, EXCEPTION).parentItemId).toBe(find(e, PROHIBITION).inventoryItemId); // lineage resolves onto the canonical parent
    expect(e.ensemble.supportReviewRequired).toBe(true);
    expect(e.ensemble.counts).toMatchObject({ canonicalItems: 2, corroborated: 1, singleRun: 1, materialSingleRun: 1, conflicted: 0 });
    expect(selectByPolicy(e, "INTERSECTION_ONLY")).toHaveLength(1); // the delete rule would drop the exception - evaluated, not used
  });
  it("B. pass 1 finds a broad formula + two components, pass 2 the formula + one component: equivalents canonicalize, the missing component survives as a singleton", () => {
    const a = [wire("f", "FORMULA_COMPONENT", FORMULA), wire("c1", "FORMULA_COMPONENT", "(i) cash proceeds", { parentRef: "f" }), wire("c2", "FORMULA_COMPONENT", "(ii) retained earnings", { parentRef: "f" })];
    const b = [wire("g", "FORMULA_COMPONENT", FORMULA), wire("d1", "FORMULA_COMPONENT", "(i) cash proceeds", { parentRef: "g" })];
    const e = ensemble(a, b);
    expect(e.items).toHaveLength(3);
    expect(find(e, FORMULA).support!.supportStatus).toBe("CORROBORATED");
    expect(find(e, "(i) cash proceeds").support!.supportStatus).toBe("CORROBORATED");
    expect(find(e, "(ii) retained earnings").support).toMatchObject({ supportStatus: "SINGLE_RUN", supportingPasses: ["pass-1"] });
    expect(find(e, "(ii) retained earnings").parentItemId).toBe(find(e, FORMULA).inventoryItemId);
  });
  it("C. the same greater-of branches with different legacy role choices canonicalize once under semanticFunctions", () => {
    const e = ensemble([wire("s", "ALTERNATIVE", "the greater of (x) $50,000,000 and (y) 12.5% of Total Assets"), wire("x", "ALTERNATIVE", "$50,000,000"), wire("y", "ALTERNATIVE", "12.5% of Total Assets")], [wire("s", "FORMULA_COMPONENT", "the greater of (x) $50,000,000 and (y) 12.5% of Total Assets"), wire("x", "VALUE", "$50,000,000"), wire("y", "FORMULA_COMPONENT", "12.5% of Total Assets")]);
    expect(e.items).toHaveLength(3);
    for (const i of e.items) expect(i.support!.supportStatus).toBe("CORROBORATED");
    const x = find(e, "$50,000,000");
    expect(x.declaredRoles).toEqual(["ALTERNATIVE", "VALUE"]);
    expect(x.semanticFunctions!.logic).toContain("ALTERNATIVE");
    expect(x.semanticFunctions!.quantitative).toContain("VALUE");
    expect(e.ensemble.supportReviewRequired).toBe(false);
  });
  it("D. PERMISSION in pass 1 vs PROHIBITION in pass 2 over identical source: explicit CONFLICT, both kept, nothing chosen", () => {
    const e = ensemble([wire("p", "PERMISSION", PROHIBITION)], [wire("q", "PROHIBITION", PROHIBITION)]);
    expect(e.items).toHaveLength(2);
    expect(e.items.every((i) => i.support!.supportStatus === "CONFLICTED")).toBe(true);
    expect(e.ensemble.conflicts).toHaveLength(1);
    expect(e.ensemble.conflicts[0]!.reason).toMatch(/contradictory deontic effects/);
    expect(e.ensemble.counts.materialConflicted).toBe(2);
    expect(e.ensemble.supportReviewRequired).toBe(true);
    expect(e.items[0]!.support!.conflictWith).toEqual([e.items[1]!.inventoryItemId]);
  });
  it("E. different dollar amounts over the same source do not merge and are an explicit CONFLICT", () => {
    const span = "in an amount not to exceed $7,000,000 in any fiscal year";
    const a = [wire("v", "THRESHOLD", span, { quantitativeValues: [{ kind: "MONEY", rawText: "$7,000,000", normalizedValue: 7_000_000, unit: "USD" }] })];
    const b = [wire("w", "THRESHOLD", span, { quantitativeValues: [{ kind: "MONEY", rawText: "$70,000,000", normalizedValue: 70_000_000, unit: "USD" }] })];
    const e = ensemble(a, b);
    // the scanner completes the real $7,000,000 on both; pass 2's asserted $70,000,000 is not located in the source span -> an incompatible claim, never merged, never chosen
    expect(e.items).toHaveLength(2);
    expect(e.ensemble.conflicts).toHaveLength(1);
    expect(e.ensemble.conflicts[0]!.reason).toMatch(/different stated values/);
    expect(e.items.every((i) => i.support!.supportStatus === "CONFLICTED")).toBe(true);
  });
  it("F. a non-source proposition from one pass cannot enter the authoritative union (anti-hallucination gate)", () => {
    // the pass-level normalizer already rejects it ...
    const b = pass([wire("q", "PROHIBITION", PROHIBITION), wire("fake", "PERMISSION", "the Company may pay unlimited dividends to insiders")]);
    expect(b.rejectedUnverifiableItems).toBe(1);
    expect(b.items).toHaveLength(1);
    // ... and a tampered/corrupt pass that carries a non-source item anyway is re-verified by the ensemble itself
    const tampered: FrozenSemanticInventory = { ...b, items: [...b.items, { ...b.items[0]!, inventoryItemId: "inv-item:forged000000000000000000", sourceSpan: { ...b.items[0]!.sourceSpan, charStart: 0, charEnd: 51, excerpt: "the Company may pay unlimited dividends to insiders" }, proposition: "forged" }] };
    const e = buildEnsembleInventory({ candidateRef: CREF, sourceContext: built.sourceContext, structuralIndex: built.index, partition: built.partition, passes: [{ passId: "pass-1", inventory: pass([wire("p", "PROHIBITION", PROHIBITION)]) }, { passId: "pass-2", inventory: tampered }] });
    expect(e.items).toHaveLength(1);
    expect(e.rejectedUnverifiableItems).toBe(1);
    expect(e.ensemble.counts.rejectedUnverifiable).toBe(1);
    expect(e.items[0]!.support!.supportStatus).toBe("CORROBORATED");
  });
  it("G. both passes omit substantive source: raw source coverage still exposes the gap (union never claims completeness)", () => {
    const e = ensemble([wire("p", "PROHIBITION", PROHIBITION)], [wire("q", "PROHIBITION", PROHIBITION)]);
    expect(e.items).toHaveLength(1);
    expect(e.items[0]!.support!.supportStatus).toBe("CORROBORATED");
    expect(e.ensemble.supportReviewRequired).toBe(false); // every item corroborated ...
    expect(e.inventoryStatus).toBe("INVENTORY_COVERAGE_GAP"); // ... and trust is still blocked by the source
    expect(e.unaccountedSource.some((u) => u.excerpt.includes("Total Assets"))).toBe(true);
    expect(e.uninventoriedValues.some((v) => v.rawText === "$50,000,000")).toBe(true);
  });
});

describe("F-5.3A trust invariants (mission section 21)", () => {
  const A = [wire("p", "PROHIBITION", PROHIBITION), wire("x", "EXCEPTION", EXCEPTION, { parentRef: "p" }), wire("c", "CONDITION", PROVISO), wire("s", "ALTERNATIVE", "the greater of (x) $50,000,000 and (y) 12.5% of Total Assets"), wire("t", "TIME_PERIOD", "within ninety (90) days after the end of each fiscal year")];
  const B = [wire("q", "PROHIBITION", PROHIBITION), wire("k", "CONDITION", PROVISO), wire("r", "REFERENCE", "pursuant to Section 7.04(b)", { referencedSections: ["Section 7.04(b)"] }), wire("s2", "FORMULA_COMPONENT", "the greater of (x) $50,000,000 and (y) 12.5% of Total Assets")];
  it("a SINGLE_RUN item cannot disappear and never becomes CORROBORATED; the same proposition canonicalizes once", () => {
    const e = ensemble(A, B);
    expect(find(e, EXCEPTION).support!.supportStatus).toBe("SINGLE_RUN");
    expect(find(e, "within ninety").support!.supportStatus).toBe("SINGLE_RUN");
    expect(find(e, "pursuant to Section 7.04(b)").support!.supportStatus).toBe("SINGLE_RUN");
    expect(find(e, PROHIBITION).support!.supportStatus).toBe("CORROBORATED");
    expect(find(e, PROVISO).support!.supportStatus).toBe("CORROBORATED");
    expect(find(e, "the greater of").support!.supportStatus).toBe("CORROBORATED");
    expect(e.items.filter((i) => i.sourceSpan.excerpt === PROHIBITION)).toHaveLength(1);
    expect(e.ensemble.counts).toMatchObject({ canonicalItems: 6, corroborated: 3, singleRun: 3, materialSingleRun: 3 });
    // every original pass item is accounted for by exactly one canonical item
    const memberIds = e.items.flatMap((i) => Object.entries(i.support!.memberItemIds).flatMap(([p, ids]) => ids.map((id) => `${p}:${id}`)));
    expect(new Set(memberIds).size).toBe(pass(A).items.length + pass(B).items.length); // (pass-level ids coincide for corroborated items - identity is deterministic - so count per pass)
  });
  it("union ordering does not matter: Union(A,B) and Union(B,A) are byte-equivalent and hash-equal", () => {
    const ab = ensemble(A, B, "ab"), ba = ensemble(A, B, "ba");
    expect(canonicalEnsembleJson(ab)).toBe(canonicalEnsembleJson(ba));
    expect(ab.frozenContentHash).toBe(ba.frozenContentHash);
  });
  it("support provenance survives the freeze: the hash changes when support changes, and again when a singleton is added", () => {
    const both = ensemble(A, B);
    const singleton = ensemble(A, [wire("q", "PROHIBITION", PROHIBITION)]);
    expect(both.frozenContentHash).not.toBe(singleton.frozenContentHash);
    const more = ensemble([...A, wire("z", "REQUIREMENT", "the Company shall maintain its corporate existence")], B);
    expect(more.frozenContentHash).not.toBe(both.frozenContentHash);
    expect(more.items.map((i) => i.support!.supportStatus).filter((s) => s === "SINGLE_RUN")).toHaveLength(4);
  });
  it("values are never lost and different values never merge; contradictory effects never merge", () => {
    const e = ensemble(A, B);
    const values = e.items.flatMap((i) => i.quantitativeValues.map((v) => v.rawText));
    expect(values).toEqual(expect.arrayContaining(["$50,000,000", "12.5%", "ninety (90) days"]));
    const d = ensemble([wire("p", "PERMISSION", PROHIBITION)], [wire("q", "PROHIBITION", PROHIBITION)]);
    expect(d.items).toHaveLength(2);
    expect(d.items.map((i) => i.semanticFunctions!.effect).sort()).toEqual(["PERMISSION", "PROHIBITION"]);
  });
  it("the union cannot claim semantic completeness: corroboration never clears unaccounted source, and support asymmetry alone forces review", () => {
    const e = ensemble(A, B);
    expect(e.inventoryStatus).toBe("INVENTORY_COVERAGE_GAP"); // clause (b) formula and clause (d) obligations are not inventoried by either pass
    expect(e.ensemble.supportReviewRequired).toBe(true);
    expect(e.inventoryStatusReason).toMatch(/UNACCOUNTED_SOURCE/);
    expect(e.inventoryStatusReason).toMatch(/REVIEW_REQUIRED/);
    const full = ensemble([wire("p", "PROHIBITION", PROHIBITION)], [wire("q", "PROHIBITION", PROHIBITION)]);
    expect(full.ensemble.supportReviewRequired).toBe(false);
    expect(full.inventoryStatus).toBe("INVENTORY_COVERAGE_GAP");
  });
  it("materiality, ambiguity and declared roles survive canonicalization (strongest materiality; ambiguity never dropped)", () => {
    const e = ensemble([wire("p", "PROHIBITION", PROHIBITION, { materiality: "MATERIAL", ambiguity: "AMBIGUOUS_DRAFTING", ambiguityReason: "scope unclear" })], [wire("q", "PROHIBITION", PROHIBITION, { materiality: "CRITICAL" })]);
    const p = find(e, PROHIBITION);
    expect(p.materiality).toBe("CRITICAL");
    expect(p.ambiguity).toBe("AMBIGUOUS_DRAFTING");
    expect(p.support!.memberItemIds["pass-1"]).toHaveLength(1);
    expect(p.support!.memberItemIds["pass-2"]).toHaveLength(1);
  });
  it("an ensemble needs at least two passes with unique ids from the same unit; pass labels are generic", () => {
    expect(() => buildEnsembleInventory({ candidateRef: CREF, sourceContext: built.sourceContext, structuralIndex: built.index, partition: built.partition, passes: [{ passId: "pass-1", inventory: pass(A) }] })).toThrow();
    expect(() => buildEnsembleInventory({ candidateRef: CREF, sourceContext: built.sourceContext, structuralIndex: built.index, partition: built.partition, passes: [{ passId: "pass-1", inventory: pass(A) }, { passId: "pass-1", inventory: pass(B) }] })).toThrow();
    expect(() => buildEnsembleInventory({ candidateRef: "other-unit", sourceContext: built.sourceContext, structuralIndex: built.index, partition: built.partition, passes: [{ passId: "pass-1", inventory: pass(A) }, { passId: "pass-2", inventory: pass(B) }] })).toThrow();
    const e = buildEnsembleInventory({ candidateRef: CREF, sourceContext: built.sourceContext, structuralIndex: built.index, partition: built.partition, passes: [{ passId: "morning", inventory: pass(A) }, { passId: "evening", inventory: pass(B) }] });
    expect(e.ensemble.passIds).toEqual(["evening", "morning"]);
    expect(find(e, EXCEPTION).support!.supportingPasses).toEqual(["morning"]);
  });
});
