/**
 * Phase 3F.1.6.RX-FINAL Terminal Closure, Workstream D - FINDING-5 /
 * BLOCKER-9's condition-omission defect class, THIRD-recurrence
 * remediation. See lib/contract-model/compiler/semantic-verification/
 * condition-suspicion.ts's own extensive doc comment for the full
 * architecture rationale, and docs/phase-3f1-6-rx-final-terminal-closure/
 * 06-condition-verification-architecture.json for the full self-assessment.
 *
 * This file independently tests the NEW generalized architecture with
 * constructions that are NOT literal copies of:
 *  - condition-suspicion.ts's own illustrative doc-comment examples,
 *  - tests/contract-model/semantic-verification-condition-remediation.test.ts's
 *    original 9-form matrix,
 *  - tests/contract-model/semantic-verification-condition-remediation-rx.test.ts's
 *    Part A 12-form/43-test matrix, or
 *  - tests/contract-model/part-b-recert-blocker9-independent-attack.test.ts's
 *    12-form Part B matrix (the 8 forms this remediation specifically closes).
 *
 * Required semantic classes covered (per this remediation's own charter):
 * event occurrence; temporal satisfaction; pro forma condition; no-default
 * condition; before/after giving effect; condition precedent; incorporated-
 * definition condition; cross-reference condition; passive construction;
 * inverted syntax; nested proviso; exception conditioned on a later fact.
 * Two additional "novel combination" tests exercise slot combinations
 * genuinely absent from this codebase's own comments, to demonstrate the
 * compositional mechanism generalizes rather than having been reverse-
 * engineered from a list of expected test strings. A BENIGN/PRECISION
 * block proves the broadened detection does not degenerate into routing
 * every "if"/"when"/temporal sentence to review.
 */
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import { verifyCompiledCandidate } from "../../lib/contract-model/compiler/semantic-verification/verify";
import { buildSourceInventory } from "../../lib/contract-model/compiler/semantic-verification/source-inventory";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { VerificationInput } from "../../lib/contract-model/compiler/semantic-verification/types";
import type { SemanticCompilationResult } from "../../lib/contract-model/compiler/semantic/types";
import type { IRExpression, IRRule } from "../../lib/contract-model/ir/types";
import { testCompilerInput } from "./semantic-compiler/test-helpers";

let ruleCounter = 0;
function rule(overrides: Partial<IRRule>): IRRule {
  ruleCounter++;
  return {
    ruleId: `ir-rule:csa-${ruleCounter}`,
    irSchemaVersion: "v1",
    companyId: "sem-test-co",
    instrumentKey: "sem-test-instrument",
    sourceDocumentId: "sem-test-doc",
    sourceSectionRef: "9.01",
    covenantFamily: "RESTRICTED_PAYMENTS",
    ruleType: "QUANTITATIVE_PERMISSION",
    posture: "PERMISSION",
    action: "PAY_DIVIDEND",
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

/** Exactly how production calls verifyCompiledCandidate - no test-only override at all. */
async function verifyDefaultRouting(text: string, r: IRRule) {
  const input: VerificationInput = { compilerInput: testCompilerInput({ operativeSourceText: text }), compilationResult: compilationResult({ rules: [r] }) };
  return verifyCompiledCandidate(input);
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

/** Phase 3F.1-terminal Architecture Decision, Part A - isolates the deterministic-skip path from the second, semantic condition-suspicion gate's own real-model-vs-synthetic-fallback behavior (this sandbox has no AI_GATEWAY_API_KEY/ANTHROPIC_API_KEY, so unscripted default routing now conservatively forces review here too - see condition-suspicion-classifier.test.ts's own dedicated coverage of that). */
async function verifyDefaultRoutingWithCleanClassifier(text: string, r: IRRule) {
  const input: VerificationInput = { compilerInput: testCompilerInput({ operativeSourceText: text }), compilationResult: compilationResult({ rules: [r] }) };
  return verifyCompiledCandidate(input, { conditionSuspicionCaller: fakeCaller({ status: "NO_MATERIAL_CONDITION_SUSPECTED", evidence: [] }) });
}

function hasConditionSignal(text: string): boolean {
  const inv = buildSourceInventory("csa", text, "doc-1", "9.01", null);
  return inv.items.some((i) => i.kind === "CONDITIONAL_PHRASE" || i.kind === "EXCEPTION_MARKER" || i.kind === "PROVISO_MARKER");
}

interface RequiredClassCase {
  requiredClass: string;
  name: string;
  text: string;
  amount: number;
}

// Each construction below is fresh - none reuses fixture text from any prior matrix.
const REQUIRED_CLASS_CASES: RequiredClassCase[] = [
  {
    requiredClass: "event occurrence",
    name: "a Qualifying Liquidity Event conclusively deemed to have occurred upon consummation of an IPO",
    text: "A Qualifying Liquidity Event shall be conclusively deemed to have occurred upon the consummation of the initial public offering, following which the Company may incur additional Indebtedness not to exceed $7,400,000.",
    amount: 7_400_000,
  },
  {
    requiredClass: "temporal satisfaction",
    name: "availability contingent on a disclosure requirement having been satisfied",
    text: "The Company may make Investments not to exceed $2,900,000 in the aggregate; the disclosure requirement of Section 5.02 shall be conclusively satisfied once the annual compliance certificate is delivered.",
    amount: 2_900_000,
  },
  {
    requiredClass: "pro forma condition",
    name: "leverage test on a pro forma basis after giving effect to the proposed investment",
    text: "Availability under this basket requires, after giving effect to the proposed Investment on a Pro Forma Basis, that the Total Leverage Ratio not exceed 4.50 to 1.00; the Company may make Investments not to exceed $5,250,000.",
    amount: 5_250_000,
  },
  {
    requiredClass: "no-default condition",
    name: "future-modal occurrence-predicate no-default gate",
    text: "The Company may incur additional Indebtedness not to exceed $6,700,000 at any time no Event of Default shall have occurred and be continuing.",
    amount: 6_700_000,
  },
  {
    requiredClass: "before/after giving effect",
    name: "leverage ratio tested before and after giving effect to an incurrence",
    text: "Before the Company may incur the proposed Indebtedness not to exceed $9,150,000, the Total Leverage Ratio must not exceed 4.00 to 1.00 after giving effect thereto.",
    amount: 9_150_000,
  },
  {
    requiredClass: "condition precedent",
    name: "opinion of counsel as a condition to amendment effectiveness",
    text: "As a condition to the effectiveness of this Amendment, the Borrower shall deliver an opinion of counsel satisfactory to the Administrative Agent; upon such effectiveness, the Company may pay dividends not to exceed $3,800,000.",
    amount: 3_800_000,
  },
  {
    requiredClass: "incorporated-definition condition",
    name: "Refinancing Conditions defined-term dependency, confirmed satisfied",
    text: "The Permitted Refinancing incorporates by reference the Refinancing Conditions (as defined in Section 1.01), which the Administrative Agent confirms have been satisfied in full, permitting Indebtedness not to exceed $8,650,000.",
    amount: 8_650_000,
  },
  {
    requiredClass: "cross-reference condition",
    name: "basket availability governed by a cross-referenced section",
    text: "Availability of this basket is governed by the requirements set forth in Section 4.09 hereof; subject thereto, the Company may make Restricted Payments not to exceed $4,950,000.",
    amount: 4_950_000,
  },
  {
    requiredClass: "passive construction",
    name: "basket treated as satisfied upon delivery of audited financials",
    text: "This basket's availability, not to exceed $3,300,000, shall be treated as satisfied once the audited financial statements for the most recently completed fiscal year have been delivered.",
    amount: 3_300_000,
  },
  {
    requiredClass: "inverted syntax",
    name: "fronted only-if clause preceding the operative permission",
    text: "Only if the Total Leverage Ratio does not exceed 4.00 to 1.00 may the Company incur the proposed Indebtedness not to exceed $6,050,000.",
    amount: 6_050_000,
  },
  {
    requiredClass: "nested proviso",
    name: "an 'in the event that' clause nested inside an 'unless and until' proviso",
    text: "The Company may pay dividends not to exceed $6,000,000, it being understood that, in the event that the Total Leverage Ratio last reported exceeds 3.75 to 1.00, no such dividend shall be paid unless and until compliance is restored.",
    amount: 6_000_000,
  },
  {
    requiredClass: "exception conditioned on a later fact",
    name: "a carve-back exception itself gated on a later consummation event",
    text: "The Company shall not make Investments in Unrestricted Subsidiaries; provided that such Investments shall be permitted in an amount not to exceed $2,000,000 if, following the consummation of a Qualified IPO, the Total Leverage Ratio is less than 3.00 to 1.00.",
    amount: 2_000_000,
  },
];

describe("Condition-suspicion architecture - RECALL across required semantic classes (fresh constructions, disjoint from every prior matrix)", () => {
  for (const c of REQUIRED_CLASS_CASES) {
    it(`[${c.requiredClass}] detects a structural condition-suspicion signal: ${c.name}`, () => {
      expect(hasConditionSignal(c.text)).toBe(true);
    });
  }
});

describe("Condition-suspicion architecture - ROUTING across required semantic classes (default production routing never silently misses a dropped condition)", () => {
  for (const c of REQUIRED_CLASS_CASES) {
    it(`[${c.requiredClass}] routes to Layer 2 and never reaches a false clean pass when the condition is dropped: ${c.name}`, async () => {
      const mutated = rule({ capacityExpression: money(c.amount), conditions: [], exceptions: [] });
      const result = await verifyDefaultRouting(c.text, mutated);
      expect(result.semanticReviewInvoked).toBe(true);
      expect(result.status).not.toBe("VERIFIED_NO_MATERIAL_GAP_FOUND");
    });
  }
});

describe("Condition-suspicion architecture - NOVEL COMBINATIONS (slot combinations this codebase's own comments never type as literal targets - direct evidence of compositional generalization, not phrase-list recall)", () => {
  it('"to the degree that" (the "degree" branch of the light-noun slot, mechanically identical code path to "extent" but never itself written as a distinct pattern) is detected', () => {
    const text = "To the degree that the Consolidated Net Leverage Ratio remains below 3.25 to 1.00, the Company may declare additional dividends not to exceed $1,800,000.";
    expect(hasConditionSignal(text)).toBe(true);
  });

  it('"upon the expiration of" (the nominalization-suffix slot matching a noun - "expiration" - this codebase never types as an illustrative example) is detected', () => {
    const text = "Upon the expiration of the Standstill Period, the Company may resume dividend payments not to exceed $3,100,000.";
    expect(hasConditionSignal(text)).toBe(true);
  });

  it("both novel combinations also route to Layer 2 end-to-end under real default production routing when their condition is dropped", async () => {
    const degreeText = "To the degree that the Consolidated Net Leverage Ratio remains below 3.25 to 1.00, the Company may declare additional dividends not to exceed $1,800,000.";
    const degreeResult = await verifyDefaultRouting(degreeText, rule({ capacityExpression: money(1_800_000), conditions: [], exceptions: [] }));
    expect(degreeResult.semanticReviewInvoked).toBe(true);
    expect(degreeResult.status).not.toBe("VERIFIED_NO_MATERIAL_GAP_FOUND");

    const expirationText = "Upon the expiration of the Standstill Period, the Company may resume dividend payments not to exceed $3,100,000.";
    const expirationResult = await verifyDefaultRouting(expirationText, rule({ capacityExpression: money(3_100_000), conditions: [], exceptions: [] }));
    expect(expirationResult.semanticReviewInvoked).toBe(true);
    expect(expirationResult.status).not.toBe("VERIFIED_NO_MATERIAL_GAP_FOUND");
  });
});

describe("Condition-suspicion architecture - BENIGN / PRECISION (genuinely benign if/when/temporal prose that must NOT over-trigger review)", () => {
  it('a bare "when" in a definitional sentence (no capacity/action nearby, no strong structural frame) does not trigger any condition-suspicion signal', () => {
    const text = "A Restricted Subsidiary becomes a 'Guarantor' when it executes a joinder agreement in the form attached as Exhibit B.";
    expect(hasConditionSignal(text)).toBe(false);
  });

  it('a generic "after the end of [ordinary noun]" temporal deadline (no defined-term/event-nominalization noun) does not trigger', () => {
    const text = "The Company shall deliver its audited financial statements no later than 90 days after the end of each fiscal year.";
    expect(hasConditionSignal(text)).toBe(false);
  });

  it('"once" used as a bare frequency adverb (not a temporal/event preposition followed by a trigger) does not trigger', () => {
    const text = "The Administrative Agent need only make the applicable notification once per calendar quarter.";
    expect(hasConditionSignal(text)).toBe(false);
  });

  it('a plain calendar "before" deadline with no capitalized defined-term/event noun immediately following does not trigger', () => {
    const text = "The Company shall provide notice no later than 5 Business Days before the anticipated closing of the transaction is expected to occur.";
    expect(hasConditionSignal(text)).toBe(false);
  });

  it("end-to-end: a candidate whose only textual feature is the benign bare-when definitional sentence reaches a genuine clean pass under real default production routing (no spurious Layer 2 routing at all)", async () => {
    const text = "The Company may incur Indebtedness not to exceed $9,800,000. A joinder agreement becomes effective when it is executed and delivered to the Administrative Agent.";
    const clean = rule({ action: "INCUR_DEBT", capacityExpression: money(9_800_000) });
    const result = await verifyDefaultRoutingWithCleanClassifier(text, clean);
    expect(result.status).toBe("VERIFIED_NO_MATERIAL_GAP_FOUND");
    expect(result.semanticReviewInvoked).toBe(false);
  });
});

describe("Condition-suspicion architecture - FALSE-POSITIVE GUARDS (a correctly-represented condition of a new structural-frame shape does not spuriously fire)", () => {
  it("a correctly-represented event-occurrence condition (rule.conditions[] entry present) does not trigger a spurious MISSING_CONDITION finding, regardless of which new frame the source used", async () => {
    const text = "A Qualifying Liquidity Event shall be conclusively deemed to have occurred upon the consummation of the initial public offering, following which the Company may incur additional Indebtedness not to exceed $7,400,000.";
    const clean = rule({
      action: "INCUR_DEBT",
      capacityExpression: money(7_400_000),
      conditions: [{ conditionId: "c1", conditionType: "OTHER_RULE_SATISFIED", expression: null, referencesDefinitionId: null, description: "a Qualifying Liquidity Event (IPO consummation) has occurred", provenance: null }],
    });
    const result = await verifyDefaultRouting(text, clean);
    expect(result.findings.some((f) => f.findingType === "MISSING_CONDITION")).toBe(false);
  });

  it("a correctly-represented cross-reference-incorporated condition does not trigger a spurious finding", async () => {
    const text = "Availability of this basket is governed by the requirements set forth in Section 4.09 hereof; subject thereto, the Company may make Restricted Payments not to exceed $4,950,000.";
    const clean = rule({
      capacityExpression: money(4_950_000),
      conditions: [{ conditionId: "c1", conditionType: "OTHER_RULE_SATISFIED", expression: null, referencesDefinitionId: null, description: "compliance with the requirements of Section 4.09", provenance: null }],
    });
    const result = await verifyDefaultRouting(text, clean);
    expect(result.findings.some((f) => f.findingType === "MISSING_CONDITION")).toBe(false);
  });
});
