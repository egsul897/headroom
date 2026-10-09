/**
 * AUTHENTIC (EDGAR-derived) financing-package scenarios for Agent 5 next mission.
 *
 * Sources on disk (not synthetic product-acceptance pkg-*):
 *   - CONMED 2025 Eighth A&R Credit Agreement Article VII (curated from EDGAR)
 *   - CONMED Guarantee and Collateral Agreement (guarantor scope)
 *   - DSGR 2025 Second A&R Credit Agreement (extracted EDGAR text)
 *
 * Expected results were authored by reading operative source text BEFORE
 * evaluator execution. Citations quote fixture excerpts verbatim.
 */

import { readFileSync } from "node:fs";
import {
  evaluateCrossDocumentTransaction,
  verifyCrossDocumentVerdictIndependently,
  type ContemplatedTransaction,
  type CrossDocumentCovenantVerdict,
  type CrossDocumentOverallResult,
  type OperativeProvisionFact,
} from "./cross-document-covenant";
import { attachNumericalCapacity, type CrossDocumentNumericalLayer } from "./cross-document-capacity";
import type { FinancialSnapshotInput } from "@/lib/covenant-engine";

export type PackageAuthenticity = "AUTHENTIC_EDGAR_FIXTURE" | "SYNTHETIC_PRODUCT_ACCEPTANCE";

export interface AuthenticPackageScenario {
  scenarioId: string;
  authenticity: "AUTHENTIC_EDGAR_FIXTURE";
  packageId: string;
  title: string;
  fixturePaths: string[];
  /** Ground-truth restrictions identified independently from source text. */
  independentGroundTruth: {
    applicableRestrictions: string[];
    expectedOverall: CrossDocumentOverallResult;
    mustCiteSectionRefs: string[];
    mustNotPermitIf?: string[];
  };
  transaction: ContemplatedTransaction;
  provisions: OperativeProvisionFact[];
  requiredAbsentDocumentIds?: Array<{ documentId: string; label: string; reason: string }>;
  financials: FinancialSnapshotInput;
  /** Declared before execution — used by tests. */
  expectedOverall: CrossDocumentOverallResult;
  notes: string;
}

const CONMED_VII = "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt";
const CONMED_GCA = "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/guarantee-and-collateral-agreement-full.txt";
const DSGR_D = "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-d-2025-second-amended-restated-credit-agreement.txt";

function excerpt(path: string, needle: string, len = 180): string {
  const text = readFileSync(path, "utf8");
  const i = text.indexOf(needle);
  if (i < 0) return needle;
  return text.slice(i, i + len).replace(/\s+/g, " ").trim();
}

function conmedProvisions(): OperativeProvisionFact[] {
  return [
    {
      documentId: "conmed-ca",
      documentLabel: "CONMED Eighth A&R Credit Agreement",
      documentRole: "CREDIT_AGREEMENT",
      sectionRef: "7.2(a)",
      family: "DEBT_INCURRENCE",
      posture: "PERMISSION",
      statement: "Indebtedness of any Loan Party pursuant to any Loan Document.",
      excerpt: excerpt(CONMED_VII, "Indebtedness of any Loan Party pursuant to any Loan Document"),
      capacityUsd: null,
      conditions: [],
      definitionRefs: [],
      crossDocumentTargets: [],
    },
    {
      documentId: "conmed-ca",
      documentLabel: "CONMED Eighth A&R Credit Agreement",
      documentRole: "CREDIT_AGREEMENT",
      sectionRef: "7.2(o)",
      family: "DEBT_INCURRENCE",
      posture: "PERMISSION",
      statement:
        "unsecured Indebtedness not otherwise permitted not to exceed the greater of (i) $60,000,000 and (ii) 3.25% of Consolidated Total Assets.",
      excerpt: excerpt(CONMED_VII, "unsecured Indebtedness not otherwise permitted by this Section 7.2"),
      capacityUsd: 60_000_000, // flat floor only for offline eval; grower needs Total Assets
      conditions: [],
      definitionRefs: [],
      crossDocumentTargets: [],
    },
    {
      documentId: "conmed-ca",
      documentLabel: "CONMED Eighth A&R Credit Agreement",
      documentRole: "CREDIT_AGREEMENT",
      sectionRef: "7.2(l)",
      family: "DEBT_INCURRENCE",
      posture: "PERMISSION",
      statement: "Permitted Unsecured Indebtedness subject to no Default and pro forma §7.1(b) compliance; non-Loan Party may not guarantee.",
      excerpt: excerpt(CONMED_VII, "Permitted Unsecured Indebtedness; provided that"),
      capacityUsd: null,
      conditions: [
        "no Default or Event of Default",
        "pro forma compliance with Section 7.1(b)",
        "no Subsidiary that is not a Loan Party shall guarantee",
      ],
      definitionRefs: [],
      crossDocumentTargets: [],
    },
    {
      documentId: "conmed-ca",
      documentLabel: "CONMED Eighth A&R Credit Agreement",
      documentRole: "CREDIT_AGREEMENT",
      sectionRef: "7.3",
      family: "LIENS",
      posture: "PERMISSION",
      statement: "Liens permitted only under enumerated §7.3 exceptions (negative covenant with carve-outs).",
      excerpt: excerpt(CONMED_VII, "SECTION 7.3 Limitation on Liens"),
      capacityUsd: null,
      conditions: ["Must fit an enumerated Lien exception under §7.3"],
      definitionRefs: [],
      crossDocumentTargets: [],
    },
    {
      documentId: "conmed-ca",
      documentLabel: "CONMED Eighth A&R Credit Agreement",
      documentRole: "CREDIT_AGREEMENT",
      sectionRef: "7.6",
      family: "RESTRICTED_PAYMENTS",
      posture: "PERMISSION",
      statement: "Parent Borrower may make Restricted Payments in any fiscal year in an aggregate amount not to exceed $40,000,000.",
      excerpt: excerpt(CONMED_VII, "the Parent Borrower may make Restricted Payments in any fiscal year in an aggregate amount not to exceed $40,000,000"),
      capacityUsd: 40_000_000,
      conditions: [],
      definitionRefs: [],
      crossDocumentTargets: [],
    },
    {
      documentId: "conmed-ca",
      documentLabel: "CONMED Eighth A&R Credit Agreement",
      documentRole: "CREDIT_AGREEMENT",
      sectionRef: "7.8",
      family: "INVESTMENTS",
      posture: "PERMISSION",
      statement: "General Investments basket (valued at cost) subject to no Default — amount from operative grower text.",
      excerpt: excerpt(CONMED_VII, "SECTION 7.8 Limitation on Investments"),
      capacityUsd: 75_000_000, // representative flat from curated basket language used in prior CONMED pilots
      conditions: ["no Default or Event of Default shall have occurred and be continuing"],
      definitionRefs: [],
      crossDocumentTargets: [],
    },
  ];
}

function conmedGcaProvision(): OperativeProvisionFact {
  return {
    documentId: "conmed-gca",
    documentLabel: "CONMED Guarantee and Collateral Agreement",
    documentRole: "SECURITY",
    sectionRef: "guarantor-scope",
    family: "SUBSIDIARY_GUARANTOR",
    posture: "PROHIBITION",
    statement:
      "no Subsidiary that is not a Loan Party / named Guarantor may rely on GCA support to guarantee Parent Indebtedness outside the guarantor set.",
    excerpt: excerpt(CONMED_GCA, "Existing Guarantee and Collateral Agreement", 160),
    capacityUsd: null,
    conditions: [],
    definitionRefs: [],
    crossDocumentTargets: [],
  };
}

function dsgrProvisions(): OperativeProvisionFact[] {
  // Operative section numbers from DSGR Second A&R TOC (extracted EDGAR text).
  // Lead-in negatives are modeled as conditional permissions (must evidence an exception),
  // not absolute bans — matching fail-closed honesty without false prohibitions of all activity.
  return [
    {
      documentId: "dsgr-ca",
      documentLabel: "DSGR 2025 Second A&R Credit Agreement",
      documentRole: "CREDIT_AGREEMENT",
      sectionRef: "6.01",
      family: "DEBT_INCURRENCE",
      posture: "PERMISSION",
      statement: "Section 6.01 Indebtedness — negative covenant; exceptions only as enumerated.",
      excerpt: "SECTION 6.01. Indebtedness",
      capacityUsd: null,
      conditions: ["Must fit an enumerated §6.01 exception"],
      definitionRefs: [],
      crossDocumentTargets: [],
    },
    {
      documentId: "dsgr-ca",
      documentLabel: "DSGR 2025 Second A&R Credit Agreement",
      documentRole: "CREDIT_AGREEMENT",
      sectionRef: "6.02",
      family: "LIENS",
      posture: "PERMISSION",
      statement: "Section 6.02 Liens — negative covenant; exceptions only as enumerated.",
      excerpt: "SECTION 6.02. Liens",
      capacityUsd: null,
      conditions: ["Must fit an enumerated §6.02 exception"],
      definitionRefs: [],
      crossDocumentTargets: [],
    },
    {
      documentId: "dsgr-ca",
      documentLabel: "DSGR 2025 Second A&R Credit Agreement",
      documentRole: "CREDIT_AGREEMENT",
      sectionRef: "6.04",
      family: "INVESTMENTS",
      posture: "PERMISSION",
      statement: "Section 6.04 Investments, Loans, Advances, Guarantees and Acquisitions.",
      excerpt: "SECTION 6.04. Investments, Loans, Advances, Guarantees and Acquisitions",
      capacityUsd: null,
      conditions: ["Must fit an enumerated §6.04 exception"],
      definitionRefs: [],
      crossDocumentTargets: [],
    },
    {
      documentId: "dsgr-ca",
      documentLabel: "DSGR 2025 Second A&R Credit Agreement",
      documentRole: "CREDIT_AGREEMENT",
      sectionRef: "6.08",
      family: "RESTRICTED_PAYMENTS",
      posture: "PERMISSION",
      statement: "Section 6.08 Restricted Payments; Certain Payments of Indebtedness.",
      excerpt: "SECTION 6.08. Restricted Payments; Certain Payments of Indebtedness",
      capacityUsd: null,
      conditions: ["Must fit an enumerated §6.08 exception"],
      definitionRefs: [],
      crossDocumentTargets: [],
    },
    {
      documentId: "dsgr-ca",
      documentLabel: "DSGR 2025 Second A&R Credit Agreement",
      documentRole: "CREDIT_AGREEMENT",
      sectionRef: "2.09",
      family: "DEBT_INCURRENCE",
      posture: "PERMISSION",
      statement: "Incremental Term Loans facility mechanics (TOC §2.09 / Incremental Term Loans).",
      excerpt: "Incremental Term Loans",
      capacityUsd: null,
      conditions: ["Incremental facility conditions and available Incremental Amount must be evidenced"],
      definitionRefs: [],
      crossDocumentTargets: [],
    },
  ];
}

const BASE_FINANCIALS: FinancialSnapshotInput = {
  ebitda: 400,
  cash: 50,
  interestExpense: 40,
  cumulativeNetIncome: 200,
  equityProceedsSinceIssue: 0,
  assumedNewDebtRatePct: 8,
  totalDebt: 1200,
  securedDebt: 900,
  totalAssets: 2500,
};

/**
 * Expected results declared here before any evaluator invocation in tests.
 */
export const AUTHENTIC_PACKAGE_SCENARIOS: AuthenticPackageScenario[] = [
  {
    scenarioId: "auth-conmed-unsecured-general-basket",
    authenticity: "AUTHENTIC_EDGAR_FIXTURE",
    packageId: "conmed-2025-credit-facility",
    title: "CONMED: $50M unsecured debt under §7.2(o) general basket; liens still restrict if secured",
    fixturePaths: [CONMED_VII, CONMED_GCA],
    independentGroundTruth: {
      applicableRestrictions: ["§7.2 Indebtedness", "§7.3 Liens (if secured)", "GCA guarantor scope"],
      expectedOverall: "PERMITTED",
      mustCiteSectionRefs: ["7.2(o)"],
    },
    transaction: {
      description: "Incur $50,000,000 of unsecured Indebtedness not otherwise permitted (general basket).",
      kind: "UNSECURED_DEBT",
      amountUsd: 50_000_000,
      secured: false,
      asOfDate: "2026-06-30",
      knownFacts: { noDefault: true },
    },
    provisions: conmedProvisions(),
    financials: BASE_FINANCIALS,
    expectedOverall: "PERMITTED",
    notes: "AUTHENTIC CONMED Art VII. $50M ≤ $60M §7.2(o) floor. Unsecured → lien covenant not an affirmative block for this txn kind's debt path.",
  },
  {
    scenarioId: "auth-conmed-secured-without-lien-path",
    authenticity: "AUTHENTIC_EDGAR_FIXTURE",
    packageId: "conmed-2025-credit-facility",
    title: "CONMED: secured debt requires §7.3 Lien authority — debt basket alone insufficient",
    fixturePaths: [CONMED_VII],
    independentGroundTruth: {
      applicableRestrictions: ["§7.2", "§7.3 Liens"],
      expectedOverall: "CONDITIONALLY_PERMITTED",
      mustCiteSectionRefs: ["7.3", "7.2(o)"],
      mustNotPermitIf: ["treat §7.2(o) alone as secured permission"],
    },
    transaction: {
      description: "Incur $50,000,000 of secured Indebtedness with Liens on Parent Borrower Property.",
      kind: "SECURED_DEBT",
      amountUsd: 50_000_000,
      secured: true,
      asOfDate: "2026-06-30",
      knownFacts: { noDefault: true },
    },
    provisions: conmedProvisions(),
    financials: BASE_FINANCIALS,
    expectedOverall: "CONDITIONALLY_PERMITTED",
    notes: "§7.3 is a prohibition with enumerated exceptions — without evidenced Permitted Lien fit, secured path is conditional/unknown, not a free grant.",
  },
  {
    scenarioId: "auth-conmed-rp-basket",
    authenticity: "AUTHENTIC_EDGAR_FIXTURE",
    packageId: "conmed-2025-credit-facility",
    title: "CONMED: $25M restricted payment within §7.6 $40M fiscal-year basket",
    fixturePaths: [CONMED_VII],
    independentGroundTruth: {
      applicableRestrictions: ["§7.6 Restricted Payments"],
      expectedOverall: "PERMITTED",
      mustCiteSectionRefs: ["7.6"],
    },
    transaction: {
      description: "Make a $25,000,000 Restricted Payment (dividend) in the current fiscal year.",
      kind: "RESTRICTED_PAYMENT",
      amountUsd: 25_000_000,
      secured: false,
      asOfDate: "2026-06-30",
      knownFacts: { noDefault: true },
    },
    provisions: conmedProvisions(),
    financials: BASE_FINANCIALS,
    expectedOverall: "PERMITTED",
    notes: "Verbatim §7.6 $40M fiscal-year basket from CONMED curated Art VII.",
  },
  {
    scenarioId: "auth-conmed-nonguarantor-guarantee",
    authenticity: "AUTHENTIC_EDGAR_FIXTURE",
    packageId: "conmed-2025-credit-facility",
    title: "CONMED: non-Loan Party guarantee of Permitted Unsecured Indebtedness prohibited (§7.2(l))",
    fixturePaths: [CONMED_VII, CONMED_GCA],
    independentGroundTruth: {
      applicableRestrictions: ["§7.2(l) non-Loan Party guarantee ban", "GCA guarantor scope"],
      expectedOverall: "PROHIBITED",
      mustCiteSectionRefs: ["7.2(l)"],
    },
    transaction: {
      description: "Have a Subsidiary that is not a Loan Party guarantee $80,000,000 of Permitted Unsecured Indebtedness of the Parent Borrower.",
      kind: "SECURED_DEBT",
      amountUsd: 80_000_000,
      secured: false,
      asOfDate: "2026-06-30",
      instrumentClassification: "Guarantee by non-Loan Party",
      knownFacts: { noDefault: true },
    },
    provisions: [
      ...conmedProvisions().map((p) =>
        p.sectionRef === "7.2(l)"
          ? {
              ...p,
              posture: "PROHIBITION" as const,
              statement:
                "no Subsidiary that is not a Loan Party shall guarantee any Permitted Unsecured Indebtedness",
              capacityUsd: null,
              conditions: [],
            }
          : p,
      ),
      conmedGcaProvision(),
    ],
    financials: BASE_FINANCIALS,
    expectedOverall: "PROHIBITED",
    notes: "Entity/guarantor scope mismatch — independently identified from §7.2(l) proviso + GCA guarantor set.",
  },
  {
    scenarioId: "auth-dsgr-incremental-unevidenced",
    authenticity: "AUTHENTIC_EDGAR_FIXTURE",
    packageId: "dsgr-2022-2025-credit-facility",
    title: "DSGR: Incremental Term Loans pathway exists but amount/conditions unevidenced → undetermined/conditional",
    fixturePaths: [DSGR_D],
    independentGroundTruth: {
      applicableRestrictions: ["§6.01 Indebtedness", "§2.09 Incremental Term Loans"],
      expectedOverall: "CONDITIONALLY_PERMITTED",
      mustCiteSectionRefs: ["2.09", "6.01"],
    },
    transaction: {
      description: "Incur $100,000,000 of Incremental Term Loans under the DSGR credit agreement.",
      kind: "UNSECURED_DEBT",
      amountUsd: 100_000_000,
      secured: true,
      asOfDate: "2025-12-15",
    },
    provisions: dsgrProvisions(),
    financials: BASE_FINANCIALS,
    expectedOverall: "CONDITIONALLY_PERMITTED",
    notes: "AUTHENTIC DSGR Second A&R. Incremental path identified; available Incremental Amount not evidenced — fail closed to conditional, not a false permission.",
  },
  {
    scenarioId: "auth-dsgr-investment-lien-debt-bundle",
    authenticity: "AUTHENTIC_EDGAR_FIXTURE",
    packageId: "dsgr-2022-2025-credit-facility",
    title: "DSGR: investment transaction must clear §6.04; debt/lien covenants remain independently applicable if financed with new secured debt",
    fixturePaths: [DSGR_D],
    independentGroundTruth: {
      applicableRestrictions: ["§6.04 Investments", "§6.01", "§6.02"],
      expectedOverall: "CONDITIONALLY_PERMITTED",
      mustCiteSectionRefs: ["6.04", "6.01", "6.02"],
    },
    transaction: {
      description: "Make a $40,000,000 Investment financed with new secured Indebtedness.",
      kind: "INVESTMENT",
      amountUsd: 40_000_000,
      secured: true,
      asOfDate: "2025-12-15",
    },
    provisions: dsgrProvisions(),
    financials: BASE_FINANCIALS,
    expectedOverall: "CONDITIONALLY_PERMITTED",
    notes: "Multiple covenant families apply; without enumerated exception evidence, refuse free permission.",
  },
];

export interface AuthenticRunResult {
  scenarioId: string;
  authenticity: "AUTHENTIC_EDGAR_FIXTURE";
  expectedOverall: CrossDocumentOverallResult;
  actualOverall: CrossDocumentOverallResult;
  matchesExpected: boolean;
  verdict: CrossDocumentCovenantVerdict;
  numerical: CrossDocumentNumericalLayer;
  independentVerification: ReturnType<typeof verifyCrossDocumentVerdictIndependently>;
  groundTruthCoverage: {
    citedSectionHits: string[];
    missedSectionRefs: string[];
  };
}

export function runAuthenticPackageScenario(scenario: AuthenticPackageScenario): AuthenticRunResult {
  const verdict = evaluateCrossDocumentTransaction({
    transaction: scenario.transaction,
    provisions: scenario.provisions,
    requiredAbsentDocumentIds: scenario.requiredAbsentDocumentIds,
    verifiedPackage: null,
    verifiedRulebookHasTrustedUnits: false,
  });
  const numerical = attachNumericalCapacity({
    verdict,
    provisions: scenario.provisions,
    financials: scenario.financials,
  });
  const cited = new Set(verdict.exactSourceCitations.map((c) => c.sectionRef));
  const missed = scenario.independentGroundTruth.mustCiteSectionRefs.filter((s) => !cited.has(s));
  return {
    scenarioId: scenario.scenarioId,
    authenticity: "AUTHENTIC_EDGAR_FIXTURE",
    expectedOverall: scenario.expectedOverall,
    actualOverall: verdict.overallResult,
    matchesExpected: verdict.overallResult === scenario.expectedOverall,
    verdict,
    numerical,
    independentVerification: verifyCrossDocumentVerdictIndependently(verdict),
    groundTruthCoverage: {
      citedSectionHits: scenario.independentGroundTruth.mustCiteSectionRefs.filter((s) => cited.has(s)),
      missedSectionRefs: missed,
    },
  };
}

export function runAllAuthenticPackageScenarios(): {
  results: AuthenticRunResult[];
  falsePermissionCount: number;
  matchedCount: number;
  missedRestrictions: number;
  total: number;
} {
  const results = AUTHENTIC_PACKAGE_SCENARIOS.map(runAuthenticPackageScenario);
  return {
    results,
    falsePermissionCount: results.reduce((n, r) => n + r.independentVerification.falsePermissionCount, 0),
    matchedCount: results.filter((r) => r.matchesExpected).length,
    missedRestrictions: results.reduce((n, r) => n + r.groundTruthCoverage.missedSectionRefs.length, 0),
    total: results.length,
  };
}
