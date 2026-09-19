/**
 * PHASE 4B §38 - the input contract proved against Phase-3 IR that already exists in this repo.
 *
 * Nothing here names a metric, a term, a covenant form or an agreement. Every fact supplied to the
 * runtime is MANUFACTURED FROM THE MANIFEST the production code itself produced: the test reads the
 * dependency records, builds one FinancialInput per record, and hands the resulting snapshot back.
 * That is the whole point of the manifest - a consumer learns what to supply without guessing.
 *
 * Sources: the frozen paid compile result (read-only, selected by expression SHAPE) and the
 * hand-authored real-shape IR fixtures. No provider call, no ingestion, no parsing.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { IRDefinition, IRRule, IRValueType } from "@/lib/contract-model/ir/types";
import type { RuntimeValueType } from "@/lib/contract-model/runtime/types";
import { evaluateExpression } from "@/lib/contract-model/runtime/evaluate-expression";
import { rationalFromString } from "@/lib/contract-model/runtime/decimal";
import type { RuntimeValue } from "@/lib/contract-model/runtime/types";
import {
  buildFinancialDependencyManifest,
  buildRuleDependencyManifest,
  snapshotInputResolver,
  type DependencyRecord,
  type FinancialDependencyManifest,
  type FinancialInput,
  type FinancialSnapshot,
} from "@/lib/contract-model/runtime/input";
import {
  ALL_FIXTURE_DEFINITIONS,
  FIXTURE_3_GREATER_OF_FIXED_OR_EBITDA_PCT,
  FIXTURE_4_GREATER_OF_FIXED_OR_TOTAL_ASSETS_PCT,
  FIXTURE_5_MAINTENANCE_LEVERAGE_RATIO,
  FIXTURE_7_STEPPED_LEVERAGE_SCHEDULE,
  FIXTURE_14_BUILDER_AVAILABLE_AMOUNT,
} from "../../../fixtures/ir-examples/real-covenant-shapes";

const FROZEN = "tests/fixtures/unseen-packages/phase-3-final-601-precision-revalidation/compile-result.json";
const frozen = JSON.parse(readFileSync(FROZEN, "utf8")) as { rules: IRRule[]; definitions?: IRDefinition[] };
const capKind = (x: IRRule) => x.capacityExpression?.kind ?? null;

const CO = "fixture-company";
const INST = "fixture-instrument";
const AS_OF = "2026-06-30";

/** One synthetic value per declared type. Values are arbitrary test numbers, never contract figures. */
/** The IR declares a wider type set than the runtime carries; anything outside it is not a value. */
function runtimeTypeOf(t: IRValueType | "CAPACITY"): RuntimeValueType {
  const known: RuntimeValueType[] = ["MONEY", "NUMBER", "PERCENT", "RATIO", "BOOLEAN", "DATE", "ENTITY_SET"];
  return (known as string[]).includes(t) ? (t as RuntimeValueType) : "MONEY";
}

function valueFor(type: IRValueType | "CAPACITY", n: number): RuntimeValue {
  switch (type) {
    case "MONEY": return { type: "MONEY", amount: rationalFromString(String(1_000_000 * (n + 1))), currency: "USD", lineage: { exprId: null, inputKeys: [] } };
    case "RATIO": return { type: "RATIO", value: rationalFromString(String(1 + n / 10)), lineage: { exprId: null, inputKeys: [] } };
    case "PERCENT": return { type: "PERCENT", fraction: rationalFromString("0.1"), lineage: { exprId: null, inputKeys: [] } };
    case "NUMBER": return { type: "NUMBER", value: rationalFromString(String(n + 1)), lineage: { exprId: null, inputKeys: [] } };
    case "BOOLEAN": return { type: "BOOLEAN", value: true, lineage: { exprId: null, inputKeys: [] } };
    case "DATE": return { type: "DATE", isoDate: AS_OF, lineage: { exprId: null, inputKeys: [] } };
    default: return { type: "MONEY", amount: rationalFromString("0"), currency: "USD", lineage: { exprId: null, inputKeys: [] } };
  }
}

/**
 * Turn a manifest into a snapshot. The identity of every input is COPIED from the dependency record,
 * so nothing is matched by name similarity, array order or a wildcard period.
 */
function snapshotFromManifest(manifest: FinancialDependencyManifest, opts: { only?: (d: DependencyRecord) => boolean; snapshotId?: string } = {}): FinancialSnapshot {
  const picked = manifest.dependencies.filter(opts.only ?? (() => true));
  const inputs: FinancialInput[] = picked.map((d, i) => ({
    identity: {
      companyId: d.companyId ?? CO,
      scope: d.instrumentKey ? { kind: "INSTRUMENT_LEVEL", instrumentKey: d.instrumentKey } : { kind: "COMPANY_LEVEL", instrumentApplicability: { kind: "ALL_INSTRUMENTS" } },
      inputKind: d.inputKind,
      key: d.key,
      identityStrength: d.identityStrength,
      period: d.period,
      asOf: d.asOf,
      valueType: runtimeTypeOf(d.expectedType),
      currency: d.expectedType === "MONEY" ? "USD" : null,
    },
    value: valueFor(d.expectedType, i),
    sourceVersion: "synthetic-v1",
  }));
  return {
    snapshotId: opts.snapshotId ?? "snap-1",
    version: "1",
    companyId: CO,
    asOf: AS_OF,
    reportingPeriod: "synthetic-period",
    status: "APPROVED",
    supersedesSnapshotId: null,
    provenance: { source: "synthetic test snapshot", sourceVersion: "synthetic-v1" },
    review: { reviewedBy: "test", reviewedAt: "2026-07-01T00:00:00Z", approvalRef: "test-approval" },
    inputs,
  };
}

function runRule(rule: IRRule, snapshots: FinancialSnapshot[], definitions: readonly IRDefinition[] = []) {
  const resolver = snapshotInputResolver({ snapshots, definitions, companyId: CO, instrumentKey: INST });
  return evaluateExpression({ expression: rule.capacityExpression!, inputs: resolver, context: { companyId: CO, instrumentKey: INST, asOf: AS_OF, ruleId: rule.ruleId } });
}

/** Rewrite a rule's company/instrument onto the test identities without touching its expression shape. */
function retarget<T extends IRRule | IRDefinition>(obj: T): T {
  const json = JSON.stringify(obj).replace(new RegExp(`"${obj.companyId}"`, "g"), `"${CO}"`).replace(new RegExp(`"${obj.instrumentKey}"`, "g"), `"${INST}"`);
  return JSON.parse(json) as T;
}

describe("Phase 4B against hand-authored real-shape Phase-3 IR", () => {
  it("a percentage-of-metric basket: the manifest names the one fact, the snapshot built from it resolves, and the result is exact", () => {
    const rule = retarget(FIXTURE_3_GREATER_OF_FIXED_OR_EBITDA_PCT);
    const manifest = buildRuleDependencyManifest(rule, { companyId: CO, instrumentKey: INST, asOf: AS_OF });
    expect(manifest.dependencies.length).toBe(1);
    const dep = manifest.dependencies[0]!;
    expect(dep.inputKind).toBe("METRIC");
    expect(dep.expectedType).toBe("MONEY");
    expect(dep.status).toBe("REQUIRED");
    // The flat operand of the MAX needs no input, so a safe lower bound exists without this fact.
    expect(dep.safeBoundAvailableWithoutThis).toBe(true);

    const empty = runRule(rule, [snapshotFromManifest(manifest, { only: () => false })]);
    expect(empty.status).toBe("NEEDS_INPUT");
    expect(empty.bounds?.knownLowerBound).toMatchObject({ type: "MONEY" });

    const ok = runRule(rule, [snapshotFromManifest(manifest)]);
    expect(ok.status).toBe("EXECUTABLE");
    expect(ok.value?.type).toBe("MONEY");
    const used = ok.provenance.inputsUsed;
    expect(used.length).toBe(1);
    expect(used[0]!.provenance.snapshotId).toBe("snap-1");
    expect(used[0]!.provenance.snapshotStatus).toBe("APPROVED");
    expect(used[0]!.provenance.reliedOnNonApprovedSnapshot).toBe(false);
    expect(used[0]!.provenance.approvalRef).toBe("test-approval");
    expect(ok.provenance.inputContractVersion).toBe("financial-input-contract.v1");
  });

  it("the same expression shape over a different metric resolves identically - the contract is not per-metric", () => {
    const a = retarget(FIXTURE_3_GREATER_OF_FIXED_OR_EBITDA_PCT);
    const b = retarget(FIXTURE_4_GREATER_OF_FIXED_OR_TOTAL_ASSETS_PCT);
    const ma = buildRuleDependencyManifest(a, { companyId: CO, instrumentKey: INST, asOf: AS_OF });
    const mb = buildRuleDependencyManifest(b, { companyId: CO, instrumentKey: INST, asOf: AS_OF });
    expect(ma.dependencies[0]!.key).not.toBe(mb.dependencies[0]!.key);
    const { key: _ka, displayNameFromContract: _da, exprIds: _ea, ...restA } = ma.dependencies[0]!;
    const { key: _kb, displayNameFromContract: _db, exprIds: _eb, ...restB } = mb.dependencies[0]!;
    expect(restA).toEqual(restB);
    expect(runRule(a, [snapshotFromManifest(ma)]).status).toBe("EXECUTABLE");
    expect(runRule(b, [snapshotFromManifest(mb)]).status).toBe("EXECUTABLE");
  });

  it("a maintenance ratio test declares a RATIO dependency and a MONEY fact of the same name does not satisfy it", () => {
    const rule = retarget(FIXTURE_5_MAINTENANCE_LEVERAGE_RATIO);
    const manifest = buildRuleDependencyManifest(rule, { companyId: CO, instrumentKey: INST, asOf: AS_OF });
    expect(manifest.dependencies.length).toBe(1);
    expect(manifest.dependencies[0]!.expectedType).toBe("RATIO");

    const good = snapshotFromManifest(manifest);
    expect(runRule(rule, [good]).status).toBe("EXECUTABLE");

    const wrongType: FinancialSnapshot = {
      ...good,
      inputs: good.inputs.map((i) => ({ ...i, identity: { ...i.identity, valueType: "MONEY" as RuntimeValueType, currency: "USD" }, value: valueFor("MONEY", 0) })),
    };
    const bad = runRule(rule, [wrongType]);
    expect(bad.status).toBe("ERROR");
    expect(bad.diagnostics.some((d) => d.code === "INPUT_TYPE_CONFLICT")).toBe(true);
  });

  it("a stepped schedule selects its case by the evaluation as-of and still needs the ratio fact", () => {
    const rule = retarget(FIXTURE_7_STEPPED_LEVERAGE_SCHEDULE);
    const manifest = buildRuleDependencyManifest(rule, { companyId: CO, instrumentKey: INST, asOf: AS_OF });
    expect(manifest.dependencies.some((d) => d.expectedType === "RATIO")).toBe(true);
    const missing = runRule(rule, [snapshotFromManifest(manifest, { only: () => false })]);
    expect(missing.status).toBe("NEEDS_INPUT");
    const supplied = runRule(rule, [snapshotFromManifest(manifest)]);
    expect(["EXECUTABLE", "NEEDS_INPUT"]).toContain(supplied.status);
    // Whatever the schedule selects, no fact was ever chosen by array order: the same snapshot in a
    // different input order gives a byte-identical answer.
    const s = snapshotFromManifest(manifest);
    const reversed: FinancialSnapshot = { ...s, inputs: [...s.inputs].reverse() };
    expect(JSON.stringify(runRule(rule, [reversed]))).toBe(JSON.stringify(supplied));
  });

  it("a definition-expanded expression lists the definition's own dependencies, attributed to the definition", () => {
    const def = retarget(FIXTURE_14_BUILDER_AVAILABLE_AMOUNT);
    const definitions = ALL_FIXTURE_DEFINITIONS.map(retarget);
    const manifest = buildFinancialDependencyManifest({ expression: def.calculationExpression!, definitions, companyId: CO, instrumentKey: INST, asOf: AS_OF });
    expect(manifest.dependencies.length).toBeGreaterThan(0);
    expect(manifest.unsupportedNodes.length).toBeGreaterThan(0); // the PARTIAL clause stays unsupported
    const resolver = snapshotInputResolver({ snapshots: [snapshotFromManifest(manifest)], definitions, companyId: CO, instrumentKey: INST });
    const res = evaluateExpression({ expression: def.calculationExpression!, inputs: resolver, context: { companyId: CO, instrumentKey: INST, asOf: AS_OF, definitionId: def.definitionId } });
    // A Phase-3 UNSUPPORTED operand stays unsupported no matter how complete the financial input is.
    expect(res.status).toBe("UNSUPPORTED");
  });
});

describe("Phase 4B against the frozen paid compile result (selected by shape)", () => {
  const pctOfMetric = frozen.rules.filter((x) => capKind(x) === "MAX" && (x.capacityExpression as { operands: { kind: string }[] }).operands.some((o) => o.kind === "MULTIPLY") && x.sufficiency === "COMPLETE")[0]!;
  const gated = frozen.rules.filter((x) => capKind(x) === "UNLIMITED_CAPACITY" && (x.capacityExpression as { gatedBy: unknown }).gatedBy !== null && x.sufficiency === "COMPLETE")[0]!;

  it("the frozen tree is the one this phase froze", () => {
    expect(frozen.rules.length).toBeGreaterThan(0);
    expect(pctOfMetric).toBeTruthy();
    expect(gated).toBeTruthy();
  });

  it("a frozen percentage-of-metric basket is satisfied only by a fact carrying its exact identity", () => {
    const rule = retarget(pctOfMetric);
    const manifest = buildRuleDependencyManifest(rule, { companyId: CO, instrumentKey: INST, asOf: AS_OF });
    expect(manifest.dependencies.length).toBeGreaterThan(0);
    expect(runRule(rule, [snapshotFromManifest(manifest)]).status).toBe("EXECUTABLE");

    // Same value, same key, wrong company: unusable, and it is MISSING, not silently accepted.
    const s = snapshotFromManifest(manifest);
    const otherCompany: FinancialSnapshot = { ...s, inputs: s.inputs.map((i) => ({ ...i, identity: { ...i.identity, companyId: "some-other-company" } })) };
    expect(runRule(rule, [otherCompany]).status).toBe("NEEDS_INPUT");

    // Same value, same key, a period the contract never asked for: also unusable.
    const otherPeriod: FinancialSnapshot = { ...s, inputs: s.inputs.map((i) => ({ ...i, identity: { ...i.identity, period: { kind: "VERBATIM_CONTRACT_PERIOD_KEY" as const, key: "a period the rule never names" } } })) };
    expect(runRule(rule, [otherPeriod]).status).toBe("NEEDS_INPUT");
  });

  it("a frozen gated capacity produces a manifest whose hash is stable across rebuilds", () => {
    const rule = retarget(gated);
    const a = buildRuleDependencyManifest(rule, { companyId: CO, instrumentKey: INST, asOf: AS_OF });
    const b = buildRuleDependencyManifest(rule, { companyId: CO, instrumentKey: INST, asOf: AS_OF });
    expect(a.manifestHash).toBe(b.manifestHash);
    expect(a.contractVersion).toBe("financial-input-contract.v1");
  });

  it("every frozen rule with a capacity expression yields a manifest, and no manifest invents a dependency for a literal-only rule", () => {
    let withDeps = 0;
    let literalOnly = 0;
    for (const raw of frozen.rules) {
      if (!raw.capacityExpression) continue;
      const rule = retarget(raw);
      const manifest = buildRuleDependencyManifest(rule, { companyId: CO, instrumentKey: INST, asOf: AS_OF });
      expect(manifest.counts.total).toBe(manifest.dependencies.length);
      if (manifest.dependencies.length > 0) withDeps += 1;
      else { literalOnly += 1; expect(runRule(rule, [snapshotFromManifest(manifest)]).status).not.toBe("NEEDS_INPUT"); }
    }
    expect(withDeps).toBeGreaterThan(0);
    expect(literalOnly).toBeGreaterThan(0);
  });
});
