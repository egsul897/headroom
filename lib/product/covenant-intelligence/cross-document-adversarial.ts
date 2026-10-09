/**
 * Adversarial cross-document scenarios — expected results declared BEFORE execution.
 * A false affirmative permission is a critical failure.
 *
 * Mix of synthetic stress cases (controlled) and authentic CONMED/DSGR excerpts.
 */

import {
  evaluateCrossDocumentTransaction,
  verifyCrossDocumentVerdictIndependently,
  type ContemplatedTransaction,
  type CrossDocumentOverallResult,
  type OperativeProvisionFact,
} from "./cross-document-covenant";
import { AUTHENTIC_CROSS_DOCUMENT_SCENARIOS } from "./cross-document-scenarios";

export interface AdversarialScenario {
  scenarioId: string;
  title: string;
  authenticity: "SYNTHETIC_PRODUCT_ACCEPTANCE" | "AUTHENTIC_EDGAR_FIXTURE";
  attack:
    | "OMITTED_RESTRICTION"
    | "STALE_AMENDMENT"
    | "DEFINITION_RECLASS"
    | "GUARANTOR_SCOPE"
    | "DEBT_WITHOUT_LIEN"
    | "DOUBLE_COUNT_SHARED"
    | "MISSING_ICA"
    | "MISSING_METRIC"
    | "UNVERIFIED_PATHWAY"
    | "CONFLICTING_CLASSIFICATION";
  /** Independent expected result — authored before evaluator run. */
  expectedOverall: CrossDocumentOverallResult;
  expectFalsePermission: false;
  transaction: ContemplatedTransaction;
  provisions: OperativeProvisionFact[];
  requiredAbsentDocumentIds?: Array<{ documentId: string; label: string; reason: string }>;
  notes: string;
}

function fromSynthetic(id: string): {
  provisions: OperativeProvisionFact[];
  baseTxn: ContemplatedTransaction;
} {
  const s = AUTHENTIC_CROSS_DOCUMENT_SCENARIOS.find((x) => x.scenarioId === id)!;
  return { provisions: s.provisions, baseTxn: s.transaction };
}

export const ADVERSARIAL_CROSS_DOCUMENT_SCENARIOS: AdversarialScenario[] = [
  {
    scenarioId: "adv-01-omitted-restriction",
    title: "Retrieval omits Indenture §4.09(a) CA cap — evaluator must not invent permission across docs when remaining facts still prohibit",
    authenticity: "SYNTHETIC_PRODUCT_ACCEPTANCE",
    attack: "OMITTED_RESTRICTION",
    expectedOverall: "PERMITTED", // if only CA Loan Documents path remains and indenture cap omitted — THIS IS THE TRAP
    expectFalsePermission: false,
    transaction: {
      description: "Incur additional $40,000,000 of Credit Agreement loans (unsecured increase under Loan Documents).",
      kind: "UNSECURED_DEBT",
      amountUsd: 40_000_000,
      secured: false,
      asOfDate: "2026-06-30",
      outstandingByInstrument: { "Credit Agreement": 130_000_000 },
    },
    // Intentionally omit indenture §4.09(a) — ground truth still prohibits; we expect UNDETERMINED or PROHIBITED only if other facts remain.
    // With omission, CA alone permits → PERMITTED is a FALSE PERMISSION vs full package. Test asserts we flag missing indenture when requiredAbsent is set.
    provisions: fromSynthetic("xd-01-permit-vs-prohibit").provisions.filter(
      (p) => !(p.documentId === "indenture" && p.sectionRef === "4.09(a)"),
    ),
    requiredAbsentDocumentIds: [
      {
        documentId: "indenture-4.09a-cap",
        label: "Indenture §4.09(a) Credit Agreement cap (omitted from retrieval)",
        reason: "Independent ground truth: Indenture §4.09(a) $150M CA cap is applicable and was omitted by retrieval.",
      },
    ],
    notes: "Expected UNDETERMINED because required restriction omitted — not PERMITTED.",
  },
  {
    scenarioId: "adv-02-stale-amendment",
    title: "Using pre-amendment §4.09(c) $50M after May 1, 2026 when supplemental restated to $75M",
    authenticity: "SYNTHETIC_PRODUCT_ACCEPTANCE",
    attack: "STALE_AMENDMENT",
    expectedOverall: "PROHIBITED",
    expectFalsePermission: false,
    transaction: {
      description: "Incur $60,000,000 of third-party unsecured Indebtedness as of 2026-06-30 using stale $50M basket text.",
      kind: "UNSECURED_DEBT",
      amountUsd: 60_000_000,
      secured: false,
      asOfDate: "2026-06-30",
    },
    // Force only stale $50M fact operative (strip post-amendment $75M) — CA still $30M → PROHIBITED
    provisions: fromSynthetic("xd-05-amendment-effect").provisions.filter(
      (p) => !(p.sectionRef === "4.09(c)" && p.effectiveOnOrAfter === "2026-05-01"),
    ).map((p) =>
      p.sectionRef === "4.09(c)"
        ? { ...p, supersededOnOrAfter: null, capacityUsd: 50_000_000 }
        : p,
    ),
    notes: "Stale indenture text understates capacity vs operative supplemental; CA $30M still prohibits $60M — no false permission.",
  },
  {
    scenarioId: "adv-03-definition-reclass",
    title: "Capital lease classification changes Indebtedness scope across agreements",
    authenticity: "SYNTHETIC_PRODUCT_ACCEPTANCE",
    attack: "DEFINITION_RECLASS",
    expectedOverall: "PERMITTED",
    expectFalsePermission: false,
    ...(() => {
      const s = AUTHENTIC_CROSS_DOCUMENT_SCENARIOS.find((x) => x.scenarioId === "xd-07-classification-divergence")!;
      return { transaction: s.transaction, provisions: s.provisions };
    })(),
    notes: "Reuse xd-07 — CA not applicable; Indenture clears. Not a false permission.",
  },
  {
    scenarioId: "adv-04-guarantor-scope",
    title: "Non-guarantor subsidiary cannot use Guarantor debt basket",
    authenticity: "SYNTHETIC_PRODUCT_ACCEPTANCE",
    attack: "GUARANTOR_SCOPE",
    expectedOverall: "PROHIBITED",
    expectFalsePermission: false,
    transaction: {
      description: "Foreign non-Guarantor Subsidiary incurs $40,000,000 Indebtedness relying on Guarantor basket §7.01(b).",
      kind: "UNSECURED_DEBT",
      amountUsd: 40_000_000,
      secured: false,
      asOfDate: "2026-09-01",
      instrumentClassification: "Non-Guarantor Subsidiary debt",
    },
    provisions: AUTHENTIC_CROSS_DOCUMENT_SCENARIOS.find((x) => x.scenarioId === "xd-03-debt-and-lien")!.provisions.map((p) =>
      p.sectionRef === "7.01(b)"
        ? {
            ...p,
            posture: "PROHIBITION" as const,
            statement: "§7.01(b) limited to Borrower and Guarantors — non-Guarantor Foreign Subsidiary cannot use this basket.",
            capacityUsd: null,
            conditions: [],
          }
        : p.sectionRef === "7.04"
          ? p
          : p,
    ),
    notes: "Guarantor scope mismatch — prohibit.",
  },
  {
    scenarioId: "adv-05-debt-without-lien",
    title: "Debt basket clears but lien basket / secured cap blocks",
    authenticity: "SYNTHETIC_PRODUCT_ACCEPTANCE",
    attack: "DEBT_WITHOUT_LIEN",
    expectedOverall: "PROHIBITED",
    expectFalsePermission: false,
    ...(() => {
      const s = AUTHENTIC_CROSS_DOCUMENT_SCENARIOS.find((x) => x.scenarioId === "xd-03-debt-and-lien")!;
      return { transaction: s.transaction, provisions: s.provisions };
    })(),
    notes: "xd-03 reuse — debt≠lien authority.",
  },
  {
    scenarioId: "adv-06-double-count-shared",
    title: "Shared §7.02(b)/§9.15 secured capacity must not be stacked",
    authenticity: "SYNTHETIC_PRODUCT_ACCEPTANCE",
    attack: "DOUBLE_COUNT_SHARED",
    expectedOverall: "PROHIBITED",
    expectFalsePermission: false,
    transaction: {
      description: "Incur $22,000,000 secured Indebtedness attempting to stack §7.02(b) $20M lien basket with separate §9.15 room.",
      kind: "SECURED_DEBT",
      amountUsd: 22_000_000,
      secured: true,
      asOfDate: "2026-09-01",
      knownFacts: { noDefault: true },
    },
    provisions: AUTHENTIC_CROSS_DOCUMENT_SCENARIOS.find((x) => x.scenarioId === "xd-03-debt-and-lien")!.provisions,
    notes: "$22M exceeds §7.02(b) $20M lien basket; §9.15 $25M does not create additive stack.",
  },
  {
    scenarioId: "adv-07-missing-ica",
    title: "Missing intercreditor blocks Term Loan lien determination",
    authenticity: "SYNTHETIC_PRODUCT_ACCEPTANCE",
    attack: "MISSING_ICA",
    expectedOverall: "UNDETERMINED",
    expectFalsePermission: false,
    ...(() => {
      const s = AUTHENTIC_CROSS_DOCUMENT_SCENARIOS.find((x) => x.scenarioId === "xd-06-absent-document")!;
      return {
        transaction: s.transaction,
        provisions: s.provisions,
        requiredAbsentDocumentIds: s.requiredAbsentDocumentIds,
      };
    })(),
    notes: "xd-06 reuse.",
  },
  {
    scenarioId: "adv-08-missing-metric",
    title: "Ratio-debt path without FCCR evidence is not a grant",
    authenticity: "SYNTHETIC_PRODUCT_ACCEPTANCE",
    attack: "MISSING_METRIC",
    expectedOverall: "PROHIBITED",
    expectFalsePermission: false,
    ...(() => {
      const s = AUTHENTIC_CROSS_DOCUMENT_SCENARIOS.find((x) => x.scenarioId === "xd-04-cross-section-definition")!;
      return { transaction: s.transaction, provisions: s.provisions };
    })(),
    notes: "xd-04 reuse — unavailable FCCR.",
  },
  {
    scenarioId: "adv-09-unverified-pathway",
    title: "Phase 4E NOT_CERTIFIED pathway must not become executable permission",
    authenticity: "SYNTHETIC_PRODUCT_ACCEPTANCE",
    attack: "UNVERIFIED_PATHWAY",
    expectedOverall: "CONDITIONALLY_PERMITTED",
    expectFalsePermission: false,
    ...(() => {
      const s = AUTHENTIC_CROSS_DOCUMENT_SCENARIOS.find((x) => x.scenarioId === "xd-08-multiple-pathways")!;
      return { transaction: s.transaction, provisions: s.provisions };
    })(),
    notes: "Conditional investment path; verifiedPackage null → NOT_CERTIFIED_4E unknowns remain.",
  },
  {
    scenarioId: "adv-10-conflicting-classification",
    title: "Conflicting Indebtedness definitions across CA vs Indenture",
    authenticity: "SYNTHETIC_PRODUCT_ACCEPTANCE",
    attack: "CONFLICTING_CLASSIFICATION",
    expectedOverall: "PERMITTED",
    expectFalsePermission: false,
    ...(() => {
      const s = AUTHENTIC_CROSS_DOCUMENT_SCENARIOS.find((x) => x.scenarioId === "xd-07-classification-divergence")!;
      return { transaction: s.transaction, provisions: s.provisions };
    })(),
    notes: "Document-specific classification — CA N/A; Indenture governs for Capital Lease.",
  },
];

// Fix adv-01 expected overall to UNDETERMINED (required absent restriction)
ADVERSARIAL_CROSS_DOCUMENT_SCENARIOS[0]!.expectedOverall = "UNDETERMINED";

export function runAdversarialScenario(scenario: AdversarialScenario) {
  const verdict = evaluateCrossDocumentTransaction({
    transaction: scenario.transaction,
    provisions: scenario.provisions,
    requiredAbsentDocumentIds: scenario.requiredAbsentDocumentIds,
    verifiedPackage: null,
  });
  const verification = verifyCrossDocumentVerdictIndependently(verdict);
  const falsePermission =
    verification.falsePermissionCount > 0 ||
    ((verdict.overallResult === "PERMITTED" || verdict.overallResult === "MULTIPLE_PATHWAYS") &&
      scenario.expectedOverall !== "PERMITTED" &&
      scenario.expectedOverall !== "MULTIPLE_PATHWAYS");
  return {
    scenarioId: scenario.scenarioId,
    attack: scenario.attack,
    expectedOverall: scenario.expectedOverall,
    actualOverall: verdict.overallResult,
    matchesExpected: verdict.overallResult === scenario.expectedOverall,
    falsePermission,
    independentVerification: verification,
    verdict,
  };
}

export function runAllAdversarialScenarios() {
  const results = ADVERSARIAL_CROSS_DOCUMENT_SCENARIOS.map(runAdversarialScenario);
  return {
    results,
    falsePermissionCount: results.filter((r) => r.falsePermission).length,
    matchedCount: results.filter((r) => r.matchesExpected).length,
    total: results.length,
  };
}
