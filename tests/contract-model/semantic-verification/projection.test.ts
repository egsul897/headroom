/**
 * VERIFIER PROJECTION INTEGRITY CLOSURE (P3-VP1 - STALE_MANUAL_VERIFIER_PROJECTION).
 *
 * The second certified live run (docs/phase-3-live-validation/7.2c-rerun-operative-state/, immutable, hash-pinned here)
 * compiled the materially correct child unit, yet Layer 2 reported the §7.3(g) lien limitation "dropped": the reviewer
 * was shown a hand-written subset of the IR that predated `sourceDependencies`. These tests (a) pin the pre-fix defect
 * from the frozen content, (b) prove the canonical projection exposes every legally material field, (c) replay the
 * false-finding mechanism with a scripted reviewer against the old and the new content, and (d) prove projected content
 * is exactly the snapshotted / persisted content. Zero model calls.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { buildSemanticVerificationProjection, canonicalProjectionJson, computeSemanticVerificationProjectionHash, DEFINITION_FIELD_CLASSIFICATION, ENTITY_SCOPE_AUDIT_NOTE, projectRule, renderSemanticVerificationProjectionMarkdown, RULE_FIELD_CLASSIFICATION, SEMANTIC_VERIFICATION_PROJECTION_VERSION, SHARED_CAPACITY_FIELD_CLASSIFICATION, SUFFICIENCY_CLAIM_NOTE, type ProjectionClass } from "../../../lib/contract-model/compiler/semantic-verification/projection";
import { buildVerifierUserContent, runAdversarialSemanticReview } from "../../../lib/contract-model/compiler/semantic-verification/reviewer";
import { verifyCompiledCandidate } from "../../../lib/contract-model/compiler/semantic-verification/verify";
import { buildVerifierSystemPrompt } from "../../../lib/contract-model/compiler/semantic-verification/prompt";
import { SEMANTIC_VERIFIER_ALGORITHM_VERSION, SEMANTIC_VERIFIER_PROMPT_VERSION, type ReconciliationResult } from "../../../lib/contract-model/compiler/semantic-verification/types";
import type { StageCaller } from "../../../lib/contract-model/compiler/llm-caller";
import { snapshotUnitsForVerification } from "../../../lib/contract-model/verified-units";
import type { IRDefinition, IRRule, IRSharedCapacity } from "../../../lib/contract-model/ir/types";
import type { SemanticCompilationResult } from "../../../lib/contract-model/compiler/semantic/types";
import { testCompilerInput } from "../semantic-compiler/test-helpers";

const FX = "tests/fixtures/phase-3-live-replay/7.2c-rerun-operative-state";
const EVIDENCE = "docs/phase-3-live-validation/7.2c-rerun-operative-state";
const load = <T = any>(name: string): T => JSON.parse(fs.readFileSync(path.join(FX, name), "utf8")) as T;
const sha256 = (b: Buffer | string) => crypto.createHash("sha256").update(b).digest("hex");
const TARGET_FIGURES = ["80%", "3.75", "5.50", "2.75"];

const live = (() => {
  const comp = load<SemanticCompilationResult & { sourceContext: { regions: { kind: string; text: string }[] }; frozenInventory: { candidateRef: string } }>("06-compilation.json");
  const operative = comp.sourceContext.regions.find((r) => r.kind === "OPERATIVE")!.text;
  const input = testCompilerInput({ companyId: "conmed-pilot", instrumentKey: "conmed-eighth-ar-credit-agreement", sourceDocumentId: "conmed-doc-a-eighth-ar-credit-agreement", candidateRef: comp.frozenInventory.candidateRef, sourceSectionRef: "7.2(c)", operativeSourceText: operative });
  const reconciliation: ReconciliationResult = { candidateRef: comp.frozenInventory.candidateRef, items: [], materialUnresolvedCount: 0 } as ReconciliationResult;
  return { comp, input, reconciliation, rule: comp.rules[0]! };
})();
const proposedIrBlock = (content: string) => content.slice(content.indexOf("PROPOSED IR"), content.indexOf("Deterministic discrepancy signals"));

/** A deterministic stand-in for the adversarial reviewer: it flags the lien requirement as absent iff the source mentions "Section 7.3(g)" and the proposed-IR block it was shown never mentions 7.3(g); it flags a shared pool iff a shared capacity is proposed but the source never mentions a shared/aggregate cap. */
function scriptedReview(userContent: string): { findingType: string; severity: string; reasoning: string }[] {
  const source = userContent.slice(0, userContent.indexOf("Retrieved context items:"));
  const block = proposedIrBlock(userContent);
  const out: { findingType: string; severity: string; reasoning: string }[] = [];
  if (/Section 7\.3\(g\)/.test(source) && !block.includes("7.3(g)")) out.push({ findingType: "MISSING_CONDITION", severity: "MATERIAL", reasoning: "the source authorizes only Indebtedness secured by Liens permitted by Section 7.3(g); no reference to Section 7.3(g) appears anywhere in the proposed rule" });
  if (block.includes('"unitKind": "SHARED_CAPACITY"') && !/shared pool/i.test(source)) out.push({ findingType: "UNSUPPORTED_IR_ADDITION", severity: "MATERIAL", reasoning: "a shared capacity pool is proposed but the source states no shared or aggregate cap across the baskets" });
  return out;
}
function scriptedCaller(seen: { userContent: string[] }): StageCaller {
  return { providerName: "scripted", model: "scripted-reviewer", isSynthetic: false, lastTelemetry: () => null,
    async call(schema, stage, _system, userContent) {
      seen.userContent.push(userContent);
      if (stage === "semantic_verification") return schema.parse({ findings: scriptedReview(userContent).map((f) => ({ findingType: f.findingType, severity: f.severity, ruleOrDefinitionId: null, irPath: "rules[0]", sourceEvidence: "Indebtedness secured by Liens permitted by Section 7.3(g)", sourceCitation: "7.2(c)", proposedIrEvidence: "(scripted)", reasoning: f.reasoning })), overallNotes: ["scripted reviewer"] });
      if (stage === "condition_suspicion_classification") return schema.parse({ status: "NO_MATERIAL_CONDITION_SUSPECTED", evidence: [] });
      return schema.parse({});
    } };
}

// ---- synthetic maximal units -------------------------------------------------------------------------------------------
const prov = (excerpt: string) => ({ documentId: "doc-a", sourceNodeKey: null, sourceCitation: "§9.02", excerpt });
const money = (amount: number) => ({ kind: "MONEY", type: "MONEY", amount, currency: "USD", exprId: "ir-expr:internal", provenance: prov(`$${amount}`) });
const target = (ref: string, norm: string, owners: string[], status: "SOURCE_REFERENCE_RESOLVED" | "DEPENDENCY_UNKNOWN" = "SOURCE_REFERENCE_RESOLVED") => ({ exactSourceTargetRef: ref, normalizedTargetRef: norm, resolvedStructuralTarget: status === "SOURCE_REFERENCE_RESOLVED" ? { documentId: "doc-a", structuralNodeId: `node:${norm}`, sectionRef: norm } : null, owningCandidateRefs: owners, boundSemanticTargetIds: [], resolutionStatus: status });
function maximalRule(over: Partial<IRRule> = {}): IRRule {
  return {
    ruleId: "ir-rule:max", irSchemaVersion: "headroom-covenant-ir.v1", companyId: "co", instrumentKey: "inst", sourceDocumentId: "doc-a", sourceSectionRef: "9.02(a)",
    covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: "INCUR_DEBT",
    entityScope: ["BORROWER"], entityScopeExcluded: ["UNRESTRICTED_SUB"],
    entityScopeAudit: { guardVersion: "entity-scope-consistency-guard.v2", status: "SOURCE_MATCH_CONFIRMED", safeToRely: true, reasonCodes: ["ENTITY_SCOPE_SOURCE_MATCH_CONFIRMED"], rawEmitted: { entityScope: ["Borrower"], entityScopeExcluded: [], source: "RULE_FIELD" }, tagNormalization: [], before: { entityScope: ["BORROWER"], entityScopeExcluded: [], sufficiency: "COMPLETE" }, witness: { ownExcerpt: "the Borrower may incur", citedUnitLeadIn: null, decidedBy: "OWN_EXCERPT", signals: [{ tier: "OWN_EXCERPT", phrase: "Borrower", index: 4, excludedContext: false, requiresAnyOf: ["BORROWER"], role: "OBLIGOR", satisfied: true, satisfiedBy: ["BORROWER"], partialOnly: false }] } } as unknown as IRRule["entityScopeAudit"],
    transactionScope: ["INCUR_SECURED_DEBT"],
    capacityExpression: money(20_000_000) as unknown as IRRule["capacityExpression"],
    conditions: [{ conditionId: "c0", conditionType: "OTHER_RULE_SATISFIED", expression: null, referencesDefinitionId: null, referencesRuleTargets: [target("Section 9.01(a)", "9.01(a)", ["cand-9.01"]), target("Section 9.01(b)", "9.01(b)", ["cand-9.01"])], targetCombination: "ALL_SATISFIED", evaluationBasis: { proForma: true, transactionEffect: "after giving effect to the incurrence", asOfSelector: "the last day of the most recently ended fiscal quarter", deemedEffectiveAt: "the first day of each relevant period", testingPeriod: "each relevant period", provenance: prov("pro forma") }, description: "compliance with the covenants in Section 9.01", provenance: prov("provided that"), inventoryItemIds: ["inv-item:c"] }] as unknown as IRRule["conditions"],
    exceptions: [{ exceptionId: "x0", appliesToRuleId: "ir-rule:max", description: "clause (b)", permissionRuleId: "ir-rule:other", conditions: [], provenance: prov("except"), inventoryItemIds: ["inv-item:x"] }],
    dependsOn: [{ relationshipType: "SHARES_CAPACITY_WITH", targetRuleId: "ir-rule:other", description: "shares", inventoryItemIds: [] }],
    unresolvedDependencies: [{ relationshipType: "REQUIRES", targetRef: "the Specified Conditions", description: "requires the Specified Conditions", reason: "no definition of that term in the document", inventoryItemIds: [] }],
    sourceDependencies: [{ ...target("Section 9.03(b)", "9.03(b)", ["cand-9.03"]), relationshipType: "REQUIRES", description: "requires that the terms of Section 9.03(b) are satisfied", provenance: prov("secured by Liens permitted under Section 9.03(b)"), inventoryItemIds: ["inv-item:p"] }],
    inheritedAttributes: [{ attribute: "governingProhibition", sourceAuthority: "PARENT_SCOPE", sourceSectionRef: "9.02", evidence: "The Borrower shall not incur any Debt, except:" }],
    operativeLineage: { instrumentKey: "inst", provisionKey: "inst::SECTION::9.02", asOfDate: "2026-01-01", operativeStatus: "OPERATIVE_STATE_RESOLVED", currentSourceDocumentId: "doc-a" },
    sufficiency: "COMPLETE", sufficiencyReasons: ["every item consumed"], provenance: prov("(a) Debt secured by Liens permitted under Section 9.03(b)"),
    compilerVersion: "semantic-accountability-compiler.v5", sourceContentVersion: "sscv1:abc", inventoryItemIds: ["inv-item:p", "inv-item:c"],
    ...over,
  };
}
const maximalDefinition: IRDefinition = { definitionId: "ir-definition:max", irSchemaVersion: "headroom-covenant-ir.v1", companyId: "co", instrumentKey: "inst", sourceDocumentId: "doc-a", termName: "Adjusted Amount", covenantFamily: "DEFINITIONS_CALCULATION_RULES", calculationExpression: { kind: "ADD", type: "MONEY", exprId: "ir-expr:x", operands: [{ kind: "DEFINED_TERM_REFERENCE", type: "MONEY", termName: "Base Amount", exprId: "ir-expr:y" }, money(5)], provenance: prov("plus") } as unknown as IRDefinition["calculationExpression"], dependsOnTerms: ["Base Amount"], sufficiency: "PARTIAL", sufficiencyReasons: ["one addend unsupported"], provenance: prov("\"Adjusted Amount\" means"), compilerVersion: "v5", sourceContentVersion: "sscv1:def", inventoryItemIds: ["inv-item:d"] };
const sharedCap = (amount: number): IRSharedCapacity => ({ sharedCapId: "ir-shared-cap:pool", companyId: "co", instrumentKey: "inst", description: "aggregate pool across (a) and (b)", capExpression: money(amount) as unknown as IRSharedCapacity["capExpression"], memberRuleIds: ["ir-rule:a", "ir-rule:b"], provenance: prov("not to exceed in the aggregate"), inventoryItemIds: ["inv-item:s"], irSchemaVersion: "headroom-covenant-ir.v1", compilerVersion: "v5", sourceContentVersion: "sscv1:cap" });

describe("P3-VP1 - the frozen second live run: evidence immutable, defect pinned, projection repaired", () => {
  it("every file of the second live run's evidence directory still has the hash recorded at the closure", () => {
    const man = load<{ files: Record<string, string> }>("evidence-manifest.json");
    const files = fs.readdirSync(EVIDENCE, { recursive: true }).map(String).filter((f) => fs.statSync(path.join(EVIDENCE, f)).isFile()).sort();
    expect(files).toEqual(Object.keys(man.files).sort());
    for (const f of files) expect(sha256(fs.readFileSync(path.join(EVIDENCE, f)))).toBe(man.files[f]);
    expect(load("06-compilation.json")).toEqual(JSON.parse(fs.readFileSync(path.join(EVIDENCE, "06-compilation.json"), "utf8")));
  });
  it("PRE-FIX (frozen content captured at 4cf5cb0): the reviewer saw the §7.1 referencesRuleTargets but NOT sourceDependencies, NOT 7.3(g), NOT shared capacities, NOT ruleType/covenantFamily/transactionScope/inheritedAttributes/unresolvedDependencies", () => {
    const old = fs.readFileSync(path.join(FX, "pre-fix-reviewer-user-content.txt"), "utf8");
    const block = proposedIrBlock(old);
    expect(block).toContain("referencesRuleTargets"); expect(block).toContain('"Section 7.1"');
    for (const missing of ["sourceDependencies", "7.3(g)", "sharedCapacities", '"ruleType"', '"covenantFamily"', "transactionScope", "inheritedAttributes", "unresolvedDependencies"]) expect(block).not.toContain(missing);
    expect(load("P3-VP1-pre-fix-projection-probe.json").assertions).toMatchObject({ containsSourceDependencies: false, containsSection73g: false, containsSharedCapacities: false });
    // the live verifier's own words, from the frozen 08-verification.json
    expect(load("08-verification.json").findings[0].proposedIrEvidence).toContain("no reference to Section 7.3(g)");
  });
  it("POST-FIX: the same frozen compilation now shows the reviewer the §7.3(g) REQUIRES dependency, the §7.1 cross-rule condition with its evaluation basis, and a sharedCapacities section - and still no target economics", () => {
    const content = buildVerifierUserContent({ compilerInput: live.input, compilationResult: live.comp }, live.reconciliation, null, null);
    const block = proposedIrBlock(content);
    expect(block).toContain(`projection ${SEMANTIC_VERIFICATION_PROJECTION_VERSION}`);
    for (const needle of ['"sourceDependencies"', '"exactSourceTargetRef": "Section 7.3(g)"', '"relationshipType": "REQUIRES"', '"resolutionStatus": "SOURCE_REFERENCE_RESOLVED"', "discovery-candidate:082c80836268c7277cc39c18", '"exactSourceTargetRef": "Section 7.1"', '"conditionType": "OTHER_RULE_SATISFIED"', '"targetCombination": "ALL_SATISFIED"', '"proForma": true', '"asOfSelector": "last day of the most recently ended fiscal quarter', '"deemedEffectiveAt": "as if such Indebtedness had been incurred on the first day', '"testingPeriod": "each relevant period for testing compliance"', '"sharedCapacities": []', '"ruleType": "QUANTITATIVE_PERMISSION"', '"covenantFamily": "INDEBTEDNESS"', '"transactionScope": null', '"inheritedAttributes": []', '"unresolvedDependencies": []']) expect(block).toContain(needle);
    for (const fig of TARGET_FIGURES) expect(block).not.toContain(fig);
  });
});

describe("§21 the false-finding mechanism, replayed offline with a scripted reviewer", () => {
  it("OLD content -> the scripted reviewer reproduces the live conclusion (§7.3(g) requirement absent); NEW content -> no such finding, and the reviewer provably received the dependency", async () => {
    const old = fs.readFileSync(path.join(FX, "pre-fix-reviewer-user-content.txt"), "utf8");
    expect(scriptedReview(old).map((f) => f.findingType)).toEqual(["MISSING_CONDITION"]);
    const seen = { userContent: [] as string[] };
    const review = await runAdversarialSemanticReview({ compilerInput: live.input, compilationResult: live.comp }, live.reconciliation, scriptedCaller(seen), null, null);
    expect(review.failed).toBe(false);
    expect(review.findings).toEqual([]);
    expect(seen.userContent).toHaveLength(1);
    expect(proposedIrBlock(seen.userContent[0]!)).toContain('"exactSourceTargetRef": "Section 7.3(g)"');
    expect(review.projection).toEqual({ version: SEMANTIC_VERIFICATION_PROJECTION_VERSION, hash: computeSemanticVerificationProjectionHash(buildSemanticVerificationProjection(live.comp)) });
  });
  it("through verifyCompiledCandidate (real Layer-1 + scripted Layer-2): the projection identity is persisted on the result and matches what the reviewer was shown", async () => {
    const seen = { userContent: [] as string[] };
    const result = await verifyCompiledCandidate({ compilerInput: live.input, compilationResult: live.comp }, { reviewCaller: scriptedCaller(seen), conditionSuspicionCaller: scriptedCaller({ userContent: [] }), forceSemanticReview: true });
    expect(result.semanticReviewInvoked).toBe(true);
    expect(result.verificationProjection).toEqual({ version: SEMANTIC_VERIFICATION_PROJECTION_VERSION, hash: computeSemanticVerificationProjectionHash(buildSemanticVerificationProjection(live.comp)), shownToReviewer: true });
    expect(result.findings.filter((f) => f.verificationMethod === "SEMANTIC_ONLY")).toEqual([]);
    expect(result.verifierAlgorithmVersion).toBe("phase-3c-semantic-verifier.v5");
  });
});

describe("VP2-VP9 every legally material field is visible to Layer 2", () => {
  const p = buildSemanticVerificationProjection({ rules: [maximalRule()], definitions: [maximalDefinition], sharedCapacities: [sharedCap(10_000_000)] });
  const r = p.rules[0]!;
  const json = JSON.stringify(p);
  it("VP2 inherited attribute from parent scope", () => { expect(r.inheritedAttributes).toEqual([{ attribute: "governingProhibition", sourceAuthority: "PARENT_SCOPE", sourceSectionRef: "9.02", evidence: "The Borrower shall not incur any Debt, except:" }]); });
  it("VP3 a truly unresolved dependency is visible separately from resolved source dependencies", () => {
    expect(r.unresolvedDependencies).toEqual([expect.objectContaining({ targetRef: "the Specified Conditions", reason: "no definition of that term in the document" })]);
    expect(r.sourceDependencies).toEqual([expect.objectContaining({ exactSourceTargetRef: "Section 9.03(b)", resolutionStatus: "SOURCE_REFERENCE_RESOLVED", owningCandidateRefs: ["cand-9.03"], boundSemanticTargetIds: [], relationshipType: "REQUIRES" })]);
  });
  it("VP4 transaction scope subtype (INCUR_DEBT narrowed to INCUR_SECURED_DEBT)", () => { expect(r.action).toBe("INCUR_DEBT"); expect(r.transactionScope).toEqual(["INCUR_SECURED_DEBT"]); });
  it("VP5 rule type and covenant family", () => { expect([r.ruleType, r.covenantFamily]).toEqual(["QUANTITATIVE_PERMISSION", "INDEBTEDNESS"]); });
  it("VP6 one-to-many rule targets: every target ref is visible with its resolution", () => {
    const c = r.conditions[0] as { referencesRuleTargets: { exactSourceTargetRef: string; resolutionStatus: string }[]; targetCombination: string };
    expect(c.referencesRuleTargets.map((t) => t.exactSourceTargetRef)).toEqual(["Section 9.01(a)", "Section 9.01(b)"]);
    expect(c.targetCombination).toBe("ALL_SATISFIED");
  });
  it("VP7 evaluation basis fields", () => { expect((r.conditions[0] as { evaluationBasis: unknown }).evaluationBasis).toMatchObject({ proForma: true, transactionEffect: "after giving effect to the incurrence", asOfSelector: "the last day of the most recently ended fiscal quarter", deemedEffectiveAt: "the first day of each relevant period", testingPeriod: "each relevant period" }); });
  it("VP8 shared capacity is a reviewed unit with id, description, cap expression, members and lineage", () => {
    expect(p.sharedCapacities).toEqual([expect.objectContaining({ unitKind: "SHARED_CAPACITY", sharedCapId: "ir-shared-cap:pool", description: "aggregate pool across (a) and (b)", memberRuleIds: ["ir-rule:a", "ir-rule:b"], capExpression: expect.objectContaining({ kind: "MONEY", amount: 10_000_000 }), reviewContext: expect.objectContaining({ inventoryItemIds: ["inv-item:s"] }) })]);
  });
  it("VP9 definition mechanics: calculation expression and dependency graph", () => {
    expect(p.definitions[0]).toMatchObject({ termName: "Adjusted Amount", covenantFamily: "DEFINITIONS_CALCULATION_RULES", dependsOnTerms: ["Base Amount"], compilerSufficiencyClaim: { sufficiency: "PARTIAL", sufficiencyReasons: ["one addend unsupported"], note: SUFFICIENCY_CLAIM_NOTE } });
    expect(JSON.stringify(p.definitions[0]!.calculationExpression)).toContain('"termName":"Base Amount"');
  });
  it("round trip: every REVIEW_SEMANTIC rule field is present at its path; sufficiency is labelled a compiler claim; the entity audit is labelled non-evidence; internal ids are gone", () => {
    expect(r).toMatchObject({ ruleId: "ir-rule:max", sourceSectionRef: "9.02(a)", posture: "PERMISSION", entityScope: ["BORROWER"], entityScopeExcluded: ["UNRESTRICTED_SUB"], capacityExpression: expect.objectContaining({ kind: "MONEY", amount: 20_000_000 }), exceptions: [expect.objectContaining({ exceptionId: "x0", permissionRuleId: "ir-rule:other" })], dependsOn: [expect.objectContaining({ relationshipType: "SHARES_CAPACITY_WITH", targetRuleId: "ir-rule:other" })], compilerSufficiencyClaim: { sufficiency: "COMPLETE", sufficiencyReasons: ["every item consumed"], note: SUFFICIENCY_CLAIM_NOTE } });
    expect(r.reviewContext).toMatchObject({ sourceDocumentId: "doc-a", inventoryItemIds: ["inv-item:p", "inv-item:c"], operativeLineage: expect.objectContaining({ operativeStatus: "OPERATIVE_STATE_RESOLVED" }), provenance: expect.objectContaining({ excerpt: "(a) Debt secured by Liens permitted under Section 9.03(b)" }), entityScopeAudit: expect.objectContaining({ note: ENTITY_SCOPE_AUDIT_NOTE, decidedBy: "OWN_EXCERPT", signals: [expect.objectContaining({ phrase: "Borrower", role: "OBLIGOR" })] }) });
    for (const internal of ["exprId", "irSchemaVersion", "compilerVersion", "sourceContentVersion", '"companyId"', '"instrumentKey"']) expect(json).not.toContain(internal);
  });
});

describe("VP10 exhaustive field classification - a new IR field cannot silently bypass the projection", () => {
  const classes: ProjectionClass[] = ["REVIEW_SEMANTIC", "REVIEW_CONTEXTUAL", "EXCLUDE_INTERNAL_METADATA"];
  it("every key of a maximally populated rule / definition / shared capacity is classified (the maps are also `satisfies Record<keyof ...>` at compile time)", () => {
    for (const k of Object.keys(maximalRule())) expect(classes).toContain(RULE_FIELD_CLASSIFICATION[k as keyof IRRule]);
    for (const k of Object.keys(maximalDefinition)) expect(classes).toContain(DEFINITION_FIELD_CLASSIFICATION[k as keyof IRDefinition]);
    for (const k of Object.keys(sharedCap(1))) expect(classes).toContain(SHARED_CAPACITY_FIELD_CLASSIFICATION[k as keyof IRSharedCapacity]);
    expect(Object.keys(RULE_FIELD_CLASSIFICATION).length).toBe(30); expect(Object.keys(DEFINITION_FIELD_CLASSIFICATION).length).toBe(15); expect(Object.keys(SHARED_CAPACITY_FIELD_CLASSIFICATION).length).toBe(11);
  });
  it("the legally material rule fields are REVIEW_SEMANTIC; identity/version machinery is EXCLUDE_INTERNAL_METADATA", () => {
    for (const f of ["ruleId", "sourceSectionRef", "covenantFamily", "ruleType", "posture", "action", "entityScope", "entityScopeExcluded", "transactionScope", "capacityExpression", "governingLimit", "conditions", "exceptions", "dependsOn", "unresolvedDependencies", "sourceDependencies", "inheritedAttributes", "sufficiency", "sufficiencyReasons"] as const) expect(RULE_FIELD_CLASSIFICATION[f]).toBe("REVIEW_SEMANTIC");
    for (const f of ["irSchemaVersion", "companyId", "instrumentKey", "compilerVersion", "sourceContentVersion"] as const) expect(RULE_FIELD_CLASSIFICATION[f]).toBe("EXCLUDE_INTERNAL_METADATA");
    for (const f of ["entityScopeAudit", "operativeLineage", "provenance", "inventoryItemIds", "sourceDocumentId"] as const) expect(RULE_FIELD_CLASSIFICATION[f]).toBe("REVIEW_CONTEXTUAL");
  });
  it("at runtime a unit carrying an unclassified key is refused, never silently dropped", () => {
    const drifted = { ...maximalRule(), newLegalSemanticField: "x" } as unknown as IRRule;
    expect(() => projectRule(drifted)).toThrow(/unclassified field\(s\) newLegalSemanticField/);
  });
});

describe("VP11 verifier independence", () => {
  it("the projection and the system prompt carry no certification, benchmark, verifier-status or execution-truth signal; sufficiency is a labelled claim", () => {
    const json = JSON.stringify(buildSemanticVerificationProjection(live.comp));
    // no status / answer-key / downstream-truth signal (case-sensitive status tokens and field names; the deterministic
    // dependency wording "owned by its own certified unit" is a description of ownership, not a status)
    for (const banned of ['"certification', '"CERTIFIED"', "NOT_CERTIFIED", "REVIEW_REQUIRED", "benchmark", "expectedAnswer", "MATERIAL_DISCREPANCY", "VERIFIED_NO_MATERIAL", '"executed"', '"confidence"']) expect(json).not.toContain(banned);
    expect(json).toContain(SUFFICIENCY_CLAIM_NOTE);
    const sys = buildVerifierSystemPrompt({ verifierAlgorithmVersion: SEMANTIC_VERIFIER_ALGORITHM_VERSION, verifierPromptVersion: SEMANTIC_VERIFIER_PROMPT_VERSION, projectionVersion: SEMANTIC_VERIFICATION_PROJECTION_VERSION });
    expect(SEMANTIC_VERIFIER_PROMPT_VERSION).toBe("phase-3c-semantic-verifier-prompt.v4");
    for (const s of ["sourceDependencies", "boundSemanticTargetIds", "inheritedAttributes", "sharedCapacities", "transactionScope", "Nothing in the presentation tells you that any particular representation is correct"]) expect(sys).toContain(s);
    expect(sys).toMatch(/need not also appear in conditions, dependsOn or the capacity expression/);
  });
});

describe("VP12 exact-content relationship: projected proposal == snapshot == verified package", () => {
  it("the projection of the compilation equals the projection of the pre-verification snapshot units and of the persisted verified units (same canonical hash); projection adds, infers and alters nothing", () => {
    const fromCompilation = buildSemanticVerificationProjection(live.comp);
    const snap = snapshotUnitsForVerification(live.comp);
    const snapUnits = { rules: snap.units.filter((u) => u.kind === "RULE").map((u) => u.unit as IRRule), definitions: snap.units.filter((u) => u.kind === "DEFINITION").map((u) => u.unit as IRDefinition), sharedCapacities: snap.units.filter((u) => u.kind === "SHARED_CAPACITY").map((u) => u.unit as IRSharedCapacity) };
    expect(computeSemanticVerificationProjectionHash(buildSemanticVerificationProjection(snapUnits))).toBe(computeSemanticVerificationProjectionHash(fromCompilation));
    const persisted = load<{ units: { kind: string; unit: unknown }[] }>("09-verified-units.json");
    const persistedUnits = { rules: persisted.units.filter((u) => u.kind === "RULE").map((u) => u.unit as IRRule), definitions: persisted.units.filter((u) => u.kind === "DEFINITION").map((u) => u.unit as IRDefinition), sharedCapacities: persisted.units.filter((u) => u.kind === "SHARED_CAPACITY").map((u) => u.unit as IRSharedCapacity) };
    expect(computeSemanticVerificationProjectionHash(buildSemanticVerificationProjection(persistedUnits))).toBe(computeSemanticVerificationProjectionHash(fromCompilation));
    // no mutation of the source unit; nothing added: every semantic value projected is a value of the unit
    const before = JSON.stringify(live.rule);
    const pr = projectRule(live.rule);
    expect(JSON.stringify(live.rule)).toBe(before);
    expect(pr.sourceDependencies).toEqual(JSON.parse(JSON.stringify(live.rule.sourceDependencies)));
    expect(pr.conditions).toEqual(JSON.parse(JSON.stringify(live.rule.conditions)));
  });
  it("the projection hash is deterministic and key-order independent; the rendering reuses the same projection", () => {
    const a = buildSemanticVerificationProjection(live.comp), b = buildSemanticVerificationProjection(live.comp);
    expect(computeSemanticVerificationProjectionHash(a)).toBe(computeSemanticVerificationProjectionHash(b));
    expect(canonicalProjectionJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe('{"a":[{"c":3,"d":2}],"b":1}');
    const md = renderSemanticVerificationProjectionMarkdown(a, { operativeSourceVersion: "scv1:x" });
    expect(md).toContain("sourceDependencies:"); expect(md).toContain("Section 7.3(g)"); expect(md).toContain("inheritedAttributes:"); expect(md).toContain("unresolvedDependencies:"); expect(md).toContain("transactionScope:"); expect(md).toContain("operativeSourceVersion: scv1:x");
  });
});

describe("§15 shared-capacity attack: Layer 2 can now see (and a scripted reviewer can reject) an unsupported pool", () => {
  const source = "(a) the Borrower may incur Debt in an aggregate principal amount not to exceed $20,000,000; and (b) the Borrower may incur Debt in an aggregate principal amount not to exceed $30,000,000.";
  const ruleA = maximalRule({ ruleId: "ir-rule:a", sourceSectionRef: "9.02(a)", capacityExpression: money(20_000_000) as never, conditions: [], dependsOn: [], unresolvedDependencies: [], sourceDependencies: [], inheritedAttributes: [], exceptions: [] });
  const ruleB = maximalRule({ ruleId: "ir-rule:b", sourceSectionRef: "9.02(b)", capacityExpression: money(30_000_000) as never, conditions: [], dependsOn: [], unresolvedDependencies: [], sourceDependencies: [], inheritedAttributes: [], exceptions: [] });
  const comp = { ...live.comp, rules: [ruleA, ruleB], definitions: [], sharedCapacities: [sharedCap(10_000_000)] } as SemanticCompilationResult;
  it("the shared-cap unit is in the reviewer's content and the scripted reviewer flags it when the source states no shared pool", async () => {
    const input = testCompilerInput({ sourceSectionRef: "9.02", operativeSourceText: source });
    const seen = { userContent: [] as string[] };
    const review = await runAdversarialSemanticReview({ compilerInput: input, compilationResult: comp }, { candidateRef: input.candidateRef, items: [], materialUnresolvedCount: 0 } as ReconciliationResult, scriptedCaller(seen), null, null);
    expect(proposedIrBlock(seen.userContent[0]!)).toContain('"unitKind": "SHARED_CAPACITY"');
    expect(proposedIrBlock(seen.userContent[0]!)).toContain('"sharedCapId": "ir-shared-cap:pool"');
    expect(review.findings.map((f) => f.findingType)).toEqual(["UNSUPPORTED_IR_ADDITION"]);
  });
  it("a source-backed shared cap is visible and not flagged", async () => {
    const input = testCompilerInput({ sourceSectionRef: "9.02", operativeSourceText: source + " The aggregate amount incurred under clauses (a) and (b) shall not exceed $10,000,000 as a shared pool." });
    const seen = { userContent: [] as string[] };
    const review = await runAdversarialSemanticReview({ compilerInput: input, compilationResult: comp }, { candidateRef: input.candidateRef, items: [], materialUnresolvedCount: 0 } as ReconciliationResult, scriptedCaller(seen), null, null);
    expect(proposedIrBlock(seen.userContent[0]!)).toContain('"amount": 10000000');
    expect(review.findings).toEqual([]);
  });
});
