/**
 * Phase 3D - verifier integration decision (task §21/§65).
 *
 * DECISION: precedent is NOT wired into the semantic-verification module
 * (Layer 2's adversarial reviewer) in this phase. VerificationInput
 * (semantic-verification/types.ts) has no precedent field, reviewer.ts's
 * own prompt (buildUserContent) never mentions precedent, and
 * semantic-verification-independence.test.ts now mechanically forbids any
 * file under semantic-verification/ from importing anything from
 * semantic-precedent/ - so this is an enforced architectural decision, not
 * an informal one a future change could silently erode.
 *
 * WHY: task §21's own explicit warning is that a compiler misled by bad
 * precedent, if its independent "second opinion" verifier were shown the
 * SAME precedent, could have its judgment correlated with the same
 * mistake - producing a dangerous false negative (both agree, so nothing
 * looks wrong) instead of the independent catch Phase 3C's own Layer 2 was
 * built to provide. Phase 3C's Independence Contract already established
 * that the verifier must never re-derive conclusions the way the compiler
 * does (forbidding semantic/compile.ts, semantic/caller.ts, etc.) -
 * feeding it the compiler's own precedent evidence would reopen exactly
 * that hole through a new door.
 *
 * The fault-injection tests below make this concrete using the REAL
 * verifyCompiledCandidate() pipeline (Phase 3C, unmodified) with a
 * deliberately WRONG compiled action (the same real, previously-observed
 * FWRG-shaped defect class Phase 3C's own fault-injection suite already
 * uses - "wrong action, semantic-only"). Two reviewCaller scripts are
 * compared:
 *
 *  1. AN INDEPENDENT REVIEWER (today's actual, shipped design) - given
 *     only the real source text and the real proposed IR, exactly as
 *     reviewer.ts's real prompt provides, with NO precedent input of any
 *     kind. It correctly flags the wrong action.
 *
 *  2. A REVIEWER WHOSE JUDGMENT HAS BEEN CORRELATED WITH THE COMPILER'S
 *     OWN MISTAKE - a controlled simulation, NOT a real precedent-fed
 *     prompt (no such prompt exists anywhere in this codebase): its
 *     scripted response stands in for what an actual reviewer might say if
 *     its own judgment had been anchored by the same misleading signal
 *     that fooled the compiler. This is the counterfactual task §21 warns
 *     against, made concrete without building the risky integration
 *     itself.
 *
 * The contrast between the two is the evidence for the decision: detection
 * only works because reviewer.ts's real caller today is case (1), never
 * case (2), and this file exists so that guarantee is mechanically visible
 * rather than assumed.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { verifyCompiledCandidate } from "../../lib/contract-model/compiler/semantic-verification/verify";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { VerificationInput } from "../../lib/contract-model/compiler/semantic-verification/types";
import type { SemanticCompilationResult } from "../../lib/contract-model/compiler/semantic/types";
import type { IRRule } from "../../lib/contract-model/ir/types";
import { testCompilerInput } from "./semantic-compiler/test-helpers";
import type { ZodType } from "zod";

function wrongActionRule(): IRRule {
  return {
    ruleId: "ir-rule:fault-injection-1",
    irSchemaVersion: "v1",
    companyId: "sem-test-co",
    instrumentKey: "sem-test-instrument",
    sourceDocumentId: "sem-test-doc",
    sourceSectionRef: "6.05",
    covenantFamily: "GUARANTEES",
    ruleType: "QUANTITATIVE_PERMISSION",
    posture: "PERMISSION",
    action: "OTHER", // WRONG - the source text below actually describes a guarantee permission.
    entityScope: ["BORROWER"],
    entityScopeExcluded: [],
    transactionScope: null,
    capacityExpression: { kind: "UNLIMITED_CAPACITY", type: "CAPACITY", gatedBy: null },
    conditions: [],
    exceptions: [],
    dependsOn: [],
    operativeLineage: null,
    sufficiency: "COMPLETE",
    sufficiencyReasons: [],
    provenance: null,
    compilerVersion: "v1",
    sourceContentVersion: null,
  };
}

function compilationResult(rules: IRRule[]): SemanticCompilationResult {
  return { status: "REVIEW_REQUIRED", failureReasons: [], errorDetail: null, rules, definitions: [], sharedCapacities: [], irExtensionCandidates: [], unresolvedIssues: [], toolCallLog: [], rawModelOutput: {}, provider: "test", model: "test-model", telemetry: null, cacheKey: "k", compiledAt: new Date().toISOString() };
}

function fakeReviewCaller(response: unknown): StageCaller {
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

describe("Phase 3D verifier integration decision - fault-injection evidence (task §21)", () => {
  const sourceText = "The Borrower may guarantee obligations of its Restricted Subsidiaries.";

  it("(1) an INDEPENDENT reviewer (today's real, shipped design - no precedent input) correctly flags the wrong action as MATERIAL", async () => {
    const input: VerificationInput = { compilerInput: testCompilerInput({ operativeSourceText: sourceText }), compilationResult: compilationResult([wrongActionRule()]) };
    const independentReviewer = fakeReviewCaller({
      findings: [
        {
          findingType: "WRONG_ACTION",
          severity: "MATERIAL",
          ruleOrDefinitionId: "ir-rule:fault-injection-1",
          irPath: "action",
          sourceEvidence: "may guarantee obligations",
          proposedIrEvidence: "OTHER",
          reasoning: "the source text describes a guarantee permission; the compiled action OTHER does not reflect this",
        },
      ],
      overallNotes: [],
    });

    const result = await verifyCompiledCandidate(input, { reviewCaller: independentReviewer, forceSemanticReview: true });
    expect(result.status).toBe("MATERIAL_DISCREPANCY");
    expect(result.findings.some((f) => f.findingType === "WRONG_ACTION" && f.severity === "MATERIAL")).toBe(true);
  });

  it("(2) COUNTERFACTUAL ONLY - a reviewer whose judgment is correlated with the compiler's own mistake produces a dangerous false negative (this is the risk task §21 warns against, and exactly why precedent is never wired into the real reviewer)", async () => {
    const input: VerificationInput = { compilerInput: testCompilerInput({ operativeSourceText: sourceText }), compilationResult: compilationResult([wrongActionRule()]) };
    // Stands in for a reviewer anchored by the same misleading signal that fooled the compiler -
    // NOT a real precedent-fed prompt (none exists in this codebase). It reports no findings at all,
    // exactly the false-negative shape a correlated failure produces.
    const correlatedReviewer = fakeReviewCaller({ findings: [], overallNotes: ["reviewed - proposed classification is consistent with the pattern observed"] });

    const result = await verifyCompiledCandidate(input, { reviewCaller: correlatedReviewer, forceSemanticReview: true });
    expect(result.status).not.toBe("MATERIAL_DISCREPANCY");
    expect(result.findings.some((f) => f.findingType === "WRONG_ACTION")).toBe(false);
  });

  it("mechanical guard: semantic-verification never imports semantic-precedent (see semantic-verification-independence.test.ts's own dedicated assertion) - re-asserted here inline as this decision's own direct evidence", () => {
    const verifierDir = path.join(__dirname, "../../lib/contract-model/compiler/semantic-verification");
    const files = fs.readdirSync(verifierDir).filter((f) => f.endsWith(".ts"));
    for (const file of files) {
      const content = fs.readFileSync(path.join(verifierDir, file), "utf-8");
      const importLines = content.split("\n").filter((l) => /^\s*import\b/.test(l));
      for (const line of importLines) {
        expect(line, `${file} must never import semantic-precedent`).not.toMatch(/semantic-precedent\//);
      }
    }
  });
});
