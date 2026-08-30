/**
 * Phase 3F.1.6.RX-FINAL Terminal Closure - Part B, INDEPENDENT RECERTIFICATION
 * of FINDING-5 (BLOCKER-9's condition-omission defect class, third
 * recurrence). This file is written by an INDEPENDENT auditor, separately
 * from Workstream D's own remediation and Workstream D's own test file
 * (tests/contract-model/condition-suspicion-architecture.test.ts). Its sole
 * purpose is to try to FALSIFY the claim in
 * docs/phase-3f1-6-rx-final-terminal-closure/06-condition-verification-
 * architecture.json that condition-suspicion.ts's slot-grammar frames
 * "generalize to drafting variants none of them individually enumerate"
 * rather than being curve-fit to the specific forms known to that
 * remediation's own development process.
 *
 * Every construction below is DELIBERATELY DISJOINT from:
 *  - condition-suspicion.ts's own doc-comment illustrative examples,
 *  - tests/contract-model/condition-suspicion-architecture.test.ts's 12
 *    required-class cases + 2 "novel combination" cases,
 *  - tests/contract-model/part-b-recert-blocker9-independent-attack.test.ts's
 *    12-form matrix,
 *  - tests/contract-model/semantic-verification-condition-remediation.test.ts
 *    and its Part A -rx.test.ts sibling's combined matrices.
 *
 * Method: pick ordinary, realistic credit-agreement / commercial-contract
 * conditional constructions that a real drafter would plausibly write, using
 * connectives/prepositions/light-nouns adjacent to (but outside) the closed
 * word-lists condition-suspicion.ts's own frames enumerate, then check BOTH
 * (a) the deterministic source-side suspicion signal (buildSourceInventory)
 * and (b) real, unmodified default production routing
 * (verifyCompiledCandidate with no test overrides) for the exact BLOCKER-9
 * failure signature: a rule whose real condition is entirely dropped
 * (conditions: []) nonetheless reaching VERIFIED_NO_MATERIAL_GAP_FOUND with
 * semanticReviewInvoked === false - i.e., a real qualifying condition
 * silently vanishing with ZERO scrutiny from either layer.
 *
 * These assertions state the CORRECT, safe behavior (a real condition must
 * never silently reach a clean pass) - they are written to FAIL against the
 * current code wherever the architecture has not actually generalized. A
 * failing assertion here is the finding, not a bug in the test.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verifyCompiledCandidate } from "../../lib/contract-model/compiler/semantic-verification/verify";
import { buildSourceInventory } from "../../lib/contract-model/compiler/semantic-verification/source-inventory";
import type { VerificationInput } from "../../lib/contract-model/compiler/semantic-verification/types";
import type { SemanticCompilationResult } from "../../lib/contract-model/compiler/semantic/types";
import type { IRExpression, IRRule } from "../../lib/contract-model/ir/types";
import { testCompilerInput } from "./semantic-compiler/test-helpers";

let ruleCounter = 0;
function rule(overrides: Partial<IRRule>): IRRule {
  ruleCounter++;
  return {
    ruleId: `ir-rule:f5-${ruleCounter}`,
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

function hasConditionSignal(text: string): boolean {
  const inv = buildSourceInventory("f5-indep", text, "doc-1", "9.01", null);
  return inv.items.some((i) => i.kind === "CONDITIONAL_PHRASE" || i.kind === "EXCEPTION_MARKER" || i.kind === "PROVISO_MARKER");
}

interface AdversarialCase {
  name: string;
  rationale: string;
  text: string;
  amount: number;
}

// Every construction below is fresh, realistic legal drafting - none reuses
// fixture text from any prior matrix in this codebase.
const ADVERSARIAL_CASES: AdversarialCase[] = [
  {
    name: "subjunctive inversion: 'Should a Change of Control occur, ...'",
    rationale:
      "The subjunctive-inversion conditional ('Should X occur, ...' as a grammaticalized inversion of 'If X occurs, ...') is one of the most common conditional forms in English legal drafting, alongside plain 'if'. It is caught by NONE of the 9 categories: it is not a nominalization (category 3, needs a suffix noun), not a defined-term trigger preposition (category 4, 'Should' is not upon/following/after/before/once), not an occurrence-predicate (category 5, which requires a perfect-aspect auxiliary like has/have before 'occurred', not the bare subjunctive base form 'occur'), and not a modal-satisfaction passive (category 6, 'should' is absent from its modal list).",
    text: "Should a Change of Control occur, the Company may incur additional Indebtedness not to exceed $5,600,000.",
    amount: 5_600_000,
  },
  {
    name: "subjunctive inversion with continuing no-default gate: 'Should any Event of Default occur and be continuing, ...'",
    rationale:
      "Same subjunctive-inversion gap as above, applied to the canonical no-default gate. Category 5's OCCURRENCE_PREDICATE frame explicitly claims (per its own doc comment) to generalize the old hand-enumerated 'no (Event of) Default' pattern to any subject - but only for the perfect-aspect form ('has occurred'), not the equally common subjunctive form ('should ... occur').",
    text: "Should any Event of Default occur and be continuing, the Company shall not incur Indebtedness in excess of $1,900,000.",
    amount: 1_900_000,
  },
  {
    name: "light-noun 'circumstance': 'In circumstances where the Borrower has failed to deliver ...'",
    rationale:
      "The design doc's own honestSelfAssessment repeatedly describes the NOMINAL_CONDITIONAL_CONNECTIVE light-noun slot as 'event/case/circumstance/extent/degree' and condition-suspicion.ts's own doc comment (category 2) likewise lists 'circumstance' as one of the closed light nouns the frame covers. The ACTUAL regex alternation (NOMINAL_CONDITIONAL_CONNECTIVE_RE) is `in\\s+the\\s+(?:event|case)\\s+(?:of|that|where)|...` - it contains only 'event' and 'case', never 'circumstance'. This is a direct mismatch between the architecture document's own claimed word list and the shipped code's actual word list, not merely an unmodeled synonym.",
    text: "In circumstances where the Borrower has failed to deliver the required compliance certificate, the Company may nonetheless incur Indebtedness not to exceed $3,450,000.",
    amount: 3_450_000,
  },
  {
    name: "trigger preposition synonym: 'Subsequent to the occurrence of a Change of Control, ...'",
    rationale:
      "EVENT_TRIGGER_NOMINALIZATION's trigger-preposition slot is the closed list {upon|following|after|before|once}. 'Subsequent to' is an entirely ordinary drafting synonym for 'following'/'after' ('subsequent to the Closing Date', 'subsequent to the occurrence of ...') that a real drafter reaches for interchangeably, yet it is outside the enumerated preposition set and the whole frame silently fails to fire.",
    text: "Subsequent to the occurrence of a Change of Control, the Company may incur additional Indebtedness not to exceed $4,750,000.",
    amount: 4_750_000,
  },
  {
    name: "cross-reference connective synonym: 'as referenced in Schedule 2.01 hereto'",
    rationale:
      "CROSS_REFERENCE_INCORPORATION's connective slot is the closed list {in accordance with|pursuant to|as set forth on/in/under|set forth on/in/under}. 'As referenced in [Schedule/Section]' is an equally ordinary cross-reference connective in commercial drafting that shares none of those exact tokens, so the frame - despite genuinely generalizing over the citation IDENTIFIER - still fails on this common connective synonym.",
    text: "The Company may make Restricted Payments not to exceed $6,500,000 as referenced in Schedule 2.01 hereto.",
    amount: 6_500_000,
  },
  {
    name: "trigger preposition synonym: 'On the occurrence of an Event of Default, ...' (bare 'on' vs. 'upon')",
    rationale:
      "EVENT_TRIGGER_NOMINALIZATION's preposition slot includes 'upon' but not its plainer synonym 'on', which is at least as common in UK/cross-border-influenced drafting ('on an Event of Default', 'on default'). The suffix-class generalization this category is praised for in the design doc's own honestSelfAssessment does not help here because the failure is entirely in the closed PREPOSITION slot, not the (genuinely open) suffix-noun slot.",
    text: "On the occurrence of an Event of Default, the Company shall not incur Indebtedness in excess of $7,650,000.",
    amount: 7_650_000,
  },
];

describe("FINDING-5 independent recertification - ADVERSARIAL RECALL (fresh legal drafting forms, disjoint from every prior matrix)", () => {
  for (const c of ADVERSARIAL_CASES) {
    it(`buildSourceInventory raises a structural condition-suspicion signal for: ${c.name}`, () => {
      expect(hasConditionSignal(c.text)).toBe(true);
    });
  }
});

describe("FINDING-5 independent recertification - ADVERSARIAL ROUTING (real default production routing must never reach a false clean pass when the condition is silently dropped)", () => {
  for (const c of ADVERSARIAL_CASES) {
    it(`REAL DEFAULT PRODUCTION ROUTING (verifyCompiledCandidate, no test overrides) does not reach VERIFIED_NO_MATERIAL_GAP_FOUND with zero scrutiny for: ${c.name}`, async () => {
      const mutated = rule({ capacityExpression: money(c.amount), conditions: [], exceptions: [] });
      const result = await verifyDefaultRouting(c.text, mutated);
      expect(result.semanticReviewInvoked).toBe(true);
      expect(result.status).not.toBe("VERIFIED_NO_MATERIAL_GAP_FOUND");
    });
  }
});

describe("FINDING-5 independent recertification - CONDITION FORM DETECTED ONLY VIA COINCIDENTAL NUMERIC RECONCILIATION, NOT REAL CONDITIONAL-PHRASE RECALL", () => {
  it("'insofar as' (a plain synonym of 'to the extent that' / 'provided that') produces NO CONDITIONAL_PHRASE/EXCEPTION_MARKER/PROVISO_MARKER signal at all - any routing to review is happening only because this particular sentence also happens to embed a ratio figure, the exact 'coincidental capture, not real recall' failure mode this finding's own prior evidence already disclosed for 'to the extent that' before this remediation", async () => {
    const text = "Insofar as the Consolidated Net Leverage Ratio remains below 3.50 to 1.00, the Company may declare dividends not to exceed $2,250,000.";
    expect(hasConditionSignal(text)).toBe(false);

    // Demonstrate the coincidence directly: strip the embedded ratio figure so nothing
    // numeric is left to accidentally save the candidate, and confirm the false clean
    // pass this construction reduces to once the coincidental numeric crutch is removed.
    const noRatioText = "Insofar as the Company remains in compliance with its financial covenants, the Company may declare dividends not to exceed $2,250,000.";
    expect(hasConditionSignal(noRatioText)).toBe(false);
    const mutated = rule({ capacityExpression: money(2_250_000), conditions: [], exceptions: [] });
    const result = await verifyDefaultRouting(noRatioText, mutated);
    expect(result.semanticReviewInvoked).toBe(true);
    expect(result.status).not.toBe("VERIFIED_NO_MATERIAL_GAP_FOUND");
  });
});

describe("FINDING-5 independent recertification - CODE-LEVEL VERIFICATION of the architecture document's own self-assessment (trace the shipped regex, don't trust the doc's prose claim)", () => {
  const source = readFileSync(
    join(__dirname, "../../lib/contract-model/compiler/semantic-verification/condition-suspicion.ts"),
    "utf8"
  );

  it("the design doc (06-condition-verification-architecture.json) and the module's own doc comment both claim the NOMINAL_CONDITIONAL_CONNECTIVE light-noun slot includes 'circumstance' - the actual NOMINAL_CONDITIONAL_CONNECTIVE_RE source must therefore contain the literal token 'circumstance'", () => {
    const reLineMatch = source.match(/const NOMINAL_CONDITIONAL_CONNECTIVE_RE =\s*\n?\s*(\/.*?\/gi);/s);
    expect(reLineMatch).toBeTruthy();
    const reSource = reLineMatch![1];
    expect(reSource).toMatch(/circumstance/i);
  });
});
