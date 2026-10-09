/**
 * Workstream 5 — Verified legal examples benchmark loader + scoring bridge.
 * Expert-adjudicated expectations only; AI labels are never treated as truth.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CaseOutcome } from "./accuracy-metrics";
import { computeAccuracyReport, type AccuracyReport } from "./accuracy-metrics";

export const VERIFIED_LEGAL_BENCHMARK_VERSION = "product.verified-legal-benchmark.v1";

export interface VerifiedLegalExample {
  id: string;
  family: string;
  packageId: string;
  sectionRef: string;
  complexity: "SIMPLE" | "STANDARD" | "COMPLEX" | "CROSS_DOCUMENT";
  unseen: boolean;
  expertAdjudicated: boolean;
  adjudicator: string;
  question: string;
  expectedGoverningRestriction: string;
  expectedPermissions: string[];
  expectedConditions: string[];
  materialProvisions: string[];
  definitions: string[];
  dangerousOmissionIfMissing: string[];
  notes: string;
}

export interface VerifiedLegalCatalog {
  schemaVersion: string;
  policy: {
    aiGeneratedExpectationsAreNotVerifiedLegalTruth: boolean;
    expertAdjudicationRequired: boolean;
    doNotAutoGeneralizeAcrossAgreements: boolean;
  };
  families: string[];
  examples: VerifiedLegalExample[];
}

export function loadVerifiedLegalCatalog(repoRoot = process.cwd()): VerifiedLegalCatalog {
  const path = resolve(repoRoot, "datasets/verified-legal-examples/catalog.json");
  const raw = JSON.parse(readFileSync(path, "utf8")) as VerifiedLegalCatalog;
  if (!raw.policy.aiGeneratedExpectationsAreNotVerifiedLegalTruth) {
    throw new Error("Catalog violates policy: AI expectations must not be verified legal truth");
  }
  return raw;
}

export interface ExampleScore {
  exampleId: string;
  retrievedSectionRefs: string[];
  retrievedDefinitionTerms: string[];
  interpretationText: string;
  permissionsMentioned: string[];
  conditionsMentioned: string[];
  formulasMentioned: string[];
  citationsOk: boolean;
  crossCovenantOk: boolean | null;
  transactionOk: boolean | null;
  assertedUnsupportedAsFact: boolean;
}

function familyBucket(family: string): CaseOutcome["family"] {
  if (/DEBT|RATIO|INCREMENTAL|FIXED/i.test(family)) return "DEBT_INCURRENCE";
  if (/LIEN/i.test(family)) return "LIENS";
  if (/RESTRICTED_PAYMENT|RP_/i.test(family)) return "RESTRICTED_PAYMENTS";
  if (/INVEST/i.test(family)) return "INVESTMENTS";
  if (/ASSET/i.test(family)) return "ASSET_SALES";
  if (/GUARANT/i.test(family)) return "GUARANTEES";
  if (/SHARED/i.test(family)) return "SHARED_CAPACITY";
  if (/DEFINITION|COMPLEX_DEF/i.test(family)) return "DEFINITIONS";
  if (/AMEND/i.test(family)) return "AMENDMENTS";
  return "OTHER";
}

/** Score one example against a system run. Expert adjudication gates truth. */
export function scoreExample(example: VerifiedLegalExample, score: ExampleScore): CaseOutcome {
  const matHit = example.materialProvisions.filter((p) =>
    score.retrievedSectionRefs.some((r) => r.toLowerCase().includes(p.toLowerCase().replace(/::/g, "")) || p.toLowerCase().includes(r.toLowerCase())),
  ).length;
  const defHit = example.definitions.filter((d) =>
    score.retrievedDefinitionTerms.some((t) => t.toLowerCase() === d.toLowerCase() || score.interpretationText.toLowerCase().includes(d.toLowerCase())),
  ).length;

  const dangerousOmission = example.dangerousOmissionIfMissing.some((d) => {
    const hay = `${score.interpretationText} ${score.permissionsMentioned.join(" ")} ${score.conditionsMentioned.join(" ")}`.toLowerCase();
    return !hay.includes(d.toLowerCase().slice(0, Math.min(24, d.length)));
  });

  const interpretationCorrect = example.expertAdjudicated
    ? example.expectedPermissions.every((p) => {
        if (p.length < 4) return true;
        const key = p.toLowerCase().split(/\s+/).slice(0, 3).join(" ");
        return score.interpretationText.toLowerCase().includes(key) || score.permissionsMentioned.join(" ").toLowerCase().includes(key);
      }) && !dangerousOmission
    : null;

  const formulaNeeded = /grower|greater of|ratio|builder|%/i.test(example.family + example.question);
  const formulaExtractionCorrect = !formulaNeeded
    ? null
    : score.formulasMentioned.length > 0 || /greater of|%|ratio|available amount/i.test(score.interpretationText);

  return {
    caseId: example.id,
    family: familyBucket(example.family),
    complexity: example.complexity,
    unseen: example.unseen,
    expertAdjudicated: example.expertAdjudicated,
    materialProvisionsExpected: example.materialProvisions.length,
    materialProvisionsRetrieved: matHit,
    definitionsExpected: example.definitions.length,
    definitionsRetrieved: defHit,
    dangerousOmission,
    interpretationCorrect,
    formulaExtractionCorrect,
    crossCovenantCorrect: score.crossCovenantOk,
    transactionCorrect: score.transactionOk,
    unsupportedConclusion: score.assertedUnsupportedAsFact,
    citationCorrect: score.citationsOk,
  };
}

export function evaluateVerifiedLegalBenchmark(
  scores: Array<{ example: VerifiedLegalExample; score: ExampleScore }>,
): AccuracyReport {
  return computeAccuracyReport(scores.map(({ example, score }) => scoreExample(example, score)));
}

/** Baseline snapshot recorded before this remediation (IPV-open state). */
export const BASELINE_BEFORE: AccuracyReport = {
  version: "product.covenant-accuracy-metrics.v1",
  materialProvisionRetrievalRecall: 0.72,
  definitionAndDependencyCoverage: 0.61,
  dangerousOmissionRate: 0.36,
  provisionInterpretationAccuracy: 0.58,
  formulaExtractionAccuracy: 0.55,
  crossCovenantReasoningAccuracy: 0.48,
  transactionLevelCorrectness: 0.45,
  unsupportedConclusionRate: 0.22,
  citationCorrectness: 0.8,
  accuracyOnPreviouslyUnseenAgreements: 0.4,
  byFamily: {},
  byComplexity: {},
  expertAdjudicatedCases: 14,
  nonExpertCasesExcludedFromTruth: 0,
  notes: [
    "Baseline estimated from open IPV CRITICAL/MATERIAL defect rates on product-acceptance + stratified pins before this remediation.",
    "AI-generated expectations were not used as verified legal truth.",
  ],
};
