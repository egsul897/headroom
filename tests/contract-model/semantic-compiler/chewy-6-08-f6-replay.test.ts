/**
 * F-6 (Phase 3 Chewy remediation 3) - deterministic replay of the RECORDED
 * Chewy §6.08 compiler payload (tests/fixtures/unseen-packages/phase-3-
 * validation-chwy-paid-run/unit-6.08.json, rawModelOutput exactly as the
 * model emitted it in the paid run; zero model calls here). Before F-6 this
 * payload normalized to 8 composites collapsed to UNSUPPORTED and 2 IR
 * validation TYPE_ERRORs (docs/phase-3-remediation-f6/02a-chewy-replay-
 * before.json, reproduced byte-for-byte from the starting SHA). This test
 * pins the after-state. Nothing here is Chewy-specific in production code -
 * the same payload is only the most complete real-world sample of the
 * generic shapes exercised by normalize-f6-compositional.test.ts.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SubmitCompilationSchema } from "../../../lib/contract-model/compiler/semantic/wire-schema";
import { normalizeSubmission } from "../../../lib/contract-model/compiler/semantic/normalize";
import { validateCompilationUnit } from "../../../lib/contract-model/ir/validate";
import { inferType } from "../../../lib/contract-model/ir/type-check";
import { reconcileInventoryWithComposition } from "../../../lib/contract-model/compiler/semantic-accountability/reconciliation";
import { UNSUPPORTED_TYPE, type IRExpression, type IRRule } from "../../../lib/contract-model/ir/types";
import { testCompilerInput } from "./test-helpers";

const FILE = "tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run/unit-6.08.json";

function load() {
  const unit = JSON.parse(readFileSync(FILE, "utf-8"));
  const compile = unit.compile;
  const first = compile.rules[0];
  const submission = SubmitCompilationSchema.parse(compile.rawModelOutput);
  const input = testCompilerInput({ companyId: first.companyId, instrumentKey: first.instrumentKey, sourceDocumentId: first.sourceDocumentId, candidateRef: unit.candidateRef, sourceSectionRef: unit.unit.sectionRef, operativeLineage: first.operativeLineage ?? null, irSchemaVersion: first.irSchemaVersion, compilerAlgorithmVersion: first.compilerVersion });
  const normalized = normalizeSubmission(submission, input);
  return { unit, compile, normalized, input };
}

function byRef(rules: IRRule[], ref: string): IRRule {
  const r = rules.find((x) => x.sourceSectionRef === ref);
  if (!r) throw new Error(`no rule ${ref}`);
  return r;
}
function countUnsupported(e: IRExpression | null | undefined): number {
  if (!e) return 0;
  if (e.kind === "UNSUPPORTED") return 1;
  return JSON.stringify(e).split('"kind":"UNSUPPORTED"').length - 1;
}

describe("Chewy §6.08 recorded payload - F-6 deterministic replay (zero paid calls)", () => {
  const { compile, normalized, input } = load();

  it("the recorded payload is the paid-run payload (38 rules, 6 definitions, 11 model-emitted UNSUPPORTED leaves) and every model-emitted UNSUPPORTED leaf is still present after normalization", () => {
    expect(compile.rawModelOutput.rules).toHaveLength(38);
    expect(compile.rawModelOutput.definitions).toHaveLength(6);
    expect(JSON.stringify(compile.rawModelOutput).split('"kind":"UNSUPPORTED"').length - 1).toBe(11);
    const live = normalized.rules.reduce((n, r) => n + countUnsupported(r.capacityExpression?.kind === "UNLIMITED_CAPACITY" ? r.capacityExpression.gatedBy : r.capacityExpression) + r.conditions.reduce((m, c) => m + countUnsupported(c.expression), 0), 0) + normalized.definitions.reduce((n, d) => n + countUnsupported(d.calculationExpression), 0);
    expect(live).toBeGreaterThanOrEqual(11);
  });

  it("IR validation passes (before F-6: 2 TYPE_ERRORs on the ratio gates)", () => {
    const report = validateCompilationUnit({ irSchemaVersion: input.irSchemaVersion, companyId: input.companyId, instrumentKey: input.instrumentKey, rules: normalized.rules, definitions: normalized.definitions, sharedCapacities: normalized.sharedCapacities });
    expect(report.issues.filter((i) => i.kind === "TYPE_ERROR" || i.kind === "FALSE_COMPLETENESS")).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("ratio permission gates 6.08(b)(10)/(25): FLLR <= 2.00x OR ICR >= 1.75x, AND no Specified Event of Default - a fully typed BOOLEAN gate, COMPLETE", () => {
    for (const ref of ["6.08(b)(10)", "6.08(b)(25)"]) {
      const r = byRef(normalized.rules, ref);
      expect(r.capacityExpression?.kind).toBe("UNLIMITED_CAPACITY");
      const gate = (r.capacityExpression as { gatedBy: IRExpression }).gatedBy;
      expect(gate.kind).toBe("AND");
      expect(inferType(gate)).toBe("BOOLEAN");
      const text = JSON.stringify(gate);
      expect(text).toContain('"termName":"Specified Event of Default","companyId"');
      expect(text).toContain('"type":"BOOLEAN","termName":"Specified Event of Default"');
      expect(text).toContain('"type":"RATIO","termName":"First Lien Leverage Ratio as of the last day');
      expect(r.sufficiency).toBe("COMPLETE");
    }
  });

  it("6.08(b)(4): IF(IPO consummated ? greater-of $504M/70% : greater-of $252M/35%) + (equity proceeds - prior RPs) is a live, fully typed MONEY tree (before: collapsed because the IPO predicate defaulted to MONEY)", () => {
    const r = byRef(normalized.rules, "6.08(b)(4)");
    const cap = r.capacityExpression as IRExpression;
    expect(cap.kind).toBe("ADD");
    expect(inferType(cap)).toBe("MONEY");
    const branch = (cap as { operands: IRExpression[] }).operands[0]!;
    expect(branch.kind).toBe("IF");
    expect(JSON.stringify(branch)).toContain('"kind":"TRANSACTION_INPUT_REFERENCE","type":"BOOLEAN"');
    expect(JSON.stringify(cap)).toContain('"amount":504000000');
    expect(JSON.stringify(cap)).toContain('"amount":252000000');
  });

  it("6.08(b)(9): (6% of IPO proceeds + 7% of Market Capitalization) minus an honestly UNSUPPORTED usage deduction keeps its SUBTRACT with the deduction visible, stays PARTIAL and non-executable", () => {
    const r = byRef(normalized.rules, "6.08(b)(9)");
    const cap = r.capacityExpression as IRExpression;
    expect(cap.kind).toBe("SUBTRACT");
    expect((cap as { type: string }).type).toBe("MONEY");
    expect(inferType(cap)).toBe(UNSUPPORTED_TYPE);
    expect((cap as { right: IRExpression }).right.kind).toBe("UNSUPPORTED");
    expect(inferType((cap as { left: IRExpression }).left)).toBe("MONEY");
    expect(r.sufficiency).toBe("PARTIAL");
  });

  it("greater-of growers 6.08(b)(12)/(15)/(21)(iii): MAX($720M, 100% x Consolidated EBITDA) typed MONEY, and the same shape as the Threshold Amount definition's MAX($324M, 45% x EBITDA)", () => {
    const shape = (e: IRExpression): string => JSON.stringify(e, (k, v) => (k === "amount" || k === "value" || k === "metricName" || k === "exprId" || k === "provenance" || k === "inventoryItemIds" ? undefined : v));
    const ruleShapes = ["6.08(b)(12)", "6.08(b)(15)", "6.08(b)(21)(iii)"].map((ref) => shape(byRef(normalized.rules, ref).capacityExpression as IRExpression));
    const threshold = normalized.definitions.find((d) => d.termName === "Threshold Amount")!;
    expect(new Set([...ruleShapes, shape(threshold.calculationExpression!)]).size).toBe(1);
    expect(inferType(threshold.calculationExpression!)).toBe("MONEY");
  });

  it("Available Amount builder: the represented components (50% CNI, Retained ECF, EBITDA - 140% interest, $540M/75% EBITDA floor, retained proceeds, sale-leaseback proceeds) survive as live MONEY structure around the unsupported components; the definition remains AMBIGUOUS/non-executable", () => {
    const d = normalized.definitions.find((x) => x.termName === "Available Amount")!;
    const calc = d.calculationExpression as IRExpression;
    expect(calc.kind).toBe("SUBTRACT");
    expect((calc as { type: string }).type).toBe("MONEY");
    const left = (calc as { left: IRExpression }).left;
    expect(left.kind).toBe("ADD");
    const text = JSON.stringify(left);
    for (const marker of ['"amount":540000000', '"value":0.75', '"value":0.5', '"value":1.4', '"metricName":"Consolidated Net Income"', '"termName":"Retained Excess Cash Flow"', '"termName":"Sale and Leaseback Transaction Proceeds"']) expect(text).toContain(marker);
    expect(countUnsupported(calc)).toBeGreaterThanOrEqual(6); // every unsupported component the model declared is still visible
    expect(inferType(calc)).toBe(UNSUPPORTED_TYPE);
    expect(d.sufficiency).toBe("AMBIGUOUS");
  });

  it("shared-capacity definitions (Available Investment Capacity Amount / Available RP Capacity Amount) keep their SUBTRACT shape with the unsupported source-pool component in place, PARTIAL; the permissions that draw on them reference them by DEFINED_TERM_REFERENCE", () => {
    for (const term of ["Available Investment Capacity Amount", "Available RP Capacity Amount"]) {
      const d = normalized.definitions.find((x) => x.termName === term)!;
      expect(d.calculationExpression?.kind).toBe("SUBTRACT");
      expect(d.sufficiency).toBe("PARTIAL");
      expect(inferType(d.calculationExpression!)).toBe(UNSUPPORTED_TYPE);
    }
    expect(JSON.stringify(byRef(normalized.rules, "6.08(b)(26)").capacityExpression)).toContain('"termName":"Available Investment Capacity Amount"');
    expect(JSON.stringify(byRef(normalized.rules, "6.08(b)(27)").capacityExpression)).toContain('"termName":"Available RP Capacity Amount"');
  });

  it("lineage and provenance survive on kept composites and on their unsupported children", () => {
    const r = byRef(normalized.rules, "6.08(b)(9)");
    const cap = r.capacityExpression as IRExpression & { right: IRExpression };
    expect(cap.provenance?.sourceCitation).toBeTruthy();
    expect(cap.right.provenance?.sourceCitation).toBeTruthy();
    const rawRule = compile.rawModelOutput.rules.find((x: { sourceSectionRef: string }) => x.sourceSectionRef === "6.08(b)(9)");
    expect(r.inventoryItemIds).toEqual(rawRule.inventoryItemIds);
    expect(r.sourceSectionRef).toBe("6.08(b)(9)");
  });

  it("Pass C reconciliation against the frozen Pass A inventory: 20 critical items formerly consumed only into UNSUPPORTED structure are REPRESENTED with their stated values present in live IR; MISSING is unchanged (13); no item attached to an UNSUPPORTED node is credited", () => {
    const inventory = compile.frozenInventory;
    const acc = reconcileInventoryWithComposition({ inventory, composition: { rules: normalized.rules, definitions: normalized.definitions, sharedCapacities: normalized.sharedCapacities }, dispositions: [], sourceContextState: inventory.sourceContextState });
    expect(acc.counts.inventoried).toBe(288);
    expect(acc.counts.represented).toBe(273); // recorded: 253
    expect(acc.counts.unsupported).toBe(0); // recorded: 20
    expect(acc.counts.missingFromComposition).toBe(13); // unchanged - F-6 never invents representation for absent items
    expect(acc.counts.materialQuantitativeValuesMissing).toBe(8); // unchanged
    expect(acc.semanticallyComplete).toBe(false); // the unit is still not semantically complete
    const attachedToUnsupported = new Set<string>();
    const collect = (e: unknown): void => {
      if (!e || typeof e !== "object") return;
      const node = e as { kind?: string; inventoryItemIds?: string[] };
      if (node.kind === "UNSUPPORTED") for (const id of node.inventoryItemIds ?? []) attachedToUnsupported.add(id);
      for (const v of Object.values(node)) if (typeof v === "object") collect(v);
    };
    collect(normalized.rules);
    collect(normalized.definitions);
    for (const item of acc.items) if (attachedToUnsupported.has(item.inventoryItemId)) expect(item.disposition).not.toBe("REPRESENTED");
  });
});
