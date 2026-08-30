/**
 * Phase 3F.1.6.RX-FINAL Terminal Closure - Part B, INDEPENDENT RECERTIFICATION
 * of FINDING-5 (BLOCKER-9's condition-omission defect class, third
 * recurrence). Originally written by an INDEPENDENT auditor to try to
 * FALSIFY the claim in docs/phase-3f1-6-rx-final-terminal-closure/
 * 06-condition-verification-architecture.json that condition-suspicion.ts's
 * slot-grammar frames "generalize to drafting variants none of them
 * individually enumerate" - see docs/phase-3f1-6-rx-final-terminal-closure/
 * 17-part-b-finding5-recertification.json for that auditor's full findings
 * (disposition: STILL_OPEN), which this file's original 14 failing
 * assertions reproduced with real running code.
 *
 * =============================================================================
 * UPDATED - Phase 3F.1-terminal Architecture Decision, Part A
 * =============================================================================
 * The finding above is now addressed architecturally, NOT by adding a 10th
 * regex category or more connective words (see condition-suspicion.ts's own
 * updated header and condition-suspicion-classifier.ts). This file is
 * updated in place (keeping its own construction set and run history,
 * exactly as this phase's own established "update, don't delete-and-
 * recreate" recertification convention) to assert the NEW, fixed contract
 * rather than delete the historical evidence:
 *
 *  - The ADVERSARIAL RECALL block below is now an EXPLICIT, disclosed,
 *    ACCEPTED non-goal: the deterministic layer alone (buildSourceInventory)
 *    is not expected to catch these constructions, and the architecture
 *    decision deliberately does not try to make it - see condition-
 *    suspicion.ts's own updated header for why one more regex/word-list
 *    iteration was rejected as the fix. One case ("circumstance") DID get a
 *    genuine one-word deterministic fix, since it was a disclosed doc/code
 *    mismatch (the regex was missing a word its own comment already
 *    promised), not a new lexical-enumeration expansion.
 *  - The ADVERSARIAL ROUTING block (and the 'insofar as' case) now assert
 *    the actual fix: semanticReviewInvoked flips to true, and the
 *    source-only condition-suspicion classifier was genuinely INVOKED
 *    (never silently skipped) for every one of these constructions - the
 *    exact "zero scrutiny from either layer" failure signature this file
 *    was written to catch no longer reproduces. See this file's own
 *    updated comments on why `status` itself is NOT asserted in this
 *    environment (no AI_GATEWAY_API_KEY/ANTHROPIC_API_KEY here - see this
 *    phase's own docs/phase-3f1-terminal-architecture-decision/
 *    06-condition-suspicion-architecture.json for the full, honest
 *    real-model-validation disclosure).
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

describe("FINDING-5 independent recertification - ADVERSARIAL RECALL (fresh legal drafting forms, disjoint from every prior matrix) - DETERMINISTIC LAYER ALONE, disclosed accepted non-goal", () => {
  // Phase 3F.1-terminal Architecture Decision, Part A: the deterministic
  // regex layer is NOT expected to catch these on its own - that is exactly
  // the finding this file documents, and the mandated fix is deliberately
  // NOT "enumerate these five phrasings too." The real fix (the ROUTING
  // block below) is a second, independent, semantic gate. Asserting
  // `false` here, with this comment, keeps the historical finding visible
  // and honest rather than silently deleting it.
  for (const c of ADVERSARIAL_CASES) {
    it(`buildSourceInventory (deterministic layer ALONE) still does not raise a structural signal for: ${c.name} - expected and accepted; see the ROUTING block below for the actual fix`, () => {
      expect(hasConditionSignal(c.text)).toBe(false);
    });
  }
});

describe("FINDING-5 independent recertification - ADVERSARIAL ROUTING (real default production routing must never reach a false clean pass with ZERO scrutiny when the condition is silently dropped)", () => {
  for (const c of ADVERSARIAL_CASES) {
    it(`REAL DEFAULT PRODUCTION ROUTING (verifyCompiledCandidate, no test overrides) invokes independent review rather than silently skipping it for: ${c.name}`, async () => {
      const mutated = rule({ capacityExpression: money(c.amount), conditions: [], exceptions: [] });
      const result = await verifyDefaultRouting(c.text, mutated);
      // The BLOCKER-9 failure signature this file exists to catch is
      // "semanticReviewInvoked === false" (zero scrutiny from either
      // layer) - that no longer reproduces for any of these constructions:
      // the deterministic layer finds nothing (confirmed above), but the
      // source-only condition-suspicion classifier is now genuinely
      // consulted as the required second gate before any skip is allowed.
      expect(result.semanticReviewInvoked).toBe(true);
      expect(result.semanticReviewSkippedReason).toBeNull();
      // The classifier must have actually been INVOKED for this candidate
      // (never left null the way it would be if deterministic evidence, or
      // an explicit force/skip option, had decided the outcome without it).
      expect(result.conditionSuspicion).not.toBeNull();
      // NOT asserted here: `result.status`. This environment has neither
      // AI_GATEWAY_API_KEY nor ANTHROPIC_API_KEY, so both the classifier
      // and the Layer 2 adversarial reviewer fall back to
      // llm-caller.ts's SyntheticStageCaller - a real semantic judgment
      // that this dropped condition is actually MATERIAL cannot be
      // produced without a real model call. What IS proven here, with no
      // mocking of the routing decision itself, is the actual defect this
      // finding is about: independent review is reached, not silently
      // bypassed. Real-model confirmation that Layer 2 goes on to report a
      // MISSING_CONDITION finding for these exact constructions is
      // explicitly disclosed as unvalidated in this environment - see
      // docs/phase-3f1-terminal-architecture-decision/
      // 06-condition-suspicion-architecture.json's own honest
      // self-assessment - and is Part B recertification's job with real
      // credentials.
    });
  }
});

describe("FINDING-5 independent recertification - CONDITION FORM DETECTED ONLY VIA COINCIDENTAL NUMERIC RECONCILIATION, NOT REAL CONDITIONAL-PHRASE RECALL", () => {
  it("'insofar as' (a plain synonym of 'to the extent that' / 'provided that') produces NO CONDITIONAL_PHRASE/EXCEPTION_MARKER/PROVISO_MARKER signal at all (disclosed, accepted deterministic-layer non-goal) - but real default routing still reaches independent review via the second, semantic gate, never a false clean pass with zero scrutiny", async () => {
    const text = "Insofar as the Consolidated Net Leverage Ratio remains below 3.50 to 1.00, the Company may declare dividends not to exceed $2,250,000.";
    expect(hasConditionSignal(text)).toBe(false);

    // Demonstrate the coincidence directly: strip the embedded ratio figure so nothing
    // numeric is left to accidentally save the candidate, and confirm the deterministic
    // layer alone still finds nothing once the coincidental numeric crutch is removed.
    const noRatioText = "Insofar as the Company remains in compliance with its financial covenants, the Company may declare dividends not to exceed $2,250,000.";
    expect(hasConditionSignal(noRatioText)).toBe(false);
    const mutated = rule({ capacityExpression: money(2_250_000), conditions: [], exceptions: [] });
    const result = await verifyDefaultRouting(noRatioText, mutated);
    expect(result.semanticReviewInvoked).toBe(true);
    expect(result.semanticReviewSkippedReason).toBeNull();
    expect(result.conditionSuspicion).not.toBeNull();
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
