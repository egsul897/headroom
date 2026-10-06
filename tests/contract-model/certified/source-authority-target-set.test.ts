/**
 * SOURCE AUTHORITY + QUALIFIED TARGET-SET + SHARD PARITY CLOSURE - the general regression matrix (mission §10-§12,
 * §16-§18, §23-§25, §31-§34, §36-§37, §41-§43). Synthetic agreements only (never real package text); the real
 * structural parser builds the indexes; the real planner / executor / stitcher run the sharded path; zero model calls.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { buildTestIndex } from "../context-retrieval-test-utils";
import { readTargetSelector, scanSourceReferences, SOURCE_REFERENCE_SCAN_VERSION } from "../../../lib/contract-model/compiler/source-reference-scan";
import { classifyEmittedReferences, SOURCE_REFERENCE_FIDELITY_VERSION, statedSectionReferencesInText } from "../../../lib/contract-model/compiler/semantic/source-reference-fidelity";
import { normalizeInventorySubmission } from "../../../lib/contract-model/compiler/semantic-accountability/inventory";
import { ENSEMBLE_SUPPORTED_ALGORITHM_VERSIONS } from "../../../lib/contract-model/compiler/semantic-accountability/ensemble";
import { SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION, type FrozenSemanticInventory, type SemanticInventoryItem, type SourceContextResult } from "../../../lib/contract-model/compiler/semantic-accountability/types";
import type { WireInventoryItem } from "../../../lib/contract-model/compiler/semantic-accountability/wire-schema";
import { diagnosticRecord, normalizeSubmission } from "../../../lib/contract-model/compiler/semantic/normalize";
import { SubmitCompilationSchema } from "../../../lib/contract-model/compiler/semantic/wire-schema";
import { compileCovenantToIR } from "../../../lib/contract-model/compiler/semantic/compile";
import { InMemorySemanticCompilationCache } from "../../../lib/contract-model/compiler/semantic/cache";
import { certifiedConfig } from "../../../lib/contract-model/compiler/certified-config";
import type { SemanticCaller } from "../../../lib/contract-model/compiler/semantic/caller";
import type { StageCaller } from "../../../lib/contract-model/compiler/llm-caller";
import { SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION, type SemanticCompilationResult, type SemanticCompilerInput } from "../../../lib/contract-model/compiler/semantic/types";
import type { ShardBudget } from "../../../lib/contract-model/compiler/semantic/shard-types";
import { describeSourceDependency } from "../../../lib/contract-model/compiler/semantic/source-reference";
import { buildSemanticVerificationProjection, SEMANTIC_VERIFICATION_PROJECTION_VERSION } from "../../../lib/contract-model/compiler/semantic-verification/projection";
import { buildVerifierUserContent } from "../../../lib/contract-model/compiler/semantic-verification/reviewer";
import { buildVerifierSystemPrompt } from "../../../lib/contract-model/compiler/semantic-verification/prompt";
import { SEMANTIC_VERIFIER_PROMPT_VERSION } from "../../../lib/contract-model/compiler/semantic-verification/types";
import { PACKAGE_DEPENDENCY_RESOLUTION_VERSION, resolvePackageDependencies } from "../../../lib/contract-model/covenant-map/package-dependencies";
import { PHASE3_PACKAGE_CERTIFICATION_VERSION } from "../../../lib/contract-model/phase3-certification/types";
import type { CovenantMapNode } from "../../../lib/contract-model/covenant-map/types";
import type { IRRule } from "../../../lib/contract-model/ir/types";
import { emptyContextBundle, testCompilerInput, TEST_COMPANY_ID, TEST_DOCUMENT_ID, TEST_INSTRUMENT_KEY } from "../semantic-compiler/test-helpers";

// ---- synthetic agreements -----------------------------------------------------------------------------------------------
const HEAD = ["CREDIT AGREEMENT dated as of March 1, 2026, among Example Industries Inc., as Borrower, the Lenders party hereto and Agent Bank, as Administrative Agent.", "", "ARTICLE I DEFINITIONS", "", "SECTION 1.01 Defined Terms . As used in this Agreement, the following terms have the meanings specified below:", "", "\"Investment\" means any advance, loan or capital contribution to any Person.", ""];
const S91 = ["SECTION 9.1 Financial Covenants . The Borrower shall not:", "", "(a) permit the Leverage Ratio as of the last day of any fiscal quarter to exceed 4.00 to 1.00;", "", "(b) permit the Interest Coverage Ratio for any period of four consecutive fiscal quarters to be less than 2.00 to 1.00;", "", "(c) fail to deliver written notice to the Administrative Agent within five Business Days after any Default; or", "", "(d) make any Asset Sale with a fair market value in excess of $10,000,000 in any fiscal year.", ""];
/** SA-1 agreement: 6.04 states NO section reference at all; 6.05 states exactly one; 6.06 states a sub-clause. */
const DOC_SA1 = [...HEAD, "ARTICLE VI NEGATIVE COVENANTS", "", "The Borrower shall not, and shall not permit any Subsidiary to, directly or indirectly:", "",
  "SECTION 6.04 Investments . Make any Investment, except that the Borrower may make Investments under this clause in an aggregate amount not to exceed $500,000.", "",
  "SECTION 6.05 Loans . Make any loan, except that the Borrower may make loans subject to Section 9.9 in an aggregate amount not to exceed $750,000.", "",
  "SECTION 6.06 Guarantees . Guarantee any Indebtedness, except Guarantees permitted under Section 9.9(a) in an aggregate amount not to exceed $250,000.", "",
  "SECTION 9.9 Permitted Transactions . The following transactions are permitted:", "", "(a) transactions in the ordinary course of business; and", "", "(b) transactions approved by the Required Lenders.", ""].join("\n");
/** SA-2 agreement: §9.1 mixes ratio tests with a notice obligation and an asset-sale covenant; §9.2's children reference it four ways. */
const DOC_SA2 = [...HEAD, "ARTICLE IX NEGATIVE COVENANTS", "", "The Borrower shall not, and shall not permit any Subsidiary to, directly or indirectly:", "", ...S91,
  "SECTION 9.2 Limitation on Indebtedness . Create, incur, assume or suffer to exist any Indebtedness, except:", "",
  "(a) Indebtedness incurred so long as the Borrower shall be in compliance, on a pro forma basis, with the financial covenants contained in Section 9.1;", "",
  "(b) Indebtedness incurred subject to Section 9.1 in an aggregate principal amount not to exceed $5,000,000;", "",
  "(c) Indebtedness incurred subject to Sections 9.1(a) and 9.1(c) in an aggregate principal amount not to exceed $2,000,000;", "",
  "(d) Indebtedness incurred so long as the Borrower shall be in compliance with the covenants contained in Section 9.1; and", "",
  "(e) Indebtedness secured by Liens permitted by Section 9.3(b); provided that the Borrower shall be in compliance with the financial covenants contained in Section 9.1 and with clauses (a) through (b) of this Section 9.1, and subject to clause (c) of this Section.", "",
  "SECTION 9.3 Liens . Create, incur, assume or suffer to exist any Lien upon any property, except:", "", "(a) Liens for taxes not yet due; and", "", "(b) Liens securing Indebtedness in a principal amount not exceeding 80% of the fair market value of such property.", ""].join("\n");

const indexOf = (text: string, documentId = TEST_DOCUMENT_ID) => buildTestIndex([{ documentId, label: "synthetic", text }]);
const idx1 = indexOf(DOC_SA1), idx2 = indexOf(DOC_SA2);
const nodeAt = (idx: ReturnType<typeof indexOf>, ref: string) => { const n = idx.allNodes().find((x) => x.sectionRef === ref); if (!n) throw new Error(`no node ${ref}`); return n; };
const opText = (idx: ReturnType<typeof indexOf>, ref: string) => idx.getNodeText(nodeAt(idx, ref).nodeId, "DESCENDANTS").trim();

/** An OPERATIVE source context over one section of an index (what Pass A inventories and Pass B composes against). */
function contextFor(idx: ReturnType<typeof indexOf>, ref: string, documentId = TEST_DOCUMENT_ID): { sourceContext: SourceContextResult; text: string; charStart: number } {
  const node = nodeAt(idx, ref);
  const text = idx.getNodeText(node.nodeId, "DESCENDANTS");
  const sourceContext: SourceContextResult = { state: "COMPLETE_LOCAL_SOURCE", regions: [{ regionId: "operative", kind: "OPERATIVE", documentId, sourceNodeId: node.nodeId, sectionRef: ref, charStart: node.charStart, charEnd: node.charStart + text.length, text, expandedFor: null, truncatedAtBudget: false, unitExtension: null }], unresolvedReferences: [], reasons: [], totalChars: text.length, budgetChars: 24_000 };
  return { sourceContext, text, charStart: node.charStart };
}
const wireItem = (localRef: string, excerpt: string, over: Partial<WireInventoryItem> = {}): WireInventoryItem => ({ localRef, semanticRole: "PERMISSION", proposition: `permission ${localRef}`, excerpt, regionId: "operative", quantitativeValues: [], referencedTerms: [], referencedSections: [], parentRef: null, relatedRefs: [], materiality: "MATERIAL", ambiguity: "NONE", ambiguityReason: null, operative: "OPERATIVE", ...over });
const frozenOf = (candidateRef: string, items: SemanticInventoryItem[], over: Partial<FrozenSemanticInventory> = {}): FrozenSemanticInventory => ({ candidateRef, items, uninventoriedValues: [], unaccountedSource: [], sourceCoverage: { regionsConsidered: ["operative"], countsByDisposition: {}, charsByDisposition: {}, accountedCharFraction: 1, externallyAccountedRegions: [] }, gapReinventory: null, inventoryStatus: "INVENTORY_OK", inventoryStatusReason: "synthetic", rejectedUnverifiableItems: 0, rejectedDuplicateItems: 0, sourceContextState: "DEPENDENCY_EXPANDED_SOURCE", frozenContentHash: `frozen:${candidateRef}:${items.length}`, frozenAt: "2026-01-01T00:00:00.000Z", algorithmVersion: SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION, promptVersion: "semantic-inventory-prompt.v5", provider: "synthetic", model: "synthetic", telemetryCostUsd: null, ...over });

const rule = (over: Record<string, unknown>) => ({ localRef: "r1", sourceSectionRef: "6.04", covenantFamily: "INVESTMENTS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: "MAKE_INVESTMENT", entityScope: ["BORROWER"], entityScopeExcluded: [], capacityExpression: { kind: "UNLIMITED_CAPACITY", citation: "6.04" }, conditions: [], exceptions: [], dependsOn: [], sufficiency: "COMPLETE", sufficiencyReasons: [], citation: "6.04", excerpt: null, ...over });
const submission = (rules: Record<string, unknown>[]) => SubmitCompilationSchema.parse({ rules, definitions: [], sharedCapacities: [], irExtensionCandidates: [], overallNotes: [] });
const condition = (targets: string[], excerpt: string) => ({ conditionType: "OTHER_RULE_SATISFIED", expression: null, referencesRuleTargets: targets.map((targetRef) => ({ targetRef })), targetCombination: "ALL_SATISFIED", referencesDefinitionId: null, description: "compliance with the referenced provision", citation: "9.2", excerpt });
const normalize = (idx: ReturnType<typeof indexOf>, ref: string, rules: Record<string, unknown>[], extra: Record<string, unknown> = {}) =>
  normalizeSubmission(submission(rules), testCompilerInput({ candidateRef: `cand:${ref}`, sourceSectionRef: ref, operativeSourceText: opText(idx, ref), toolAccess: { structuralIndex: idx, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle() }, ...extra }));

// =========================================================================================================================
describe("SA-1 §10-§13 a Pass A referencedSections claim never becomes source authority", () => {
  const inventory = (ref: string, items: WireInventoryItem[]) => { const c = contextFor(idx1, ref); return { ...normalizeInventorySubmission({ candidateRef: `cand:${ref}`, sourceContext: c.sourceContext, structuralIndex: idx1 }, items), ctx: c }; };

  it("§10 ATTACK: the source states no reference; Pass A lies 'Section 9.9' -> authoritative referencedSections stay [], the lie is a MODEL_INVENTED_REFERENCE claim; Pass B's REQUIRES Section 9.9 is excluded and the unit is limited", () => {
    const inv = inventory("6.04", [wireItem("a", "the Borrower may make Investments under this clause", { referencedSections: ["Section 9.9"] })]);
    expect(inv.items).toHaveLength(1);
    const it0 = inv.items[0]!;
    expect(it0.referencedSections).toEqual([]);
    expect(it0.declaredReferencedSections).toEqual(["Section 9.9"]);
    expect(it0.referenceAudit).toMatchObject({ version: SOURCE_REFERENCE_SCAN_VERSION, claims: [{ declared: "Section 9.9", normalized: "9.9", classification: "MODEL_INVENTED_REFERENCE", sourceRef: null }], omittedBySource: [] });
    expect(it0.semanticFunctions?.dependency ?? []).not.toContain("REFERENCE"); // §13: the REFERENCE function never comes from a model claim
    // Pass B carries the lie forward as a dependency with lineage to the lying item - even a forged frozen inventory that still
    // lists 9.9 as a reference cannot make it authoritative (the lineage fallback is gone: text or nothing)
    const forged = frozenOf("cand:6.04", [{ ...it0, referencedSections: ["9.9"] }]);
    const n = normalize(idx1, "6.04", [rule({ dependsOn: [{ relationshipType: "REQUIRES", targetRef: "Section 9.9", description: "requires compliance with Section 9.9", inventoryItemIds: [it0.inventoryItemId] }] })], { frozenInventory: forged });
    const r = n.rules[0]!;
    expect(r.sourceDependencies ?? []).toEqual([]);
    expect(r.sourceReferenceAudit?.entries).toEqual([expect.objectContaining({ emitted: "Section 9.9", classification: "MODEL_INVENTED_REFERENCE", authoritative: false, restoredTo: null })]);
    expect(r.sufficiency).not.toBe("COMPLETE"); // certification requires COMPLETE unit sufficiency - the candidate cannot certify on that dependency
    expect(r.sufficiencyReasons.some((x) => x.startsWith("MODEL_INVENTED_REFERENCE_EXCLUDED"))).toBe(true);
    expect(n.diagnostics.map((d) => d.message.split(":")[0])).not.toContain("MODEL_EXPANDED_REFERENCE_EXCLUDED");
  });

  it("§11 OMISSION: the source says 'subject to Section 9.9'; Pass A returns [] -> the deterministic scanner recovers 9.9 as authoritative; the omission is recorded", () => {
    const inv = inventory("6.05", [wireItem("a", "the Borrower may make loans subject to Section 9.9 in an aggregate amount not to exceed $750,000")]);
    const it0 = inv.items[0]!;
    expect(it0.referencedSections).toEqual(["9.9"]);
    expect(it0.declaredReferencedSections).toEqual([]);
    expect(it0.referenceAudit).toMatchObject({ claims: [], omittedBySource: ["9.9"] });
    expect(it0.semanticFunctions?.dependency ?? []).toContain("REFERENCE"); // §13: the REFERENCE function comes from the source-grounded reference
  });

  it("§12 WRONG NARROWING: the source says 'subject to Section 9.9'; Pass A says 'Section 9.9(a)' -> authoritative 9.9 with a MODEL_NARROWED_REFERENCE claim", () => {
    const inv = inventory("6.05", [wireItem("a", "the Borrower may make loans subject to Section 9.9", { referencedSections: ["Section 9.9(a)"] })]);
    const it0 = inv.items[0]!;
    expect(it0.referencedSections).toEqual(["9.9"]);
    expect(it0.referenceAudit?.claims).toEqual([{ declared: "Section 9.9(a)", normalized: "9.9(a)", classification: "MODEL_NARROWED_REFERENCE", sourceRef: "Section 9.9" }]);
    // and the mirror image: the source says 9.9(a), the model says 9.9 -> authoritative 9.9(a), MODEL_BROADENED_REFERENCE
    const broad = inventory("6.06", [wireItem("a", "Guarantees permitted under Section 9.9(a)", { referencedSections: ["Section 9.9"] })]).items[0]!;
    expect(broad.referencedSections).toEqual(["9.9(a)"]);
    expect(broad.referenceAudit?.claims).toEqual([{ declared: "Section 9.9", normalized: "9.9", classification: "MODEL_BROADENED_REFERENCE", sourceRef: "Section 9.9(a)" }]);
    // a correct claim is CORROBORATED and changes nothing
    const ok = inventory("6.05", [wireItem("a", "subject to Section 9.9", { referencedSections: ["Section 9.9"] })]).items[0]!;
    expect([ok.referencedSections, ok.referenceAudit?.claims[0]?.classification]).toEqual([["9.9"], "CORROBORATED"]);
  });

  it("a reference that straddles two item spans is attributed to both (the whole region is scanned once; items claim by overlap, never by model text)", () => {
    const inv = inventory("6.05", [wireItem("a", "the Borrower may make loans subject to Section"), wireItem("b", "9.9 in an aggregate amount not to exceed $750,000", { semanticRole: "THRESHOLD" })]);
    expect(inv.items.map((i) => i.referencedSections)).toEqual([["9.9"], ["9.9"]]);
  });

  it("§13 identity: the inventory algorithm is v6 (source-grounded references are part of the frozen semantics); the ensemble still replays frozen v5 passes", () => {
    expect(SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION).toBe("semantic-accountability.v6");
    expect(ENSEMBLE_SUPPORTED_ALGORITHM_VERSIONS).toEqual(["semantic-accountability.v6", "semantic-accountability.v5"]);
  });
});

// =========================================================================================================================
describe("SA-2 §16-§18 the target selector is read from the source text around the reference, never from model prose", () => {
  it("§16 'in compliance with the financial covenants contained in Section 9.1' -> target 9.1, QUALIFIED_RULE_SET, qualifier 'financial covenants contained in'", () => {
    const text = "so long as the Borrower shall be in compliance, on a pro forma basis, with the financial covenants contained in Section 9.1;";
    const [ref] = scanSourceReferences(text);
    expect(ref).toMatchObject({ raw: "Section 9.1", normalized: "9.1", selector: { kind: "QUALIFIED_RULE_SET", qualifierText: "financial covenants contained in", sourceText: "financial covenants contained in Section 9.1" } });
    expect(text.slice(ref!.charStart, ref!.charEnd)).toBe("Section 9.1");
    // the selector reader is pure: same text, same answer; a model explanation appended elsewhere never reaches it
    expect(readTargetSelector(text, ref!.charStart, ref!.raw, null)).toEqual(ref!.selector);
    for (const v of ["set forth in", "described in", "referred to in", "required under", "specified in"]) expect(scanSourceReferences(`the ratio tests ${v} Section 9.1`)[0]!.selector).toMatchObject({ kind: "QUALIFIED_RULE_SET", qualifierText: `ratio tests ${v}` });
  });
  it("§17 'subject to Section 9.1' -> WHOLE_PROVISION with no invented qualification; a qualifier beyond the clause boundary does not attach", () => {
    expect(scanSourceReferences("Indebtedness incurred subject to Section 9.1 in an aggregate principal amount")[0]!.selector).toEqual({ sourceText: "Section 9.1", kind: "WHOLE_PROVISION", qualifierText: null });
    expect(scanSourceReferences("the financial covenants contained in this Agreement; provided that the Borrower complies with Section 9.1")[0]!.selector).toEqual({ sourceText: "Section 9.1", kind: "WHOLE_PROVISION", qualifierText: null });
  });
  it("§18 'Sections 9.1(a), 9.1(c) and 9.1(d)' -> an explicit target set of three EXPLICIT_SUBCLAUSE_SET members, never a qualified whole section", () => {
    const refs = scanSourceReferences("subject to the financial covenants set forth in Sections 9.1(a), 9.1(c) and 9.1(d) hereof");
    expect(refs.map((r) => [r.normalized, r.selector.kind, r.selector.qualifierText])).toEqual([["9.1(a)", "EXPLICIT_SUBCLAUSE_SET", null], ["9.1(c)", "EXPLICIT_SUBCLAUSE_SET", null], ["9.1(d)", "EXPLICIT_SUBCLAUSE_SET", null]]);
    // a structurally expanded range is explicit too; without an index the range is UNRESOLVED (never guessed)
    const ranged = scanSourceReferences("clauses (a) through (b) of this Section 9.1", { baseSectionRef: "9.2(e)", index: idx2, documentId: TEST_DOCUMENT_ID });
    expect(ranged.map((r) => [r.normalized, r.selector.kind, r.expandedFromRange])).toEqual([["9.1(a)", "EXPLICIT_SUBCLAUSE_SET", true], ["9.1(b)", "EXPLICIT_SUBCLAUSE_SET", true]]);
    expect(scanSourceReferences("clauses (a) through (b) of this Section 9.1").map((r) => r.selector.kind)).toEqual(["UNRESOLVED_SELECTOR"]);
  });
  it("the selector rides on the normalized IR target (condition targets and source dependencies) and on the fidelity outcome; the candidate's own unit never pre-selects target rules", () => {
    const n = normalize(idx2, "9.2(a)", [rule({ sourceSectionRef: "9.2(a)", covenantFamily: "INDEBTEDNESS", action: "INCUR_DEBT", conditions: [condition(["Section 9.1"], "with the financial covenants contained in Section 9.1")], dependsOn: [{ relationshipType: "REQUIRES", targetRef: "Section 9.1", description: "" }] })]);
    const r = n.rules[0]!;
    const target = r.conditions[0]!.referencesRuleTargets![0]!;
    expect(target).toMatchObject({ exactSourceTargetRef: "Section 9.1", normalizedTargetRef: "9.1", boundSemanticTargetIds: [], selector: { kind: "QUALIFIED_RULE_SET", qualifierText: "financial covenants contained in" } });
    expect(r.sourceDependencies![0]!.selector).toEqual(target.selector);
    const outcome = classifyEmittedReferences({ emitted: ["Section 9.1"], operativeText: opText(idx2, "9.2(a)") });
    expect(outcome.selectors["9.1"]).toMatchObject({ kind: "QUALIFIED_RULE_SET" });
    expect(SOURCE_REFERENCE_FIDELITY_VERSION).toBe("source-reference-fidelity.v2");
  });
});

// =========================================================================================================================
describe("§41 source authority conservation: every authoritative reference has a literal span, a resolved relative reference or an expanded explicit range - no fourth path", () => {
  const text = opText(idx2, "9.2(e)");
  it("the authoritative set equals the drafted set; each member is traceable to the source text; a lineage-only claim or a model-only reference is never authoritative", () => {
    const scanned = scanSourceReferences(text, { baseSectionRef: "9.2(e)", index: idx2, documentId: TEST_DOCUMENT_ID });
    expect(scanned.map((r) => r.normalized)).toEqual(["9.3(b)", "9.1", "9.1(a)", "9.1(b)", "9.2(c)"]);
    const forgedLineage = frozenOf("cand:9.2(e)", [{ inventoryItemId: "inv-item:forged", sourceSpan: { regionId: "operative", documentId: TEST_DOCUMENT_ID, sourceNodeId: null, sectionRef: null, charStart: 0, charEnd: 20, sourceCitation: "§9.2(e)", excerpt: text.slice(0, 20) }, semanticRole: "CONDITION", proposition: "forged", quantitativeValues: [], referencedTerms: [], referencedSections: ["9.7"], parentItemId: null, relatedItemIds: [], materiality: "MATERIAL", ambiguity: "NONE", ambiguityReason: null, operative: "OPERATIVE", detectionMethod: "MODEL" }]);
    const n = normalize(idx2, "9.2(e)", [rule({ sourceSectionRef: "9.2(e)", covenantFamily: "INDEBTEDNESS", action: "INCUR_DEBT",
      conditions: [condition(["Section 9.1", "Section 9.3(b)", "Section 9.1(a)", "Section 9.1(b)", "Section 9.2(c)", "Section 9.7"], "provided that the Borrower shall be in compliance")],
      dependsOn: [{ relationshipType: "REQUIRES", targetRef: "Section 9.7", description: "", inventoryItemIds: ["inv-item:forged"] }] })], { frozenInventory: forgedLineage });
    const r = n.rules[0]!;
    const authoritative = [...r.conditions[0]!.referencesRuleTargets!.map((t) => t.normalizedTargetRef), ...(r.sourceDependencies ?? []).map((d) => d.normalizedTargetRef)];
    expect(authoritative).toEqual(["9.1", "9.3(b)", "9.1(a)", "9.1(b)", "9.2(c)"]);
    for (const a of authoritative) {
      const s = scanned.find((x) => x.normalized === a)!;
      expect(s, a ?? "null").toBeDefined();
      const span = text.slice(s.charStart, s.charEnd);
      // (1) literal authenticated span: the raw reference sits in the source text at the recorded offsets
      const literal = /^(?:Sections?|§)\s*\d/.test(span) && span.replace(/\s+/g, "") === s.raw.replace(/\s+/g, "");
      // (2) deterministically resolved relative reference / (3) deterministically expanded explicit range: the span is the relative clause itself
      const relative = /^(?:clauses?|paragraphs?|subsections?)\s+\(/i.test(span);
      expect(literal || relative, `${a}: ${span}`).toBe(true);
      if (a === "9.1(a)" || a === "9.1(b)") expect([relative, s.expandedFromRange]).toEqual([true, true]);
      if (a === "9.2(c)") expect([relative, s.expandedFromRange]).toEqual([true, false]);
    }
    // the fourth path is closed: 9.7 exists only in a (forged) inventory lineage and the model's output
    expect(authoritative).not.toContain("9.7");
    expect(r.sourceReferenceAudit!.entries.filter((e) => e.emitted === "Section 9.7").map((e) => [e.classification, e.authoritative])).toEqual([["MODEL_INVENTED_REFERENCE", false], ["MODEL_INVENTED_REFERENCE", false]]);
    expect(statedSectionReferencesInText(text, { baseSectionRef: "9.2(e)", index: idx2, documentId: TEST_DOCUMENT_ID }).map((s) => s.normalized)).toEqual(scanned.map((s) => s.normalized));
  });
});

// =========================================================================================================================
describe("SA-2 §19-§25 package one-to-many safety: a qualified whole-section reference never blindly binds every subtree unit", () => {
  const unitFor = (ref: string, targets: string[]) => normalize(idx2, ref, [rule({ sourceSectionRef: ref, covenantFamily: "INDEBTEDNESS", action: "INCUR_DEBT", conditions: [condition(targets, opText(idx2, ref).slice(0, 60))] })]).rules[0]!;
  const node = (nodeId: string, candidateRef: string, sectionRef: string, unit: IRRule, over: Partial<CovenantMapNode> = {}): CovenantMapNode => ({ nodeId, kind: "RULE", candidateRef, documentId: TEST_DOCUMENT_ID, sectionRef, structuralNodeId: nodeAt(idx2, sectionRef).nodeId, structuralNodeKey: null, sourceOrder: { documentOrdinal: 0, charStart: 0, depth: 0 } as never, family: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", termName: null, sufficiency: "COMPLETE", sourceContentVersion: "sscv2:x", operativeSourceVersion: "scv1:x", identityStrength: "STRONG", verification: { status: "VERIFIED_NO_MATERIAL_GAP_FOUND", findingIds: [], materialFindings: 0 }, certification: { status: "CERTIFIED", artifactHash: "h", semanticSourceContractVersion: "sscv2:x", blockers: [] }, operative: null, unit, ...over } as CovenantMapNode);
  const stub = (base: IRRule, ref: string): IRRule => ({ ...base, ruleId: `ir-rule:${ref}`, sourceSectionRef: ref, conditions: [], sourceDependencies: [], sourceReferenceAudit: undefined, inheritedAttributes: [] });
  const base = unitFor("9.2(b)", ["Section 9.1"]);
  /** §23: the referenced §9.1 compiles into two ratio tests, one notice obligation and one asset-sale covenant - independently classified. */
  const targets = [
    node("ir-rule:9.1(a)", "cand:9.1", "9.1(a)", stub(base, "9.1(a)"), { family: "FINANCIAL_COVENANTS", ruleType: "RATIO_TEST", posture: "PROHIBITION" } as Partial<CovenantMapNode>),
    node("ir-rule:9.1(b)", "cand:9.1", "9.1(b)", stub(base, "9.1(b)"), { family: "FINANCIAL_COVENANTS", ruleType: "RATIO_TEST", posture: "PROHIBITION" } as Partial<CovenantMapNode>),
    node("ir-rule:9.1(c)", "cand:9.1", "9.1(c)", stub(base, "9.1(c)"), { family: "NOTICE_REQUIREMENTS", ruleType: "NOTICE_OBLIGATION", posture: "OBLIGATION" } as Partial<CovenantMapNode>),
    node("ir-rule:9.1(d)", "cand:9.1", "9.1(d)", stub(base, "9.1(d)"), { family: "ASSET_SALES", ruleType: "QUANTITATIVE_PERMISSION", posture: "PROHIBITION" } as Partial<CovenantMapNode>),
  ];
  const resolve = (ref: string, unit: IRRule) => resolvePackageDependencies({ nodes: [node(`ir-rule:${ref}`, `cand:${ref}`, ref, unit), ...targets], candidates: [{ candidateRef: `cand:${ref}`, outcome: "MAPPED", structuralNodeIds: [nodeAt(idx2, ref).nodeId] }, { candidateRef: "cand:9.1", outcome: "MAPPED", structuralNodeIds: [nodeAt(idx2, "9.1").nodeId] }], index: idx2 });

  it("§23 QUALIFIED ATTACK: 'the financial covenants contained in Section 9.1' binds ONLY the two ratio tests (QUALIFIED_ONE_TO_MANY); the notice and asset-sale units are excluded with the reason recorded", () => {
    const unit = unitFor("9.2(a)", ["Section 9.1"]);
    const before = JSON.stringify(unit);
    const bound = resolve("9.2(a)", unit);
    const b = bound.bindings.find((x) => x.kind === "CONDITION_TARGET")!;
    expect([b.status, b.bindingMode, b.boundSemanticTargetIds, b.executable]).toEqual(["BOUND", "QUALIFIED_ONE_TO_MANY", ["ir-rule:9.1(a)", "ir-rule:9.1(b)"], true]);
    expect(b.selectorResolution).toMatchObject({ kind: "QUALIFIED_RULE_SET", qualifierText: "financial covenants contained in", basis: { covenantFamilies: ["FINANCIAL_COVENANTS"], ruleTypes: ["RATIO_TEST"] }, selectedNodeIds: ["ir-rule:9.1(a)", "ir-rule:9.1(b)"], excludedNodeIds: ["ir-rule:9.1(c)", "ir-rule:9.1(d)"] });
    expect(b.targets.map((t) => t.nodeId)).toEqual(["ir-rule:9.1(a)", "ir-rule:9.1(b)"]);
    expect(bound.counts).toMatchObject({ total: 1, bound: 1, executable: 1, oneToMany: 0, qualifiedOneToMany: 1, selectorReview: 0, reviewRequired: 0 });
    expect(JSON.stringify(unit)).toBe(before); // §25-§26: the verified candidate unit is never mutated during binding
    expect(unit.conditions[0]!.referencesRuleTargets![0]!.boundSemanticTargetIds).toEqual([]);
  });
  it("§20/§21 an unsupported qualifier ('the covenants contained in Section 9.1') fails closed: TARGET_SELECTOR_REVIEW_REQUIRED, nothing bound, not executable, counted for the package blocker", () => {
    const unit = unitFor("9.2(d)", ["Section 9.1"]);
    expect(unit.conditions[0]!.referencesRuleTargets![0]!.selector).toMatchObject({ kind: "QUALIFIED_RULE_SET", qualifierText: "covenants contained in" });
    const bound = resolve("9.2(d)", unit);
    const b = bound.bindings.find((x) => x.kind === "CONDITION_TARGET")!;
    expect([b.status, b.bindingMode, b.boundSemanticTargetIds, b.executable]).toEqual(["TARGET_SELECTOR_REVIEW_REQUIRED", null, [], false]);
    expect(b.selectorResolution).toMatchObject({ kind: "QUALIFIED_RULE_SET", basis: null, selectedNodeIds: [] });
    expect(b.detail).toMatch(/no deterministic classification mapping/);
    expect(bound.counts).toMatchObject({ bound: 0, selectorReview: 1, qualifiedOneToMany: 0 });
    // a qualifier whose classification matches none of the units fails closed the same way (never a silent empty binding)
    const assetUnit = { ...unit, conditions: [{ ...unit.conditions[0]!, referencesRuleTargets: [{ ...unit.conditions[0]!.referencesRuleTargets![0]!, selector: { sourceText: "the reporting covenants contained in Section 9.1", kind: "QUALIFIED_RULE_SET" as const, qualifierText: "reporting covenants contained in" } }] }] };
    const rb = resolve("9.2(d)", assetUnit).bindings.find((x) => x.kind === "CONDITION_TARGET")!;
    expect([rb.status, rb.selectorResolution?.selectedNodeIds]).toEqual(["TARGET_SELECTOR_REVIEW_REQUIRED", []]);
  });
  it("§24 UNQUALIFIED CONTROL: 'subject to Section 9.1' binds the whole represented subtree (ONE_TO_MANY_EXPANSION, all four units) under the existing completeness safeguards", () => {
    const unit = unitFor("9.2(b)", ["Section 9.1"]);
    expect(unit.conditions[0]!.referencesRuleTargets![0]!.selector).toEqual({ sourceText: "Section 9.1", kind: "WHOLE_PROVISION", qualifierText: null });
    const b = resolve("9.2(b)", unit).bindings.find((x) => x.kind === "CONDITION_TARGET")!;
    expect([b.status, b.bindingMode, b.boundSemanticTargetIds, b.executable]).toEqual(["BOUND", "ONE_TO_MANY_EXPANSION", ["ir-rule:9.1(a)", "ir-rule:9.1(b)", "ir-rule:9.1(c)", "ir-rule:9.1(d)"], true]);
    expect(b.selectorResolution).toMatchObject({ kind: "WHOLE_PROVISION", selectedNodeIds: ["ir-rule:9.1(a)", "ir-rule:9.1(b)", "ir-rule:9.1(c)", "ir-rule:9.1(d)"], excludedNodeIds: [] });
    // the subtree-coverage safeguard still precedes selection: a target-set candidate anchored inside §9.1 that produced no units -> TARGET_SET_REVIEW_REQUIRED
    const partial = resolvePackageDependencies({ nodes: [node("ir-rule:9.2(b)", "cand:9.2(b)", "9.2(b)", unit), targets[0]!, targets[1]!], candidates: [{ candidateRef: "cand:9.2(b)", outcome: "MAPPED", structuralNodeIds: [nodeAt(idx2, "9.2(b)").nodeId] }, { candidateRef: "cand:9.1", outcome: "MAPPED", structuralNodeIds: [nodeAt(idx2, "9.1").nodeId] }, { candidateRef: "cand:9.1(d)", outcome: "COMPILE_FAILED", structuralNodeIds: [nodeAt(idx2, "9.1(d)").nodeId] }], index: idx2 });
    expect(partial.bindings.find((x) => x.kind === "CONDITION_TARGET")!.status).toBe("TARGET_SET_REVIEW_REQUIRED");
  });
  it("§25 EXPLICIT CONTROL: 'subject to Sections 9.1(a) and 9.1(c)' binds exactly those two units (EXACT_UNIT each) and nothing else", () => {
    const unit = unitFor("9.2(c)", ["Section 9.1(a)", "Section 9.1(c)"]);
    expect(unit.conditions[0]!.referencesRuleTargets!.map((t) => [t.normalizedTargetRef, t.selector?.kind])).toEqual([["9.1(a)", "EXPLICIT_SUBCLAUSE_SET"], ["9.1(c)", "EXPLICIT_SUBCLAUSE_SET"]]);
    const bound = resolve("9.2(c)", unit);
    expect(bound.bindings.filter((x) => x.kind === "CONDITION_TARGET").map((b) => [b.status, b.bindingMode, b.boundSemanticTargetIds])).toEqual([["BOUND", "EXACT_UNIT", ["ir-rule:9.1(a)"]], ["BOUND", "EXACT_UNIT", ["ir-rule:9.1(c)"]]]);
    expect(bound.counts).toMatchObject({ total: 2, bound: 2, oneToMany: 0, qualifiedOneToMany: 0, selectorReview: 0 });
  });
  it("§42 versions: resolver v3, package certification v3 (DEPENDENCY_TARGET_SELECTOR_REVIEW_REQUIRED, severity REVIEW - asserted on a real package in xref-fixtures)", () => {
    expect(PACKAGE_DEPENDENCY_RESOLUTION_VERSION).toBe("p3-package-dependency-resolution.v3");
    expect(PHASE3_PACKAGE_CERTIFICATION_VERSION).toBe("phase3-package-certification.v3");
  });
});

// =========================================================================================================================
// SA-3 §29-§34: one synthetic covenant compiled MONOLITHIC and SHARDED with the SAME scripted semantic submissions.
// =========================================================================================================================
const CO = TEST_COMPANY_ID, INST = TEST_INSTRUMENT_KEY, DOC = TEST_DOCUMENT_ID, CAND = "cand:6.04";
const LETTERS = "abcdefghijkl";
const N_CHILDREN = 12;
/** The production certified policy (expansion regions are CONTEXT_ONLY, exactly as the canonical pipeline runs); the scripted model names are identity only. */
const CERT = certifiedConfig({ semanticModel: "scripted-model", inventoryModel: "scripted", verifierModel: "scripted", inventoryMode: "SINGLE_PASS" });
const WIDE: Partial<ShardBudget> = { maxUnitsPerShard: 64 };
const SMALL: Partial<ShardBudget> = { targetPrimaryChars: 700, maxPrimaryChars: 1_400, maxContextChars: 4_000, maxContextEntryChars: 600, maxUnitsPerShard: 3 };
const PAD = " The amount of each such Investment shall be determined as of the date it is made, without duplication of any other amount so determined.";
const childText = (i: number) => `(${LETTERS[i]}) Investments in joint ventures in an aggregate amount not to exceed $${((i + 1) * 500_000).toLocaleString("en-US")}, subject to Section 9.1;${PAD}`;
const DOC_SA3 = [...HEAD, "ARTICLE VI NEGATIVE COVENANTS", "", "The Borrower shall not, and shall not permit any Subsidiary to, directly or indirectly:", "",
  "SECTION 6.04 Investments . Make any Investment, except that the following shall be permitted:", "", ...Array.from({ length: N_CHILDREN }, (_, i) => [childText(i), ""]).flat(),
  "SECTION 9.1 Financial Covenants . The Borrower shall not permit the Leverage Ratio as of the last day of any fiscal quarter to exceed 4.00 to 1.00.", ""].join("\n");
const idx3 = indexOf(DOC_SA3);

function corpus3() {
  const c = contextFor(idx3, "6.04");
  const items: SemanticInventoryItem[] = [];
  const idOf = (i: number) => `inv-item:child-${LETTERS[i]}`;
  for (let i = 0; i < N_CHILDREN; i++) {
    const amountText = `$${((i + 1) * 500_000).toLocaleString("en-US")}`;
    const at = c.text.indexOf(`(${LETTERS[i]}) Investments`);
    const amountAt = c.text.indexOf(amountText, at);
    items.push({ inventoryItemId: idOf(i), sourceSpan: { regionId: "operative", documentId: DOC, sourceNodeId: null, sectionRef: null, charStart: at, charEnd: amountAt + amountText.length, sourceCitation: `§6.04(${LETTERS[i]})`, excerpt: c.text.slice(at, amountAt + amountText.length) }, semanticRole: "PERMISSION", proposition: `clause (${LETTERS[i]}) permits joint-venture Investments up to ${amountText}`, quantitativeValues: [{ kind: "MONEY", rawText: amountText, normalizedValue: (i + 1) * 500_000, unit: "USD", charStart: amountAt, charEnd: amountAt + amountText.length }], referencedTerms: [], referencedSections: ["9.1"], parentItemId: null, relatedItemIds: [], materiality: "MATERIAL", ambiguity: "NONE", ambiguityReason: null, operative: "OPERATIVE", detectionMethod: "MODEL" });
  }
  const anchor = nodeAt(idx3, "6.04");
  const contextBundle = emptyContextBundle({ originatingStructuralNodeIds: [anchor.nodeId], normalizedSourceRef: "6.04" });
  const input: SemanticCompilerInput = testCompilerInput({ companyId: CO, instrumentKey: INST, sourceDocumentId: DOC, candidateRef: CAND, sourceSectionRef: "6.04", operativeSourceText: c.text, operativeCharStart: c.charStart, contextBundle, toolAccess: { structuralIndex: idx3, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle } });
  return { input, frozenInventory: frozenOf(CAND, items), idOf };
}
/** The scripted Pass B: for every child clause whose text the call was handed, the faithful rule - with three attacks planted in (a), (b) and (c). */
function scriptedSemanticCaller(idOf: (i: number) => string, attacks: boolean): SemanticCaller & { calls: number; seen: string[] } {
  const state = { calls: 0, seen: [] as string[] };
  return { providerName: "scripted", model: "scripted-model", isSynthetic: false, get calls() { return state.calls; }, get seen() { return state.seen; },
    compile: async (input) => {
      state.calls++; state.seen.push(input.candidateRef);
      const rules: Record<string, unknown>[] = [];
      for (let i = 0; i < N_CHILDREN; i++) {
        if (!input.operativeSourceText.includes(`(${LETTERS[i]}) Investments`)) continue;
        const ref = `6.04(${LETTERS[i]})`;
        const r: Record<string, unknown> = { localRef: `r-${LETTERS[i]}`, sourceSectionRef: ref, covenantFamily: "INVESTMENTS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: "MAKE_INVESTMENT", entityScope: ["BORROWER", "ANY_SUBSIDIARY"], entityScopeExcluded: [], capacityExpression: { kind: "MONEY", amount: (i + 1) * 500_000, citation: ref, inventoryItemIds: [idOf(i)] }, conditions: [{ conditionType: "OTHER_RULE_SATISFIED", expression: null, referencesRuleTargets: [{ targetRef: "Section 9.1" }], targetCombination: "ALL_SATISFIED", referencesDefinitionId: null, description: "subject to the referenced provision", citation: ref, excerpt: "subject to Section 9.1" }], exceptions: [], dependsOn: [], sufficiency: "COMPLETE", sufficiencyReasons: [], citation: ref, excerpt: childText(i).slice(0, 80), inventoryItemIds: [idOf(i)] };
        if (attacks && i === 0) r.dependsOn = [{ relationshipType: "REQUIRES", targetRef: "Section 9.1", description: "the Borrower must satisfy the 80% leverage test in Section 9.1", inventoryItemIds: [idOf(i)] }]; // §31 target economics
        if (attacks && i === 1) (r.conditions as Record<string, unknown>[])[0]!.referencesRuleTargets = [{ targetRef: "Section 9.1(a)" }, { targetRef: "Section 9.1(b)" }]; // §32 model reference expansion
        if (attacks && i === 2) r.entityScope = ["BORROWER", "Restricted Subsidiary"]; // §33 unrecognized entity tag
        rules.push(r);
      }
      const raw = { rules, definitions: [], sharedCapacities: [], irExtensionCandidates: [], overallNotes: [] };
      return { submission: SubmitCompilationSchema.parse(raw), rawSubmission: raw, toolCallLog: [], telemetry: null, failureReason: null, failureDetail: null };
    } };
}
const throwingInventory: StageCaller = { providerName: "scripted", model: "scripted", isSynthetic: false, call: async () => { throw new Error("Pass A must not run - the frozen inventory is resumed"); }, lastTelemetry: () => null };
async function compileBoth(attacks: boolean) {
  const c = corpus3();
  // bounded MONOLITHIC: one shard wide enough for the whole unit (the unit has more source units than the certified default per-shard cap)
  const mono = await compileCovenantToIR(c.input, { caller: scriptedSemanticCaller(c.idOf, attacks), inventoryCaller: throwingInventory, inventoryMode: "SINGLE_PASS", certified: CERT, frozenInventory: c.frozenInventory, cache: new InMemorySemanticCompilationCache(), shardBudget: WIDE });
  const shardedCaller = scriptedSemanticCaller(c.idOf, attacks);
  const sharded = await compileCovenantToIR(c.input, { caller: shardedCaller, inventoryCaller: throwingInventory, inventoryMode: "SINGLE_PASS", certified: CERT, frozenInventory: c.frozenInventory, cache: new InMemorySemanticCompilationCache(), shardBudget: SMALL });
  return { c, mono, sharded, shardedCaller };
}
/** Semantic view of a compilation: unit identity re-keyed by the stitcher and composition-relative indexes are execution metadata; everything else must match. */
// provenance binding offsets relative to the execution window (a shard slice vs the whole unit) are execution metadata; the
// absolute document offsets, status, bound text hash and authoritative excerpt must agree
const VOLATILE = new Set(["ruleId", "expressionId", "targetRuleId", "permissionRuleId", "appliesToRuleId", "cacheKey", "compiledAt", "charStart", "charEnd"]);
function semantic(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(semantic);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => !VOLATILE.has(k)).map(([k, x]) => [k, typeof x === "string" ? x.replace(/\b(rules|definitions)\[\d+\]/g, "$1[*]") : semantic(x)]).sort(([a], [b]) => String(a).localeCompare(String(b))));
  return v;
}
const bySection = <T extends { sourceSectionRef: string | null }>(xs: readonly T[]) => [...xs].sort((a, b) => (a.sourceSectionRef ?? "").localeCompare(b.sourceSectionRef ?? ""));
const canonicalDiagnostics = (r: SemanticCompilationResult) => (r.normalizationDiagnostics ?? []).map((d) => ({ code: d.code, sourceUnit: d.sourceUnit, scope: d.scope.replace(/\b(rules|definitions)\[\d+\]/g, "$1[*]"), message: d.message.replace(/\b(rules|definitions)\[\d+\]/g, "$1[*]") })).sort((a, b) => `${a.sourceUnit}|${a.code}|${a.scope}`.localeCompare(`${b.sourceUnit}|${b.code}|${b.scope}`));

describe("SA-3 §31-§34 shard parity: every normalization safety signal survives sharded compilation with deterministic identity", () => {
  const both = compileBoth(true);
  it("the fixture really exercises both paths: MONOLITHIC under the default budget, SHARDED (>= 3 shards, the three attacks in different shards) under the small budget; Pass A never runs", async () => {
    const { mono, sharded, shardedCaller } = await both;
    expect([mono.execution?.mode, mono.execution?.reason]).toEqual(["MONOLITHIC", "SINGLE_BOUNDED_SHARD"]);
    expect([sharded.execution?.mode, sharded.execution?.reason]).toEqual(["SHARDED", "MULTIPLE_SHARDS_REQUIRED"]);
    expect(sharded.execution!.plannedShards).toBeGreaterThanOrEqual(3);
    expect(shardedCaller.calls).toBe(sharded.execution!.plannedShards);
    expect(mono.status).toBe(sharded.status);
    expect(bySection(mono.rules).map((r) => r.sourceSectionRef)).toEqual(Array.from({ length: N_CHILDREN }, (_, i) => `6.04(${LETTERS[i]})`));
    const shardOf = new Map((sharded.normalizationDiagnostics ?? []).map((d) => [d.sourceUnit, d.shardId]));
    expect(new Set([shardOf.get("6.04(a)"), shardOf.get("6.04(b)"), shardOf.get("6.04(c)")]).size).toBeGreaterThanOrEqual(2);
  });
  it("§31 TARGET ECONOMICS: the shard's '80%' prose is excluded from the authoritative IR, the diagnostic and the certification-relevant dependency-prose record survive final assembly, no artifact contamination", async () => {
    const { mono, sharded } = await both;
    for (const r of [mono, sharded]) {
      const a = r.rules.find((x) => x.sourceSectionRef === "6.04(a)")!;
      expect(a.sourceDependencies![0]!.description).toBe("requires that the terms of Section 9.1 are satisfied; the semantics of Section 9.1 are separately owned and resolved at package level");
      expect(JSON.stringify([r.rules, r.definitions, r.sharedCapacities])).not.toContain("80%");
      expect(r.normalizationDiagnostics!.filter((d) => d.code === "TARGET_ECONOMICS_IN_DEPENDENCY_PROSE").map((d) => d.sourceUnit)).toEqual(["6.04(a)"]);
      expect(r.dependencyProseDiagnostics!.filter((d) => d.targetEconomicsExcluded.length > 0).map((d) => [d.exactSourceTargetRef, d.targetEconomicsExcluded])).toEqual([["Section 9.1", ["80%"]]]);
      expect(a.sufficiency).toBe("COMPLETE");
    }
  });
  it("§32 MODEL REFERENCE EXPANSION: the shard's 9.1(a)/9.1(b) is restored to the drafted 'Section 9.1' (WHOLE_PROVISION); MODEL_EXPANDED_REFERENCE_EXCLUDED and the reference audit survive aggregation", async () => {
    const { mono, sharded } = await both;
    for (const r of [mono, sharded]) {
      const b = r.rules.find((x) => x.sourceSectionRef === "6.04(b)")!;
      expect(b.conditions[0]!.referencesRuleTargets!.map((t) => [t.exactSourceTargetRef, t.selector?.kind, t.boundSemanticTargetIds])).toEqual([["Section 9.1", "WHOLE_PROVISION", []]]);
      expect(b.sourceReferenceAudit!.entries.map((e) => [e.emitted, e.classification, e.authoritative, e.restoredTo])).toEqual([["Section 9.1(a)", "MODEL_NARROWED_REFERENCE", false, "Section 9.1"], ["Section 9.1(b)", "MODEL_NARROWED_REFERENCE", false, "Section 9.1"]]);
      expect(r.normalizationDiagnostics!.filter((d) => d.code === "MODEL_EXPANDED_REFERENCE_EXCLUDED").map((d) => d.sourceUnit)).toEqual(["6.04(b)"]);
      expect(b.sufficiency).toBe("COMPLETE");
    }
  });
  it("§33 ENTITY TAG: the governing Article preamble resolves applicability in the shard too - BORROWER + ANY_SUBSIDIARY survive, the bad tag is preserved diagnostically, never a sufficiency reason", async () => {
    const { mono, sharded } = await both;
    for (const r of [mono, sharded]) {
      const c = r.rules.find((x) => x.sourceSectionRef === "6.04(c)")!;
      expect(c.entityScope).toEqual(["BORROWER", "ANY_SUBSIDIARY"]);
      expect(c.entityScopeAudit).toMatchObject({ status: "SOURCE_SCOPE_DERIVED", precedence: "GOVERNING_SCOPE_SOURCE", safeToRely: true });
      expect(c.entityScopeAudit!.rawEmitted.entityScope).toEqual(["BORROWER", "Restricted Subsidiary"]);
      expect(r.normalizationDiagnostics!.filter((d) => d.code === "ENTITY_SCOPE_UNRECOGNIZED_TAG").map((d) => d.sourceUnit)).toEqual(["6.04(c)"]);
      expect(c.sufficiency).toBe("COMPLETE");
      expect(c.sufficiencyReasons.some((x) => x.startsWith("ENTITY_SCOPE_UNRECOGNIZED_TAG"))).toBe(false); // the outranked tag is a diagnostic, never a sufficiency reason
    }
    // when no authoritative scope can resolve it (no governing chain, no own actor language) the review signal survives final shard assembly
    const c = corpus3();
    const bare: SemanticCompilerInput = { ...c.input, governingScope: null }; // compile.ts honours an explicit null: no governing chain is resolved
    const sh = await compileCovenantToIR(bare, { caller: scriptedSemanticCaller(c.idOf, true), inventoryCaller: throwingInventory, inventoryMode: "SINGLE_PASS", certified: CERT, frozenInventory: c.frozenInventory, cache: new InMemorySemanticCompilationCache(), shardBudget: SMALL });
    expect(sh.execution?.mode).toBe("SHARDED");
    const rc = sh.rules.find((x) => x.sourceSectionRef === "6.04(c)")!;
    expect(rc.entityScopeAudit?.status).toBe("UNRECOGNIZED_TAG");
    expect(rc.sufficiency).not.toBe("COMPLETE");
    expect(sh.status).not.toBe("COMPLETED");
  });
  it("§34 PARITY: rules, definitions, shared capacities, source dependencies, reference audits, governing scope, normalization diagnostics and certification-relevant signals are semantically identical; only execution metadata differs", async () => {
    const { mono, sharded } = await both;
    expect(semantic(bySection(sharded.rules))).toEqual(semantic(bySection(mono.rules)));
    expect(semantic(sharded.definitions)).toEqual(semantic(mono.definitions));
    expect(semantic(sharded.sharedCapacities)).toEqual(semantic(mono.sharedCapacities));
    expect(sharded.governingScope?.contentHash).toBe(mono.governingScope?.contentHash);
    expect(canonicalDiagnostics(sharded)).toEqual(canonicalDiagnostics(mono));
    expect(canonicalDiagnostics(mono).map((d) => d.code)).toEqual(["TARGET_ECONOMICS_IN_DEPENDENCY_PROSE", "MODEL_EXPANDED_REFERENCE_EXCLUDED", "ENTITY_SCOPE_UNRECOGNIZED_TAG"]);
    expect(semantic(sharded.dependencyProseDiagnostics)).toEqual(semantic(mono.dependencyProseDiagnostics));
    expect([sharded.contextOnlyEmissions, sharded.invalidWireKinds]).toEqual([mono.contextOnlyEmissions, mono.invalidWireKinds]);
    expect(sharded.failureReasons).toEqual(mono.failureReasons);
    expect(mono.rules.every((r) => r.sufficiency === "COMPLETE")).toBe(true);
    // the only differences are execution metadata: the shard stamp and the identity derived from it
    expect(mono.normalizationDiagnostics!.every((d) => d.shardId === null)).toBe(true);
    expect(sharded.normalizationDiagnostics!.every((d) => typeof d.shardId === "string" && d.shardId.length > 0)).toBe(true);
    expect(new Set(sharded.normalizationDiagnostics!.map((d) => d.diagnosticId)).size).toBe(sharded.normalizationDiagnostics!.length);
  });
  it("§30 identity is deterministic content identity: the same compilation twice yields the same diagnostic ids; changing the quarantined figure changes the diagnostic id and nothing in the artifact", async () => {
    const { sharded } = await both;
    const again = await compileBoth(true);
    expect(again.sharded.normalizationDiagnostics!.map((d) => d.diagnosticId)).toEqual(sharded.normalizationDiagnostics!.map((d) => d.diagnosticId));
    const rec = (msg: string) => diagnosticRecord(CAND, "shard-1", { scope: "rule[r-a].dependsOn[0]", message: msg }, { "rule[r-a]": "6.04(a)" });
    const a = rec("TARGET_ECONOMICS_IN_DEPENDENCY_PROSE: 80%"), b = rec("TARGET_ECONOMICS_IN_DEPENDENCY_PROSE: 81%");
    expect(a.diagnosticId).not.toBe(b.diagnosticId);
    expect([a.sourceUnit, a.shardId, a.code]).toEqual(["6.04(a)", "shard-1", "TARGET_ECONOMICS_IN_DEPENDENCY_PROSE"]);
    expect(diagnosticRecord(CAND, "shard-1", { scope: "rule[r-a].dependsOn[0]", message: a.message }, "6.04(a)").diagnosticId).toBe(a.diagnosticId); // re-keying a shard record with its derived unit is identity-preserving
    const clean = await compileBoth(false);
    expect(semantic(bySection(clean.sharded.rules))).toEqual(semantic(bySection(clean.mono.rules)));
    expect([clean.mono.normalizationDiagnostics, clean.sharded.normalizationDiagnostics]).toEqual([[], []]);
  });
});

// =========================================================================================================================
describe("SA-4 §36-§37 status-neutral dependency prose; the reviewer is never told an external target is certified / verified / valid / correct", () => {
  it("§36 the deterministic description claims no certification status", () => {
    expect(describeSourceDependency("REQUIRES", "Section 9.1")).toBe("requires that the terms of Section 9.1 are satisfied; the semantics of Section 9.1 are separately owned and resolved at package level");
    expect(describeSourceDependency("LIMITED_BY", "Section 9.3(b)")).toBe("is limited by Section 9.3(b); the limit's semantics are separately owned and resolved at package level");
    for (const t of ["REQUIRES", "LIMITED_BY", "SUBJECT_TO", "MODIFIES", "OTHER"] as const) expect(describeSourceDependency(t as never, "Section 9.1")).not.toMatch(/\b(certified|verified|valid|correct)\b/i);
  });
  it("§37 REVIEWER BIAS REGRESSION: the projection and the verifier user content carry no certification-status assertion about any dependency / target; the system prompt names the contract only", async () => {
    const { c, mono } = await compileBoth(true);
    const projection = buildSemanticVerificationProjection({ rules: mono.rules, definitions: mono.definitions, sharedCapacities: mono.sharedCapacities });
    const STATUS = /\b(certified|verified|valid|correct)\b/i;
    for (const r of projection.rules) expect(JSON.stringify([r.sourceDependencies, r.conditions, r.dependsOn, r.unresolvedDependencies])).not.toMatch(STATUS);
    expect(JSON.stringify(projection.rules.find((r) => r.sourceSectionRef === "6.04(a)")!.sourceDependencies)).toContain("separately owned and resolved at package level");
    const content = buildVerifierUserContent({ compilerInput: c.input, compilationResult: mono }, { candidateRef: CAND, items: [], materialUnresolvedCount: 0 } as never, null, null);
    const proposed = content.slice(content.indexOf("PROPOSED IR"), content.indexOf("Deterministic discrepancy signals"));
    expect(proposed.length).toBeGreaterThan(1000);
    expect(proposed).not.toMatch(/\b(certified|verified)\s+unit\b/i);
    expect(proposed).not.toMatch(/\b(target|dependency|dependencies|section)\b[^\n]{0,80}\b(is|are)\s+(certified|verified|valid|correct)\b/i);
    expect(proposed).not.toMatch(/\bowned by (its|their) own\b/i);
    expect(proposed).toContain("separately owned and resolved at package level");
    const system = buildVerifierSystemPrompt({ verifierAlgorithmVersion: "a", verifierPromptVersion: "b", projectionVersion: "c" });
    expect(system).toMatch(/never a statement that the target is certified, verified or correct/);
    expect(SEMANTIC_VERIFIER_PROMPT_VERSION).toBe("phase-3c-semantic-verifier-prompt.v4");
    expect(SEMANTIC_VERIFICATION_PROJECTION_VERSION).toBe("phase-3c-verification-projection.v4");
    expect([SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION]).toEqual(["semantic-accountability-compiler.v8", "semantic-accountability-compiler-prompt.v8"]);
  });
});

// =========================================================================================================================
describe("§43 no agreement-specific production patch in the modules this closure touched", () => {
  const MODULES = ["lib/contract-model/compiler/source-reference-scan.ts", "lib/contract-model/compiler/semantic/source-reference-fidelity.ts", "lib/contract-model/compiler/semantic/source-reference.ts", "lib/contract-model/compiler/semantic/normalize.ts", "lib/contract-model/compiler/semantic/shard-executor.ts", "lib/contract-model/compiler/semantic/shard-stitcher.ts", "lib/contract-model/compiler/semantic/compile.ts", "lib/contract-model/compiler/semantic-accountability/inventory.ts", "lib/contract-model/compiler/semantic-accountability/semantic-functions.ts", "lib/contract-model/compiler/semantic-verification/source-inventory.ts", "lib/contract-model/compiler/semantic-verification/prompt.ts", "lib/contract-model/compiler/semantic-verification/projection.ts", "lib/contract-model/covenant-map/package-dependencies.ts", "lib/contract-model/phase3-certification/package-certification.ts"];
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  it.each(MODULES)("%s carries no CONMED / §7.2(c) / §7.3(g) / Section 7.1 / Parent Borrower / 80% / 3.75 / 5.50 / 2.75 special case in code", (file) => {
    const code = stripComments(fs.readFileSync(file, "utf8"));
    for (const re of [/CONMED/i, /7\.2\(c\)/, /7\.3\(g\)/, /Section 7\.1\b/, /Parent Borrower/, /80%/, /\b3\.75\b/, /\b5\.50\b/, /\b2\.75\b/]) expect(code, `${file} ${re}`).not.toMatch(re);
  });
});
