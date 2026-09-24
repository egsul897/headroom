/**
 * VERIFIED EXECUTION - the strict product boundary (verification-gate migration step 4).
 *
 * Two layers, pinned as deliberately different: the raw runtime primitives stay ALLOW_MISSING for
 * tests, scripts and fixtures; the boundary is REQUIRE with no way for a caller to say otherwise.
 * Everything below is one of: the no-downgrade proof, the end-to-end matrix A-N, the chain-integrity
 * stale combinations, transitive coverage, the no-re-verification proof, and the architecture test
 * that keeps product code from walking around this module to the raw primitives.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { SemanticVerificationFinding, SemanticVerificationResult, SemanticVerificationStatus } from "@/lib/contract-model/compiler/semantic-verification/types";
import type { IRDefinition, IRExpression, IRRule } from "@/lib/contract-model/ir/types";
import { DEFAULT_VERIFICATION_POLICY, type RuntimeVerificationIdentity } from "@/lib/contract-model/runtime/verification-envelope";
import { buildCapacityGraph, evaluateCapacityState } from "@/lib/contract-model/runtime/capacity";
import { simulateTransaction } from "@/lib/contract-model/runtime/transaction";
import {
  evaluateVerifiedCapacity, simulateVerifiedTransaction, VERIFIED_EXECUTION_POLICY,
  type VerifiedCapacityArgs, type VerifiedExecutionPackage, type VerifiedUnitArtifact,
} from "@/lib/contract-model/verified-execution";
import * as tx from "./runtime/transaction/helpers";

// ---------------------------------------------------------------------------
// Fixtures - real financial inputs through the Phase-4B snapshot resolver, real IR builders
// ---------------------------------------------------------------------------

const idOf = (u: IRRule | IRDefinition) => ("ruleId" in u ? u.ruleId : u.definitionId);
const identityOf = (u: IRRule | IRDefinition, over: Partial<RuntimeVerificationIdentity> = {}): RuntimeVerificationIdentity =>
  ({ ruleOrDefinitionId: idOf(u), companyId: u.companyId, instrumentKey: u.instrumentKey, irSchemaVersion: u.irSchemaVersion, compilerVersion: u.compilerVersion, sourceContentVersion: u.sourceContentVersion, ...over });

function finding(unitId: string, irPath: string | null, over: Partial<SemanticVerificationFinding> = {}): SemanticVerificationFinding {
  return {
    findingId: `f-${unitId}`, companyId: tx.ORG, instrumentKey: tx.FACILITY, sourceDocumentId: "doc", candidateRef: "cand-1",
    ruleOrDefinitionId: unitId, irPath, findingType: "UNSUPPORTED_IR_ADDITION", severity: "MATERIAL",
    sourceEvidence: "(none)", sourceCitation: "§1", proposedIrEvidence: "(none)", verifierReasoning: "unsupported",
    deterministicSignals: [], verificationMethod: "DETERMINISTIC_ONLY", provider: null, model: null,
    verifierAlgorithmVersion: "verifier-v1", verifierPromptVersion: null, resolutionStatus: "OPEN", createdAt: "2026-01-01T00:00:00.000Z", ...over,
  } as unknown as SemanticVerificationFinding;
}
function result(findings: SemanticVerificationFinding[] = [], status?: SemanticVerificationStatus): SemanticVerificationResult {
  return { candidateRef: "cand-1", status: status ?? (findings.some((f) => f.severity === "MATERIAL") ? "MATERIAL_DISCREPANCY" : "VERIFIED_NO_MATERIAL_GAP_FOUND"), findings, semanticReviewInvoked: false, semanticReviewSkippedReason: null, conditionSuspicion: null, verifierAlgorithmVersion: "verifier-v1", verifiedAt: "2026-01-01T00:00:00.000Z", evidenceSetHash: "eh-1" } as unknown as SemanticVerificationResult;
}
/** The paired artifact a Phase-3 run persists: the result plus the identity of the IR it verified. */
const artifact = (u: IRRule | IRDefinition, findings: SemanticVerificationFinding[] = [], status?: SemanticVerificationStatus, identityOver: Partial<RuntimeVerificationIdentity> = {}): VerifiedUnitArtifact =>
  ({ ruleOrDefinitionId: idOf(u), kind: "ruleId" in u ? "RULE" : "DEFINITION", verifiedIdentity: identityOf(u, identityOver), result: result(findings, status) });

const STRONG = { compilerVersion: "c1", sourceContentVersion: "s1" } as const;
/** A rule whose identity is fully versioned, so a matching artifact is STRONG. */
const rule = (ruleId: string, capacity: IRExpression, over: Partial<IRRule> = {}) => tx.provision(ruleId, capacity, { ...STRONG, ...over });
const definition = (definitionId: string, termName: string, calc: IRExpression, over: Partial<IRDefinition> = {}): IRDefinition =>
  ({ definitionId, irSchemaVersion: "t", companyId: tx.ORG, instrumentKey: tx.FACILITY, sourceDocumentId: "doc", termName, covenantFamily: "DEFINITIONS_CALCULATION_RULES", calculationExpression: calc, dependsOnTerms: [], sufficiency: "COMPLETE", sufficiencyReasons: [], provenance: null, ...STRONG, ...over }) as unknown as IRDefinition;
const TERM = (termName: string, resolvedDefinitionId: string): IRExpression => ({ kind: "DEFINED_TERM_REFERENCE", type: "MONEY", termName, resolvedDefinitionId, companyId: tx.ORG, instrumentKey: tx.FACILITY, exprId: `term-${resolvedDefinitionId}` }) as IRExpression;
const RULEREF = (ruleId: string): IRExpression => ({ kind: "RULE_REFERENCE", type: "CAPACITY", ruleId, companyId: tx.ORG, instrumentKey: tx.FACILITY, exprId: `ref-${ruleId}` }) as IRExpression;

const pkg = (rules: IRRule[], verifications: VerifiedUnitArtifact[], definitions: IRDefinition[] = [], over: Partial<VerifiedExecutionPackage> = {}): VerifiedExecutionPackage =>
  ({ companyId: tx.ORG, instrumentKey: tx.FACILITY, rules, definitions, verifications, ...over });
const FACTS = [tx.figure("fig-1", "1000")];
const inputsFor = (rules: IRRule[], definitions: IRDefinition[] = []) => tx.resolverFor(FACTS, definitions, rules);
const args = (p: VerifiedExecutionPackage, ledger: ReturnType<typeof tx.usage>[] = []): VerifiedCapacityArgs => ({ package: p, inputs: inputsFor([...p.rules], [...(p.definitions ?? [])]), ledger, asOf: tx.WHEN });
const codes = (ls: readonly { code: string }[]) => ls.map((l) => l.code).sort();
const entry = (r: ReturnType<typeof evaluateVerifiedCapacity>, ruleId: string) => {
  if (r.outcome !== "EXECUTED") throw new Error(`expected EXECUTED, got ${r.outcome}`);
  return r.state.capacities.find((c) => c.ruleId === ruleId)!;
};

/** 20% of fig-1 = 200. A capacity that needs a real financial fact, so "clean" means the whole chain worked. */
const cleanRule = (id = "p-clean") => rule(id, tx.MUL(tx.PCT(0.2), tx.FIGURE("fig-1")));

// ---------------------------------------------------------------------------

describe("two layers, deliberately different: raw primitives ALLOW_MISSING, boundary REQUIRE (§3, §18)", () => {
  it("the boundary's policy is a constant REQUIRE and every result states it", () => {
    expect(VERIFIED_EXECUTION_POLICY).toBe("REQUIRE");
    const r = evaluateVerifiedCapacity(args(pkg([cleanRule()], [artifact(cleanRule())])));
    expect(r.policy).toBe("REQUIRE");
    expect(evaluateVerifiedCapacity(args(pkg([cleanRule()], []))).policy).toBe("REQUIRE");
  });
  it("the raw primitive default is still ALLOW_MISSING after this mission", () => {
    expect(DEFAULT_VERIFICATION_POLICY).toBe("ALLOW_MISSING");
  });
  it("a caller cannot downgrade: there is no policy argument, and smuggling one in changes nothing", () => {
    const a = cleanRule("p-a"), b = cleanRule("p-b");
    const base = args(pkg([a, b], [artifact(a)]));
    // @ts-expect-error - VerifiedCapacityArgs has no `policy` field on purpose
    const smuggled: VerifiedCapacityArgs = { ...base, policy: "ALLOW_MISSING" };
    const r = evaluateVerifiedCapacity(smuggled);
    expect(r.policy).toBe("REQUIRE");
    expect(entry(r, "p-b").status).toBe("REVIEW_REQUIRED");
    expect(entry(r, "p-b").limitations[0]!.message).toMatch(/^\[REQUIRED_VERIFICATION_MISSING\]/);
    expect(JSON.stringify(r)).toBe(JSON.stringify(evaluateVerifiedCapacity(base)));
  });
  it("the boundary source never names ALLOW_MISSING in code and takes no policy from any argument", () => {
    const code = fs.readFileSync("lib/contract-model/verified-execution.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/ALLOW_MISSING/);
    expect(code).not.toMatch(/policy\s*\?\s*:/);
    expect(code).not.toMatch(/args\.policy|\.policy\s*\?\?/);
    expect(code).toMatch(/VERIFIED_EXECUTION_POLICY = "REQUIRE" as const/);
  });
});

describe("end-to-end matrix (§21)", () => {
  it("A. CLEAN: complete verified package -> AVAILABLE, exactly the legacy arithmetic, state byte-identical to the raw path", () => {
    const r0 = cleanRule();
    const r = evaluateVerifiedCapacity(args(pkg([r0], [artifact(r0)])));
    expect(r.outcome).toBe("EXECUTED");
    const e = entry(r, "p-clean");
    expect(e.status).toBe("AVAILABLE");
    expect(tx.amountOf(e.effectiveRemaining)).toBe("200");
    expect(e.limitations).toEqual([]);
    if (r.outcome !== "EXECUTED") return;
    expect(r.coverage).toMatchObject({ unitsInPackage: 1, unitsWithVerification: 1, unitsMissingVerification: [], unitsRefusedByGate: [], unitsIncompletelyVerified: [], identityStrength: { STRONG: 1, WEAK: 0 }, complete: true });
    const graph = buildCapacityGraph({ companyId: tx.ORG, instrumentKey: tx.FACILITY, rules: [r0], definitions: [], asOf: tx.WHEN });
    const raw = evaluateCapacityState({ graph, rules: [r0], definitions: [], inputs: inputsFor([r0]), asOf: tx.WHEN });
    expect(r.state.stateHash).toBe(raw.stateHash);
    expect(JSON.stringify(r.state)).toBe(JSON.stringify(raw));
  });

  it("B. MISSING_VERIFICATION: no artifact at all -> REFUSED VERIFICATION_ARTIFACT_INCOMPLETE; nothing is evaluated", () => {
    const r = evaluateVerifiedCapacity(args(pkg([cleanRule()], [])));
    expect(r.outcome).toBe("REFUSED");
    if (r.outcome !== "REFUSED") return;
    expect(codes(r.refusals)).toEqual(["VERIFICATION_ARTIFACT_INCOMPLETE"]);
    expect("state" in r).toBe(false);
    expect(r.packageHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("C. MISSING_UNIT: envelope lacks a used rule -> that rule fails closed; the verified rule stays readable; coverage says so", () => {
    const a = cleanRule("p-a"), b = cleanRule("p-b");
    const r = evaluateVerifiedCapacity(args(pkg([a, b], [artifact(a)])));
    expect(entry(r, "p-a").status).toBe("AVAILABLE");
    expect(tx.amountOf(entry(r, "p-a").effectiveRemaining)).toBe("200");
    expect(entry(r, "p-b").status).toBe("REVIEW_REQUIRED");
    expect(codes(entry(r, "p-b").limitations)).toEqual(["PHASE3_VERIFICATION_MATERIAL_FINDING"]);
    expect(entry(r, "p-b").grossCapacity.kind).toBe("NOT_DETERMINED");
    if (r.outcome !== "EXECUTED") return;
    expect(r.coverage.unitsMissingVerification).toEqual(["p-b"]);
    expect(r.coverage.unitsRefusedByGate).toEqual([{ unitId: "p-b", reason: "REQUIRED_VERIFICATION_MISSING", identityStrength: null }]);
    expect(r.coverage.complete).toBe(false);
  });

  it("D. TRANSITIVE_MISSING: a verified rule expanding an unverified definition fails at the definition; verifying both succeeds (§16)", () => {
    const d = definition("d-ebitda", "EBITDA", tx.FIGURE("fig-1"));
    const a = rule("p-a", tx.MUL(tx.PCT(0.2), TERM("EBITDA", "d-ebitda")));
    const partial = evaluateVerifiedCapacity(args(pkg([a], [artifact(a)], [d])));
    expect(entry(partial, "p-a").status).toBe("REVIEW_REQUIRED");
    expect(entry(partial, "p-a").limitations[0]!.message).toMatch(/^\[REQUIRED_VERIFICATION_MISSING\].*d-ebitda/);
    expect(entry(partial, "p-a").evaluation!.diagnostics[0]!.verification).toMatchObject({ reason: "REQUIRED_VERIFICATION_MISSING", unitId: "d-ebitda" });
    if (partial.outcome === "EXECUTED") expect(partial.coverage.unitsMissingVerification).toEqual(["d-ebitda"]);
    const full = evaluateVerifiedCapacity(args(pkg([a], [artifact(a), artifact(d)], [d])));
    expect(entry(full, "p-a").status).toBe("AVAILABLE");
    expect(tx.amountOf(entry(full, "p-a").effectiveRemaining)).toBe("200");
    if (full.outcome === "EXECUTED") expect(full.coverage.complete).toBe(true);
  });

  it("D2. the same holds for a referenced rule: A's record is not blanket authorization for C", () => {
    const c = rule("p-c", tx.MONEY(500));
    const a = rule("p-a", RULEREF("p-c"));
    const partial = evaluateVerifiedCapacity(args(pkg([a, c], [artifact(a)])));
    expect(entry(partial, "p-a").status).toBe("REVIEW_REQUIRED");
    expect(entry(partial, "p-a").evaluation!.diagnostics[0]!.verification).toMatchObject({ reason: "REQUIRED_VERIFICATION_MISSING", unitId: "p-c" });
    const full = evaluateVerifiedCapacity(args(pkg([a, c], [artifact(a), artifact(c)])));
    expect(entry(full, "p-a").status).toBe("AVAILABLE");
    expect(tx.amountOf(entry(full, "p-a").effectiveRemaining)).toBe("500");
  });

  it("E. MATERIAL_NODE: exact-node finding on the PERCENT literal -> UNSUPPORTED; the literal never becomes AVAILABLE (§13)", () => {
    const r0 = cleanRule();
    const r = evaluateVerifiedCapacity(args(pkg([r0], [artifact(r0, [finding("p-clean", "rules[0].capacityExpression.operands[0]")])])));
    const e = entry(r, "p-clean");
    expect(e.status).toBe("UNSUPPORTED");
    expect(e.limitations[0]!.message).toMatch(/^\[MATERIAL_NODE_HIT\]/);
    expect(e.grossCapacity.kind).toBe("NOT_DETERMINED");
    expect(JSON.stringify(e)).not.toMatch(/"amount":"200"/);
    if (r.outcome === "EXECUTED") expect(r.coverage.unitsRefusedByGate).toEqual([]); // node-local, not a unit refusal
  });

  it("F. MATERIAL_UNIT: an unscopable material finding -> REVIEW_REQUIRED floor, whole unit refused", () => {
    const r0 = cleanRule();
    const r = evaluateVerifiedCapacity(args(pkg([r0], [artifact(r0, [finding("p-clean", "rules[].exceptions")])])));
    expect(entry(r, "p-clean").status).toBe("REVIEW_REQUIRED");
    expect(entry(r, "p-clean").limitations[0]!.message).toMatch(/^\[MATERIAL_UNIT_FINDING\]/);
    if (r.outcome === "EXECUTED") expect(r.coverage.unitsRefusedByGate).toEqual([{ unitId: "p-clean", reason: "MATERIAL_UNIT_FINDING", identityStrength: "STRONG" }]);
  });

  it("G. IDENTITY_MISMATCH: the verifier saw compiler version X, the package carries Y -> fails closed, fields named (§10 A)", () => {
    const r0 = cleanRule();
    const r = evaluateVerifiedCapacity(args(pkg([r0], [artifact(r0, [], undefined, { compilerVersion: "c-old" })])));
    expect(entry(r, "p-clean").status).toBe("REVIEW_REQUIRED");
    expect(entry(r, "p-clean").limitations[0]!.message).toMatch(/^\[IDENTITY_MISMATCH\].*compilerVersion/);
    if (r.outcome === "EXECUTED") {
      expect(r.coverage.unitsRefusedByGate).toEqual([{ unitId: "p-clean", reason: "IDENTITY_MISMATCH", identityStrength: "STRONG" }]);
      expect(r.coverage.complete).toBe(false);
    }
    // a NODE finding on the stale record is never salvaged either
    const stale = evaluateVerifiedCapacity(args(pkg([r0], [artifact(r0, [finding("p-clean", "rules[0].capacityExpression.operands[0]")], undefined, { irSchemaVersion: "t-old" })])));
    expect(entry(stale, "p-clean").limitations[0]!.message).toMatch(/^\[IDENTITY_MISMATCH\].*irSchemaVersion/);
  });

  it("H. INCOMPLETE: VERIFICATION_INCOMPLETE / FAILED / NOT_VERIFIED with no material finding -> provisional arithmetic + REVIEW_REQUIRED under its own code (§12)", () => {
    const r0 = cleanRule();
    for (const status of ["VERIFICATION_INCOMPLETE", "VERIFICATION_FAILED", "NOT_VERIFIED"] as const) {
      const r = evaluateVerifiedCapacity(args(pkg([r0], [artifact(r0, [], status)])));
      const e = entry(r, "p-clean");
      expect(e.status).toBe("REVIEW_REQUIRED");
      expect(codes(e.limitations)).toEqual(["PHASE3_VERIFICATION_INCOMPLETE"]);
      expect(tx.amountOf(e.provisional!.effectiveRemaining)).toBe("200");
      expect(e.grossCapacity.kind).toBe("NOT_DETERMINED");
      if (r.outcome === "EXECUTED") {
        expect(r.coverage.unitsIncompletelyVerified).toEqual(["p-clean"]);
        expect(r.coverage.unitsRefusedByGate).toEqual([]);
        expect(r.coverage.complete).toBe(false);
      }
    }
    // incomplete + a material node finding: the finding still blocks by scope
    const both = evaluateVerifiedCapacity(args(pkg([r0], [artifact(r0, [finding("p-clean", "rules[0].capacityExpression.operands[0]")], "VERIFICATION_INCOMPLETE")])));
    expect(entry(both, "p-clean").status).toBe("UNSUPPORTED");
    expect(codes(entry(both, "p-clean").limitations)).toEqual(["PHASE3_VERIFICATION_INCOMPLETE", "PHASE3_VERIFICATION_MATERIAL_FINDING"]);
  });

  it("I. CLEAN_TRANSACTION: verified capacity -> normal simulation, byte-identical to the raw path", () => {
    const r0 = cleanRule();
    const p = pkg([r0], [artifact(r0)]);
    const transaction = tx.proposal("tx-clean", [tx.consume("e1", tx.nodeOf("p-clean"), tx.cash("20"))]);
    const selectedPath = tx.route({ capacityNodeIds: [tx.nodeOf("p-clean")], ruleIds: ["p-clean"] });
    const r = simulateVerifiedTransaction({ ...args(p), transaction, selectedPath });
    expect(r.outcome).toBe("EXECUTED");
    if (r.outcome !== "EXECUTED") return;
    expect(r.simulation.selectedPathResult).toBe("SATISFIED");
    expect(r.simulation.simulationStatus).toBe("SIMULATED");
    expect(r.simulation.commitPlan.committable).toBe(true);
    const w = tx.world({ rules: [r0], facts: FACTS });
    const raw = simulateTransaction({ transaction, currentState: w.state, capacityGraph: w.graph, selectedPath, inputs: w.inputs, context: w.context });
    expect(JSON.stringify(r.simulation)).toBe(JSON.stringify(raw));
  });

  it("J. BLOCKED_TRANSACTION: a materially blocked capacity -> REVIEW_REQUIRED, not committable, nothing mutated (§13, §27)", () => {
    const r0 = cleanRule();
    const ledger = [tx.usage("u1", "10", tx.onProvision("p-clean"))];
    const p = pkg([r0], [artifact(r0, [finding("p-clean", "rules[0].capacityExpression.operands[0]")])]);
    const before = JSON.stringify({ p, ledger });
    const r = simulateVerifiedTransaction({ ...args(p, ledger), transaction: tx.proposal("tx-blocked", [tx.consume("e1", tx.nodeOf("p-clean"), tx.cash("20"))]), selectedPath: tx.route({ capacityNodeIds: [tx.nodeOf("p-clean")], ruleIds: ["p-clean"] }) });
    expect(r.outcome).toBe("EXECUTED");
    if (r.outcome !== "EXECUTED") return;
    expect(r.capacity.capacities[0]!.status).toBe("UNSUPPORTED");
    expect(r.simulation.selectedPathResult).toBe("REVIEW_REQUIRED");
    expect(r.simulation.simulationStatus).toBe("REVIEW_REQUIRED");
    expect(tx.codes(r.simulation.limitations)).toContain("PHASE3_VERIFICATION_MATERIAL_FINDING");
    expect(r.simulation.commitPlan.committable).toBe(false);
    expect(JSON.stringify({ p, ledger })).toBe(before);
    expect(r.simulation.preTransactionState.stateHash).toBe(r.capacity.stateHash);
    expect(JSON.stringify(r.simulation)).not.toMatch(/"amount":"200"/);
  });

  it("K. WRONG_COMPANY: an artifact claiming another company fails closed; a unit for another company refuses the package (§10 C)", () => {
    const r0 = cleanRule();
    const claim = evaluateVerifiedCapacity(args(pkg([r0], [artifact(r0, [], undefined, { companyId: "someone-else" })])));
    expect(entry(claim, "p-clean").limitations[0]!.message).toMatch(/^\[IDENTITY_MISMATCH\].*companyId/);
    const foreign = tx.provision("p-foreign", tx.MONEY(1), { ...STRONG, companyId: "someone-else" });
    const p = evaluateVerifiedCapacity(args(pkg([r0, foreign], [artifact(r0), artifact(foreign)])));
    expect(p.outcome).toBe("REFUSED");
    if (p.outcome === "REFUSED") expect(p.refusals).toEqual([{ code: "IR_PACKAGE_INCONSISTENT", message: expect.stringContaining("another company or instrument"), refs: ["p-foreign"] }]);
  });

  it("L. WRONG_INSTRUMENT: the same, for the instrument (§10 D)", () => {
    const r0 = cleanRule();
    const claim = evaluateVerifiedCapacity(args(pkg([r0], [artifact(r0, [], undefined, { instrumentKey: "other-facility" })])));
    expect(entry(claim, "p-clean").limitations[0]!.message).toMatch(/^\[IDENTITY_MISMATCH\].*instrumentKey/);
    const foreign = tx.provision("p-foreign", tx.MONEY(1), { ...STRONG, instrumentKey: "other-facility" });
    const p = evaluateVerifiedCapacity(args(pkg([r0, foreign], [artifact(r0), artifact(foreign)])));
    expect(p.outcome).toBe("REFUSED");
    if (p.outcome === "REFUSED") expect(codes(p.refusals)).toEqual(["IR_PACKAGE_INCONSISTENT"]);
  });

  it("M. WEAK_IDENTITY: null source version matches null, executes, and is reported WEAK - never as verified-clean (§10 E)", () => {
    const weakRule = tx.provision("p-weak", tx.MUL(tx.PCT(0.2), tx.FIGURE("fig-1"))); // compilerVersion null, sourceContentVersion null
    const r = evaluateVerifiedCapacity(args(pkg([weakRule], [artifact(weakRule)])));
    expect(entry(r, "p-weak").status).toBe("AVAILABLE");
    if (r.outcome !== "EXECUTED") return;
    expect(r.coverage.identityStrength).toEqual({ STRONG: 0, WEAK: 1 });
    expect(r.envelope.units[0]!.identityStrength).toBe("WEAK");
    expect(JSON.stringify(r)).not.toMatch(/verifiedClean|VERIFIED_CLEAN|"verified":\s*true/);
    // a claimed source version the IR does not carry is a disagreement, not a free upgrade
    const claimed = evaluateVerifiedCapacity(args(pkg([weakRule], [artifact(weakRule, [], undefined, { sourceContentVersion: "s1" })])));
    expect(entry(claimed, "p-weak").limitations[0]!.message).toMatch(/^\[IDENTITY_MISMATCH\].*sourceContentVersion/);
    // and a material finding on a WEAK record still blocks
    const disputed = evaluateVerifiedCapacity(args(pkg([weakRule], [artifact(weakRule, [finding("p-weak", "rules[0].capacityExpression.operands[0]")])])));
    expect(entry(disputed, "p-weak").status).toBe("UNSUPPORTED");
  });
});

describe("chain integrity (§10 B) and package binding", () => {
  it("verification for rule A with runtime rule B -> REFUSED VERIFICATION_IDENTITY_UNBOUND; nothing is evaluated", () => {
    const a = cleanRule("p-a"), b = cleanRule("p-b");
    const r = evaluateVerifiedCapacity(args(pkg([b], [artifact(a)])));
    expect(r.outcome).toBe("REFUSED");
    if (r.outcome === "REFUSED") expect(r.refusals).toEqual([{ code: "VERIFICATION_IDENTITY_UNBOUND", message: expect.stringContaining("p-a"), refs: ["p-a"] }]);
  });
  it("an artifact that contradicts itself about which unit it is for, or the unit's kind, is unbound", () => {
    const a = cleanRule("p-a"), b = cleanRule("p-b");
    const contradictory = { ...artifact(a), verifiedIdentity: identityOf(b) };
    const r1 = evaluateVerifiedCapacity(args(pkg([a, b], [contradictory, artifact(b)])));
    expect(r1.outcome).toBe("REFUSED");
    if (r1.outcome === "REFUSED") expect(codes(r1.refusals)).toEqual(["VERIFICATION_IDENTITY_UNBOUND"]);
    const wrongKind = { ...artifact(a), kind: "DEFINITION" as const };
    const r2 = evaluateVerifiedCapacity(args(pkg([a], [wrongKind])));
    expect(r2.outcome).toBe("REFUSED");
    if (r2.outcome === "REFUSED") expect(r2.refusals[0]!.message).toMatch(/DEFINITION.*RULE/);
  });
  it("two artifacts for one unit, or one unit id twice in the package, refuse rather than choose", () => {
    const a = cleanRule("p-a");
    const r1 = evaluateVerifiedCapacity(args(pkg([a], [artifact(a), artifact(a, [], "REVIEW_REQUIRED")])));
    expect(r1.outcome).toBe("REFUSED");
    if (r1.outcome === "REFUSED") expect(r1.refusals).toEqual([{ code: "VERIFICATION_IDENTITY_UNBOUND", message: expect.stringContaining("more than one"), refs: ["p-a"] }]);
    const r2 = evaluateVerifiedCapacity(args(pkg([a, { ...a }], [artifact(a)])));
    expect(r2.outcome).toBe("REFUSED");
    if (r2.outcome === "REFUSED") expect(r2.refusals).toEqual([{ code: "IR_PACKAGE_INCONSISTENT", message: expect.stringContaining("more than once"), refs: ["p-a"] }]);
  });
  it("the envelope is built from the artifacts, not synthesized: its units are exactly the artifacts' units, with the verifier's identity claim", () => {
    const a = cleanRule("p-a"), b = cleanRule("p-b");
    const r = evaluateVerifiedCapacity(args(pkg([a, b], [artifact(b, [], undefined, { compilerVersion: "c-old" })])));
    if (r.outcome !== "EXECUTED") throw new Error("expected EXECUTED");
    expect(r.envelope.units.map((u) => u.identity.ruleOrDefinitionId)).toEqual(["p-b"]);
    expect(r.envelope.units[0]!.identity.compilerVersion).toBe("c-old");
    expect(r.envelope.envelopeVersion).toBe("phase-4-verification-envelope.v1");
  });
  it("the transaction path cannot be handed a state or graph: its only inputs are the package, inputs, ledger, transaction and path", () => {
    const src = fs.readFileSync("lib/contract-model/verified-execution.ts", "utf8");
    expect(src).toMatch(/export interface VerifiedTransactionArgs extends VerifiedCapacityArgs \{\s*transaction: HypotheticalTransaction;\s*selectedPath: SelectedPath;\s*\}/);
    expect(src).not.toMatch(/currentState\?:|capacityGraph\?:|state\?:|graph\?:/);
  });
  it("the package hash is deterministic and covers the artifacts, so a changed verification is a different package", () => {
    const a = cleanRule("p-a");
    const h1 = evaluateVerifiedCapacity(args(pkg([a], [artifact(a)]))).packageHash;
    const h2 = evaluateVerifiedCapacity(args(pkg([a], [artifact(a)]))).packageHash;
    const h3 = evaluateVerifiedCapacity(args(pkg([a], [artifact(a, [], "REVIEW_REQUIRED")]))).packageHash;
    expect(h1).toBe(h2);
    expect(h3).not.toBe(h1);
  });
});

describe("no re-verification inside Phase 4 (§7)", () => {
  it("the boundary imports the compiler type-only, never the verifier, a model caller, retrieval or the network", () => {
    const src = fs.readFileSync("lib/contract-model/verified-execution.ts", "utf8");
    const imports = [...src.matchAll(/^import (type )?.*from "([^"]+)";$/gm)];
    const compilerImports = imports.filter((m) => m[2]!.includes("compiler/"));
    expect(compilerImports.length).toBeGreaterThan(0);
    expect(compilerImports.every((m) => m[1] === "type ")).toBe(true);
    expect(imports.some((m) => /semantic-verification\/verify|getStageCaller|extraction|gateway|fetch/.test(m[2]!))).toBe(false);
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/\bfetch\(|verifyCandidate|getStageCaller|process\.env|readFileSync|prisma/);
  });
  it("findings are never mutated: the artifacts are byte-identical after execution", () => {
    const a = cleanRule("p-a");
    const p = pkg([a], [artifact(a, [finding("p-a", "rules[].exceptions")])]);
    const before = JSON.stringify(p);
    evaluateVerifiedCapacity(args(p));
    expect(JSON.stringify(p)).toBe(before);
  });
});

describe("N. BYPASS: product surfaces cannot reach the raw runtime around the boundary (§17)", () => {
  const PRODUCT_ROOTS = ["app", "components", "lib"];
  const EXEMPT = [/^lib\/contract-model\/runtime\//, /^lib\/contract-model\/verification-envelope\//, /^lib\/contract-model\/verified-execution\.ts$/];
  const RAW_RUNTIME = /contract-model\/runtime(\/|$)/;
  const walk = (dir: string, out: string[] = []): string[] => {
    if (!fs.existsSync(dir)) return out;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, out);
      else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(full);
    }
    return out;
  };
  const importsOf = (file: string) => [...fs.readFileSync(file, "utf8").matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]!);

  it("no production file outside the runtime itself imports a raw Phase-4 execution primitive", () => {
    const files = PRODUCT_ROOTS.flatMap((r) => walk(r)).filter((f) => !EXEMPT.some((re) => re.test(f)));
    const offenders = files.filter((f) => importsOf(f).some((i) => RAW_RUNTIME.test(i)));
    expect(offenders).toEqual([]);
  });
  it("the rule is live, not vacuous: the boundary itself does import the raw primitives it protects", () => {
    const i = importsOf("lib/contract-model/verified-execution.ts");
    expect(i.some((x) => /runtime\/capacity\/state/.test(x))).toBe(true);
    expect(i.some((x) => /runtime\/transaction\/simulate/.test(x))).toBe(true);
    expect(i.some((x) => /verification-envelope\/resolver/.test(x))).toBe(true);
  });
  it("the runtime barrel is a raw surface too: it re-exports the 4A primitives, so the rule must cover the bare package path", () => {
    const barrel = fs.readFileSync("lib/contract-model/runtime/index.ts", "utf8");
    expect(barrel).toMatch(/evaluate-expression|rule-evaluator/);
    expect(RAW_RUNTIME.test("@/lib/contract-model/runtime")).toBe(true);
    expect(RAW_RUNTIME.test("@/lib/contract-model/runtime/capacity")).toBe(true);
    expect(RAW_RUNTIME.test("@/lib/contract-model/verified-execution")).toBe(false);
  });
});
