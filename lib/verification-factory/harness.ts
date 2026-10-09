/**
 * Unified CVF harness — dispatches to adapters that wrap existing engines.
 * Production semantics and certification gates are unchanged.
 */

import { CVF_VERSION } from "./version";
import type {
  CaseExecutionResult,
  CaseGrade,
  CiTier,
  ExpectedLegalOutcome,
  GroundTruthProvenance,
  VerificationCaseMeta,
} from "./types";
import { caseHasIndependentGroundTruth, validateGroundTruthProvenance } from "./provenance";
import { listExecutableRegistryCases } from "./corpus/registry";
import { runCrossDocumentAdapter } from "./adapters/cross-document";
import { runCapacityA8Adapter } from "./adapters/capacity-a8";
import { runSequentialConmedAdapter } from "./adapters/sequential";
import { runMetamorphicAdapter } from "./adapters/metamorphic";
import { aggregateMetrics, formatMetricsReport } from "./metrics";

function expectedFromMeta(meta: VerificationCaseMeta): ExpectedLegalOutcome | "SEALED" {
  if ("holdoutSealId" in meta.provenance) return "SEALED";
  return meta.provenance.expectedLegalOutcome;
}

function gradeCase(
  meta: VerificationCaseMeta,
  actual: string,
  falseFavorable: boolean,
  materialOmissions: string[],
  details?: Record<string, unknown>,
): CaseGrade {
  if (actual === "ERROR") return "ERROR";
  if (falseFavorable) return "INCORRECT_FAVORABLE";
  if (materialOmissions.length) return "MATERIAL_OMISSION";

  const expected = expectedFromMeta(meta);
  if (expected === "SEALED") return "UNRESOLVED";
  if (expected === "MATCH_BASELINE") {
    const det = details?.deterministic;
    if (det === false) return "UNSUPPORTED_SEMANTIC";
    return falseFavorable ? "INCORRECT_FAVORABLE" : "PASS_NEUTRAL";
  }
  if (expected === "AVAILABLE_FORBIDDEN") {
    return actual === "AVAILABLE_FORBIDDEN" ? "CORRECT_REFUSAL" : "INCORRECT_FAVORABLE";
  }

  const matches = details?.matchesExpected === true || actual === expected;
  const favorable = actual === "PERMITTED";
  const expectedFavorable = expected === "PERMITTED";

  if (matches && expectedFavorable) return "CORRECT_FAVORABLE";
  if (matches && !expectedFavorable) return "CORRECT_REFUSAL";
  if (!matches && favorable && !expectedFavorable) return "INCORRECT_FAVORABLE";
  if (!matches && !favorable && expectedFavorable) return "INCORRECT_REFUSAL";
  if (!matches) return "UNRESOLVED";
  return "PASS_NEUTRAL";
}

export function executeCase(meta: VerificationCaseMeta): CaseExecutionResult {
  const t0 = Date.now();
  if ("holdoutSealId" in meta.provenance) {
    return {
      caseId: meta.caseId,
      lane: meta.lane,
      fixtureClass: meta.fixtureClass,
      grade: "UNRESOLVED",
      expected: "SEALED",
      actual: "SEALED",
      falseFavorable: false,
      materialOmissions: [],
      structureFamilies: meta.structureFamilies,
      durationMs: Date.now() - t0,
      notes: ["Holdout sealed — not executed without HOLDOUT_UNLOCK"],
    };
  }

  const provCheck = validateGroundTruthProvenance(meta.provenance as GroundTruthProvenance);
  if (!provCheck.ok) {
    return {
      caseId: meta.caseId,
      lane: meta.lane,
      fixtureClass: meta.fixtureClass,
      grade: "ERROR",
      expected: expectedFromMeta(meta),
      actual: "ERROR",
      falseFavorable: false,
      materialOmissions: [],
      structureFamilies: meta.structureFamilies,
      durationMs: Date.now() - t0,
      notes: provCheck.errors,
    };
  }

  let adapterResult;
  switch (meta.adapter) {
    case "cross-document":
      adapterResult = runCrossDocumentAdapter(meta.caseId);
      break;
    case "capacity-a8":
      adapterResult = runCapacityA8Adapter(meta.caseId);
      break;
    case "sequential-conmed":
      adapterResult = runSequentialConmedAdapter(meta.caseId);
      break;
    case "metamorphic-cross-document":
      adapterResult = runMetamorphicAdapter(meta.caseId);
      break;
    default:
      adapterResult = {
        adapter: meta.adapter,
        actualLegalOutcome: "ERROR",
        falseFavorable: false,
        materialOmissions: [] as string[],
        notes: [`Adapter ${meta.adapter} not executable in PR harness`],
      };
  }

  const grade = gradeCase(
    meta,
    adapterResult.actualLegalOutcome,
    adapterResult.falseFavorable,
    adapterResult.materialOmissions,
    adapterResult.details,
  );

  return {
    caseId: meta.caseId,
    lane: meta.lane,
    fixtureClass: meta.fixtureClass,
    grade,
    expected: expectedFromMeta(meta),
    actual: adapterResult.actualLegalOutcome,
    falseFavorable: adapterResult.falseFavorable,
    materialOmissions: adapterResult.materialOmissions,
    structureFamilies: meta.structureFamilies,
    durationMs: Date.now() - t0,
    notes: adapterResult.notes,
  };
}

export function runHarness(args?: {
  caseIds?: string[];
  tier?: CiTier;
}): {
  version: typeof CVF_VERSION;
  tier: CiTier;
  results: CaseExecutionResult[];
  metrics: ReturnType<typeof aggregateMetrics>;
  metricsMarkdown: string;
  productionSemanticsUnchanged: true;
  certificationGatesUnchanged: true;
} {
  const tier = args?.tier ?? "PR_FAST";
  let cases = listExecutableRegistryCases().filter((c) => caseHasIndependentGroundTruth(c));
  if (args?.caseIds?.length) {
    const want = new Set(args.caseIds);
    cases = cases.filter((c) => want.has(c.caseId));
  }
  // PR_FAST: exclude long suites later; currently all registry executables are fast/offline.
  if (tier === "PR_FAST") {
    cases = cases.filter((c) => c.fixtureClass !== "NEWLY_ACQUIRED_UNSEEN");
  }

  const results = cases.map(executeCase);
  const metrics = aggregateMetrics(results);
  return {
    version: CVF_VERSION,
    tier,
    results,
    metrics,
    metricsMarkdown: formatMetricsReport(metrics),
    productionSemanticsUnchanged: true,
    certificationGatesUnchanged: true,
  };
}

/** CI tier → recommended vitest / harness entrypoints (provider-free). */
export const CI_TIER_PLAN: Record<
  CiTier,
  { providerCalls: 0; entrypoints: string[]; note: string }
> = {
  PR_FAST: {
    providerCalls: 0,
    entrypoints: [
      "tests/verification-factory/",
      "tests/contract-model/runtime/capacity/a8-gate-status-regression.test.ts",
      "tests/product/cross-document-*.test.ts",
    ],
    note: "Fast deterministic safety — does not replace canonical-compiler certified path.",
  },
  INTEGRATION_BATCH: {
    providerCalls: 0,
    entrypoints: [
      "npm run test:phase3-certification",
      "tests/product/",
      "tests/verification-factory/",
      "scripts/product-acceptance/run-all.ts",
    ],
    note: "Full certified + cross-document + acceptance corpus.",
  },
  SCHEDULED_EXTENSIVE: {
    providerCalls: 0,
    entrypoints: [
      "tests/certification/",
      "tests/foundation-audit/",
      "tests/solver/",
      "CVF combinatorial matrix (generate/first-1000-plan)",
    ],
    note: "Nightly extensive matrices — still provider-free unless explicitly budgeted.",
  },
  RELEASE_HOLDOUT: {
    providerCalls: 0,
    entrypoints: ["HOLDOUT_UNLOCK=1 cvf holdout scoring", "sealed evaluation-v2 / open4 holdouts"],
    note: "Periodic release gates only; expectations remain sealed from implementation agents.",
  },
};
