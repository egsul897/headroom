/**
 * Phase 3F.1.6.RX Part B - independent, production-frozen recertification of
 * BLOCKER-9 ("Independent verifier missing omitted qualifying condition").
 *
 * This file is a FRESH adversarial attack, written without reusing any
 * fixture text/numbers from tests/contract-model/semantic-verification-
 * condition-remediation.test.ts (the original 9-form matrix) or
 * tests/contract-model/semantic-verification-condition-remediation-rx.test.ts
 * (Part A Workstream E's own 43-test matrix, itself already disjoint from
 * the first). It does two things:
 *
 *  1. Constructs condition-phrasing forms neither prior matrix covers and
 *     reports, per form, whether source-inventory.ts's CONDITIONAL_PHRASE
 *     detector catches it - INCLUDING, where it does not, whether default
 *     production routing (verifyCompiledCandidate with no test overrides)
 *     nonetheless reaches a real, non-clean outcome via a DIFFERENT
 *     mechanism (e.g. numeric reconciliation on an embedded ratio/amount),
 *     or produces a genuine false VERIFIED_NO_MATERIAL_GAP_FOUND clean pass
 *     with a real condition silently dropped and ZERO scrutiny from either
 *     layer - the exact original BLOCKER-9 failure mode, reproduced with
 *     different vocabulary. This file does NOT modify source-inventory.ts,
 *     reconciliation.ts, or verify.ts to fix anything it finds - per this
 *     recertification's charter, only NEW tests may be added, evidence-only.
 *
 *  2. Directly, adversarially attacks the isSynthetic gate added by Part A
 *     Workstream E's precision fix (verify.ts's
 *     downgradeUnconfirmedAmbiguousFindings + reviewer.ts's SemanticReviewResult.
 *     isSynthetic): constructs a scripted caller that CLAIMS isSynthetic:true
 *     while returning an empty findings array (exactly what a no-credential
 *     stub that never read a word of source text would return), and confirms
 *     the real production code genuinely refuses to treat that as a
 *     confirming clean review - i.e. that isSynthetic, if ever computed
 *     incorrectly upstream, is not merely undocumented but actually load-
 *     bearing at the point of use in downgradeUnconfirmedAmbiguousFindings.
 */
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verifyCompiledCandidate } from "../../lib/contract-model/compiler/semantic-verification/verify";
import { buildSourceInventory } from "../../lib/contract-model/compiler/semantic-verification/source-inventory";
import { getStageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { VerificationInput } from "../../lib/contract-model/compiler/semantic-verification/types";
import type { SemanticCompilationResult } from "../../lib/contract-model/compiler/semantic/types";
import type { IRExpression, IRRule } from "../../lib/contract-model/ir/types";
import { testCompilerInput } from "./semantic-compiler/test-helpers";

let ruleCounter = 0;
function rule(overrides: Partial<IRRule>): IRRule {
  ruleCounter++;
  return {
    ruleId: `ir-rule:pb9-${ruleCounter}`,
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

function fakeCaller(response: unknown, isSynthetic: boolean): StageCaller {
  return {
    providerName: isSynthetic ? "synthetic" : "test-provider",
    model: isSynthetic ? "synthetic-v1" : "test-model",
    isSynthetic,
    async call<T>(schema: ZodType<T>): Promise<T> {
      return schema.parse(response);
    },
    lastTelemetry: () => null,
  };
}

async function verifyDefaultRouting(text: string, r: IRRule) {
  const input: VerificationInput = { compilerInput: testCompilerInput({ operativeSourceText: text }), compilationResult: compilationResult({ rules: [r] }) };
  return verifyCompiledCandidate(input);
}

// ===========================================================================
// PART 1: novel condition-phrasing forms, disjoint from both prior matrices.
// ===========================================================================

describe("Part B Blocker-9 recert - NOVEL FORMS that ARE caught by the current CONDITIONAL_PHRASE detector (positive controls)", () => {
  it('nested multi-clause proviso ("provided that, notwithstanding the foregoing, if and only if...") is detected via its own already-covered constituent markers', () => {
    const text =
      "The Company may incur Indebtedness not to exceed $5,050,000, provided that, notwithstanding the foregoing, if and only if the Total Leverage Ratio does not exceed 4.00 to 1.00 immediately after giving effect thereto.";
    const inv = buildSourceInventory("pb9-1", text, "doc-1", "9.01", null);
    const kinds = inv.items.filter((i) => i.kind === "CONDITIONAL_PHRASE").map((i) => i.rawText.toLowerCase());
    expect(kinds).toEqual(expect.arrayContaining(["provided that", "notwithstanding", "if and only if"]));
  });

  it('"unless and until" is detected (matched via the substring "unless")', () => {
    const text = "The Company shall not make any Restricted Payment unless and until the Excess Cash Flow prepayment required under Section 2.10 has been made in full.";
    const inv = buildSourceInventory("pb9-2", text, "doc-1", "9.01", null);
    expect(inv.items.some((i) => i.kind === "CONDITIONAL_PHRASE" && i.rawText.toLowerCase() === "unless")).toBe(true);
  });

  it('"if, but only if" (a variant of "if and only if" not itself in either prior matrix) is detected via the substring "only if"', () => {
    const text = "The Company may pay dividends up to $3,950,000 in any fiscal year if, but only if, no Default has occurred.";
    const inv = buildSourceInventory("pb9-3", text, "doc-1", "9.01", null);
    expect(inv.items.some((i) => i.kind === "CONDITIONAL_PHRASE" && i.rawText.toLowerCase() === "only if")).toBe(true);
  });
});

interface FalseCleanCase {
  name: string;
  text: string;
  amount: number;
}

/**
 * Each of these forms is standard, common credit-agreement drafting for a
 * genuine qualifying condition or trigger - none is a rare or contrived
 * phrasing. Each rule below drops its own real condition entirely
 * (conditions: []) while its dollar figure still reconciles cleanly, on an
 * otherwise single, non-alternating compiled unit - the precise "single
 * fully reconciled unit, no unresolved numeric/structural signal" shape
 * shouldInvokeSemanticReview's own V1 routing treats as safe to skip.
 * Verified independently (not merely asserted) via buildSourceInventory
 * directly: none of "upon the occurrence of", "as and when" (paired with
 * "following"), passive "shall be deemed satisfied when", a bare defined-
 * term-only trigger ("Upon the [Defined Term],"), a schedule-cross-
 * reference-only incorporation with no connective word, or "in the event
 * of"/"in the event that"/"to the extent that" WITHOUT an accompanying
 * embedded ratio/amount figure produce a single CONDITIONAL_PHRASE/
 * EXCEPTION_MARKER/PROVISO_MARKER item.
 */
const FALSE_CLEAN_CASES: FalseCleanCase[] = [
  {
    name: '"upon the occurrence of [a defined trigger]" (extremely common credit-agreement condition idiom; distinct from the "(?:following|upon) satisfaction of" pattern already fixed, which requires the word "satisfaction")',
    text: "Upon the occurrence of a Change of Control, the Company may incur additional Indebtedness not to exceed $10,300,000.",
    amount: 10_300_000,
  },
  {
    name: '"as and when" paired with "following" (temporal-conditional idiom; "following" alone is not in the pattern list, only "(?:following|upon) satisfaction of")',
    text: "The Company shall repay Indebtedness not to exceed $2,700,000 as and when required following a Change of Control.",
    amount: 2_700_000,
  },
  {
    name: 'passive voice: "shall be deemed satisfied when" (a common passive-voice framing of a qualifying condition; "when" alone is not a detected marker)',
    text: "The condition to incurrence of $8,100,000 of additional Indebtedness shall be deemed satisfied when a Qualified IPO has occurred.",
    amount: 8_100_000,
  },
  {
    name: 'a condition expressed purely as a capitalized DEFINED TERM trigger ("Upon the Trigger Event,") with no accompanying connective word from the pattern list at all',
    text: "Upon the Trigger Event, the Company may incur up to $10,400,000 of additional Indebtedness.",
    amount: 10_400_000,
  },
  {
    name: "a condition incorporated purely by schedule cross-reference, with no conditional connective word anywhere in the sentence",
    text: "The Company may incur Indebtedness not to exceed $9,900,000, in accordance with the requirements set forth on Schedule 6.01(b).",
    amount: 9_900_000,
  },
  {
    name: '"in the event of [a binary trigger]" with no embedded ratio/amount figure inside the condition itself',
    text: "The Company may pay dividends not to exceed $4,400,000 in the event of a Qualified IPO.",
    amount: 4_400_000,
  },
  {
    name: '"in the event that [a binary trigger]" with no embedded ratio/amount figure inside the condition itself',
    text: "In the event that a Change of Control shall have occurred, the Company shall not incur Indebtedness in excess of $3,600,000.",
    amount: 3_600_000,
  },
  {
    name: '"to the extent that [a binary trigger]" with no embedded ratio/amount figure inside the condition itself',
    text: "The Company may make Restricted Payments not to exceed $6,200,000 to the extent that no Qualified IPO has yet occurred.",
    amount: 6_200_000,
  },
];

describe("Part B Blocker-9 recert - GENUINE RECALL GAPS: novel forms reaching a FALSE CLEAN PASS under real default production routing (STILL_OPEN evidence)", () => {
  for (const c of FALSE_CLEAN_CASES) {
    it(`buildSourceInventory raises NO conditional/exception/proviso signal at all for: ${c.name}`, () => {
      const inv = buildSourceInventory("pb9-gap", c.text, "doc-1", "9.01", null);
      const hit = inv.items.some((i) => i.kind === "CONDITIONAL_PHRASE" || i.kind === "EXCEPTION_MARKER" || i.kind === "PROVISO_MARKER");
      expect(hit).toBe(false);
    });

    it(`REAL DEFAULT PRODUCTION ROUTING (verifyCompiledCandidate, no test overrides) reaches a false VERIFIED_NO_MATERIAL_GAP_FOUND with ZERO scrutiny even though the condition is completely dropped: ${c.name}`, async () => {
      const mutated = rule({ capacityExpression: money(c.amount), conditions: [], exceptions: [] });
      const result = await verifyDefaultRouting(c.text, mutated);
      // This assertion documents CURRENT, DEFECTIVE behavior - it is a
      // regression-evidence test, not a spec of desired behavior. If a
      // future fix closes this gap, this assertion should start failing and
      // must be updated (not deleted) to assert the corrected outcome.
      expect(result.semanticReviewInvoked).toBe(false);
      expect(result.status).toBe("VERIFIED_NO_MATERIAL_GAP_FOUND");
      expect(result.reconciliation.materialUnresolvedCount).toBe(0);
      expect(result.findings.length).toBe(0);
    });
  }
});

describe("Part B Blocker-9 recert - the SAME phrases are only coincidentally caught when a ratio number happens to sit inside the condition clause, which is not a recall fix", () => {
  it('"to the extent that" IS caught end-to-end when the condition clause happens to contain an unrelated ratio figure - but via numeric reconciliation (a NOT_ACCOUNTED_FOR RATIO), never via CONDITIONAL_PHRASE recall', async () => {
    const text = "The Company may make Restricted Payments to the extent that the Total Leverage Ratio does not exceed 4.00 to 1.00, in an amount not to exceed $6,150,000.";
    const inv = buildSourceInventory("pb9-coincidence", text, "doc-1", "9.01", null);
    expect(inv.items.some((i) => i.kind === "CONDITIONAL_PHRASE")).toBe(false); // recall gap still present
    expect(inv.items.some((i) => i.kind === "RATIO" && i.numericValue === 4)).toBe(true); // caught by a different mechanism entirely

    const mutated = rule({ capacityExpression: money(6_150_000), conditions: [], exceptions: [] });
    const result = await verifyDefaultRouting(text, mutated);
    expect(result.semanticReviewInvoked).toBe(true);
    expect(result.status).not.toBe("VERIFIED_NO_MATERIAL_GAP_FOUND");
    // The reconciliation reason naming this is about the RATIO figure, not about a
    // conditional/exception/proviso marker count - confirming the "catch" is coincidental.
    const ratioReason = result.reconciliation.items.find((i) => i.classification === "NOT_ACCOUNTED_FOR" && i.sourceItem?.kind === "RATIO");
    expect(ratioReason).toBeTruthy();
  });
});

// ===========================================================================
// PART 2: direct adversarial attack on the isSynthetic gate.
// ===========================================================================

describe("Part B Blocker-9 recert - direct adversarial attack on isSynthetic gating in downgradeUnconfirmedAmbiguousFindings", () => {
  const text = "The Company may incur Indebtedness not to exceed $9,700,000. As used in this Agreement, a Person shall be deemed a Restricted Subsidiary so long as the Company owns, directly or indirectly, a majority of its outstanding Equity Interests.";

  it("a FAKE synthetic-fallback caller (isSynthetic:true) that returns an empty findings array (exactly what the real no-credential stub always returns) must NOT be allowed to downgrade a real deterministic UNCERTAIN finding - status must stay conservative", async () => {
    const clean = rule({ action: "INCUR_DEBT", capacityExpression: money(9_700_000), conditions: [] });
    const input: VerificationInput = { compilerInput: testCompilerInput({ operativeSourceText: text }), compilationResult: compilationResult({ rules: [clean] }) };
    const syntheticCaller = fakeCaller({ findings: [], overallNotes: [] }, true);
    const result = await verifyCompiledCandidate(input, { forceSemanticReview: true, reviewCaller: syntheticCaller });

    expect(result.semanticReviewInvoked).toBe(true);
    // Must NOT be silently blessed clean.
    expect(result.status).not.toBe("VERIFIED_NO_MATERIAL_GAP_FOUND");
    expect(result.status).not.toBe("VERIFIED_WITH_NON_MATERIAL_FINDINGS");
    expect(result.status).toBe("REVIEW_REQUIRED");
    // The finding must still carry its original UNCERTAIN severity - never downgraded to NON_MATERIAL
    // by a stub's inevitable empty response.
    const conditionFinding = result.findings.find((f) => f.findingType === "MISSING_CONDITION");
    expect(conditionFinding).toBeTruthy();
    expect(conditionFinding?.severity).toBe("UNCERTAIN");
    expect(conditionFinding?.verifierReasoning).not.toContain("downgraded to NON_MATERIAL");
  });

  it("CONTRAST: the exact same scenario with a REAL (isSynthetic:false) caller returning the exact same empty findings array DOES legitimately downgrade - proving the isSynthetic flag, not the emptiness of findings, is what the gate keys on", async () => {
    const clean = rule({ action: "INCUR_DEBT", capacityExpression: money(9_700_000), conditions: [] });
    const input: VerificationInput = { compilerInput: testCompilerInput({ operativeSourceText: text }), compilationResult: compilationResult({ rules: [clean] }) };
    const realCaller = fakeCaller({ findings: [], overallNotes: ["reviewed the full text; the stray so-long-as clause is unrelated interpretive boilerplate, not a real condition on this rule"] }, false);
    const result = await verifyCompiledCandidate(input, { forceSemanticReview: true, reviewCaller: realCaller });

    expect(result.status).not.toBe("REVIEW_REQUIRED");
    expect(result.status).not.toBe("MATERIAL_DISCREPANCY");
    const conditionFinding = result.findings.find((f) => f.findingType === "MISSING_CONDITION");
    expect(conditionFinding?.severity).toBe("NON_MATERIAL");
  });

  it("the REAL, unmodified getStageCaller() production selector in this credential-less sandbox actually returns isSynthetic:true (confirms the gate is wired to the real fallback, not merely to a test convention)", () => {
    const caller = getStageCaller();
    expect(caller.providerName).toBe("synthetic");
    expect(caller.isSynthetic).toBe(true);
  });

  it("REAL DEFAULT PRODUCTION ROUTING (no overrides at all) on the same spurious-marker candidate, in this actual credential-less sandbox, stays conservative - independently re-confirms this is not merely a scripted-test artifact", async () => {
    const clean = rule({ action: "INCUR_DEBT", capacityExpression: money(9_700_000), conditions: [] });
    const result = await verifyDefaultRouting(text, clean);
    expect(result.semanticReviewInvoked).toBe(true);
    expect(result.status).toBe("REVIEW_REQUIRED");
    const conditionFinding = result.findings.find((f) => f.findingType === "MISSING_CONDITION");
    expect(conditionFinding?.severity).toBe("UNCERTAIN");
  });
});

// ===========================================================================
// PART 3: independence re-verification - trace, don't trust.
// ===========================================================================

describe("Part B Blocker-9 recert - independence data-flow re-verification (traced directly against the source file, not merely re-asserted)", () => {
  const verifySource = readFileSync(join(__dirname, "../../lib/contract-model/compiler/semantic-verification/verify.ts"), "utf8");

  it("downgradeUnconfirmedAmbiguousFindings's own function body never references compilationResult, overallNotes, sufficiencyReasons, or unresolvedIssues - it may only consult reconciliation.items and review.findings/isSynthetic", () => {
    const start = verifySource.indexOf("function downgradeUnconfirmedAmbiguousFindings(");
    expect(start).toBeGreaterThan(-1);
    // Extract the function body up to its closing brace at column 0 (the next top-level construct).
    const rest = verifySource.slice(start);
    const bodyEnd = rest.indexOf("\n}\n");
    const body = rest.slice(0, bodyEnd);
    expect(body).not.toMatch(/compilationResult/);
    expect(body).not.toMatch(/overallNotes/);
    expect(body).not.toMatch(/sufficiencyReasons/);
    expect(body).not.toMatch(/unresolvedIssues/);
  });

  it("verifyCompiledCandidate never passes compilationResult (or any of its reasoning fields) into downgradeUnconfirmedAmbiguousFindings's call site", () => {
    // The call site (as opposed to the function's own definition, matched first) is the
    // invocation inside verifyCompiledCandidate's body: `allFindings = downgradeUnconfirmedAmbiguousFindings(...)`.
    const callSiteMatch = verifySource.match(/allFindings = downgradeUnconfirmedAmbiguousFindings\(([^)]*)\)/);
    expect(callSiteMatch).toBeTruthy();
    expect(callSiteMatch![1]).toBe("allFindings, reconciliation, review");
  });

  it("no file under semantic-verification/ imports the compiler's own compile.ts or caller.ts modules (mechanical re-check, same technique as semantic-verification-independence.test.ts, run fresh here rather than merely trusted from that file)", async () => {
    const { readdirSync } = await import("node:fs");
    const dir = join(__dirname, "../../lib/contract-model/compiler/semantic-verification");
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const content = readFileSync(join(dir, f), "utf8");
      const importLines = content.split("\n").filter((l) => /^\s*import\b/.test(l));
      for (const line of importLines) {
        expect(line).not.toMatch(/semantic\/compile["']/);
        expect(line).not.toMatch(/semantic\/caller["']/);
      }
    }
  });
});
