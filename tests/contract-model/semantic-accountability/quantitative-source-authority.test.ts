/**
 * DEFECT B of the §7.5(j) live-exposed deterministic closure - QUANTITATIVE SOURCE AUTHORITY (semantic-accountability.v8).
 *
 * v8 trust-boundary seal: canonicalize OTHER/unknown only when rawText occurs inside THIS item's authenticated source
 * span. Outside-span location is diagnostics only (char offsets may still be recorded) with zero semantic authority.
 *
 * Live defect: the model declared its threshold figures with an out-of-vocabulary kind; normalizeWireValue defaulted them
 * to OTHER while the deterministic completion added the scanner's MONEY / PERCENT twin of the same figure. Pass C matches
 * OTHER only against TEXT nodes, so one real source figure produced "typed value PRESENT + OTHER duplicate MISSING" and
 * the whole item was MISSING_FROM_COMPOSITION although its literal sat in the IR.
 *
 * Rule: THE DETERMINISTIC SOURCE SCANNER IS AUTHORITATIVE FOR THE KIND OF A SOURCE-LOCATABLE FIGURE IT RECOGNISES. A model
 * kind outside the vocabulary (or OTHER) is canonicalised to the scanner's kind/value/unit when the located raw text scans
 * to exactly one recognised figure; otherwise the existing OTHER / review behaviour is untouched (fail closed).
 */
import { describe, expect, it } from "vitest";
import { canonicalizeFrozenQuantitativeValue, runSemanticInventory } from "../../../lib/contract-model/compiler/semantic-accountability/inventory";
import { reconcileInventoryWithComposition } from "../../../lib/contract-model/compiler/semantic-accountability/reconciliation";
import type { FrozenSemanticInventory, QuantitativeValue, SourceContextRegion } from "../../../lib/contract-model/compiler/semantic-accountability/types";
import type { StageCaller } from "../../../lib/contract-model/compiler/llm-caller";
import type { WireInventoryItem } from "../../../lib/contract-model/compiler/semantic-accountability/wire-schema";

const OP = "The Borrower may make any Disposition which yields net proceeds of less than the greater of (x) $25,000,000 and (y) 1.5% of Consolidated Total Assets, provided that the cure period is thirty (30) days and the fee is $500,000.";
const region = (text: string): SourceContextRegion => ({ regionId: "operative", kind: "OPERATIVE", documentId: "d", sourceNodeId: null, sectionRef: "9.01", charStart: 0, charEnd: text.length, text, expandedFor: null, truncatedAtBudget: false, unitExtension: null });
const sc = () => ({ state: "COMPLETE_LOCAL_SOURCE" as const, regions: [region(OP)], unresolvedReferences: [], reasons: [], totalChars: OP.length, budgetChars: 10_000 });
const scriptedCaller = (items: WireInventoryItem[]): StageCaller => { let call = 0; return { providerName: "scripted", model: "scripted", isSynthetic: false, async call<T>(): Promise<T> { return { items: call++ === 0 ? items : [] } as T; }, lastTelemetry: () => null } as unknown as StageCaller; };
const wire = (localRef: string, excerpt: string, values: { kind?: string; rawText: string; normalizedValue?: number | null; unit?: string | null }[], role = "THRESHOLD"): WireInventoryItem => ({ localRef, semanticRole: role, proposition: `${localRef} proposition`, excerpt, regionId: "operative", quantitativeValues: values.map((v) => ({ kind: v.kind ?? "OTHER", rawText: v.rawText, normalizedValue: v.normalizedValue ?? null, unit: v.unit ?? null })), referencedTerms: [], referencedSections: [], parentRef: null, relatedRefs: [], materiality: "CRITICAL", ambiguity: "NONE", ambiguityReason: null, operative: "OPERATIVE" } as never);
const inventoryOf = (items: WireInventoryItem[]) => runSemanticInventory({ candidateRef: "defect-b", documentId: "d", sourceContext: sc(), caller: scriptedCaller(items) });
const valuesOf = (inv: FrozenSemanticInventory, excerpt: string) => inv.items.find((i) => i.sourceSpan.excerpt === excerpt)!.quantitativeValues.map((v) => ({ kind: v.kind, rawText: v.rawText, normalizedValue: v.normalizedValue, unit: v.unit, declaredKind: v.declaredKind ?? null }));
const money = (amount: number) => ({ kind: "MONEY", type: "MONEY", exprId: `e-${amount}`, amount, currency: "USD" });
const percent = (value: number) => ({ kind: "PERCENT", type: "PERCENT", exprId: `p-${value}`, value });
const reconcile = (inv: FrozenSemanticInventory, capacityExpression: unknown, consumed: string[] = inv.items.map((i) => i.inventoryItemId)) =>
  reconcileInventoryWithComposition({ inventory: inv, composition: { rules: [{ inventoryItemIds: consumed, capacityExpression, conditions: [], exceptions: [], dependsOn: [], unresolvedDependencies: [] }], definitions: [], sharedCapacities: [] } as never, dispositions: [], sourceContextState: "COMPLETE_LOCAL_SOURCE" });

describe("defect B - the deterministic scanner is authoritative for the kind of a recognised source figure", () => {
  it("B1: model kind 'THRESHOLD' + rawText '$25,000,000' -> one canonical MONEY value, no OTHER duplicate; the declared kind survives as audit metadata", async () => {
    const inv = await inventoryOf([wire("t", "(x) $25,000,000", [{ kind: "THRESHOLD", rawText: "$25,000,000" }])]);
    expect(valuesOf(inv, "(x) $25,000,000")).toEqual([{ kind: "MONEY", rawText: "$25,000,000", normalizedValue: 25000000, unit: "USD", declaredKind: "THRESHOLD" }]);
  });

  it("B2: an unknown / defaulted kind + '1.5%' -> canonical PERCENT only", async () => {
    const inv = await inventoryOf([wire("p", "(y) 1.5% of Consolidated Total Assets", [{ kind: "AMOUNT", rawText: "1.5%", normalizedValue: 1.5, unit: "PERCENT" }]), wire("q", "the fee is $500,000", [{ rawText: "$500,000" }])]);
    expect(valuesOf(inv, "(y) 1.5% of Consolidated Total Assets")).toEqual([{ kind: "PERCENT", rawText: "1.5%", normalizedValue: 0.015, unit: "%", declaredKind: "AMOUNT" }]);
    expect(valuesOf(inv, "the fee is $500,000")).toEqual([{ kind: "MONEY", rawText: "$500,000", normalizedValue: 500000, unit: "USD", declaredKind: "OTHER" }]);
  });

  it("B3: an unknown kind + genuinely non-quantitative prose stays OTHER - no numeric type is invented", async () => {
    const inv = await inventoryOf([wire("n", "net proceeds of less than the greater of", [{ kind: "FORMULA", rawText: "net proceeds" }], "FORMULA_COMPONENT")]);
    expect(valuesOf(inv, "net proceeds of less than the greater of")).toEqual([{ kind: "OTHER", rawText: "net proceeds", normalizedValue: null, unit: null, declaredKind: null }]);
  });

  it("B4: an unknown kind whose raw text carries several distinguishable figures is not guessed - it stays OTHER beside the scanner's own typed values", async () => {
    const excerpt = "the greater of (x) $25,000,000 and (y) 1.5% of Consolidated Total Assets";
    const inv = await inventoryOf([wire("g", excerpt, [{ kind: "THRESHOLD", rawText: "$25,000,000 and (y) 1.5%" }])]);
    const values = valuesOf(inv, excerpt);
    // the OTHER value keeps the pre-existing fallback normalisation (the model's own number, else the first scanned one) - that legacy behaviour is untouched here; what matters is that no kind was guessed
    expect(values.find((v) => v.kind === "OTHER")).toMatchObject({ kind: "OTHER", rawText: "$25,000,000 and (y) 1.5%", declaredKind: null });
    expect(values.filter((v) => v.kind !== "OTHER").map((v) => [v.kind, v.normalizedValue])).toEqual([["MONEY", 25000000], ["PERCENT", 0.015]]);
    // raw text absent or not locatable in the source: fail closed (existing behaviour)
    const inv2 = await inventoryOf([wire("z", "(x) $25,000,000", [{ kind: "THRESHOLD", rawText: "$99,000,000" }])]);
    expect(valuesOf(inv2, "(x) $25,000,000").map((v) => [v.kind, v.rawText])).toEqual([["OTHER", "$99,000,000"], ["MONEY", "$25,000,000"]]);
  });

  it("B5 / B6: a canonical MONEY/PERCENT item with lineage to the matching IR literal is REPRESENTED, and an invalid-kind declaration can no longer make that same figure MISSING_FROM_COMPOSITION", async () => {
    const inv = await inventoryOf([wire("t", "(x) $25,000,000", [{ kind: "THRESHOLD", rawText: "$25,000,000" }]), wire("p", "(y) 1.5% of Consolidated Total Assets", [{ kind: "AMOUNT", rawText: "1.5%" }])]);
    const rec = reconcile(inv, { kind: "MAX", type: "MONEY", exprId: "m", operands: [money(25000000), { kind: "MULTIPLY", type: "MONEY", exprId: "x", operands: [percent(0.015), { kind: "METRIC_REFERENCE", type: "MONEY", metricName: "Consolidated Total Assets", exprId: "r", companyId: "c", instrumentKey: "i", resolvedDefinitionId: null }] }] });
    expect(rec.items.map((i) => [i.semanticRole, i.disposition])).toEqual([["THRESHOLD", "REPRESENTED"], ["THRESHOLD", "REPRESENTED"]]);
    expect(rec.counts.materialQuantitativeValuesMissing).toBe(0);
    expect(rec.items.flatMap((i) => i.quantitative.map((q) => q.disposition))).toEqual(["VALUE_PRESENT_IN_IR", "VALUE_PRESENT_IN_IR"]);
  });

  it("B7: a genuinely absent quantitative value is STILL MISSING_FROM_COMPOSITION", async () => {
    const inv = await inventoryOf([wire("t", "(x) $25,000,000", [{ kind: "THRESHOLD", rawText: "$25,000,000" }])]);
    const rec = reconcile(inv, money(10000000));
    expect(rec.items[0]!.disposition).toBe("MISSING_FROM_COMPOSITION");
    expect(rec.items[0]!.reason).toContain("$25,000,000 appears nowhere in the composed IR");
    expect(rec.counts.materialQuantitativeValuesMissing).toBe(1);
  });

  it("B8: lineage without value correspondence still does not count, and OTHER prose still cannot match a numeric IR literal", async () => {
    // lineage claimed, figure absent: MISSING (unchanged rule)
    const inv = await inventoryOf([wire("t", "(x) $25,000,000", [{ kind: "MONEY", rawText: "$25,000,000" }])]);
    expect(reconcile(inv, percent(0.25)).items[0]!.disposition).toBe("MISSING_FROM_COMPOSITION");
    // OTHER prose vs a typed literal: no correspondence, no lineage -> MISSING; OTHER was not globally allowed to match numbers
    const prose = await inventoryOf([wire("n", "net proceeds of less than the greater of", [{ kind: "FORMULA", rawText: "net proceeds" }], "FORMULA_COMPONENT")]);
    const rec = reconcile(prose, money(25000000), []);
    expect(rec.items[0]!.disposition).toBe("MISSING_FROM_COMPOSITION");
    expect(rec.items[0]!.quantitative[0]!.disposition).toBe("VALUE_MISSING_FROM_COMPOSITION");
    // the frozen-value replay helper judges exactly as the normalizer does
    const frozenOther: QuantitativeValue = { kind: "OTHER", rawText: "$25,000,000", normalizedValue: 25000000, unit: "USD", charStart: OP.indexOf("$25,000,000"), charEnd: OP.indexOf("$25,000,000") + "$25,000,000".length };
    expect(canonicalizeFrozenQuantitativeValue(frozenOther, OP)).toMatchObject({ kind: "MONEY", normalizedValue: 25000000, unit: "USD", declaredKind: "OTHER", charStart: frozenOther.charStart, charEnd: frozenOther.charEnd });
    expect(canonicalizeFrozenQuantitativeValue({ ...frozenOther, charStart: -1, charEnd: -1 }, OP)).toEqual({ ...frozenOther, charStart: -1, charEnd: -1 });
    expect(canonicalizeFrozenQuantitativeValue({ kind: "OTHER", rawText: "net proceeds", normalizedValue: null, unit: null, charStart: OP.indexOf("net proceeds"), charEnd: OP.indexOf("net proceeds") + 12 }, OP).kind).toBe("OTHER");
    expect(canonicalizeFrozenQuantitativeValue({ kind: "MONEY", rawText: "$25,000,000", normalizedValue: 25000000, unit: "USD", charStart: 0, charEnd: 11 }, OP).declaredKind).toBeUndefined();
  });

  it("B9: OTHER rawText that appears ONLY outside this item's authenticated span is NOT canonicalised (diagnostics only, zero semantic authority)", async () => {
    // Item excerpt is the fee clause; model declares $25,000,000 which lives earlier in the region, outside this item's span.
    const inv = await inventoryOf([wire("f", "the fee is $500,000", [{ kind: "THRESHOLD", rawText: "$25,000,000" }])]);
    const values = valuesOf(inv, "the fee is $500,000");
    // The out-of-span OTHER stays OTHER (no kind lift); the in-span scanner completion still adds the fee's MONEY.
    expect(values.find((v) => v.rawText === "$25,000,000")).toMatchObject({ kind: "OTHER", rawText: "$25,000,000", declaredKind: null });
    expect(values.find((v) => v.rawText === "$500,000")).toMatchObject({ kind: "MONEY", rawText: "$500,000", normalizedValue: 500000 });
  });

  it("B10: the same OTHER rawText IS canonicalised when it occurs inside THIS item's authenticated span", async () => {
    const inv = await inventoryOf([wire("t", "(x) $25,000,000", [{ kind: "THRESHOLD", rawText: "$25,000,000" }])]);
    expect(valuesOf(inv, "(x) $25,000,000")).toEqual([{ kind: "MONEY", rawText: "$25,000,000", normalizedValue: 25000000, unit: "USD", declaredKind: "THRESHOLD" }]);
  });

  it("B11: canonicalizeFrozenQuantitativeValue refuses an outside-span location when itemSpan is supplied", () => {
    const moneyAt = OP.indexOf("$25,000,000");
    const feeAt = OP.indexOf("$500,000");
    const frozenOutside: QuantitativeValue = { kind: "OTHER", rawText: "$25,000,000", normalizedValue: 25000000, unit: "USD", charStart: moneyAt, charEnd: moneyAt + "$25,000,000".length };
    const feeSpan = { charStart: feeAt, charEnd: feeAt + "$500,000".length };
    // Outside the fee item's span: no lift
    expect(canonicalizeFrozenQuantitativeValue(frozenOutside, OP, feeSpan)).toEqual(frozenOutside);
    // Inside the money item's own span: lift
    const moneySpan = { charStart: moneyAt, charEnd: moneyAt + "$25,000,000".length };
    expect(canonicalizeFrozenQuantitativeValue(frozenOutside, OP, moneySpan)).toMatchObject({ kind: "MONEY", declaredKind: "OTHER", normalizedValue: 25000000 });
    // Without itemSpan (legacy replay of an already-authenticated in-span location): still lifts when char offsets match rawText
    expect(canonicalizeFrozenQuantitativeValue(frozenOutside, OP)).toMatchObject({ kind: "MONEY", declaredKind: "OTHER" });
  });

  it("B12: two items - figure in item A's span only - item B's OTHER declaration of that figure stays OTHER; item A canonicalises", async () => {
    const inv = await inventoryOf([
      wire("a", "(x) $25,000,000", [{ kind: "THRESHOLD", rawText: "$25,000,000" }]),
      wire("b", "the fee is $500,000", [{ kind: "THRESHOLD", rawText: "$25,000,000" }]),
    ]);
    expect(valuesOf(inv, "(x) $25,000,000").find((v) => v.rawText === "$25,000,000")).toMatchObject({ kind: "MONEY", declaredKind: "THRESHOLD" });
    expect(valuesOf(inv, "the fee is $500,000").find((v) => v.rawText === "$25,000,000")).toMatchObject({ kind: "OTHER", rawText: "$25,000,000" });
  });

  it("B13: outside-span location still records diagnostic char offsets (non-negative) but confers no kind authority", async () => {
    const inv = await inventoryOf([wire("f", "the fee is $500,000", [{ kind: "THRESHOLD", rawText: "$25,000,000" }])]);
    const item = inv.items.find((i) => i.sourceSpan.excerpt === "the fee is $500,000")!;
    const other = item.quantitativeValues.find((v) => v.rawText === "$25,000,000")!;
    expect(other.kind).toBe("OTHER");
    expect(other.charStart).toBeGreaterThanOrEqual(0);
    expect(other.charEnd).toBeGreaterThan(other.charStart);
    // Diagnostic location points at the figure elsewhere in the region, outside the item span
    expect(other.charStart).toBe(OP.indexOf("$25,000,000"));
    expect(other.charStart < item.sourceSpan.charStart || other.charEnd > item.sourceSpan.charEnd).toBe(true);
  });

  it("determinism and identity: canonicalisation is value-level; declaredKind never enters value equivalence", async () => {
    const a = await inventoryOf([wire("t", "(x) $25,000,000", [{ kind: "THRESHOLD", rawText: "$25,000,000" }])]);
    const b = await inventoryOf([wire("t", "(x) $25,000,000", [{ kind: "THRESHOLD", rawText: "$25,000,000" }])]);
    const c = await inventoryOf([wire("t", "(x) $25,000,000", [{ kind: "MONEY", rawText: "$25,000,000" }])]);
    expect(a.frozenContentHash).toBe(b.frozenContentHash);
    expect(a.items[0]!.inventoryItemId).toBe(c.items[0]!.inventoryItemId);
  });
});
