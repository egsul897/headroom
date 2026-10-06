/**
 * VERIFIED UNIT PERSISTENCE - the Phase-3 artifact contract the strict Phase-4 boundary consumes.
 *
 * The historical corpus kept compiled IR and verification results apart; 411 of 498 MATERIAL
 * findings could not be bound to their unit. These tests pin the pairing: exact unit + exact result
 * + identity captured at verification time, persisted together, deterministic, immutable, honest
 * about gaps, and sufficient as-is for the strict boundary - proven by round-tripping through it.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { SemanticVerificationFinding, SemanticVerificationResult, SemanticVerificationStatus } from "@/lib/contract-model/compiler/semantic-verification/types";
import type { IRDefinition, IRExpression, IRRule } from "@/lib/contract-model/ir/types";
import { evaluateVerifiedCapacity, simulateVerifiedTransaction, type VerifiedExecutionPackage } from "@/lib/contract-model/verified-execution";
import {
  buildVerifiedUnitPackage, buildVerifiedUnitRunManifest, canonicalJson, identityOfUnit, parseVerifiedUnitPackage, serializeVerifiedUnitPackage,
  snapshotUnitsForVerification, toVerifiedExecutionPackage, toVerifiedUnitArtifact, VERIFIED_UNIT_PACKAGE_SCHEMA,
} from "@/lib/contract-model/verified-units";
import { persistCandidate, VerifiedUnitManifestWriter } from "../../scripts/p3-conmed-pilot/evidence";
import { dryRun } from "../../scripts/p3-conmed-pilot/verified-units-dry-run";
import { caseC_structuredNumericControl } from "../contract-model/numeric-grounding-fixtures";
import * as tx from "../contract-model/runtime/transaction/helpers";

// ---------------------------------------------------------------------------
// Fixtures: real IR builders, hand-built verification results (deterministic, no verifier call)
// ---------------------------------------------------------------------------

const STRONG = { compilerVersion: "c1", sourceContentVersion: "s1" } as const;
const rule = (ruleId: string, capacity: IRExpression, over: Partial<IRRule> = {}) => tx.provision(ruleId, capacity, { ...STRONG, ...over });
const definition = (definitionId: string, termName: string, calc: IRExpression, over: Partial<IRDefinition> = {}): IRDefinition =>
  ({ definitionId, irSchemaVersion: "t", companyId: tx.ORG, instrumentKey: tx.FACILITY, sourceDocumentId: "doc", termName, covenantFamily: "DEFINITIONS_CALCULATION_RULES", calculationExpression: calc, dependsOnTerms: [], sufficiency: "COMPLETE", sufficiencyReasons: [], provenance: null, ...STRONG, ...over }) as unknown as IRDefinition;
const TERM = (termName: string, resolvedDefinitionId: string): IRExpression => ({ kind: "DEFINED_TERM_REFERENCE", type: "MONEY", termName, resolvedDefinitionId, companyId: tx.ORG, instrumentKey: tx.FACILITY, exprId: `term-${resolvedDefinitionId}` }) as IRExpression;
const RULEREF = (ruleId: string): IRExpression => ({ kind: "RULE_REFERENCE", type: "CAPACITY", ruleId, companyId: tx.ORG, instrumentKey: tx.FACILITY, exprId: `ref-${ruleId}` }) as IRExpression;

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
  return { candidateRef: "cand-1", status: status ?? (findings.some((f) => f.severity === "MATERIAL") ? "MATERIAL_DISCREPANCY" : "VERIFIED_NO_MATERIAL_GAP_FOUND"), findings, sourceInventory: { items: [] }, irInventory: { items: [] }, reconciliation: { items: [] }, semanticReviewInvoked: false, semanticReviewSkippedReason: null, conditionSuspicion: null, verifierAlgorithmVersion: "verifier-v1", verifiedAt: "2026-01-01T00:00:00.000Z", evidenceSetHash: "eh-1" } as unknown as SemanticVerificationResult;
}

const FACTS = [tx.figure("fig-1", "1000")];
/** 20% of fig-1 = 200: needs a real financial fact, so a clean round-trip proves the whole chain. */
const cleanRule = (id = "p-clean") => rule(id, tx.MUL(tx.PCT(0.2), tx.FIGURE("fig-1")));

const build = (rules: IRRule[], definitions: IRDefinition[], verification: SemanticVerificationResult | null, over: Partial<Parameters<typeof buildVerifiedUnitPackage>[0]> = {}) =>
  buildVerifiedUnitPackage({ companyId: tx.ORG, instrumentKey: tx.FACILITY, candidateRef: "cand-1", runId: "run-1", snapshot: snapshotUnitsForVerification({ rules, definitions }), verification, currentUnits: [...rules, ...definitions], ...over });

/** Persist -> bytes -> parse -> adapt -> strict boundary. The only path the product will have. */
function roundTrip(rules: IRRule[], definitions: IRDefinition[], verification: SemanticVerificationResult | null) {
  const pkg = build(rules, definitions, verification);
  const reloaded = parseVerifiedUnitPackage(serializeVerifiedUnitPackage(pkg));
  const execution = toVerifiedExecutionPackage([reloaded]);
  const inputs = tx.resolverFor(FACTS, [...execution.definitions ?? []], [...execution.rules]);
  return { pkg, reloaded, execution, capacity: evaluateVerifiedCapacity({ package: execution, inputs, asOf: tx.WHEN }), inputs };
}
const entry = (r: ReturnType<typeof evaluateVerifiedCapacity>, ruleId: string) => { if (r.outcome !== "EXECUTED") throw new Error(r.outcome); return r.state.capacities.find((c) => c.ruleId === ruleId)!; };
const codes = (ls: readonly { code: string }[]) => ls.map((l) => l.code).sort();

// ---------------------------------------------------------------------------

describe("the paired artifact (§2-§5)", () => {
  it("persists the exact IR unit, the exact verification result and the identity captured from the unit, together", () => {
    const r = cleanRule();
    const v = result([finding("p-clean", "rules[0].capacityExpression.operands[0]")]);
    const pkg = build([r], [], v);
    expect(pkg.schema).toBe(VERIFIED_UNIT_PACKAGE_SCHEMA);
    expect(pkg.units).toHaveLength(1);
    const u = pkg.units[0]!;
    expect(u.kind).toBe("RULE");
    expect(u.ruleOrDefinitionId).toBe("p-clean");
    expect(JSON.stringify(u.unit)).toBe(JSON.stringify(r)); // complete unit, not an excerpt
    expect(JSON.stringify(u.verification)).toBe(JSON.stringify(v)); // complete result, verbatim
    expect(u.verifiedIdentity).toEqual({ ruleOrDefinitionId: "p-clean", companyId: tx.ORG, instrumentKey: tx.FACILITY, irSchemaVersion: "t", compilerVersion: "c1", sourceContentVersion: "s1" });
    expect(u.artifactHash).toMatch(/^[0-9a-f]{64}$/);
    expect(pkg.complete).toBe(true);
  });

  it("no boolean shortcut: no verified/isVerified/passedVerification field exists in the module or in any persisted record", () => {
    const code = fs.readFileSync("lib/contract-model/verified-units.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/\b(verified|isVerified|passedVerification|verifiedClean)\s*[:?]\s*(true|boolean)/);
    expect(code).not.toMatch(/\bisVerified\b|\bpassedVerification\b/);
    const bytes = serializeVerifiedUnitPackage(build([cleanRule()], [], result()));
    expect(bytes).not.toMatch(/"(verified|isVerified|passedVerification|verifiedClean)":/);
  });

  it("identity is captured at verification time from the snapshot, and drift afterwards is refused, not re-read (§4)", () => {
    const r = cleanRule();
    const snapshot = snapshotUnitsForVerification({ rules: [r], definitions: [] });
    r.compilerVersion = "c2"; // the live unit changes after the verifier saw it
    const pkg = buildVerifiedUnitPackage({ companyId: tx.ORG, instrumentKey: tx.FACILITY, candidateRef: "cand-1", runId: "run-1", snapshot, verification: result(), currentUnits: [r] });
    expect(pkg.units).toEqual([]);
    expect(pkg.unpaired).toEqual([{ ruleOrDefinitionId: "p-clean", kind: "RULE", reason: "IDENTITY_MISMATCH" }]);
    expect(pkg.problems.map((p) => p.code)).toEqual(["IDENTITY_MISMATCH"]);
    expect(pkg.complete).toBe(false);
    // and the snapshot itself still describes the verified version
    expect(snapshot.units[0]!.verifiedIdentity.compilerVersion).toBe("c1");
    expect((snapshot.units[0]!.unit as IRRule).compilerVersion).toBe("c1");
  });

  it("rules and definitions are both persisted, and referenced rules too (§6, §7)", () => {
    const d = definition("d-ebitda", "EBITDA", tx.FIGURE("fig-1"));
    const c = rule("p-c", tx.MONEY(500));
    const a = rule("p-a", tx.MUL(tx.PCT(0.2), TERM("EBITDA", "d-ebitda")));
    const a2 = rule("p-a2", RULEREF("p-c"));
    const pkg = build([a, a2, c], [d], result());
    expect(pkg.units.map((u) => [u.kind, u.ruleOrDefinitionId])).toEqual([["DEFINITION", "d-ebitda"], ["RULE", "p-a"], ["RULE", "p-a2"], ["RULE", "p-c"]]);
    expect(pkg.counts).toMatchObject({ rulesCompiled: 3, definitionsCompiled: 1, artifactsPersisted: 4 });
    const { capacity } = roundTrip([a, a2, c], [d], result());
    expect(entry(capacity, "p-a").status).toBe("AVAILABLE");
    expect(tx.amountOf(entry(capacity, "p-a").effectiveRemaining)).toBe("200");
    expect(entry(capacity, "p-a2").status).toBe("AVAILABLE");
    expect(tx.amountOf(entry(capacity, "p-a2").effectiveRemaining)).toBe("500");
    if (capacity.outcome === "EXECUTED") expect(capacity.coverage.complete).toBe(true);
  });

  it("failed, incomplete, not-verified, review-required and material-discrepancy results are all persisted (§8)", () => {
    for (const status of ["VERIFICATION_INCOMPLETE", "VERIFICATION_FAILED", "NOT_VERIFIED", "REVIEW_REQUIRED", "MATERIAL_DISCREPANCY"] as const) {
      const pkg = build([cleanRule()], [], result([], status));
      expect(pkg.units).toHaveLength(1);
      expect(pkg.units[0]!.verification.status).toBe(status);
      expect(pkg.verificationStatus).toBe(status);
      expect(pkg.complete).toBe(true); // paired; whether it EXECUTES is the gate's question, not persistence's
    }
  });

  it("material findings and their raw irPath are preserved verbatim; nothing is resolved, sanitized or filtered (§9, §10)", () => {
    const ugly = "definitions[termName='LTV Table'] (and duplicated at .then.operands[0])";
    const v = result([finding("p-clean", ugly), finding("p-clean", "rules[0].capacityExpression", { findingId: "f-nm", severity: "NON_MATERIAL" }), finding("p-clean", null, { findingId: "f-u", severity: "UNCERTAIN" })]);
    const pkg = build([cleanRule()], [], v);
    const persisted = pkg.units[0]!.verification.findings;
    expect(persisted).toHaveLength(3);
    expect(persisted[0]!.irPath).toBe(ugly);
    expect(persisted.map((f) => f.severity)).toEqual(["MATERIAL", "NON_MATERIAL", "UNCERTAIN"]);
    expect(JSON.stringify(pkg)).not.toMatch(/exprIds|"scope":"(NODE|UNIT)"/);
  });
});

describe("manifest and completeness (§14, §15, §26)", () => {
  it("IR without verification -> every unit unpaired, IR_WITHOUT_VERIFICATION, complete false (the compile-only run, honestly)", () => {
    const pkg = build([cleanRule("p-a"), cleanRule("p-b")], [], null);
    expect(pkg.units).toEqual([]);
    expect(pkg.unpaired.map((u) => u.reason)).toEqual(["IR_WITHOUT_VERIFICATION", "IR_WITHOUT_VERIFICATION"]);
    expect(pkg.counts).toMatchObject({ rulesCompiled: 2, unitsVerified: 0, artifactsPersisted: 0, unitsMissingVerification: 2 });
    expect(pkg.complete).toBe(false);
    expect(pkg.verificationStatus).toBeNull();
  });
  it("verification without IR (the 411/498 pattern) -> VERIFICATION_WITHOUT_IR names the unbound units, complete false", () => {
    const v = result([finding("p-clean", "rules[0].capacityExpression"), finding("ir-rule:not-preserved", "rules[3].exceptions", { findingId: "f-lost" })]);
    const pkg = build([cleanRule()], [], v);
    expect(pkg.problems).toEqual([{ code: "VERIFICATION_WITHOUT_IR", message: expect.stringContaining("cannot be bound"), refs: ["ir-rule:not-preserved"] }]);
    expect(pkg.counts.unitsMissingIr).toBe(1);
    expect(pkg.complete).toBe(false);
    expect(pkg.units).toHaveLength(1); // the bindable unit is still persisted; nothing is dropped
  });
  it("duplicate unit ids, mixed company and mixed instrument are refused and listed", () => {
    const a = cleanRule("p-a");
    const dup = build([a, { ...a }], [], result());
    expect(dup.problems.map((p) => p.code)).toEqual(["DUPLICATE_UNIT_ID"]);
    expect(dup.unpaired.map((u) => u.reason)).toEqual(["DUPLICATE_UNIT_ID", "DUPLICATE_UNIT_ID"]);
    const co = build([a, tx.provision("p-x", tx.MONEY(1), { ...STRONG, companyId: "other" })], [], result());
    expect(co.problems.map((p) => p.code)).toEqual(["MIXED_COMPANY"]);
    expect(co.unpaired).toEqual([{ ruleOrDefinitionId: "p-x", kind: "RULE", reason: "MIXED_COMPANY" }]);
    expect(co.units.map((u) => u.ruleOrDefinitionId)).toEqual(["p-a"]);
    const inst = build([a, tx.provision("p-y", tx.MONEY(1), { ...STRONG, instrumentKey: "other" })], [], result());
    expect(inst.problems.map((p) => p.code)).toEqual(["MIXED_INSTRUMENT"]);
    for (const p of [dup, co, inst]) expect(p.complete).toBe(false);
  });
  it("the run manifest exposes incomplete coverage and is never complete while any package is not", () => {
    const complete = build([cleanRule("p-a")], [], result());
    const compileOnly = build([cleanRule("p-b")], [], null);
    const m = buildVerifiedUnitRunManifest({ companyId: tx.ORG, instrumentKey: tx.FACILITY, runId: "run-1", packages: [{ pkg: compileOnly, file: "b.json" }, { pkg: complete, file: "a.json" }] });
    expect(m.complete).toBe(false);
    expect(m.totals).toMatchObject({ candidates: 2, completePackages: 1, incompletePackages: 1, rulesCompiled: 2, unitsVerified: 1, artifactsPersisted: 1, unitsMissingVerification: 1 });
    expect(m.totals.problemsByCode.IR_WITHOUT_VERIFICATION).toBe(1);
    expect(m.verificationStatusCounts).toEqual({ NOT_VERIFIED_IN_RUN: 1, VERIFIED_NO_MATERIAL_GAP_FOUND: 1 });
    expect(m.candidates.map((c) => c.candidateRef)).toEqual(["cand-1", "cand-1"]); // sorted, both listed
    expect(m.compilerVersion).toBe("c1");
    expect(m.verifierAlgorithmVersion).toBe("verifier-v1");
    const all = buildVerifiedUnitRunManifest({ companyId: tx.ORG, instrumentKey: tx.FACILITY, runId: "run-1", packages: [{ pkg: complete, file: "a.json" }] });
    expect(all.complete).toBe(true);
    expect(buildVerifiedUnitRunManifest({ companyId: tx.ORG, instrumentKey: tx.FACILITY, runId: "run-1", packages: [] }).complete).toBe(false);
  });
});

describe("determinism and immutability (§11-§13)", () => {
  it("the same unit + result + identity serialize to byte-identical output, whatever order the units arrived in", () => {
    const a = cleanRule("p-a"), b = rule("p-b", tx.MONEY(5)), d = definition("d-1", "D", tx.MONEY(1));
    const v = result([finding("p-a", "rules[0].capacityExpression")]);
    const one = serializeVerifiedUnitPackage(build([a, b], [d], v));
    const two = serializeVerifiedUnitPackage(build([b, a], [d], v));
    expect(two).toBe(one);
    expect(build([a, b], [d], v).packageHash).toBe(build([b, a], [d], v).packageHash);
    expect(one).not.toMatch(/capturedAt|writtenAt/); // no clock reads in the artifact
  });
  it("the artifact hash binds id, identity, unit content and result: any of them changing changes the hash", () => {
    const a = cleanRule("p-a");
    const base = build([a], [], result()).units[0]!.artifactHash;
    expect(build([{ ...a, sourceSectionRef: "changed" } as IRRule], [], result()).units[0]!.artifactHash).not.toBe(base);
    expect(build([a], [], result([], "REVIEW_REQUIRED")).units[0]!.artifactHash).not.toBe(base);
    expect(build([{ ...a, compilerVersion: "c9" }], [], result()).units[0]!.artifactHash).not.toBe(base);
    expect(build([a], [], result()).units[0]!.artifactHash).toBe(base);
  });
  it("mutating the live IR or the live verification result after persistence does not change the stored record", () => {
    const a = cleanRule("p-a");
    const v = result([finding("p-a", "rules[0].capacityExpression")]);
    const pkg = build([a], [], v);
    const before = serializeVerifiedUnitPackage(pkg);
    (a.capacityExpression as unknown as { operands: unknown[] }).operands.push(tx.MONEY(999));
    a.sufficiency = "AMBIGUOUS";
    v.findings[0]!.severity = "NON_MATERIAL";
    v.findings.push(finding("p-a", null, { findingId: "f-late" }));
    (v as { status: string }).status = "VERIFIED_NO_MATERIAL_GAP_FOUND";
    expect(serializeVerifiedUnitPackage(pkg)).toBe(before);
    expect(Object.isFrozen(pkg)).toBe(true);
    expect(Object.isFrozen(pkg.units[0]!.unit)).toBe(true);
    expect(Object.isFrozen(pkg.units[0]!.verification.findings)).toBe(true);
    expect(() => { (pkg.units[0]!.verification.findings as unknown[]).push(1); }).toThrow();
  });
  it("a file edited after writing is caught on parse: the package hash and every artifact hash are re-checked", () => {
    const bytes = serializeVerifiedUnitPackage(build([cleanRule()], [], result()));
    expect(() => parseVerifiedUnitPackage(bytes)).not.toThrow();
    expect(() => parseVerifiedUnitPackage(bytes.replace('"sufficiency":"COMPLETE"', '"sufficiency":"PARTIAL"'))).toThrow(/hash mismatch/);
    expect(() => parseVerifiedUnitPackage(bytes.replace('"complete":true', '"complete":false'))).toThrow(/package hash mismatch/);
    expect(() => parseVerifiedUnitPackage('{"schema":"something-else"}')).toThrow(/not a verified-unit package/);
  });
});

describe("strict-boundary round trips: persisted output is sufficient as-is (§16-§20)", () => {
  it("CLEAN: persist -> reload -> adapt -> evaluateVerifiedCapacity executes, AVAILABLE 200, no hand-built envelope anywhere", () => {
    const { capacity, execution } = roundTrip([cleanRule()], [], result());
    expect(capacity.outcome).toBe("EXECUTED");
    expect(entry(capacity, "p-clean").status).toBe("AVAILABLE");
    expect(tx.amountOf(entry(capacity, "p-clean").effectiveRemaining)).toBe("200");
    if (capacity.outcome === "EXECUTED") expect(capacity.coverage).toMatchObject({ complete: true, identityStrength: { STRONG: 1, WEAK: 0 }, unitsRefusedByGate: [] });
    // the adapter is the identity function on the shared fields
    const u = parseVerifiedUnitPackage(serializeVerifiedUnitPackage(build([cleanRule()], [], result()))).units[0]!;
    expect(toVerifiedUnitArtifact(u)).toEqual({ ruleOrDefinitionId: u.ruleOrDefinitionId, kind: u.kind, verifiedIdentity: u.verifiedIdentity, result: u.verification });
    expect(execution.verifications).toHaveLength(1);
  });
  it("MATERIAL NODE: the finding's path survives persistence, the resolver maps it to the exprId, the boundary blocks UNSUPPORTED", () => {
    const r = cleanRule();
    const disputedExprId = (r.capacityExpression as unknown as { operands: { exprId: string }[] }).operands[0]!.exprId;
    const { capacity } = roundTrip([r], [], result([finding("p-clean", "rules[0].capacityExpression.operands[0]")]));
    const e = entry(capacity, "p-clean");
    expect(e.status).toBe("UNSUPPORTED");
    expect(e.limitations[0]!.message).toMatch(/^\[MATERIAL_NODE_HIT\]/);
    expect(e.evaluation!.diagnostics[0]!.verification).toMatchObject({ reason: "MATERIAL_NODE_FINDING", scope: "NODE", exprId: disputedExprId });
    expect(JSON.stringify(e)).not.toMatch(/"amount":"200"/);
  });
  it("UNIT FALLBACK: an unresolvable prose path is persisted untouched; the resolver makes it UNIT; the boundary floors REVIEW_REQUIRED", () => {
    const { capacity, reloaded } = roundTrip([cleanRule()], [], result([finding("p-clean", "rules[].capacityExpression (the second operand, roughly)")]));
    expect(reloaded.units[0]!.verification.findings[0]!.irPath).toBe("rules[].capacityExpression (the second operand, roughly)");
    const e = entry(capacity, "p-clean");
    expect(e.status).toBe("REVIEW_REQUIRED");
    expect(e.limitations[0]!.message).toMatch(/^\[MATERIAL_UNIT_FINDING\]/);
    if (capacity.outcome === "EXECUTED") expect(capacity.coverage.unitsRefusedByGate).toEqual([{ unitId: "p-clean", reason: "MATERIAL_UNIT_FINDING", identityStrength: "STRONG" }]);
  });
  it("INCOMPLETE: persisted, not missing; provisional arithmetic; REVIEW_REQUIRED under its own code; reported as incomplete", () => {
    const { capacity, pkg } = roundTrip([cleanRule()], [], result([], "VERIFICATION_INCOMPLETE"));
    expect(pkg.complete).toBe(true); // persistence is complete: the pair exists
    expect(capacity.outcome).toBe("EXECUTED"); // not REFUSED: the artifact exists
    const e = entry(capacity, "p-clean");
    expect(e.status).toBe("REVIEW_REQUIRED");
    expect(codes(e.limitations)).toEqual(["PHASE3_VERIFICATION_INCOMPLETE"]);
    expect(tx.amountOf(e.provisional!.effectiveRemaining)).toBe("200");
    if (capacity.outcome === "EXECUTED") expect(capacity.coverage).toMatchObject({ unitsIncompletelyVerified: ["p-clean"], unitsMissingVerification: [], complete: false });
    // versus genuinely missing: the boundary REFUSES
    const missing = evaluateVerifiedCapacity({ package: { ...roundTrip([cleanRule()], [], result()).execution, verifications: [] }, inputs: tx.resolverFor(FACTS), asOf: tx.WHEN });
    expect(missing.outcome).toBe("REFUSED");
  });
  it("IDENTITY MISMATCH: an artifact persisted for one compile, executed against a recompile with a different version, fails closed through the existing gate", () => {
    const original = cleanRule();
    const persisted = parseVerifiedUnitPackage(serializeVerifiedUnitPackage(build([original], [], result())));
    const recompiled = { ...original, compilerVersion: "c2" } as IRRule;
    const execution: VerifiedExecutionPackage = { ...toVerifiedExecutionPackage([persisted]), rules: [recompiled] };
    const capacity = evaluateVerifiedCapacity({ package: execution, inputs: tx.resolverFor(FACTS, [], [recompiled]), asOf: tx.WHEN });
    const e = entry(capacity, "p-clean");
    expect(e.status).toBe("REVIEW_REQUIRED");
    expect(e.limitations[0]!.message).toMatch(/^\[IDENTITY_MISMATCH\].*compilerVersion/);
    if (capacity.outcome === "EXECUTED") expect(capacity.coverage.unitsRefusedByGate[0]).toMatchObject({ reason: "IDENTITY_MISMATCH" });
  });
  it("a blocked transaction through the round-tripped package stays REVIEW_REQUIRED, non-committable and mutation-free", () => {
    const { execution, inputs } = roundTrip([cleanRule()], [], result([finding("p-clean", "rules[0].capacityExpression.operands[0]")]));
    const r = simulateVerifiedTransaction({ package: execution, inputs, asOf: tx.WHEN, transaction: tx.proposal("tx-1", [tx.consume("e1", tx.nodeOf("p-clean"), tx.cash("20"))]), selectedPath: tx.route({ capacityNodeIds: [tx.nodeOf("p-clean")], ruleIds: ["p-clean"] }) });
    expect(r.outcome).toBe("EXECUTED");
    if (r.outcome !== "EXECUTED") return;
    expect(r.simulation.selectedPathResult).toBe("REVIEW_REQUIRED");
    expect(r.simulation.commitPlan.committable).toBe(false);
  });
});

describe("harness integration (§21-§25)", () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "verified-units-test-"));

  it("persistCandidate writes the evidence AND the paired package from the same objects, and the evidence points at the package", () => {
    const dir = tmp();
    const input = caseC_structuredNumericControl();
    const snapshot = snapshotUnitsForVerification(input.compilationResult);
    const v = result([], "VERIFIED_NO_MATERIAL_GAP_FOUND");
    const out = persistCandidate({ dir, name: "cand", runId: "run-t", compilerInput: input.compilerInput, result: input.compilationResult, verification: v, snapshot, run: { model: "t", tier: 1, wallClockMs: 1, inputTokens: 1, outputTokens: 1, costUsd: 0, costStatus: "EXACT", timedOut: false, notes: [] } });
    expect(fs.existsSync(out.evidencePath)).toBe(true);
    expect(fs.existsSync(out.verifiedUnitsPath!)).toBe(true);
    const evidence = JSON.parse(fs.readFileSync(out.evidencePath, "utf8"));
    expect(evidence.schema).toBe("p3-candidate-evidence.v2");
    expect(evidence).toMatchObject({ execution: null, sourceContext: null, certified: null, passA: null }); // additive v2 sections, null when the compile carried none
    expect(evidence.compilerInput.operativeSourceOrigin).toBeNull();
    expect(evidence.compilation.rules).toHaveLength(1);
    expect(evidence.verification.status).toBe("VERIFIED_NO_MATERIAL_GAP_FOUND");
    expect(evidence.verifiedUnits).toMatchObject({ file: "verified-units/cand.verified-units.json", packageHash: out.package.packageHash, complete: true, artifactsPersisted: 1 });
    const reloaded = parseVerifiedUnitPackage(fs.readFileSync(out.verifiedUnitsPath!, "utf8"));
    expect(reloaded.packageHash).toBe(out.package.packageHash);
    const manifest = new VerifiedUnitManifestWriter(dir, input.compilerInput.companyId, input.compilerInput.instrumentKey, "run-t");
    manifest.add(out.package, out.verifiedUnitsPath);
    const m = JSON.parse(fs.readFileSync(manifest.write(), "utf8"));
    expect(m).toMatchObject({ schema: "p3-verified-unit-manifest.v1", complete: true, totals: { candidates: 1, artifactsPersisted: 1 } });
    expect(m.candidates[0].packageFile).toBe("verified-units/cand.verified-units.json");
  });

  it("a verifying runner must pass the pre-verification snapshot; identity is never reconstructed afterwards", () => {
    const input = caseC_structuredNumericControl();
    expect(() => persistCandidate({ dir: tmp(), name: "cand", runId: "run-t", compilerInput: input.compilerInput, result: input.compilationResult, verification: result(), run: { model: "t", tier: 1, wallClockMs: 1, inputTokens: 1, outputTokens: 1, costUsd: 0, costStatus: "EXACT", timedOut: false, notes: [] } })).toThrow(/snapshot the units before verifying/);
  });

  it("a compile-only run still writes the package, recording every unit as unverified and the package as incomplete", () => {
    const dir = tmp();
    const input = caseC_structuredNumericControl();
    const out = persistCandidate({ dir, name: "cand", runId: "run-t", compilerInput: input.compilerInput, result: input.compilationResult, verification: null, run: { model: "t", tier: 1, wallClockMs: 1, inputTokens: 1, outputTokens: 1, costUsd: 0, costStatus: "EXACT", timedOut: false, notes: ["compile-only"] } });
    expect(out.package.complete).toBe(false);
    expect(out.package.counts.unitsMissingVerification).toBe(1);
    expect(JSON.parse(fs.readFileSync(out.evidencePath, "utf8")).verifiedUnits.complete).toBe(false);
  });

  it("a credential anywhere in the pair aborts BOTH writes (§23)", () => {
    const dir = tmp();
    const input = caseC_structuredNumericControl();
    const snapshot = snapshotUnitsForVerification(input.compilationResult);
    const leaky = result([finding("ng-rule:1", null, { verifierReasoning: `see ${["vck", "_", "AbCdEfGhIjKlMnOpQrSt"].join("")}` })]);
    expect(() => persistCandidate({ dir, name: "cand", runId: "run-t", compilerInput: input.compilerInput, result: input.compilationResult, verification: leaky, snapshot, run: { model: "t", tier: 1, wallClockMs: 1, inputTokens: 1, outputTokens: 1, costUsd: 0, costStatus: "EXACT", timedOut: false, notes: [] } })).toThrow(/refusing to write .*vercel-ai-gateway-key/);
    expect(fs.existsSync(path.join(dir, "cand.json"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "verified-units", "cand.verified-units.json"))).toBe(false);
  });

  it("the runners write the pair automatically: population and validation both call persistCandidate and the manifest writer, never the bare evidence writer", () => {
    for (const f of ["scripts/p3-conmed-pilot/run-population.ts", "scripts/p3-conmed-pilot/numeric-grounding-validation.ts"]) {
      const src = fs.readFileSync(f, "utf8");
      expect(src, f).toMatch(/persistCandidate\(/);
      expect(src, f).toMatch(/VerifiedUnitManifestWriter/);
      expect(src, f).not.toMatch(/writeCandidateEvidence\(/);
    }
    const validation = fs.readFileSync("scripts/p3-conmed-pilot/numeric-grounding-validation.ts", "utf8");
    expect(validation.indexOf("snapshotUnitsForVerification(result)")).toBeLessThan(validation.indexOf("await verifyCompiledCandidate("));
  });

  it("CONMED dry run, zero model calls: one candidate yields evidence, full IR, verification, paired package and manifest, and the reload executes through the strict boundary", async () => {
    const r = await dryRun(tmp());
    expect(r.paidModelCalls).toBe(0);
    expect(r.filesWritten).toEqual(["dry-run-candidate.json", "verified-units/dry-run-candidate.verified-units.json", "verified-units-manifest.json"]);
    expect(r.forensicEvidence).toMatchObject({ hasRawModelOutput: true, hasToolCallLog: true, rules: 1, definitions: 1, hasContextBundle: true });
    expect(r.verifiedUnitPackage.complete).toBe(true);
    expect(r.verifiedUnitPackage.units.map((u) => u.kind)).toEqual(["DEFINITION", "RULE"]);
    expect(r.manifest.complete).toBe(true);
    expect(r.strictBoundary.outcome).toBe("EXECUTED");
    if (r.strictBoundary.outcome === "EXECUTED") {
      expect(r.strictBoundary.coverage.complete).toBe(true);
      // the real verifier flagged the unsupported PERCENT(1); persistence carried the finding and its path all the way to the gate
      expect(r.strictBoundary.capacities[0]).toEqual({ ruleId: "ng-rule:1", status: "UNSUPPORTED", limitations: ["PHASE3_VERIFICATION_MATERIAL_FINDING"] });
    }
  });

  it("historical artifacts are not rewritten: the module and the runners never open a docs/ path for writing", () => {
    for (const f of ["lib/contract-model/verified-units.ts", "scripts/p3-conmed-pilot/evidence.ts"]) {
      const code = fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(code, f).not.toMatch(/["']docs\//);
    }
    expect(canonicalJson({ b: 1, a: [3, { d: 1, c: 2 }] })).toBe('{"a":[3,{"c":2,"d":1}],"b":1}');
  });
});
