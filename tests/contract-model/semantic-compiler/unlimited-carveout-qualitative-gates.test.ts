/**
 * Unlimited carve-out qualitative-gate honesty.
 *
 * A property-character object class and an ordinary-course manner on an uncapped
 * permission are two gates. Each is conditionType UNSUPPORTED. gatedBy is their
 * AND. Sufficiency is PARTIAL. No new condition type. Not a certification.
 */
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeSubmission } from "../../../lib/contract-model/compiler/semantic/normalize";
import { buildFewShotExamplesBlock, buildSystemPrompt } from "../../../lib/contract-model/compiler/semantic/prompt";
import { applyUnlimitedCarveOutQualitativeGates, UNLIMITED_CARVEOUT_QUALITATIVE_GATE_REASON } from "../../../lib/contract-model/compiler/semantic/unlimited-carveout-honesty";
import { SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION } from "../../../lib/contract-model/compiler/semantic/types";
import type { SubmitCompilationInput, WireExpression, WireRule } from "../../../lib/contract-model/compiler/semantic/wire-schema";
import { validateRule } from "../../../lib/contract-model/ir/validate";
import { inferType } from "../../../lib/contract-model/ir/type-check";
import { UNSUPPORTED_TYPE, type IRExpression, type IRRule, type UnlimitedCapacity } from "../../../lib/contract-model/ir/types";
import { CONTRACT_CONDITION_TYPES } from "../../../lib/contract-model/types";
import { testCompilerInput } from "./test-helpers";

const SURPLUS = "the transfer of surplus or damaged equipment in the ordinary course of business";
const OBSOLETE = "(a)\nthe transfer of obsolete or worn out property in the ordinary course of business;\n";

function rule(partial: Partial<WireRule> & { localRef?: string }): WireRule {
  return {
    localRef: partial.localRef ?? "r1",
    sourceSectionRef: "9.07(a)",
    covenantFamily: "QUALITATIVE_NEGATIVE_COVENANTS",
    ruleType: "EXCEPTION",
    posture: "PERMISSION",
    action: "SELL_ASSET",
    entityScope: [],
    entityScopeExcluded: [],
    capacityExpression: { kind: "UNLIMITED_CAPACITY", gatedBy: null },
    conditions: [],
    exceptions: [],
    dependsOn: [],
    sufficiency: "COMPLETE",
    sufficiencyReasons: [],
    citation: "§9.07(a)",
    excerpt: null,
    ...partial,
  } as WireRule;
}

function compile(operative: string, rules: WireRule[]): IRRule[] {
  const submission: SubmitCompilationInput = { rules, definitions: [], sharedCapacities: [], irExtensionCandidates: [], overallNotes: [] };
  return normalizeSubmission(submission, testCompilerInput({ operativeSourceText: operative, sourceSectionRef: "9.07(a)" })).rules;
}

function gate(ruleOut: IRRule): UnlimitedCapacity {
  expect(ruleOut.capacityExpression?.kind).toBe("UNLIMITED_CAPACITY");
  return ruleOut.capacityExpression as UnlimitedCapacity;
}

function unsupportedOperands(expr: IRExpression): Extract<IRExpression, { kind: "UNSUPPORTED" }>[] {
  if (expr.kind === "UNSUPPORTED") return [expr];
  if (expr.kind === "AND" || expr.kind === "OR") return expr.operands.flatMap(unsupportedOperands);
  return [];
}

const folded = (objectPhrase: string) => ({
  conditionType: "ORDINARY_COURSE_OF_BUSINESS",
  expression: null,
  referencesDefinitionId: null,
  description: `The exception for the transfer of ${objectPhrase} applies only if the transfer occurs in the ordinary course of business`,
  citation: "§9.07(a)",
  excerpt: "in the ordinary course of business",
});

describe("unlimited carve-out dual qualitative gates", () => {
  it("splits a folded object class and ordinary course into UNSUPPORTED gates, AND, and PARTIAL", () => {
    const [out] = compile(SURPLUS, [rule({ conditions: [folded("surplus or damaged equipment")] })]);
    expect(out!.sufficiency).toBe("PARTIAL");
    expect(out!.sufficiency).not.toBe("COMPLETE");
    expect(out!.sufficiencyReasons.join("\n")).toContain(UNLIMITED_CARVEOUT_QUALITATIVE_GATE_REASON);
    expect(out!.conditions.map((c) => c.conditionType)).toEqual(["UNSUPPORTED", "UNSUPPORTED"]);
    expect(out!.conditions.every((c) => c.expression === null)).toBe(true);
    const excerpts = out!.conditions.map((c) => c.provenance?.excerpt);
    expect(excerpts).toContain("in the ordinary course of business");
    expect(excerpts).toContain("surplus or damaged equipment");
    const gatedBy = gate(out!).gatedBy;
    expect(gatedBy?.kind).toBe("AND");
    expect(inferType(gatedBy!)).toBe(UNSUPPORTED_TYPE);
    const leaves = unsupportedOperands(gatedBy!);
    expect(leaves.map((leaf) => leaf.sourceEvidence).sort()).toEqual(["in the ordinary course of business", "surplus or damaged equipment"]);
    for (const leaf of leaves) {
      expect(leaf.kind).toBe("UNSUPPORTED");
      expect(leaf.type).toBeNull();
      expect(leaf.requiredReview).toBe(true);
    }
    const report = validateRule(out!);
    expect(report.issues.filter((issue) => issue.kind === "FALSE_COMPLETENESS")).toEqual([]);
    expect(out!.conditions.some((c) => c.conditionType === "PURPOSE" || c.conditionType === "ENTITY_TYPE" || c.conditionType === "SECURITY_SCOPE")).toBe(false);
  });

  it("uses the same residual for a different property-character phrase, including a line break", () => {
    const [out] = compile(OBSOLETE, [rule({ conditions: [folded("obsolete or worn out property")] })]);
    expect(out!.sufficiency).toBe("PARTIAL");
    expect(out!.conditions.map((c) => c.provenance?.excerpt)).toEqual(expect.arrayContaining(["obsolete or worn out property", "in the ordinary course of business"]));
    expect(gate(out!).gatedBy?.kind).toBe("AND");
  });

  it("does not invent an object-class gate for a bare noun or a defined term", () => {
    const bare = compile("the transfer of property in the ordinary course of business", [rule({ conditions: [folded("property")] })])[0]!;
    expect(bare.sufficiency).toBe("COMPLETE");
    expect(bare.conditions).toHaveLength(1);
    expect(gate(bare).gatedBy).toBeNull();

    const definedTerm = compile("the transfer of Inventory in the ordinary course of business", [rule({ conditions: [folded("Inventory")] })])[0]!;
    expect(definedTerm.sufficiency).toBe("COMPLETE");
    expect(definedTerm.conditions).toHaveLength(1);
    expect(gate(definedTerm).gatedBy).toBeNull();
  });

  it("leaves a dollar basket and a ratio gate without an object class untouched", () => {
    const money = compile(SURPLUS, [rule({ capacityExpression: { kind: "MONEY", amount: 1_000_000, currency: "USD", citation: "§9.07(a)" }, conditions: [] })])[0]!;
    expect(money.capacityExpression?.kind).toBe("MONEY");
    expect(money.sufficiency).toBe("COMPLETE");
    expect(money.sufficiencyReasons.join("\n")).not.toContain("QUALITATIVE_GATE_NO_CLOSED_CONDITION_TYPE");

    const ratioGate: WireExpression = { kind: "COMPARE", left: { kind: "METRIC_REFERENCE", metricName: "Leverage Ratio", valueType: "RATIO" }, operator: "LTE", right: { kind: "RATIO", value: 4 } };
    const ratio = compile("The Company may transfer property without limitation so long as the Leverage Ratio does not exceed 4.00 to 1.00.", [
      rule({ capacityExpression: { kind: "UNLIMITED_CAPACITY", gatedBy: ratioGate }, conditions: [] }),
    ])[0]!;
    expect(ratio.sufficiency).toBe("COMPLETE");
    expect(gate(ratio).gatedBy?.kind).toBe("COMPARE");
  });

  it("keeps a quantitative gate and ANDs the two qualitative gates beside it", () => {
    const ratioGate: WireExpression = { kind: "COMPARE", left: { kind: "METRIC_REFERENCE", metricName: "Leverage Ratio", valueType: "RATIO" }, operator: "LTE", right: { kind: "RATIO", value: 4 } };
    const [out] = compile(`${SURPLUS} so long as the Leverage Ratio does not exceed 4.00 to 1.00.`, [
      rule({ capacityExpression: { kind: "UNLIMITED_CAPACITY", gatedBy: ratioGate }, conditions: [folded("surplus or damaged equipment")] }),
    ]);
    expect(out!.sufficiency).toBe("PARTIAL");
    const gatedBy = gate(out!).gatedBy;
    expect(gatedBy?.kind).toBe("AND");
    if (gatedBy?.kind !== "AND") return;
    expect(gatedBy.operands.some((operand) => operand.kind === "COMPARE")).toBe(true);
    expect(unsupportedOperands(gatedBy)).toHaveLength(2);
    expect(inferType(gatedBy)).toBe(UNSUPPORTED_TYPE);
  });

  it("does not duplicate gates that are already first-class, and does not certify them", () => {
    const honestConditions = [
      { conditionType: "UNSUPPORTED", expression: null, referencesDefinitionId: null, description: "object", citation: "§9.07(a)", excerpt: "surplus or damaged equipment" },
      { conditionType: "UNSUPPORTED", expression: null, referencesDefinitionId: null, description: "manner", citation: "§9.07(a)", excerpt: "in the ordinary course of business" },
    ];
    const gatedBy: WireExpression = {
      kind: "AND",
      operands: [
        { kind: "UNSUPPORTED", semanticDescription: "object", reason: "no closed type", sourceEvidence: "surplus or damaged equipment", citation: "§9.07(a)", excerpt: "surplus or damaged equipment" },
        { kind: "UNSUPPORTED", semanticDescription: "manner", reason: "no closed type", sourceEvidence: "in the ordinary course of business", citation: "§9.07(a)", excerpt: "in the ordinary course of business" },
      ],
    };
    const [out] = compile(SURPLUS, [rule({ sufficiency: "COMPLETE", capacityExpression: { kind: "UNLIMITED_CAPACITY", gatedBy }, conditions: honestConditions })]);
    expect(out!.conditions).toHaveLength(2);
    const composed = gate(out!).gatedBy;
    expect(composed?.kind).toBe("AND");
    if (composed?.kind !== "AND") return;
    expect(composed.operands).toHaveLength(2);
    expect(out!.sufficiency).toBe("PARTIAL");
    expect(out!.sufficiencyReasons.join("\n")).not.toMatch(/\bCERTIFIED\b/);
  });

  it("preserves a licensed condition beside the two residual gates", () => {
    const [out] = compile(SURPLUS, [rule({
      conditions: [
        folded("surplus or damaged equipment"),
        { conditionType: "NO_DEFAULT", expression: null, referencesDefinitionId: null, description: "no Default", citation: "§9.07(a)", excerpt: null },
      ],
    })]);
    expect(out!.conditions.map((c) => c.conditionType)).toEqual(["UNSUPPORTED", "NO_DEFAULT", "UNSUPPORTED"]);
    expect(out!.sufficiency).toBe("PARTIAL");
  });

  it("fails closed instead of copying one object class onto every unlimited sibling", () => {
    const rules = compile(SURPLUS, [
      rule({ localRef: "a", conditions: [{ conditionType: "UNSUPPORTED", expression: null, referencesDefinitionId: null, description: "only if ordinary course", citation: "§9.07(a)", excerpt: "in the ordinary course of business" }] }),
      rule({ localRef: "b", sourceSectionRef: "9.07(b)", conditions: [{ conditionType: "UNSUPPORTED", expression: null, referencesDefinitionId: null, description: "only if ordinary course", citation: "§9.07(b)", excerpt: "in the ordinary course of business" }] }),
    ]);
    for (const out of rules) {
      expect(gate(out).gatedBy).toBeNull();
      expect(out.conditions).toHaveLength(1);
      expect(out.conditions[0]?.provenance?.excerpt).toBe("in the ordinary course of business");
      expect(out.sufficiency).toBe("COMPLETE");
      expect(out.sufficiencyReasons.join("\n")).not.toContain("QUALITATIVE_GATE_NO_CLOSED_CONDITION_TYPE");
    }
  });

  it("attributes each clause to the rule whose anchor names that object class", () => {
    const operative = `${SURPLUS};\nthe transfer of scrap or idle assets in the ordinary course of trade;`;
    const bind = (excerpt: string) => ({ documentId: "sem-test-doc", sourceNodeKey: null, sourceCitation: "§9.07", excerpt });
    const base = {
      operativeText: operative,
      scopePath: "rule[r]",
      soleUnlimited: false,
      capacity: { kind: "UNLIMITED_CAPACITY" as const, type: "CAPACITY" as const, gatedBy: null },
      conditions: [],
      bindExcerpt: bind,
    };
    const surplus = applyUnlimitedCarveOutQualitativeGates({ ...base, anchors: ["surplus or damaged equipment"] });
    const scrap = applyUnlimitedCarveOutQualitativeGates({ ...base, anchors: ["scrap or idle assets"] });
    expect(surplus.applied).toBe(true);
    expect(scrap.applied).toBe(true);
    expect(surplus.conditions.map((c) => c.provenance?.excerpt)).toContain("surplus or damaged equipment");
    expect(surplus.conditions.map((c) => c.provenance?.excerpt)).not.toContain("scrap or idle assets");
    expect(scrap.conditions.map((c) => c.provenance?.excerpt)).toContain("scrap or idle assets");
    expect(scrap.conditions.map((c) => c.provenance?.excerpt)).not.toContain("surplus or damaged equipment");
    expect(surplus.capacity && surplus.capacity.kind === "UNLIMITED_CAPACITY" && surplus.capacity.gatedBy?.kind).toBe("AND");
    const again = applyUnlimitedCarveOutQualitativeGates({ ...base, anchors: ["surplus or damaged equipment"], capacity: surplus.capacity, conditions: surplus.conditions });
    expect(again.applied).toBe(false);
    expect(again.conditions).toBe(surplus.conditions);
  });

  it("narrows an exact manner gate whose description only restates the object class", () => {
    const [out] = compile(SURPLUS, [rule({ conditions: [folded("surplus or damaged equipment")] })]);
    const manner = out!.conditions.find((condition) => condition.provenance?.excerpt === "in the ordinary course of business");
    const objectGate = out!.conditions.find((condition) => condition.provenance?.excerpt === "surplus or damaged equipment");
    expect(manner?.description).toBe("The unlimited carve-out applies only when it is in the ordinary course of business. This manner test has no licensed computable condition type.");
    expect(manner?.description).not.toContain("surplus or damaged equipment");
    expect(objectGate?.description).toContain("surplus or damaged equipment");
  });

  it("keeps an independent qualifier that shares a description with both gates", () => {
    const [out] = compile(SURPLUS, [rule({
      conditions: [{
        conditionType: "UNSUPPORTED",
        expression: null,
        referencesDefinitionId: null,
        description: "The exception for the transfer of surplus or damaged equipment applies only if the transfer occurs in the ordinary course of business and no Default has occurred",
        citation: "§9.07(a)",
        excerpt: "in the ordinary course of business",
      }],
    })]);
    const manner = out!.conditions.find((condition) => condition.provenance?.excerpt === "in the ordinary course of business");
    expect(manner?.description).toContain("no Default has occurred");
    expect(manner?.description).toContain("surplus or damaged equipment");
    expect(out!.conditions.some((condition) => condition.provenance?.excerpt === "surplus or damaged equipment")).toBe(true);
  });

  it("teaches the emitter the residual shape and does not add a condition type", () => {
    const prompt = buildSystemPrompt({ irSchemaVersion: "x", toolPolicyVersion: "y" });
    const examples = buildFewShotExamplesBlock();
    expect(prompt).toMatch(/UNLIMITED QUALITATIVE CARVE-OUTS/);
    expect(prompt).toMatch(/conditionType UNSUPPORTED/);
    expect(prompt).toMatch(/gatedBy is an AND/);
    expect(prompt).toMatch(/Sufficiency is PARTIAL/);
    expect(prompt).not.toMatch(/CONMED|Chewy/);
    expect(examples).toContain("surplus or damaged equipment");
    expect(examples).toContain('"sufficiency": "PARTIAL"');
    expect(examples).not.toMatch(/CONMED|Chewy/);
    expect(CONTRACT_CONDITION_TYPES).toContain("UNSUPPORTED");
    expect(CONTRACT_CONDITION_TYPES).not.toContain("ORDINARY_COURSE_OF_BUSINESS" as never);
    expect(SEMANTIC_COMPILER_ALGORITHM_VERSION).toBe("semantic-accountability-compiler.v11");
    expect(SEMANTIC_COMPILER_PROMPT_VERSION).toBe("semantic-accountability-compiler-prompt.v9");
    const src = fs.readFileSync("lib/contract-model/compiler/semantic/unlimited-carveout-honesty.ts", "utf8");
    expect(src).not.toMatch(/CONMED|Chewy|OBSOLETE_OR_WORN_OUT|PROPERTY_CHARACTER/);
    expect(src).not.toMatch(/enum /);
  });
});
