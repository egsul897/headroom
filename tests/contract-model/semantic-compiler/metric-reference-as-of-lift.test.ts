/**
 * DEFECT D of the §7.5(j) live-exposed deterministic closure - METRIC_REFERENCE asOfDate silent-loss closure
 * (semantic-accountability-compiler.v10).
 *
 * Live defect: the model dated a metric in place (`{kind: METRIC_REFERENCE, metricName, asOfDate: "date of such
 * Disposition"}`); the generic wire contract accepts `asOfDate` on every node, the IR metric reference has no such field,
 * and v9 built the reference without it - no warning, no UNSUPPORTED node, no AS_OF. The selector survived only in
 * provenance. v10 lifts it deterministically into the existing first-class AS_OF shape and records a DIAGNOSTIC.
 */
import { describe, expect, it } from "vitest";
import { normalizeSubmission } from "../../../lib/contract-model/compiler/semantic/normalize";
import { SEMANTIC_COMPILER_ALGORITHM_VERSION } from "../../../lib/contract-model/compiler/semantic/types";
import type { SubmitCompilationInput, WireExpression, WireRule } from "../../../lib/contract-model/compiler/semantic/wire-schema";
import { buildSemanticVerificationProjection } from "../../../lib/contract-model/compiler/semantic-verification/projection";
import { reconcileInventoryWithComposition } from "../../../lib/contract-model/compiler/semantic-accountability/reconciliation";
import type { IRExpression, IRRule } from "../../../lib/contract-model/ir/types";
import { testCompilerInput } from "./test-helpers";

const OP = "the Borrower may dispose of property yielding net proceeds of less than the greater of (x) $25,000,000 and (y) 1.5% of Consolidated Total Assets (measured on the date of such Disposition)";
function submission(gatedBy: WireExpression, extra: Partial<WireRule> = {}): SubmitCompilationInput {
  return {
    rules: [{ localRef: "r1", sourceSectionRef: "Section 9.01", covenantFamily: "QUALITATIVE_NEGATIVE_COVENANTS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: "SELL_ASSET", entityScope: ["BORROWER"], entityScopeExcluded: [], capacityExpression: { kind: "UNLIMITED_CAPACITY", gatedBy } as never, conditions: [], exceptions: [], dependsOn: [], sufficiency: "COMPLETE", sufficiencyReasons: [], citation: "§9.01", excerpt: OP, ...extra } as never],
    definitions: [], sharedCapacities: [], irExtensionCandidates: [], overallNotes: [],
  } as never;
}
const input = () => testCompilerInput({ operativeSourceText: OP, sourceSectionRef: "9.01" });
const cta = (asOfDate?: string, valueType = "MONEY"): WireExpression => ({ kind: "METRIC_REFERENCE", metricName: "Consolidated Total Assets", valueType, citation: "§9.01", excerpt: "Consolidated Total Assets", ...(asOfDate !== undefined ? { asOfDate } : {}) } as never);
const compare = (right: WireExpression): WireExpression => ({ kind: "COMPARE", left: { kind: "METRIC_REFERENCE", metricName: "Net Proceeds" }, operator: "LT", right: { kind: "MAX", operands: [{ kind: "MONEY", amount: 25000000, currency: "USD", citation: "§9.01", excerpt: "$25,000,000" }, { kind: "MULTIPLY", operands: [{ kind: "PERCENT", value: 0.015, citation: "§9.01", excerpt: "1.5%" }, right] }] } } as never);
const gateOf = (rule: IRRule) => (rule.capacityExpression as { gatedBy: IRExpression }).gatedBy;
const ctaNodeOf = (rule: IRRule): IRExpression => ((gateOf(rule) as { right: { operands: IRExpression[] } }).right.operands[1] as { operands: IRExpression[] }).operands[1]!;
const run = (right: WireExpression) => { const n = normalizeSubmission(submission(compare(right)), input()); return { n, rule: n.rules[0]!, diagnostics: n.diagnostics.map((d) => d.message), limits: n.rules[0]!.sufficiencyReasons ?? [] }; };

describe("defect D - METRIC_REFERENCE asOfDate is lifted into AS_OF, never dropped silently", () => {
  it("version: compiler v10", () => {
    expect(SEMANTIC_COMPILER_ALGORITHM_VERSION).toBe("semantic-accountability-compiler.v11");
  });

  it("D1: a METRIC_REFERENCE without asOfDate is unchanged", () => {
    const { rule, diagnostics } = run(cta());
    expect(ctaNodeOf(rule)).toMatchObject({ kind: "METRIC_REFERENCE", type: "MONEY", metricName: "Consolidated Total Assets", resolvedDefinitionId: null });
    expect(diagnostics.filter((m) => m.startsWith("METRIC_REFERENCE_AS_OF_LIFTED"))).toEqual([]);
  });

  it("D2: asOfDate 'date of such Disposition' -> AS_OF wrapper around the METRIC_REFERENCE", () => {
    const { rule } = run(cta("date of such Disposition"));
    const node = ctaNodeOf(rule) as { kind: string; asOfDate: unknown; value: IRExpression };
    expect(node.kind).toBe("AS_OF");
    expect(node.asOfDate).toBe("date of such Disposition");
    expect(node.value).toMatchObject({ kind: "METRIC_REFERENCE", metricName: "Consolidated Total Assets", type: "MONEY" });
  });

  it("D3: a relative selector is preserved exactly", () => {
    const sel = "last day of the most recently ended fiscal quarter for which financial statements are available";
    const { rule } = run(cta(sel));
    expect((ctaNodeOf(rule) as { asOfDate: unknown }).asOfDate).toBe(sel);
    // harmless trimming only
    expect((ctaNodeOf(run(cta(`  ${sel}  `)).rule) as { asOfDate: unknown }).asOfDate).toBe(sel);
  });

  it("D4: a whitespace-only asOfDate invents no timing", () => {
    const { rule, diagnostics } = run(cta("   "));
    expect(ctaNodeOf(rule).kind).toBe("METRIC_REFERENCE");
    expect(diagnostics.filter((m) => m.startsWith("METRIC_REFERENCE_AS_OF_LIFTED"))).toEqual([]);
  });

  it("D5: an explicit wire AS_OF takes the existing AS_OF path and is never double-wrapped", () => {
    const explicit: WireExpression = { kind: "AS_OF", operand: cta(), asOfDate: "date of such Disposition" } as never;
    const { rule, diagnostics } = run(explicit);
    const node = ctaNodeOf(rule) as { kind: string; asOfDate: unknown; value: { kind: string } };
    expect(node.kind).toBe("AS_OF");
    expect(node.value.kind).toBe("METRIC_REFERENCE");
    expect(diagnostics.filter((m) => m.startsWith("METRIC_REFERENCE_AS_OF_LIFTED"))).toEqual([]);
    // an explicit AS_OF whose operand ALSO carries asOfDate: the inner lift happens once and the outer wrapper stays - two selectors are the model's claim, both visible, nothing merged by guess
    const nested: WireExpression = { kind: "AS_OF", operand: cta("fiscal quarter end"), asOfDate: "date of such Disposition" } as never;
    const inner = (ctaNodeOf(run(nested).rule) as { value: { kind: string; asOfDate: unknown } }).value;
    expect(inner).toMatchObject({ kind: "AS_OF", asOfDate: "fiscal quarter end" });
  });

  it("D6: the lifted AS_OF retains the metric's own value type (MONEY, RATIO, NUMBER)", () => {
    expect((ctaNodeOf(run(cta("date of such Disposition", "MONEY")).rule) as { type: string }).type).toBe("MONEY");
    const ratioGate: WireExpression = { kind: "COMPARE", left: { kind: "METRIC_REFERENCE", metricName: "Leverage Ratio", valueType: "RATIO", asOfDate: "pro forma" }, operator: "LTE", right: { kind: "RATIO", value: 3.5 } } as never;
    const left = (gateOf(normalizeSubmission(submission(ratioGate), input()).rules[0]!) as { left: { kind: string; type: string; value: { type: string } } }).left;
    expect([left.kind, left.type, left.value.type]).toEqual(["AS_OF", "RATIO", "RATIO"]);
  });

  it("D7: expression identity is deterministic across repeated normalization", () => {
    const a = run(cta("date of such Disposition")).rule;
    const b = run(cta("date of such Disposition")).rule;
    expect(JSON.stringify(ctaNodeOf(a))).toBe(JSON.stringify(ctaNodeOf(b)));
    expect((ctaNodeOf(a) as { exprId: string }).exprId).toBe((ctaNodeOf(b) as { exprId: string }).exprId);
    expect((ctaNodeOf(a) as { exprId: string }).exprId).not.toBe((ctaNodeOf(run(cta("a different selector")).rule) as { exprId: string }).exprId);
  });

  it("D8: the verification projection carries the AS_OF semantics", () => {
    const { n } = run(cta("date of such Disposition"));
    const projected = JSON.stringify(buildSemanticVerificationProjection({ rules: n.rules, definitions: n.definitions, sharedCapacities: n.sharedCapacities }));
    expect(projected).toContain("\"AS_OF\"");
    expect(projected).toContain("date of such Disposition");
  });

  it("D9: Pass C sees the structured timing value as TEXT at the AS_OF node", () => {
    const { n } = run(cta("date of such Disposition"));
    const inventory = { candidateRef: "c", inventoryStatus: "INVENTORY_OK", inventoryStatusReason: "", unaccountedSource: [], uninventoriedValues: [], items: [{ inventoryItemId: "inv-item:aaaaaaaaaaaaaaaaaaaaaaaa", semanticRole: "FORMULA_COMPONENT", materiality: "MATERIAL", quantitativeValues: [{ kind: "OTHER", rawText: "date of such Disposition", normalizedValue: null, unit: null, charStart: 0, charEnd: 0 }], referencedTerms: [], referencedSections: [], sourceSpan: { regionId: "operative", charStart: 0, charEnd: 1 } }] } as never;
    const rec = reconcileInventoryWithComposition({ inventory, composition: { rules: n.rules, definitions: [], sharedCapacities: [] } as never, dispositions: [], sourceContextState: "COMPLETE_LOCAL_SOURCE" });
    expect(rec.items[0]!.quantitative[0]!.disposition).toBe("VALUE_PRESENT_IN_IR");
    expect(rec.items[0]!.quantitative[0]!.irPaths.some((p) => p.endsWith(".asOfDate"))).toBe(true);
  });

  it("D10: the lift is audited (METRIC_REFERENCE_AS_OF_LIFTED, DIAGNOSTIC class) and costs no sufficiency - nothing accepted by the wire path disappears silently", () => {
    const { rule, diagnostics, limits, n } = run(cta("date of such Disposition"));
    const lifted = diagnostics.filter((m) => m.startsWith("METRIC_REFERENCE_AS_OF_LIFTED"));
    expect(lifted).toHaveLength(1);
    expect(lifted[0]).toContain("date of such Disposition");
    expect(n.warnings.find((w) => w.message.startsWith("METRIC_REFERENCE_AS_OF_LIFTED"))?.kind).toBe("DIAGNOSTIC");
    expect(rule.sufficiency).toBe("COMPLETE");
    expect(limits.some((r) => r.includes("AS_OF"))).toBe(false);
    // the selector string is present in the IR structure, not only in provenance
    const withoutProvenance = JSON.stringify(rule, (k, v) => (k === "provenance" ? undefined : v));
    expect(withoutProvenance).toContain("date of such Disposition");
  });
});
