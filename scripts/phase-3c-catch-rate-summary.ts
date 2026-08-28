/**
 * Phase 3C (task §31) - measures which fault-injection defect classes are
 * caught DETERMINISTIC_ONLY / SEMANTIC_ONLY / BOTH. Zero cost, synthetic,
 * deterministic - reuses the exact same scenario shapes as
 * tests/contract-model/semantic-verification-fault-injection.test.ts
 * (never a new, untested code path) purely to produce a printed summary
 * table for the final report.
 *
 * Run via: npx tsx scripts/phase-3c-catch-rate-summary.ts
 */
import { verifyCompiledCandidate } from "../lib/contract-model/compiler/semantic-verification/verify";
import type { StageCaller } from "../lib/contract-model/compiler/llm-caller";
import type { VerificationInput } from "../lib/contract-model/compiler/semantic-verification/types";
import type { SemanticCompilationResult } from "../lib/contract-model/compiler/semantic/types";
import type { IRExpression, IRRule } from "../lib/contract-model/ir/types";
import { testCompilerInput } from "../tests/contract-model/semantic-compiler/test-helpers";
import type { ZodType } from "zod";

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
  return { status: "REVIEW_REQUIRED", failureReasons: [], rules: [], definitions: [], sharedCapacities: [], irExtensionCandidates: [], unresolvedIssues: [], toolCallLog: [], rawModelOutput: {}, provider: "test", model: "test-model", telemetry: null, cacheKey: "k", compiledAt: new Date().toISOString(), ...overrides };
}
function money(amount: number): IRExpression {
  return { exprId: "e", kind: "MONEY", type: "MONEY", amount, currency: "USD" };
}
function fakeCaller(response: unknown): StageCaller {
  return { providerName: "test-provider", model: "test-model", isSynthetic: false, async call<T>(schema: ZodType<T>): Promise<T> { return schema.parse(response); }, lastTelemetry: () => null };
}

interface Scenario {
  name: string;
  text: string;
  ir: IRRule;
  reviewCaller?: StageCaller;
  forceSemanticReview?: boolean;
  skipSemanticReview?: boolean;
}

async function main() {
  const scenarios: Scenario[] = [
    { name: "wrong dollar threshold", text: "Indebtedness not to exceed $10,000,000.", ir: rule({ capacityExpression: money(99_000_000) }), skipSemanticReview: true },
    { name: "missing basket (structural)", text: "(a) not to exceed $1,000,000; (b) not to exceed $2,000,000.", ir: rule({ capacityExpression: money(1_000_000) }), skipSemanticReview: true },
    { name: "unsupported IR addition", text: "Investments in the ordinary course of business.", ir: rule({ capacityExpression: money(123_456) }), skipSemanticReview: true },
    {
      name: "wrong action (semantic-only)",
      text: "The Borrower may guarantee obligations of its Restricted Subsidiaries.",
      ir: rule({ action: "OTHER", capacityExpression: { kind: "UNLIMITED_CAPACITY", type: "CAPACITY", gatedBy: null } }),
      forceSemanticReview: true,
      reviewCaller: fakeCaller({ findings: [{ findingType: "WRONG_ACTION", severity: "MATERIAL", ruleOrDefinitionId: null, irPath: null, sourceEvidence: "guarantee", proposedIrEvidence: "OTHER", reasoning: "x" }], overallNotes: [] }),
    },
    {
      name: "numeric miss CONFIRMED by semantic review (BOTH)",
      text: "Indebtedness not to exceed $10,000,000.",
      ir: rule({ capacityExpression: money(99_000_000) }),
      forceSemanticReview: true,
      reviewCaller: fakeCaller({ findings: [{ findingType: "MISSING_BASKET", severity: "MATERIAL", ruleOrDefinitionId: null, irPath: null, sourceEvidence: "$10,000,000", proposedIrEvidence: "$99,000,000", reasoning: "confirms the deterministic mismatch and adds a source-grounded explanation" }], overallNotes: [] }),
    },
  ];

  const tally: Record<string, number> = { DETERMINISTIC_ONLY: 0, SEMANTIC_ONLY: 0, BOTH: 0 };
  console.log("=== Phase 3C fault-injection catch-rate classification (task §31) ===\n");
  for (const s of scenarios) {
    const input: VerificationInput = { compilerInput: testCompilerInput({ operativeSourceText: s.text }), compilationResult: compilationResult({ rules: [s.ir] }) };
    const result = await verifyCompiledCandidate(input, { reviewCaller: s.reviewCaller, forceSemanticReview: s.forceSemanticReview, skipSemanticReview: s.skipSemanticReview });
    const methods = result.findings.map((f) => f.verificationMethod);
    for (const m of methods) tally[m] = (tally[m] ?? 0) + 1;
    console.log(`${s.name}: status=${result.status} methods=[${methods.join(", ")}]`);
  }

  console.log("\n=== TOTALS ===");
  console.log(tally);
}

main();
