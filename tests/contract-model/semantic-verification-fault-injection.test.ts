/**
 * Phase 3C fault-injection harness (task §22-30). Mutates a CORRECT
 * synthetic IR against its UNCHANGED source text and verifies the
 * discrepancy is detected. Every fact pattern is synthetic/generic - never
 * real FWRG/LSB text or numbers.
 *
 * TWO EVIDENCE TIERS, deliberately kept distinct and never conflated (task
 * §31's own DETERMINISTIC_ONLY/SEMANTIC_ONLY/BOTH classification exists
 * for exactly this reason):
 *
 *  - DETERMINISTIC TIER: numeric/structural-count attacks that Layer 1
 *    alone (source-inventory + ir-inventory + reconciliation, zero cost,
 *    no model) can and must catch unconditionally. These tests call
 *    verifyCompiledCandidate with skipSemanticReview:true and assert a
 *    REAL, model-free 100% detection rate - the "deterministically
 *    adjudicable" half of task §30's required gate.
 *
 *  - SCRIPTED-SEMANTIC TIER: attacks that inherently require reading-
 *    comprehension judgment (wrong action, wrong logic, wrong entity-scope
 *    SEMANTICS, provenance correctness, cross-reference correctness) that
 *    Layer 1 cannot and should not try to adjudicate by regex. These tests
 *    use a SCRIPTED fake Layer 2 caller returning a hand-authored, correct
 *    finding, and assert the ORCHESTRATION (routing/merging/status-gating)
 *    correctly surfaces whatever Layer 2 reports. This proves the
 *    detection PIPELINE is wired correctly - it is NOT a claim that the
 *    real live model reliably produces that exact finding on every such
 *    case. Real-world semantic reliability for this tier was separately,
 *    honestly evidence-checked against real preserved Phase 3B output
 *    (scripts/phase-3c-verify-preserved-action-cases.ts) - that real check
 *    found genuine, correct, differently-categorized findings (WRONG_ENTITY_SCOPE,
 *    MISSING_DEPENDENCY) rather than the anticipated WRONG_ACTION label on
 *    two separate real runs, a disclosed, honest limitation of live-model
 *    determinism this synthetic tier does not and cannot paper over.
 *
 * FALSE-POSITIVE CONTROLS (task §28) prove the verifier can also leave
 * correct IR alone - a verifier that always finds something is as useless
 * as one that never does.
 */
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import { verifyCompiledCandidate } from "../../lib/contract-model/compiler/semantic-verification/verify";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { VerificationInput } from "../../lib/contract-model/compiler/semantic-verification/types";
import type { SemanticCompilationResult } from "../../lib/contract-model/compiler/semantic/types";
import type { IRRule, IRExpression } from "../../lib/contract-model/ir/types";
import { testCompilerInput } from "./semantic-compiler/test-helpers";

let ruleCounter = 0;
function rule(overrides: Partial<IRRule>): IRRule {
  ruleCounter++;
  return {
    ruleId: `ir-rule:fi-${ruleCounter}`,
    irSchemaVersion: "v1",
    companyId: "sem-test-co",
    instrumentKey: "sem-test-instrument",
    sourceDocumentId: "sem-test-doc",
    sourceSectionRef: "9.01",
    covenantFamily: "INDEBTEDNESS",
    ruleType: "QUANTITATIVE_PERMISSION",
    posture: "PERMISSION",
    action: "INCUR_DEBT",
    entityScope: [],
    entityScopeExcluded: [],
    transactionScope: null,
    capacityExpression: null,
    conditions: [],
    exceptions: [],
    dependsOn: [],
    operativeLineage: null,
    sufficiency: "COMPLETE",
    sufficiencyReasons: [],
    provenance: null,
    compilerVersion: "v1",
    sourceContentVersion: null,
    ...overrides,
  } as IRRule;
}

function compilationResult(overrides: Partial<SemanticCompilationResult> = {}): SemanticCompilationResult {
  return { status: "REVIEW_REQUIRED", failureReasons: [], errorDetail: null, rules: [], definitions: [], sharedCapacities: [], irExtensionCandidates: [], unresolvedIssues: [], toolCallLog: [], rawModelOutput: {}, provider: "test", model: "test-model", telemetry: null, cacheKey: "k", compiledAt: new Date().toISOString(), ...overrides };
}

function money(amount: number): IRExpression {
  return { exprId: "e", kind: "MONEY", type: "MONEY", amount, currency: "USD" };
}
function percent(value: number): IRExpression {
  return { exprId: "e", kind: "PERCENT", type: "PERCENT", value };
}
function ratio(value: number): IRExpression {
  return { exprId: "e", kind: "RATIO", type: "RATIO", value };
}
function metricRef(metricName: string): IRExpression {
  return { exprId: "e", kind: "METRIC_REFERENCE", type: "MONEY", metricName, companyId: "c", instrumentKey: "i", resolvedDefinitionId: null };
}

function fakeCaller(response: unknown): StageCaller {
  return {
    providerName: "test-provider",
    model: "test-model",
    isSynthetic: false,
    async call<T>(schema: ZodType<T>): Promise<T> {
      return schema.parse(response);
    },
    lastTelemetry: () => null,
  };
}

async function verifyDeterministicOnly(text: string, r: IRRule) {
  const input: VerificationInput = { compilerInput: testCompilerInput({ operativeSourceText: text }), compilationResult: compilationResult({ rules: [r] }) };
  return verifyCompiledCandidate(input, { skipSemanticReview: true });
}

async function verifyWithScriptedSemanticFinding(text: string, r: IRRule, wireFinding: Record<string, unknown>) {
  const input: VerificationInput = { compilerInput: testCompilerInput({ operativeSourceText: text }), compilationResult: compilationResult({ rules: [r] }) };
  const caller = fakeCaller({ findings: [wireFinding], overallNotes: [] });
  return verifyCompiledCandidate(input, { forceSemanticReview: true, reviewCaller: caller });
}

describe("Phase 3C fault injection - DETERMINISTIC TIER (economic attacks, zero cost, 100% required)", () => {
  it("wrong dollar threshold is detected", async () => {
    const text = "The Company may incur Indebtedness not to exceed $10,000,000.";
    const mutated = rule({ capacityExpression: money(99_000_000) }); // mutated: should be 10M
    const result = await verifyDeterministicOnly(text, mutated);
    expect(result.status).toBe("MATERIAL_DISCREPANCY");
  });

  it("wrong percentage is detected", async () => {
    const text = "The Company may incur Indebtedness not to exceed 10% of Consolidated Total Assets.";
    const mutated = rule({ capacityExpression: { exprId: "e", kind: "MULTIPLY", type: "MONEY", operands: [percent(0.99), metricRef("Consolidated Total Assets")] } });
    const result = await verifyDeterministicOnly(text, mutated);
    expect(result.status).toBe("MATERIAL_DISCREPANCY");
  });

  it("wrong ratio threshold is detected", async () => {
    const text = "The Company may make Restricted Payments so long as the Leverage Ratio does not exceed 4.00 to 1.00.";
    const mutated = rule({ capacityExpression: { kind: "UNLIMITED_CAPACITY", type: "CAPACITY", gatedBy: { exprId: "e", kind: "COMPARE", type: "BOOLEAN", left: metricRef("Leverage Ratio"), operator: "LTE", right: ratio(9.99) } } });
    const result = await verifyDeterministicOnly(text, mutated);
    expect(result.status).toBe("MATERIAL_DISCREPANCY");
  });

  it("ratio permission incorrectly converted to a fixed basket is detected (the source ratio vanishes, an unsupported dollar figure appears)", async () => {
    const text = "The Company may make Restricted Payments so long as the Leverage Ratio does not exceed 4.00 to 1.00.";
    const mutated = rule({ capacityExpression: money(50_000_000) });
    const result = await verifyDeterministicOnly(text, mutated);
    expect(result.status).toBe("MATERIAL_DISCREPANCY");
    expect(result.findings.some((f) => f.findingType === "UNSUPPORTED_IR_ADDITION")).toBe(true);
  });

  it("fixed basket incorrectly converted to a ratio permission is detected (the source dollar figure vanishes, an unsupported ratio appears)", async () => {
    const text = "The Company may incur Indebtedness not to exceed $10,000,000.";
    const mutated = rule({ capacityExpression: { kind: "UNLIMITED_CAPACITY", type: "CAPACITY", gatedBy: { exprId: "e", kind: "COMPARE", type: "BOOLEAN", left: metricRef("Leverage Ratio"), operator: "LTE", right: ratio(4.0) } } });
    const result = await verifyDeterministicOnly(text, mutated);
    expect(result.status).toBe("MATERIAL_DISCREPANCY");
  });

  it("an omitted builder component (dropped operand carrying a real source figure) is detected", async () => {
    const text = "The Company may make Restricted Payments in an amount equal to $5,000,000 plus $3,000,000 of Retained Excess Cash Flow.";
    const mutated = rule({ capacityExpression: money(5_000_000) }); // the $3,000,000 operand was silently dropped
    const result = await verifyDeterministicOnly(text, mutated);
    expect(result.status).toBe("MATERIAL_DISCREPANCY");
  });

  it("a wrong stepped-schedule threshold is detected", async () => {
    const text = "The Leverage Ratio shall not exceed 5.00 to 1.00 through the fiscal quarter ending December 31, 2026, and 4.50 to 1.00 thereafter.";
    const mutated = rule({
      capacityExpression: {
        kind: "UNLIMITED_CAPACITY",
        type: "CAPACITY",
        gatedBy: { exprId: "e", kind: "COMPARE", type: "BOOLEAN", left: metricRef("Leverage Ratio"), operator: "LTE", right: { exprId: "e", kind: "SCHEDULE", type: "RATIO", cases: [{ from: null, to: "2026-12-31", value: ratio(5.0), description: "x" }], defaultValue: ratio(9.99) } },
      },
    });
    const result = await verifyDeterministicOnly(text, mutated);
    expect(result.status).toBe("MATERIAL_DISCREPANCY");
  });

  it("a missing cap (source states a dollar limit, IR represents it as unlimited) is detected", async () => {
    const text = "The Company may incur Indebtedness not to exceed $7,500,000 in the aggregate.";
    const mutated = rule({ capacityExpression: { kind: "UNLIMITED_CAPACITY", type: "CAPACITY", gatedBy: null } });
    const result = await verifyDeterministicOnly(text, mutated);
    expect(result.status).toBe("MATERIAL_DISCREPANCY");
  });

  it("a missing IF condition that silently drops a real ratio gate is detected", async () => {
    const text = "The Company may pay dividends up to $5,000,000, provided that the Leverage Ratio does not exceed 3.00 to 1.00.";
    const mutated = rule({ capacityExpression: money(5_000_000), conditions: [] }); // the 3.00:1.00 gate vanished entirely
    const result = await verifyDeterministicOnly(text, mutated);
    expect(result.status).toBe("MATERIAL_DISCREPANCY");
  });

  it("a missing condition is detected via the aggregate condition/exception structural signal even when no numeric gate is involved", async () => {
    const text = "The Company may pay dividends, provided that no Default exists, provided, further, that pro forma compliance is demonstrated, except that ordinary course tax distributions are always permitted.";
    const mutated = rule({ capacityExpression: money(1), conditions: [], exceptions: [] });
    const result = await verifyDeterministicOnly(text, mutated);
    expect(result.findings.some((f) => f.findingType === "MISSING_CONDITION")).toBe(true);
  });

  it("a missing exception (a real carve-out never represented) is detected via the same aggregate signal", async () => {
    const text = "The Company shall not make Investments, except that Investments in cash equivalents are permitted, except that Investments existing on the Closing Date are permitted, provided that no Investment is made in a Sanctioned Person.";
    const mutated = rule({ posture: "PROHIBITION", capacityExpression: null, exceptions: [] });
    const result = await verifyDeterministicOnly(text, mutated);
    expect(result.findings.some((f) => f.findingType === "MISSING_CONDITION")).toBe(true); // MISSING_CONDITION/MISSING_EXCEPTION share the same aggregate detection mechanism
  });

  it("a missing first/middle/last basket in a multi-clause enumeration is detected via structural completeness (generalized, no section-specific logic)", async () => {
    const text = "The Company may incur the following: (a) Indebtedness not to exceed $1,000,000; (b) Indebtedness not to exceed $2,000,000; (c) Indebtedness not to exceed $3,000,000.";
    // Only (a) and (c) were compiled - (b) [middle] is missing entirely.
    const rules = [rule({ capacityExpression: money(1_000_000) }), rule({ capacityExpression: money(3_000_000) })];
    const input: VerificationInput = { compilerInput: testCompilerInput({ operativeSourceText: text }), compilationResult: compilationResult({ rules }) };
    const result = await verifyCompiledCandidate(input, { skipSemanticReview: true });
    expect(result.status).toBe("MATERIAL_DISCREPANCY");
    expect(result.findings.some((f) => f.findingType === "MISSING_BASKET" && f.sourceEvidence.includes("2,000,000"))).toBe(true);
  });

  it("two independently-operative baskets merged into one is detected (one basket's real figure disappears)", async () => {
    const text = "The Company may incur (a) Indebtedness not to exceed $4,000,000 and (b) separately, Indebtedness not to exceed $6,000,000.";
    const merged = rule({ capacityExpression: money(4_000_000) }); // (b)'s $6,000,000 is gone
    const result = await verifyDeterministicOnly(text, merged);
    expect(result.status).toBe("MATERIAL_DISCREPANCY");
  });

  it("an omitted shared cap is detected via the aggregate shared-cap signal", async () => {
    const text = "The Company may incur Indebtedness not to exceed $5,000,000, combined with amounts outstanding under the general basket.";
    const mutated = rule({ capacityExpression: money(5_000_000) }); // no shared-cap relationship represented at all
    const result = await verifyDeterministicOnly(text, mutated);
    expect(result.findings.some((f) => f.findingType === "MISSING_SHARED_CAP")).toBe(true);
  });

  it("an omitted reclassification right is detected via the aggregate reclassification signal", async () => {
    const text = "Indebtedness incurred under this basket may be reclassified as Indebtedness incurred under another available basket at any time.";
    const mutated = rule({ capacityExpression: money(1_000_000), dependsOn: [] });
    const result = await verifyDeterministicOnly(text, mutated);
    expect(result.findings.some((f) => f.findingType === "MISSING_RECLASSIFICATION")).toBe(true);
  });

  it("an unsupported IR addition (a fabricated figure the source never states) is detected", async () => {
    const text = "The Company may make Investments in the ordinary course of business.";
    const mutated = rule({ capacityExpression: money(123_456_789) });
    const result = await verifyDeterministicOnly(text, mutated);
    expect(result.findings.some((f) => f.findingType === "UNSUPPORTED_IR_ADDITION")).toBe(true);
  });

  it("a scope inversion that empties a represented entity restriction is detected once source distinguishes multiple entity terms", async () => {
    const text = "No Restricted Subsidiary shall guarantee any Indebtedness of the Borrower or any Unrestricted Subsidiary.";
    const mutated = rule({ capacityExpression: money(1), entityScope: [] }); // entity restriction silently dropped
    const result = await verifyDeterministicOnly(text, mutated);
    expect(result.findings.some((f) => f.findingType === "WRONG_ENTITY_SCOPE")).toBe(true);
  });
});

describe("Phase 3C fault injection - SCRIPTED-SEMANTIC TIER (judgment-requiring attacks, orchestration proof)", () => {
  it("wrong action classification is correctly surfaced end-to-end when Layer 2 reports it", async () => {
    const text = "The Borrower may guarantee obligations of its Restricted Subsidiaries in the ordinary course of business.";
    const mutated = rule({ action: "OTHER", capacityExpression: { kind: "UNLIMITED_CAPACITY", type: "CAPACITY", gatedBy: null } });
    const result = await verifyWithScriptedSemanticFinding(text, mutated, { findingType: "WRONG_ACTION", severity: "MATERIAL", ruleOrDefinitionId: null, irPath: null, sourceEvidence: "guarantee obligations", sourceCitation: "§9.01", proposedIrEvidence: "action=OTHER", reasoning: "source clearly describes a guaranty, not a generic OTHER action" });
    expect(result.status).toBe("MATERIAL_DISCREPANCY");
    expect(result.findings[0]?.findingType).toBe("WRONG_ACTION");
  });

  it("wrong metric (a plausible-looking but incorrect defined-term reference) is correctly surfaced end-to-end - a pure name swap Layer 1's fuzzy, deliberately-low-confidence metric matching cannot reliably adjudicate on its own", async () => {
    const text = "The Company may incur Indebtedness not to exceed 10% of Consolidated Total Assets.";
    const mutated = rule({ capacityExpression: { exprId: "e", kind: "MULTIPLY", type: "MONEY", operands: [percent(0.1), metricRef("Consolidated EBITDA")] } }); // wrong metric, same percent
    const result = await verifyWithScriptedSemanticFinding(text, mutated, { findingType: "WRONG_METRIC", severity: "MATERIAL", ruleOrDefinitionId: null, irPath: null, sourceEvidence: "Consolidated Total Assets", proposedIrEvidence: "Consolidated EBITDA", reasoning: "source names Consolidated Total Assets as the base metric; the proposed IR substitutes an unrelated metric, Consolidated EBITDA" });
    expect(result.status).toBe("MATERIAL_DISCREPANCY");
    expect(result.findings[0]?.findingType).toBe("WRONG_METRIC");
  });

  it("AND/OR logic inversion is correctly surfaced end-to-end", async () => {
    const text = "The Company may pay dividends if both no Default exists and the Leverage Ratio is satisfied.";
    const mutated = rule({ capacityExpression: money(1) });
    const result = await verifyWithScriptedSemanticFinding(text, mutated, { findingType: "WRONG_LOGIC", severity: "MATERIAL", ruleOrDefinitionId: null, irPath: null, sourceEvidence: "both...and", proposedIrEvidence: "OR(...)", reasoning: "source requires both conditions (AND), proposed IR represents them as alternatives (OR)" });
    expect(result.status).toBe("MATERIAL_DISCREPANCY");
    expect(result.findings[0]?.findingType).toBe("WRONG_LOGIC");
  });

  it("an exception mis-modeled as an unconditional permission is correctly surfaced", async () => {
    const text = "The Company shall not pay dividends; provided that dividends up to $1,000,000 per year are permitted.";
    const mutated = rule({ posture: "PERMISSION", capacityExpression: money(1_000_000) }); // the prohibition is gone entirely
    const result = await verifyWithScriptedSemanticFinding(text, mutated, { findingType: "WRONG_POSTURE", severity: "MATERIAL", ruleOrDefinitionId: null, irPath: null, sourceEvidence: "shall not pay dividends", proposedIrEvidence: "posture=PERMISSION only, no prohibition rule", reasoning: "the general prohibition was dropped, leaving only the carve-out" });
    expect(result.status).toBe("MATERIAL_DISCREPANCY");
  });

  it("a provenance mismatch (citation to an unrelated sibling section) is correctly surfaced", async () => {
    const text = "§9.01: Indebtedness basket. §9.02: unrelated Lien basket.";
    const mutated = rule({ sourceSectionRef: "9.01", provenance: { documentId: "d", sourceNodeKey: null, sourceCitation: "§9.02", excerpt: "unrelated Lien basket" }, capacityExpression: money(1) });
    const result = await verifyWithScriptedSemanticFinding(text, mutated, { findingType: "PROVENANCE_MISMATCH", severity: "MATERIAL", ruleOrDefinitionId: null, irPath: null, sourceEvidence: "§9.02: unrelated Lien basket", proposedIrEvidence: "cites §9.02 for an Indebtedness rule", reasoning: "the rule's own citation points to an unrelated Lien provision, not the Indebtedness basket it claims to represent" });
    expect(result.status).toBe("MATERIAL_DISCREPANCY");
    expect(result.findings[0]?.findingType).toBe("PROVENANCE_MISMATCH");
  });

  it("a wrong cross-reference dependency (points at the wrong target) is correctly surfaced", async () => {
    const text = "This basket is subject to the conditions set forth in Section 9.05.";
    const mutated = rule({ capacityExpression: money(1), dependsOn: [{ relationshipType: "REQUIRES", targetRuleId: "ir-rule:wrong-target", description: "x" }] });
    const result = await verifyWithScriptedSemanticFinding(text, mutated, { findingType: "WRONG_DEPENDENCY", severity: "MATERIAL", ruleOrDefinitionId: null, irPath: null, sourceEvidence: "Section 9.05", proposedIrEvidence: "dependsOn -> ir-rule:wrong-target", reasoning: "the dependency target does not correspond to the referenced Section 9.05 provision" });
    expect(result.status).toBe("MATERIAL_DISCREPANCY");
  });
});

describe("Phase 3C fault injection - FALSE-POSITIVE CONTROLS (task §28, clean cases must not trigger material findings)", () => {
  it("a simple, correct fixed basket produces no material finding", async () => {
    const text = "The Company may incur Indebtedness not to exceed $10,000,000.";
    const clean = rule({ capacityExpression: money(10_000_000) });
    const result = await verifyDeterministicOnly(text, clean);
    expect(result.status).toBe("VERIFIED_NO_MATERIAL_GAP_FOUND");
  });

  it("a correct greater-of basket produces no material finding", async () => {
    const text = "...the greater of $5,000,000 and 8% of Consolidated Net Income.";
    const clean = rule({ capacityExpression: { exprId: "e", kind: "MAX", type: "MONEY", operands: [money(5_000_000), { exprId: "e", kind: "MULTIPLY", type: "MONEY", operands: [percent(0.08), metricRef("Consolidated Net Income")] }] } });
    const input: VerificationInput = { compilerInput: testCompilerInput({ operativeSourceText: text }), compilationResult: compilationResult({ rules: [clean] }) };
    const result = await verifyCompiledCandidate(input, { skipSemanticReview: true });
    expect(result.status).toBe("VERIFIED_NO_MATERIAL_GAP_FOUND");
  });

  it("a correct ratio permission (UnlimitedCapacity gated by a ratio) produces no material finding", async () => {
    const text = "The Company may pay dividends so long as the Leverage Ratio does not exceed 4.00 to 1.00.";
    const clean = rule({ capacityExpression: { kind: "UNLIMITED_CAPACITY", type: "CAPACITY", gatedBy: { exprId: "e", kind: "COMPARE", type: "BOOLEAN", left: metricRef("Leverage Ratio"), operator: "LTE", right: ratio(4.0) } } });
    const result = await verifyDeterministicOnly(text, clean);
    expect(result.status).toBe("VERIFIED_NO_MATERIAL_GAP_FOUND");
  });

  it("multiple independent baskets, all correctly represented, produce no material finding", async () => {
    const text = "The Company may incur (a) Indebtedness not to exceed $4,000,000 and (b) separately, Indebtedness not to exceed $6,000,000.";
    const rules = [rule({ capacityExpression: money(4_000_000) }), rule({ capacityExpression: money(6_000_000) })];
    const input: VerificationInput = { compilerInput: testCompilerInput({ operativeSourceText: text }), compilationResult: compilationResult({ rules }) };
    const result = await verifyCompiledCandidate(input, { skipSemanticReview: true });
    expect(result.findings.filter((f) => f.severity === "MATERIAL")).toHaveLength(0);
  });

  it("an honest PARTIAL/UNSUPPORTED representation is not itself penalized as a defect", async () => {
    const text = "...as further described in the side letter dated as of the Closing Date, which is not attached hereto.";
    const honest = rule({ sufficiency: "MISSING_CONTEXT", capacityExpression: { exprId: "e", kind: "UNSUPPORTED", type: null, sourceEvidence: "x", semanticDescription: "side letter not provided", reason: "y", requiredReview: true } });
    const result = await verifyDeterministicOnly(text, honest);
    expect(result.findings.filter((f) => f.severity === "MATERIAL")).toHaveLength(0);
  });

  it("a clean case with correct action/scope/provenance produces no finding even when Layer 2 is force-invoked and reports nothing", async () => {
    const text = "The Borrower may incur Indebtedness not to exceed $2,000,000.";
    const clean = rule({ action: "INCUR_DEBT", entityScope: ["BORROWER"], capacityExpression: money(2_000_000), provenance: { documentId: "d", sourceNodeKey: null, sourceCitation: "§9.01", excerpt: text } });
    const input: VerificationInput = { compilerInput: testCompilerInput({ operativeSourceText: text }), compilationResult: compilationResult({ rules: [clean] }) };
    const result = await verifyCompiledCandidate(input, { forceSemanticReview: true, reviewCaller: fakeCaller({ findings: [], overallNotes: ["representation is faithful"] }) });
    expect(result.status).toBe("VERIFIED_NO_MATERIAL_GAP_FOUND");
  });
});
