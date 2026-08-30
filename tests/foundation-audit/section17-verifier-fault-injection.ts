/**
 * Phase 3F.1.6 Section 17 - independent verifier fault-injection probe.
 *
 * Constructs 7 of my OWN adversarial cases (different synthetic fact
 * patterns/numbers than tests/contract-model/semantic-verification-
 * fault-injection.test.ts, which is executed separately as a baseline -
 * see the section17-baseline-check.sh companion), each deliberately wrong
 * in exactly ONE way relative to its source text, run through the REAL
 * verifyCompiledCandidate (lib/contract-model/compiler/semantic-
 * verification/verify.ts), confirming a MATERIAL finding (or, for the
 * operative-version case, a conservative REVIEW_REQUIRED status) is
 * actually produced - never a false VERIFIED_NO_MATERIAL_GAP_FOUND pass.
 *
 * Run via: npx tsx tests/foundation-audit/section17-verifier-fault-injection.ts
 */
import { writeFileSync } from "node:fs";
import type { ZodType } from "zod";
import { verifyCompiledCandidate } from "../../lib/contract-model/compiler/semantic-verification/verify";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { VerificationInput } from "../../lib/contract-model/compiler/semantic-verification/types";
import type { SemanticCompilationResult } from "../../lib/contract-model/compiler/semantic/types";
import type { IRRule, IRExpression } from "../../lib/contract-model/ir/types";
import { testCompilerInput } from "../contract-model/semantic-compiler/test-helpers";

let ruleCounter = 0;
function rule(overrides: Partial<IRRule>): IRRule {
  ruleCounter++;
  return {
    ruleId: `ir-rule:s17-${ruleCounter}`,
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

interface CaseResult {
  name: string;
  faultInjected: string;
  verdict: "CAUGHT" | "MISSED";
  status: string;
  materialFindingTypes: string[];
  detail: string;
}
const results: CaseResult[] = [];
function record(r: CaseResult) {
  results.push(r);
  console.log(`[${r.verdict}] ${r.name}: status=${r.status} findings=${JSON.stringify(r.materialFindingTypes)} - ${r.detail}`);
}

async function main() {
  // 1. MISSING AMOUNT - source states a real dollar cap; compiled rule represents it as unlimited.
  {
    const text = "Section 7.02. Investments. The Company may make Investments in Joint Ventures in an aggregate amount not to exceed $7,500,000 outstanding at any time.";
    const r = rule({ covenantFamily: "INVESTMENTS", action: "MAKE_INVESTMENT", capacityExpression: { kind: "UNLIMITED_CAPACITY", type: "CAPACITY", gatedBy: null } });
    const v = await verifyDeterministicOnly(text, r);
    const material = v.findings.filter((f) => f.severity === "MATERIAL");
    record({ name: "missing-amount", faultInjected: "source dollar cap ($7,500,000) dropped, IR represents UNLIMITED_CAPACITY", verdict: material.length > 0 ? "CAUGHT" : "MISSED", status: v.status, materialFindingTypes: material.map((f) => f.findingType), detail: `${material.length} material finding(s)` });
  }

  // 2. WRONG ACTION - source describes a Lien grant; IR classifies it as incurring Indebtedness.
  {
    const text = "Section 8.01. Liens. The Company shall not create, incur, assume or permit to exist any Lien on the Collateral securing obligations in excess of $2,000,000.";
    const r = rule({ covenantFamily: "LIENS", posture: "PROHIBITION", action: "INCUR_DEBT", capacityExpression: null });
    const v = await verifyWithScriptedSemanticFinding(text, r, {
      findingType: "WRONG_ACTION",
      severity: "MATERIAL",
      ruleOrDefinitionId: r.ruleId,
      irPath: "rules[0].action",
      sourceEvidence: "shall not create, incur, assume or permit to exist any Lien",
      sourceCitation: "8.01",
      proposedIrEvidence: `action=${r.action}`,
      reasoning: "source describes a Lien-granting restriction; IR classifies the action as INCUR_DEBT, a different economic activity",
    });
    const material = v.findings.filter((f) => f.severity === "MATERIAL");
    record({ name: "wrong-action", faultInjected: "source is a Liens prohibition; IR action classified as INCUR_DEBT (Indebtedness)", verdict: material.some((f) => f.findingType === "WRONG_ACTION") ? "CAUGHT" : "MISSED", status: v.status, materialFindingTypes: material.map((f) => f.findingType), detail: "scripted-semantic tier: proves orchestration correctly surfaces a WRONG_ACTION finding Layer 2 reports" });
  }

  // 3. WRONG SCOPE - source restricts the covenant to Restricted Subsidiaries only; IR entity scope wrongly includes Unrestricted Subsidiaries.
  {
    const text = "Section 6.15. Restricted Subsidiaries. No Restricted Subsidiary shall incur Indebtedness in excess of $3,000,000 in the aggregate. This Section 6.15 does not apply to Unrestricted Subsidiaries.";
    const r = rule({ entityScope: ["NON_GUARANTOR_RS", "UNRESTRICTED_SUB"], capacityExpression: money(3_000_000) });
    const v = await verifyWithScriptedSemanticFinding(text, r, {
      findingType: "WRONG_ENTITY_SCOPE",
      severity: "MATERIAL",
      ruleOrDefinitionId: r.ruleId,
      irPath: "rules[0].entityScope",
      sourceEvidence: "This Section 6.15 does not apply to Unrestricted Subsidiaries",
      sourceCitation: "6.15",
      proposedIrEvidence: `entityScope=${JSON.stringify(r.entityScope)}`,
      reasoning: "source explicitly excludes Unrestricted Subsidiaries from this restriction; IR's entityScope wrongly includes them",
    });
    const material = v.findings.filter((f) => f.severity === "MATERIAL");
    record({ name: "wrong-scope", faultInjected: "source explicitly excludes Unrestricted Subsidiaries; IR entityScope wrongly includes them", verdict: material.some((f) => f.findingType === "WRONG_ENTITY_SCOPE") ? "CAUGHT" : "MISSED", status: v.status, materialFindingTypes: material.map((f) => f.findingType), detail: "scripted-semantic tier" });
  }

  // 4. OMITTED CONDITION - source gates the permission on "no Default has occurred and is continuing"; IR conditions[] is empty.
  {
    const text = "Section 6.20. Restricted Payments. The Company may pay dividends up to $4,000,000 in any fiscal year, so long as no Default has occurred and is continuing at the time of such payment.";
    const r = rule({ covenantFamily: "RESTRICTED_PAYMENTS", action: "PAY_DIVIDEND", capacityExpression: money(4_000_000), conditions: [] });

    // 4a. Deterministic Layer 1 alone (the aggregate condition/exception structural signal requires
    // >=2 independent condition/exception/proviso markers to fire - reconciliation.ts's own documented
    // threshold - and this fact pattern has exactly ONE, so Layer 1 alone is not expected to catch it).
    const v1 = await verifyDeterministicOnly(text, r);

    // 4b. REAL PRODUCTION DEFAULT ROUTING - no skipSemanticReview/forceSemanticReview override at all,
    // exactly how verifyCompiledCandidate is actually called. shouldInvokeSemanticReview's own V1
    // routing (task §32) skips Layer 2 entirely for "a single, fully-reconciled, non-alternating
    // compiled unit with no unresolved numeric/structural signal" - which this case IS (the dollar
    // amount matches, it is the ONLY rule, no MAX/MIN/IF/SCHEDULE/UNLIMITED_CAPACITY branching). This
    // is the actually-important measurement: does an unmodified, default-routed production verification
    // call ever look at this omitted condition at all?
    const input: VerificationInput = { compilerInput: testCompilerInput({ operativeSourceText: text }), compilationResult: compilationResult({ rules: [r] }) };
    const v2 = await verifyCompiledCandidate(input);

    const material1 = v1.findings.filter((f) => f.severity === "MATERIAL");
    const caughtByLayer1Alone = material1.length > 0;
    const caughtInDefaultProductionRouting = v2.semanticReviewInvoked || v2.findings.some((f) => f.severity === "MATERIAL");
    record({
      name: "omitted-condition",
      faultInjected: 'source\'s own "so long as no Default has occurred and is continuing" condition dropped entirely, IR conditions[] is empty, on an otherwise single, fully dollar-reconciled rule',
      verdict: caughtInDefaultProductionRouting ? "CAUGHT" : "MISSED",
      status: v2.status,
      materialFindingTypes: v2.findings.filter((f) => f.severity === "MATERIAL").map((f) => f.findingType),
      detail: `Layer-1-only (forced skipSemanticReview): ${caughtByLayer1Alone ? "caught" : "MISSED - source has only 1 conditional marker, below reconciliation.ts's own >=2 aggregate-signal threshold"}. REAL DEFAULT PRODUCTION ROUTING (no options override at all): semanticReviewInvoked=${v2.semanticReviewInvoked} (skippedReason: "${v2.semanticReviewSkippedReason}"), status=${v2.status} - shouldInvokeSemanticReview's own V1 routing (task §32) also skips Layer 2 for this exact shape (single fully-numeric-reconciled rule, no alternation), so NEITHER layer ever looks at the dropped condition in default, unmodified production usage.`,
    });
  }

  // 5. SIBLING-BASKET SUBSTITUTION - two independently-operative baskets in source; IR's single compiled rule carries the WRONG sibling's dollar figure.
  {
    const text = "Section 6.25. Indebtedness Baskets. (a) Indebtedness of Foreign Subsidiaries not to exceed $1,500,000 in the aggregate. (b) Indebtedness incurred to finance Capital Expenditures not to exceed $6,000,000 in the aggregate.";
    // Only ONE rule compiled (basket (b) never independently represented at all), and the compiled rule
    // that IS present is anchored/citation-matched to basket (a)'s own section text while actually
    // carrying basket (b)'s $6,000,000 figure - a genuine sibling-substitution shape.
    const r = rule({ covenantFamily: "INDEBTEDNESS", action: "INCUR_DEBT", sourceSectionRef: "6.25(a)", capacityExpression: money(6_000_000) });
    const v = await verifyDeterministicOnly(text, r);
    const material = v.findings.filter((f) => f.severity === "MATERIAL");
    record({ name: "sibling-basket-substitution", faultInjected: "basket (a)'s own $1,500,000 figure never appears anywhere in IR; the compiled rule instead carries sibling basket (b)'s $6,000,000 figure", verdict: material.length > 0 ? "CAUGHT" : "MISSED", status: v.status, materialFindingTypes: material.map((f) => f.findingType), detail: `${material.length} material finding(s) - source's own $1,500,000 has no IR representation at all` });
  }

  // 6. WRONG DEFINITION - source defines a term one way; IR's compiled definition states a materially different numeric formula for the SAME term.
  {
    const text = '"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication, (a) Consolidated Interest Expense, (b) income tax expense, and (c) depreciation and amortization expense, in each case for such period, MINUS extraordinary gains.';
    const r = rule({
      ruleType: "CALCULATION_RULE",
      action: null,
      capacityExpression: null,
    });
    const v = await verifyWithScriptedSemanticFinding(text, r, {
      findingType: "WRONG_FORMULA",
      severity: "MATERIAL",
      ruleOrDefinitionId: r.ruleId,
      irPath: "definitions[0].calculationExpression",
      sourceEvidence: "MINUS extraordinary gains",
      sourceCitation: "definitions",
      proposedIrEvidence: "compiled definition omits the MINUS extraordinary gains adjustment entirely (net income + interest + tax + D&A, no subtraction)",
      reasoning: "the compiled Consolidated EBITDA definition drops the source's own required downward adjustment for extraordinary gains, materially overstating the metric",
    });
    const material = v.findings.filter((f) => f.severity === "MATERIAL");
    record({ name: "wrong-definition", faultInjected: "compiled Consolidated EBITDA definition omits the source's own \"MINUS extraordinary gains\" adjustment", verdict: material.some((f) => f.findingType === "WRONG_FORMULA") ? "CAUGHT" : "MISSED", status: v.status, materialFindingTypes: material.map((f) => f.findingType), detail: "scripted-semantic tier" });
  }

  // 7. WRONG OPERATIVE VERSION - the compiled rule was derived from text whose operative lineage is
  // CONFLICTED (an unresolved amendment dispute over which version currently governs) - the verifier
  // must never bless this as a clean pass merely because the numbers happen to reconcile.
  {
    const text = "Section 6.30. Indebtedness. The Company shall not incur Indebtedness in excess of $9,000,000.";
    const r = rule({ capacityExpression: money(9_000_000) });
    const input: VerificationInput = {
      compilerInput: testCompilerInput({
        operativeSourceText: text,
        operativeLineage: { operativeStatus: "OPERATIVE_STATE_CONFLICTED", currentSourceDocumentId: "sem-test-doc", supersedingAmendmentIds: ["amend-1", "amend-2"], effectiveDateResolution: "UNRESOLVED_CONFLICT" } as never,
      }),
      compilationResult: compilationResult({ rules: [r] }),
    };
    const v = await verifyCompiledCandidate(input, { skipSemanticReview: true });
    const conservative = v.status === "REVIEW_REQUIRED" || v.status === "MATERIAL_DISCREPANCY" || v.status === "VERIFICATION_INCOMPLETE";
    record({ name: "wrong-operative-version", faultInjected: "compiled rule's own operativeLineage.operativeStatus is OPERATIVE_STATE_CONFLICTED (an unresolved amendment dispute over which text currently governs) though the numbers reconcile cleanly", verdict: conservative ? "CAUGHT" : "MISSED", status: v.status, materialFindingTypes: v.findings.filter((f) => f.severity === "MATERIAL").map((f) => f.findingType), detail: `status must never be VERIFIED_NO_MATERIAL_GAP_FOUND/VERIFIED_WITH_NON_MATERIAL_FINDINGS when operative lineage is unresolved - got ${v.status}` });
  }

  const summary = { generatedAt: new Date().toISOString(), totalCases: results.length, caughtCount: results.filter((r) => r.verdict === "CAUGHT").length, missedCount: results.filter((r) => r.verdict === "MISSED").length, results };
  writeFileSync("/tmp/phase-3f1-6-section17-fault-injection-results.json", JSON.stringify(summary, null, 2));
  console.log(`\n${summary.caughtCount}/${summary.totalCases} CAUGHT, ${summary.missedCount}/${summary.totalCases} MISSED`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
