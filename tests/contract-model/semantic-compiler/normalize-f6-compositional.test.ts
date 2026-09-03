/**
 * F-6 (Phase 3 Chewy remediation 3) - compositional expression
 * representation through the tolerant-wire -> strict-IR path. Every
 * scenario is synthetic and every construct is generic: greater-of growers,
 * ratio-OR-ratio gates, builder baskets, shared capacity pools referenced by
 * several permissions. The anti-enumeration pairs (A-D) prove the SAME
 * structure results for two unrelated agreements' drafting - production
 * code never branches on a term name, an amount, or a section reference.
 */
import { describe, expect, it } from "vitest";
import { normalizeSubmission } from "../../../lib/contract-model/compiler/semantic/normalize";
import { validateCompilationUnit } from "../../../lib/contract-model/ir/validate";
import { inferType } from "../../../lib/contract-model/ir/type-check";
import { reconcileInventoryWithComposition } from "../../../lib/contract-model/compiler/semantic-accountability/reconciliation";
import type { FrozenSemanticInventory, SemanticInventoryItem } from "../../../lib/contract-model/compiler/semantic-accountability/types";
import type { SubmitCompilationInput, WireDefinition, WireExpression, WireRule, WireSharedCapacity } from "../../../lib/contract-model/compiler/semantic/wire-schema";
import { UNSUPPORTED_TYPE, type IRCapacityExpression, type IRExpression } from "../../../lib/contract-model/ir/types";
import { testCompilerInput } from "./test-helpers";

function rule(r: Partial<WireRule>): WireRule {
  return { localRef: "r1", sourceSectionRef: "6.08(b)(1)", covenantFamily: "RESTRICTED_PAYMENTS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: "MAKE_RESTRICTED_PAYMENT", entityScope: [], entityScopeExcluded: [], capacityExpression: null, conditions: [], exceptions: [], dependsOn: [], sufficiency: "COMPLETE", sufficiencyReasons: [], citation: null, excerpt: null, ...r };
}
function definition(d: Partial<WireDefinition>): WireDefinition {
  return { localRef: "d1", termName: "Some Term", covenantFamily: "DEFINITIONS_CALCULATION_RULES", calculationExpression: null, dependsOnTerms: [], sufficiency: "COMPLETE", sufficiencyReasons: [], citation: null, excerpt: null, ...d };
}
function submission(parts: Partial<SubmitCompilationInput>): SubmitCompilationInput {
  return { rules: [], definitions: [], sharedCapacities: [], irExtensionCandidates: [], overallNotes: [], ...parts };
}
const money = (amount: number): WireExpression => ({ kind: "MONEY", amount });
const pct = (value: number): WireExpression => ({ kind: "PERCENT", value });
const ratio = (value: number): WireExpression => ({ kind: "RATIO", value });
const metric = (metricName: string, valueType?: string): WireExpression => ({ kind: "METRIC_REFERENCE", metricName, ...(valueType ? { valueType } : {}) });
const term = (termName: string, valueType?: string): WireExpression => ({ kind: "DEFINED_TERM_REFERENCE", termName, ...(valueType ? { valueType } : {}) });
const txin = (inputName: string, valueType?: string): WireExpression => ({ kind: "TRANSACTION_INPUT_REFERENCE", inputName, ...(valueType ? { valueType } : {}) });
const unsupported = (why: string, inventoryItemIds?: string[]): WireExpression => ({ kind: "UNSUPPORTED", reason: why, semanticDescription: why, sourceEvidence: why, ...(inventoryItemIds ? { inventoryItemIds } : {}) });
const greaterOf = (amount: number, fraction: number, metricName: string): WireExpression => ({ kind: "MAX", operands: [money(amount), { kind: "MULTIPLY", operands: [pct(fraction), metric(metricName)] }] });
const cmp = (left: WireExpression, operator: string, right: WireExpression): WireExpression => ({ kind: "COMPARE", left, operator, right });

/** Structural shape of an IR tree with every literal value, name and identity stripped - two agreements' drafting must produce the same shape. */
function shape(e: IRExpression | IRCapacityExpression | null | undefined): string {
  return JSON.stringify(e, (k, v) => (["amount", "value", "metricName", "termName", "inputName", "exprId", "provenance", "inventoryItemIds", "ruleId", "sharedCapId", "companyId", "instrumentKey", "resolvedDefinitionId", "currency", "sourceEvidence", "semanticDescription", "reason"].includes(k) ? undefined : v));
}
function cap(rules: { capacityExpression: IRCapacityExpression | null }[], i = 0): IRExpression {
  return rules[i]!.capacityExpression as IRExpression;
}

describe("F-6 slot typing - a reference with no valueType takes the dimension its slot fixes; an explicit type is never overridden", () => {
  it("BOOLEAN slots: NOT / AND / OR / IF-condition / UNLIMITED gate / EVENT trigger / rule condition all type an untyped reference BOOLEAN", () => {
    const { rules } = normalizeSubmission(
      submission({
        rules: [
          rule({ localRef: "r1", capacityExpression: { kind: "UNLIMITED_CAPACITY", gatedBy: { kind: "AND", operands: [{ kind: "NOT", operand: term("Specified Event of Default") }, { kind: "OR", operands: [term("Payment Conditions"), txin("the transaction is a permitted refinancing")] }] } } }),
          rule({ localRef: "r2", sourceSectionRef: "6.08(b)(2)", capacityExpression: { kind: "IF", condition: txin("an initial public offering has been consummated"), then: money(10), else: money(5) } }),
          rule({ localRef: "r3", sourceSectionRef: "6.08(b)(3)", capacityExpression: { kind: "UNLIMITED_CAPACITY", gatedBy: term("Ratio Conditions") } }),
          rule({ localRef: "r4", sourceSectionRef: "6.08(b)(4)", capacityExpression: { kind: "UNLIMITED_CAPACITY", gatedBy: { kind: "EVENT_ACTIVE", eventDescription: "a qualifying acquisition", triggerCondition: term("Material Acquisition Election") } } }),
          rule({ localRef: "r5", sourceSectionRef: "6.08(b)(5)", capacityExpression: money(1), conditions: [{ conditionType: "OTHER_RULE_SATISFIED", expression: term("Payment Conditions"), referencesDefinitionId: null, description: "", citation: null, excerpt: null }] }),
        ],
      }),
      testCompilerInput()
    );
    const gate = (r: number): IRExpression => (rules[r]!.capacityExpression as { gatedBy: IRExpression }).gatedBy;
    expect(inferType(gate(0))).toBe("BOOLEAN");
    expect(inferType(cap(rules, 1))).toBe("MONEY");
    expect(inferType(gate(2))).toBe("BOOLEAN");
    expect(inferType(gate(3))).toBe("BOOLEAN");
    expect(inferType(rules[4]!.conditions[0]!.expression!)).toBe("BOOLEAN");
    expect(rules.map((r) => r.sufficiency)).toEqual(["COMPLETE", "COMPLETE", "COMPLETE", "COMPLETE", "COMPLETE"]);
  });

  it("sibling typing: COMPARE / ADD / MAX / SUBTRACT / IF branches give an untyped reference the typed sibling's dimension (RATIO here), including through a nested composite", () => {
    const { rules } = normalizeSubmission(
      submission({
        rules: [
          rule({ localRef: "r1", capacityExpression: { kind: "UNLIMITED_CAPACITY", gatedBy: cmp(term("Leverage Ratio as of the last Test Period"), "LTE", ratio(2)) } }),
          rule({ localRef: "r2", sourceSectionRef: "x2", capacityExpression: { kind: "UNLIMITED_CAPACITY", gatedBy: cmp(metric("First Lien Leverage Ratio", "RATIO"), "LTE", term("Closing Date Leverage Ratio")) } }),
          rule({ localRef: "r3", sourceSectionRef: "x3", capacityExpression: { kind: "UNLIMITED_CAPACITY", gatedBy: cmp(metric("Leverage Ratio", "RATIO"), "GT", { kind: "ADD", operands: [term("Base Ratio"), term("Step-Up")] }) } }),
          rule({ localRef: "r4", sourceSectionRef: "x4", capacityExpression: { kind: "UNLIMITED_CAPACITY", gatedBy: cmp({ kind: "MAX", operands: [ratio(3), term("Applicable Ratio")] }, "GTE", { kind: "IF", condition: term("Election Made"), then: ratio(1), else: term("Fallback Ratio") }) } }),
          rule({ localRef: "r5", sourceSectionRef: "x5", capacityExpression: { kind: "SUBTRACT", left: { kind: "NUMBER", value: 4 }, right: term("Adjustment Count") } }),
        ],
      }),
      testCompilerInput()
    );
    const gate = (r: number): IRExpression => (rules[r]!.capacityExpression as { gatedBy: IRExpression }).gatedBy;
    for (const r of [0, 1, 2, 3]) expect(inferType(gate(r))).toBe("BOOLEAN");
    expect(JSON.stringify(gate(0))).toContain('"type":"RATIO","termName":"Leverage Ratio as of the last Test Period"');
    expect(JSON.stringify(gate(2))).toContain('"type":"RATIO","termName":"Base Ratio"');
    expect(JSON.stringify(gate(3))).toContain('"type":"RATIO","termName":"Fallback Ratio"');
    expect(JSON.stringify(gate(3))).toContain('"type":"BOOLEAN","termName":"Election Made"');
    expect(inferType(cap(rules, 4))).toBe("NUMBER");
    expect(JSON.stringify(cap(rules, 4))).toContain('"type":"NUMBER","termName":"Adjustment Count"');
  });

  it("no slot fixes a dimension -> the documented MONEY default still applies (unchanged behavior)", () => {
    const { rules } = normalizeSubmission(submission({ rules: [rule({ capacityExpression: { kind: "ADD", operands: [term("Retained Declined Proceeds"), term("Retained Asset Sale Proceeds")] } })] }), testCompilerInput());
    expect(inferType(cap(rules))).toBe("MONEY");
  });

  it("an EXPLICIT type is never overridden: a MONEY-declared term under NOT is a genuine conflict and collapses to UNSUPPORTED (with the attempt preserved), never silently retyped BOOLEAN", () => {
    const { rules } = normalizeSubmission(submission({ rules: [rule({ capacityExpression: { kind: "UNLIMITED_CAPACITY", gatedBy: { kind: "NOT", operand: term("Consolidated EBITDA", "MONEY") } } })] }), testCompilerInput());
    const gate = (rules[0]!.capacityExpression as { gatedBy: IRExpression }).gatedBy;
    expect(gate.kind).toBe("UNSUPPORTED");
    expect((gate as { attemptedStructure?: IRExpression }).attemptedStructure?.kind).toBe("NOT");
    expect(rules[0]!.sufficiency).toBe("PARTIAL");
    expect(rules[0]!.sufficiencyReasons.join(" ")).toMatch(/NOT operand must be BOOLEAN/);
  });

  it("two typed siblings that DISAGREE fix nothing: the untyped reference falls back to the default and the composite is rejected as a conflict, never patched", () => {
    const { rules } = normalizeSubmission(submission({ rules: [rule({ capacityExpression: { kind: "MAX", operands: [money(1), ratio(2), term("Something")] } })] }), testCompilerInput());
    expect(cap(rules).kind).toBe("UNSUPPORTED");
    expect(rules[0]!.sufficiencyReasons.join(" ")).toMatch(/mixed types are not comparable/);
  });

  it("a METRIC_REFERENCE cannot be BOOLEAN by IR type, so a metric placed in a BOOLEAN slot without a type is rejected honestly rather than coerced", () => {
    const { rules } = normalizeSubmission(submission({ rules: [rule({ capacityExpression: { kind: "UNLIMITED_CAPACITY", gatedBy: { kind: "NOT", operand: metric("Default Exists") } } })] }), testCompilerInput());
    expect((rules[0]!.capacityExpression as { gatedBy: IRExpression }).gatedBy.kind).toBe("UNSUPPORTED");
  });
});

describe("F-6 partial composites - unsupported children stay in place, siblings stay live, nothing becomes executable", () => {
  it("SUBTRACT(typed, UNSUPPORTED): kept, typed MONEY, inferType UNSUPPORTED, rule downgraded to PARTIAL with the reason recorded", () => {
    const { rules } = normalizeSubmission(submission({ rules: [rule({ capacityExpression: { kind: "SUBTRACT", left: greaterOf(50_000_000, 0.1, "Total Assets"), right: unsupported("amounts applied elsewhere") } })] }), testCompilerInput());
    const c = cap(rules) as IRExpression & { left: IRExpression; right: IRExpression; type: string };
    expect(c.kind).toBe("SUBTRACT");
    expect(c.type).toBe("MONEY");
    expect(c.right.kind).toBe("UNSUPPORTED");
    expect(inferType(c.left)).toBe("MONEY");
    expect(inferType(c)).toBe(UNSUPPORTED_TYPE);
    expect(rules[0]!.sufficiency).toBe("PARTIAL");
    expect(rules[0]!.sufficiencyReasons.join(" ")).toMatch(/keeps its structure with at least one UNSUPPORTED operand/);
  });

  it("a composite with NO typed operand still collapses (no dimension is guessed) but keeps its attempt; nested inside a typed parent, the parent survives", () => {
    const { definitions } = normalizeSubmission(submission({ definitions: [definition({ calculationExpression: { kind: "ADD", operands: [money(1), { kind: "MULTIPLY", operands: [pct(1), unsupported("net cash proceeds of equity issuances")] }, { kind: "ADD", operands: [unsupported("a"), unsupported("b")] }] } })] }), testCompilerInput());
    const calc = definitions[0]!.calculationExpression as IRExpression & { operands: IRExpression[] };
    expect(calc.kind).toBe("ADD");
    expect(calc.operands[1]!.kind).toBe("UNSUPPORTED");
    expect((calc.operands[1] as { attemptedStructure?: IRExpression }).attemptedStructure?.kind).toBe("MULTIPLY");
    expect(calc.operands[2]!.kind).toBe("UNSUPPORTED");
    expect(definitions[0]!.sufficiency).toBe("PARTIAL");
  });

  it("lineage and provenance: the kept composite, its typed children and its unsupported child each retain their own inventoryItemIds and citations", () => {
    const { rules } = normalizeSubmission(
      submission({ rules: [rule({ citation: "§6.08(b)(9)", inventoryItemIds: ["inv-rule"], capacityExpression: { kind: "SUBTRACT", inventoryItemIds: ["inv-whole"], citation: "§6.08(b)(9)", left: { ...greaterOf(1, 0.5, "M"), inventoryItemIds: ["inv-left"], citation: "§6.08(b)(9)(i)" }, right: unsupported("usage", ["inv-right"]) } })] }),
      testCompilerInput()
    );
    const c = cap(rules) as IRExpression & { left: IRExpression; right: IRExpression };
    expect(c.inventoryItemIds).toEqual(["inv-whole"]);
    expect(c.left.inventoryItemIds).toEqual(["inv-left"]);
    expect(c.right.inventoryItemIds).toEqual(["inv-right"]);
    expect(c.provenance?.sourceCitation).toBe("§6.08(b)(9)");
    expect(c.left.provenance?.sourceCitation).toBe("§6.08(b)(9)(i)");
    expect(c.right.provenance?.sourceCitation).toBe("§6.08(b)(9)"); // inherited from the nearest ancestor citation
    expect(rules[0]!.inventoryItemIds).toEqual(["inv-rule"]);
    expect(rules[0]!.sourceSectionRef).toBe("6.08(b)(1)");
  });

  it("Pass C: items on the kept composite and its typed children become REPRESENTED; the item on the unsupported child stays UNSUPPORTED; a value present only inside the unsupported part is never credited", () => {
    const item = (id: string, values: { rawText: string; kind: "MONEY" | "PERCENT" }[] = []): SemanticInventoryItem => ({ inventoryItemId: id, sourceSpan: { regionId: "operative", documentId: "doc", sourceNodeId: null, sectionRef: "6.08(b)(1)", sourceCitation: "§6.08(b)(1)", charStart: 0, charEnd: 10, excerpt: id }, semanticRole: "FORMULA_COMPONENT", proposition: id, quantitativeValues: values.map((v) => ({ kind: v.kind, rawText: v.rawText, normalizedValue: v.kind === "MONEY" ? 50_000_000 : 0.1, unit: v.kind === "MONEY" ? "USD" : "%", charStart: 0, charEnd: 5 })), referencedTerms: [], referencedSections: [], parentItemId: null, relatedItemIds: [], materiality: "CRITICAL", ambiguity: "NONE", ambiguityReason: null, operative: "OPERATIVE", detectionMethod: "MODEL" } as unknown as SemanticInventoryItem);
    const inventory = { candidateRef: "candidate-1", items: [item("inv-whole"), item("inv-left", [{ rawText: "$50,000,000", kind: "MONEY" }, { rawText: "10%", kind: "PERCENT" }]), item("inv-right"), item("inv-both")], uninventoriedValues: [], unaccountedSource: [], sourceCoverage: { regionsConsidered: [], countsByDisposition: {}, charsByDisposition: {}, accountedCharFraction: 1, externallyAccountedRegions: [] }, gapReinventory: null, inventoryStatus: "INVENTORY_OK", inventoryStatusReason: "", rejectedUnverifiableItems: 0, rejectedDuplicateItems: 0, sourceContextState: "COMPLETE_LOCAL_SOURCE", frozenContentHash: "h", frozenAt: "t", algorithmVersion: "v", promptVersion: "p", provider: "test", model: "test", telemetryCostUsd: null } as unknown as FrozenSemanticInventory;
    const { rules, definitions, sharedCapacities } = normalizeSubmission(
      submission({ rules: [rule({ capacityExpression: { kind: "SUBTRACT", inventoryItemIds: ["inv-whole"], left: { ...greaterOf(50_000_000, 0.1, "Total Assets"), inventoryItemIds: ["inv-left"] }, right: { ...unsupported("usage", ["inv-right", "inv-both"]), inventoryItemIds: ["inv-right", "inv-both"] } }, inventoryItemIds: ["inv-both"] })] }),
      testCompilerInput()
    );
    const acc = reconcileInventoryWithComposition({ inventory, composition: { rules, definitions, sharedCapacities }, dispositions: [], sourceContextState: "COMPLETE_LOCAL_SOURCE" });
    const disposition = (id: string) => acc.items.find((i) => i.inventoryItemId === id)!.disposition;
    expect(disposition("inv-whole")).toBe("REPRESENTED");
    expect(disposition("inv-left")).toBe("REPRESENTED");
    expect(disposition("inv-right")).toBe("UNSUPPORTED");
    expect(disposition("inv-both")).toBe("UNSUPPORTED"); // the most specific lineage (an UNSUPPORTED node) is never outvoted by a broader rule-level claim
    expect(acc.counts.represented).toBe(2);
    expect(acc.counts.unsupported).toBe(2);
    expect(acc.counts.missingFromComposition).toBe(0); // every item is accounted for - two as REPRESENTED, two as explicitly UNSUPPORTED (review), none silently
  });
});

describe("F-6 anti-enumeration - unrelated agreements produce identical structure", () => {
  it("A: greater of $720M and 100% of EBITDA vs greater of $50M and 12.5% of Total Assets", () => {
    const build = (amount: number, fraction: number, name: string) => normalizeSubmission(submission({ rules: [rule({ capacityExpression: greaterOf(amount, fraction, name) })] }), testCompilerInput()).rules[0]!;
    const a = build(720_000_000, 1.0, "Consolidated EBITDA");
    const b = build(50_000_000, 0.125, "Consolidated Total Assets");
    expect(shape(a.capacityExpression)).toBe(shape(b.capacityExpression));
    expect(inferType(a.capacityExpression as IRExpression)).toBe("MONEY");
    expect(a.sufficiency).toBe("COMPLETE");
    expect(b.sufficiency).toBe("COMPLETE");
  });

  it("B: FLLR <= 2.00x OR ICR >= 1.75x vs Secured Leverage Ratio <= 3.25x OR Fixed Charge Coverage Ratio >= 2.00x (with untyped 'as of the last Test Period' comparators)", () => {
    const build = (m1: string, t1: number, m2: string, t2: number, alt: string) =>
      normalizeSubmission(
        submission({ rules: [rule({ capacityExpression: { kind: "UNLIMITED_CAPACITY", gatedBy: { kind: "AND", operands: [{ kind: "OR", operands: [{ kind: "OR", operands: [cmp(metric(m1, "RATIO"), "LTE", ratio(t1)), cmp(metric(m1, "RATIO"), "LTE", term(`${m1} ${alt}`))] }, cmp(metric(m2, "RATIO"), "GTE", ratio(t2))] }, { kind: "NOT", operand: term("Specified Event of Default") }] } } })] }),
        testCompilerInput()
      ).rules[0]!;
    const a = build("First Lien Leverage Ratio", 2.0, "Interest Coverage Ratio", 1.75, "as of the last day of the most recent Test Period");
    const b = build("Secured Leverage Ratio", 3.25, "Fixed Charge Coverage Ratio", 2.0, "on the Closing Date");
    expect(shape(a.capacityExpression)).toBe(shape(b.capacityExpression));
    expect(inferType((a.capacityExpression as { gatedBy: IRExpression }).gatedBy)).toBe("BOOLEAN");
    expect(a.sufficiency).toBe("COMPLETE");
  });

  it("C: builder starting at $540M plus retained amounts vs builder starting at $100M plus 50% of cumulative excess cash flow - one honestly unsupported addend each", () => {
    const build = (start: number, fraction: number, base: string, retained: string) =>
      normalizeSubmission(
        submission({ definitions: [definition({ termName: `${base} Builder`, calculationExpression: { kind: "SUBTRACT", left: { kind: "ADD", operands: [money(start), { kind: "MULTIPLY", operands: [pct(fraction), metric(base)] }, term(retained), unsupported("proceeds of dispositions not required to be applied")] }, right: { kind: "SUM", operands: [txin("amounts previously drawn under this builder")] } } })] }),
        testCompilerInput()
      ).definitions[0]!;
    const a = build(540_000_000, 0.5, "Consolidated Net Income", "Retained Excess Cash Flow");
    const b = build(100_000_000, 0.5, "Cumulative Excess Cash Flow", "Retained Declined Proceeds");
    expect(shape(a.calculationExpression)).toBe(shape(b.calculationExpression));
    expect(a.calculationExpression?.kind).toBe("SUBTRACT");
    expect(inferType(a.calculationExpression!)).toBe(UNSUPPORTED_TYPE);
    expect(a.sufficiency).toBe("PARTIAL");
    expect(b.sufficiency).toBe("PARTIAL");
  });

  it("D: one shared capacity pool referenced by three permissions with different section refs - pool, additions, usage deductions, member references, gate condition and cross-rule dependency are all representable with existing primitives", () => {
    const build = (poolName: string, refs: [string, string, string], amount: number, fraction: number, base: string) => {
      const members: WireRule[] = refs.map((ref, i) => rule({ localRef: `m${i + 1}`, sourceSectionRef: ref, capacityExpression: { kind: "SUBTRACT", left: term(poolName), right: { kind: "LEDGER_USAGE_REFERENCE", sharedCapRef: "pool" } }, dependsOn: i === 0 ? [] : [{ relationshipType: "SHARES_CAPACITY_WITH", targetRef: "m1", description: "shares the pool" }] }));
      const pool: WireSharedCapacity = { localRef: "pool", description: poolName, capExpression: { kind: "ADD", operands: [greaterOf(amount, fraction, base), unsupported("retained ECF contributed to the pool")] }, memberRefs: ["m1", "m2", "m3"], citation: null, excerpt: null };
      const normalized = normalizeSubmission(submission({ rules: members, sharedCapacities: [pool], definitions: [definition({ termName: poolName, calculationExpression: { kind: "UNLIMITED_CAPACITY" as string, gatedBy: term("Payment Conditions") } as WireExpression })] }), testCompilerInput());
      return normalized;
    };
    const a = build("General RP Basket", ["6.08(b)(12)", "6.04(m)", "6.01(b)(20)"], 720_000_000, 1.0, "Consolidated EBITDA");
    const b = build("Investments and Payments Pool", ["7.02(k)", "7.06(h)", "7.03(t)"], 25_000_000, 0.05, "Total Assets");
    for (const n of [a, b]) {
      expect(n.sharedCapacities).toHaveLength(1);
      expect(n.sharedCapacities[0]!.memberRuleIds).toEqual(n.rules.map((r) => r.ruleId));
      expect(n.sharedCapacities[0]!.capExpression.kind).toBe("ADD"); // partial pool: the grower survives, the unsupported contribution stays visible
      expect(inferType(n.sharedCapacities[0]!.capExpression as IRExpression)).toBe(UNSUPPORTED_TYPE);
      for (const r of n.rules) {
        expect(inferType(r.capacityExpression as IRExpression)).toBe("MONEY");
        expect(JSON.stringify(r.capacityExpression)).toContain(`"sharedCapId":"${n.sharedCapacities[0]!.sharedCapId}"`);
      }
      expect(n.rules[1]!.dependsOn[0]!.targetRuleId).toBe(n.rules[0]!.ruleId);
      const report = validateCompilationUnit({ irSchemaVersion: "headroom-covenant-ir.v1", companyId: n.rules[0]!.companyId, instrumentKey: n.rules[0]!.instrumentKey, rules: n.rules, definitions: n.definitions, sharedCapacities: n.sharedCapacities });
      expect(report.issues.filter((i) => i.kind !== "DANGLING_REFERENCE")).toEqual([]);
    }
    expect(a.rules.map((r) => shape(r.capacityExpression))).toEqual(b.rules.map((r) => shape(r.capacityExpression)));
    expect(shape(a.sharedCapacities[0]!.capExpression)).toBe(shape(b.sharedCapacities[0]!.capExpression));
    expect(new Set(a.rules.map((r) => r.ruleId)).size).toBe(3); // three distinct permissions, three distinct identities
  });
});

describe("F-6 trust safety - nothing the repair added weakens rejection", () => {
  it("invalid dimensional arithmetic from the wire is still rejected (MONEY + RATIO, MONEY x MONEY, COMPARE MONEY vs RATIO)", () => {
    const { rules } = normalizeSubmission(
      submission({
        rules: [
          rule({ localRef: "r1", capacityExpression: { kind: "ADD", operands: [money(1), ratio(2)] } }),
          rule({ localRef: "r2", sourceSectionRef: "x", capacityExpression: { kind: "MULTIPLY", operands: [money(1), money(2)] } }),
          rule({ localRef: "r3", sourceSectionRef: "y", capacityExpression: { kind: "UNLIMITED_CAPACITY", gatedBy: cmp(money(1), "LT", ratio(2)) } }),
        ],
      }),
      testCompilerInput()
    );
    expect(cap(rules, 0).kind).toBe("UNSUPPORTED");
    expect(cap(rules, 1).kind).toBe("UNSUPPORTED");
    expect((rules[2]!.capacityExpression as { gatedBy: IRExpression }).gatedBy.kind).toBe("UNSUPPORTED");
    expect(rules.map((r) => r.sufficiency)).toEqual(["PARTIAL", "PARTIAL", "PARTIAL"]);
  });

  it("an unknown expression kind stays UNSUPPORTED; a missing child stays an explicit UNSUPPORTED node; an unresolvable rule reference stays explicit", () => {
    const { rules } = normalizeSubmission(
      submission({
        rules: [
          rule({ localRef: "r1", capacityExpression: { kind: "GREATER_OF_720M_OR_100_PERCENT_EBITDA" } }),
          rule({ localRef: "r2", sourceSectionRef: "x", capacityExpression: { kind: "SUBTRACT", left: money(1) } }),
          rule({ localRef: "r3", sourceSectionRef: "y", capacityExpression: { kind: "RULE_REFERENCE", ruleRef: "some-other-section" } }),
        ],
      }),
      testCompilerInput()
    );
    expect(cap(rules, 0).kind).toBe("UNSUPPORTED");
    expect(cap(rules, 1).kind).toBe("UNSUPPORTED");
    expect(cap(rules, 2).kind).toBe("UNSUPPORTED");
    expect(rules.every((r) => r.sufficiency === "PARTIAL")).toBe(true);
  });

  it("false completeness cannot be introduced: a COMPLETE claim over any partial tree is downgraded by normalization, and a hand-asserted COMPLETE is caught by validation", () => {
    const { rules, definitions, sharedCapacities } = normalizeSubmission(submission({ rules: [rule({ sufficiency: "COMPLETE", capacityExpression: { kind: "MAX", operands: [money(1), unsupported("x")] } })] }), testCompilerInput());
    expect(rules[0]!.sufficiency).toBe("PARTIAL");
    const forged = { ...rules[0]!, sufficiency: "COMPLETE" as const };
    const report = validateCompilationUnit({ irSchemaVersion: "headroom-covenant-ir.v1", companyId: forged.companyId, instrumentKey: forged.instrumentKey, rules: [forged], definitions, sharedCapacities });
    expect(report.ok).toBe(false);
    expect(report.issues.map((i) => i.kind)).toContain("FALSE_COMPLETENESS");
  });

  it("missing runtime inputs are not unsupported semantics: a fully typed symbolic tree over metrics with no financial values is COMPLETE and executable-shaped", () => {
    const { rules } = normalizeSubmission(submission({ rules: [rule({ capacityExpression: { kind: "UNLIMITED_CAPACITY", gatedBy: { kind: "OR", operands: [cmp(metric("First Lien Leverage Ratio", "RATIO"), "LTE", ratio(2)), cmp(metric("Interest Coverage Ratio", "RATIO"), "GTE", ratio(1.75))] } } })] }), testCompilerInput());
    expect(inferType((rules[0]!.capacityExpression as { gatedBy: IRExpression }).gatedBy)).toBe("BOOLEAN");
    expect(rules[0]!.sufficiency).toBe("COMPLETE");
  });
});
