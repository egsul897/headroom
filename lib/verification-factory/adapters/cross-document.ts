/**
 * Adapter: reuse Agent 5 cross-document evaluator — no competing pathway.
 */

import {
  AUTHENTIC_PACKAGE_SCENARIOS,
  runAuthenticPackageScenario,
} from "@/lib/product/covenant-intelligence/cross-document-authentic-packages";
import {
  ADVERSARIAL_CROSS_DOCUMENT_SCENARIOS,
  runAdversarialScenario,
} from "@/lib/product/covenant-intelligence/cross-document-adversarial";
import {
  AUTHENTIC_CROSS_DOCUMENT_SCENARIOS,
  runCrossDocumentScenario,
} from "@/lib/product/covenant-intelligence/cross-document-scenarios";
import type { AdapterExecutionResult } from "../types";

export function runCrossDocumentAdapter(caseId: string): AdapterExecutionResult {
  const auth = AUTHENTIC_PACKAGE_SCENARIOS.find((s) => s.scenarioId === caseId);
  if (auth) {
    const run = runAuthenticPackageScenario(auth);
    return {
      adapter: "cross-document",
      actualLegalOutcome: run.actualOverall,
      falseFavorable: run.independentVerification.falsePermissionCount > 0,
      materialOmissions: run.groundTruthCoverage.missedSectionRefs,
      notes: [
        `expected=${run.expectedOverall}`,
        `matches=${run.matchesExpected}`,
        `authenticity=${run.authenticity}`,
      ],
      details: {
        expectedOverall: run.expectedOverall,
        matchesExpected: run.matchesExpected,
        falsePermissionCount: run.independentVerification.falsePermissionCount,
      },
    };
  }

  const synth = AUTHENTIC_CROSS_DOCUMENT_SCENARIOS.find((s) => s.scenarioId === caseId);
  if (synth) {
    const run = runCrossDocumentScenario(synth);
    return {
      adapter: "cross-document",
      actualLegalOutcome: run.actualOverall,
      falseFavorable: run.independentVerification.falsePermissionCount > 0,
      materialOmissions: [],
      notes: [`expected=${run.expectedOverall}`, `matches=${run.matchesExpected}`],
      details: {
        expectedOverall: run.expectedOverall,
        matchesExpected: run.matchesExpected,
      },
    };
  }

  const adv = ADVERSARIAL_CROSS_DOCUMENT_SCENARIOS.find((s) => s.scenarioId === caseId);
  if (adv) {
    const run = runAdversarialScenario(adv);
    return {
      adapter: "cross-document",
      actualLegalOutcome: run.actualOverall,
      falseFavorable: run.falsePermission,
      materialOmissions: [],
      notes: [`attack=${adv.attack}`, `expected=${run.expectedOverall}`],
      details: {
        expectedOverall: run.expectedOverall,
        matchesExpected: run.matchesExpected,
      },
    };
  }

  return {
    adapter: "cross-document",
    actualLegalOutcome: "ERROR",
    falseFavorable: false,
    materialOmissions: [],
    notes: [`Unknown cross-document caseId: ${caseId}`],
  };
}
