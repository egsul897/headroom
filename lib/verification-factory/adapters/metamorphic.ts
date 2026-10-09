/**
 * Metamorphic / adversarial invariants over cross-document evaluation.
 * Only applies where legal assumptions hold; documented in each check.
 */

import {
  evaluateCrossDocumentTransaction,
  type ContemplatedTransaction,
  type CrossDocumentCovenantVerdict,
  type OperativeProvisionFact,
} from "@/lib/product/covenant-intelligence/cross-document-covenant";
import { AUTHENTIC_PACKAGE_SCENARIOS } from "@/lib/product/covenant-intelligence/cross-document-authentic-packages";
import type { AdapterExecutionResult } from "../types";

const FAVORABLE_RANK: Record<string, number> = {
  PERMITTED: 4,
  MULTIPLE_PATHWAYS: 3,
  CONDITIONALLY_PERMITTED: 2,
  UNDETERMINED: 1,
  PROHIBITED: 0,
};

function rank(outcome: string): number {
  return FAVORABLE_RANK[outcome] ?? -1;
}

function evalTxn(
  transaction: ContemplatedTransaction,
  provisions: OperativeProvisionFact[],
  requiredAbsent?: Array<{ documentId: string; label: string; reason: string }>,
): CrossDocumentCovenantVerdict {
  return evaluateCrossDocumentTransaction({
    transaction,
    provisions,
    requiredAbsentDocumentIds: requiredAbsent,
    verifiedPackage: null,
    verifiedRulebookHasTrustedUnits: false,
  });
}

/**
 * Invariant: removing a required source document must not improve legal permission.
 * Legal assumption: the removed document was independently applicable.
 */
export function invariantRemovingSourceDoesNotImprovePermission(): AdapterExecutionResult {
  const scenario = AUTHENTIC_PACKAGE_SCENARIOS.find((s) => s.scenarioId === "auth-gibraltar-secured-missing-ica")!;
  const baseline = evalTxn(scenario.transaction, scenario.provisions, scenario.requiredAbsentDocumentIds);
  // Drop ICA absence + strip intercreditor facts — if anything, should not become more favorable
  // than baseline when we *also* remove the ICA requirement signal incorrectly.
  // Stronger check: remove lien facts (applicable restriction) → must not become PERMITTED.
  const withoutLiens = scenario.provisions.filter((p) => p.family !== "LIENS" && p.family !== "INTERCREDITOR");
  const mutated = evalTxn(scenario.transaction, withoutLiens, scenario.requiredAbsentDocumentIds);
  // Removing applicable restrictions can incorrectly improve outcomes — that is a defect if it becomes PERMITTED
  // while ICA is still absent. Baseline is UNDETERMINED; mutated must not jump to PERMITTED.
  const improvedToPermit = mutated.overallResult === "PERMITTED" && baseline.overallResult !== "PERMITTED";
  return {
    adapter: "metamorphic-cross-document",
    actualLegalOutcome: mutated.overallResult,
    falseFavorable: improvedToPermit,
    materialOmissions: improvedToPermit ? ["Removing lien/ICA facts produced PERMITTED"] : [],
    notes: [
      `baseline=${baseline.overallResult}`,
      `afterRemovingLienAndIcaFacts=${mutated.overallResult}`,
      "Invariant: removing applicable restrictions must not create a free PERMITTED grant while required docs remain absent.",
    ],
  };
}

/**
 * Invariant: adding a restrictive AND-constraint must not silently produce a more favorable result.
 */
export function invariantAddingRestrictionDoesNotImprove(): AdapterExecutionResult {
  const scenario = AUTHENTIC_PACKAGE_SCENARIOS.find((s) => s.scenarioId === "auth-conmed-unsecured-general-basket")!;
  const baseline = evalTxn(scenario.transaction, scenario.provisions);
  const extra: OperativeProvisionFact = {
    documentId: "conmed-ca",
    documentLabel: "CONMED Eighth A&R Credit Agreement",
    documentRole: "CREDIT_AGREEMENT",
    sectionRef: "synthetic-extra-cap",
    family: "SHARED_CAPACITY",
    posture: "PROHIBITION",
    statement: "Synthetic shared-capacity prohibition for metamorphic test — shall not incur.",
    excerpt: "shall not incur",
    capacityUsd: null,
    conditions: [],
    definitionRefs: [],
    crossDocumentTargets: [],
  };
  const mutated = evalTxn(scenario.transaction, [...scenario.provisions, extra]);
  const improved = rank(mutated.overallResult) > rank(baseline.overallResult);
  return {
    adapter: "metamorphic-cross-document",
    actualLegalOutcome: mutated.overallResult,
    falseFavorable: improved,
    materialOmissions: [],
    notes: [
      `baseline=${baseline.overallResult}`,
      `withExtraProhibition=${mutated.overallResult}`,
      "Invariant: adding a restrictive shared-capacity prohibition must not improve favorability.",
    ],
  };
}

/**
 * Invariant: identical inputs → identical outcomes (determinism).
 */
export function invariantReplayIdentical(): AdapterExecutionResult {
  const scenario = AUTHENTIC_PACKAGE_SCENARIOS.find((s) => s.scenarioId === "auth-fwrg-nonloanparty-debt")!;
  const a = evalTxn(scenario.transaction, scenario.provisions);
  const b = evalTxn(scenario.transaction, scenario.provisions);
  const same =
    a.overallResult === b.overallResult &&
    JSON.stringify(a.exactSourceCitations) === JSON.stringify(b.exactSourceCitations);
  return {
    adapter: "metamorphic-cross-document",
    actualLegalOutcome: a.overallResult,
    falseFavorable: false,
    materialOmissions: [],
    notes: [`deterministic=${same}`, `outcome=${a.overallResult}`],
    details: { deterministic: same },
  };
}

export function runMetamorphicAdapter(caseId: string): AdapterExecutionResult {
  switch (caseId) {
    case "meta-remove-source-no-improve":
      return invariantRemovingSourceDoesNotImprovePermission();
    case "meta-add-restriction-no-improve":
      return invariantAddingRestrictionDoesNotImprove();
    case "meta-replay-identical":
      return invariantReplayIdentical();
    default:
      return {
        adapter: "metamorphic-cross-document",
        actualLegalOutcome: "ERROR",
        falseFavorable: false,
        materialOmissions: [],
        notes: [`Unknown metamorphic caseId: ${caseId}`],
      };
  }
}
