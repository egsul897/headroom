/**
 * PHASE-4 VERIFICATION GATE - migration step 3. The approved semantics, pinned.
 *
 * The predicate is a MATERIAL finding x its scope relation to the node being evaluated. Status is
 * never the predicate. Everything below is one of: the 14-case matrix from the design, the REQUIRE
 * cases, the WEAK-identity cases, referenced-unit ownership, ordering safety, the 4C floor that no
 * arithmetic can lift, the 4D legal floor with failure atomicity, and the inertness of the whole
 * thing when no envelope is supplied.
 */
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import type { SemanticVerificationStatus } from "@/lib/contract-model/compiler/semantic-verification/types";
import type { SemanticVerificationFinding, SemanticVerificationResult } from "@/lib/contract-model/compiler/semantic-verification/types";
import type { IRDefinition, IRExpression, IRRule } from "@/lib/contract-model/ir/types";
import { evaluateExpression } from "@/lib/contract-model/runtime/evaluate-expression";
import { evaluateRule } from "@/lib/contract-model/runtime/rule-evaluator";
import { buildCapacityGraph } from "@/lib/contract-model/runtime/capacity/graph";
import { evaluateCapacityState, SUFFICIENCY_DOMINANCE } from "@/lib/contract-model/runtime/capacity/state";
import { fixtureInputResolver, metricInput } from "@/lib/contract-model/runtime/input-resolver";
import { rationalFromString } from "@/lib/contract-model/runtime/decimal";
import { DEFAULT_VERIFICATION_POLICY, type RuntimeVerificationEnvelope, type RuntimeVerificationUnit, RUNTIME_VERIFICATION_ENVELOPE_VERSION } from "@/lib/contract-model/runtime/verification-envelope";
import {
  assessUnit, blocksNode, blocksUnit, capacityVerificationFloor, gateIsActive, interpretVerificationStatus,
  VERIFICATION_DOMINANCE, type VerificationCoverage,
} from "@/lib/contract-model/runtime/verification-gate";
import { resolveRuntimeVerificationEnvelope, type ResolverUnitInput } from "@/lib/contract-model/verification-envelope/resolver";
import * as tx from "./transaction/helpers";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let n = 0;
const eid = () => `gate-expr-${++n}`;
const MONEY = (amount: number, exprId = eid()): IRExpression => ({ kind: "MONEY", type: "MONEY", amount, currency: "USD", exprId }) as IRExpression;
const PCT = (value: number, exprId = eid()): IRExpression => ({ kind: "PERCENT", type: "PERCENT", value, exprId }) as IRExpression;
const MUL = (...operands: IRExpression[]): IRExpression => ({ kind: "MULTIPLY", type: "MONEY", operands, exprId: eid() }) as IRExpression;
const ADD = (...operands: IRExpression[]): IRExpression => ({ kind: "ADD", type: "MONEY", operands, exprId: eid() }) as IRExpression;
const MAX = (...operands: IRExpression[]): IRExpression => ({ kind: "MAX", type: "MONEY", operands, exprId: eid() }) as IRExpression;
const CMP = (left: IRExpression, operator: "GT" | "LTE", right: IRExpression): IRExpression => ({ kind: "COMPARE", type: "BOOLEAN", left, operator, right, exprId: eid() }) as IRExpression;
const METRIC = (metricName: string): IRExpression => ({ kind: "METRIC_REFERENCE", type: "MONEY", metricName, companyId: "gate-co", instrumentKey: "gate-inst", resolvedDefinitionId: null, exprId: eid() }) as IRExpression;
const TERM = (termName: string, resolvedDefinitionId: string): IRExpression => ({ kind: "DEFINED_TERM_REFERENCE", type: "MONEY", termName, resolvedDefinitionId, companyId: "gate-co", instrumentKey: "gate-inst", exprId: eid() }) as IRExpression;
const RULEREF = (ruleId: string): IRExpression => ({ kind: "RULE_REFERENCE", type: "CAPACITY", ruleId, companyId: "gate-co", instrumentKey: "gate-inst", exprId: eid() }) as IRExpression;
const UNLIMITED = { kind: "UNLIMITED_CAPACITY", type: "CAPACITY", gatedBy: null, provenance: null } as unknown as IRExpression;

function rule(overrides: Partial<IRRule> = {}): IRRule {
  return {
    ruleId: "ir-rule:gate", irSchemaVersion: "v1", companyId: "gate-co", instrumentKey: "gate-inst", sourceDocumentId: "gate-doc",
    sourceSectionRef: "7.01", covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: "INCUR_DEBT",
    entityScope: [], entityScopeExcluded: [], transactionScope: null, capacityExpression: null,
    conditions: [], exceptions: [], dependsOn: [], operativeLineage: null,
    sufficiency: "COMPLETE", sufficiencyReasons: [], provenance: null, compilerVersion: "c1", sourceContentVersion: null,
    ...overrides,
  } as unknown as IRRule;
}

function definition(overrides: Partial<IRDefinition> = {}): IRDefinition {
  return {
    definitionId: "ir-def:gate", irSchemaVersion: "v1", companyId: "gate-co", instrumentKey: "gate-inst", sourceDocumentId: "gate-doc",
    termName: "Gate Term", covenantFamily: "DEFINITIONS_CALCULATION_RULES", calculationExpression: null, dependsOnTerms: [],
    sufficiency: "COMPLETE", sufficiencyReasons: [], provenance: null, compilerVersion: "c1", sourceContentVersion: null,
    ...overrides,
  } as unknown as IRDefinition;
}

const cond = (conditionId: string, expression: IRExpression | null) => ({ conditionId, conditionType: "OTHER" as never, expression, referencesDefinitionId: null, description: `condition ${conditionId}`, provenance: null });

function finding(overrides: Partial<SemanticVerificationFinding> = {}): SemanticVerificationFinding {
  return {
    findingId: "f-1", companyId: "gate-co", instrumentKey: "gate-inst", sourceDocumentId: "gate-doc", candidateRef: "cand-1",
    ruleOrDefinitionId: "ir-rule:gate", irPath: null, findingType: "UNSUPPORTED_IR_ADDITION", severity: "MATERIAL",
    sourceEvidence: "(none)", sourceCitation: "§7.01", proposedIrEvidence: "(none)", verifierReasoning: "unsupported value",
    deterministicSignals: [], verificationMethod: "DETERMINISTIC_ONLY", provider: null, model: null,
    verifierAlgorithmVersion: "verifier-v1", verifierPromptVersion: null, resolutionStatus: "OPEN", createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as unknown as SemanticVerificationFinding;
}

function verification(findings: SemanticVerificationFinding[], overrides: Partial<SemanticVerificationResult> = {}): SemanticVerificationResult {
  return { candidateRef: "cand-1", status: findings.some((f) => f.severity === "MATERIAL") ? "MATERIAL_DISCREPANCY" : "VERIFIED_NO_MATERIAL_GAP_FOUND", findings, semanticReviewInvoked: false, semanticReviewSkippedReason: null, conditionSuspicion: null, verifierAlgorithmVersion: "verifier-v1", verifiedAt: "2026-01-01T00:00:00.000Z", evidenceSetHash: "eh-1", ...overrides } as unknown as SemanticVerificationResult;
}

const resolve = (units: ResolverUnitInput[], companyId = "gate-co", instrumentKey = "gate-inst") => resolveRuntimeVerificationEnvelope({ companyId, instrumentKey, units }).envelope;
const clean = (unit: IRRule | IRDefinition, status: SemanticVerificationStatus = "VERIFIED_NO_MATERIAL_GAP_FOUND"): ResolverUnitInput =>
  ({ kind: "ruleId" in unit ? "RULE" : "DEFINITION", unit, verification: verification([], { status }) });
const disputedAt = (unit: IRRule | IRDefinition, irPath: string | null, findingId = "f-1", severity: "MATERIAL" | "NON_MATERIAL" | "UNCERTAIN" = "MATERIAL"): ResolverUnitInput =>
  ({ kind: "ruleId" in unit ? "RULE" : "DEFINITION", unit, verification: verification([finding({ findingId, ruleOrDefinitionId: "ruleId" in unit ? unit.ruleId : unit.definitionId, irPath, severity })]) });

/** A hand-built unit record, for cases where the binding itself is the thing under test. */
function record(ruleOrDefinitionId: string, over: Omit<Partial<RuntimeVerificationUnit>, "identity"> & { identity?: Partial<RuntimeVerificationUnit["identity"]> } = {}): RuntimeVerificationUnit {
  const { identity: identityOver, ...rest } = over;
  const identity = { ruleOrDefinitionId, companyId: "gate-co", instrumentKey: "gate-inst", irSchemaVersion: "v1", compilerVersion: "c1", sourceContentVersion: null, ...(identityOver ?? {}) };
  return { identityStrength: "WEAK", verificationStatus: "MATERIAL_DISCREPANCY", verifierAlgorithmVersion: "verifier-v1", evidenceSetHash: "eh-1", materialFindings: [], ...rest, identity };
}
const envelopeOf = (...units: RuntimeVerificationUnit[]): RuntimeVerificationEnvelope => ({ envelopeVersion: RUNTIME_VERIFICATION_ENVELOPE_VERSION, companyId: "gate-co", instrumentKey: "gate-inst", units });
const nodeFinding = (findingId: string, ...exprIds: string[]) => ({ findingId, findingType: "UNSUPPORTED_IR_ADDITION", scope: "NODE" as const, exprIds, irPathAsGiven: null, reason: "test" });
const unitFinding = (findingId: string) => ({ findingId, findingType: "UNSUPPORTED_IR_ADDITION", scope: "UNIT" as const, exprIds: [], irPathAsGiven: "rules[].exceptions", reason: "test" });

const money = (key: string, amount: string) => metricInput(key, { type: "MONEY", amount: rationalFromString(amount), currency: "USD", lineage: { exprId: null, inputKeys: [] } }, { source: "gate-fixture", sourceVersion: null });
const inputsFor = (definitions: IRDefinition[] = [], rules: IRRule[] = [], metrics: ReturnType<typeof money>[] = []) => fixtureInputResolver({ metrics, definitions, rules });
const NO_INPUTS = fixtureInputResolver({ metrics: [] });

function state(rules: IRRule[], definitions: IRDefinition[], inputs = inputsFor(definitions, rules), verification?: RuntimeVerificationEnvelope, policy?: "ALLOW_MISSING" | "REQUIRE", ledger: Parameters<typeof evaluateCapacityState>[0]["ledger"] = []) {
  const graph = buildCapacityGraph({ companyId: "gate-co", instrumentKey: "gate-inst", rules, definitions, asOf: "2026-01-01", verification });
  return evaluateCapacityState({ graph, rules, definitions, inputs, asOf: "2026-01-01", ledger, verification, policy });
}
const codes = (ls: readonly { code: string }[]) => ls.map((l) => l.code).sort();

// ---------------------------------------------------------------------------

describe("the gate is inert unless asked", () => {
  it("the default policy is ALLOW_MISSING and the gate is inactive with neither an envelope nor a non-default policy", () => {
    expect(DEFAULT_VERIFICATION_POLICY).toBe("ALLOW_MISSING");
    expect(gateIsActive(undefined, undefined)).toBe(false);
    expect(gateIsActive(undefined, "ALLOW_MISSING")).toBe(false);
    expect(gateIsActive(undefined, "REQUIRE")).toBe(true);
    expect(gateIsActive(envelopeOf(), undefined)).toBe(true);
  });

  it("every Phase-3 verification status is interpreted, and the interpretation is exhaustive over the compiler's own type", () => {
    // Record<SemanticVerificationStatus, ...> is a compile-time exhaustiveness proof against the Phase-3 type the runtime may not import.
    const expected: Record<SemanticVerificationStatus, Exclude<VerificationCoverage, "NOT_ATTEMPTED">> = {
      VERIFIED_NO_MATERIAL_GAP_FOUND: "COMPLETED", VERIFIED_WITH_NON_MATERIAL_FINDINGS: "COMPLETED", REVIEW_REQUIRED: "COMPLETED", MATERIAL_DISCREPANCY: "COMPLETED",
      VERIFICATION_INCOMPLETE: "ATTEMPTED_INCOMPLETE", VERIFICATION_FAILED: "ATTEMPTED_INCOMPLETE",
      // a record that says verification was not performed is not completed and never reads as clean
      NOT_VERIFIED: "ATTEMPTED_INCOMPLETE",
    };
    for (const [status, coverage] of Object.entries(expected)) expect(interpretVerificationStatus(status)).toBe(coverage);
    expect(interpretVerificationStatus("SOMETHING_NEW")).toBe("UNRECOGNIZED");
  });
});

describe("blocksUnit / blocksNode - the two predicates", () => {
  const r = rule();
  const known = { ruleOrDefinitionId: r.ruleId, companyId: r.companyId, instrumentKey: r.instrumentKey, irSchemaVersion: r.irSchemaVersion, compilerVersion: r.compilerVersion, sourceContentVersion: r.sourceContentVersion };

  it("no envelope under ALLOW_MISSING: nothing blocks", () => {
    expect(blocksUnit(r.ruleId, undefined, undefined, known)).toBeNull();
    expect(blocksNode(r.ruleId, "any", undefined, undefined, known)).toBeNull();
  });
  it("a UNIT-scoped MATERIAL finding blocks the unit and therefore every node", () => {
    const env = envelopeOf(record(r.ruleId, { materialFindings: [unitFinding("f-u")] }));
    expect(blocksUnit(r.ruleId, env, undefined, known)).toMatchObject({ reason: "MATERIAL_UNIT_FINDING", scope: "UNIT", findingIds: ["f-u"] });
    expect(blocksNode(r.ruleId, "unrelated", env, undefined, known)).toMatchObject({ reason: "MATERIAL_UNIT_FINDING" });
  });
  it("a NODE finding blocks exactly its exprIds and nothing else - set membership, no fuzz", () => {
    const env = envelopeOf(record(r.ruleId, { materialFindings: [nodeFinding("f-n", "x-1", "x-2")] }));
    expect(blocksUnit(r.ruleId, env, undefined, known)).toBeNull();
    expect(blocksNode(r.ruleId, "x-1", env, undefined, known)).toMatchObject({ reason: "MATERIAL_NODE_FINDING", scope: "NODE", exprId: "x-1", findingIds: ["f-n"] });
    expect(blocksNode(r.ruleId, "x-2", env, undefined, known)).not.toBeNull();
    expect(blocksNode(r.ruleId, "x-10", env, undefined, known)).toBeNull();
    expect(blocksNode(r.ruleId, "X-1", env, undefined, known)).toBeNull();
    expect(blocksNode(r.ruleId, null, env, undefined, known)).toBeNull();
  });
  it("a NODE finding and a UNIT finding on the same unit collapse to UNIT (envelope precedence UNIT > NODE)", () => {
    const env = envelopeOf(record(r.ruleId, { materialFindings: [nodeFinding("f-n", "x-1"), unitFinding("f-u")] }));
    expect(blocksNode(r.ruleId, "elsewhere", env, undefined, known)).toMatchObject({ reason: "MATERIAL_UNIT_FINDING" });
  });
  it("status alone never blocks: REVIEW_REQUIRED, VERIFICATION_INCOMPLETE and VERIFICATION_FAILED with no material finding block nothing", () => {
    for (const s of ["REVIEW_REQUIRED", "VERIFICATION_INCOMPLETE", "VERIFICATION_FAILED", "NOT_VERIFIED"]) {
      const env = envelopeOf(record(r.ruleId, { verificationStatus: s }));
      expect(blocksUnit(r.ruleId, env, undefined, known)).toBeNull();
      expect(blocksNode(r.ruleId, "x-1", env, undefined, known)).toBeNull();
      expect(assessUnit(r.ruleId, env, undefined, known).incomplete).toBe(s !== "REVIEW_REQUIRED");
    }
  });
  it("two records for one unit: none is chosen, the unit fails closed", () => {
    const env = envelopeOf(record(r.ruleId), record(r.ruleId));
    expect(blocksUnit(r.ruleId, env, undefined, known)).toMatchObject({ reason: "AMBIGUOUS_UNIT_RECORD", scope: "UNIT" });
  });
  it("identity check first: a record disagreeing on any known field fails the whole unit closed and names the fields", () => {
    for (const [field, value] of [["compilerVersion", "c2"], ["irSchemaVersion", "v2"], ["companyId", "other-co"], ["instrumentKey", "other-inst"], ["sourceContentVersion", "s-9"]] as const) {
      const env = envelopeOf(record(r.ruleId, { identity: { [field]: value } as Partial<RuntimeVerificationUnit["identity"]> }));
      const b = blocksUnit(r.ruleId, env, undefined, known);
      expect(b).toMatchObject({ reason: "IDENTITY_MISMATCH", scope: "UNIT", mismatches: [field] });
      // NODE findings on a stale record are never salvaged
      const env2 = envelopeOf(record(r.ruleId, { identity: { [field]: value } as Partial<RuntimeVerificationUnit["identity"]>, materialFindings: [nodeFinding("f-n", "x-1")] }));
      expect(blocksNode(r.ruleId, "x-99", env2, undefined, known)).toMatchObject({ reason: "IDENTITY_MISMATCH" });
    }
  });
  it("only the identity fields the runtime actually knows are compared, and the comparison says which", () => {
    const env = envelopeOf(record(r.ruleId, { identity: { compilerVersion: "c2" } }));
    // a bare caller that knows only the id and company cannot detect the compiler-version disagreement - and says so
    const partial = assessUnit(r.ruleId, env, undefined, { ruleOrDefinitionId: r.ruleId, companyId: "gate-co" });
    expect(partial.block).toBeNull();
    expect(partial.identity!.compared).toEqual(["ruleOrDefinitionId", "companyId"]);
    const full = assessUnit(r.ruleId, env, undefined, known);
    expect(full.identity!.compared).toHaveLength(6);
    expect(full.block!.mismatches).toEqual(["compilerVersion"]);
  });
});

// ---------------------------------------------------------------------------
// The 14-case matrix
// ---------------------------------------------------------------------------

describe("14-case matrix (design §testMatrixDesign)", () => {
  it("A. COMPLETE + no verification findings -> executes, no diagnostic, 4C AVAILABLE", () => {
    const r = rule({ capacityExpression: MONEY(100) as never });
    const env = resolve([clean(r)]);
    const e = evaluateRule(r, NO_INPUTS, { verification: env });
    expect(e.status).toBe("EXECUTABLE");
    expect(e.capacity!.diagnostics).toEqual([]);
    expect(e.capacity!.value).toMatchObject({ type: "MONEY", amount: "100" });
    const s = state([r], [], NO_INPUTS, env);
    expect(s.capacities[0]!.status).toBe("AVAILABLE");
    expect(s.capacities[0]!.limitations).toEqual([]);
  });

  it("B. COMPLETE + MATERIAL exact finding on the evaluated numeric -> AMBIGUOUS, value null, MATERIAL_VERIFICATION_FINDING; 4C UNSUPPORTED", () => {
    const pct = PCT(1);
    const r = rule({ capacityExpression: pct as never });
    const env = resolve([disputedAt(r, "rules[0].capacityExpression")]);
    const e = evaluateExpression({ expression: pct as never, inputs: NO_INPUTS, context: { unitId: r.ruleId }, verification: env });
    expect(e).toMatchObject({ status: "AMBIGUOUS", value: null });
    expect(e.diagnostics).toHaveLength(1);
    expect(e.diagnostics[0]).toMatchObject({ code: "MATERIAL_VERIFICATION_FINDING", status: "AMBIGUOUS", exprId: pct.exprId, verification: { reason: "MATERIAL_NODE_FINDING", findingIds: ["f-1"] } });
    const s = state([r], [], NO_INPUTS, env);
    expect(s.capacities[0]!.status).toBe("UNSUPPORTED");
    expect(codes(s.capacities[0]!.limitations)).toEqual(["PHASE3_VERIFICATION_MATERIAL_FINDING"]);
    expect(s.capacities[0]!.limitations[0]!.message).toMatch(/^\[MATERIAL_NODE_HIT\]/);
  });

  it("C. MATERIAL finding on an ANCESTOR -> the ancestor blocks when evaluated; the clean descendant evaluated alone does not", () => {
    const inner = PCT(0.5);
    const outer = MUL(inner, MONEY(1000));
    const r = rule({ capacityExpression: outer as never });
    const env = resolve([disputedAt(r, "rules[0].capacityExpression")]);
    const whole = evaluateExpression({ expression: outer as never, inputs: NO_INPUTS, context: { unitId: r.ruleId }, verification: env });
    expect(whole.status).toBe("AMBIGUOUS");
    expect(whole.trace.children).toEqual([]); // refused at entry: its operands were never dispatched
    const alone = evaluateExpression({ expression: inner as never, inputs: NO_INPUTS, context: { unitId: r.ruleId }, verification: env });
    expect(alone.status).toBe("EXECUTABLE");
    expect(alone.value).toMatchObject({ type: "PERCENT", lineage: { rawSource: 0.5 } });
  });

  it("descendant propagation (§8) is the existing bottom-up semantics, not a precomputed closure", () => {
    const inner = PCT(0.5);
    const outer = MUL(inner, MONEY(1000));
    const r = rule({ capacityExpression: outer as never });
    const env = resolve([disputedAt(r, "rules[0].capacityExpression.operands[0]")]);
    const whole = evaluateExpression({ expression: outer as never, inputs: NO_INPUTS, context: { unitId: r.ruleId }, verification: env });
    expect(whole.status).toBe("AMBIGUOUS");
    expect(whole.diagnostics).toHaveLength(1);
    expect(whole.diagnostics[0]!.exprId).toBe(inner.exprId);
    expect(whole.trace.children.map((c) => c.status)).toEqual(["AMBIGUOUS", "EXECUTABLE"]); // the sibling literal still evaluated
  });

  it("D. MATERIAL finding on a SIBLING field -> the clean expression executes; the rule is worst-of but its clean sub-results stay readable", () => {
    const capacity = MONEY(100);
    const c0 = CMP(MONEY(1), "LTE", MONEY(2));
    const disputedRight = MONEY(999);
    const c1 = CMP(MONEY(1), "GT", disputedRight);
    const r = rule({ capacityExpression: capacity as never, conditions: [cond("c0", c0), cond("c1", c1)] as never });
    const env = resolve([disputedAt(r, "rules[0].conditions[1].expression.right")]);
    const e = evaluateRule(r, NO_INPUTS, { verification: env });
    expect(e.capacity!.status).toBe("EXECUTABLE");
    expect(e.conditions[0]!.evaluation!.status).toBe("EXECUTABLE");
    expect(e.conditions[0]!.evaluation!.value).toMatchObject({ type: "BOOLEAN", value: true });
    expect(e.conditions[1]!.evaluation!.status).toBe("AMBIGUOUS");
    expect(e.conditions[1]!.evaluation!.diagnostics[0]!.exprId).toBe(disputedRight.exprId);
    expect(e.status).toBe("AMBIGUOUS");
    expect(e.verificationBlock).toBeUndefined();
    const s = state([r], [], NO_INPUTS, env);
    expect(s.capacities[0]!.status).toBe("AVAILABLE"); // the capacity-driving expression was never hit
  });

  it("E. NON_MATERIAL (and UNCERTAIN) finding on the evaluated node -> executes", () => {
    const pct = PCT(1);
    const r = rule({ capacityExpression: pct as never });
    for (const sev of ["NON_MATERIAL", "UNCERTAIN"] as const) {
      const env = resolve([disputedAt(r, "rules[0].capacityExpression", "f-nm", sev)]);
      expect(env.units[0]!.materialFindings).toEqual([]);
      const e = evaluateExpression({ expression: pct as never, inputs: NO_INPUTS, context: { unitId: r.ruleId }, verification: env });
      expect(e.status).toBe("EXECUTABLE");
      expect(e.diagnostics).toEqual([]);
    }
  });

  it("F. MISSING_CONTEXT sufficiency + clean verification -> the existing sufficiency block, byte-identical", () => {
    const r = rule({ capacityExpression: MONEY(100) as never, sufficiency: "MISSING_CONTEXT", sufficiencyReasons: ["context missing"] });
    const env = resolve([clean(r)]);
    const without = evaluateRule(r, NO_INPUTS, {});
    const withEnv = evaluateRule(r, NO_INPUTS, { verification: env });
    expect(without.status).toBe("AMBIGUOUS");
    expect(JSON.stringify(withEnv)).toBe(JSON.stringify(without));
    const d = definition({ calculationExpression: MONEY(5), sufficiency: "MISSING_CONTEXT", sufficiencyReasons: ["ctx"] });
    const ref = TERM(d.termName, d.definitionId);
    const e = evaluateExpression({ expression: ref as never, inputs: inputsFor([d]), context: { unitId: "ir-rule:x" }, verification: resolve([clean(d)]) });
    expect(e.diagnostics.map((x) => x.code)).toEqual(["AMBIGUOUS_SEMANTICS"]);
  });

  it("G. AMBIGUOUS sufficiency + clean verification -> existing block unchanged; verification never LIFTS a sufficiency floor", () => {
    const r = rule({ capacityExpression: MONEY(100) as never, sufficiency: "AMBIGUOUS", sufficiencyReasons: ["ambiguous"] });
    const env = resolve([clean(r)]);
    expect(JSON.stringify(evaluateRule(r, NO_INPUTS, { verification: env }))).toBe(JSON.stringify(evaluateRule(r, NO_INPUTS, {})));
    const s = state([r], [], NO_INPUTS, env);
    expect(s.capacities[0]!.status).toBe("AMBIGUOUS");
    expect(codes(s.capacities[0]!.limitations)).toEqual(["PHASE3_RULE_AMBIGUOUS"]);
    expect(SUFFICIENCY_DOMINANCE.AMBIGUOUS.status).toBe("AMBIGUOUS");
  });

  it("H. MATERIAL finding + UNLIMITED capacity -> the finding is UNIT-scoped (no exprId) and verification dominates: never AVAILABLE, never UNLIMITED", () => {
    const r = rule({ capacityExpression: UNLIMITED as never });
    const env = resolve([disputedAt(r, "rules[0].capacityExpression")]);
    expect(env.units[0]!.materialFindings[0]!.scope).toBe("UNIT");
    const s = state([r], [], NO_INPUTS, env);
    expect(s.capacities[0]!.status).toBe("REVIEW_REQUIRED");
    expect(codes(s.capacities[0]!.limitations)).toEqual(["PHASE3_VERIFICATION_MATERIAL_FINDING"]);
    expect(s.capacities[0]!.grossCapacity.kind).toBe("NOT_DETERMINED");
    expect(JSON.stringify(s.capacities[0]!)).not.toMatch(/"kind":"UNLIMITED"/);
  });

  it("I. missing verification + ALLOW_MISSING -> legacy behaviour byte-identical; + REQUIRE -> UNIT block", () => {
    const r = rule({ capacityExpression: MONEY(100) as never });
    const other = rule({ ruleId: "ir-rule:other", capacityExpression: MONEY(1) as never });
    const envForOther = resolve([disputedAt(other, "rules[0].capacityExpression")]);
    const legacy = evaluateRule(r, NO_INPUTS, {});
    expect(JSON.stringify(evaluateRule(r, NO_INPUTS, { verification: envForOther }))).toBe(JSON.stringify(legacy));
    expect(JSON.stringify(evaluateRule(r, NO_INPUTS, { verification: envForOther, policy: "ALLOW_MISSING" }))).toBe(JSON.stringify(legacy));
    const strict = evaluateRule(r, NO_INPUTS, { verification: envForOther, policy: "REQUIRE" });
    expect(strict.status).toBe("AMBIGUOUS");
    expect(strict.capacity).toBeNull();
    expect(strict.verificationBlock).toMatchObject({ reason: "REQUIRED_VERIFICATION_MISSING", scope: "UNIT" });
  });

  it("J. identity mismatch -> UNIT fail closed at 4A and 4C, identity strength recorded, fields named", () => {
    const r = rule({ capacityExpression: MONEY(100) as never });
    const stale = resolve([clean(rule({ compilerVersion: "c0", capacityExpression: MONEY(100) as never }))]); // verified a different compile of the same rule
    const e = evaluateRule(r, NO_INPUTS, { verification: stale });
    expect(e.status).toBe("AMBIGUOUS");
    expect(e.verificationBlock).toMatchObject({ reason: "IDENTITY_MISMATCH", mismatches: ["compilerVersion"], identityStrength: "WEAK" });
    const s = state([r], [], NO_INPUTS, stale);
    expect(s.capacities[0]!.status).toBe("REVIEW_REQUIRED");
    expect(s.capacities[0]!.limitations[0]!.message).toMatch(/^\[IDENTITY_MISMATCH\].*compilerVersion/);
  });

  it("L. mixed rule: clean expression + disputed expression -> node-level, the clean node stays readable", () => {
    const capacity = MUL(PCT(0.25), MONEY(400));
    const disputed = MONEY(7);
    const r = rule({ capacityExpression: capacity as never, conditions: [cond("c0", CMP(MONEY(1), "LTE", MONEY(2))), cond("c1", CMP(disputed, "GT", MONEY(1)))] as never });
    const env = resolve([disputedAt(r, "rules[0].conditions[1].expression.left")]);
    const e = evaluateRule(r, NO_INPUTS, { verification: env });
    expect(e.capacity!.value).toMatchObject({ type: "MONEY", amount: "100" });
    expect(e.conditions[0]!.evaluation!.value).toMatchObject({ type: "BOOLEAN", value: true });
    expect(e.conditions[1]!.evaluation!.status).toBe("AMBIGUOUS");
    expect(e.status).toBe("AMBIGUOUS");
  });

  it("M. resolver-produced UNIT finding from an unparseable Phase-3 path (prose, wildcard, malformed) -> whole unit blocked", () => {
    const r = rule({ capacityExpression: MONEY(100) as never });
    for (const path of ["rules[].capacityExpression", "definitions[termName=\"X\"].sufficiency", "rules[0].capacityExpression.operands[", "rules[0].nope.deeper"]) {
      const env = resolve([disputedAt(r, path)]);
      expect(env.units[0]!.materialFindings[0]!.scope).toBe("UNIT");
      const e = evaluateRule(r, NO_INPUTS, { verification: env });
      expect(e.status).toBe("AMBIGUOUS");
      expect(e.capacity).toBeNull();
      expect(e.verificationBlock).toMatchObject({ reason: "MATERIAL_UNIT_FINDING", scope: "UNIT", findingIds: ["f-1"] });
      const s = state([r], [], NO_INPUTS, env);
      expect(s.capacities[0]!.status).toBe("REVIEW_REQUIRED");
      expect(s.capacities[0]!.limitations[0]!.message).toMatch(/^\[MATERIAL_UNIT_FINDING\]/);
    }
  });

  it("N. VERIFICATION_INCOMPLETE with no MATERIAL finding -> executes at 4A with an informational diagnostic; 4C REVIEW_REQUIRED under its OWN code", () => {
    const r = rule({ capacityExpression: MONEY(100) as never });
    for (const status of ["VERIFICATION_INCOMPLETE", "VERIFICATION_FAILED"] as const) {
      const env = resolve([clean(r, status)]);
      const e = evaluateRule(r, NO_INPUTS, { verification: env });
      expect(e.status).toBe("EXECUTABLE");
      expect(e.capacity!.value).toMatchObject({ amount: "100" }); // never nulled for incompleteness
      expect(e.capacity!.diagnostics).toHaveLength(1);
      expect(e.capacity!.diagnostics[0]).toMatchObject({ code: "VERIFICATION_INCOMPLETE", status: "EXECUTABLE" });
      expect(e.capacity!.diagnostics[0]!.message).toContain(status);
      const s = state([r], [], NO_INPUTS, env);
      expect(s.capacities[0]!.status).toBe("REVIEW_REQUIRED");
      expect(codes(s.capacities[0]!.limitations)).toEqual(["PHASE3_VERIFICATION_INCOMPLETE"]);
      expect(codes(s.capacities[0]!.limitations)).not.toContain("PHASE3_VERIFICATION_MATERIAL_FINDING");
      expect(s.capacities[0]!.provisional!.grossCapacity).toMatchObject({ kind: "AMOUNT" }); // the arithmetic is reported, provisionally
    }
  });

  it("§11 REVIEW_REQUIRED status alone is not the predicate: a benign review executes and is AVAILABLE", () => {
    const r = rule({ capacityExpression: MONEY(100) as never });
    const env = resolve([clean(r, "REVIEW_REQUIRED")]);
    const e = evaluateRule(r, NO_INPUTS, { verification: env });
    expect(e.status).toBe("EXECUTABLE");
    expect(e.capacity!.diagnostics).toEqual([]);
    expect(state([r], [], NO_INPUTS, env).capacities[0]!.status).toBe("AVAILABLE");
  });
});

// ---------------------------------------------------------------------------
// REQUIRE and WEAK identity
// ---------------------------------------------------------------------------

describe("REQUIRE policy (explicit only; never the default)", () => {
  const r = rule({ capacityExpression: MONEY(100) as never });
  it("R1. REQUIRE + no envelope -> fail closed at 4A, whole rule, and 4C", () => {
    const e = evaluateRule(r, NO_INPUTS, { policy: "REQUIRE" });
    expect(e.status).toBe("AMBIGUOUS");
    expect(e.verificationBlock).toMatchObject({ reason: "REQUIRED_VERIFICATION_MISSING" });
    const x = evaluateExpression({ expression: r.capacityExpression as never, inputs: NO_INPUTS, context: { unitId: r.ruleId }, policy: "REQUIRE" });
    expect(x.status).toBe("AMBIGUOUS");
    expect(x.diagnostics[0]!.verification!.reason).toBe("REQUIRED_VERIFICATION_MISSING");
    const s = state([r], [], NO_INPUTS, undefined, "REQUIRE");
    expect(s.capacities[0]!.status).toBe("REVIEW_REQUIRED");
    expect(s.capacities[0]!.limitations[0]!.message).toMatch(/^\[REQUIRED_VERIFICATION_MISSING\]/);
  });
  it("R2. REQUIRE + envelope lacking this unit -> fail closed", () => {
    const env = resolve([clean(rule({ ruleId: "ir-rule:elsewhere" }))]);
    expect(evaluateRule(r, NO_INPUTS, { verification: env, policy: "REQUIRE" }).verificationBlock!.reason).toBe("REQUIRED_VERIFICATION_MISSING");
  });
  it("R3. REQUIRE + matching verified unit + no material findings -> executes", () => {
    const env = resolve([clean(r)]);
    const e = evaluateRule(r, NO_INPUTS, { verification: env, policy: "REQUIRE" });
    expect(e.status).toBe("EXECUTABLE");
    expect(e.capacity!.value).toMatchObject({ amount: "100" });
    expect(state([r], [], NO_INPUTS, env, "REQUIRE").capacities[0]!.status).toBe("AVAILABLE");
  });
  it("R4. REQUIRE + identity mismatch -> fail closed", () => {
    const env = resolve([clean(rule({ irSchemaVersion: "v2", capacityExpression: MONEY(100) as never }))]);
    expect(evaluateRule(r, NO_INPUTS, { verification: env, policy: "REQUIRE" }).verificationBlock).toMatchObject({ reason: "IDENTITY_MISMATCH", mismatches: ["irSchemaVersion"] });
  });
  it("R5. REQUIRE reaches referenced units too: a verified rule expanding an unverified definition fails at the definition", () => {
    const d = definition({ calculationExpression: MONEY(1000) });
    const rr = rule({ capacityExpression: MUL(PCT(0.1), TERM(d.termName, d.definitionId)) as never });
    const env = resolve([clean(rr)]);
    const e = evaluateRule(rr, inputsFor([d]), { verification: env, policy: "REQUIRE" });
    expect(e.status).toBe("AMBIGUOUS");
    expect(e.verificationBlock).toBeUndefined(); // the rule itself is verified
    expect(e.capacity!.diagnostics[0]!.verification).toMatchObject({ reason: "REQUIRED_VERIFICATION_MISSING", unitId: d.definitionId });
    expect(evaluateRule(rr, inputsFor([d]), { verification: resolve([clean(rr), clean(d)]), policy: "REQUIRE" }).status).toBe("EXECUTABLE");
  });
  it("R6. REQUIRE with no unit identity at all fails closed rather than assuming", () => {
    const x = evaluateExpression({ expression: MONEY(1) as never, inputs: NO_INPUTS, policy: "REQUIRE" });
    expect(x.status).toBe("AMBIGUOUS");
    expect(x.diagnostics[0]!.verification!.reason).toBe("REQUIRED_VERIFICATION_MISSING");
  });
});

describe("WEAK identity", () => {
  const r = rule({ capacityExpression: PCT(1) as never }); // sourceContentVersion null -> every record is WEAK
  it("a MATERIAL finding on a WEAK-matched unit still blocks", () => {
    const env = resolve([disputedAt(r, "rules[0].capacityExpression")]);
    expect(env.units[0]!.identityStrength).toBe("WEAK");
    const e = evaluateRule(r, NO_INPUTS, { verification: env });
    expect(e.status).toBe("AMBIGUOUS");
    expect(e.capacity!.diagnostics[0]!.verification!.identityStrength).toBe("WEAK");
  });
  it("a WEAK match with no findings executes but creates no positive 'verified clean' claim anywhere in the result", () => {
    const env = resolve([clean(r)]);
    const e = evaluateRule(r, NO_INPUTS, { verification: env });
    expect(e.status).toBe("EXECUTABLE");
    expect(JSON.stringify(e)).not.toMatch(/verified/i);
    const s = state([r], [], NO_INPUTS, env);
    expect(JSON.stringify(s)).not.toMatch(/VERIFIED|verifiedClean|verificationStatus/);
    const a = assessUnit(r.ruleId, env, undefined, null);
    expect(Object.keys(a)).not.toContain("verifiedClean");
  });
  it("a mismatch fails closed whatever the strength", () => {
    const strong = envelopeOf(record(r.ruleId, { identityStrength: "STRONG", identity: { sourceContentVersion: "s1", compilerVersion: "c2" } }));
    expect(blocksUnit(r.ruleId, strong, undefined, { ruleOrDefinitionId: r.ruleId, compilerVersion: "c1" })!.reason).toBe("IDENTITY_MISMATCH");
  });
});

// ---------------------------------------------------------------------------
// Ownership across expansion, and ordering
// ---------------------------------------------------------------------------

describe("referenced-unit ownership (§23): the owner changes when evaluation expands into another unit", () => {
  it("rule A -> definition B: B's finding blocks B's node; A's unrelated finding never binds to B", () => {
    const bNode = MONEY(1000);
    const B = definition({ definitionId: "ir-def:B", termName: "B Term", calculationExpression: bNode });
    const aPct = PCT(0.1);
    const A = rule({ ruleId: "ir-rule:A", capacityExpression: MUL(aPct, TERM(B.termName, B.definitionId)) as never });
    const inputs = inputsFor([B]);
    // B disputed, A clean
    const env1 = resolve([clean(A), disputedAt(B, "definitions[0].calculationExpression", "f-B")]);
    const e1 = evaluateRule(A, inputs, { verification: env1 });
    expect(e1.status).toBe("AMBIGUOUS");
    expect(e1.capacity!.diagnostics).toHaveLength(1);
    expect(e1.capacity!.diagnostics[0]!.verification).toMatchObject({ unitId: "ir-def:B", exprId: bNode.exprId, findingIds: ["f-B"] });
    expect(e1.capacity!.provenance.expandedObjects).toEqual([{ kind: "DEFINITION", id: "ir-def:B" }]);
    // A disputed on a node OUTSIDE its capacity (a condition), B clean: B executes, the capacity executes
    const A2 = rule({ ...A, conditions: [cond("c0", CMP(MONEY(1), "LTE", MONEY(2)))] as never });
    const env2 = resolve([disputedAt(A2, "rules[0].conditions[0].expression.left", "f-A"), clean(B)]);
    const e2 = evaluateRule(A2, inputs, { verification: env2 });
    expect(e2.capacity!.status).toBe("EXECUTABLE");
    expect(e2.capacity!.value).toMatchObject({ type: "MONEY", amount: "100" });
    expect(e2.conditions[0]!.evaluation!.status).toBe("AMBIGUOUS");
  });

  it("a finding on A naming an exprId that ALSO appears inside B does not block B's node - binding is (unit, exprId), and the memo does not leak across units", () => {
    const shared = "gate-shared-exprid";
    const B = definition({ definitionId: "ir-def:B", termName: "B Term", calculationExpression: MONEY(1000, shared) });
    const A = rule({ ruleId: "ir-rule:A", capacityExpression: ADD(MONEY(1000, shared), TERM(B.termName, B.definitionId)) as never });
    const env = envelopeOf(record("ir-rule:A", { materialFindings: [nodeFinding("f-A", shared)] }), record("ir-def:B", { verificationStatus: "VERIFIED_NO_MATERIAL_GAP_FOUND" }));
    const e = evaluateRule(A, inputsFor([B]), { verification: env });
    expect(e.capacity!.status).toBe("AMBIGUOUS");
    const [aNode, bRef] = e.capacity!.trace.children;
    expect(aNode!.status).toBe("AMBIGUOUS"); // A's own node, blocked
    expect(bRef!.status).toBe("EXECUTABLE"); // B's identical-content node, not blocked
    expect(bRef!.children[0]!.value).toMatchObject({ type: "MONEY", amount: "1000" });
    expect(e.capacity!.diagnostics.map((d) => d.verification!.unitId)).toEqual(["ir-rule:A"]);
    // and the converse: only B disputed -> A's identical node executes, B's blocks
    const env2 = envelopeOf(record("ir-rule:A", { verificationStatus: "VERIFIED_NO_MATERIAL_GAP_FOUND" }), record("ir-def:B", { materialFindings: [nodeFinding("f-B", shared)] }));
    const e2 = evaluateRule(A, inputsFor([B]), { verification: env2 });
    expect(e2.capacity!.trace.children[0]!.status).toBe("EXECUTABLE");
    expect(e2.capacity!.trace.children[1]!.status).toBe("AMBIGUOUS");
    expect(e2.capacity!.diagnostics.map((d) => d.verification!.unitId)).toEqual(["ir-def:B"]);
  });

  it("rule A -> rule B (RULE_REFERENCE): the same ownership rule holds, and a UNIT block on B lands on the reference", () => {
    const bNode = MONEY(500);
    const B = rule({ ruleId: "ir-rule:B", capacityExpression: bNode as never });
    const A = rule({ ruleId: "ir-rule:A", capacityExpression: RULEREF("ir-rule:B") as never });
    const inputs = inputsFor([], [B]);
    const nodeHit = evaluateRule(A, inputs, { verification: resolve([clean(A), disputedAt(B, "rules[0].capacityExpression", "f-B")]) });
    expect(nodeHit.capacity!.diagnostics[0]!.verification).toMatchObject({ scope: "NODE", unitId: "ir-rule:B", exprId: bNode.exprId });
    const unitHit = evaluateRule(A, inputs, { verification: resolve([clean(A), disputedAt(B, "rules[].exceptions", "f-B")]) });
    expect(unitHit.capacity!.diagnostics[0]!.verification).toMatchObject({ scope: "UNIT", reason: "MATERIAL_UNIT_FINDING", unitId: "ir-rule:B" });
    expect(unitHit.capacity!.trace.children).toEqual([]);
    expect(unitHit.verificationBlock).toBeUndefined(); // A itself is not refused; its dependency is
  });

  it("incompleteness is reported per unit entered, and a dependency's incompleteness reaches the capacity floor", () => {
    const B = definition({ definitionId: "ir-def:B", termName: "B Term", calculationExpression: MONEY(1000) });
    const A = rule({ ruleId: "ir-rule:A", capacityExpression: MUL(PCT(0.1), TERM(B.termName, B.definitionId)) as never });
    const env = resolve([clean(A), clean(B, "VERIFICATION_INCOMPLETE")]);
    const e = evaluateRule(A, inputsFor([B]), { verification: env });
    expect(e.status).toBe("EXECUTABLE");
    expect(e.capacity!.diagnostics.map((d) => d.code)).toEqual(["VERIFICATION_INCOMPLETE"]);
    expect(e.capacity!.diagnostics[0]!.message).toContain("ir-def:B");
    const s = state([A], [B], inputsFor([B]), env);
    expect(s.capacities[0]!.status).toBe("REVIEW_REQUIRED");
    expect(codes(s.capacities[0]!.limitations)).toEqual(["PHASE3_VERIFICATION_INCOMPLETE"]);
  });
});

describe("ordering safety (§24): no positional dependence survives at runtime", () => {
  const mk = () => {
    const r1 = rule({ ruleId: "ir-rule:one", capacityExpression: MONEY(10) as never });
    const r2 = rule({ ruleId: "ir-rule:two", capacityExpression: PCT(1) as never });
    const r3 = rule({ ruleId: "ir-rule:three", capacityExpression: MONEY(30) as never });
    return { r1, r2, r3 };
  };
  it("reordering rule arrays, definition arrays, envelope units and selected subsets yields byte-identical gate behaviour", () => {
    const { r1, r2, r3 } = mk();
    const forward = resolve([clean(r1), disputedAt(r2, "rules[0].capacityExpression", "f-2"), clean(r3)]);
    const reversed = resolve([clean(r3), disputedAt(r2, "rules[0].capacityExpression", "f-2"), clean(r1)]);
    expect(JSON.stringify(forward)).toBe(JSON.stringify(reversed));
    const shuffled: RuntimeVerificationEnvelope = { ...forward, units: [...forward.units].reverse() };
    const a = state([r1, r2, r3], [], NO_INPUTS, forward);
    const b = state([r3, r1, r2], [], NO_INPUTS, shuffled);
    expect(b.stateHash).toBe(a.stateHash);
    expect(a.capacities.map((c) => [c.ruleId, c.status])).toEqual([["ir-rule:one", "AVAILABLE"], ["ir-rule:three", "AVAILABLE"], ["ir-rule:two", "UNSUPPORTED"]]);
    // a subset: rules[0] is now r2, and the finding still lands on r2 by id, not on whatever sits at index 0
    const subset = state([r2], [], NO_INPUTS, shuffled);
    expect(subset.capacities.map((c) => [c.ruleId, c.status])).toEqual([["ir-rule:two", "UNSUPPORTED"]]);
    const subset2 = state([r3, r1], [], NO_INPUTS, shuffled);
    expect(subset2.capacities.every((c) => c.status === "AVAILABLE")).toBe(true);
  });
  it("the gate and its four call sites never read the finding's path text", () => {
    const strip = (f: string) => fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const f of ["lib/contract-model/runtime/verification-gate.ts", "lib/contract-model/runtime/evaluate-expression.ts", "lib/contract-model/runtime/rule-evaluator.ts", "lib/contract-model/runtime/capacity/state.ts", "lib/contract-model/runtime/transaction/simulate.ts"]) {
      const code = strip(f);
      expect(code, f).not.toMatch(/irPathAsGiven|irPath\b|rules\[|definitions\[/);
    }
  });
});

// ---------------------------------------------------------------------------
// 4C - arithmetic never lifts the floor
// ---------------------------------------------------------------------------

describe("4C VERIFICATION_DOMINANCE (§15-§16): a verification floor dominates any arithmetic", () => {
  it("the table is separate from SUFFICIENCY_DOMINANCE, exhaustive, and floors exactly as approved", () => {
    expect(VERIFICATION_DOMINANCE).toEqual({
      NONE: { status: null, limitation: null },
      MATERIAL_NODE_HIT: { status: "UNSUPPORTED", limitation: "PHASE3_VERIFICATION_MATERIAL_FINDING" },
      MATERIAL_UNIT_FINDING: { status: "REVIEW_REQUIRED", limitation: "PHASE3_VERIFICATION_MATERIAL_FINDING" },
      IDENTITY_MISMATCH: { status: "REVIEW_REQUIRED", limitation: "PHASE3_VERIFICATION_MATERIAL_FINDING" },
      REQUIRED_VERIFICATION_MISSING: { status: "REVIEW_REQUIRED", limitation: "PHASE3_VERIFICATION_MATERIAL_FINDING" },
      AMBIGUOUS_UNIT_RECORD: { status: "REVIEW_REQUIRED", limitation: "PHASE3_VERIFICATION_MATERIAL_FINDING" },
      ATTEMPTED_INCOMPLETE: { status: "REVIEW_REQUIRED", limitation: "PHASE3_VERIFICATION_INCOMPLETE" },
    });
    expect(Object.keys(SUFFICIENCY_DOMINANCE)).not.toContain("MATERIAL_NODE_HIT");
    expect(SUFFICIENCY_DOMINANCE.COMPLETE.status).toBeNull(); // the hole this closes
  });

  it("huge positive headroom + a NODE hit -> UNSUPPORTED, nothing published", () => {
    const big = MONEY(1_000_000_000_000);
    const r = rule({ capacityExpression: big as never });
    const s = state([r], [], NO_INPUTS, resolve([disputedAt(r, "rules[0].capacityExpression")]));
    expect(s.capacities[0]!.status).toBe("UNSUPPORTED");
    expect(s.capacities[0]!.grossCapacity.kind).toBe("NOT_DETERMINED");
    expect(s.capacities[0]!.effectiveRemaining.kind).toBe("NOT_DETERMINED");
    expect(JSON.stringify(s)).not.toMatch(/1000000000000/);
  });

  it("unlimited capacity + a UNIT hit -> REVIEW_REQUIRED, never UNLIMITED", () => {
    const r = rule({ capacityExpression: UNLIMITED as never });
    const s = state([r], [], NO_INPUTS, resolve([disputedAt(r, null)]));
    expect(s.capacities[0]!.status).toBe("REVIEW_REQUIRED");
    expect(JSON.stringify(s.capacities[0]!)).not.toMatch(/"kind":"UNLIMITED"/);
  });

  it("clean financial inputs + a NODE hit on the multiplier -> UNSUPPORTED; the fact itself is not blamed", () => {
    const pct = PCT(0.3);
    const r = rule({ capacityExpression: MUL(pct, METRIC("EBITDA")) as never });
    const s = state([r], [], inputsFor([], [], [money("EBITDA", "5000")]), resolve([disputedAt(r, "rules[0].capacityExpression.operands[0]")]));
    expect(s.capacities[0]!.status).toBe("UNSUPPORTED");
    expect(codes(s.capacities[0]!.limitations)).toEqual(["PHASE3_VERIFICATION_MATERIAL_FINDING"]);
    expect(s.capacities[0]!.limitations[0]!.refs).toContain("f-1");
  });

  it("ledger availability cannot restore a refused capacity, and a UNIT hit with a clean MAX still floors", () => {
    const r = tx.provision("p-led", tx.MONEY(100));
    const env = resolve([disputedAt(r, "rules[0].capacityExpression")], tx.ORG, tx.FACILITY);
    const graph = buildCapacityGraph({ rules: [r], companyId: tx.ORG, instrumentKey: tx.FACILITY, asOf: tx.WHEN });
    const withLedger = evaluateCapacityState({ graph, rules: [r], inputs: tx.resolverFor([]), ledger: [tx.usage("u1", "10", tx.onProvision("p-led"))], asOf: tx.WHEN, verification: env });
    expect(withLedger.capacities[0]!.status).toBe("UNSUPPORTED");
    expect(withLedger.capacities[0]!.remaining.kind).toBe("NOT_DETERMINED");
    const r2 = rule({ capacityExpression: MAX(MONEY(1), MONEY(2)) as never });
    const s2 = state([r2], [], NO_INPUTS, resolve([disputedAt(r2, "rules[].exceptions")]));
    expect(s2.capacities[0]!.status).toBe("REVIEW_REQUIRED");
    expect(s2.capacities[0]!.grossCapacity.kind).toBe("NOT_DETERMINED");
  });

  it("the sufficiency floor and the verification floor combine by worst-of; neither lowers the other", () => {
    const r = rule({ capacityExpression: MONEY(100) as never, sufficiency: "PARTIAL", sufficiencyReasons: ["partial"] });
    const s = state([r], [], NO_INPUTS, resolve([disputedAt(r, "rules[0].capacityExpression")]));
    expect(s.capacities[0]!.status).toBe("UNSUPPORTED");
    expect(codes(s.capacities[0]!.limitations)).toEqual(["PHASE3_RULE_NOT_SAFE_TO_RELY_ON", "PHASE3_VERIFICATION_MATERIAL_FINDING"]);
    const unit = rule({ capacityExpression: MONEY(100) as never, sufficiency: "UNSUPPORTED", sufficiencyReasons: ["unsupported"] });
    const s2 = state([unit], [], NO_INPUTS, resolve([disputedAt(unit, null)]));
    expect(s2.capacities[0]!.status).toBe("UNSUPPORTED"); // UNIT floor is REVIEW_REQUIRED; the stronger sufficiency floor stands
  });

  it("capacityVerificationFloor is deterministic and orders conditions most-severe first", () => {
    const own = assessUnit("u", envelopeOf(record("u", { verificationStatus: "VERIFICATION_INCOMPLETE" })), undefined, null);
    const f = capacityVerificationFloor(own, null, "cap:u");
    expect(f.conditions).toEqual(["ATTEMPTED_INCOMPLETE"]);
    expect(f.floors).toEqual(["REVIEW_REQUIRED"]);
    expect(JSON.stringify(capacityVerificationFloor(own, null, "cap:u"))).toBe(JSON.stringify(f));
  });
});

// ---------------------------------------------------------------------------
// 4D - transaction simulation
// ---------------------------------------------------------------------------

describe("4D verification legal floor (§17, case K): REVIEW_REQUIRED, limitation recorded, nothing mutated", () => {
  function gatedWorld(r: IRRule, env: RuntimeVerificationEnvelope, ledger: ReturnType<typeof tx.usage>[] = []) {
    const w = tx.world({ rules: [r], ledger });
    const stateWithGate = evaluateCapacityState({ graph: w.graph, rules: [r], inputs: w.inputs, ledger, asOf: tx.WHEN, verification: env });
    return { ...w, state: stateWithGate, context: { ...w.context, verification: env } };
  }

  it("K. a draw on a capacity verification refused -> REVIEW_REQUIRED on both dimensions, PHASE3_VERIFICATION_MATERIAL_FINDING, not committable, pre-state and ledger unchanged", () => {
    const r = tx.provision("p-v", tx.MONEY(100));
    const env = resolve([disputedAt(r, "rules[0].capacityExpression")], tx.ORG, tx.FACILITY);
    const ledger = [tx.usage("u1", "10", tx.onProvision("p-v"))];
    const w = gatedWorld(r, env, ledger);
    expect(w.state.capacities[0]!.status).toBe("UNSUPPORTED");
    const before = JSON.stringify({ state: w.state, ledger, graph: w.graph });
    const res = tx.simulate(w, tx.proposal("tx-k", [tx.consume("e1", tx.nodeOf("p-v"), tx.cash("20"))]), tx.route({ capacityNodeIds: [tx.nodeOf("p-v")], ruleIds: ["p-v"] }));
    expect(res.selectedPathResult).toBe("REVIEW_REQUIRED");
    expect(res.simulationStatus).toBe("REVIEW_REQUIRED");
    expect(res.capacityEffects[0]!.outcome).toBe("REVIEW_REQUIRED");
    expect(res.capacityEffects[0]!.availableAmount.kind).toBe("NOT_DETERMINED");
    expect(tx.codes(res.limitations)).toContain("PHASE3_VERIFICATION_MATERIAL_FINDING");
    expect(res.commitPlan.committable).toBe(false);
    expect(JSON.stringify({ state: w.state, ledger, graph: w.graph })).toBe(before);
    expect(res.preTransactionState.stateHash).toBe(w.state.stateHash);
    if (res.postState) expect(res.postState.capacities[0]!.status).toBe("UNSUPPORTED"); // no capacity was consumed into availability
    expect(JSON.stringify(res)).not.toMatch(/"amount":"100"/); // the refused figure is never surfaced
  });

  it("a UNIT-refused rule makes every condition on it REVIEW_REQUIRED (beside unsafeLegal), and a NODE-refused condition is REVIEW_REQUIRED not AMBIGUOUS", () => {
    const disputedLeft = tx.MONEY(5);
    const r = tx.provision("p-c", tx.MONEY(100), { conditions: [tx.condition("c0", tx.LTE(tx.MONEY(1), tx.MONEY(2))), tx.condition("c1", tx.LTE(disputedLeft, tx.MONEY(9)))] });
    const unitEnv = resolve([disputedAt(r, "rules[].exceptions", "f-u")], tx.ORG, tx.FACILITY);
    const w1 = gatedWorld(r, unitEnv);
    const r1 = tx.simulate(w1, tx.proposal("tx-u", [tx.consume("e1", tx.nodeOf("p-c"), tx.cash("1"))]), tx.route({ capacityNodeIds: [tx.nodeOf("p-c")], ruleIds: ["p-c"] }));
    expect(r1.conditions.map((c) => c.result)).toEqual(["REVIEW_REQUIRED", "REVIEW_REQUIRED"]);
    expect(r1.conditions[0]!.reason).toMatch(/MATERIAL_UNIT_FINDING/);
    expect(r1.selectedPathResult).toBe("REVIEW_REQUIRED");
    const nodeEnv = resolve([disputedAt(r, "rules[0].conditions[1].expression.left", "f-n")], tx.ORG, tx.FACILITY);
    const w2 = gatedWorld(r, nodeEnv);
    expect(w2.state.capacities[0]!.status).toBe("AVAILABLE"); // the capacity itself is untouched
    const r2 = tx.simulate(w2, tx.proposal("tx-n", [tx.consume("e1", tx.nodeOf("p-c"), tx.cash("1"))]), tx.route({ capacityNodeIds: [tx.nodeOf("p-c")], ruleIds: ["p-c"] }));
    expect(r2.conditions.map((c) => c.result)).toEqual(["SATISFIED", "REVIEW_REQUIRED"]);
    expect(r2.capacityEffects[0]!.outcome).toBe("SATISFIED");
    expect(r2.selectedPathResult).toBe("REVIEW_REQUIRED");
    expect(tx.codes(r2.limitations)).toContain("PHASE3_VERIFICATION_MATERIAL_FINDING");
    expect(r2.commitPlan.committable).toBe(false);
  });

  it("incomplete verification on the selected path -> REVIEW_REQUIRED under PHASE3_VERIFICATION_INCOMPLETE, provisional arithmetic still reported", () => {
    const r = tx.provision("p-i", tx.MONEY(100));
    const env = resolve([clean(r, "VERIFICATION_INCOMPLETE")], tx.ORG, tx.FACILITY);
    const w = gatedWorld(r, env);
    const res = tx.simulate(w, tx.proposal("tx-i", [tx.consume("e1", tx.nodeOf("p-i"), tx.cash("20"))]), tx.route({ capacityNodeIds: [tx.nodeOf("p-i")], ruleIds: ["p-i"] }));
    expect(res.selectedPathResult).toBe("REVIEW_REQUIRED");
    expect(res.simulationStatus).toBe("REVIEW_REQUIRED");
    expect(tx.codes(res.limitations)).toContain("PHASE3_VERIFICATION_INCOMPLETE");
    expect(tx.codes(res.limitations)).not.toContain("PHASE3_VERIFICATION_MATERIAL_FINDING");
    expect(tx.amountOf(res.capacityEffects[0]!.provisional!.availableAmount)).toBe("100");
  });

  it("with no envelope, or an envelope for an unrelated unit under ALLOW_MISSING, simulation is byte-identical to today", () => {
    const r = tx.provision("p-z", tx.MONEY(100));
    const w = tx.world({ rules: [r] });
    const run = (context: typeof w.context) => JSON.stringify(tx.simulate({ ...w, context }, tx.proposal("tx-z", [tx.consume("e1", tx.nodeOf("p-z"), tx.cash("20"))]), tx.route({ capacityNodeIds: [tx.nodeOf("p-z")], ruleIds: ["p-z"] })));
    const legacy = run(w.context);
    expect(run({ ...w.context, policy: "ALLOW_MISSING" })).toBe(legacy);
    expect(run({ ...w.context, verification: resolve([disputedAt(tx.provision("p-other", tx.MONEY(1)), null)], tx.ORG, tx.FACILITY) })).toBe(legacy);
    expect(JSON.parse(legacy).selectedPathResult).toBe("SATISFIED");
  });
});
