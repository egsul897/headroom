/**
 * GOVERNING SCOPE + ACTION SEMANTICS + SOURCE-REFERENCE FIDELITY CLOSURE - the FINAL live validation of §7.2(c), frozen
 * and replayed offline (mission §2, §35-§43, §54).
 *
 * The live evidence under docs/phase-3-live-validation/7.2c-rerun-projection-v1/ (commit f10b611) is immutable and
 * sha256-pinned by tests/fixtures/phase-3-live-replay/7.2c-rerun-projection-v1/evidence-manifest.json; the fixtures are
 * byte copies. Everything here is deterministic and offline: the real CONMED structural index is rebuilt from the curated
 * fixture documents, the sealed population is loaded, the real preserved Phase-2 operative state is supplied, and ZERO
 * provider calls are made. The three live findings (F1 action ontology, F2 entity scope, F3 source-reference expansion)
 * are reproduced from the frozen artifact (BEFORE) and shown closed by the generic machinery (AFTER); nothing in
 * production is keyed to this agreement.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { buildDeterministicStages, rehydrateNodeIds, sealedPopulation, COMPANY_ID, INSTRUMENT_KEY, PACKAGE_KEY } from "../../../scripts/p3-conmed-pilot/pipeline";
import { loadPreservedPhase2OperativeState } from "../../../scripts/phase-3-live-validation/operative-state";
import { buildCandidateCompilerInput, operativeLineageFor } from "../../../lib/contract-model/covenant-map/candidate-input";
import { diagnosticRecord, normalizeSubmission } from "../../../lib/contract-model/compiler/semantic/normalize";
import { SubmitCompilationSchema } from "../../../lib/contract-model/compiler/semantic/wire-schema";
import { determineStatus, contextBundleEvidenceFlags } from "../../../lib/contract-model/compiler/semantic/bounded-composition";
import { resolveGoverningScope } from "../../../lib/contract-model/compiler/semantic/governing-scope";
import { buildIrInventory, IR_INVENTORY_ALGORITHM_VERSION } from "../../../lib/contract-model/compiler/semantic-verification/ir-inventory";
import { buildSourceInventory } from "../../../lib/contract-model/compiler/semantic-verification/source-inventory";
import { normalizeInventorySubmission } from "../../../lib/contract-model/compiler/semantic-accountability/inventory";
import type { SemanticInventoryItem } from "../../../lib/contract-model/compiler/semantic-accountability/types";
import type { WireInventoryItem } from "../../../lib/contract-model/compiler/semantic-accountability/wire-schema";
import { reconcileInventories } from "../../../lib/contract-model/compiler/semantic-verification/reconciliation";
import { buildVerifierUserContent } from "../../../lib/contract-model/compiler/semantic-verification/reviewer";
import { verifyCompiledCandidate } from "../../../lib/contract-model/compiler/semantic-verification/verify";
import { buildSemanticVerificationProjection, SEMANTIC_VERIFICATION_PROJECTION_VERSION } from "../../../lib/contract-model/compiler/semantic-verification/projection";
import type { StageCaller } from "../../../lib/contract-model/compiler/llm-caller";
import { computeSemanticSourceContract } from "../../../lib/contract-model/phase3-certification/semantic-source-contract";
import { certifyCandidate } from "../../../lib/contract-model/phase3-certification/certify";
import { buildVerifiedUnitPackage, snapshotUnitsForVerification, type VerifiableUnit } from "../../../lib/contract-model/verified-units";
import type { IRRule } from "../../../lib/contract-model/ir/types";
import type { SemanticCompilationResult } from "../../../lib/contract-model/compiler/semantic/types";
import type { CovenantMapPackageInput } from "../../../lib/contract-model/covenant-map";

const FX = "tests/fixtures/phase-3-live-replay/7.2c-rerun-projection-v1";
const EVIDENCE = "docs/phase-3-live-validation/7.2c-rerun-projection-v1";
const TARGET_ID = "discovery-candidate:7a3f36589dacd05c41331a80";
const TARGET_DOC = "conmed-doc-a-eighth-ar-credit-agreement";
const load = <T = any>(name: string): T => JSON.parse(fs.readFileSync(path.join(FX, name), "utf8")) as T;
const sha256 = (b: Buffer | string) => crypto.createHash("sha256").update(b).digest("hex");
const TARGET_FIGURES = ["80%", "3.75", "5.50", "2.75"];
const GOVERNING_VERBS = ["Create", "incur", "assume", "suffer to exist"];

const stages = (() => {
  const s = buildDeterministicStages();
  const { rehydrated } = rehydrateNodeIds(sealedPopulation().all, s.index);
  const target = rehydrated.find((c) => c.discoveryId === TARGET_ID);
  if (!target) throw new Error("target not in the sealed population");
  const owners = rehydrated.map((c) => ({ discoveryId: c.discoveryId, structuralNodeIds: c.structuralNodeIds }));
  return { ...s, rehydrated, target, owners };
})();
const adapted = loadPreservedPhase2OperativeState({ instrumentKey: INSTRUMENT_KEY, baseDocumentId: stages.target.documentId });
const frozen = load<SemanticCompilationResult & { sourceContext: { regions: { kind: string; text?: string }[] }; frozenInventory: { candidateRef: string; items: unknown[] }; rawModelOutput: unknown }>("06-compilation.json");
const frozenVerification = load("08-verification.json");
const frozenRule: IRRule = frozen.rules[0]!;

/** The canonical candidate input, exactly as the live runner built it (real index, sealed population, preserved Phase-2 state), plus the governing scope the compiler now resolves. */
const built = (() => {
  const pkg: Omit<CovenantMapPackageInput, "runId" | "discoveryPopulation"> & { candidatePopulation: typeof stages.owners } = {
    companyId: COMPANY_ID, packageKey: PACKAGE_KEY, instrumentKey: INSTRUMENT_KEY, asOfDate: "2026-10-05",
    documents: stages.documents.map((d) => ({ documentId: d.documentId, label: d.label, text: d.text, role: d.documentId === TARGET_DOC ? ("BASE" as const) : d.documentId.includes("amendment") ? ("AMENDMENT" as const) : ("ANCILLARY" as const) })),
    index: stages.index, packageGraph: stages.packageGraph, exactTermsByDocument: stages.access.exactTermsByDocument, operativeState: adapted.state, amendmentEffects: adapted.effects,
    candidates: [stages.target], discoveryRunVersion: stages.target.discoveryRunVersion, candidatePopulation: stages.owners,
  };
  const b = buildCandidateCompilerInput(stages.target, pkg as never);
  const governingScope = resolveGoverningScope({ candidateRef: TARGET_ID, documentId: stages.target.documentId, anchorNodeId: stages.target.structuralNodeIds[0]!, index: stages.index })!;
  const operative = b.input.operativeSourceText;
  const sourceContext = { ...frozen.sourceContext, regions: frozen.sourceContext.regions.map((r) => ({ ...r, text: r.text ?? (r.kind === "OPERATIVE" ? operative : "") })) } as never;
  const input = { ...b.input, candidatePopulation: stages.owners, sourceContext, frozenInventory: frozen.frozenInventory as never, governingScope };
  return { ...b, input, governingScope };
})();

const after = (() => {
  const normalized = normalizeSubmission(SubmitCompilationSchema.parse(frozen.rawModelOutput), built.input);
  const rule = normalized.rules[0]!;
  const failureReasons = contextBundleEvidenceFlags(built.input).inputHasUnresolvedOperativeEvidence ? (["OPERATIVE_STATE_UNRESOLVED"] as const) : ([] as const);
  const status = determineStatus([...failureReasons], normalized.rules.length, normalized.rules.some((r) => r.sufficiency !== "COMPLETE"), failureReasons.length > 0);
  const compilation: SemanticCompilationResult = { ...frozen, status, failureReasons: [...failureReasons], rules: normalized.rules, definitions: normalized.definitions, sharedCapacities: normalized.sharedCapacities, contextOnlyEmissions: normalized.contextOnlyEmissions, dependencyProseDiagnostics: normalized.dependencyProse, normalizationDiagnostics: normalized.diagnostics.map((d) => diagnosticRecord(TARGET_ID, null, d, normalized.scopeUnits)), governingScope: built.governingScope, sourceContext: built.input.sourceContext, frozenInventory: built.input.frozenInventory } as SemanticCompilationResult;
  return { normalized, rule, compilation, status };
})();

const proposedIrBlock = (content: string) => content.slice(content.indexOf("PROPOSED IR"), content.indexOf("Deterministic discrepancy signals"));
const ws = (t: string) => t.replace(/\s+/g, " ");
const projectionOf = (content: string) => { const block = proposedIrBlock(content); return JSON.parse(block.slice(block.indexOf("{"), block.lastIndexOf("}") + 1)) as ReturnType<typeof buildSemanticVerificationProjection>; };

/**
 * A deterministic stand-in for the adversarial reviewer that encodes the three live findings' PREMISES generically and
 * judges only the content it is shown (never the fixture's answers): (1) a canonical action label that does not carry
 * every governing source verb is a narrowing UNLESS the proposal carries a COMPATIBLE source-backed action evidence
 * entry; (2) an empty entity scope is uncertain; (3) a cross-rule target the operative text does not state verbatim is a
 * model expansion; plus the two historical checks (a §-reference the source cites but the proposal never carries;
 * target economics anywhere in the proposal).
 */
function scriptedReview(userContent: string): { findingType: string; severity: string; irPath: string; reasoning: string }[] {
  const source = userContent.slice(0, userContent.indexOf("Retrieved context items:"));
  const governing = userContent.slice(userContent.indexOf("GOVERNING SCOPE CONTEXT"), userContent.indexOf("PROPOSED IR"));
  const projection = projectionOf(userContent);
  const out: { findingType: string; severity: string; irPath: string; reasoning: string }[] = [];
  projection.rules.forEach((r, i) => {
    const verbs = GOVERNING_VERBS.filter((v) => governing.includes(v));
    const labelCarriesEveryVerb = verbs.every((v) => (r.action ?? "").toLowerCase().includes(v.toLowerCase().replace(/\s+/g, "_")));
    const evidence = (r.inheritedAttributes as { attribute: string; evidence: string; compatibility?: string }[]).find((a) => a.attribute === "action" && a.compatibility === "COMPATIBLE" && verbs.every((v) => a.evidence.includes(v)));
    if (verbs.length > 0 && !labelCarriesEveryVerb && !evidence) out.push({ findingType: "WRONG_ACTION", severity: "MATERIAL", irPath: `rules[${i}].action`, reasoning: `the governing text prohibits ${verbs.join(", ")} but the proposed action ${r.action} carries none of that breadth and no source-backed action evidence` });
    if (r.entityScope.length === 0) out.push({ findingType: "WRONG_ENTITY_SCOPE", severity: "UNCERTAIN", irPath: `rules[${i}].entityScope`, reasoning: "the proposed entity scope is empty; who may act cannot be determined from the proposal" });
    (r.conditions as { referencesRuleTargets?: { exactSourceTargetRef: string }[] }[]).forEach((c, k) => {
      const expanded = (c.referencesRuleTargets ?? []).filter((t) => !ws(source).includes(ws(t.exactSourceTargetRef)));
      if (expanded.length > 0) out.push({ findingType: "WRONG_DEPENDENCY", severity: "UNCERTAIN", irPath: `rules[${i}].conditions[${k}].referencesRuleTargets`, reasoning: `the source does not state ${expanded.map((t) => t.exactSourceTargetRef).join(", ")}; the proposal expanded the drafted reference` });
    });
    if (/Section 7\.3\(g\)/.test(source) && !JSON.stringify(r.sourceDependencies).includes("7.3(g)")) out.push({ findingType: "MISSING_CONDITION", severity: "MATERIAL", irPath: `rules[${i}]`, reasoning: "no reference to the lien limitation the source cites" });
  });
  for (const fig of TARGET_FIGURES) if (proposedIrBlock(userContent).includes(fig)) out.push({ findingType: "UNSUPPORTED_NUMERIC_ASSERTION", severity: "MATERIAL", irPath: "rules[0]", reasoning: `figure ${fig} is not stated by the operative source` });
  return out;
}
function scriptedCaller(seen: { userContent: string[] }): StageCaller {
  return { providerName: "scripted", model: "scripted-reviewer", isSynthetic: false, lastTelemetry: () => null,
    async call(schema, stage, _system, userContent) {
      seen.userContent.push(userContent);
      if (stage === "semantic_verification") return schema.parse({ findings: scriptedReview(userContent).map((f) => ({ findingType: f.findingType, severity: f.severity, ruleOrDefinitionId: null, irPath: f.irPath, sourceEvidence: "(scripted)", sourceCitation: "7.2(c)", proposedIrEvidence: "(scripted)", reasoning: f.reasoning })), overallNotes: ["scripted reviewer"] });
      if (stage === "condition_suspicion_classification") return schema.parse({ status: "NO_MATERIAL_CONDITION_SUSPECTED", evidence: [] });
      return schema.parse({});
    } };
}

describe("the final live evidence is immutable and the fixtures are its byte copies", () => {
  it("every file of the final live evidence directory still has the hash recorded at freeze time; the copies are byte-identical", () => {
    const man = load<{ files: Record<string, string>; copies: string[] }>("evidence-manifest.json");
    const files = fs.readdirSync(EVIDENCE, { recursive: true }).map(String).filter((f) => fs.statSync(path.join(EVIDENCE, f)).isFile()).sort();
    expect(files).toEqual(Object.keys(man.files).sort());
    for (const f of files) expect(sha256(fs.readFileSync(path.join(EVIDENCE, f)))).toBe(man.files[f]);
    for (const c of man.copies) expect(sha256(fs.readFileSync(path.join(FX, c)))).toBe(man.files[c]);
  });
  it("BEFORE: the frozen artifact carries the three live defects exactly as the real reviewer saw them", () => {
    expect(frozenRule.action).toBe("INCUR_DEBT");
    expect(frozenRule.inheritedAttributes ?? []).toEqual([]); // no source-backed action breadth beside the canonical label
    expect(frozenRule.entityScope).toEqual([]);
    expect(frozenRule.entityScopeAudit?.status).toBe("UNRECOGNIZED_TAG");
    expect(frozenRule.entityScopeAudit?.rawEmitted.entityScope).toEqual(["Parent Borrower", "Restricted Subsidiary"]);
    expect(frozenRule.conditions[0]!.referencesRuleTargets!.map((t) => t.exactSourceTargetRef)).toEqual(["Section 7.1(a)", "Section 7.1(b)", "Section 7.1(c)", "Section 7.1(d)"]);
    expect(frozenRule.sufficiency).toBe("PARTIAL");
    expect(frozenRule.sufficiencyReasons.filter((r) => r.startsWith("TARGET_ECONOMICS_IN_DEPENDENCY_PROSE")).length).toBe(1);
    expect(frozenRule.sufficiencyReasons.filter((r) => r.startsWith("ENTITY_SCOPE_UNRECOGNIZED_TAG")).length).toBe(2);
    expect(frozenVerification.findings.map((f: { severity: string; irPath: string }) => [f.severity, f.irPath])).toEqual([["MATERIAL", "rules[0].action"], ["UNCERTAIN", "rules[0].entityScope"], ["UNCERTAIN", "rules[0].conditions[0].referencesRuleTargets"]]);
    // Layer 1 v1 inventoried neither the typed source dependencies nor the cross-rule targets
    expect(frozenVerification.irInventory.inventoryAlgorithmVersion).toBe("phase-3c-ir-inventory.v1");
    expect(frozenVerification.irInventory.items.map((i: { kind: string }) => i.kind).sort()).toEqual(["ACTION", "CONDITION", "POSTURE", "UNLIMITED_CAPACITY_MARKER"]);
    expect(frozenVerification.sourceInventory.items.some((i: { kind: string }) => i.kind === "SECTION_REFERENCE")).toBe(false);
  });
});

describe("§4-§7 governing scope recovered from the real CONMED index (the parser produced no Article VII node)", () => {
  const g = built.governingScope;
  it("the chain is §7.2 (PARENT_SCOPE, own lead-in) + the unparsed Article-level applicability preamble (GOVERNING_SCOPE); only ancestor lead-in material, with document, span, distance and hash", () => {
    expect(stages.index.getAncestors(stages.target.structuralNodeIds[0]!).map((a) => [a.nodeType, a.sectionRef])).toEqual([["SECTION", "7.2"]]);
    expect(g.ancestorRegions.map((r) => [r.role, r.derivation, r.sectionRef, r.ancestorDistance, r.structuralNodeId !== null])).toEqual([["PARENT_SCOPE", "STRUCTURAL_ANCESTOR_LEAD_IN", "7.2", 1, true], ["GOVERNING_SCOPE", "UNPARSED_ARTICLE_PREAMBLE", "article-group:7", 2, false]]);
    expect(g.ancestorRegions[0]!.text).toBe("SECTION 7.2 Limitation on Indebtedness.\nCreate, incur, assume or suffer to exist any Indebtedness, except:");
    expect(g.ancestorRegions[1]!.text).toContain("shall not, and shall not permit any of its Subsidiaries to, directly or indirectly:");
    const doc = stages.documents.find((d) => d.documentId === TARGET_DOC)!.text;
    for (const r of g.ancestorRegions) { expect(doc.slice(r.charStart, r.charEnd)).toBe(r.text); expect(r.sha256).toBe(sha256(r.text)); expect(r.documentId).toBe(TARGET_DOC); }
    // sibling economics never enter governing scope
    for (const r of g.ancestorRegions) for (const fig of [...TARGET_FIGURES, "$"]) expect(r.text).not.toContain(fig);
    expect(g.ancestorRegions.every((r) => r.structuralNodeId !== stages.target.structuralNodeIds[0])).toBe(true);
  });
  it("entity scope BORROWER + ANY_SUBSIDIARY is established mechanically from the Article preamble; the action INCUR_DEBT from the §7.2 lead-in; the governing prohibition from the preamble", () => {
    expect(g.inheritedEntityScope).toEqual(["BORROWER", "ANY_SUBSIDIARY"]);
    expect(g.inheritedEntityScopeBasis).toMatchObject({ sectionRef: "article-group:7", role: "GOVERNING_SCOPE", phrases: ["Borrower", "Subsidiaries"] });
    expect(g.ancestorRegions[1]!.ancestorDistance).toBe(2);
    expect(g.inheritedAction).toBe("INCUR_DEBT");
    expect(g.inheritedActionBasis).toMatchObject({ sectionRef: "7.2", role: "PARENT_SCOPE", evidence: "Create, incur, assume or suffer to exist any Indebtedness" });
    expect(g.inheritedActionBasis!.classification.verbs).toEqual(["Create", "incur", "assume", "suffer to exist"]);
    expect(g.governingProhibition).toMatchObject({ sectionRef: "article-group:7", role: "GOVERNING_SCOPE" });
  });
  it("§7 identity: the governing scope enters the semantic source contract; a changed applicability preamble changes the version, an unchanged one does not", () => {
    const base = { operativeSourceVersion: built.sourceContentVersion!, operativeIdentityStrength: built.identityStrength, candidateSectionRef: "7.2(c)", bundle: built.bundle, units: { rules: after.normalized.rules, definitions: [], sharedCapacities: [] }, toolCallLog: [], operativeLineage: null, appliedEffectIds: [], asOfDate: "2026-10-05" };
    const a = computeSemanticSourceContract({ ...base, governingScope: g });
    const same = computeSemanticSourceContract({ ...base, governingScope: { ...g } });
    const changedPreamble = computeSemanticSourceContract({ ...base, governingScope: { ...g, ancestorRegions: g.ancestorRegions.map((r) => (r.derivation === "UNPARSED_ARTICLE_PREAMBLE" ? { ...r, text: r.text.replace("any of its Subsidiaries", "any of its Restricted Subsidiaries"), sha256: sha256(r.text.replace("any of its Subsidiaries", "any of its Restricted Subsidiaries")) } : r)) } });
    expect(a.version).toMatch(/^sscv2:[0-9a-f]{64}$/);
    expect(same.version).toBe(a.version);
    expect(changedPreamble.version).not.toBe(a.version);
    expect(changedPreamble.components.governingScopeHash).not.toBe(a.components.governingScopeHash);
    expect(a.reliedUpon.contextItems.filter((i) => i.type.startsWith("GOVERNING_SCOPE")).map((i) => i.normalizedRef).sort()).toEqual(["7.2", "article-group:7"]);
  });
});

describe("§35-§42 the frozen live submission re-normalized with the governing chain (AFTER)", () => {
  const r = after.rule;
  it("F2 entity: BORROWER + ANY_SUBSIDIARY from the governing source outranks the model's unrecognized 'Restricted Subsidiary'; the raw tag and the discrepancy are preserved", () => {
    expect(r.entityScope).toEqual(["BORROWER", "ANY_SUBSIDIARY"]);
    expect(r.entityScopeAudit).toMatchObject({ guardVersion: "entity-scope-consistency-guard.v5", status: "SOURCE_SCOPE_DERIVED", safeToRely: true, precedence: "GOVERNING_SCOPE_SOURCE" });
    expect(r.entityScopeAudit!.witness.decidedBy).toBe("GOVERNING_SCOPE");
    expect(r.entityScopeAudit!.witness.governingScope).toMatchObject({ derivedScope: ["BORROWER", "ANY_SUBSIDIARY"], basisSectionRef: "article-group:7", basisRole: "GOVERNING_SCOPE", ancestorDistance: 2 });
    expect(r.entityScopeAudit!.rawEmitted.entityScope).toEqual(["Parent Borrower", "Restricted Subsidiary"]);
    expect(r.entityScopeAudit!.modelDiscrepancy).toEqual({ modelScope: ["BORROWER"], rawEmitted: ["Parent Borrower", "Restricted Subsidiary"], governingScope: ["BORROWER", "ANY_SUBSIDIARY"], relation: "MODEL_UNRECOGNIZED" });
    expect(r.entityScopeAudit!.reasonCodes).toEqual(["ENTITY_SCOPE_UNRECOGNIZED_TAG", "ENTITY_SCOPE_SOURCE_DERIVED", "ENTITY_SCOPE_MODEL_DISCREPANCY_RECORDED"]);
    // the own excerpt's mentions are a condition subject and a measurement group - neither binds applicability
    expect(r.entityScopeAudit!.witness.signals.filter((s) => s.tier === "OWN_EXCERPT").map((s) => [s.phrase, s.role])).toEqual([["Borrower", "CONDITION_SUBJECT"], ["Borrower", "MEASUREMENT_CONTEXT"], ["Subsidiaries", "MEASUREMENT_CONTEXT"]]);
    expect((r.inheritedAttributes ?? []).find((a) => a.attribute === "entityScope")).toMatchObject({ sourceAuthority: "GOVERNING_SCOPE", sourceSectionRef: "article-group:7", canonicalValue: "BORROWER+ANY_SUBSIDIARY", compatibility: "INCOMPATIBLE", ancestorDistance: 2 });
  });
  it("F1 action: the canonical INCUR_DEBT is retained; the full source verb breadth is preserved as COMPATIBLE action evidence from §7.2; the Article preamble is the inherited governing prohibition", () => {
    expect(r.action).toBe("INCUR_DEBT");
    const action = (r.inheritedAttributes ?? []).find((a) => a.attribute === "action")!;
    expect(action).toMatchObject({ sourceAuthority: "PARENT_SCOPE", sourceSectionRef: "7.2", evidence: "Create, incur, assume or suffer to exist any Indebtedness", canonicalValue: "INCUR_DEBT", compatibility: "COMPATIBLE", ancestorDistance: 1 });
    expect(action.sourceSpan).toMatchObject({ documentId: TARGET_DOC, structuralNodeId: expect.stringMatching(/^structural-node:/) });
    expect((r.inheritedAttributes ?? []).find((a) => a.attribute === "governingProhibition")).toMatchObject({ sourceAuthority: "GOVERNING_SCOPE", sourceSectionRef: "article-group:7" });
    expect((r.inheritedAttributes ?? []).map((a) => a.attribute)).toEqual(["governingProhibition", "action", "entityScope"]);
  });
  it("F3 reference: the condition targets exactly 'Section 7.1' as drafted (resolved, two owners, unbound); the model's 7.1(a)-(d) expansion is excluded and retained only as a non-authoritative audit", () => {
    const c = r.conditions[0]!;
    expect(c.referencesRuleTargets!.map((t) => [t.exactSourceTargetRef, t.normalizedTargetRef, t.resolutionStatus, t.owningCandidateRefs.length, t.boundSemanticTargetIds])).toEqual([["Section 7.1", "7.1", "SOURCE_REFERENCE_RESOLVED", 2, []]]);
    expect(c.referencesRuleTargets![0]!.resolvedStructuralTarget).toEqual({ documentId: TARGET_DOC, structuralNodeId: "structural-node:9f5e530c88ebe99dbd321f79", sectionRef: "7.1" });
    expect(c.targetCombination).toBe("ALL_SATISFIED");
    expect(c.evaluationBasis).toMatchObject({ proForma: true, transactionEffect: "after giving effect to the incurrence of such Indebtedness", asOfSelector: "last day of the most recently ended fiscal quarter of the Parent Borrower and its Subsidiaries for which financial statements are available", deemedEffectiveAt: "first day of each relevant period for testing such compliance", testingPeriod: null });
    const audit = r.sourceReferenceAudit!;
    expect(audit.version).toBe("source-reference-fidelity.v3");
    expect(audit.statedReferences.map((s) => [s.raw, s.normalized, s.origin])).toEqual([["Section 7.3(g)", "7.3(g)", "OPERATIVE_TEXT"], ["Section 7.1", "7.1", "OPERATIVE_TEXT"]]);
    expect(audit.entries.filter((e) => e.path.includes("referencesRuleTargets")).map((e) => [e.emitted, e.classification, e.authoritative, e.restoredTo])).toEqual([["Section 7.1(a)", "MODEL_NARROWED_REFERENCE", false, "Section 7.1"], ["Section 7.1(b)", "MODEL_NARROWED_REFERENCE", false, "Section 7.1"], ["Section 7.1(c)", "MODEL_NARROWED_REFERENCE", false, "Section 7.1"], ["Section 7.1(d)", "MODEL_NARROWED_REFERENCE", false, "Section 7.1"]]);
    expect(audit.entries.filter((e) => e.path.includes("dependsOn")).map((e) => [e.emitted, e.classification, e.authoritative])).toEqual([["Section 7.3(g)", "EXACT_SOURCE_REFERENCE", true], ["Section 7.1", "EXACT_SOURCE_REFERENCE", true]]);
    expect(after.normalized.diagnostics.some((d) => d.message.startsWith("MODEL_EXPANDED_REFERENCE_EXCLUDED") && d.message.includes('"Section 7.1(d)"'))).toBe(true);
    expect(JSON.stringify(r.conditions)).not.toMatch(/7\.1\([a-d]\)/);
    expect((r.sourceDependencies ?? []).map((d) => [d.relationshipType, d.normalizedTargetRef, d.resolutionStatus, d.owningCandidateRefs.length])).toEqual([["REQUIRES", "7.3(g)", "SOURCE_REFERENCE_RESOLVED", 1], ["REQUIRES", "7.1", "SOURCE_REFERENCE_RESOLVED", 2]]);
  });
  it("SA §39 target selector: the §7.1 cross-rule target carries the source-qualified selector 'financial covenants contained in Section 7.1' (QUALIFIED_RULE_SET); the §7.3(g) dependency is a WHOLE_PROVISION reference; the candidate stays semantically clean", () => {
    const target = r.conditions[0]!.referencesRuleTargets![0]!;
    expect(target.selector).toEqual({ sourceText: "financial covenants contained in Section 7.1", kind: "QUALIFIED_RULE_SET", qualifierText: "financial covenants contained in" });
    expect((r.sourceDependencies ?? []).map((d) => [d.normalizedTargetRef, d.selector?.kind, d.selector?.qualifierText])).toEqual([["7.3(g)", "WHOLE_PROVISION", null], ["7.1", "QUALIFIED_RULE_SET", "financial covenants contained in"]]);
    expect((r.sourceDependencies ?? []).map((d) => d.description)).toEqual(["requires that the terms of Section 7.3(g) are satisfied; the semantics of Section 7.3(g) are separately owned and resolved at package level", "requires that the terms of Section 7.1 are satisfied; the semantics of Section 7.1 are separately owned and resolved at package level"]);
    expect([r.action, r.entityScope, r.sufficiency]).toEqual(["INCUR_DEBT", ["BORROWER", "ANY_SUBSIDIARY"], "COMPLETE"]);
    expect(r.conditions[0]!.evaluationBasis?.proForma).toBe(true);
  });
  it("§27-§30, §41 sufficiency: COMPLETE - the quarantined '80%' prose and the outranked model tag are diagnostics on the compilation, never sufficiency reasons; no target economics in the artifact", () => {
    expect(r.sufficiency).toBe("COMPLETE");
    expect(r.sufficiencyReasons.filter((x) => /TARGET_ECONOMICS|UNRECOGNIZED_TAG|MODEL_EXPANDED/.test(x))).toEqual([]);
    expect(after.normalized.dependencyProse.filter((d) => d.scope.includes("dependsOn")).map((d) => d.targetEconomicsExcluded)).toEqual([["80%"], []]);
    expect(after.normalized.diagnostics.map((d) => d.message.split(":")[0]).sort()).toEqual(["ENTITY_SCOPE_UNRECOGNIZED_TAG", "MODEL_EXPANDED_REFERENCE_EXCLUDED", "TARGET_ECONOMICS_IN_DEPENDENCY_PROSE"]);
    for (const fig of TARGET_FIGURES) expect(JSON.stringify(after.normalized.rules)).not.toContain(fig);
    expect(JSON.stringify(after.normalized.rules)).not.toContain("(unspecified)");
  });
  it("§42 candidate compilation stays REVIEW_REQUIRED for the real upstream reason (OPERATIVE_STATE_UNRESOLVED) while the unit's own semantics are COMPLETE - two axes, never merged", () => {
    expect(after.status).toBe("REVIEW_REQUIRED");
    expect(after.compilation.failureReasons).toEqual(["OPERATIVE_STATE_UNRESOLVED"]);
    expect(after.compilation.rules.map((x) => x.sufficiency)).toEqual(["COMPLETE"]);
  });
});

describe("SA §40 Pass A inventory replay: the §7.2(c) source references are recoverable from the source text alone; the model's referencedSections never create authority", () => {
  const frozenItems = frozen.frozenInventory.items as SemanticInventoryItem[];
  const toWire = (items: readonly SemanticInventoryItem[], mutate: (i: SemanticInventoryItem) => string[]): WireInventoryItem[] => items.map((i, k) => ({ localRef: `w${k}`, semanticRole: i.semanticRole, proposition: i.proposition, excerpt: i.sourceSpan.excerpt, regionId: i.sourceSpan.regionId, quantitativeValues: (i.quantitativeValues ?? []).map((v) => ({ kind: v.kind, rawText: v.rawText, normalizedValue: v.normalizedValue, unit: v.unit })), referencedTerms: i.referencedTerms ?? [], referencedSections: mutate(i), parentRef: null, relatedRefs: [], materiality: i.materiality, ambiguity: i.ambiguity, ambiguityReason: i.ambiguityReason, operative: i.operative }));
  const replay = (mutate: (i: SemanticInventoryItem) => string[]) => normalizeInventorySubmission({ candidateRef: TARGET_ID, sourceContext: built.input.sourceContext as never, structuralIndex: stages.index }, toWire(frozenItems, mutate)).items;
  const refsOf = (items: SemanticInventoryItem[]) => [...new Set(items.flatMap((i) => i.referencedSections))].sort();
  it("as frozen: the model declared 7.3(g) and 7.1; the authoritative references are exactly 7.3(g) and 7.1, each grounded in the item's own source span", () => {
    expect(refsOf(frozenItems)).toEqual(["7.1", "7.3(g)"]);
    const items = replay((i) => i.referencedSections);
    expect(refsOf(items)).toEqual(["7.1", "7.3(g)"]);
    for (const i of items) for (const ref of i.referencedSections) expect(i.sourceSpan.excerpt.replace(/\s+/g, " ") + "|" + ref).toMatch(/Section\s*$|7\.1|7\.3\(g\)/);
    expect(items.flatMap((i) => i.referenceAudit?.claims ?? []).map((c) => c.classification)).toEqual(items.flatMap((i) => i.referenceAudit?.claims ?? []).map(() => "CORROBORATED"));
  });
  it("model referencedSections removed entirely: the authoritative references are unchanged (recovered from the source text); the omissions are recorded", () => {
    const items = replay(() => []);
    expect(refsOf(items)).toEqual(["7.1", "7.3(g)"]);
    expect(items.flatMap((i) => i.referenceAudit?.omittedBySource ?? []).sort()).toEqual(["7.1", "7.1", "7.3(g)"]);
    expect(items.every((i) => (i.declaredReferencedSections ?? []).length === 0)).toBe(true);
  });
  it("'Section 99.99' injected into every model item: it never becomes authoritative; every injection is a MODEL_INVENTED_REFERENCE claim; the authoritative set is unchanged", () => {
    const items = replay((i) => [...i.referencedSections, "Section 99.99"]);
    expect(refsOf(items)).toEqual(["7.1", "7.3(g)"]);
    const claims = items.flatMap((i) => i.referenceAudit?.claims ?? []).filter((c) => c.declared === "Section 99.99");
    expect(claims.length).toBe(items.length);
    expect(claims.every((c) => c.classification === "MODEL_INVENTED_REFERENCE" && c.sourceRef === null)).toBe(true);
    expect(items.every((i) => i.declaredReferencedSections!.includes("Section 99.99"))).toBe(true);
  });
});

describe("§31-§32 Layer 1 inventories the typed dependency semantics without double counting", () => {
  it("ir-inventory v2: two SOURCE_DEPENDENCY items, one CROSS_RULE_TARGET (7.1), one EVALUATION_BASIS, three INHERITED_ATTRIBUTE items; the §7.1 edge and gate are distinct, related items", () => {
    const inv = buildIrInventory(TARGET_ID, after.normalized.rules, [], []);
    expect(inv.inventoryAlgorithmVersion).toBe(IR_INVENTORY_ALGORITHM_VERSION);
    expect(IR_INVENTORY_ALGORITHM_VERSION).toBe("phase-3c-ir-inventory.v2");
    const kinds = inv.items.map((i) => i.kind);
    expect(kinds.filter((k) => k === "SOURCE_DEPENDENCY").length).toBe(2);
    expect(inv.items.filter((i) => i.kind === "CROSS_RULE_TARGET").map((i) => [i.irPath, i.textValue])).toEqual([["rules[0].conditions[0].referencesRuleTargets[0]", "7.1|ALL_SATISFIED|SOURCE_REFERENCE_RESOLVED"]]);
    expect(inv.items.filter((i) => i.kind === "EVALUATION_BASIS").map((i) => i.textValue)).toEqual(["proForma:true;transactionEffect:true;asOfSelector:true;deemedEffectiveAt:true;testingPeriod:false"]);
    expect(inv.items.filter((i) => i.kind === "INHERITED_ATTRIBUTE").map((i) => i.textValue)).toEqual(["governingProhibition:@GOVERNING_SCOPE:article-group:7", "action:INCUR_DEBT@PARENT_SCOPE:7.2", "entityScope:BORROWER+ANY_SUBSIDIARY@GOVERNING_SCOPE:article-group:7"]);
    expect(kinds.filter((k) => k === "CONDITION").length).toBe(1); // the new kinds never inflate the condition count
  });
  it("source-inventory v3 + reconciliation: both stated references are ACCOUNTED_FOR; the §7.1 reference is one item satisfied by the edge AND the gate together; no AMBIGUOUS reference signal", () => {
    const src = buildSourceInventory(TARGET_ID, built.input.operativeSourceText, TARGET_DOC, "7.2(c)", null);
    expect(src.items.filter((i) => i.kind === "SECTION_REFERENCE").map((i) => [i.rawText, i.normalizedRef])).toEqual([["Section 7.3(g)", "7.3(g)"], ["Section 7.1", "7.1"]]);
    const rec = reconcileInventories(src, buildIrInventory(TARGET_ID, after.normalized.rules, [], []));
    const refs = rec.items.filter((i) => i.sourceItem?.kind === "SECTION_REFERENCE");
    expect(refs.map((i) => [i.classification, i.sourceItem?.normalizedRef, i.irItems.map((x) => x.kind).sort()])).toEqual([["ACCOUNTED_FOR", "7.3(g)", ["SOURCE_DEPENDENCY"]], ["ACCOUNTED_FOR", "7.1", ["CROSS_RULE_TARGET", "SOURCE_DEPENDENCY"]]]);
    expect(rec.items.filter((i) => i.classification === "AMBIGUOUS" && /reference|dependency/.test(i.reason))).toEqual([]);
  });
});

describe("§43-§47 scripted Layer 2 over the BEFORE and AFTER artifacts; certification logic unchanged", () => {
  it("BEFORE: the scripted reviewer reproduces the three live findings from the frozen artifact (it is not a rubber stamp)", () => {
    const content = buildVerifierUserContent({ compilerInput: { ...built.input, governingScope: null }, compilationResult: { ...frozen, governingScope: null } as SemanticCompilationResult }, { candidateRef: TARGET_ID, items: [], materialUnresolvedCount: 0 } as never, null, null);
    expect(content).toContain("(no governing ancestor context was resolved for this candidate)");
    expect(scriptedReview(content).map((f) => [f.findingType, f.severity, f.irPath])).toEqual([["WRONG_ENTITY_SCOPE", "UNCERTAIN", "rules[0].entityScope"], ["WRONG_DEPENDENCY", "UNCERTAIN", "rules[0].conditions[0].referencesRuleTargets"]]);
    // with the governing chain shown, the action premise is visible too: the enum label alone does not carry the source breadth
    const withChain = buildVerifierUserContent({ compilerInput: built.input, compilationResult: { ...frozen, governingScope: built.governingScope } as SemanticCompilationResult }, { candidateRef: TARGET_ID, items: [], materialUnresolvedCount: 0 } as never, null, null);
    expect(scriptedReview(withChain).map((f) => f.findingType)).toEqual(["WRONG_ACTION", "WRONG_ENTITY_SCOPE", "WRONG_DEPENDENCY"]);
  });
  it("AFTER: real Layer 1 + scripted Layer 2 through verifyCompiledCandidate - no finding attributable to F1/F2/F3, no old §7.3(g) finding, no numeric finding; the reviewer provably received the governing chain and the v2 projection", async () => {
    const seen = { userContent: [] as string[] };
    const result = await verifyCompiledCandidate({ compilerInput: built.input, compilationResult: after.compilation }, { reviewCaller: scriptedCaller(seen), conditionSuspicionCaller: scriptedCaller({ userContent: [] }), forceSemanticReview: true });
    expect(result.semanticReviewInvoked).toBe(true);
    expect(result.findings).toEqual([]);
    // the verification itself still says REVIEW_REQUIRED - for the upstream reason only (the relied-upon definition's
    // operative state is unresolved), never for a semantic finding
    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(after.compilation.inputHasUnresolvedOperativeEvidence).toBe(true);
    expect(result.reconciliation.materialUnresolvedCount).toBe(0);
    expect(result.verificationProjection).toMatchObject({ version: SEMANTIC_VERIFICATION_PROJECTION_VERSION, shownToReviewer: true });
    expect(SEMANTIC_VERIFICATION_PROJECTION_VERSION).toBe("phase-3c-verification-projection.v4");
    const content = seen.userContent[0]!;
    expect(content).toContain("GOVERNING SCOPE CONTEXT");
    expect(content).toContain("shall not, and shall not permit any of its Subsidiaries to, directly or indirectly:");
    const p = projectionOf(content);
    expect(p.rules[0]!.entityScope).toEqual(["BORROWER", "ANY_SUBSIDIARY"]);
    expect(p.rules[0]!.reviewContext.sourceReferenceAudit!.note).toMatch(/NON-AUTHORITATIVE/);
    expect(p.rules[0]!.reviewContext.entityScopeAudit!.precedence).toBe("GOVERNING_SCOPE_SOURCE");
    for (const fig of TARGET_FIGURES) expect(proposedIrBlock(content)).not.toContain(fig);
  });
  it("§42/§47 certification: with the repaired unit and a clean verification, the ONLY blockers are the upstream Phase-2 ones; UNIT_SUFFICIENCY_INCOMPLETE / VERIFICATION_NOT_CLEAN / OPEN_MATERIAL_OR_UNCERTAIN_FINDING no longer apply", async () => {
    const contract = computeSemanticSourceContract({ operativeSourceVersion: built.sourceContentVersion!, operativeIdentityStrength: built.identityStrength, candidateSectionRef: "7.2(c)", bundle: built.bundle, units: after.compilation, toolCallLog: after.compilation.toolCallLog ?? [], operativeLineage: operativeLineageFor(built.operativeProvision), appliedEffectIds: [], asOfDate: "2026-10-05", governingScope: built.governingScope });
    const units: VerifiableUnit[] = [...after.compilation.rules];
    for (const u of units) { u.irSchemaVersion = built.input.irSchemaVersion; u.compilerVersion = built.input.compilerAlgorithmVersion; u.sourceContentVersion = contract.version; }
    const snapshot = snapshotUnitsForVerification(after.compilation);
    const verification = await verifyCompiledCandidate({ compilerInput: built.input, compilationResult: after.compilation }, { reviewCaller: scriptedCaller({ userContent: [] }), conditionSuspicionCaller: scriptedCaller({ userContent: [] }), forceSemanticReview: true });
    const verifiedPackage = buildVerifiedUnitPackage({ companyId: COMPANY_ID, instrumentKey: INSTRUMENT_KEY, candidateRef: TARGET_ID, runId: "offline-governing-replay", snapshot, verification, currentUnits: units });
    const cert = certifyCandidate({ candidate: stages.target, anchored: true, operativeSourceVersion: built.sourceContentVersion, operativeIdentityStrength: built.identityStrength, semanticSourceContract: contract, bundle: built.bundle, compilation: after.compilation, verification, operativeProvision: built.operativeProvision, operativeLineage: operativeLineageFor(built.operativeProvision), snapshot, verifiedPackage, currentUnits: units });
    expect(cert.status).toBe("REVIEW_REQUIRED");
    expect(cert.blockers.map((b) => b.code).sort()).toEqual(["COMPILATION_NOT_COMPLETED", "OPERATIVE_STATE_UNACCEPTABLE", "VERIFICATION_NOT_CLEAN"]);
    expect(cert.blockers.find((b) => b.code === "VERIFICATION_NOT_CLEAN")!.detail).toBe("verification REVIEW_REQUIRED: 0 material finding(s)"); // upstream axis, not a semantic finding
    expect(cert.blockers.find((b) => b.code === "COMPILATION_NOT_COMPLETED")!.detail).toContain("OPERATIVE_STATE_UNRESOLVED");
    for (const phase3 of ["UNIT_SUFFICIENCY_INCOMPLETE", "OPEN_MATERIAL_OR_UNCERTAIN_FINDING", "UNACCOUNTED_MATERIAL_SOURCE", "SUPPORT_UNACCEPTABLE"]) expect(cert.blockers.map((b) => b.code)).not.toContain(phase3);
    expect(verification.findings).toEqual([]);
    expect(cert.warnings.map((w) => w.code).sort()).toEqual(["SEMANTIC_BINDING_PENDING_PACKAGE", "TARGET_ECONOMICS_EXCLUDED"]);
  });
});
