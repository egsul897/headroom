/**
 * Run independently grounded boundary cases against production cross-document evaluator.
 * Amounts/expectations come from frozen provenance — not from engine predictions.
 */

import {
  AUTHENTIC_PACKAGE_SCENARIOS,
  runAuthenticPackageScenario,
  type AuthenticPackageScenario,
} from "@/lib/product/covenant-intelligence/cross-document-authentic-packages";
import {
  ADVERSARIAL_CROSS_DOCUMENT_SCENARIOS,
  runAdversarialScenario,
} from "@/lib/product/covenant-intelligence/cross-document-adversarial";
import {
  AUTHENTIC_CROSS_DOCUMENT_SCENARIOS,
  runCrossDocumentScenario,
} from "@/lib/product/covenant-intelligence/cross-document-scenarios";
import { evaluateCrossDocumentTransaction } from "@/lib/product/covenant-intelligence/cross-document-covenant";
import { verifyCrossDocumentVerdictIndependently } from "@/lib/product/covenant-intelligence/cross-document-covenant";
import {
  BOUNDARY_ADAPTER_REMAP,
  listNativeBoundarySpecs,
} from "../corpus/grounded-expansion";
import type { AdapterExecutionResult } from "../types";

function baseScenarioForPackage(packageId: string, kind: string): AuthenticPackageScenario | undefined {
  return (
    AUTHENTIC_PACKAGE_SCENARIOS.find((s) => s.packageId === packageId && String(s.transaction.kind) === kind) ??
    AUTHENTIC_PACKAGE_SCENARIOS.find((s) => s.packageId === packageId)
  );
}

function runRemappedId(remap: string): AdapterExecutionResult | null {
  const auth = AUTHENTIC_PACKAGE_SCENARIOS.find((s) => s.scenarioId === remap);
  if (auth) {
    const run = runAuthenticPackageScenario(auth);
    return {
      adapter: "grounded-boundary",
      actualLegalOutcome: run.actualOverall,
      falseFavorable: run.independentVerification.falsePermissionCount > 0,
      materialOmissions: run.groundTruthCoverage.missedSectionRefs,
      notes: [`remapped:${remap}`, `expected=${run.expectedOverall}`, `matches=${run.matchesExpected}`],
      details: {
        expectedOverall: run.expectedOverall,
        matchesExpected: run.matchesExpected,
      },
    };
  }
  const synth = AUTHENTIC_CROSS_DOCUMENT_SCENARIOS.find((s) => s.scenarioId === remap);
  if (synth) {
    const run = runCrossDocumentScenario(synth);
    return {
      adapter: "grounded-boundary",
      actualLegalOutcome: run.actualOverall,
      falseFavorable: run.independentVerification.falsePermissionCount > 0,
      materialOmissions: [],
      notes: [`remapped:${remap}`, `expected=${run.expectedOverall}`, `matches=${run.matchesExpected}`],
      details: {
        expectedOverall: run.expectedOverall,
        matchesExpected: run.matchesExpected,
      },
    };
  }
  const adv = ADVERSARIAL_CROSS_DOCUMENT_SCENARIOS.find((s) => s.scenarioId === remap);
  if (adv) {
    const run = runAdversarialScenario(adv);
    return {
      adapter: "grounded-boundary",
      actualLegalOutcome: run.actualOverall,
      falseFavorable: run.falsePermission,
      materialOmissions: [],
      notes: [`remapped:${remap}`, `attack=${adv.attack}`, `expected=${run.expectedOverall}`],
      details: {
        expectedOverall: run.expectedOverall,
        matchesExpected: run.matchesExpected,
      },
    };
  }
  return null;
}

export function runGroundedBoundaryAdapter(caseId: string): AdapterExecutionResult {
  const remap = BOUNDARY_ADAPTER_REMAP[caseId];
  if (remap) {
    const remapped = runRemappedId(remap);
    if (remapped) return remapped;
    return {
      adapter: "grounded-boundary",
      actualLegalOutcome: "ERROR",
      falseFavorable: false,
      materialOmissions: [],
      notes: [`Remap target missing: ${remap}`],
    };
  }

  const spec = listNativeBoundarySpecs().find((b) => b.caseId === caseId);
  if (!spec) {
    return {
      adapter: "grounded-boundary",
      actualLegalOutcome: "ERROR",
      falseFavorable: false,
      materialOmissions: [],
      notes: [`Unknown grounded boundary: ${caseId}`],
    };
  }

  const base = baseScenarioForPackage(spec.packageId, spec.kind);
  if (!base) {
    return {
      adapter: "grounded-boundary",
      actualLegalOutcome: "ERROR",
      falseFavorable: false,
      materialOmissions: [],
      notes: [`No authentic base package for ${spec.packageId}`],
    };
  }

  const exclude = new Set(spec.excludeSectionRefs ?? []);
  const provisions =
    exclude.size === 0
      ? base.provisions
      : base.provisions.filter((p) => !exclude.has(p.sectionRef));

  const transaction = {
    ...base.transaction,
    amountUsd: spec.amountUsd,
    kind: spec.kind as typeof base.transaction.kind,
    description: spec.title,
    knownFacts: {
      ...(base.transaction.knownFacts ?? {}),
      ...(spec.knownFacts ?? {}),
    },
  };

  const verdict = evaluateCrossDocumentTransaction({
    transaction,
    provisions,
    requiredAbsentDocumentIds: base.requiredAbsentDocumentIds,
    verifiedPackage: null,
    verifiedRulebookHasTrustedUnits: false,
  });
  const verification = verifyCrossDocumentVerdictIndependently(verdict);
  const matchesExpected = verdict.overallResult === spec.expected;
  const falseFavorable =
    verification.falsePermissionCount > 0 ||
    (verdict.overallResult === "PERMITTED" && spec.expected !== "PERMITTED");

  return {
    adapter: "grounded-boundary",
    actualLegalOutcome: verdict.overallResult,
    falseFavorable,
    materialOmissions: [],
    notes: [
      `native-boundary amount=${spec.amountUsd}`,
      `threshold=${spec.thresholdUsd}`,
      `position=${spec.position}`,
      `expected=${spec.expected}`,
      `matches=${matchesExpected}`,
      exclude.size ? `excludeSections=${[...exclude].join(",")}` : "excludeSections=none",
      spec.knownFacts ? `knownFacts=${JSON.stringify(spec.knownFacts)}` : "knownFacts=none",
    ],
    details: {
      expectedOverall: spec.expected,
      matchesExpected,
      evaluated: verdict.documentVerdicts.flatMap((d) =>
        d.evaluatedRestrictions.map((e) => ({
          sectionRef: e.sectionRef,
          family: e.family,
          stance: e.stance,
        })),
      ),
    },
  };
}
