/**
 * Phase 3F.1.6.R Workstream D - BLOCKER-9 remediation test matrix.
 *
 * docs/phase-3f1-6-final-foundation-certification/15-independent-verifier-
 * certification.json (finding F17-1) found that an omitted MATERIAL
 * qualifying condition on an otherwise fully dollar-reconciled, single-rule
 * candidate reached VERIFIED_NO_MATERIAL_GAP_FOUND under real, unmodified
 * default production routing - neither Layer 1 (deterministic) nor Layer 2
 * (adversarial semantic review) ever examined it, because
 * reconciliation.ts's own aggregate condition/exception signal required
 * >=2 independent source-side markers to fire at all, and
 * shouldInvokeSemanticReview (verify.ts) also skips Layer 2 for a single,
 * fully-reconciled, non-alternating compiled unit with no unresolved
 * signal - so a single dropped condition fell through both gates.
 *
 * This file tests the GENERAL CLASS of qualifying-condition phrasing (not
 * just the certification's own "so long as no Default has occurred and is
 * continuing" example construction) across the adversarial forms named in
 * the remediation task: "provided that", "so long as", "subject to", "no
 * Event of Default", a ratio-threshold condition, a payment condition, a
 * temporal condition, a nested proviso, a condition attached to an
 * exception, and a condition incorporated by cross-reference.
 *
 * For each form this asserts TWO things, matching this module's own layered
 * architecture:
 *  (1) RECALL - source-inventory.ts's buildSourceInventory actually detects
 *      at least one conditional/exception/proviso marker in the text
 *      (Layer 1a - can the condition's textual signal even be seen at all).
 *  (2) ROUTING - when the condition is silently dropped from the compiled
 *      IR (conditions: [], exceptions: []) on an otherwise single,
 *      fully-dollar-reconciled rule (the EXACT shape the certification
 *      named), verifyCompiledCandidate's own DEFAULT PRODUCTION ROUTING
 *      (no skipSemanticReview/forceSemanticReview override - exactly how
 *      production calls it) now (a) invokes Layer 2 (semanticReviewInvoked
 *      === true, giving a real model a chance to independently judge it)
 *      and (b) never reaches a false clean VERIFIED_NO_MATERIAL_GAP_FOUND
 *      pass, regardless of whether a live model is configured in this
 *      environment - matching the certification's own re-definition of
 *      "caught in default production routing" for this exact case.
 *
 * A separate END-TO-END case (scripted Layer 2, matching this codebase's
 * own established "scripted-semantic tier" convention -
 * semantic-verification-fault-injection.test.ts) proves that once Layer 2
 * IS invoked and independently confirms a MATERIAL omission, the
 * orchestration correctly reaches MATERIAL_DISCREPANCY - i.e. the fix is a
 * genuine root-cause fix to routing/detection, not merely "invoke the
 * model and hope," since orchestration already correctly surfaces whatever
 * Layer 2 reports (proven separately in semantic-verification-verify.test.ts).
 *
 * A FALSE-POSITIVE GUARD closes the loop on the second, related bug this
 * remediation also fixed: ir-inventory.ts previously never counted a
 * COMPARE node reached only via capacityExpression.gatedBy (rather than
 * rule.conditions[]) as a represented condition, which - once the >=2
 * threshold above was lowered - would otherwise have turned every
 * correctly-represented ratio-gated UNLIMITED_CAPACITY permission into a
 * spurious AMBIGUOUS signal. That false-positive control is also verified
 * in tests/contract-model/semantic-verification-fault-injection.test.ts's
 * own "FALSE-POSITIVE CONTROLS" describe block (task §28) - re-run here
 * against the FULL production routing path (not skipSemanticReview) as an
 * extra, independent guard for this specific remediation.
 *
 * INDEPENDENCE: nothing in this file (or in the production fix it tests)
 * imports semantic/compile.ts or semantic/caller.ts (enforced separately by
 * semantic-verification-independence.test.ts's static import check); no
 * ground truth/benchmark expectation is consulted by the production code
 * path exercised here - only real source text vs. real compiled IR shape.
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
    ruleId: `ir-rule:cr-${ruleCounter}`,
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

/** Exactly how production calls verifyCompiledCandidate - no test-only override at all. */
async function verifyDefaultRouting(text: string, r: IRRule) {
  const input: VerificationInput = { compilerInput: testCompilerInput({ operativeSourceText: text }), compilationResult: compilationResult({ rules: [r] }) };
  return verifyCompiledCandidate(input);
}

/** Phase 3F.1-terminal Architecture Decision, Part A - see the identically-named/documented helper in semantic-verification-condition-remediation-rx.test.ts: isolates the deterministic-skip path from the second, semantic condition-suspicion gate's own real-model-vs-synthetic-fallback behavior by scripting an explicit, non-synthetic clean classifier answer. */
async function verifyDefaultRoutingWithCleanClassifier(text: string, r: IRRule) {
  const input: VerificationInput = { compilerInput: testCompilerInput({ operativeSourceText: text }), compilationResult: compilationResult({ rules: [r] }) };
  return verifyCompiledCandidate(input, { conditionSuspicionCaller: fakeCaller({ status: "NO_MATERIAL_CONDITION_SUSPECTED", evidence: [] }) });
}

async function verifyWithScriptedSemanticFinding(text: string, r: IRRule, wireFinding: Record<string, unknown>) {
  const input: VerificationInput = { compilerInput: testCompilerInput({ operativeSourceText: text }), compilationResult: compilationResult({ rules: [r] }) };
  const caller = fakeCaller({ findings: [wireFinding], overallNotes: [] });
  return verifyCompiledCandidate(input, { forceSemanticReview: true, reviewCaller: caller });
}

interface ConditionForm {
  name: string;
  text: string;
  amount: number;
  /** Which source-inventory item kind(s) this form's marker is expected to be detected as. */
  expectedKinds: Array<"CONDITIONAL_PHRASE" | "EXCEPTION_MARKER" | "PROVISO_MARKER">;
}

const CONDITION_FORMS: ConditionForm[] = [
  {
    name: '"provided that"',
    text: "The Company may pay dividends up to $4,000,000 in any fiscal year, provided that no Restricted Payment has been made in the preceding 90 days.",
    amount: 4_000_000,
    expectedKinds: ["CONDITIONAL_PHRASE"],
  },
  {
    name: '"so long as"',
    text: "The Company may pay dividends up to $4,500,000 in any fiscal year, so long as no Default has occurred and is continuing at the time of such payment.",
    amount: 4_500_000,
    expectedKinds: ["CONDITIONAL_PHRASE"],
  },
  {
    name: '"subject to" (also covers a condition incorporated by cross-reference)',
    text: "The Company may pay dividends up to $5,500,000 in any fiscal year, subject to compliance with the requirements of Section 9.08 (Payment Conditions).",
    amount: 5_500_000,
    expectedKinds: ["CONDITIONAL_PHRASE"],
  },
  {
    name: '"no Event of Default" stated as its own independent proviso sentence (no "so long as"/"provided that"/"subject to" connective at all)',
    text: "The Company may pay dividends in an amount not to exceed $6,000,000 in any fiscal year. No Event of Default shall have occurred and be continuing immediately before or after giving effect to any such dividend payment.",
    amount: 6_000_000,
    expectedKinds: ["CONDITIONAL_PHRASE"],
  },
  {
    name: "a ratio-threshold condition phrased with a payment amount (combines a ratio gate with a dollar cap)",
    text: "The Company may pay dividends up to $7,000,000 in any fiscal year, so long as the Total Leverage Ratio, calculated on a pro forma basis, does not exceed 3.50 to 1.00.",
    amount: 7_000_000,
    expectedKinds: ["CONDITIONAL_PHRASE"],
  },
  {
    name: "a payment condition (a prior-payment-in-full precondition)",
    text: "The Company may pay dividends up to $3,500,000 in any fiscal year, provided that all interest and fees then due and payable under the Credit Agreement have been paid in full.",
    amount: 3_500_000,
    expectedKinds: ["CONDITIONAL_PHRASE"],
  },
  {
    name: 'a temporal condition ("until such time as")',
    text: "The Company may pay dividends up to $2,500,000 in any fiscal year until such time as the Total Leverage Ratio first exceeds 4.00 to 1.00, at which point this permission terminates.",
    amount: 2_500_000,
    expectedKinds: ["CONDITIONAL_PHRASE"],
  },
  {
    name: "a nested proviso (provided that ... provided, further, that ...)",
    text: "The Company may pay dividends up to $8,000,000 in any fiscal year, provided that no Default has occurred and is continuing; provided, further, that pro forma compliance with the Total Leverage Ratio covenant is demonstrated.",
    amount: 8_000_000,
    expectedKinds: ["CONDITIONAL_PHRASE", "PROVISO_MARKER"],
  },
  {
    name: "a condition attached to an exception (an otherwise-prohibited payment carved back out, itself gated)",
    text: "The Company shall not pay dividends, except that dividends not to exceed $1,200,000 in the aggregate are permitted so long as no Default has occurred and is continuing.",
    amount: 1_200_000,
    expectedKinds: ["EXCEPTION_MARKER", "CONDITIONAL_PHRASE"],
  },
];

describe("Phase 3F.1.6.R BLOCKER-9 remediation - RECALL (Layer 1a source-inventory detects the condition's textual signal)", () => {
  for (const form of CONDITION_FORMS) {
    it(`detects a real source-side marker for: ${form.name}`, () => {
      const inv = buildSourceInventory("cand-1", form.text, "doc-1", "§9.01", null);
      for (const kind of form.expectedKinds) {
        expect(inv.items.some((i) => i.kind === kind)).toBe(true);
      }
    });
  }
});

describe("Phase 3F.1.6.R BLOCKER-9 remediation - ROUTING (default production routing never silently misses a dropped condition of any of these forms)", () => {
  for (const form of CONDITION_FORMS) {
    it(`routes to Layer 2 and never reaches a false clean pass when the condition is dropped: ${form.name}`, async () => {
      // The condition/exception is silently dropped entirely (conditions: [], exceptions: []) while
      // the dollar figure is otherwise perfectly, exactly reconciled - the EXACT shape the
      // certification's own F17-1 finding named (a single, fully-reconciled, non-alternating
      // compiled unit with no unresolved numeric/structural signal), which is precisely the shape
      // that used to make BOTH Layer 1's aggregate signal (>=2 threshold) and verify.ts's
      // shouldInvokeSemanticReview V1 routing silently skip this candidate entirely.
      const mutated = rule({ capacityExpression: money(form.amount), conditions: [], exceptions: [] });
      const result = await verifyDefaultRouting(form.text, mutated);

      // (a) Layer 2 must actually be given a chance to look at this candidate now.
      expect(result.semanticReviewInvoked).toBe(true);
      // (b) never a false clean pass, regardless of whether a live model is configured here.
      expect(result.status).not.toBe("VERIFIED_NO_MATERIAL_GAP_FOUND");
    });
  }
});

describe("Phase 3F.1.6.R BLOCKER-9 remediation - END-TO-END (once Layer 2 is invoked and independently confirms the omission, orchestration reaches MATERIAL_DISCREPANCY)", () => {
  for (const form of CONDITION_FORMS) {
    it(`reaches MATERIAL_DISCREPANCY once a real adversarial review confirms the omission: ${form.name}`, async () => {
      const mutated = rule({ capacityExpression: money(form.amount), conditions: [], exceptions: [] });
      const result = await verifyWithScriptedSemanticFinding(form.text, mutated, {
        findingType: "MISSING_CONDITION",
        severity: "MATERIAL",
        ruleOrDefinitionId: mutated.ruleId,
        irPath: `rules[0].conditions`,
        sourceEvidence: form.text,
        sourceCitation: "9.01",
        proposedIrEvidence: "conditions=[] exceptions=[]",
        reasoning: `source states a real qualifying condition (${form.name}) that the proposed IR never represents at all`,
      });
      expect(result.status).toBe("MATERIAL_DISCREPANCY");
      expect(result.findings.some((f) => f.findingType === "MISSING_CONDITION" && f.severity === "MATERIAL")).toBe(true);
    });
  }
});

describe("Phase 3F.1.6.R BLOCKER-9 remediation - FALSE-POSITIVE GUARDS (the fix must not turn correctly-represented conditions into spurious findings)", () => {
  it("a correctly-represented rule.conditions[] entry (no gatedBy) does not trigger a spurious AMBIGUOUS/UNCERTAIN condition finding or routing surprise", async () => {
    const text = "The Company may pay dividends up to $4,000,000 in any fiscal year, so long as no Default has occurred and is continuing at the time of such payment.";
    const clean = rule({
      capacityExpression: money(4_000_000),
      conditions: [{ conditionId: "c1", conditionType: "NO_DEFAULT", expression: null, referencesDefinitionId: null, description: "no Default has occurred and is continuing", provenance: null }],
    });
    const result = await verifyDefaultRouting(text, clean);
    expect(result.findings.some((f) => f.findingType === "MISSING_CONDITION")).toBe(false);
  });

  it("a correctly-represented ratio gate living entirely inside capacityExpression.gatedBy (no rule.conditions[] entry) does not trigger a spurious AMBIGUOUS/MATERIAL finding under full default production routing", async () => {
    // Note: this candidate's UNLIMITED_CAPACITY_MARKER already independently routes it to Layer 2
    // under verify.ts's existing (unrelated-to-this-fix) alternation-based routing rule - the point
    // of this guard is solely that no spurious condition-omission finding/status results from the
    // ir-inventory.ts fix, not that routing is skipped (it deliberately is not, for this shape).
    const text = "The Company may pay dividends so long as the Leverage Ratio does not exceed 4.00 to 1.00.";
    const clean = rule({
      capacityExpression: { kind: "UNLIMITED_CAPACITY", type: "CAPACITY", gatedBy: { exprId: "e", kind: "COMPARE", type: "BOOLEAN", left: metricRef("Leverage Ratio"), operator: "LTE", right: ratio(4.0) } },
    });
    const result = await verifyDefaultRouting(text, clean);
    expect(result.status).toBe("VERIFIED_NO_MATERIAL_GAP_FOUND");
    expect(result.findings.some((f) => f.findingType === "MISSING_CONDITION")).toBe(false);
  });

  it("a clean fixed basket with no conditional language at all is unaffected (zero markers, threshold change is a no-op)", async () => {
    const text = "The Company may incur Indebtedness not to exceed $9,000,000.";
    const clean = rule({ action: "INCUR_DEBT", capacityExpression: money(9_000_000) });
    const result = await verifyDefaultRoutingWithCleanClassifier(text, clean);
    expect(result.status).toBe("VERIFIED_NO_MATERIAL_GAP_FOUND");
    expect(result.semanticReviewInvoked).toBe(false);
  });
});
