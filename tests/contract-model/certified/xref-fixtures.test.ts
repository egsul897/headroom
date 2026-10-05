/**
 * SEMANTIC FIDELITY CLOSURE - golden cross-reference fixtures A-E, the scripted good submission, package binding,
 * cycle control, entity-scope roles and strict Phase-4 gating (mission §11, §41-§42, §46-§48, §50, §53-§54).
 * Zero model calls: scripted providers over a synthetic agreement (see xref-harness.ts).
 */
import { describe, expect, it } from "vitest";
import { compileCovenantMap, type CandidateMapResult } from "../../../lib/contract-model/covenant-map";
import { identityOfUnit, serializeVerifiedUnitPackage, stableContentJson } from "../../../lib/contract-model/verified-units";
import { certifiedMapToVerifiedExecutionPackage } from "../../../lib/contract-model/phase3-certification/phase4-adapter";
import { evaluateVerifiedCapacity } from "../../../lib/contract-model/verified-execution";
import { buildCovenantContextBundle } from "../../../lib/contract-model/compiler/context-retrieval/pipeline";
import { classifyEntityMentionRole, findEntityBindingSignals } from "../../../lib/contract-model/compiler/semantic/entity-scope-guard";
import { buildTestIndex, buildExactTermsByDocument } from "../context-retrieval-test-utils";
import * as tx from "../runtime/transaction/helpers";
import type { IRRule, IRDefinition } from "../../../lib/contract-model/ir/types";
import { candidate } from "./golden-harness";
import { xrefPackage, xrefDeps, XREF_CANDIDATES, XREF_AGREEMENT } from "./xref-harness";

/** Economics that live ONLY in referenced target provisions; the children's artifacts may not carry any of them. */
const TARGET_ONLY_FIGURES = ["65%", "123,000,000", "17%", "4.25", "2.50"];

const run = await (async () => {
  const { pkg } = xrefPackage();
  const r = await compileCovenantMap(pkg, xrefDeps());
  const byRef = (ref: string): CandidateMapResult => { const x = r.results.find((c) => c.candidate.normalizedSourceRef === ref); if (!x) throw new Error(`no result ${ref}`); return x; };
  const ruleAt = (ref: string): IRRule => { const x = r.results.flatMap((c) => c.compilation?.rules ?? []).find((u) => u.sourceSectionRef === ref); if (!x) throw new Error(`no rule ${ref}`); return x; };
  return { r, byRef, ruleAt };
})();

describe("§46/§53 the scripted good submission: every candidate of the full package reaches CERTIFIED, the package is CERTIFIED", () => {
  it("ten candidates, ten CERTIFIED, no material finding, package CERTIFIED with every binding bound and executable", () => {
    expect(run.r.results.map((c) => [c.candidate.normalizedSourceRef, c.outcome, c.certification?.status])).toEqual(XREF_CANDIDATES.map(([ref]) => [ref, "MAPPED", "CERTIFIED"]));
    for (const c of run.r.results) expect((c.verification?.findings ?? []).filter((f) => f.severity === "MATERIAL")).toEqual([]);
    expect(run.r.packageCertification.status).toBe("CERTIFIED");
    expect(run.r.packageCertification.bindings).toEqual({ total: 12, bound: 12, executable: 12, notInTargetSet: 0, notCompiled: 0, unitNotFound: 0, unknown: 0, reviewRequired: 0, oneToMany: 2 }); // v2: the 7.05 <-> 7.06 exception conditions are bound too; the two whole-section references (7.01 and 7.03 wholes) bind one-to-many
    expect(run.r.map.completeness.complete).toBe(true);
  });
});

describe("§41/§42 the expected general semantic shape of the live-equivalent child (7.02(a))", () => {
  const rule = run.ruleAt("7.02(a)");
  it("one PERMISSION / INCUR_DEBT owned by the child, no locally stated cap, two requirements as typed cross-rule conditions, pro forma evaluation basis preserved", () => {
    const comp = run.byRef("7.02(a)").compilation!;
    expect(comp.rules.map((x) => x.sourceSectionRef)).toEqual(["7.02(a)"]); // the parent prohibition is NOT a second rule here
    expect(comp.contextOnlyEmissions ?? []).toEqual([]);
    expect([rule.posture, rule.action, rule.entityScope, rule.capacityExpression?.kind]).toEqual(["PERMISSION", "INCUR_DEBT", ["BORROWER"], "UNLIMITED_CAPACITY"]);
    const [reqA, reqB] = rule.conditions;
    expect(reqA!.referencesRuleTargets!.map((t) => [t.normalizedTargetRef, t.resolutionStatus, t.owningCandidateRefs.length, t.boundSemanticTargetIds])).toEqual([["7.03(b)", "SOURCE_REFERENCE_RESOLVED", 1, []]]);
    expect(reqB!.referencesRuleTargets!.map((t) => [t.normalizedTargetRef, t.resolutionStatus])).toEqual([["7.01", "SOURCE_REFERENCE_RESOLVED"]]);
    expect(reqB!.targetCombination).toBe("ALL_SATISFIED");
    expect(reqB!.evaluationBasis).toMatchObject({ proForma: true, transactionEffect: "after giving effect to the incurrence of such Indebtedness", asOfSelector: "the last day of the most recently ended fiscal quarter of the Borrower and its Subsidiaries for which financial statements are available", deemedEffectiveAt: "the first day of each relevant period for testing such compliance" });
    expect((rule.sourceDependencies ?? []).map((d) => [d.relationshipType, d.normalizedTargetRef, d.resolutionStatus])).toEqual([["REQUIRES", "7.03(b)", "SOURCE_REFERENCE_RESOLVED"], ["REQUIRES", "7.01", "SOURCE_REFERENCE_RESOLVED"]]);
    expect(rule.unresolvedDependencies ?? []).toEqual([]);
  });
  it("parent scope informs: the governing prohibition and the obligor scope are INHERITED attributes with sourceAuthority PARENT_SCOPE, never a candidate-owned parent rule", () => {
    expect((rule.inheritedAttributes ?? []).map((a) => [a.attribute, a.sourceAuthority, a.sourceSectionRef])).toEqual([["governingProhibition", "PARENT_SCOPE", "7.02"], ["entityScope", "PARENT_SCOPE", "7.02"]]);
    expect(rule.entityScopeAudit?.witness?.decidedBy).toBe("PARENT_SCOPE");
  });
  it("§11 the child's certified artifact carries none of the referenced provisions' economics (A, B, D, E), while the targets' own units do", () => {
    // the certified semantic artifact = the verified units' IR (the verification record legitimately lists the target text it consulted as evidence)
    const child = JSON.stringify(run.byRef("7.02(a)").verifiedPackage!.units.map((u) => u.unit));
    for (const fig of TARGET_ONLY_FIGURES) expect(child).not.toContain(fig);
    const childC = JSON.stringify(run.byRef("7.02(c)").verifiedPackage!.units.map((u) => u.unit));
    for (const fig of TARGET_ONLY_FIGURES) expect(childC).not.toContain(fig);
    expect(JSON.stringify(run.byRef("7.04").compilation!.rules)).toMatch(/123000000|123,000,000/);
    expect(JSON.stringify(run.byRef("7.03").compilation!.rules)).toContain("0.65");
    expect(JSON.stringify(run.byRef("7.01").compilation!.rules)).toContain("4.25");
  });
});

describe("§13-§15, §17 package-level dependency resolution: a package semantic graph of derived bindings", () => {
  const pd = run.r.map.packageDependencies;
  const bindingsFrom = (ref: string) => pd.bindings.filter((b) => b.fromNodeId === run.ruleAt(ref).ruleId);
  it("A scope reference binds to the one target unit at 7.03(b) (the lien candidate's clause-(b) permission)", () => {
    const b = bindingsFrom("7.02(a)").find((x) => x.path === "sourceDependencies[0]")!;
    expect([b.status, b.executable, b.targets.map((t) => t.sectionRef)]).toEqual(["BOUND", true, ["7.03(b)"]]);
    expect(b.boundSemanticTargetIds).toEqual([run.ruleAt("7.03(b)").ruleId]);
    expect(b.targets[0]!.sourceContentVersion).toBe(run.byRef("7.03").semanticSourceContract!.version); // the target unit's own identity at binding time
  });
  it("B/D a compliance reference to a section holding two covenant rules binds ONE reference to TWO targets (one-to-many), combination ALL_SATISFIED", () => {
    const b = bindingsFrom("7.02(a)").find((x) => x.path === "conditions[1].referencesRuleTargets[0]")!;
    expect(b.boundSemanticTargetIds.sort()).toEqual([run.ruleAt("7.01(a)").ruleId, run.ruleAt("7.01(b)").ruleId].sort());
    expect(run.ruleAt("7.02(a)").conditions[1]!.targetCombination).toBe("ALL_SATISFIED");
  });
  it("C a defined named condition binds to the DEFINITION unit of that term, not to every unit of the definitions section", () => {
    const b = bindingsFrom("7.02(b)").find((x) => x.kind === "CONDITION_TARGET")!;
    expect(b.exactSourceTargetRef).toBe("the Payment Conditions");
    const target = run.r.map.nodes.find((n) => n.nodeId === b.boundSemanticTargetIds[0])!;
    expect([b.status, target.kind, target.termName]).toEqual(["BOUND", "DEFINITION", "Payment Conditions"]);
    expect(b.boundSemanticTargetIds).toHaveLength(1);
  });
  it("E a referenced numeric basket binds to the basket unit; the figures stay on that unit only", () => {
    const b = bindingsFrom("7.02(c)").find((x) => x.path === "sourceDependencies[0]")!;
    expect([b.relationshipType, b.status, b.boundSemanticTargetIds]).toEqual(["LIMITED_BY", "BOUND", [run.ruleAt("7.04").ruleId]]);
  });
  it("§48 a reference cycle (7.05 <-> 7.06) is graph data: both bindings bound, the resolver terminates, the map carries both edges", () => {
    expect(bindingsFrom("7.05")[0]!.boundSemanticTargetIds).toEqual([run.ruleAt("7.06").ruleId]);
    expect(bindingsFrom("7.06")[0]!.boundSemanticTargetIds).toEqual([run.ruleAt("7.05").ruleId]);
    const cyc = run.r.map.edges.filter((e) => e.derivedFrom === "IR_SOURCE_DEPENDENCY" && [run.ruleAt("7.05").ruleId, run.ruleAt("7.06").ruleId].includes(e.fromNodeId));
    expect(cyc.map((e) => [e.edgeType, e.edgeAuthority])).toEqual([["RULE_DEPENDS_ON_RULE", "CERTIFIED_SEMANTIC"], ["RULE_DEPENDS_ON_RULE", "CERTIFIED_SEMANTIC"]]);
  });
  it("bound dependencies become IR-backed map edges with CERTIFIED_SEMANTIC authority; the graph lists every bound node", () => {
    const e = run.r.map.edges.filter((x) => x.derivedFrom === "IR_SOURCE_DEPENDENCY");
    expect(e.length).toBeGreaterThanOrEqual(5);
    expect(e.every((x) => x.edgeAuthority === "CERTIFIED_SEMANTIC")).toBe(true);
    expect(pd.graph.edges.length).toBe(pd.bindings.reduce((n, b) => n + b.boundSemanticTargetIds.length, 0));
    expect(pd.graph.nodeIds).toContain(run.ruleAt("7.02(a)").ruleId);
  });
  it("§14 verified units are never mutated by binding: every map node's unit is byte-identical to the unit the verifier saw, and no compiled unit carries bound target ids", () => {
    for (const c of run.r.results) {
      const persisted = new Map(c.verifiedPackage!.units.map((u) => [u.ruleOrDefinitionId, u] as const));
      for (const node of run.r.map.nodes.filter((n) => n.candidateRef === c.candidate.discoveryId)) {
        const p = persisted.get(node.nodeId);
        expect(p).toBeDefined();
        expect(stableContentJson(node.unit)).toBe(stableContentJson(p!.unit));
        expect(identityOfUnit(node.unit)).toEqual(identityOfUnit(p!.unit));
      }
    }
    const everyTarget = run.r.results.flatMap((c) => c.compilation?.rules ?? []).flatMap((u) => [...(u.sourceDependencies ?? []), ...u.conditions.flatMap((k) => k.referencesRuleTargets ?? [])]);
    expect(everyTarget.length).toBe(10);
    expect(everyTarget.every((t) => t.boundSemanticTargetIds.length === 0)).toBe(true);
  });
});

describe("§38 partial target set: known external candidates are distinguished from genuinely unknown references", () => {
  it("compiling only the child (as the live run did) leaves its dependencies TARGET_CANDIDATE_NOT_IN_TARGET_SET - never DEPENDENCY_UNKNOWN, never DEPENDENCY_INVALID - and the package is PARTIAL", async () => {
    const { pkg } = xrefPackage(XREF_CANDIDATES.filter(([ref]) => ref === "7.02(a)"), "PARTIAL_TARGET_SET");
    // the sealed population the compiler sees is the FULL one: ownership of the referenced nodes is known even though only one candidate is compiled
    const full = xrefPackage().pkg;
    const r = await compileCovenantMap({ ...pkg, candidatePopulation: full.candidates.map((c) => ({ discoveryId: c.discoveryId, structuralNodeIds: c.structuralNodeIds })) } as never, xrefDeps());
    const child = r.results[0]!;
    expect(child.certification!.status).toBe("CERTIFIED");
    expect(child.certification!.blockers.map((b) => b.code)).not.toContain("DEPENDENCY_INVALID");
    expect(r.map.packageDependencies.bindings.map((b) => b.status)).toEqual(["TARGET_CANDIDATE_NOT_IN_TARGET_SET", "TARGET_CANDIDATE_NOT_IN_TARGET_SET", "TARGET_CANDIDATE_NOT_IN_TARGET_SET", "TARGET_CANDIDATE_NOT_IN_TARGET_SET"]);
    expect(r.packageCertification.status).toBe("PARTIAL");
    expect(r.packageCertification.blockers.map((b) => b.code)).toContain("DEPENDENCY_TARGET_NOT_IN_TARGET_SET");
    expect(r.map.unresolved.filter((u) => u.kind === "UNRESOLVED_SOURCE_DEPENDENCY")).toHaveLength(4);
  });
});

describe("§40/§54 strict Phase-4 gating", () => {
  const FACTS = [tx.figure("fig-1", "1000")];
  it("the fully certified, fully bound package still fails closed: the runtime has no certified cross-rule satisfaction evaluator, so CROSS_RULE_GATE_NOT_EXECUTABLE is refused - the UNLIMITED_CAPACITY behind the gate never executes", () => {
    const derived = certifiedMapToVerifiedExecutionPackage(run.r.results.map((c) => ({ certification: c.certification!, verifiedPackage: serializeVerifiedUnitPackage(c.verifiedPackage!) })));
    expect(derived.outcome).toBe("DERIVED");
    if (derived.outcome !== "DERIVED") return;
    const out = evaluateVerifiedCapacity({ package: derived.package, inputs: tx.resolverFor(FACTS, [...(derived.package.definitions ?? [])] as IRDefinition[], [...derived.package.rules]), asOf: tx.WHEN });
    expect(out.outcome).toBe("REFUSED");
    if (out.outcome !== "REFUSED") return;
    const gate = out.refusals.find((x) => x.code === "CROSS_RULE_GATE_NOT_EXECUTABLE")!;
    expect(gate.message).toContain("PHASE4_CROSS_RULE_GATE_NOT_YET_EXECUTABLE");
    expect(gate.refs.some((x) => x.startsWith(run.ruleAt("7.02(a)").ruleId))).toBe(true);
  });
});

describe("§50 entity scope: obligor applicability vs measurement/reporting mentions", () => {
  it("'the Borrower shall not incur' is an OBLIGOR mention; 'of the Borrower and its Subsidiaries for which financial statements are available' is MEASUREMENT_CONTEXT", () => {
    const text = "the Borrower shall not incur any Debt; provided that the Borrower shall be in compliance with the covenants recomputed as at the last day of the most recently ended fiscal quarter of the Borrower and its Subsidiaries for which financial statements are available";
    const signals = findEntityBindingSignals(text);
    const roles = signals.map((s) => [s.phrase, s.index, s.role]);
    expect(roles.filter(([p]) => p === "Borrower").map(([, , r]) => r)).toEqual(["OBLIGOR", "CONDITION_SUBJECT", "MEASUREMENT_CONTEXT"]); // v3: the proviso's compliance subject is not the actor the provision binds
    expect(roles.find(([p]) => p === "Subsidiaries")?.[2]).toBe("MEASUREMENT_CONTEXT");
    expect(classifyEntityMentionRole("EBITDA of the Borrower and its Subsidiaries", "EBITDA of the ".length, "Borrower".length)).toBe("MEASUREMENT_CONTEXT");
  });
  it("a permitted actor different from the metric group: the Subsidiary permission (7.02(b)) keeps its NON_GUARANTOR_RS scope, and the Borrower-scoped child (7.02(a)) is not widened by the measurement mention", () => {
    expect(run.ruleAt("7.02(b)").entityScope).toEqual(["NON_GUARANTOR_RS"]);
    expect(run.ruleAt("7.02(a)").entityScope).toEqual(["BORROWER"]);
    expect(run.ruleAt("7.02(a)").entityScopeAudit?.witness?.decidedBy).toBe("PARENT_SCOPE"); // the child's own excerpt binds no obligor; applicability is inherited, not widened
  });
});

describe("§48 retrieval cycle control: A -> B -> A terminates and is recorded, never re-traversed", () => {
  it("two calculation provisions referencing each other produce exactly one REFERENCE_CYCLE stop and a finite bundle", () => {
    const DOC = "cycle-doc";
    const text = ["ARTICLE VIII CALCULATIONS", "", "SECTION 8.01 Alpha Amount . The Alpha Amount shall be the amount determined under Section 8.02, determined on a consolidated basis, multiplied by two.", "", "SECTION 8.02 Beta Amount . The Beta Amount shall be the amount determined under Section 8.01, determined on a consolidated basis, divided by two.", ""].join("\n");
    const docs = [{ documentId: DOC, label: "cycle", text }];
    const index = buildTestIndex(docs);
    const cand = candidate(index, "8.01", ["DEFINITIONS_CALCULATION_RULES"], "OTHER_RELEVANT_RULE", "alpha", DOC);
    const bundle = buildCovenantContextBundle({ candidate: cand, packageKey: "p", companyId: "c", instrumentKey: "i" }, { index, packageGraph: null, exactTermsByDocument: buildExactTermsByDocument(docs), operativeState: null } as never);
    const cycles = (bundle.retrievalStops ?? []).filter((s) => s.reason === "REFERENCE_CYCLE");
    expect(cycles).toHaveLength(1);
    expect(cycles[0]!.targetSectionRef).toBe("8.01");
    expect(bundle.items.filter((i) => i.normalizedRef === "8.02")).toHaveLength(1);
    expect([...bundle.stopReasons]).toEqual([]);
  });
});
