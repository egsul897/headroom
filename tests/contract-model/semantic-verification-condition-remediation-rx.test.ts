/**
 * Phase 3F.1.6.RX Part A, Workstream E - independent adversarial attack on
 * BLOCKER-9's own fix (docs/phase-3f1-6-r-blocker-remediation/13-verifier-
 * condition-remediation.json), using condition-phrasing forms the prior
 * 9-form matrix (tests/contract-model/semantic-verification-condition-
 * remediation.test.ts) never exercised: "provided however", "except that",
 * "only if", "conditioned upon", "unless", "provided further", "following
 * satisfaction of", "after giving effect thereto", "immediately before and
 * after" (temporal dual-condition), "no Default or Event of Default"
 * (compound form), "pro forma compliance", a condition incorporated by
 * reference to a DEFINED TERM, and a condition incorporated by cross-
 * reference to another section.
 *
 * Two of these forms ("conditioned upon" and "following satisfaction of")
 * turned out to be genuine, previously-untested RECALL GAPS in source-
 * inventory.ts's CONDITIONAL_PHRASE pattern list - neither is one of the
 * generic connectives BLOCKER-9 added or the original pattern already had.
 * Both are fixed here in source-inventory.ts, following BLOCKER-9's own
 * discipline: a generic, non-package-specific regex addition, not a fix
 * tailored to this file's own test sentences.
 *
 * A second, independent finding - a genuine PRECISION regression exposed
 * (not merely made theoretically possible, but concretely reachable) by
 * BLOCKER-9's >=1 threshold - is fixed in verify.ts
 * (downgradeUnconfirmedAmbiguousFindings): a benign, unrelated conditional-
 * looking word elsewhere in a candidate's text, on a rule with zero real
 * conditions, used to permanently pin status at REVIEW_REQUIRED even after
 * a real, independent Layer 2 reviewer read the same text and reported
 * nothing wrong. See the BENIGN/PRECISION describe block below.
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
    ruleId: `ir-rule:crx-${ruleCounter}`,
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

async function verifyWithScriptedSemanticFinding(text: string, r: IRRule, wireFinding: Record<string, unknown>) {
  const input: VerificationInput = { compilerInput: testCompilerInput({ operativeSourceText: text }), compilationResult: compilationResult({ rules: [r] }) };
  const caller = fakeCaller({ findings: [wireFinding], overallNotes: [] });
  return verifyCompiledCandidate(input, { forceSemanticReview: true, reviewCaller: caller });
}

/** A real (non-synthetic, matching this codebase's own established "scripted-semantic tier" fakeCaller convention) reviewer that examines the candidate and reports nothing wrong at all - i.e. an honest, confirming clean pass. */
async function verifyWithScriptedCleanReview(text: string, r: IRRule) {
  const input: VerificationInput = { compilerInput: testCompilerInput({ operativeSourceText: text }), compilationResult: compilationResult({ rules: [r] }) };
  const caller = fakeCaller({ findings: [], overallNotes: ["reviewed the full source text and the proposed IR; the deterministic signal above does not correspond to any real, materially operative condition on this rule"] });
  return verifyCompiledCandidate(input, { forceSemanticReview: true, reviewCaller: caller });
}

interface ConditionForm {
  name: string;
  text: string;
  amount: number;
  expectedKinds: Array<"CONDITIONAL_PHRASE" | "EXCEPTION_MARKER" | "PROVISO_MARKER">;
}

const NEW_CONDITION_FORMS: ConditionForm[] = [
  {
    name: '"provided however" (as its own connective, distinct from the prior matrix\'s plain "provided that")',
    text: "The Company may pay dividends up to $4,100,000 in any fiscal year, provided however that the Company shall have delivered a compliance certificate to the Administrative Agent not less than 5 Business Days prior to such payment.",
    amount: 4_100_000,
    expectedKinds: ["CONDITIONAL_PHRASE", "EXCEPTION_MARKER"],
  },
  {
    name: '"except that"',
    text: "The Company shall not make any Restricted Payment, except that the Company may pay dividends not to exceed $2,200,000 in the aggregate during the term of this Agreement.",
    amount: 2_200_000,
    expectedKinds: ["CONDITIONAL_PHRASE", "EXCEPTION_MARKER"],
  },
  {
    name: '"only if"',
    text: "The Company may incur Indebtedness not to exceed $6,300,000, only if the Net Proceeds thereof are used to prepay the Term Loans within 10 Business Days of incurrence.",
    amount: 6_300_000,
    expectedKinds: ["CONDITIONAL_PHRASE"],
  },
  {
    name: '"conditioned upon" (a real recall gap fixed by this remediation - not a pre-existing pattern)',
    text: "The Company may pay dividends in an amount not to exceed $3,300,000 in any fiscal year, conditioned upon delivery to the Administrative Agent of a certificate of a Responsible Officer certifying the calculations set forth therein.",
    amount: 3_300_000,
    expectedKinds: ["CONDITIONAL_PHRASE"],
  },
  {
    name: '"unless"',
    text: "The Company may make Investments not to exceed $5,700,000 in the aggregate, unless the Total Leverage Ratio has been tested and found non-compliant within the preceding fiscal quarter.",
    amount: 5_700_000,
    expectedKinds: ["CONDITIONAL_PHRASE"],
  },
  {
    name: '"provided further" (a standalone proviso opener, not nested after a prior "provided that")',
    text: "The Company may pay dividends up to $7,900,000 in any fiscal year. Provided further, the Company shall not have elected to defer any scheduled amortization payment under the Term Loans during the preceding 12 months.",
    amount: 7_900_000,
    expectedKinds: ["PROVISO_MARKER"],
  },
  {
    name: '"following satisfaction of" (a real recall gap fixed by this remediation)',
    text: "The Company may incur Indebtedness not to exceed $8,800,000, following satisfaction of each of the conditions precedent set forth in the Intercreditor Agreement.",
    amount: 8_800_000,
    expectedKinds: ["CONDITIONAL_PHRASE"],
  },
  {
    name: '"immediately before and after" (temporal dual-condition, standalone, no accompanying "no Default"/"so long as")',
    text: "The Company may incur Indebtedness not to exceed $9,400,000; the Fixed Charge Coverage Ratio test set forth in this Section shall be satisfied on a Pro Forma Basis immediately before and after such incurrence.",
    amount: 9_400_000,
    expectedKinds: ["CONDITIONAL_PHRASE"],
  },
  {
    name: '"no Default or Event of Default" (compound form, distinct from the prior matrix\'s bare "no Event of Default")',
    text: "The Company may pay dividends not to exceed $4,600,000 in any fiscal year. No Default or Event of Default shall have occurred and be continuing at the time of such payment.",
    amount: 4_600_000,
    expectedKinds: ["CONDITIONAL_PHRASE"],
  },
  {
    name: '"pro forma compliance" used as the sole gating language (no accompanying "so long as"/"provided that"/"if")',
    text: "The Company may incur Indebtedness not to exceed $5,100,000, subject to Pro Forma Compliance with the Total Leverage Ratio covenant set forth in Section 7.02.",
    amount: 5_100_000,
    expectedKinds: ["CONDITIONAL_PHRASE"],
  },
  {
    name: "a condition incorporated by reference to a DEFINED TERM (\"Applicable Conditions\")",
    text: "The Company may pay dividends up to $6,600,000 in any fiscal year so long as the Applicable Conditions (as defined in Section 1.01) are satisfied.",
    amount: 6_600_000,
    expectedKinds: ["CONDITIONAL_PHRASE"],
  },
  {
    name: "a condition incorporated by CROSS-REFERENCE to another section (Section 6.01)",
    text: "The Company may incur Indebtedness not to exceed $7,200,000, subject to compliance with Section 6.01.",
    amount: 7_200_000,
    expectedKinds: ["CONDITIONAL_PHRASE"],
  },
];

describe("Phase 3F.1.6.RX Workstream E - RECALL (new condition forms not in the prior 9-form matrix)", () => {
  for (const form of NEW_CONDITION_FORMS) {
    it(`detects a real source-side marker for: ${form.name}`, () => {
      const inv = buildSourceInventory("cand-1", form.text, "doc-1", "§9.01", null);
      for (const kind of form.expectedKinds) {
        expect(inv.items.some((i) => i.kind === kind)).toBe(true);
      }
    });
  }
});

describe("Phase 3F.1.6.RX Workstream E - ROUTING (default production routing never silently misses a dropped condition of any of these new forms)", () => {
  for (const form of NEW_CONDITION_FORMS) {
    it(`routes to Layer 2 and never reaches a false clean pass when the condition is dropped: ${form.name}`, async () => {
      const mutated = rule({ capacityExpression: money(form.amount), conditions: [], exceptions: [] });
      const result = await verifyDefaultRouting(form.text, mutated);
      expect(result.semanticReviewInvoked).toBe(true);
      expect(result.status).not.toBe("VERIFIED_NO_MATERIAL_GAP_FOUND");
    });
  }
});

describe("Phase 3F.1.6.RX Workstream E - END-TO-END (once Layer 2 is invoked and independently confirms the omission, orchestration reaches MATERIAL_DISCREPANCY)", () => {
  for (const form of NEW_CONDITION_FORMS) {
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

describe("Phase 3F.1.6.RX Workstream E - FALSE-POSITIVE GUARDS for the new forms (correctly-represented conditions of these new shapes do not spuriously fire)", () => {
  it('a correctly-represented "conditioned upon" condition (rule.conditions[] entry present) does not trigger a spurious finding', async () => {
    const text = "The Company may pay dividends in an amount not to exceed $3,300,000 in any fiscal year, conditioned upon delivery to the Administrative Agent of a certificate of a Responsible Officer certifying the calculations set forth therein.";
    const clean = rule({
      capacityExpression: money(3_300_000),
      conditions: [{ conditionId: "c1", conditionType: "OTHER_RULE_SATISFIED", expression: null, referencesDefinitionId: null, description: "delivery of a Responsible Officer certificate", provenance: null }],
    });
    const result = await verifyDefaultRouting(text, clean);
    expect(result.findings.some((f) => f.findingType === "MISSING_CONDITION")).toBe(false);
  });

  it('a correctly-represented "following satisfaction of" condition does not trigger a spurious finding', async () => {
    const text = "The Company may incur Indebtedness not to exceed $8,800,000, following satisfaction of each of the conditions precedent set forth in the Intercreditor Agreement.";
    const clean = rule({
      action: "INCUR_DEBT",
      capacityExpression: money(8_800_000),
      conditions: [{ conditionId: "c1", conditionType: "OTHER_RULE_SATISFIED", expression: null, referencesDefinitionId: null, description: "satisfaction of Intercreditor Agreement conditions precedent", provenance: null }],
    });
    const result = await verifyDefaultRouting(text, clean);
    expect(result.findings.some((f) => f.findingType === "MISSING_CONDITION")).toBe(false);
  });
});

describe("Phase 3F.1.6.RX Workstream E - BENIGN / PRECISION (conditional-looking text that is NOT a real, material qualifying condition on the compiled rule)", () => {
  it('a bare "if" in unrelated boilerplate (notice-forwarding mechanics, not a covenant condition) never triggers escalation at all - bare "if" is deliberately not a detected marker (the charter\'s own "do not route every word if to review")', async () => {
    const text = "The Company may incur Indebtedness not to exceed $9,000,000. If the Administrative Agent receives a notice of default under any other Indebtedness, it shall promptly forward such notice to each Lender.";
    const clean = rule({ action: "INCUR_DEBT", capacityExpression: money(9_000_000) });
    const result = await verifyDefaultRouting(text, clean);
    expect(result.status).toBe("VERIFIED_NO_MATERIAL_GAP_FOUND");
    expect(result.semanticReviewInvoked).toBe(false);
  });

  it('a "so long as" phrase appearing only in a defined-term/interpretive clause unrelated to this rule\'s own capacity still escalates to Layer 2 (a real single marker, honestly ambiguous at Layer 1) but is NOT permanently pinned at REVIEW_REQUIRED once a real reviewer confirms nothing is wrong', async () => {
    const text = "The Company may incur Indebtedness not to exceed $9,500,000. As used in this Agreement, a Person shall be deemed a Subsidiary so long as the parent owns, directly or indirectly, a majority of its voting Equity Interests.";
    const clean = rule({ action: "INCUR_DEBT", capacityExpression: money(9_500_000), conditions: [] });

    // Layer 1 alone: a real, honest single-marker AMBIGUOUS signal is raised (this is not a bug -
    // it is exactly BLOCKER-9's own intended, disclosed cost tradeoff for a coarse single marker).
    const deterministicOnly = await verifyCompiledCandidate(
      { compilerInput: testCompilerInput({ operativeSourceText: text }), compilationResult: compilationResult({ rules: [clean] }) },
      { skipSemanticReview: true }
    );
    expect(deterministicOnly.findings.some((f) => f.findingType === "MISSING_CONDITION" && f.severity === "UNCERTAIN")).toBe(true);

    // But once a REAL (non-synthetic) independent reviewer has actually looked at this exact
    // candidate - the same deterministic signal is in its prompt - and reports nothing wrong,
    // the precision fix (verify.ts's downgradeUnconfirmedAmbiguousFindings) resolves the
    // "pending Layer 2 confirmation" UNCERTAIN signal to NON_MATERIAL rather than leaving this
    // candidate stuck at REVIEW_REQUIRED forever.
    const result = await verifyWithScriptedCleanReview(text, clean);
    expect(result.semanticReviewInvoked).toBe(true);
    expect(result.status).not.toBe("MATERIAL_DISCREPANCY");
    expect(result.status).not.toBe("REVIEW_REQUIRED");
    expect(result.findings.some((f) => f.findingType === "MISSING_CONDITION" && f.severity === "MATERIAL")).toBe(false);
  });

  it('the no-credential SyntheticStageCaller fallback (isSynthetic) must NEVER be mistaken for a confirming clean review - default routing (no override) on the same spurious-marker candidate stays conservatively at REVIEW_REQUIRED, never silently downgraded by a stub that never actually read the text', async () => {
    const text = "The Company may incur Indebtedness not to exceed $9,600,000. As used in this Agreement, a Person shall be deemed a Subsidiary so long as the parent owns, directly or indirectly, a majority of its voting Equity Interests.";
    const clean = rule({ action: "INCUR_DEBT", capacityExpression: money(9_600_000), conditions: [] });
    const result = await verifyDefaultRouting(text, clean);
    expect(result.semanticReviewInvoked).toBe(true);
    // Default routing in this sandbox has no AI_GATEWAY_API_KEY/ANTHROPIC_API_KEY configured, so
    // this exercises the real SyntheticStageCaller fallback path, not a scripted stand-in.
    expect(result.status).not.toBe("VERIFIED_NO_MATERIAL_GAP_FOUND");
  });

  it("a condition already fully and correctly represented via rule.conditions[] never escalates at all, regardless of which new connective form was used in the source", async () => {
    const text = "The Company may pay dividends not to exceed $4,600,000 in any fiscal year. No Default or Event of Default shall have occurred and be continuing at the time of such payment.";
    const clean = rule({
      capacityExpression: money(4_600_000),
      conditions: [{ conditionId: "c1", conditionType: "NO_DEFAULT", expression: null, referencesDefinitionId: null, description: "no Default or Event of Default has occurred and is continuing", provenance: null }],
    });
    const result = await verifyDefaultRouting(text, clean);
    expect(result.status).toBe("VERIFIED_NO_MATERIAL_GAP_FOUND");
    expect(result.semanticReviewInvoked).toBe(false);
  });

  it("a genuine MATERIAL omission is never masked by the precision fix - a real reviewer that DOES confirm the omission still reaches MATERIAL_DISCREPANCY even though the deterministic signal is the same coarse AMBIGUOUS shape", async () => {
    const text = "The Company may pay dividends up to $4,600,000 in any fiscal year, conditioned upon no Default having occurred and being continuing at the time of such payment.";
    const mutated = rule({ capacityExpression: money(4_600_000), conditions: [], exceptions: [] });
    const result = await verifyWithScriptedSemanticFinding(text, mutated, {
      findingType: "MISSING_CONDITION",
      severity: "MATERIAL",
      ruleOrDefinitionId: mutated.ruleId,
      irPath: "rules[0].conditions",
      sourceEvidence: text,
      sourceCitation: "9.01",
      proposedIrEvidence: "conditions=[] exceptions=[]",
      reasoning: "source conditions the dividend on no Default existing; the proposed IR drops this condition entirely",
    });
    expect(result.status).toBe("MATERIAL_DISCREPANCY");
    expect(result.findings.some((f) => f.findingType === "MISSING_CONDITION" && f.severity === "MATERIAL")).toBe(true);
  });
});
