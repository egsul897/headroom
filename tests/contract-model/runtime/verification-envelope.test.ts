/**
 * PHASE-4 VERIFICATION ENVELOPE - migration steps 1+2.
 *
 * Two things are pinned here and they pull in opposite directions on purpose:
 *
 *  1. The envelope can be carried end to end through every Phase-4 entry point, and the Phase-3
 *     resolver turns MATERIAL findings into identity-bound, exprId-scoped records deterministically.
 *  2. Carrying it changes NOTHING. A fully populated envelope with a MATERIAL finding on the exact
 *     value being evaluated executes exactly as it does today.
 *
 * (2) is the acceptance criterion of this migration and it is also the thing step 3 will
 * deliberately invert. The test named "...will be INVERTED by step 3" is the marker for that.
 */
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  compareVerificationIdentity,
  DEFAULT_VERIFICATION_POLICY,
  findVerificationUnit,
  identityOfUnit,
  identityStrengthOf,
  RUNTIME_VERIFICATION_ENVELOPE_VERSION,
  type RuntimeVerificationEnvelope,
} from "@/lib/contract-model/runtime/verification-envelope";
import { resolveRuntimeVerificationEnvelope, type ResolverUnitInput } from "@/lib/contract-model/verification-envelope/resolver";
import { evaluateExpression } from "@/lib/contract-model/runtime/evaluate-expression";
import { evaluateRule } from "@/lib/contract-model/runtime/rule-evaluator";
import { buildCapacityGraph } from "@/lib/contract-model/runtime/capacity/graph";
import { evaluateCapacityState } from "@/lib/contract-model/runtime/capacity/state";
import { fixtureInputResolver } from "@/lib/contract-model/runtime/input-resolver";
import type { IRDefinition, IRExpression, IRRule } from "@/lib/contract-model/ir/types";
import type { SemanticVerificationFinding, SemanticVerificationResult } from "@/lib/contract-model/compiler/semantic-verification/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let n = 0;
const eid = () => `env-test-expr-${++n}`;
const MONEY = (amount: number): IRExpression => ({ kind: "MONEY", type: "MONEY", amount, currency: "USD", exprId: eid() }) as IRExpression;
const PCT = (value: number): IRExpression => ({ kind: "PERCENT", type: "PERCENT", value, exprId: eid() }) as IRExpression;
const MAX = (...operands: IRExpression[]): IRExpression => ({ kind: "MAX", type: "MONEY", operands, exprId: eid() }) as IRExpression;
const UNLIMITED = { kind: "UNLIMITED_CAPACITY", type: "CAPACITY", gatedBy: null, provenance: null } as unknown as IRExpression;

function rule(overrides: Partial<IRRule> = {}): IRRule {
  return {
    ruleId: "ir-rule:env-test", irSchemaVersion: "v1", companyId: "env-co", instrumentKey: "env-inst", sourceDocumentId: "env-doc",
    sourceSectionRef: "1.01", covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: "INCUR_DEBT",
    entityScope: [], entityScopeExcluded: [], transactionScope: null, capacityExpression: null,
    conditions: [], exceptions: [], dependsOn: [], operativeLineage: null,
    sufficiency: "COMPLETE", sufficiencyReasons: [], provenance: null, compilerVersion: null, sourceContentVersion: null,
    ...overrides,
  } as unknown as IRRule;
}

function finding(overrides: Partial<SemanticVerificationFinding> = {}): SemanticVerificationFinding {
  return {
    findingId: "finding-1", companyId: "env-co", instrumentKey: "env-inst", sourceDocumentId: "env-doc", candidateRef: "cand-1",
    ruleOrDefinitionId: "ir-rule:env-test", irPath: null, findingType: "UNSUPPORTED_IR_ADDITION", severity: "MATERIAL",
    sourceEvidence: "(none)", sourceCitation: "§1.01", proposedIrEvidence: "(none)", verifierReasoning: "unsupported value",
    deterministicSignals: [], verificationMethod: "DETERMINISTIC_ONLY", provider: null, model: null,
    verifierAlgorithmVersion: "verifier-v1", verifierPromptVersion: null, resolutionStatus: "OPEN", createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as unknown as SemanticVerificationFinding;
}

function verification(findings: SemanticVerificationFinding[], overrides: Partial<SemanticVerificationResult> = {}): SemanticVerificationResult {
  return { candidateRef: "cand-1", status: "MATERIAL_DISCREPANCY", findings, semanticReviewInvoked: false, semanticReviewSkippedReason: null, conditionSuspicion: null, verifierAlgorithmVersion: "verifier-v1", verifiedAt: "2026-01-01T00:00:00.000Z", evidenceSetHash: "evidence-hash-1", ...overrides } as unknown as SemanticVerificationResult;
}

const resolve = (units: ResolverUnitInput[]) => resolveRuntimeVerificationEnvelope({ companyId: "env-co", instrumentKey: "env-inst", units });

// ---------------------------------------------------------------------------

describe("step 2 - resolver: MATERIAL findings become exprId-scoped records", () => {
  it("A: an exact machine path resolves to NODE with the node's own exprId", () => {
    const pct = PCT(1);
    const r = rule({ capacityExpression: MAX(MONEY(5), pct) as never });
    const out = resolve([{ kind: "RULE", unit: r, verification: verification([finding({ irPath: "rules[0].capacityExpression.operands[1]" })]) }]);
    const f = out.envelope.units[0]!.materialFindings[0]!;
    expect(f.scope).toBe("NODE");
    expect(f.exprIds).toEqual([pct.exprId]);
    expect(f.irPathAsGiven).toBe("rules[0].capacityExpression.operands[1]");
  });

  it.each([
    ["B wildcard", "rules[].capacityExpression", "UNIT_WILDCARD"],
    ["C prose", 'definitions[termName="Applicable EBITDA"].sufficiency; definitions[termName="X"].sufficiency', "UNIT_PROSE"],
    ["C annotated", "rules[0].capacityExpression (EBITDA, SCHEDULE)", "UNIT_PROSE"],
    ["valid path, no such node", "rules[0].capacityExpression.operands[9]", "UNIT_NO_SUCH_NODE"],
    ["valid path, not an expression", "rules[0].sufficiency", "UNIT_NOT_AN_EXPRESSION"],
    ["wrong root kind", "definitions[0].calculationExpression", "UNIT_WRONG_ROOT_KIND"],
  ])("%s -> UNIT, never dropped", (_label, path, expected) => {
    const r = rule({ capacityExpression: MAX(MONEY(5), PCT(1)) as never });
    const out = resolve([{ kind: "RULE", unit: r, verification: verification([finding({ irPath: path })]) }]);
    expect(out.envelope.units[0]!.materialFindings).toHaveLength(1);
    expect(out.envelope.units[0]!.materialFindings[0]!.scope).toBe("UNIT");
    expect(out.envelope.units[0]!.materialFindings[0]!.exprIds).toEqual([]);
    expect(out.audit[0]!.resolution).toBe(expected);
  });

  it("D: a pathless MATERIAL finding becomes UNIT and keeps its identity", () => {
    const out = resolve([{ kind: "RULE", unit: rule({ capacityExpression: MONEY(5) as never }), verification: verification([finding({ irPath: null })]) }]);
    expect(out.envelope.units[0]!.materialFindings[0]).toMatchObject({ scope: "UNIT", exprIds: [], findingId: "finding-1" });
    expect(out.audit[0]!.resolution).toBe("UNIT_NO_PATH");
  });

  it("E/F: NON_MATERIAL and UNCERTAIN findings never enter the envelope", () => {
    const pct = PCT(1);
    const r = rule({ capacityExpression: pct as never });
    const path = "rules[0].capacityExpression";
    const out = resolve([{ kind: "RULE", unit: r, verification: verification([
      finding({ findingId: "f-nonmaterial", severity: "NON_MATERIAL" as never, irPath: path }),
      finding({ findingId: "f-uncertain", severity: "UNCERTAIN" as never, irPath: path }),
      finding({ findingId: "f-material", severity: "MATERIAL", irPath: path }),
    ]) }]);
    expect(out.envelope.units[0]!.materialFindings.map((f) => f.findingId)).toEqual(["f-material"]);
    expect(out.counts.EXCLUDED_NON_MATERIAL).toBe(2);
  });

  it("G/H: several findings on the same node are kept separately, with deterministic order and de-duplicated exprIds", () => {
    const pct = PCT(1);
    const r = rule({ capacityExpression: pct as never });
    const out = resolve([{ kind: "RULE", unit: r, verification: verification([
      finding({ findingId: "f-b", irPath: "rules[0].capacityExpression" }),
      finding({ findingId: "f-a", irPath: "rules[0].capacityExpression" }),
      finding({ findingId: "f-c", irPath: null }),
    ]) }]);
    const fs2 = out.envelope.units[0]!.materialFindings;
    // NODE-scoped first, then UNIT; ties broken by findingId
    expect(fs2.map((f) => f.findingId)).toEqual(["f-a", "f-b", "f-c"]);
    expect(fs2[0]!.exprIds).toEqual([pct.exprId]);
    expect(fs2[1]!.exprIds).toEqual([pct.exprId]);
  });

  it("I: UNLIMITED_CAPACITY carries no exprId, so a finding on it is UNIT-scoped", () => {
    const r = rule({ capacityExpression: UNLIMITED as never });
    const out = resolve([{ kind: "RULE", unit: r, verification: verification([finding({ irPath: "rules[0].capacityExpression" })]) }]);
    expect(out.envelope.units[0]!.materialFindings[0]!.scope).toBe("UNIT");
    expect(out.audit[0]!.resolution).toBe("UNIT_NOT_AN_EXPRESSION");
  });

  it("N: a unit with no findings still produces a valid record", () => {
    const out = resolve([{ kind: "RULE", unit: rule(), verification: verification([], { status: "VERIFIED_NO_MATERIAL_GAP_FOUND" }) }]);
    expect(out.envelope.units[0]!.materialFindings).toEqual([]);
    expect(out.envelope.units[0]!.verificationStatus).toBe("VERIFIED_NO_MATERIAL_GAP_FOUND");
    expect(out.envelope.envelopeVersion).toBe(RUNTIME_VERIFICATION_ENVELOPE_VERSION);
  });

  it("J: resolution happens against the unit as verified, so reordering rules cannot change the binding", () => {
    const pct = PCT(1);
    const a = rule({ ruleId: "ir-rule:aaa", capacityExpression: MONEY(1) as never });
    const b = rule({ ruleId: "ir-rule:bbb", capacityExpression: pct as never });
    const vb = verification([finding({ ruleOrDefinitionId: "ir-rule:bbb", irPath: "rules[0].capacityExpression" })]);
    const forward = resolve([{ kind: "RULE", unit: a, verification: verification([]) }, { kind: "RULE", unit: b, verification: vb }]);
    const reversed = resolve([{ kind: "RULE", unit: b, verification: vb }, { kind: "RULE", unit: a, verification: verification([]) }]);
    expect(JSON.stringify(forward.envelope)).toBe(JSON.stringify(reversed.envelope));
    const bound = forward.envelope.units.find((u) => u.identity.ruleOrDefinitionId === "ir-rule:bbb")!;
    expect(bound.materialFindings[0]!.exprIds).toEqual([pct.exprId]);
  });

  it("K/L: identity strength reflects what the versions can actually prove", () => {
    const weak = resolve([{ kind: "RULE", unit: rule(), verification: verification([]) }]);
    expect(weak.envelope.units[0]!.identityStrength).toBe("WEAK");
    const strong = resolve([{ kind: "RULE", unit: rule({ compilerVersion: "compiler-v9", sourceContentVersion: "content-abc" }), verification: verification([]) }]);
    expect(strong.envelope.units[0]!.identityStrength).toBe("STRONG");
  });

  it("verifier version and evidence hash are preserved, and absence is preserved honestly", () => {
    const present = resolve([{ kind: "RULE", unit: rule(), verification: verification([]) }]).envelope.units[0]!;
    expect(present).toMatchObject({ verifierAlgorithmVersion: "verifier-v1", evidenceSetHash: "evidence-hash-1" });
    const absent = resolve([{ kind: "RULE", unit: rule(), verification: verification([], { evidenceSetHash: undefined as never }) }]).envelope.units[0]!;
    expect(absent.evidenceSetHash).toBeNull();
  });

  it("no MATERIAL finding is ever lost: in == out", () => {
    const r = rule({ capacityExpression: PCT(1) as never });
    const paths = [null, "rules[].x", "rules[0].capacityExpression", "rules[0].nope", 'definitions[termName="Z"].x'];
    const out = resolve([{ kind: "RULE", unit: r, verification: verification(paths.map((p, i) => finding({ findingId: `f${i}`, irPath: p }))) }]);
    expect(out.counts.MATERIAL_IN).toBe(paths.length);
    expect(out.counts.MATERIAL_OUT).toBe(paths.length);
    expect(out.envelope.units[0]!.materialFindings).toHaveLength(paths.length);
  });

  it("is deterministic: the same input twice is byte-identical", () => {
    const build = () => { n = 0; const pct = PCT(1); return resolve([{ kind: "RULE", unit: rule({ capacityExpression: MAX(MONEY(5), pct) as never }), verification: verification([finding({ findingId: "f2", irPath: "rules[0].capacityExpression.operands[1]" }), finding({ findingId: "f1", irPath: null })]) }]); };
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
  });
});

describe("step 2 - identity mismatch is detectable (M)", () => {
  const actual = identityOfUnit({ ruleId: "ir-rule:env-test", companyId: "env-co", instrumentKey: "env-inst", irSchemaVersion: "v1", compilerVersion: "c1", sourceContentVersion: "s1" });
  it.each([
    ["exact match", actual, true, []],
    ["rule-id mismatch", { ...actual, ruleOrDefinitionId: "ir-rule:other" }, false, ["ruleOrDefinitionId"]],
    ["company mismatch", { ...actual, companyId: "other-co" }, false, ["companyId"]],
    ["instrument mismatch", { ...actual, instrumentKey: "other-inst" }, false, ["instrumentKey"]],
    ["compiler-version mismatch", { ...actual, compilerVersion: "c2" }, false, ["compilerVersion"]],
    ["source-version mismatch", { ...actual, sourceContentVersion: "s2" }, false, ["sourceContentVersion"]],
  ])("%s", (_label, claimed, matches, mismatches) => {
    const r = compareVerificationIdentity(claimed as never, actual);
    expect(r.matches).toBe(matches);
    expect(r.mismatches).toEqual(mismatches);
  });

  it("a nullable source version makes the claim WEAK even when nothing contradicts it", () => {
    expect(identityStrengthOf({ ...actual, sourceContentVersion: null })).toBe("WEAK");
  });
});

describe("step 1 - the envelope is INERT", () => {
  const pct = PCT(1);
  const disputed = rule({ ruleId: "ir-rule:disputed", capacityExpression: pct as never });
  const envelope: RuntimeVerificationEnvelope = resolve([{ kind: "RULE", unit: disputed, verification: verification([finding({ ruleOrDefinitionId: "ir-rule:disputed", irPath: "rules[0].capacityExpression" })]) }]).envelope;
  const inputs = fixtureInputResolver({ metrics: [] });

  it("carries a NODE-scoped MATERIAL finding on the exact evaluated value - the setup step 3 will act on", () => {
    const unit = findVerificationUnit(envelope, "ir-rule:disputed")!;
    expect(unit.materialFindings[0]).toMatchObject({ scope: "NODE", exprIds: [pct.exprId] });
  });

  it("WILL BE INVERTED BY STEP 3: with that envelope supplied, evaluation is still byte-identical to omitting it", () => {
    const without = evaluateExpression({ expression: disputed.capacityExpression as never, inputs });
    const withEnvelope = evaluateExpression({ expression: disputed.capacityExpression as never, inputs, verification: envelope, policy: "REQUIRE" });
    expect(JSON.stringify(withEnvelope)).toBe(JSON.stringify(without));
    expect(withEnvelope.status).toBe("EXECUTABLE");
  });

  it("evaluateRule, buildCapacityGraph and evaluateCapacityState are equally unaffected", () => {
    const rules = [disputed];
    const definitions: IRDefinition[] = [];
    expect(JSON.stringify(evaluateRule(disputed, inputs, { asOf: "2026-01-01" }))).toBe(JSON.stringify(evaluateRule(disputed, inputs, { asOf: "2026-01-01", unitId: "ir-rule:disputed" })));

    const graphPlain = buildCapacityGraph({ companyId: "env-co", instrumentKey: "env-inst", rules, definitions, asOf: "2026-01-01" });
    const graphEnv = buildCapacityGraph({ companyId: "env-co", instrumentKey: "env-inst", rules, definitions, asOf: "2026-01-01", verification: envelope });
    expect(JSON.stringify(graphEnv)).toBe(JSON.stringify(graphPlain));

    const statePlain = evaluateCapacityState({ graph: graphPlain, rules, definitions, inputs, asOf: "2026-01-01" });
    const stateEnv = evaluateCapacityState({ graph: graphEnv, rules, definitions, inputs, asOf: "2026-01-01", verification: envelope, policy: "REQUIRE" });
    expect(JSON.stringify(stateEnv)).toBe(JSON.stringify(statePlain));
  });

  it("the default policy is ALLOW_MISSING, and REQUIRE is documented as inert", () => {
    expect(DEFAULT_VERIFICATION_POLICY).toBe("ALLOW_MISSING");
    const src = fs.readFileSync("lib/contract-model/runtime/verification-envelope.ts", "utf8");
    expect(src).toMatch(/NOTHING IN THIS FILE GATES ANYTHING/);
    expect(src).toMatch(/REQUIRE is inert/);
  });
});

describe("step 3 has NOT been implemented", () => {
  it("no matcher, dominance table, runtime diagnostic or limitation code for verification exists in production", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith(".ts")) {
          // Comments are stripped first: verification-envelope.ts deliberately NAMES the step-3
          // machinery in order to say it does not exist. A real implementation would survive this.
          const code = fs.readFileSync(full, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
          if (/\bblocksNode\b|\bblocksUnit\b|VERIFICATION_DOMINANCE|MATERIAL_VERIFICATION_FINDING|PHASE3_VERIFICATION_MATERIAL_FINDING/.test(code)) offenders.push(full);
        }
      }
    };
    walk("lib");
    expect(offenders).toHaveLength(0);
  });
});
