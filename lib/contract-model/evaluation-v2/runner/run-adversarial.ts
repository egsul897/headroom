/**
 * Evaluation Methodology V2 — adversarial synthetic suite runner.
 *
 * Phase 3F.1.5. Executes the same case list the vitest suite enforces
 * (tests/evaluation-v2/adversarial-cases.ts) and publishes the result as
 * 03-adversarial-suite-results.json, so the published evidence and the enforced
 * regression can never drift apart.
 *
 * Deterministic-only: no network, no cost.
 *
 * Run: npx tsx lib/contract-model/evaluation-v2/runner/run-adversarial.ts
 */
import { ADVERSARIAL_CASES } from "@/tests/evaluation-v2/adversarial-cases";
import { candidate, gt, SYNTHETIC_DATASET } from "@/tests/evaluation-v2/synthetic-fixtures";

import { runEvaluationV2 } from "../index";
import type { MatchStatus } from "../types";
import { artifactHeader, writeArtifact } from "./artifacts";

const CREDITED: MatchStatus[] = ["EXACT_SINGLE", "EXACT_COMPOSITE"];

export async function runAdversarial(repoRoot: string): Promise<{ passed: number; failed: number; writtenArtifacts: { path: string; sha256: string; bytes: number }[] }> {
  const results = [];
  let passed = 0;
  let failed = 0;

  for (const testCase of ADVERSARIAL_CASES) {
    const run = await runEvaluationV2([gt(testCase.gt)], testCase.candidates.map(candidate), { datasetKey: SYNTHETIC_DATASET });
    const unit = run.units[0];
    if (!unit) continue;
    const isCredited = CREDITED.includes(unit.matchStatus);
    const failures: string[] = [];
    if (isCredited !== testCase.expectation.credited) failures.push(`expected credited=${testCase.expectation.credited}, got matchStatus=${unit.matchStatus}`);
    if (testCase.expectation.allowedMatchStatuses && !testCase.expectation.allowedMatchStatuses.includes(unit.matchStatus)) {
      failures.push(`matchStatus ${unit.matchStatus} not in [${testCase.expectation.allowedMatchStatuses.join(", ")}]`);
    }
    const codes = unit.pairAssessments.flatMap((p) => p.conflicts.map((c) => c.code));
    for (const required of testCase.expectation.requiredConflictCodes ?? []) {
      if (!codes.includes(required)) failures.push(`missing expected conflict ${required}`);
    }
    if (testCase.expectation.dangerousUnaccounted !== undefined && unit.dangerousUnaccountedV2 !== testCase.expectation.dangerousUnaccounted) {
      failures.push(`dangerousUnaccountedV2=${unit.dangerousUnaccountedV2}, expected ${testCase.expectation.dangerousUnaccounted}`);
    }
    if (failures.length === 0) passed += 1;
    else failed += 1;

    results.push({
      caseId: testCase.caseId,
      category: testCase.category,
      control: testCase.control,
      description: testCase.description,
      groundTruth: { sectionRef: testCase.gt.sectionRef, unitType: testCase.gt.unitType ?? "COVENANT", materiality: testCase.gt.materiality ?? "CRITICAL", excerpt: testCase.gt.text },
      candidates: testCase.candidates.map((c) => ({ candidateId: c.id, sectionRef: c.sectionRef, documentId: c.documentId ?? "synthetic-doc-a", declaredRole: c.declaredRole ?? null, accountingRole: c.accountingRole ?? "SUBSTANTIVE_REPRESENTATION", excerpt: c.text })),
      expectation: testCase.expectation,
      observed: {
        matchStatus: unit.matchStatus,
        representationStatus: unit.representationStatus,
        semanticCorrectness: unit.semanticCorrectness,
        dangerousUnaccountedV2: unit.dangerousUnaccountedV2,
        explicitlySurfacedAsUnsafe: unit.explicitlySurfacedAsUnsafe,
        matchedCandidateIds: unit.matchedCandidateIds,
        reason: unit.reasonForCredit ?? unit.reasonForPartialCredit ?? unit.reasonForNoCredit ?? "",
        pairs: unit.pairAssessments.map((p) => ({
          candidateId: p.candidateId,
          correspondence: p.correspondence,
          correspondenceStrength: p.correspondenceStrength,
          dimensionOutcomes: Object.fromEntries(p.dimensions.map((d) => [d.dimension, d.outcome])),
          conflicts: p.conflicts.map((c) => ({ code: c.code, severity: c.severity, dimension: c.dimension, explanation: c.explanation })),
          reason: p.reason,
        })),
      },
      verdict: failures.length === 0 ? "PASS" : "FAIL",
      failures,
    });
  }

  const byCategory: Record<string, { positive: number; negative: number }> = {};
  for (const c of ADVERSARIAL_CASES) {
    const entry = byCategory[c.category] ?? { positive: 0, negative: 0 };
    if (c.control === "POSITIVE") entry.positive += 1;
    else entry.negative += 1;
    byCategory[c.category] = entry;
  }

  const written = [
    writeArtifact(repoRoot, "03-adversarial-suite-results.json", {
      ...artifactHeader(
        "PHASE_3F_1_5_ADVERSARIAL_SUITE_RESULTS",
        "The adversarial synthetic suite: every case isolates one semantic distinction, with positive and negative controls throughout. All drafting is invented; nothing is copied from or tuned to any real package. Enforced permanently by tests/evaluation-v2/adversarial-suite.test.ts.",
      ),
      mode: "DETERMINISTIC_ONLY (no model calls, zero cost, fully reproducible)",
      totals: { cases: results.length, passed, failed, positiveControls: ADVERSARIAL_CASES.filter((c) => c.control === "POSITIVE").length, negativeControls: ADVERSARIAL_CASES.filter((c) => c.control === "NEGATIVE").length },
      byCategory,
      whyPositiveControlsMatter:
        "An evaluator that refuses every candidate would pass every negative control and be useless. The positive controls — semantically equivalent drafting with different wording, a preserved greater-of cap, a preserved condition, a correctly represented chapeau, a genuine composite match, honest UNSUPPORTED/UNRESOLVED declarations — are what prove the refusals are discriminating rather than blanket.",
      cases: results,
    }),
  ];

  return { passed, failed, writtenArtifacts: written };
}

if (process.argv[1] && process.argv[1].endsWith("run-adversarial.ts")) {
  void runAdversarial(process.cwd()).then((out) => {
    console.log(`Adversarial suite: ${out.passed} passed, ${out.failed} failed.`);
    for (const a of out.writtenArtifacts) console.log(`  wrote ${a.path} (${a.bytes} bytes)`);
  });
}
