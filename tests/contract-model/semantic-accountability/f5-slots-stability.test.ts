/**
 * F-5 (Phase 3 Chewy remediation 4) - deterministic source slots, canonical slot identity, overlap merge, batched
 * slot-scoped calls and the slot-scoped gap pass. Every scenario is synthetic; nothing here names a real agreement.
 * The property under test is the mission's invariant: the SOURCE defines the inventory boundaries, the model
 * interprets within them - so two scripted "runs" that word, order and bound the same propositions differently
 * converge to the same identities, while distinct propositions never merge and unaccounted source stays disclosed.
 */
import { describe, expect, it } from "vitest";
import { normalizeInventorySubmission, runSemanticInventory } from "../../../lib/contract-model/compiler/semantic-accountability/inventory";
import { batchSlots, coordinationIndex, partitionSourceSlots, slotForOffset } from "../../../lib/contract-model/compiler/semantic-accountability/slots";
import { resolveSourceContext } from "../../../lib/contract-model/compiler/semantic-accountability/source-context";
import type { SourceContextResult } from "../../../lib/contract-model/compiler/semantic-accountability/types";
import type { WireInventoryItem } from "../../../lib/contract-model/compiler/semantic-accountability/wire-schema";
import { buildTestIndex } from "../context-retrieval-test-utils";
import { scriptedInventoryCaller } from "./harness";

const DOC = "f5-synthetic-doc";

/** A generic, invented covenant section: chapeau + enumerated permissions with provisos, a builder and a shared cap. */
function agreement(sectionNo: string, term: string, amounts: [string, string, string], pct: string, ratio: string): string {
  return [
    "ARTICLE VI",
    "NEGATIVE COVENANTS",
    "",
    `SECTION ${sectionNo}. ${term} Restrictions. The Company shall not, and shall not permit any Subsidiary to, make any ${term} Payment; provided that the Company may make ${term} Payments so long as no Trigger Event has occurred and is continuing and the Company is in pro forma compliance with Section 7.11.`,
    `(a) ${term} Payments in an aggregate amount not to exceed the greater of ${amounts[0]} and ${pct} of Base Metric; provided that amounts under this clause (a) together with amounts under Section ${sectionNo}(c) shall not exceed ${amounts[1]} in the aggregate;`,
    `(b) ${term} Payments made in reliance on the Builder Amount, so long as the Total Leverage Ratio does not exceed ${ratio} to 1.00; and`,
    `(c) ${term} Payments to repurchase Equity Interests from employees in an amount not to exceed ${amounts[2]} in any fiscal year, plus unused amounts carried forward from the prior fiscal year.`,
    "",
    "SECTION 7.11. Financial Covenant. The Company shall maintain a Total Leverage Ratio of not more than 5.00 to 1.00.",
  ].join("\n");
}

function build(text: string, sectionRef: string) {
  const index = buildTestIndex([{ documentId: DOC, label: "synthetic", text }]);
  const anchor = index.findNodesByRef(DOC, sectionRef)[0]!;
  const operativeText = index.getNodeText(anchor.nodeId, "DESCENDANTS");
  const sourceContext = resolveSourceContext({ index, documentId: DOC, operativeSourceText: operativeText, anchorNodeId: anchor.nodeId, operativeCharStart: anchor.charStart, documentText: text });
  return { index, anchor, sourceContext, operativeText };
}

const wire = (localRef: string, role: string, excerpt: string, extra: Partial<WireInventoryItem> = {}): WireInventoryItem => ({ localRef, semanticRole: role, proposition: `${role}: ${excerpt.slice(0, 40)}`, excerpt, regionId: null, quantitativeValues: [], referencedTerms: [], referencedSections: [], parentRef: null, relatedRefs: [], materiality: "CRITICAL", ambiguity: "NONE", ambiguityReason: null, operative: "OPERATIVE", ...extra });

const A = agreement("6.08", "Restricted", ["$50,000,000", "$120,000,000", "$10,000,000"], "5%", "4.50");
const B = agreement("7.06", "Investment", ["$25,000,000", "$60,000,000", "$5,000,000"], "12.5%", "3.25");

describe("F-5 slots - deterministic partition", () => {
  it("slots tile the operative region exactly, in order, without overlap, and are identical across two partitions of the same input", () => {
    const { index, sourceContext } = build(A, "6.08");
    const p1 = partitionSourceSlots({ sourceContext, structuralIndex: index });
    const p2 = partitionSourceSlots({ sourceContext, structuralIndex: index });
    expect(JSON.stringify(p1)).toBe(JSON.stringify(p2));
    const region = sourceContext.regions[0]!;
    const slots = p1.slots.filter((s) => s.regionId === region.regionId);
    expect(slots[0]!.charStart).toBe(0);
    expect(slots[slots.length - 1]!.charEnd).toBe(region.text.length);
    for (let i = 1; i < slots.length; i++) expect(slots[i]!.charStart).toBe(slots[i - 1]!.charEnd);
    expect(new Set(slots.map((s) => s.slotId)).size).toBe(slots.length);
    expect(slots.every((s) => /[A-Za-z]{2,}/.test(s.text))).toBe(true); // every slot carries inventoriable text
    expect(p1.methods[region.regionId]).toBe("STRUCTURAL_NODES");
  });

  it("structural slots carry their enclosing lead-in as read-only context, and the fallback without an index is the independent-segment partition", () => {
    const { index, sourceContext } = build(A, "6.08");
    const structural = partitionSourceSlots({ sourceContext, structuralIndex: index });
    const clauseSlot = structural.slots.find((s) => s.text.includes("greater of $50,000,000"))!;
    expect(clauseSlot.sectionRef).toMatch(/6\.08\(a\)/);
    expect(clauseSlot.context.some((c) => c.text.includes("shall not"))).toBe(true); // the chapeau travels with the clause
    const fallback = partitionSourceSlots({ sourceContext, structuralIndex: null });
    const region0 = sourceContext.regions[0]!;
    expect(fallback.methods[region0.regionId]).toBe("INDEPENDENT_SEGMENTS");
    const fallbackSlots = fallback.slots.filter((s) => s.regionId === region0.regionId);
    expect(fallbackSlots.length).toBeGreaterThan(1);
    expect(fallbackSlots[fallbackSlots.length - 1]!.charEnd).toBe(region0.text.length);
    // Expansion regions are partitioned too (identity + gap pass), but never batched into the first pass.
    expect(fallback.slots.some((s) => s.regionId !== region0.regionId)).toBe(true);
  });

  it("anti-enumeration: two unrelated agreements with the same drafting shape partition into the same slot structure (same slot count, same node shapes), with different text", () => {
    const a = build(A, "6.08");
    const b = build(B, "7.06");
    const pa = partitionSourceSlots({ sourceContext: a.sourceContext, structuralIndex: a.index });
    const pb = partitionSourceSlots({ sourceContext: b.sourceContext, structuralIndex: b.index });
    expect(pa.slots.length).toBe(pb.slots.length);
    expect(pa.slots.map((s) => s.slotId.replace(/6\.08/g, "X"))).toEqual(pb.slots.map((s) => s.slotId.replace(/7\.06/g, "X")));
    expect(pa.slots.map((s) => s.text)).not.toEqual(pb.slots.map((s) => s.text));
  });

  it("batches never split a slot, respect the char budget for every batch but the smallest, and carry preceding text", () => {
    const { index, sourceContext } = build(A, "6.08");
    const partition = partitionSourceSlots({ sourceContext, structuralIndex: index });
    const batches = batchSlots(partition, sourceContext, 300);
    expect(batches.length).toBeGreaterThan(1);
    expect(batches.flatMap((b) => b.slots.map((s) => s.slotId))).toEqual(partition.slots.map((s) => s.slotId));
    for (const b of batches) expect(b.slots.length === 1 || b.chars <= 300).toBe(true);
    expect(batches[1]!.precedingText.length).toBeGreaterThan(0);
  });

  it("slotForOffset and coordinationIndex are deterministic functions of source position", () => {
    const { index, sourceContext } = build(A, "6.08");
    const partition = partitionSourceSlots({ sourceContext, structuralIndex: index });
    const region = sourceContext.regions[0]!;
    const pos = region.text.indexOf("pro forma compliance");
    const slot = slotForOffset(partition, region.regionId, pos)!;
    expect(slot.charStart <= pos && pos < slot.charEnd).toBe(true);
    const first = region.text.indexOf("no Trigger Event");
    expect(coordinationIndex(slot, first)).toBeLessThan(coordinationIndex(slot, pos)); // two conjuncts of one proviso key differently
  });
});

describe("F-5 canonical identity - same proposition converges, distinct propositions never merge", () => {
  const { index, sourceContext } = build(A, "6.08");
  const input = { candidateRef: "f5-unit", sourceContext, structuralIndex: index };

  it("two wordings/boundaries of one proposition, listed in different orders, receive the SAME id and merge (values, refs unioned; strongest materiality kept)", () => {
    const runA = [wire("x1", "PERMISSION", "the Company may make Restricted Payments so long as no Trigger Event has occurred", { materiality: "MATERIAL", referencedTerms: ["Trigger Event"] }), wire("x2", "ALTERNATIVE", "$50,000,000")];
    const runB = [wire("y9", "ALTERNATIVE", "the greater of $50,000,000"), wire("y1", "PERMISSION", "Company may make Restricted Payments so long as no Trigger Event has occurred and is continuing", { materiality: "CRITICAL", referencedTerms: ["Trigger Event", "Restricted Payments"] })];
    const a = normalizeInventorySubmission(input, runA);
    const b = normalizeInventorySubmission(input, runB);
    expect(new Set(a.items.map((i) => i.inventoryItemId))).toEqual(new Set(b.items.map((i) => i.inventoryItemId)));
    const both = normalizeInventorySubmission(input, [...runA, ...runB]);
    expect(both.items).toHaveLength(2);
    expect(both.rejectedDuplicates).toBe(2);
    const perm = both.items.find((i) => i.semanticRole === "PERMISSION")!;
    expect(perm.materiality).toBe("CRITICAL");
    expect(perm.referencedTerms).toEqual(["Restricted Payments", "Trigger Event"]);
    expect(perm.mergedDuplicates).toBe(1);
    expect(both.items.find((i) => i.semanticRole === "ALTERNATIVE")!.quantitativeValues.map((v) => v.rawText)).toEqual(["$50,000,000"]);
  });

  it("identity is independent of wire order and of the slotId the model claims (a wrong slotId is recovered from the located excerpt)", () => {
    const items = [wire("a", "CONDITION", "no Trigger Event has occurred and is continuing"), wire("b", "CONDITION", "the Company is in pro forma compliance with Section 7.11", { referencedSections: ["Section 7.11"] }), wire("c", "PROHIBITION", "shall not, and shall not permit any Subsidiary to, make any Restricted Payment")];
    const forward = normalizeInventorySubmission(input, items);
    const reversed = normalizeInventorySubmission(input, [...items].reverse());
    const mislabelled = normalizeInventorySubmission(input, items.map((w) => ({ ...w, slotId: "operative:nonexistent#9" })));
    const ids = (r: typeof forward) => r.items.map((i) => i.inventoryItemId).sort();
    expect(ids(forward)).toEqual(ids(reversed));
    expect(ids(forward)).toEqual(ids(mislabelled));
    expect(forward.items).toHaveLength(3); // two CONDITION conjuncts in one proviso stay distinct (coordination sub-index)
    expect(forward.items.every((i) => i.slotId && i.slotId.startsWith("operative:"))).toBe(true);
  });

  it("distinct propositions sharing slot, role and values but DISJOINT spans never merge; the same two excerpts in the other run get the same two ids", () => {
    const items = [wire("p", "FORMULA_COMPONENT", "an amount not to exceed $10,000,000 in any fiscal year"), wire("q", "FORMULA_COMPONENT", "unused amounts carried forward from the prior fiscal year")];
    const a = normalizeInventorySubmission(input, items);
    const b = normalizeInventorySubmission(input, [...items].reverse());
    expect(a.items).toHaveLength(2);
    expect(a.rejectedDuplicates).toBe(0);
    expect(a.items.map((i) => i.inventoryItemId).sort()).toEqual(b.items.map((i) => i.inventoryItemId).sort());
    expect(a.items[0]!.inventoryItemId).not.toBe(a.items[1]!.inventoryItemId);
  });

  it("different roles or different values over the same words are different identities", () => {
    const r = normalizeInventorySubmission(input, [wire("a", "THRESHOLD", "the Total Leverage Ratio does not exceed 4.50 to 1.00"), wire("b", "CONDITION", "the Total Leverage Ratio does not exceed 4.50 to 1.00"), wire("c", "VALUE", "$120,000,000"), wire("d", "VALUE", "$50,000,000")]);
    expect(new Set(r.items.map((i) => i.inventoryItemId)).size).toBe(4);
  });

  it("anti-hallucination and lineage: an excerpt not in the source is rejected; parent/related refs map onto merged identities without self-loops", () => {
    const r = normalizeInventorySubmission(input, [wire("p", "PERMISSION", "the Company may make Restricted Payments so long as no Trigger Event has occurred"), wire("p2", "PERMISSION", "Company may make Restricted Payments so long as no Trigger Event", { parentRef: "p" }), wire("c", "CONDITION", "pro forma compliance with Section 7.11", { parentRef: "p2" }), wire("z", "CONDITION", "this sentence is not in the source at all")]);
    expect(r.rejectedUnverifiable).toBe(1);
    expect(r.items).toHaveLength(2);
    const perm = r.items.find((i) => i.semanticRole === "PERMISSION")!;
    expect(perm.parentItemId).toBeNull();
    expect(r.items.find((i) => i.semanticRole === "CONDITION")!.parentItemId).toBe(perm.inventoryItemId);
  });
});

describe("F-5 bounded slot-scoped calls and the slot-scoped gap pass", () => {
  it("runSemanticInventory makes one call per batch plus one per gap batch, records the partition, and two scripted runs that split/merge/reorder the same propositions freeze to the same identities", async () => {
    const { index, sourceContext } = build(A, "6.08");
    const calls: { stage: string; user: string }[] = [];
    const scripted = (items: WireInventoryItem[]) => ({ providerName: "scripted", model: "scripted", isSynthetic: false, async call<T>(_schema: unknown, stage: string, _system: string, user: string): Promise<T> { calls.push({ stage, user }); return { items, overallNotes: [] } as unknown as T; }, lastTelemetry: () => null });
    const runA = [wire("1", "PROHIBITION", "shall not, and shall not permit any Subsidiary to, make any Restricted Payment"), wire("2", "PERMISSION", "the Company may make Restricted Payments so long as no Trigger Event has occurred and is continuing"), wire("3", "ALTERNATIVE", "$50,000,000"), wire("4", "ALTERNATIVE", "5% of Base Metric"), wire("5", "SHARED_CAP", "amounts under this clause (a) together with amounts under Section 6.08(c) shall not exceed $120,000,000 in the aggregate", { referencedSections: ["Section 6.08(c)"] }), wire("6", "CONDITION", "the Total Leverage Ratio does not exceed 4.50 to 1.00"), wire("7", "FORMULA_COMPONENT", "an amount not to exceed $10,000,000 in any fiscal year")];
    const runB = [wire("b7", "FORMULA_COMPONENT", "not to exceed $10,000,000 in any fiscal year"), wire("b6", "CONDITION", "so long as the Total Leverage Ratio does not exceed 4.50 to 1.00"), wire("b5", "SHARED_CAP", "together with amounts under Section 6.08(c) shall not exceed $120,000,000 in the aggregate"), wire("b4", "ALTERNATIVE", "5% of Base Metric"), wire("b3", "ALTERNATIVE", "the greater of $50,000,000"), wire("b2", "PERMISSION", "Company may make Restricted Payments so long as no Trigger Event has occurred"), wire("b2x", "PERMISSION", "the Company may make Restricted Payments so long as no Trigger Event has occurred and is continuing and the Company is in pro forma compliance"), wire("b1", "PROHIBITION", "The Company shall not, and shall not permit any Subsidiary to, make any Restricted Payment")];
    const invA = await runSemanticInventory({ candidateRef: "f5-unit", documentId: DOC, sourceContext, structuralIndex: index, caller: scripted(runA), batchChars: 400 });
    const firstPassCalls = calls.filter((c) => c.stage === "semantic_inventory").length;
    expect(invA.partition!.batches).toBeGreaterThan(1);
    expect(firstPassCalls).toBe(invA.partition!.batches);
    expect(invA.partition!.gapCalls).toBe(invA.partition!.gapBatches);
    expect(calls.some((c) => c.stage === "semantic_inventory_gap" && /UNACCOUNTED STRETCH/.test(c.user))).toBe(true);
    expect(calls.filter((c) => c.stage === "semantic_inventory").every((c) => /SLOT operative:/.test(c.user))).toBe(true);
    calls.length = 0;
    const invB = await runSemanticInventory({ candidateRef: "f5-unit", documentId: DOC, sourceContext, structuralIndex: index, caller: scripted(runB), batchChars: 400 });
    const idsA = new Set(invA.items.map((i) => i.inventoryItemId));
    const idsB = new Set(invB.items.map((i) => i.inventoryItemId));
    expect(idsA).toEqual(idsB); // strict stability 1.0 across two differently worded, ordered and bounded scripted runs
    expect(invB.items.find((i) => i.semanticRole === "PERMISSION")!.mergedDuplicates).toBeGreaterThanOrEqual(1);
    expect(invA.frozenContentHash).not.toBe(""); // freeze still applies
    expect(invA.partition!.slots.length).toBeGreaterThan(5);
  });

  it("trust safety: source no scripted item covers stays UNACCOUNTED / COVERAGE_GAP - slots never suppress difficult text, and a failed batch is INVENTORY_FAILED", async () => {
    const { index, sourceContext } = build(A, "6.08");
    const inv = await runSemanticInventory({ candidateRef: "f5-unit", documentId: DOC, sourceContext, structuralIndex: index, caller: scriptedInventoryCaller([wire("1", "PROHIBITION", "shall not, and shall not permit any Subsidiary to, make any Restricted Payment")]) });
    expect(inv.inventoryStatus).toBe("INVENTORY_COVERAGE_GAP");
    expect(inv.unaccountedSource.length).toBeGreaterThan(0);
    expect(inv.unaccountedSource.some((u) => u.excerpt.includes("Builder Amount"))).toBe(true);
    expect(inv.uninventoriedValues.some((v) => v.rawText === "$120,000,000")).toBe(true);
    const failed = await runSemanticInventory({ candidateRef: "f5-unit", documentId: DOC, sourceContext, structuralIndex: index, caller: scriptedInventoryCaller([], { fail: true }) });
    expect(failed.inventoryStatus).toBe("INVENTORY_FAILED");
    expect(failed.items).toHaveLength(0);
  });

  it("anti-enumeration: the same scripted inventory shape over two unrelated agreements produces the same number of items, slots and batches (no agreement-specific path)", async () => {
    const run = async (text: string, sectionRef: string, term: string, amount: string) => {
      const { index, sourceContext } = build(text, sectionRef);
      const items = [wire("1", "PROHIBITION", `make any ${term} Payment`), wire("2", "ALTERNATIVE", amount), wire("3", "CONDITION", "the Total Leverage Ratio does not exceed")];
      return runSemanticInventory({ candidateRef: `unit-${sectionRef}`, documentId: DOC, sourceContext, structuralIndex: index, caller: scriptedInventoryCaller(items), batchChars: 400 });
    };
    const a = await run(A, "6.08", "Restricted", "$50,000,000");
    const b = await run(B, "7.06", "Investment", "$25,000,000");
    expect(a.items.length).toBe(b.items.length);
    expect(a.partition!.slots.length).toBe(b.partition!.slots.length);
    expect(a.partition!.batches).toBe(b.partition!.batches);
    expect(a.inventoryStatus).toBe(b.inventoryStatus);
  });
});

describe("F-5 wire tolerance", () => {
  it("a submission without slotIds (v3-shaped model output) still normalizes - slots are recovered from the excerpts", () => {
    const { index, sourceContext } = build(A, "6.08");
    const r = normalizeInventorySubmission({ candidateRef: "f5-unit", sourceContext, structuralIndex: index }, [wire("1", "PROHIBITION", "make any Restricted Payment")]);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]!.slotId).toMatch(/^operative:/);
  });
  it("normalizeInventorySubmission without a structural index falls back to segment slots and still assigns identities", () => {
    const { sourceContext } = build(A, "6.08");
    const r = normalizeInventorySubmission({ candidateRef: "f5-unit", sourceContext }, [wire("1", "PROHIBITION", "make any Restricted Payment")]);
    expect(r.items[0]!.slotId).toMatch(/^operative:region#/);
  });
});
void (0 as unknown as SourceContextResult);
