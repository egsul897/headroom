/**
 * PHASE 3 FINAL CLOSURE - Pass A stability (mission §10/§11).
 *
 * Part 1 - the zero-LLM semantic matcher (scripts/lib/pass-a-semantic-
 * matcher.ts): the ten §11 adversarial shapes. The first eight must match /
 * normalize where semantically safe; a genuinely omitted material condition
 * must remain detectable; a condition folded into a broader non-conditional
 * span is never normalized away.
 *
 * Part 2 - the v2 production Pass A coverage accounting + targeted gap
 * re-inventory (lib/.../inventory.ts), driven by a scripted StageCaller:
 * gaps are surfaced never dropped, the gap call may only ADD verified
 * items, and INVENTORY_COVERAGE_GAP blocks semantic completeness.
 *
 * Every text here is wholly synthetic (invented names, numbers, section
 * styles); anti-enumeration is asserted by re-running the same structure
 * under arbitrary substitutions.
 */
import { describe, expect, it } from "vitest";
import { matchInventories, semanticStability, type MatchItem } from "../../../scripts/lib/pass-a-semantic-matcher";
import { findUncoveredOperativeSegments, runSemanticInventory, segmentOperativeText } from "../../../lib/contract-model/compiler/semantic-accountability/inventory";
import { reconcileInventoryWithComposition } from "../../../lib/contract-model/compiler/semantic-accountability/reconciliation";
import { resolveSourceContext } from "../../../lib/contract-model/compiler/semantic-accountability/source-context";
import type { StageCaller } from "../../../lib/contract-model/compiler/llm-caller";
import type { WireInventoryItem } from "../../../lib/contract-model/compiler/semantic-accountability/wire-schema";
import { buildTestIndex } from "../context-retrieval-test-utils";
import { CORPUS } from "./corpus";
import { buildScenario, normalizeScenarioComposition, reconcileScenario, scriptedWireItems } from "./harness";

// ---------------------------------------------------------------------------
// Part 1 - semantic matcher over synthetic spans
// ---------------------------------------------------------------------------
const TEXT = `"Omega Amount" means, for any period, Base Amount for such period plus (a) restructuring charges not to exceed $5,000,000 in any period; provided that no Omega Event has occurred and is continuing; and (b) fees paid pursuant to Section 6.01(b), so long as such fees are cash-settled.`;
const span = (needle: string): [number, number] => { const i = TEXT.indexOf(needle); if (i < 0) throw new Error(`needle not found: ${needle}`); return [i, i + needle.length]; };
const it_ = (id: string, needle: string, role: string, materiality: MatchItem["materiality"] = "CRITICAL", values: MatchItem["values"] = [], region = "operative"): MatchItem => { const [charStart, charEnd] = span(needle); return { id, regionId: region, charStart, charEnd, role, materiality, values }; };
const money = (raw: string, n: number) => ({ kind: "MONEY", rawText: raw, normalizedValue: n });
const pct = (raw: string, n: number) => ({ kind: "PERCENT", rawText: raw, normalizedValue: n });

describe("Pass A stability - semantic matcher (mission §11 adversarial shapes)", () => {
  it("1. same proposition, different wording: identity is content-derived (span+role+values), so wording never changes the id", () => {
    // The matcher only ever sees spans/roles/values - two items over the same span with the same role are id-stable regardless of proposition prose.
    const a = it_("x1", "restructuring charges not to exceed $5,000,000 in any period", "FORMULA_COMPONENT", "CRITICAL", [money("$5,000,000", 5_000_000)]);
    const b = { ...a };
    const r = matchInventories([a], [b]);
    expect(r.idStable).toHaveLength(1);
    expect(r.classified).toHaveLength(0);
    expect(semanticStability(r.clusters).conservative).toBe(1);
  });

  it("2. same proposition, different span boundaries: SOURCE_SPAN_VARIANCE, identity-attributable, cluster stable", () => {
    const a = it_("a", "restructuring charges not to exceed $5,000,000 in any period", "FORMULA_COMPONENT", "CRITICAL", [money("$5,000,000", 5_000_000)]);
    const b = it_("b", "(a) restructuring charges not to exceed $5,000,000 in any period;", "FORMULA_COMPONENT", "CRITICAL", [money("$5,000,000", 5_000_000)]);
    const r = matchInventories([a], [b]);
    expect(r.classified.map((c) => c.class)).toEqual(["SOURCE_SPAN_VARIANCE", "SOURCE_SPAN_VARIANCE"]);
    expect(r.classified.every((c) => c.identityAttributable)).toBe(true);
    expect(semanticStability(r.clusters)).toMatchObject({ materialClusters: 1, conservative: 1 });
  });

  it("3. same proposition split into two items in one run: GRANULARITY_VARIANCE (fragment/merge), one stable cluster", () => {
    const whole = it_("w", "fees paid pursuant to Section 6.01(b), so long as such fees are cash-settled", "PERMISSION");
    const p1 = it_("p1", "fees paid pursuant to Section 6.01(b)", "PERMISSION");
    const p2 = it_("p2", "so long as such fees are cash-settled", "PERMISSION");
    const r = matchInventories([whole], [p1, p2]);
    expect(r.classified.map((c) => c.class).sort()).toEqual(["GRANULARITY_VARIANCE", "GRANULARITY_VARIANCE", "GRANULARITY_VARIANCE"]);
    expect(semanticStability(r.clusters)).toMatchObject({ materialClusters: 1, lenient: 1, conservative: 1 });
  });

  it("4. two items merged into one in the other run: symmetric to the split - still one stable cluster", () => {
    const p1 = it_("p1", "fees paid pursuant to Section 6.01(b)", "PERMISSION");
    const p2 = it_("p2", "so long as such fees are cash-settled", "PERMISSION");
    const whole = it_("w", "fees paid pursuant to Section 6.01(b), so long as such fees are cash-settled", "PERMISSION");
    const r = matchInventories([p1, p2], [whole]);
    expect(r.clusters.filter((c) => c.material)).toHaveLength(1);
    expect(r.clusters[0]!.inRun1).toBe(2);
    expect(r.clusters[0]!.inRun2).toBe(1);
  });

  it("5. a duplicate item in one run is DUPLICATION_VARIANCE and never creates an extra cluster", () => {
    const a = it_("a", "restructuring charges not to exceed $5,000,000 in any period", "FORMULA_COMPONENT", "CRITICAL", [money("$5,000,000", 5_000_000)]);
    const dup = { ...a, id: "a-dup", charStart: a.charStart + 1 }; // near-identical span, same role - a different id
    const b = { ...a };
    const r = matchInventories([a, dup], [b]);
    expect(r.classified.map((c) => c.class)).toEqual(["DUPLICATION_VARIANCE"]);
    expect(r.clusters.filter((c) => c.material)).toHaveLength(1);
  });

  it("6. same amount, different formatting ($5,000,000 vs $5 million) matches by normalized value, not raw text", () => {
    const a = it_("a", "restructuring charges not to exceed $5,000,000 in any period", "FORMULA_COMPONENT", "CRITICAL", [money("$5,000,000", 5_000_000)]);
    const b = { ...a, id: "b", charEnd: a.charEnd - 1, values: [money("$5 million", 5_000_000)] };
    const r = matchInventories([a], [b]);
    expect(r.classified[0]!.class).toBe("SOURCE_SPAN_VARIANCE");
    expect(r.classified[0]!.subclass).toContain("values EQUAL");
  });

  it("7. same percentage, different formatting (15% vs 15 percent) matches by normalized value", () => {
    const a = it_("a", "so long as such fees are cash-settled", "CONDITION", "CRITICAL", [pct("15%", 0.15)]);
    const b = { ...a, id: "b", charStart: a.charStart - 1, values: [pct("15 percent", 0.15)] };
    const r = matchInventories([a], [b]);
    expect(r.classified[0]!.class).toBe("SOURCE_SPAN_VARIANCE");
    expect(r.classified[0]!.subclass).toContain("values EQUAL");
  });

  it("8. same cross-reference, different formatting (Section 6.01(b) vs 6.01(b)) - the span decides, the reference text does not", () => {
    const a = it_("a", "fees paid pursuant to Section 6.01(b)", "REFERENCE", "MATERIAL");
    const b = it_("b", "pursuant to Section 6.01(b)", "REFERENCE", "MATERIAL");
    const r = matchInventories([a], [b]);
    expect(r.classified.map((c) => c.class)).toEqual(["SOURCE_SPAN_VARIANCE", "SOURCE_SPAN_VARIANCE"]);
    expect(semanticStability(r.clusters).conservative).toBe(1);
  });

  it("9. same condition paraphrased: identical span + CONDITION role in both runs is id-stable (prose is not identity)", () => {
    const a = it_("c", "provided that no Omega Event has occurred and is continuing", "CONDITION");
    const r = matchInventories([a], [{ ...a }]);
    expect(r.idStable).toHaveLength(1);
    expect(r.clusters[0]!.conservativeStable).toBe(true);
  });

  it("10. a material condition genuinely omitted from one run is GENUINE_OMISSION - never normalized away, cluster unstable", () => {
    const base = it_("base", "Base Amount for such period", "FORMULA_COMPONENT");
    const cond = it_("cond", "provided that no Omega Event has occurred and is continuing", "CONDITION");
    const r = matchInventories([base, cond], [{ ...base }]);
    const omitted = r.classified.find((c) => c.id === "cond");
    expect(omitted?.class).toBe("GENUINE_OMISSION");
    expect(omitted?.identityAttributable).toBe(false);
    expect(semanticStability(r.clusters)).toMatchObject({ materialClusters: 2, lenientInBoth: 1, conservativeInBoth: 1 });
  });

  it("11. a condition that only survives FOLDED into a broader non-conditional span is flagged and counted unstable under the conservative metric", () => {
    const cond = it_("cond", "provided that no Omega Event has occurred and is continuing", "CONDITION");
    const broad = it_("broad", "restructuring charges not to exceed $5,000,000 in any period; provided that no Omega Event has occurred and is continuing", "FORMULA_COMPONENT", "CRITICAL", [money("$5,000,000", 5_000_000)]);
    const r = matchInventories([cond], [broad]);
    const c = r.classified.find((x) => x.id === "cond");
    expect(c?.class).toBe("GRANULARITY_VARIANCE");
    expect(c?.conditionalRoleFolded).toBe(true);
    const s = semanticStability(r.clusters);
    expect(s.lenient).toBe(1);
    expect(s.conservative).toBe(0);
  });

  it("audit A2(i): a value changed inside the same span is NEVER stable - lenient, conservative and strict-fold all refuse it", () => {
    const a = it_("a", "restructuring charges not to exceed $5,000,000 in any period", "FORMULA_COMPONENT", "CRITICAL", [money("$5,000,000", 5_000_000)]);
    const b = { ...a, id: "b", values: [money("$6,000,000", 6_000_000)] };
    const r = matchInventories([a], [b]);
    expect(r.classified.every((c) => c.class === "VALUE_NORMALIZATION_VARIANCE" && c.valuesDiffer)).toBe(true);
    const s = semanticStability(r.clusters);
    expect(s).toMatchObject({ materialClusters: 1, lenient: 0, conservative: 0, strictFold: 0 });
  });

  it("audit A2(ii): a distinct material sub-proposition folded into a broader non-conditional span is credited by lenient/conservative but NOT by strict-fold (the disclosed lower bound)", () => {
    const whole = it_("w", "fees paid pursuant to Section 6.01(b), so long as such fees are cash-settled", "PERMISSION");
    const part = it_("p", "so long as such fees are cash-settled", "PERMISSION");
    const r = matchInventories([whole, part], [{ ...whole }]);
    const s = semanticStability(r.clusters);
    expect(s.lenient).toBe(1);
    expect(s.strictFold).toBe(0);
  });

  it("audit A2(iii): a CONDITION folded into a container of a DIFFERENT conditional role (THRESHOLD) is still flagged folded", () => {
    const cond = it_("c", "so long as such fees are cash-settled", "CONDITION");
    const thr = it_("t", "fees paid pursuant to Section 6.01(b), so long as such fees are cash-settled", "THRESHOLD");
    const r = matchInventories([cond], [thr]);
    expect(r.classified.find((c) => c.id === "c")?.conditionalRoleFolded).toBe(true);
    expect(semanticStability(r.clusters).conservative).toBe(0);
  });

  it("anti-enumeration: the matcher's verdicts are identical under arbitrary names, amounts and section styles", () => {
    const variants = [
      { term: "Omega Amount", amt: "$5,000,000", sec: "Section 6.01(b)" },
      { term: "Quux Basis", amt: "$17,250,000", sec: "clause 12.4(iv)" },
      { term: "Kappa Measure", amt: "$900,000", sec: "Schedule 3" },
    ];
    const verdicts = variants.map((v) => {
      const t = `"${v.term}" means Base plus restructuring charges not to exceed ${v.amt} in any period; provided that no Event has occurred; and fees paid pursuant to ${v.sec}.`;
      const sp = (needle: string) => { const i = t.indexOf(needle); return { charStart: i, charEnd: i + needle.length }; };
      const a: MatchItem = { id: "a", regionId: "operative", role: "FORMULA_COMPONENT", materiality: "CRITICAL", values: [], ...sp(`restructuring charges not to exceed ${v.amt} in any period`) };
      const cond: MatchItem = { id: "c", regionId: "operative", role: "CONDITION", materiality: "CRITICAL", values: [], ...sp("provided that no Event has occurred") };
      const b: MatchItem = { ...a, id: "b", ...sp(`charges not to exceed ${v.amt} in any period; provided that no Event has occurred`) };
      const r = matchInventories([a, cond], [b]);
      return r.classified.map((c) => `${c.id}:${c.class}:${c.conditionalRoleFolded}`).sort().join("|");
    });
    expect(new Set(verdicts).size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Part 2 - production Pass A v2 coverage accounting + targeted gap re-inventory
// ---------------------------------------------------------------------------
const DOC_ID = "synthetic-doc";
function contextFor(scenarioId: string) {
  const scenario = CORPUS.find((s) => s.id === scenarioId)!;
  const index = buildTestIndex([{ documentId: DOC_ID, label: "Synthetic Credit Agreement", text: scenario.text }]);
  const anchor = index.findNodesByRef(DOC_ID, scenario.anchorRef)[0]!;
  const operativeText = index.getNodeText(anchor.nodeId, "DESCENDANTS");
  const sourceContext = resolveSourceContext({ index, documentId: DOC_ID, operativeSourceText: operativeText, anchorNodeId: anchor.nodeId, operativeCharStart: anchor.charStart, documentText: index.getDocumentText(DOC_ID) ?? null });
  return { scenario, sourceContext, wire: scriptedWireItems(scenario.items) };
}
/** A scripted caller that answers the first call with `first` and every later (gap) call with `gap`, recording the stages it was asked for. */
function twoStepCaller(first: WireInventoryItem[], gap: WireInventoryItem[] | Error, stages: string[]): StageCaller {
  let n = 0;
  return {
    providerName: "scripted",
    model: "scripted-inventory",
    isSynthetic: false,
    async call<T>(_schema: unknown, stage: string): Promise<T> {
      stages.push(stage);
      if (n++ === 0) return { items: first, overallNotes: [] } as unknown as T;
      if (gap instanceof Error) throw gap;
      return { items: gap, overallNotes: [] } as unknown as T;
    },
    lastTelemetry: () => null,
  };
}

describe("Pass A v2 - operative-text coverage accounting + targeted gap re-inventory", () => {
  it("segmentation is deterministic and generic: sentence/semicolon/enumerator boundaries, identical shape under arbitrary names, numbers and section styles", () => {
    const shape = (term: string, amt: string, sec: string) => `"${term}" means, for any period, the Base Amount plus (a) charges not to exceed ${amt} in any period; provided that no Event has occurred; and (b) fees paid pursuant to ${sec}, so long as such fees are cash-settled.`;
    const s1 = segmentOperativeText(shape("Omega Amount", "$5,000,000", "Section 6.01(b)"));
    const s2 = segmentOperativeText(shape("Quux Basis", "$17,250,000", "clause 12.4(iv)"));
    const s3 = segmentOperativeText(shape("Kappa Measure", "$900,000", "Schedule 3"));
    expect(s1.length).toBeGreaterThanOrEqual(4);
    expect(s2.length).toBe(s1.length);
    expect(s3.length).toBe(s1.length);
    expect(segmentOperativeText(shape("Omega Amount", "$5,000,000", "Section 6.01(b)"))).toEqual(s1);
  });

  it("an uncovered clause carrying operative language is surfaced with exact offsets; a covered one is not; a short connective is below the floor", () => {
    const text = `"Omega Amount" means, for any period, the Base Amount plus (a) charges not to exceed $5,000,000 in any period; provided that no Omega Event has occurred and is continuing at such time; and (b) other amounts.`;
    const cover = (needle: string) => { const i = text.indexOf(needle); return { regionId: "operative", charStart: i, charEnd: i + needle.length }; };
    const gaps = findUncoveredOperativeSegments("operative", text, [cover('"Omega Amount" means, for any period, the Base Amount'), cover("charges not to exceed $5,000,000 in any period")]);
    expect(gaps).toHaveLength(1);
    expect(text.slice(gaps[0]!.charStart, gaps[0]!.charEnd)).toContain("provided that no Omega Event has occurred");
    expect(gaps[0]!.coverage).toBe(0);
    // "(b) other amounts." is < 40 non-whitespace chars and carries no operative vocabulary - below the surfacing floor by design.
    expect(gaps.some((g) => text.slice(g.charStart, g.charEnd).includes("other amounts"))).toBe(false);
    // Full coverage -> no gap.
    expect(findUncoveredOperativeSegments("operative", text, [cover(text)])).toHaveLength(0);
  });

  it("no uncovered segment -> no gap call is made (attempted=false), status INVENTORY_OK", async () => {
    const { scenario, sourceContext, wire } = contextFor("I2");
    const stages: string[] = [];
    const inv = await runSemanticInventory({ candidateRef: scenario.id, documentId: DOC_ID, sourceContext, caller: twoStepCaller(wire, [], stages) });
    expect(inv.inventoryStatus).toBe("INVENTORY_OK");
    expect(inv.gapReinventory).toMatchObject({ attempted: false, segmentsBefore: 0, segmentsAfter: 0 });
    expect(stages).toEqual(["semantic_inventory"]);
    expect(inv.uninventoriedSegments).toEqual([]);
  });

  it("a first pass that skips the definitional lead-in + condition triggers ONE targeted gap call that may only ADD verified items; when it closes the gap the status is INVENTORY_OK with the addition disclosed", async () => {
    const { scenario, sourceContext, wire } = contextFor("I1");
    const first = wire.filter((w) => w.localRef !== "head" && w.localRef !== "dedupe");
    const gap = wire.filter((w) => w.localRef === "head" || w.localRef === "dedupe");
    const stages: string[] = [];
    const inv = await runSemanticInventory({ candidateRef: scenario.id, documentId: DOC_ID, sourceContext, caller: twoStepCaller(first, gap, stages) });
    expect(stages).toEqual(["semantic_inventory", "semantic_inventory_gap"]);
    expect(inv.inventoryStatus).toBe("INVENTORY_OK");
    expect(inv.gapReinventory).toMatchObject({ attempted: true, segmentsBefore: 1, itemsAdded: 2, segmentsAfter: 0, error: null });
    expect(inv.items).toHaveLength(scenario.items.length);
    expect(inv.items.filter((i) => i.semanticRole === "CONDITION")).toHaveLength(1);
    // The gap pass changes nothing about first-pass items: same ids, same count.
    const firstOnly = await runSemanticInventory({ candidateRef: scenario.id, documentId: DOC_ID, sourceContext, caller: twoStepCaller(first, [], []) });
    const firstIds = new Set(firstOnly.items.map((i) => i.inventoryItemId));
    expect(inv.items.filter((i) => firstIds.has(i.inventoryItemId))).toHaveLength(firstOnly.items.length);
  });

  it("a gap call that returns nothing leaves the segment SURFACED: INVENTORY_COVERAGE_GAP with the residual span, never INVENTORY_OK, never dropped", async () => {
    const { scenario, sourceContext, wire } = contextFor("I1");
    const first = wire.filter((w) => w.localRef !== "head" && w.localRef !== "dedupe");
    const inv = await runSemanticInventory({ candidateRef: scenario.id, documentId: DOC_ID, sourceContext, caller: twoStepCaller(first, [], []) });
    expect(inv.inventoryStatus).toBe("INVENTORY_COVERAGE_GAP");
    expect(inv.uninventoriedSegments).toHaveLength(1);
    expect(inv.uninventoriedSegments[0]!.excerpt).toContain("without duplication and to the extent deducted");
    expect(inv.gapReinventory).toMatchObject({ attempted: true, itemsAdded: 0, segmentsAfter: 1 });
    expect(inv.inventoryStatusReason).toContain("uncovered");
  });

  it("a gap call that throws is disclosed (error recorded) and still yields INVENTORY_COVERAGE_GAP - a failed second pass never silently becomes OK", async () => {
    const { scenario, sourceContext, wire } = contextFor("I1");
    const first = wire.filter((w) => w.localRef !== "head" && w.localRef !== "dedupe");
    const inv = await runSemanticInventory({ candidateRef: scenario.id, documentId: DOC_ID, sourceContext, caller: twoStepCaller(first, new Error("provider hiccup"), []) });
    expect(inv.inventoryStatus).toBe("INVENTORY_COVERAGE_GAP");
    expect(inv.gapReinventory?.error).toContain("provider hiccup");
    expect(inv.items.length).toBe(first.length);
  });

  it("gap items pass the same anti-hallucination gate: a fabricated excerpt is dropped and counted; a re-submitted first-pass item is a duplicate, not a new item", async () => {
    const { scenario, sourceContext, wire } = contextFor("I1");
    const first = wire.filter((w) => w.localRef !== "head" && w.localRef !== "dedupe");
    const fabricated: WireInventoryItem = { ...wire.find((w) => w.localRef === "dedupe")!, excerpt: "this sentence is not in the source at all" };
    const resubmitted = first[0]!;
    const inv = await runSemanticInventory({ candidateRef: scenario.id, documentId: DOC_ID, sourceContext, caller: twoStepCaller(first, [fabricated, resubmitted], []) });
    expect(inv.gapReinventory).toMatchObject({ attempted: true, itemsAdded: 0, unverifiableDropped: 1, duplicatesDropped: 1 });
    expect(inv.inventoryStatus).toBe("INVENTORY_COVERAGE_GAP");
    // First-pass rejection counters are untouched by the gap pass.
    expect(inv.rejectedUnverifiableItems).toBe(0);
    expect(inv.rejectedDuplicateItems).toBe(0);
  });

  it("the frozen content hash carries the residual gap: the same items with and without a surfaced segment freeze to different hashes", async () => {
    const { scenario, sourceContext, wire } = contextFor("I1");
    const first = wire.filter((w) => w.localRef !== "head" && w.localRef !== "dedupe");
    const gap = wire.filter((w) => w.localRef === "head" || w.localRef === "dedupe");
    const closed = await runSemanticInventory({ candidateRef: scenario.id, documentId: DOC_ID, sourceContext, caller: twoStepCaller(first, gap, []) });
    const open = await runSemanticInventory({ candidateRef: scenario.id, documentId: DOC_ID, sourceContext, caller: twoStepCaller(first, [], []) });
    expect(closed.frozenContentHash).not.toBe(open.frozenContentHash);
    const again = await runSemanticInventory({ candidateRef: scenario.id, documentId: DOC_ID, sourceContext, caller: twoStepCaller(first, [], []) });
    expect(again.frozenContentHash).toBe(open.frozenContentHash);
  });

  it("Pass C: INVENTORY_COVERAGE_GAP blocks semanticallyComplete even when every inventoried item has full lineage, and the residual segment is in the reasons/counts", async () => {
    const built = await buildScenario(CORPUS.find((s) => s.id === "I1")!);
    const first = built.wireItems.filter((w) => w.localRef !== "head" && w.localRef !== "dedupe");
    const gapped = await runSemanticInventory({ candidateRef: built.scenario.id, documentId: DOC_ID, sourceContext: built.sourceContext, caller: twoStepCaller(first, [], []) });
    // Compose with lineage for every item that IS inventoried (the head/dedupe ids are absent, so compose without them).
    const idOf = (ref: string) => { const gt = built.scenario.items.find((i) => i.ref === ref)!; const hit = gapped.items.find((a) => a.semanticRole === gt.role && a.sourceSpan.excerpt.replace(/\s+/g, " ") === gt.excerpt.trim().replace(/\s+/g, " ")); return hit ? hit.inventoryItemId : "inv-item:000000000000000000000000"; };
    const normalized = normalizeScenarioComposition(built, built.scenario.compose(idOf));
    const result = reconcileInventoryWithComposition({ inventory: gapped, composition: { rules: normalized.rules, definitions: normalized.definitions, sharedCapacities: normalized.sharedCapacities }, dispositions: normalized.inventoryDispositions, sourceContextState: built.sourceContext.state });
    expect(result.semanticallyComplete).toBe(false);
    expect(result.counts.uninventoriedSegments).toBe(1);
    expect(result.reasons.some((r) => r.includes("INVENTORY_COVERAGE_GAP"))).toBe(true);
    expect(result.reasons.some((r) => r.includes("operative-text segment"))).toBe(true);
    // Contrast: the fully inventoried scenario is complete.
    const full = reconcileScenario(built, normalizeScenarioComposition(built));
    expect(full.semanticallyComplete).toBe(true);
    expect(full.counts.uninventoriedSegments).toBe(0);
  });

  it("audit B1: an EMPTY inventory (twice) over operative text that carries only the generic vocabulary (unless / subject to / to the extent / excluding) is INVENTORY_COVERAGE_GAP, never INVENTORY_OK, and never semanticallyComplete", async () => {
    const text = `ARTICLE VII\nNEGATIVE COVENANTS\n\nSECTION 7.09 Omega Transfers. Transfers of Omega Assets to any Affiliate are restricted unless the Omega Ratio at such time, subject to the adjustments described in Schedule 4, is no greater than the level then in effect, excluding transfers to the extent funded solely with Retained Proceeds and excluding any transfer completed prior to the Closing Date.\n`;
    const index = buildTestIndex([{ documentId: DOC_ID, label: "Synthetic", text }]);
    const anchor = index.findNodesByRef(DOC_ID, "7.09")[0]!;
    const operativeText = index.getNodeText(anchor.nodeId, "DESCENDANTS");
    const sourceContext = resolveSourceContext({ index, documentId: DOC_ID, operativeSourceText: operativeText, anchorNodeId: anchor.nodeId, operativeCharStart: anchor.charStart, documentText: index.getDocumentText(DOC_ID) ?? null });
    const stages: string[] = [];
    const inv = await runSemanticInventory({ candidateRef: "audit-b1", documentId: DOC_ID, sourceContext, caller: twoStepCaller([], [], stages) });
    expect(stages).toEqual(["semantic_inventory", "semantic_inventory_gap"]);
    expect(inv.inventoryStatus).toBe("INVENTORY_COVERAGE_GAP");
    expect(inv.uninventoriedSegments.length).toBeGreaterThan(0);
    const result = reconcileInventoryWithComposition({ inventory: inv, composition: { rules: [], definitions: [], sharedCapacities: [] }, dispositions: [], sourceContextState: sourceContext.state });
    expect(result.semanticallyComplete).toBe(false);
  });

  it("audit B2'': echo items with non-material materiality (REVIEW_UNCERTAIN / INFORMATIONAL) never close a gap - the segment stays surfaced and the unit stays incomplete", async () => {
    const { scenario, sourceContext, wire } = contextFor("I1");
    const first = wire.filter((w) => w.localRef !== "head" && w.localRef !== "dedupe");
    const echoes: WireInventoryItem[] = wire.filter((w) => w.localRef === "head" || w.localRef === "dedupe").map((w, i) => ({ ...w, materiality: i === 0 ? "REVIEW_UNCERTAIN" : "INFORMATIONAL" }));
    const inv = await runSemanticInventory({ candidateRef: scenario.id, documentId: DOC_ID, sourceContext, caller: twoStepCaller(first, echoes, []) });
    expect(inv.inventoryStatus).toBe("INVENTORY_COVERAGE_GAP");
    expect(inv.gapReinventory?.itemsAdded).toBe(2);
    expect(inv.uninventoriedSegments).toHaveLength(1);
    // And the same echo items as MATERIAL do close it.
    const material = echoes.map((w) => ({ ...w, materiality: "MATERIAL" }));
    const closed = await runSemanticInventory({ candidateRef: scenario.id, documentId: DOC_ID, sourceContext, caller: twoStepCaller(first, material, []) });
    expect(closed.inventoryStatus).toBe("INVENTORY_OK");
  });

  it("audit defense in depth: Pass C refuses semanticallyComplete on residual segments even if the status string were INVENTORY_OK", async () => {
    const built = await buildScenario(CORPUS.find((s) => s.id === "I2")!);
    const normalized = normalizeScenarioComposition(built);
    const clean = reconcileScenario(built, normalized);
    expect(clean.semanticallyComplete).toBe(true);
    const tampered = { ...built.inventory, inventoryStatus: "INVENTORY_OK" as const, uninventoriedSegments: [{ regionId: "operative", charStart: 0, charEnd: 50, coverage: 0, excerpt: "x" }] };
    const result = reconcileInventoryWithComposition({ inventory: tampered, composition: { rules: normalized.rules, definitions: normalized.definitions, sharedCapacities: normalized.sharedCapacities }, dispositions: normalized.inventoryDispositions, sourceContextState: built.sourceContext.state });
    expect(result.semanticallyComplete).toBe(false);
  });

  it("corpus-wide: no fully-inventoried scenario leaves an uncovered operative segment, and every scenario's gap record is disclosed", async () => {
    for (const scenario of CORPUS) {
      const b = await buildScenario(scenario);
      expect(b.inventory.gapReinventory, scenario.id).not.toBeNull();
      if (scenario.expectSemanticallyComplete) expect(b.inventory.uninventoriedSegments, `${scenario.id}: ${JSON.stringify(b.inventory.uninventoriedSegments.map((s) => s.excerpt.slice(0, 80)))}`).toEqual([]);
    }
  });
});
