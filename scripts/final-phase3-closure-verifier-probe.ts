/**
 * FINAL PHASE 3 CLOSURE - Unit B Section 12 minimal real-model verifier
 * health probe. Wholly synthetic (testCompilerInput() fixture, no Superior
 * language). Calls the REAL production verifier path
 * (runAdversarialSemanticReview) with a real getStageCaller(), and - unlike
 * verifyCompiledCandidate/stage7-verification-results.json, which discards
 * SemanticReviewResult.failureDetail - prints it directly, so a genuine
 * provider/schema/transport failure is visible rather than silently lost.
 */
import { readFileSync } from "node:fs";
if (!process.env.AI_GATEWAY_API_KEY) {
  try {
    const envLocal = readFileSync(".env.local", "utf-8");
    const match = envLocal.match(/AI_GATEWAY_API_KEY=(.+)/);
    if (match) process.env.AI_GATEWAY_API_KEY = match[1]!.trim();
  } catch {
    // .env.local absent - getStageCaller()'s own real-credential check below will fail loudly.
  }
}

import { runAdversarialSemanticReview } from "../lib/contract-model/compiler/semantic-verification/reviewer";
import { getStageCaller } from "../lib/contract-model/compiler/llm-caller";
import { testCompilerInput } from "../tests/contract-model/semantic-compiler/test-helpers";
import type { ReconciliationResult, VerificationInput } from "../lib/contract-model/compiler/semantic-verification/types";
import type { SemanticCompilationResult } from "../lib/contract-model/compiler/semantic/types";

function compilationResult(overrides: Partial<SemanticCompilationResult> = {}): SemanticCompilationResult {
  return { status: "REVIEW_REQUIRED", failureReasons: [], errorDetail: null, rules: [], definitions: [], sharedCapacities: [], irExtensionCandidates: [], unresolvedIssues: [], toolCallLog: [], rawModelOutput: {}, provider: "test", model: "test-model", telemetry: null, cacheKey: "k", compiledAt: new Date().toISOString(), ...overrides };
}

const emptyReconciliation: ReconciliationResult = { candidateRef: "probe-candidate-1", items: [], materialUnresolvedCount: 0 };

async function main() {
  const caller = getStageCaller();
  console.log(JSON.stringify({ provider: caller.providerName, model: caller.model, synthetic: caller.isSynthetic }));
  if (caller.isSynthetic) {
    console.log(JSON.stringify({ verdict: "NO_REAL_CREDENTIAL" }));
    return;
  }
  const input: VerificationInput = { compilerInput: testCompilerInput(), compilationResult: compilationResult() };
  const start = Date.now();
  const result = await runAdversarialSemanticReview(input, emptyReconciliation, caller);
  const elapsedMs = Date.now() - start;
  console.log(
    JSON.stringify(
      {
        elapsedMs,
        failed: result.failed,
        failureDetail: result.failureDetail,
        findingsCount: result.findings.length,
        overallNotes: result.overallNotes,
        telemetry: result.telemetry,
        isSynthetic: result.isSynthetic,
      },
      null,
      2
    )
  );
}
main();
