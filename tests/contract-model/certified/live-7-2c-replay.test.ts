/**
 * SEMANTIC FIDELITY CLOSURE - the first certified live run, frozen and replayed offline (mission §2, §44, §45, §49, §51, §52).
 *
 * The live evidence under docs/phase-3-live-validation/7.2c-first-certified/ is immutable; the fixtures under
 * tests/fixtures/phase-3-live-replay/7.2c-first-certified/ are byte copies of parts of it (each says what it was frozen
 * from). Everything here is deterministic and offline: the real CONMED structural index is rebuilt from the curated
 * fixture documents, the sealed population is loaded (not rediscovered), and ZERO provider calls are made.
 *
 * Nothing in production is keyed to this agreement; the assertions below are about the generic machinery, exercised on
 * the one real failure that motivated it.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { buildDeterministicStages, rehydrateNodeIds, sealedPopulation, COMPANY_ID, INSTRUMENT_KEY, PACKAGE_KEY } from "../../../scripts/p3-conmed-pilot/pipeline";
import { loadPreservedPhase2OperativeState } from "../../../scripts/phase-3-live-validation/operative-state";
import { governingProvisionFor } from "../../../lib/contract-model/compiler/candidate-span";
import { buildCovenantContextBundle } from "../../../lib/contract-model/compiler/context-retrieval/pipeline";
import { normalizeSubmission } from "../../../lib/contract-model/compiler/semantic/normalize";
import { SubmitCompilationSchema, findInvalidWireKinds, SEMANTIC_WIRE_VALIDITY_VERSION } from "../../../lib/contract-model/compiler/semantic/wire-schema";
import { determineStatus, contextBundleEvidenceFlags } from "../../../lib/contract-model/compiler/semantic/bounded-composition";
import { assembleCompilerInput } from "../../../lib/contract-model/covenant-map/candidate-input";
import { buildEnsembleInventory, ENSEMBLE_ALGORITHM_VERSION } from "../../../lib/contract-model/compiler/semantic-accountability/ensemble";
import { computeSemanticVerificationFindingId, numericAssertionKey } from "../../../lib/contract-model/compiler/semantic-verification/identity";
import { SEMANTIC_VERIFIER_ALGORITHM_VERSION } from "../../../lib/contract-model/compiler/semantic-verification/types";
import { testCompilerInput } from "../semantic-compiler/test-helpers";
import type { IRRule } from "../../../lib/contract-model/ir/types";

const FX = "tests/fixtures/phase-3-live-replay/7.2c-first-certified";
const EVIDENCE = "docs/phase-3-live-validation/7.2c-first-certified";
const TARGET_ID = "discovery-candidate:7a3f36589dacd05c41331a80";
const load = <T = any>(name: string): T => JSON.parse(fs.readFileSync(path.join(FX, name), "utf8")) as T;
const sha256 = (b: Buffer | string) => crypto.createHash("sha256").update(b).digest("hex");
/** Target-side economics the child restated in the live run; none of them is stated by the child's own operative source. */
const TARGET_FIGURES = ["80%", "3.75", "5.50", "2.75"];

const stages = (() => {
  const s = buildDeterministicStages();
  const { rehydrated } = rehydrateNodeIds(sealedPopulation().all, s.index);
  const target = rehydrated.find((c) => c.discoveryId === TARGET_ID);
  if (!target) throw new Error("target not in the sealed population");
  const owners = rehydrated.map((c) => ({ discoveryId: c.discoveryId, structuralNodeIds: c.structuralNodeIds }));
  return { ...s, rehydrated, target, owners };
})();

describe("live evidence is immutable and the fixtures are its byte copies", () => {
  it("every file of the first certified evidence directory still has the hash recorded by the closure", () => {
    const man = load<{ files: Record<string, string> }>("evidence-manifest.json");
    const files = fs.readdirSync(EVIDENCE, { recursive: true }).map(String).filter((f) => fs.statSync(path.join(EVIDENCE, f)).isFile()).sort();
    expect(files).toEqual(Object.keys(man.files).sort());
    for (const f of files) expect(sha256(fs.readFileSync(path.join(EVIDENCE, f)))).toBe(man.files[f]);
  });
  it("the frozen fixtures reproduce the observed failures before remediation", () => {
    const comp = JSON.parse(fs.readFileSync(path.join(EVIDENCE, "06-compilation.json"), "utf8"));
    expect(load("02-bad-submission-raw-model-output.json").rawModelOutput).toEqual(comp.rawModelOutput);
    expect(load("01-pass-a-frozen-inventory.json").frozenInventory).toEqual(comp.frozenInventory);
    const ir = load("03-normalized-ir-as-compiled.json");
    expect(ir.rules.map((r: IRRule) => r.sourceSectionRef)).toEqual(["7.2(c)", "7.2"]); // the foreign parent rule WAS emitted
    expect(JSON.stringify(ir.rules)).toContain("financial covenants in Section 7.1, pro forma recomputed"); // the MONEY-typed compliance metric WAS emitted
    expect(JSON.stringify(ir.rules[0].unresolvedDependencies)).toMatch(/80%|3\.75|5\.50|2\.75/); // target economics WERE copied into prose
    const ver = load("04-verifier-findings.json");
    const ids = ver.findings.map((f: { findingId: string }) => f.findingId);
    expect(ids.length).toBe(8); expect(new Set(ids).size).toBe(6); // the finding-id collision WAS real
    expect(ir.failureReasons).toContain("OPERATIVE_STATE_UNRESOLVED");
    expect(load("05-context-bundle-as-retrieved.json").sufficiencyState).toBe("BUDGET_EXCEEDED");
  });
});

describe("§45 the exact bad live submission through the repaired validators", () => {
  const fx = load("02-bad-submission-raw-model-output.json");
  const ci = load("00-compiler-input.json");
  const bundle = buildCovenantContextBundle({ candidate: stages.target, packageKey: PACKAGE_KEY, companyId: COMPANY_ID, instrumentKey: INSTRUMENT_KEY }, { ...stages.access, operativeState: null, semanticUnitOwnership: stages.owners });
  const input = testCompilerInput({ companyId: ci.companyId, instrumentKey: ci.instrumentKey, sourceDocumentId: ci.sourceDocumentId, candidateRef: TARGET_ID, sourceSectionRef: ci.sourceSectionRef, operativeSourceText: ci.operativeSourceText, contextBundle: bundle, candidatePopulation: stages.owners, toolAccess: { structuralIndex: stages.index, operativeState: null, packageGraph: stages.packageGraph, amendmentEffects: null, contextBundle: bundle } });
  const normalized = normalizeSubmission(SubmitCompilationSchema.parse(fx.rawModelOutput), input);

  it("the operative source is exactly the frozen 529-character text", () => {
    expect(ci.operativeSourceText.length).toBe(529);
    expect(sha256(ci.operativeSourceText)).toBe(ci.operativeSourceTextSha256);
  });
  it("transport still parses it (tolerant), but the invented REQUIRES kind is SEMANTIC_WIRE_KIND_INVALID and the composition is never COMPLETED", () => {
    const invalid = findInvalidWireKinds(fx.rawModelOutput);
    expect(invalid.map((i) => i.kind)).toEqual(["REQUIRES"]);
    expect(invalid[0]!.path).toBe("rules[0].conditions[0].expression.operands[0]");
    expect(SEMANTIC_WIRE_VALIDITY_VERSION).toBe("semantic-wire-validity.v1");
    expect(determineStatus(["SEMANTIC_WIRE_KIND_INVALID"], 1, false, true)).not.toBe("COMPLETED");
    expect(determineStatus(["SEMANTIC_WIRE_KIND_INVALID"], 0, false, true)).toBe("FAILED");
  });
  it("the foreign parent-scope §7.2 rule is quarantined as CONTEXT_ONLY_UNIT_EMISSION; only the candidate's own rule survives", () => {
    expect(normalized.rules.map((r) => r.sourceSectionRef)).toEqual(["7.2(c)"]);
    expect(normalized.contextOnlyEmissions.map((e) => [e.kind, e.sourceSectionRef, e.decision.relation])).toEqual([["RULE", "7.2", "PARENT"]]);
    expect(normalized.contextOnlyEmissions[0]!.decision.ownership).toBe("CONTEXT_ONLY_UNIT_EMISSION");
  });
  it("the two cross-references are typed source dependencies, SOURCE_REFERENCE_RESOLVED to structural nodes owned by sealed-population candidates, with deterministic descriptions and empty semantic bindings", () => {
    const r = normalized.rules[0]!;
    expect((r.sourceDependencies ?? []).map((d) => [d.relationshipType, d.normalizedTargetRef, d.resolutionStatus, d.owningCandidateRefs.length > 0, d.boundSemanticTargetIds])).toEqual([["REQUIRES", "7.3(g)", "SOURCE_REFERENCE_RESOLVED", true, []], ["REQUIRES", "7.1", "SOURCE_REFERENCE_RESOLVED", true, []]]);
    expect(r.sourceDependencies![1]!.owningCandidateRefs.length).toBe(2); // two sealed candidates anchor on 7.1 - both recorded, none chosen
    for (const d of r.sourceDependencies!) for (const fig of TARGET_FIGURES) expect(d.description).not.toContain(fig);
    expect(r.unresolvedDependencies ?? []).toEqual([]); // nothing is "unresolved": both references resolved structurally
  });
  it("copied target economics are excluded from the child's artifact and recorded only as non-authoritative diagnostics", () => {
    const artifact = JSON.stringify(normalized.rules);
    for (const fig of TARGET_FIGURES) expect(artifact).not.toContain(fig);
    expect(normalized.dependencyProse.filter((d) => d.scope.includes("dependsOn")).map((d) => d.targetEconomicsExcluded)).toEqual([["80%"], ["2.75:1", "3.75:1", "5.50:1"]]);
    // the model's own sufficiency prose also restated the target ratios: redacted on the unit, kept as diagnostics
    expect(normalized.dependencyProse.some((d) => d.scope.includes("sufficiencyReasons") && d.targetEconomicsExcluded.length > 0)).toBe(true);
    expect(normalized.warnings.filter((w) => w.message.includes("TARGET_ECONOMICS_IN_DEPENDENCY_PROSE"))).toHaveLength(2);
  });
  it("the MONEY-typed compliance metric and the AS_OF without a selector cannot survive as represented semantics", () => {
    const conds = JSON.stringify(normalized.rules[0]!.conditions);
    expect(conds).not.toMatch(/"metricName":"[^"]*compliance[^"]*"[^}]*"type":"MONEY"/);
    expect(normalized.rules[0]!.conditions[1]!.expression?.kind).toBe("UNSUPPORTED");
    expect(normalized.warnings.some((w) => w.message.includes("AS_OF requires asOfDate"))).toBe(true);
  });
  it("entity scope: the measurement-context mention ('of the Parent Borrower and its Subsidiaries for which financial statements') no longer downgrades the obligor scope", () => {
    expect(normalized.rules[0]!.entityScope).toEqual(["BORROWER"]);
  });
});

describe("§49 finding identity binds the assertion", () => {
  const ver = load("04-verifier-findings.json");
  const collided = ver.findings.filter((f: { findingType: string; irPath: string }) => f.findingType === "UNSUPPORTED_NUMERIC_ASSERTION" && f.irPath === "rules[0].unresolvedDependencies[1].description");
  it("the live verifier issued three numeric findings at one path under ONE id", () => {
    expect(collided).toHaveLength(3);
    expect(new Set(collided.map((f: { findingId: string }) => f.findingId)).size).toBe(1);
  });
  it("v2 identity: the same three assertions yield three distinct, deterministic ids; identical content yields identical ids", () => {
    const base = (key: string | null) => computeSemanticVerificationFindingId(collided[0]!.companyId, collided[0]!.instrumentKey, collided[0]!.candidateRef, "UNSUPPORTED_NUMERIC_ASSERTION", collided[0]!.ruleOrDefinitionId, collided[0]!.irPath, collided[0]!.sourceCitation, SEMANTIC_VERIFIER_ALGORITHM_VERSION, key);
    const keys = ["3.75:1", "5.50:1", "2.75:1"].map((raw, i) => numericAssertionKey({ kind: "RATIO", normalizedValue: [3.75, 5.5, 2.75][i]!, unit: "x", currency: null, rawText: raw }));
    const ids = keys.map(base);
    expect(new Set(ids).size).toBe(3);
    expect(keys.map(base)).toEqual(ids);
    expect(base(numericAssertionKey({ kind: "RATIO", normalizedValue: 3.75, unit: "x", currency: null, rawText: "3.75:1" }))).toBe(ids[0]);
    // a different unit/type or a different owner is a different finding
    expect(base(numericAssertionKey({ kind: "MONEY", normalizedValue: 3.75, unit: null, currency: "USD", rawText: "3.75:1" }))).not.toBe(ids[0]);
    expect(computeSemanticVerificationFindingId(collided[0]!.companyId, collided[0]!.instrumentKey, collided[0]!.candidateRef, "UNSUPPORTED_NUMERIC_ASSERTION", "ir-rule:other", collided[0]!.irPath, collided[0]!.sourceCitation, SEMANTIC_VERIFIER_ALGORITHM_VERSION, keys[0]!)).not.toBe(ids[0]);
    expect(SEMANTIC_VERIFIER_ALGORITHM_VERSION).toBe("phase-3c-semantic-verifier.v5");
  });
});

describe("§44 the preserved live Pass-A responses through the v2 ensemble (offline derived replay)", () => {
  it("old: 7 canonical / 3 material SINGLE_RUN; new: 7 canonical / 4 exact / 3 coverage-corroborated / 0 single-run / 0 conflicts / 4 support groups", () => {
    const fx = load("01-pass-a-frozen-inventory.json");
    const ci = load("00-compiler-input.json");
    const fi = fx.frozenInventory;
    expect(fi.ensemble.algorithmVersion).toBe("semantic-ensemble.v1");
    expect(fi.ensemble.counts).toMatchObject({ canonicalItems: 7, corroborated: 4, singleRun: 3, materialSingleRun: 3, conflicted: 0 });
    // per-pass inventories reconstructed from each canonical item's recorded member ids (support provenance), never re-inventoried
    const passes = fi.ensemble.passIds.map((passId: string) => {
      const items = fi.items.filter((it: any) => it.support?.memberItemIds?.[passId]).map((it: any) => { const { support: _s, ...rest } = it; return { ...rest, inventoryItemId: it.support.memberItemIds[passId][0], mergedDuplicates: [] }; });
      const compat = fi.ensemble.compatibility.passes[passId];
      const { ensemble: _e, ...base } = fi;
      return { passId, inventory: { ...base, items, frozenContentHash: fi.ensemble.passHashes[passId], algorithmVersion: compat.algorithmVersion, promptVersion: compat.promptVersion, provider: compat.provider, model: compat.model, sourceContextHash: compat.sourceContextHash, inventoryStatus: "INVENTORY_OK", inventoryStatusReason: "replay" } };
    });
    expect(passes.map((p: any) => p.inventory.items.length)).toEqual([5, 6]);
    const sc = { ...fx.sourceContext, regions: fx.sourceContext.regions.filter((r: any) => r.kind === "OPERATIVE").map((r: any) => ({ ...r, text: r.text ?? ci.operativeSourceText })) };
    const regionText = new Map<string, string>(sc.regions.map((r: any) => [r.regionId, r.text]));
    const partition = { ...fi.partition, slots: fi.partition.slots.map((sl: any) => ({ ...sl, context: sl.context ?? [], text: sl.text ?? regionText.get(sl.regionId)!.slice(sl.charStart, sl.charEnd) })) };
    const e = buildEnsembleInventory({ candidateRef: fi.candidateRef, sourceContext: sc, partition, passes });
    expect(ENSEMBLE_ALGORITHM_VERSION).toBe("semantic-ensemble.v2");
    expect(e.ensemble.counts).toMatchObject({ canonicalItems: 7, corroborated: 4, coverageCorroborated: 3, singleRun: 0, materialSingleRun: 0, conflicted: 0, supportGroups: 4 });
    expect(e.ensemble.supportReviewRequired).toBe(false);
    expect(e.items).toHaveLength(7); // no proposition was merged away
    const byStart = (s: number) => e.items.find((i) => i.sourceSpan.charStart === s)!;
    expect(byStart(63).support!.supportStatus).toBe("COVERAGE_CORROBORATED"); // pass-1's shorter proviso fragment, contained in pass-2's longer one
    expect(byStart(121).support!.supportStatus).toBe("COVERAGE_CORROBORATED"); // pass-2's nested portion of the same condition
    expect(byStart(63).support!.supportGroupId).toBe(byStart(124).support!.supportGroupId);
  });
});

describe("§52 context retrieval for the target after the dependency-boundary fix", () => {
  const old = load("05-context-bundle-as-retrieved.json");
  it("old: BUDGET_EXCEEDED at cross-reference depth 3 - and the traversal graph shows the depth was reached by a definition chain whose leaves mention no section at all (nothing was withheld)", () => {
    expect(old.sufficiencyState).toBe("BUDGET_EXCEEDED");
    expect(old.stopReasons).toEqual(["CONTEXT_BUDGET_EXCEEDED: maxCrossReferenceDepth (3) reached"]);
    const items = new Map<string, any>(old.items.map((i: any) => [i.itemId, i]));
    const adj = new Map<string, string[]>();
    for (const e of old.edges) adj.set(e.fromItemId, [...(adj.get(e.fromItemId) ?? []), e.toItemId]);
    const root = old.items.find((i: any) => i.type === "OPERATIVE_SOURCE")!.itemId;
    const depth = new Map<string, number>([[root, 0]]);
    for (const q = [root]; q.length > 0;) { const x = q.shift()!; for (const y of adj.get(x) ?? []) if (!depth.has(y)) { depth.set(y, depth.get(x)! + 1); q.push(y); } }
    const leaves = [...depth.entries()].filter(([, d]) => d === 3).map(([id]) => items.get(id)!);
    expect(leaves.map((i) => i.normalizedRef).sort()).toEqual(["Agreement", "Loan"]);
    for (const leaf of leaves) { expect(leaf.type).toBe("DEFINITION_DEPENDENCY"); expect(leaf.excerptText).not.toMatch(/\b(?:Section|Article)\s+[\dIVX]/); }
    expect([...depth.entries()].filter(([id]) => items.get(id)!.type === "CROSS_REFERENCE").map(([, d]) => d).sort()).toEqual([1, 1, 2]);
  });
  it("new: SUFFICIENT, no budget stop, prior items plus plural-resolved definitions, cross-reference depth 1, and explicit ownership stops at the two separately-owned referenced covenants", () => {
    const b = buildCovenantContextBundle({ candidate: stages.target, packageKey: PACKAGE_KEY, companyId: COMPANY_ID, instrumentKey: INSTRUMENT_KEY }, { ...stages.access, operativeState: null, semanticUnitOwnership: stages.owners });
    expect(b.sufficiencyState).toBe("SUFFICIENT");
    expect([...b.stopReasons]).toEqual([]);
    // IPV-09: "Subsidiaries" / "Wholly-Owned Subsidiaries" surface forms now retrieve the singular definitions
    // (2 additional DEFINITION_DEPENDENCY items vs the frozen pre-plural 19-item bundle).
    expect(b.items.length).toBeGreaterThanOrEqual(old.items.length);
    const added = b.items
      .filter((i) => !old.items.some((o: any) => o.type === i.type && o.normalizedRef === i.normalizedRef))
      .map((i) => `${i.type}:${i.normalizedRef}`)
      .sort();
    expect(added).toEqual(["DEFINITION_DEPENDENCY:Subsidiary", "DEFINITION_DEPENDENCY:Wholly-Owned Subsidiary"]);
    expect(b.performance.maxCrossReferenceDepthReached).toBe(1);
    const stops = (b.retrievalStops ?? []).map((s) => [s.reason, s.targetSectionRef, s.owningCandidateRefs.length]);
    expect(stops).toEqual([["STOP_AT_SEPARATELY_OWNED_SEMANTIC_UNIT", "7.3(g)", 1], ["STOP_AT_SEPARATELY_OWNED_SEMANTIC_UNIT", "7.1", 2]]);
    expect(b.retrievalStops!.every((s) => s.detail.includes("delegated"))).toBe(true);
  });
});

describe("§33/§51 the target's operative state from the REAL preserved Phase-2 evidence", () => {
  const adapted = loadPreservedPhase2OperativeState({ instrumentKey: INSTRUMENT_KEY, baseDocumentId: stages.target.documentId });
  it("loads the preserved PHASE_2G report for the instrument: OPERATIVE_STATE_REVIEW_REQUIRED, four provisions, none governing the target", () => {
    expect(adapted.source.runId).toBe("PHASE_2G_CONMED_AMENDMENT_REGRESSION");
    expect(adapted.state.status).toBe("OPERATIVE_STATE_REVIEW_REQUIRED");
    expect(adapted.state.provisions.map((p) => [p.kind, p.sectionRef ?? p.definedTermRef, p.status])).toEqual([
      ["DEFINITION", "consolidated senior secured leverage ratio", "OPERATIVE_STATE_REVIEW_REQUIRED"], ["DEFINITION", "consolidated total leverage ratio", "OPERATIVE_STATE_REVIEW_REQUIRED"], ["DEFINITION", "indebtedness", "OPERATIVE_STATE_REVIEW_REQUIRED"], ["SECTION", "1.1", "OPERATIVE_STATE_REVIEW_REQUIRED"]]);
    expect(adapted.state.provisions.every((p) => p.currentText === null && p.reviewRequired)).toBe(true); // never faked
    expect(adapted.effects).toHaveLength(8);
    expect(governingProvisionFor(stages.target, adapted.state)).toBeNull(); // no Phase-2 provision governs 7.2(c): the base node text is its operative source
  });
  it("supplied to the canonical input, the state makes the relied-upon 'Indebtedness' definition HISTORICAL_ONLY (an amendment effect with a CONDITIONAL_UNRESOLVED effective date) - a real upstream Phase-2 defect, reported, not resolved", () => {
    const bundle = buildCovenantContextBundle({ candidate: stages.target, packageKey: PACKAGE_KEY, companyId: COMPANY_ID, instrumentKey: INSTRUMENT_KEY }, { ...stages.access, operativeState: adapted.state, semanticUnitOwnership: stages.owners });
    expect(bundle.sufficiencyState).toBe("SUFFICIENT");
    const unresolved = bundle.items.filter((i) => i.evidenceState?.status !== "CURRENT").map((i) => [i.type, i.normalizedRef, i.evidenceState?.status]);
    expect(unresolved).toEqual([["DEFINITION", "Indebtedness", "HISTORICAL_ONLY"], ["AMENDMENT_LEAD", "Indebtedness", "OPERATIVE_STATE_UNRESOLVED"]]);
    expect(bundle.items.find((i) => i.type === "DEFINITION")!.evidenceState!.reason).toMatch(/CONDITIONAL_UNRESOLVED/);
    const input = assembleCompilerInput(stages.target, bundle, { companyId: COMPANY_ID, instrumentKey: INSTRUMENT_KEY, documents: stages.documents, index: stages.index, packageGraph: stages.packageGraph, operativeState: adapted.state, amendmentEffects: adapted.effects, candidates: [stages.target], discoveryRunVersion: stages.target.discoveryRunVersion, asOfDate: "2026-10-04" } as never);
    expect(input.operativeLineage).toBeNull();
    expect(input.operativeSourceOrigin).toBe("STRUCTURAL_NODE");
    expect(contextBundleEvidenceFlags(input).inputHasUnresolvedOperativeEvidence).toBe(true); // OPERATIVE_STATE_UNRESOLVED stays - for the REAL reason now
  });
  it("the live runner supplies this state to the canonical package input and refuses to write into the immutable evidence directory", () => {
    const src = fs.readFileSync("scripts/phase-3-live-validation/run-7-2c-first-certified.ts", "utf8");
    expect(src).toContain("operativeState: phase2.state, amendmentEffects: phase2.effects");
    expect(src).toContain("refusing to write into immutable evidence");
    expect(src).not.toContain('operativeState: null, amendmentEffects: null');
  });
});

describe("§55 no agreement-specific special case in the changed production modules", () => {
  const MODULES = ["lib/contract-model/compiler/semantic/source-reference.ts", "lib/contract-model/compiler/semantic/unit-ownership.ts", "lib/contract-model/compiler/semantic/normalize.ts", "lib/contract-model/compiler/semantic/wire-schema.ts", "lib/contract-model/compiler/semantic/prompt.ts", "lib/contract-model/compiler/semantic/bounded-composition.ts", "lib/contract-model/compiler/semantic/entity-scope-guard.ts", "lib/contract-model/compiler/semantic-accountability/ensemble.ts", "lib/contract-model/compiler/semantic-accountability/reconciliation.ts", "lib/contract-model/compiler/semantic-verification/identity.ts", "lib/contract-model/compiler/semantic-verification/qualitative-grounding.ts", "lib/contract-model/compiler/context-retrieval/reference-context.ts", "lib/contract-model/compiler/context-retrieval/definition-graph.ts", "lib/contract-model/covenant-map/package-dependencies.ts", "lib/contract-model/covenant-map/assemble.ts", "lib/contract-model/phase3-certification/certify.ts", "lib/contract-model/phase3-certification/package-certification.ts", "lib/contract-model/phase3-certification/semantic-source-contract.ts", "lib/contract-model/verified-execution.ts", "lib/contract-model/ir/types.ts"];
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  it.each(MODULES)("%s carries no CONMED / §7.2(c) / §7.3(g) / Section 7.1 / 3.75 / 5.50 / 2.75 / 80% special case in code", (file) => {
    const code = stripComments(fs.readFileSync(file, "utf8"));
    for (const re of [/CONMED/i, /7\.2\(c\)/, /7\.3\(g\)/, /Section 7\.1\b/, /\b3\.75\b/, /\b5\.50\b/, /\b2\.75\b/, /80%/]) expect(code).not.toMatch(re);
  });
});
