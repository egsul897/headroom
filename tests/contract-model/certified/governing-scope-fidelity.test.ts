/**
 * GOVERNING SCOPE + ACTION SEMANTICS + SOURCE-REFERENCE FIDELITY - the general regression matrix (mission §53):
 * GS1-GS5, ACT1-ACT3, REF1-REF5, SAN1-SAN3, L1-1..L1-3, plus the identity and no-special-case guards. Synthetic
 * agreements only (never real package text); the real structural parser builds the indexes; zero model calls.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { EntityClassTag } from "@prisma/client";
import { buildTestIndex } from "../context-retrieval-test-utils";
import { CONTRACT_ACTIONS } from "../../../lib/contract-model/types";
import { GOVERNING_SCOPE_CONTEXT_VERSION, renderGoverningScopeForPrompt, resolveGoverningScope, type GoverningSemanticContext } from "../../../lib/contract-model/compiler/semantic/governing-scope";
import { assessActionCompatibility, CANONICAL_ACTION_ONTOLOGY_VERSION, classifySourceAction } from "../../../lib/contract-model/compiler/semantic/action-ontology";
import { classifyEmittedReferences, SOURCE_REFERENCE_FIDELITY_VERSION, statedSectionReferencesInText } from "../../../lib/contract-model/compiler/semantic/source-reference-fidelity";
import { ENTITY_SCOPE_GUARD_VERSION, classifyEntityMentionRole, findEntityBindingSignals } from "../../../lib/contract-model/compiler/semantic/entity-scope-guard";
import { normalizeSubmission } from "../../../lib/contract-model/compiler/semantic/normalize";
import { SubmitCompilationSchema } from "../../../lib/contract-model/compiler/semantic/wire-schema";
import { SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION, type SemanticCompilationResult } from "../../../lib/contract-model/compiler/semantic/types";
import { buildSystemPrompt, buildIrPrimitivesBlock } from "../../../lib/contract-model/compiler/semantic/prompt";
import { buildVerifierSystemPrompt } from "../../../lib/contract-model/compiler/semantic-verification/prompt";
import { buildIrInventory } from "../../../lib/contract-model/compiler/semantic-verification/ir-inventory";
import { buildSourceInventory, SOURCE_INVENTORY_ALGORITHM_VERSION } from "../../../lib/contract-model/compiler/semantic-verification/source-inventory";
import { reconcileInventories } from "../../../lib/contract-model/compiler/semantic-verification/reconciliation";
import { verifyCompiledCandidate } from "../../../lib/contract-model/compiler/semantic-verification/verify";
import { SEMANTIC_VERIFIER_ALGORITHM_VERSION, SEMANTIC_VERIFIER_PROMPT_VERSION } from "../../../lib/contract-model/compiler/semantic-verification/types";
import { PACKAGE_DEPENDENCY_RESOLUTION_VERSION, resolvePackageDependencies } from "../../../lib/contract-model/covenant-map/package-dependencies";
import { computeSemanticSourceContract, SEMANTIC_SOURCE_CONTRACT_PREFIX } from "../../../lib/contract-model/phase3-certification/semantic-source-contract";
import type { CovenantMapNode } from "../../../lib/contract-model/covenant-map/types";
import type { IRRule } from "../../../lib/contract-model/ir/types";
import { testCompilerInput, TEST_DOCUMENT_ID } from "../semantic-compiler/test-helpers";

// ---- synthetic agreements -----------------------------------------------------------------------------------------------
const PREAMBLE = "The Company hereby agrees that, so long as any Loan or other amount is owing to any Lender hereunder, the Company shall not, and shall not permit any of its Subsidiaries to, directly or indirectly:";
const S92A = "(a) Indebtedness secured by Liens permitted by Section 9.3(b); provided that the Company shall be in compliance, on a pro forma basis after giving effect to the incurrence of such Indebtedness, with the financial covenants contained in Section 9.1 recomputed as at the last day of the most recently ended fiscal quarter of the Company and its Subsidiaries for which financial statements are available as if such Indebtedness had been incurred on the first day of each relevant period for testing such compliance;";
const S92C = "(c) guarantee any Indebtedness of any Subsidiary in an aggregate amount not to exceed $1,000,000.";
const S94 = "SECTION 9.4 Prepayments . Prepay, redeem or repurchase any Indebtedness, except Indebtedness under the Loan Documents.";
const body = (preambleBlock: string[]) => [
  "CREDIT AGREEMENT dated as of March 1, 2026, among Example Industries Inc., as Borrower, the Lenders party hereto and Agent Bank, as Administrative Agent.",
  "", "ARTICLE I DEFINITIONS", "",
  "SECTION 1.01 Defined Terms . As used in this Agreement, the following terms have the meanings specified below:", "",
  "\"Indebtedness\" means, as to any Person, all obligations of such Person for borrowed money.", "",
  "\"Subsidiary\" means any corporation or other entity that is controlled by the Company.", "",
  ...preambleBlock, "",
  "SECTION 9.1 Financial Covenants . The Company shall not:", "",
  "(a) permit the Leverage Ratio as of the last day of any fiscal quarter to exceed 4.00 to 1.00; or", "",
  "(b) permit the Coverage Ratio for any period of four consecutive fiscal quarters to be less than 2.00 to 1.00.", "",
  "SECTION 9.2 Limitation on Indebtedness . Create, incur, assume or suffer to exist any Indebtedness, except:", "",
  S92A, "",
  "(b) Indebtedness in an aggregate principal amount not to exceed $5,000,000 at any time outstanding; and", "",
  S92C, "",
  "SECTION 9.3 Liens . Create, incur, assume or suffer to exist any Lien upon any property, except:", "",
  "(a) Liens for taxes not yet due; and", "",
  "(b) Liens securing Indebtedness in a principal amount not exceeding 80% of the fair market value of such property.", "",
  S94, "",
  "SECTION 10.1 Reporting . The Company shall deliver financial statements within 90 days after each fiscal year.", "",
].join("\n");
/** A: the Article-level preamble is unparsed (no ARTICLE heading line - the shape the real parser produced on the live agreement). */
const DOC_A = body(["NEGATIVE COVENANTS", PREAMBLE]);
/** B: the Article heading is parsed; its own text carries the preamble, which binds the restricted-subsidiary class. */
const DOC_B = body(["ARTICLE IX NEGATIVE COVENANTS", "", "The Company shall not, and shall not permit any Restricted Subsidiary to, directly or indirectly:"]);
/** A': the applicability preamble changed (material); A'': an unrelated later article changed (immaterial). */
const DOC_A_PREAMBLE_CHANGED = DOC_A.replace("shall not permit any of its Subsidiaries to", "shall not permit any of its Restricted Subsidiaries to");
const DOC_A_UNRELATED_CHANGED = DOC_A.replace("within 90 days", "within 120 days");

const indexOf = (text: string) => buildTestIndex([{ documentId: TEST_DOCUMENT_ID, label: "synthetic", text }]);
const idxA = indexOf(DOC_A), idxB = indexOf(DOC_B);
const nodeAt = (idx: ReturnType<typeof indexOf>, ref: string) => idx.allNodes().find((n) => n.sectionRef === ref)!;
const governing = (idx: ReturnType<typeof indexOf>, ref: string): GoverningSemanticContext => resolveGoverningScope({ candidateRef: `cand:${ref}`, documentId: TEST_DOCUMENT_ID, anchorNodeId: nodeAt(idx, ref).nodeId, index: idx })!;
const opText = (idx: ReturnType<typeof indexOf>, ref: string) => idx.getNodeText(nodeAt(idx, ref).nodeId, "DESCENDANTS").trim();

const rule = (over: Record<string, unknown>) => ({ localRef: "r1", sourceSectionRef: "9.2(a)", covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: "INCUR_DEBT", entityScope: ["BORROWER"], entityScopeExcluded: [], capacityExpression: { kind: "UNLIMITED_CAPACITY", citation: "9.2(a)" }, conditions: [], exceptions: [], dependsOn: [], sufficiency: "COMPLETE", sufficiencyReasons: [], citation: "9.2(a)", excerpt: S92A, ...over });
const submission = (rules: Record<string, unknown>[]) => SubmitCompilationSchema.parse({ rules, definitions: [], sharedCapacities: [], irExtensionCandidates: [], overallNotes: [] });
const inputFor = (idx: ReturnType<typeof indexOf>, ref: string, extra: Record<string, unknown> = {}) => testCompilerInput({ sourceSectionRef: ref, operativeSourceText: opText(idx, ref), governingScope: governing(idx, ref), toolAccess: { structuralIndex: idx, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle: testCompilerInput().contextBundle }, ...extra });
const normalize = (idx: ReturnType<typeof indexOf>, ref: string, rules: Record<string, unknown>[], extra: Record<string, unknown> = {}) => normalizeSubmission(submission(rules), inputFor(idx, ref, extra));
const condition92a = (targets: string[]) => ({ conditionType: "OTHER_RULE_SATISFIED", expression: null, referencesRuleTargets: targets.map((targetRef) => ({ targetRef })), targetCombination: "ALL_SATISFIED", referencesDefinitionId: null, description: "pro forma compliance with the financial covenants", citation: "9.2(a)", excerpt: "with the financial covenants contained in Section 9.1", evaluationBasis: { proForma: true, transactionEffect: "after giving effect to the incurrence of such Indebtedness", asOfSelector: "the last day of the most recently ended fiscal quarter", deemedEffectiveAt: "the first day of each relevant period for testing such compliance", testingPeriod: null } });

describe("GS1-GS4 governing scope is a typed structural chain of ancestor lead-ins only", () => {
  it("GS1/GS4 (unparsed preamble, A): Article preamble + section lead-in + child exception compose; BORROWER + ANY_SUBSIDIARY, INCUR_DEBT and the governing prohibition are recovered from source, never from the model", () => {
    const g = governing(idxA, "9.2(a)");
    expect(g.version).toBe(GOVERNING_SCOPE_CONTEXT_VERSION);
    // distance 3: the parser hung every section under a heading-only "ARTICLE I" node (distance 2, no governing material, not a region); the unparsed preamble sits beyond it
    expect(g.ancestorRegions.map((r) => [r.role, r.derivation, r.sectionRef, r.ancestorDistance])).toEqual([["PARENT_SCOPE", "STRUCTURAL_ANCESTOR_LEAD_IN", "9.2", 1], ["GOVERNING_SCOPE", "UNPARSED_ARTICLE_PREAMBLE", "article-group:9", 3]]);
    expect(g.ancestorRegions[0]!.text).toBe("SECTION 9.2 Limitation on Indebtedness . Create, incur, assume or suffer to exist any Indebtedness, except:");
    expect(g.ancestorRegions[1]!.text).toBe(`NEGATIVE COVENANTS\n${PREAMBLE}`);
    expect(DOC_A.slice(g.ancestorRegions[1]!.charStart, g.ancestorRegions[1]!.charEnd)).toBe(g.ancestorRegions[1]!.text);
    expect(g.inheritedEntityScope).toEqual(["BORROWER", "ANY_SUBSIDIARY"]);
    expect(g.inheritedEntityScopeBasis).toMatchObject({ sectionRef: "article-group:9", role: "GOVERNING_SCOPE", phrases: ["The Company", "Subsidiaries"] });
    expect(g.inheritedAction).toBe("INCUR_DEBT");
    expect(g.inheritedActionBasis).toMatchObject({ sectionRef: "9.2", role: "PARENT_SCOPE", evidence: "Create, incur, assume or suffer to exist any Indebtedness" });
    expect(g.governingProhibition).toMatchObject({ sectionRef: "article-group:9", role: "GOVERNING_SCOPE" });
    expect(g.notes).toEqual(["ancestor ARTICLE I has no own lead-in text carrying governing material (heading only or empty); not a region"]);
  });
  it("GS1 (parsed ARTICLE, B): the ARTICLE node's own preamble is the governing region; an unqualified 'Restricted Subsidiary' denotes exactly the two restricted classes the enum splits it into - no RESTRICTED_SUBSIDIARY tag exists or is invented", () => {
    const g = governing(idxB, "9.2(a)");
    expect(g.ancestorRegions.map((r) => [r.role, r.derivation, r.nodeType, r.sectionRef])).toEqual([["PARENT_SCOPE", "STRUCTURAL_ANCESTOR_LEAD_IN", "SECTION", "9.2"], ["GOVERNING_SCOPE", "STRUCTURAL_ANCESTOR_LEAD_IN", "ARTICLE", "IX"]]);
    expect(g.ancestorRegions[1]!.text).toContain("shall not permit any Restricted Subsidiary to");
    expect(g.inheritedEntityScope).toEqual(["BORROWER", "GUARANTOR_RS", "NON_GUARANTOR_RS"]);
    expect(Object.values(EntityClassTag)).not.toContain("RESTRICTED_SUBSIDIARY");
  });
  it("GS2 ancestor context never becomes child-owned IR: a rule the model emits for the parent §9.2 is quarantined, the governing regions never include the candidate's own node, and the prompt block says so", () => {
    const n = normalize(idxA, "9.2(a)", [rule({}), { ...rule({ localRef: "r0", sourceSectionRef: "9.2", excerpt: "Create, incur, assume or suffer to exist any Indebtedness, except:", posture: "PROHIBITION", ruleType: "PROHIBITION", capacityExpression: null }) }]);
    expect(n.rules.map((r) => r.sourceSectionRef)).toEqual(["9.2(a)"]);
    expect(n.contextOnlyEmissions.map((e) => [e.sourceSectionRef, e.decision.relation])).toEqual([["9.2", "PARENT"]]);
    const g = governing(idxA, "9.2(a)");
    expect(g.ancestorRegions.every((r) => r.structuralNodeId !== nodeAt(idxA, "9.2(a)").nodeId)).toBe(true);
    expect(renderGoverningScopeForPrompt(g)).toMatch(/NOT the provision being compiled and NOT candidate-owned source/);
  });
  it("GS3 sibling economics never enter governing scope: no sibling clause text, figure or threshold appears in any region", () => {
    for (const idx of [idxA, idxB]) for (const r of governing(idx, "9.2(a)").ancestorRegions) for (const forbidden of ["$5,000,000", "$1,000,000", "80%", "4.00", "2.00", "guarantee", "Prepay", "(a)", "(b)"]) expect(r.text).not.toContain(forbidden);
  });
});

describe("GS5 + §9-§12 entity-scope precedence: own actor language > governing source > model; measurement / condition-subject mentions never define applicability", () => {
  it("GS5: 'of the Company and its Subsidiaries for which financial statements are available' is MEASUREMENT_CONTEXT and 'the Company shall be in compliance' is a CONDITION_SUBJECT; neither binds, so the model's narrower [BORROWER] is outranked by the governing BORROWER + ANY_SUBSIDIARY and the discrepancy is recorded", () => {
    const roles = findEntityBindingSignals(S92A).map((s) => [s.phrase, s.role]);
    expect(roles).toEqual([["the Company", "CONDITION_SUBJECT"], ["the Company", "MEASUREMENT_CONTEXT"], ["Subsidiaries", "MEASUREMENT_CONTEXT"]]);
    expect(classifyEntityMentionRole("provided that the Borrower shall be in compliance with", "provided that the ".length, "Borrower".length)).toBe("CONDITION_SUBJECT");
    const r = normalize(idxA, "9.2(a)", [rule({})]).rules[0]!;
    expect(r.entityScope).toEqual(["BORROWER", "ANY_SUBSIDIARY"]);
    expect(r.entityScopeAudit).toMatchObject({ guardVersion: ENTITY_SCOPE_GUARD_VERSION, status: "SOURCE_SCOPE_DERIVED", precedence: "GOVERNING_SCOPE_SOURCE", safeToRely: true });
    expect(ENTITY_SCOPE_GUARD_VERSION).toBe("entity-scope-consistency-guard.v3");
    expect(r.entityScopeAudit!.modelDiscrepancy).toMatchObject({ modelScope: ["BORROWER"], governingScope: ["BORROWER", "ANY_SUBSIDIARY"], relation: "MODEL_NARROWER" });
    expect(r.sufficiency).toBe("COMPLETE");
  });
  it("§11 agreement: a model scope that matches the governing source is SOURCE_MATCH_CONFIRMED by the governing witness; an unrecognized model tag is outranked (preserved verbatim, not guessed) and does not limit the rule", () => {
    const agree = normalize(idxA, "9.2(a)", [rule({ entityScope: ["BORROWER", "ANY_SUBSIDIARY"] })]).rules[0]!;
    expect([agree.entityScopeAudit!.status, agree.entityScopeAudit!.witness.decidedBy, agree.entityScopeAudit!.modelDiscrepancy?.relation]).toEqual(["SOURCE_MATCH_CONFIRMED", "GOVERNING_SCOPE", "AGREES"]);
    const unknown = normalize(idxA, "9.2(a)", [rule({ entityScope: ["Company", "Restricted Subsidiary"] })]).rules[0]!;
    expect(unknown.entityScope).toEqual(["BORROWER", "ANY_SUBSIDIARY"]);
    expect(unknown.entityScopeAudit!.rawEmitted.entityScope).toEqual(["Company", "Restricted Subsidiary"]);
    expect(unknown.entityScopeAudit!.modelDiscrepancy?.relation).toBe("MODEL_UNRECOGNIZED");
    expect(unknown.sufficiency).toBe("COMPLETE");
    expect(unknown.sufficiencyReasons.some((x) => x.startsWith("ENTITY_SCOPE_UNRECOGNIZED_TAG"))).toBe(false);
  });
  it("§12 fail-closed: without an authenticated governing source the v2 behaviour stands - an unrecognized tag resets the scope and limits the rule; nothing is inferred from drafting patterns", () => {
    const r = normalize(idxA, "9.2(a)", [rule({ entityScope: ["Company", "Restricted Subsidiary"] })], { governingScope: null }).rules[0]!;
    expect([r.entityScope, r.entityScopeAudit!.status, r.sufficiency]).toEqual([[], "UNRECOGNIZED_TAG", "PARTIAL"]);
  });
  it("§11 own operative actor language outranks the governing chain: a child that binds 'any Subsidiary' itself keeps that narrower scope", () => {
    const r = normalize(idxA, "9.2(c)", [rule({ sourceSectionRef: "9.2(c)", action: "GUARANTEE_DEBT", excerpt: S92C, citation: "9.2(c)", entityScope: ["ANY_SUBSIDIARY"], capacityExpression: { kind: "MONEY", amount: 1_000_000, currency: "USD", citation: "9.2(c)" } })]).rules[0]!;
    expect(r.entityScope).toEqual(["ANY_SUBSIDIARY"]);
    expect([r.entityScopeAudit!.status, r.entityScopeAudit!.precedence]).toEqual(["SOURCE_MATCH_CONFIRMED", "OWN_OPERATIVE_LANGUAGE"]);
  });
});

describe("ACT1-ACT3 canonical action vs source act breadth", () => {
  it("ACT1 create/incur/assume/suffer-to-exist Indebtedness -> INCUR_DEBT with the full verb cluster as evidence; the ontology stays compact (no CREATE_DEBT / ASSUME_DEBT / SUFFER_DEBT_TO_EXIST)", () => {
    const c = classifySourceAction("Create, incur, assume or suffer to exist any Indebtedness, except:");
    expect(c).toMatchObject({ version: CANONICAL_ACTION_ONTOLOGY_VERSION, canonicalAction: "INCUR_DEBT", coverage: "COVERED", verbs: ["Create", "incur", "assume", "suffer to exist"], object: "Indebtedness" });
    expect(assessActionCompatibility("INCUR_DEBT", c).compatibility).toBe("COMPATIBLE");
    for (const bogus of ["CREATE_DEBT", "ASSUME_DEBT", "SUFFER_DEBT_TO_EXIST", "INCUR_LIEN", "MAKE_RESTRICTED_PAYMENT"]) expect(CONTRACT_ACTIONS as readonly string[]).not.toContain(bogus);
    const r = normalize(idxA, "9.2(a)", [rule({})]).rules[0]!;
    expect((r.inheritedAttributes ?? []).find((a) => a.attribute === "action")).toMatchObject({ sourceAuthority: "PARENT_SCOPE", sourceSectionRef: "9.2", evidence: "Create, incur, assume or suffer to exist any Indebtedness", canonicalValue: "INCUR_DEBT", compatibility: "COMPATIBLE" });
    expect(r.sufficiency).toBe("COMPLETE");
  });
  it("ACT2 guarantee Indebtedness is GUARANTEE_DEBT, never INCUR_DEBT: a rule proposing INCUR_DEBT over that act is INCOMPATIBLE and limited (never silently re-mapped)", () => {
    const c = classifySourceAction("guarantee any Indebtedness of any Subsidiary");
    expect([c.canonicalAction, c.coverage]).toEqual(["GUARANTEE_DEBT", "COVERED"]);
    expect(assessActionCompatibility("INCUR_DEBT", c).compatibility).toBe("INCOMPATIBLE");
    const r = normalize(idxA, "9.2(c)", [rule({ sourceSectionRef: "9.2(c)", excerpt: S92C, citation: "9.2(c)", entityScope: ["ANY_SUBSIDIARY"], capacityExpression: { kind: "MONEY", amount: 1_000_000, currency: "USD", citation: "9.2(c)" } })]).rules[0]!;
    expect(r.action).toBe("INCUR_DEBT"); // not re-mapped by guess
    expect((r.inheritedAttributes ?? []).find((a) => a.attribute === "action")).toMatchObject({ sourceAuthority: "OWN_SOURCE", canonicalValue: "GUARANTEE_DEBT", compatibility: "INCOMPATIBLE" });
    expect(r.sufficiency).toBe("PARTIAL");
    expect(r.sufficiencyReasons.some((x) => x.startsWith("ACTION_INCONSISTENT_WITH_SOURCE_ACT"))).toBe(true);
  });
  it("ACT3 prepay/redeem/repurchase Indebtedness is PREPAY_DEBT; granting Liens securing Indebtedness is CREATE_LIEN; a mixed cluster (incur or guarantee) is MIXED_CATEGORIES, never one canonical action", () => {
    expect(classifySourceAction("Prepay, redeem or repurchase any Indebtedness").canonicalAction).toBe("PREPAY_DEBT");
    expect(classifySourceAction("grant Liens securing Indebtedness").canonicalAction).toBe("CREATE_LIEN");
    expect(classifySourceAction("incur or guarantee any Indebtedness")).toMatchObject({ canonicalAction: null, coverage: "MIXED_CATEGORIES", categories: ["INCUR_DEBT", "GUARANTEE_DEBT"] });
    const r = normalize(idxA, "9.4", [rule({ sourceSectionRef: "9.4", excerpt: "Prepay, redeem or repurchase any Indebtedness", citation: "9.4", posture: "PROHIBITION", ruleType: "PROHIBITION", capacityExpression: null })]).rules[0]!;
    expect((r.inheritedAttributes ?? []).find((a) => a.attribute === "action")).toMatchObject({ canonicalValue: "PREPAY_DEBT", compatibility: "INCOMPATIBLE" });
    expect(r.sufficiency).toBe("PARTIAL");
  });
});

describe("REF1-REF5 source references are source identity", () => {
  const live = opText(idxA, "9.2(a)");
  it("REF1 whole section stays whole; REF2 explicit sub-clause stays a sub-clause; REF3 explicit lists are preserved; safe normalization is identity, not expansion", () => {
    expect(statedSectionReferencesInText(live).map((s) => [s.raw, s.normalized])).toEqual([["Section 9.3(b)", "9.3(b)"], ["Section 9.1", "9.1"]]);
    expect(statedSectionReferencesInText("subject to Sections 9.1(a), 9.1(c) and 9.1(d) hereof").map((s) => s.normalized)).toEqual(["9.1(a)", "9.1(c)", "9.1(d)"]);
    expect(statedSectionReferencesInText("as set forth in Sections 9.1(a) and (c)").map((s) => s.normalized)).toEqual(["9.1(a)", "9.1(c)"]);
    expect(statedSectionReferencesInText("subject to § 9.1").map((s) => s.normalized)).toEqual(["9.1"]);
    const eq = classifyEmittedReferences({ emitted: ["§9.1", "Section 9.3(b)"], operativeText: live });
    expect(eq.classifications.map((c) => c.classification)).toEqual(["SOURCE_EQUIVALENT_NORMALIZATION", "EXACT_SOURCE_REFERENCE"]);
    expect(eq.authoritativeRefs).toEqual(["§9.1", "Section 9.3(b)"]);
    const list = classifyEmittedReferences({ emitted: ["Section 9.1(a)", "Section 9.1(c)", "Section 9.1(d)"], operativeText: "subject to Sections 9.1(a), 9.1(c) and 9.1(d) hereof" });
    expect(list.classifications.every((c) => c.classification === "EXACT_SOURCE_REFERENCE")).toBe(true);
    expect(SOURCE_REFERENCE_FIDELITY_VERSION).toBe("source-reference-fidelity.v1");
  });
  it("REF4 model descendant expansion is excluded and restored to the drafted whole reference; broadening is restored to the drafted sub-clause; an invented reference is excluded and limits the rule", () => {
    const n = normalize(idxA, "9.2(a)", [rule({ conditions: [condition92a(["Section 9.1(a)", "Section 9.1(b)"])], dependsOn: [{ relationshipType: "REQUIRES", targetRef: "Section 9.3", description: "" }] })]);
    const r = n.rules[0]!;
    expect(r.conditions[0]!.referencesRuleTargets!.map((t) => [t.exactSourceTargetRef, t.normalizedTargetRef, t.resolutionStatus])).toEqual([["Section 9.1", "9.1", "SOURCE_REFERENCE_RESOLVED"]]);
    expect(r.conditions[0]!.targetCombination).toBe("ALL_SATISFIED");
    expect((r.sourceDependencies ?? []).map((d) => [d.exactSourceTargetRef, d.normalizedTargetRef])).toEqual([["Section 9.3(b)", "9.3(b)"]]); // broadened "Section 9.3" restored to the drafted sub-clause
    expect(r.sourceReferenceAudit!.entries.map((e) => [e.emitted, e.classification, e.authoritative, e.restoredTo])).toEqual([["Section 9.1(a)", "MODEL_NARROWED_REFERENCE", false, "Section 9.1"], ["Section 9.1(b)", "MODEL_NARROWED_REFERENCE", false, "Section 9.1"], ["Section 9.3", "MODEL_BROADENED_REFERENCE", false, "Section 9.3(b)"]]);
    expect(r.sufficiency).toBe("COMPLETE"); // a deterministic restoration is a diagnostic, not a limitation
    expect(n.diagnostics.map((d) => d.message.split(":")[0])).toEqual(expect.arrayContaining(["MODEL_EXPANDED_REFERENCE_EXCLUDED", "MODEL_BROADENED_REFERENCE_EXCLUDED"]));
    expect(JSON.stringify(r.conditions)).not.toMatch(/9\.1\([ab]\)/);
    const invented = normalize(idxA, "9.2(a)", [rule({ conditions: [condition92a(["Section 9.1", "Section 4.4"])] })]).rules[0]!;
    expect(invented.conditions[0]!.referencesRuleTargets!.map((t) => t.exactSourceTargetRef)).toEqual(["Section 9.1"]);
    expect(invented.sufficiency).toBe("PARTIAL");
    expect(invented.sufficiencyReasons.some((x) => x.startsWith("MODEL_INVENTED_REFERENCE_EXCLUDED"))).toBe(true);
  });
  it("REF4 range: 'clauses (a) through (b) of this Section 9.1' expands only through deterministic structural resolution; without an index the range is kept as stated, never guessed", () => {
    expect(statedSectionReferencesInText("in compliance with clauses (a) through (b) of this Section 9.1", { index: idxA, documentId: TEST_DOCUMENT_ID }).map((s) => s.normalized)).toEqual(["9.1(a)", "9.1(b)"]);
    expect(statedSectionReferencesInText("in compliance with clauses (a) through (b) of this Section 9.1").map((s) => s.normalized)).toEqual(["9.1(a)..(b)"]);
  });
  it("REF4 unverifiable: with no stated reference and no lineage the emitted target is kept but the rule is limited (never silently authoritative)", () => {
    const n = normalizeSubmission(submission([rule({ conditions: [condition92a(["Section 9.1"])] })]), testCompilerInput({ sourceSectionRef: "9.2(a)", operativeSourceText: "(a) other Indebtedness so long as the conditions are met;" }));
    expect(n.rules[0]!.sourceReferenceAudit!.entries.map((e) => e.classification)).toEqual(["SOURCE_REFERENCE_UNVERIFIABLE"]);
    expect(n.rules[0]!.sufficiency).toBe("PARTIAL");
  });
  it("REF5 package binding owns the one-to-many expansion: 'Section 9.1' binds to the two certified rules under it as a DERIVED artifact (the candidate keeps boundSemanticTargetIds []); an unrepresented part of the referenced section makes the target set TARGET_SET_REVIEW_REQUIRED", () => {
    const r = normalize(idxA, "9.2(a)", [rule({ conditions: [condition92a(["Section 9.1"])] })]).rules[0]!;
    expect(r.conditions[0]!.referencesRuleTargets![0]!.boundSemanticTargetIds).toEqual([]);
    const node = (nodeId: string, candidateRef: string, sectionRef: string, unit: IRRule): CovenantMapNode => ({ nodeId, kind: "RULE", candidateRef, documentId: TEST_DOCUMENT_ID, sectionRef, structuralNodeId: nodeAt(idxA, sectionRef).nodeId, structuralNodeKey: null, sourceOrder: { documentOrdinal: 0, charStart: 0, depth: 0 } as never, family: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", termName: null, sufficiency: "COMPLETE", sourceContentVersion: "sscv2:x", operativeSourceVersion: "scv1:x", identityStrength: "STRONG", verification: { status: "VERIFIED_NO_MATERIAL_GAP_FOUND", findingIds: [], materialFindings: 0 }, certification: { status: "CERTIFIED", artifactHash: "h", semanticSourceContractVersion: "sscv2:x", blockers: [] }, operative: null, unit });
    const stub = (ref: string): IRRule => ({ ...r, ruleId: `ir-rule:${ref}`, sourceSectionRef: ref, conditions: [], sourceDependencies: [], sourceReferenceAudit: undefined, inheritedAttributes: [] });
    const from = node("ir-rule:9.2(a)", "cand:9.2(a)", "9.2(a)", r);
    const a = node("ir-rule:9.1(a)", "cand:9.1", "9.1(a)", stub("9.1(a)")), b = node("ir-rule:9.1(b)", "cand:9.1", "9.1(b)", stub("9.1(b)"));
    const candidates = [{ candidateRef: "cand:9.2(a)", outcome: "MAPPED", structuralNodeIds: [nodeAt(idxA, "9.2(a)").nodeId] }, { candidateRef: "cand:9.1", outcome: "MAPPED", structuralNodeIds: [nodeAt(idxA, "9.1").nodeId] }];
    const bound = resolvePackageDependencies({ nodes: [from, a, b], candidates, index: idxA });
    expect(PACKAGE_DEPENDENCY_RESOLUTION_VERSION).toBe("p3-package-dependency-resolution.v2");
    const binding = bound.bindings.find((x) => x.kind === "CONDITION_TARGET")!;
    expect([binding.status, binding.bindingMode, binding.boundSemanticTargetIds, binding.executable]).toEqual(["BOUND", "ONE_TO_MANY_EXPANSION", ["ir-rule:9.1(a)", "ir-rule:9.1(b)"], true]);
    expect(from.unit).toBe(r); expect((from.unit as IRRule).conditions[0]!.referencesRuleTargets![0]!.boundSemanticTargetIds).toEqual([]); // the verified candidate is never mutated
    expect(bound.counts).toMatchObject({ total: 1, bound: 1, oneToMany: 1, reviewRequired: 0 });
    // the referenced section's clause (b) is owned by a target-set candidate that produced no units: the set is not safely determinable
    const review = resolvePackageDependencies({ nodes: [from, a], candidates: [...candidates, { candidateRef: "cand:9.1(b)", outcome: "COMPILE_FAILED", structuralNodeIds: [nodeAt(idxA, "9.1(b)").nodeId] }], index: idxA });
    const rb = review.bindings.find((x) => x.kind === "CONDITION_TARGET")!;
    expect([rb.status, rb.bindingMode, rb.boundSemanticTargetIds]).toEqual(["TARGET_SET_REVIEW_REQUIRED", null, []]);
    expect(rb.detail).toContain("cand:9.1(b) (COMPILE_FAILED)");
    expect(review.counts.reviewRequired).toBe(1);
  });
});

describe("SAN1-SAN3 target economics: quarantined prose vs contaminated semantics", () => {
  const dep = (description: string) => ({ relationshipType: "REQUIRES", targetRef: "Section 9.3(b)", description });
  it("SAN1/SAN2 an unsupported figure in dependency prose is removed from the unit, kept in diagnostics, and does not by itself make clean IR PARTIAL; changing the figure changes only the diagnostic, never the artifact", () => {
    const a = normalize(idxA, "9.2(a)", [rule({ dependsOn: [dep("Liens permitted under Section 9.3(b) - the 80% fair market value cap")] })]);
    const b = normalize(idxA, "9.2(a)", [rule({ dependsOn: [dep("Liens permitted under Section 9.3(b) - the 81% fair market value cap")] })]);
    expect(a.rules[0]!.sufficiency).toBe("COMPLETE");
    expect(JSON.stringify(a.rules)).not.toContain("80%");
    expect(a.rules[0]!.sourceDependencies![0]!.description).toBe("requires that the terms of Section 9.3(b) are satisfied; the semantics of Section 9.3(b) are owned by its own certified unit");
    expect(a.dependencyProse.map((d) => d.targetEconomicsExcluded)).toEqual([["80%"]]);
    expect(a.diagnostics.map((d) => d.message.split(":")[0])).toEqual(["TARGET_ECONOMICS_IN_DEPENDENCY_PROSE"]);
    expect(a.rules[0]!.sufficiencyReasons.filter((x) => /TARGET_ECONOMICS|80%/.test(x))).toEqual([]);
    expect(a.warnings.some((w) => w.kind === "DIAGNOSTIC" && w.message.startsWith("TARGET_ECONOMICS_IN_DEPENDENCY_PROSE"))).toBe(true);
    // identity policy: diagnostics are deliberately outside the semantic artifact
    expect(b.rules).toEqual(a.rules);
    expect(b.dependencyProse).not.toEqual(a.dependencyProse);
  });
  it("SAN3 a figure that SURVIVES in an authoritative field still fails closed: Layer 1 reports the PERCENT the source never states as an unsupported IR addition", async () => {
    const r = normalize(idxA, "9.2(a)", [rule({ capacityExpression: { kind: "MULTIPLY", citation: "9.2(a)", operands: [{ kind: "PERCENT", value: 0.8, citation: "9.2(a)" }, { kind: "METRIC_REFERENCE", metricName: "fair market value of such property" }] } })]).rules[0]!;
    const input = inputFor(idxA, "9.2(a)");
    const compilation = { status: "COMPLETED", failureReasons: [], errorDetail: null, rules: [r], definitions: [], sharedCapacities: [], irExtensionCandidates: [], unresolvedIssues: [], toolCallLog: [], rawModelOutput: null, provider: "scripted", model: "x", telemetry: null, cacheKey: "k", compiledAt: new Date().toISOString() } as unknown as SemanticCompilationResult;
    const v = await verifyCompiledCandidate({ compilerInput: input, compilationResult: compilation }, { skipSemanticReview: true });
    expect(v.findings.map((f) => [f.findingType, f.severity])).toEqual(expect.arrayContaining([["UNSUPPORTED_IR_ADDITION", "MATERIAL"]]));
    expect(v.status).not.toMatch(/^VERIFIED/);
  });
});

describe("L1-1..L1-3 Layer 1 understands typed dependency semantics", () => {
  const r = normalize(idxA, "9.2(a)", [rule({ conditions: [condition92a(["Section 9.1"])], dependsOn: [{ relationshipType: "REQUIRES", targetRef: "Section 9.3(b)", description: "" }, { relationshipType: "REQUIRES", targetRef: "Section 9.1", description: "" }] })]).rules[0]!;
  const src = buildSourceInventory("cand:9.2(a)", opText(idxA, "9.2(a)"), TEST_DOCUMENT_ID, "9.2(a)", null);
  it("L1-1/L1-2 source dependencies and cross-rule targets are inventoried as their own kinds; the source's own references are inventoried as SECTION_REFERENCE items (self-references excluded)", () => {
    const inv = buildIrInventory("cand:9.2(a)", [r], [], []);
    expect(inv.items.filter((i) => i.kind === "SOURCE_DEPENDENCY").map((i) => i.textValue)).toEqual(["REQUIRES:9.3(b)|SOURCE_REFERENCE_RESOLVED", "REQUIRES:9.1|SOURCE_REFERENCE_RESOLVED"]);
    expect(inv.items.filter((i) => i.kind === "CROSS_RULE_TARGET").map((i) => i.textValue)).toEqual(["9.1|ALL_SATISFIED|SOURCE_REFERENCE_RESOLVED"]);
    expect(inv.items.filter((i) => i.kind === "EVALUATION_BASIS").length).toBe(1);
    expect(inv.items.filter((i) => i.kind === "INHERITED_ATTRIBUTE").map((i) => i.textValue)).toEqual(["governingProhibition:@GOVERNING_SCOPE:article-group:9", "action:INCUR_DEBT@PARENT_SCOPE:9.2", "entityScope:BORROWER+ANY_SUBSIDIARY@GOVERNING_SCOPE:article-group:9"]);
    expect(SOURCE_INVENTORY_ALGORITHM_VERSION).toBe("phase-3c-source-inventory.v3");
    expect(src.items.filter((i) => i.kind === "SECTION_REFERENCE").map((i) => i.normalizedRef)).toEqual(["9.3(b)", "9.1"]);
    expect(buildSourceInventory("x", "under this Section 9.4 and clause (b) of this Section", TEST_DOCUMENT_ID, "9.4", null).items.filter((i) => i.kind === "SECTION_REFERENCE")).toEqual([]);
  });
  it("L1-3 a reference carried as BOTH a relationship edge and a gating role is ONE accounted-for item (no duplicate omission signal); a stated reference nothing represents is one MISSING_DEPENDENCY signal; an IR reference the source never states is one unsupported-reference signal", () => {
    const rec = reconcileInventories(src, buildIrInventory("cand:9.2(a)", [r], [], []));
    expect(rec.items.filter((i) => i.sourceItem?.kind === "SECTION_REFERENCE").map((i) => [i.classification, i.sourceItem!.normalizedRef, i.irItems.map((x) => x.kind).sort()])).toEqual([["ACCOUNTED_FOR", "9.3(b)", ["SOURCE_DEPENDENCY"]], ["ACCOUNTED_FOR", "9.1", ["CROSS_RULE_TARGET", "SOURCE_DEPENDENCY"]]]);
    expect(rec.materialUnresolvedCount).toBe(0);
    const missing = reconcileInventories(src, buildIrInventory("cand:9.2(a)", [{ ...r, conditions: [], sourceDependencies: [r.sourceDependencies![0]!] }], [], []));
    expect(missing.items.filter((i) => i.classification === "AMBIGUOUS" && /dependency|reference/.test(i.reason)).map((i) => i.reason.replace(/.*- /, ""))).toEqual(["possible missing dependency"]);
    const foreign = reconcileInventories(src, buildIrInventory("cand:9.2(a)", [{ ...r, sourceDependencies: [...r.sourceDependencies!, { ...r.sourceDependencies![0]!, exactSourceTargetRef: "Section 9.9", normalizedTargetRef: "9.9" }] }], [], []));
    expect(foreign.items.filter((i) => i.classification === "AMBIGUOUS" && /dependency|reference/.test(i.reason)).map((i) => i.reason.replace(/.*- /, ""))).toEqual(["possible unsupported reference"]);
  });
});

describe("§7 identity, §40 testing period, §44 prompts, §51-§52 versions and no agreement-specific production patch", () => {
  it("§7 the semantic source contract (sscv2) binds the governing regions: a changed applicability preamble changes the version; a change in an unrelated article does not", () => {
    const base = { operativeSourceVersion: "scv1:" + "a".repeat(64), operativeIdentityStrength: "STRONG" as const, candidateSectionRef: "9.2(a)", bundle: null, units: { rules: [], definitions: [], sharedCapacities: [] }, toolCallLog: [], operativeLineage: null, appliedEffectIds: [], asOfDate: "2026-10-05" };
    const v = (doc: string) => computeSemanticSourceContract({ ...base, governingScope: governing(indexOf(doc), "9.2(a)") });
    expect(SEMANTIC_SOURCE_CONTRACT_PREFIX).toBe("sscv2");
    expect(v(DOC_A).version).toBe(v(DOC_A_UNRELATED_CHANGED).version);
    expect(v(DOC_A).version).not.toBe(v(DOC_A_PREAMBLE_CHANGED).version);
    expect(governing(indexOf(DOC_A_PREAMBLE_CHANGED), "9.2(a)").inheritedEntityScope).toEqual(["BORROWER", "GUARANTOR_RS", "NON_GUARANTOR_RS"]);
  });
  it("§40 testingPeriod null is valid when the source states no period beyond the one embedded in deemedEffectiveAt; the normalizer never synthesizes duplicate prose", () => {
    const c = normalize(idxA, "9.2(a)", [rule({ conditions: [condition92a(["Section 9.1"])] })]).rules[0]!.conditions[0]!;
    expect(c.evaluationBasis).toMatchObject({ proForma: true, testingPeriod: null, deemedEffectiveAt: "the first day of each relevant period for testing such compliance" });
    expect(fs.readFileSync("lib/contract-model/ir/types.ts", "utf8")).toMatch(/INVARIANT: null is a valid value whenever the source gives no more\n\s*\* precise period description/);
  });
  it("§44 the prompts explain generic contracts only - no instance answer, no agreement, section or figure of the live case", () => {
    const compiler = buildSystemPrompt({ irSchemaVersion: "x", toolPolicyVersion: "y" }) + buildIrPrimitivesBlock();
    const verifier = buildVerifierSystemPrompt({ verifierAlgorithmVersion: "a", verifierPromptVersion: "b", projectionVersion: "c" });
    for (const p of [compiler, verifier]) for (const re of [/CONMED/i, /7\.2\(c\)/, /7\.3\(g\)/, /Section 7\.1\b/, /Parent Borrower/, /80%/, /\b3\.75\b/, /\b5\.50\b/, /\b2\.75\b/]) expect(p).not.toMatch(re);
    expect(verifier).toMatch(/CANONICAL ACTION vs SOURCE ACT/); expect(verifier).toMatch(/GOVERNING-SCOPE INHERITANCE/); expect(verifier).toMatch(/EXACT SOURCE-REFERENCE FIDELITY/);
    expect(verifier).not.toMatch(/INCUR_DEBT is correct|is correct here|must remain whole here/);
    expect(compiler).toMatch(/SOURCE REFERENCES ARE SOURCE IDENTITY/); expect(compiler).toMatch(/GOVERNING SEMANTIC CONTEXT/); expect(compiler).toMatch(/ENTITY SCOPE VOCABULARY/);
    expect([SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION, SEMANTIC_VERIFIER_ALGORITHM_VERSION, SEMANTIC_VERIFIER_PROMPT_VERSION]).toEqual(["semantic-accountability-compiler.v6", "semantic-accountability-compiler-prompt.v7", "phase-3c-semantic-verifier.v4", "phase-3c-semantic-verifier-prompt.v3"]);
  });
  const MODULES = ["lib/contract-model/compiler/semantic/governing-scope.ts", "lib/contract-model/compiler/semantic/action-ontology.ts", "lib/contract-model/compiler/semantic/source-reference-fidelity.ts", "lib/contract-model/compiler/semantic/entity-scope-guard.ts", "lib/contract-model/compiler/semantic/normalize.ts", "lib/contract-model/compiler/semantic/compile.ts", "lib/contract-model/compiler/semantic/caller.ts", "lib/contract-model/compiler/semantic/prompt.ts", "lib/contract-model/compiler/semantic/bounded-composition.ts", "lib/contract-model/compiler/semantic-verification/projection.ts", "lib/contract-model/compiler/semantic-verification/prompt.ts", "lib/contract-model/compiler/semantic-verification/reviewer.ts", "lib/contract-model/compiler/semantic-verification/ir-inventory.ts", "lib/contract-model/compiler/semantic-verification/source-inventory.ts", "lib/contract-model/compiler/semantic-verification/reconciliation.ts", "lib/contract-model/compiler/semantic-verification/findings.ts", "lib/contract-model/compiler/semantic-verification/verify.ts", "lib/contract-model/covenant-map/package-dependencies.ts", "lib/contract-model/phase3-certification/semantic-source-contract.ts", "lib/contract-model/phase3-certification/certify.ts", "lib/contract-model/phase3-certification/package-certification.ts", "lib/contract-model/ir/types.ts"];
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  it.each(MODULES)("%s carries no CONMED / §7.2(c) / §7.3(g) / Section 7.1 / Parent Borrower / 80% / 3.75 / 5.50 / 2.75 special case in code", (file) => {
    const code = stripComments(fs.readFileSync(file, "utf8"));
    for (const re of [/CONMED/i, /7\.2\(c\)/, /7\.3\(g\)/, /Section 7\.1\b/, /Parent Borrower/, /80%/, /\b3\.75\b/, /\b5\.50\b/, /\b2\.75\b/]) expect(code).not.toMatch(re);
  });
});
