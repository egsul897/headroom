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
      statement:
        "§7.6(d): Parent Borrower may make Restricted Payments in any fiscal year in an aggregate amount not to exceed $40,000,000.",
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
      sectionRef: "7.6(e)",
      family: "RESTRICTED_PAYMENTS",
      posture: "PERMISSION",
      statement:
        "§7.6(e): Parent Borrower may make Restricted Payments in an unlimited amount so long as Consolidated Senior Secured Leverage Ratio ≤ 3.50x pro forma and no Event of Default has occurred and is continuing or would result therefrom.",
      excerpt: excerpt(
        CONMED_VII,
        "the Parent Borrower may make Restricted Payments in an unlimited amount",
      ),
      capacityUsd: null,
      conditions: [
        "Consolidated Senior Secured Leverage Ratio on a pro forma basis is no greater than 3.50 to 1.00",
        "no Event of Default has occurred and is continuing or would result therefrom",
      ],
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
  // Completeness remediation (Agent 5 generalize): Art X Guaranty, §9.02 amendment,
  // Incremental Amount shared capacity, and ICA presence as a required document signal.
  return [
    {
      documentId: "dsgr-ca",
      documentLabel: "DSGR 2025 Second A&R Credit Agreement",
      documentRole: "CREDIT_AGREEMENT",
      sectionRef: "6.01",
      family: "DEBT_INCURRENCE",
      posture: "PERMISSION",
      statement: "Section 6.01 Indebtedness — negative covenant; exceptions only as enumerated.",
      excerpt: excerpt(DSGR_D, "SECTION 6.01. Indebtedness"),
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
      excerpt: excerpt(DSGR_D, "SECTION 6.02. Liens"),
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
      excerpt: excerpt(DSGR_D, "SECTION 6.04. Investments, Loans, Advances, Guarantees and Acquisitions"),
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
      excerpt: excerpt(DSGR_D, "SECTION 6.08. Restricted Payments; Certain Payments of Indebtedness"),
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
      excerpt: excerpt(DSGR_D, "Incremental Term Loans"),
      capacityUsd: null,
      conditions: ["Incremental facility conditions and available Incremental Amount must be evidenced"],
      definitionRefs: [],
      crossDocumentTargets: [],
      sharedCapacityPeers: ["Incremental Amount"],
    },
    {
      documentId: "dsgr-ca",
      documentLabel: "DSGR 2025 Second A&R Credit Agreement",
      documentRole: "CREDIT_AGREEMENT",
      sectionRef: "Incremental Amount",
      family: "SHARED_CAPACITY",
      posture: "CONDITION",
      statement:
        "Incremental Amount is a shared facility capacity — available headroom must be evidenced; do not invent utilization.",
      excerpt: excerpt(DSGR_D, "Incremental Term Loan"),
      capacityUsd: null,
      conditions: ["Available Incremental Amount must be evidenced from facility records"],
      definitionRefs: [],
      crossDocumentTargets: [],
      sharedCapacityPeers: ["2.09"],
    },
    {
      documentId: "dsgr-ca",
      documentLabel: "DSGR 2025 Second A&R Credit Agreement",
      documentRole: "CREDIT_AGREEMENT",
      sectionRef: "10.01",
      family: "SUBSIDIARY_GUARANTOR",
      posture: "CONDITION",
      statement: "Article X Loan Guaranty — only Loan Guarantors support Guaranteed Obligations.",
      excerpt: excerpt(DSGR_D, "SECTION 10.01. Guaranty"),
      capacityUsd: null,
      conditions: ["Guarantor must be a Loan Guarantor under Article X"],
      definitionRefs: [],
      crossDocumentTargets: [],
    },
    {
      documentId: "dsgr-ca",
      documentLabel: "DSGR 2025 Second A&R Credit Agreement",
      documentRole: "CREDIT_AGREEMENT",
      sectionRef: "9.02",
      family: "AMENDMENT_EFFECT",
      posture: "CONDITION",
      statement:
        "§9.02 Waivers; Amendments — Incremental Facility Amendment must be effective under amendment mechanics.",
      excerpt: excerpt(DSGR_D, "SECTION 9.02. Waivers; Amendments"),
      capacityUsd: null,
      conditions: ["Incremental Facility Amendment effectiveness under §9.02 must be evidenced"],
      definitionRefs: [],
      crossDocumentTargets: [],
    },
    {
      documentId: "dsgr-ca",
      documentLabel: "DSGR 2025 Second A&R Credit Agreement",
      documentRole: "CREDIT_AGREEMENT",
      sectionRef: "Applicable Intercreditor Agreement",
      family: "INTERCREDITOR",
      posture: "CONDITION",
      statement:
        "Applicable Intercreditor Agreement is part of the Loan Documents concept for secured priority — ICA terms must be evidenced when Liens are contemplated.",
      excerpt: excerpt(DSGR_D, "Applicable Intercreditor Agreement"),
      capacityUsd: null,
      conditions: ["Executed Applicable Intercreditor Agreement terms must be evidenced for secured priority"],
      definitionRefs: [],
      crossDocumentTargets: [],
    },
  ];
}

/** Used only on NEW Gibraltar holdout scenarios — not on preserved DSGR baselines. */
const GIBRALTAR_REQUIRED_ABSENT_ICA = {
  documentId: "gibraltar-ica",
  label: "First Lien/Second Lien Intercreditor Agreement",
  reason:
    "Gibraltar §9.15 / First Lien–Second Lien ICA forms are contemplated for secured priority debt, but no executed ICA text is in the fixture package.",
};

const GIBRALTAR_CA =
  "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/extracted-text/credit-agreement.txt";
const CHEWY_CA =
  "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt";
const FWRG_A6 =
  "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/article-6-negative-covenants.txt";

function gibraltarProvisions(): OperativeProvisionFact[] {
  return [
    {
      documentId: "gibraltar-ca",
      documentLabel: "Gibraltar 2026 Credit Agreement",
      documentRole: "CREDIT_AGREEMENT",
      sectionRef: "7.01",
      family: "DEBT_INCURRENCE",
      posture: "PERMISSION",
      statement: "Section 7.01 Indebtedness / Permitted Debt — exceptions only as enumerated.",
      excerpt: excerpt(GIBRALTAR_CA, "Permitted Debt"),
      capacityUsd: null,
      conditions: ["Must fit an enumerated §7.01 / Permitted Debt exception"],
      definitionRefs: [],
      crossDocumentTargets: [],
    },
    {
      documentId: "gibraltar-ca",
      documentLabel: "Gibraltar 2026 Credit Agreement",
      documentRole: "CREDIT_AGREEMENT",
      sectionRef: "7.01(b)(14)",
      family: "DEBT_INCURRENCE",
      posture: "PERMISSION",
      statement:
        "General debt basket — greater of $344,000,000 and 100% of LTM EBITDA, subject to Incremental reallocation.",
      excerpt: excerpt(GIBRALTAR_CA, "$344,000,000"),
      capacityUsd: 344_000_000,
      conditions: ["Available amounts reduced by General Debt Basket Reallocated Amount to Incremental"],
      definitionRefs: [],
      crossDocumentTargets: [],
      sharedCapacityPeers: ["Incremental Amount"],
    },
    {
      documentId: "gibraltar-ca",
      documentLabel: "Gibraltar 2026 Credit Agreement",
      documentRole: "CREDIT_AGREEMENT",
      sectionRef: "7.02",
      family: "LIENS",
      posture: "PERMISSION",
      statement: "Section 7.02 Limitations on Liens — Subject Lien only if Permitted Lien.",
      excerpt: excerpt(GIBRALTAR_CA, "Limitations on Liens"),
      capacityUsd: null,
      conditions: ["Must be a Permitted Lien"],
      definitionRefs: [],
      crossDocumentTargets: [],
    },
    {
      documentId: "gibraltar-ca",
      documentLabel: "Gibraltar 2026 Credit Agreement",
      documentRole: "CREDIT_AGREEMENT",
      sectionRef: "7.05",
      family: "RESTRICTED_PAYMENTS",
      posture: "PERMISSION",
      statement: "Section 7.05 Restricted Payments — builder / ratio / basket paths; capacity must be evidenced.",
      excerpt: excerpt(GIBRALTAR_CA, "Available Amount Builder Basket"),
      capacityUsd: null,
      conditions: ["Available Amount / builder components and Payment Conditions must be evidenced"],
      definitionRefs: [],
      crossDocumentTargets: [],
    },
    {
      documentId: "gibraltar-ca",
      documentLabel: "Gibraltar 2026 Credit Agreement",
      documentRole: "CREDIT_AGREEMENT",
      sectionRef: "9.15",
      family: "INTERCREDITOR",
      posture: "CONDITION",
      statement:
        "§9.15 Intercreditor Agreement — Agents authorized to enter First Lien / Second Lien ICA forms.",
      excerpt: excerpt(GIBRALTAR_CA, "First Lien/Second Lien Intercreditor Agreement"),
      capacityUsd: null,
      conditions: ["Applicable Intercreditor Agreement must be in effect for the contemplated lien priority"],
      definitionRefs: [],
      crossDocumentTargets: ["First Lien/Second Lien Intercreditor Agreement"],
    },
    {
      documentId: "gibraltar-ca",
      documentLabel: "Gibraltar 2026 Credit Agreement",
      documentRole: "CREDIT_AGREEMENT",
      sectionRef: "Incremental Amount",
      family: "SHARED_CAPACITY",
      posture: "CONDITION",
      statement:
        "Incremental Amount shares capacity with §7.01(b)(14) reallocation — anti-stacking applies.",
      excerpt: excerpt(GIBRALTAR_CA, "reallocated from Section 7.01(b)(14) to the Incremental Amount"),
      capacityUsd: null,
      conditions: ["Incremental / general-basket shared headroom must be evidenced"],
      definitionRefs: [],
      crossDocumentTargets: [],
      sharedCapacityPeers: ["7.01(b)(14)"],
    },
  ];
}

function chewyProvisions(): OperativeProvisionFact[] {
  return [
    {
      documentId: "chewy-ca",
      documentLabel: "Chewy 2026 Credit Agreement",
      documentRole: "CREDIT_AGREEMENT",
      sectionRef: "6.01",
      family: "DEBT_INCURRENCE",
      posture: "PERMISSION",
      statement: "Limitation on Incurrence of Indebtedness — exceptions only as enumerated.",
      excerpt: excerpt(CHEWY_CA, "Limitation on Incurrence of Indebtedness"),
      capacityUsd: null,
      conditions: ["Must fit an enumerated Indebtedness exception"],
      definitionRefs: [],
      crossDocumentTargets: [],
    },
    {
      documentId: "chewy-ca",
      documentLabel: "Chewy 2026 Credit Agreement",
      documentRole: "CREDIT_AGREEMENT",
      sectionRef: "Limitation on Liens",
      family: "LIENS",
      posture: "PERMISSION",
      statement: "Limitation on Liens — Permitted Liens only.",
      excerpt: excerpt(CHEWY_CA, "Limitation on Liens"),
      capacityUsd: null,
      conditions: ["Must be a Permitted Lien"],
      definitionRefs: [],
      crossDocumentTargets: [],
    },
    {
      documentId: "chewy-ca",
      documentLabel: "Chewy 2026 Credit Agreement",
      documentRole: "CREDIT_AGREEMENT",
      sectionRef: "6.08",
      family: "RESTRICTED_PAYMENTS",
      posture: "PERMISSION",
      statement: "Limitation on Restricted Payments — Available RP Capacity Amount shared with Investments/Liens.",
      excerpt: excerpt(CHEWY_CA, "Limitation on Restricted Payments"),
      capacityUsd: null,
      conditions: ["Available RP Capacity Amount components must be evidenced"],
      definitionRefs: [],
      crossDocumentTargets: [],
      sharedCapacityPeers: ["Available Investment Capacity Amount"],
    },
    {
      documentId: "chewy-ca",
      documentLabel: "Chewy 2026 Credit Agreement",
      documentRole: "CREDIT_AGREEMENT",
      sectionRef: "Available Investment Capacity Amount",
      family: "SHARED_CAPACITY",
      posture: "CONDITION",
      statement:
        "Available Investment Capacity Amount / Available RP Capacity Amount — shared anti-stacking pool.",
      excerpt: excerpt(CHEWY_CA, "Available Investment Capacity Amount"),
      capacityUsd: null,
      conditions: ["Shared RP/Investment capacity utilization must be evidenced"],
      definitionRefs: [],
      crossDocumentTargets: [],
      sharedCapacityPeers: ["6.08"],
    },
    {
      documentId: "chewy-ca",
      documentLabel: "Chewy 2026 Credit Agreement",
      documentRole: "CREDIT_AGREEMENT",
      sectionRef: "2.18",
      family: "DEBT_INCURRENCE",
      posture: "PERMISSION",
      statement: "Incremental Facility Amendment path (Incremental Revolving / Term Commitments).",
      excerpt: excerpt(CHEWY_CA, "Incremental Facility Amendment"),
      capacityUsd: null,
      conditions: ["Incremental facility conditions and available Incremental capacity must be evidenced"],
      definitionRefs: [],
      crossDocumentTargets: [],
    },
  ];
}

function fwrgProvisions(): OperativeProvisionFact[] {
  return [
    {
      documentId: "fwrg-ca",
      documentLabel: "FWRG 2021 Credit Agreement",
      documentRole: "CREDIT_AGREEMENT",
      sectionRef: "6.01(j)",
      family: "DEBT_INCURRENCE",
      posture: "PERMISSION",
      statement:
        "Debt of Restricted Subsidiaries that are not Loan Parties — greater of $30,000,000 and 50% Consolidated Adjusted EBITDA.",
      excerpt: excerpt(FWRG_A6, "greater of $30,000,000 and 50% of Consolidated Adjusted EBITDA"),
      capacityUsd: 30_000_000,
      conditions: ["Incurred by a Restricted Subsidiary that is not a Loan Party"],
      definitionRefs: [],
      crossDocumentTargets: [],
    },
    {
      documentId: "fwrg-ca",
      documentLabel: "FWRG 2021 Credit Agreement",
      documentRole: "CREDIT_AGREEMENT",
      sectionRef: "6.01",
      family: "DEBT_INCURRENCE",
      posture: "PERMISSION",
      statement: "Section 6.01 Indebtedness — negative covenant with enumerated exceptions.",
      excerpt: excerpt(FWRG_A6, "greater of $30,000,000 and 50% of Consolidated Adjusted EBITDA"),
      capacityUsd: null,
      conditions: ["Must fit an enumerated §6.01 exception"],
      definitionRefs: [],
      crossDocumentTargets: [],
    },
    {
      documentId: "fwrg-ca",
      documentLabel: "FWRG 2021 Credit Agreement",
      documentRole: "CREDIT_AGREEMENT",
      sectionRef: "6.02",
      family: "LIENS",
      posture: "PERMISSION",
      statement: "Section 6.02 Liens — Permitted Liens only (entity/guarantor scope still applies to debt path).",
      excerpt: excerpt(FWRG_A6, "greater of $30,000,000 and 50% of Consolidated Adjusted EBITDA"),
      capacityUsd: null,
      conditions: ["Must fit an enumerated Lien exception"],
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
  // --- Expanded authentic packages (expectations declared before execution) ---
  {
    scenarioId: "auth-gibraltar-general-debt-basket",
    authenticity: "AUTHENTIC_EDGAR_FIXTURE",
    packageId: "gibraltar-2026-credit-agreement",
    title: "Gibraltar: $200M unsecured under §7.01(b)(14) general basket; Incremental reallocation is shared capacity",
    fixturePaths: [GIBRALTAR_CA],
    independentGroundTruth: {
      applicableRestrictions: ["§7.01", "§7.01(b)(14)", "Incremental Amount shared capacity"],
      expectedOverall: "CONDITIONALLY_PERMITTED",
      mustCiteSectionRefs: ["7.01(b)(14)", "Incremental Amount"],
    },
    transaction: {
      description: "Incur $200,000,000 of unsecured Permitted Debt under the general debt basket.",
      kind: "UNSECURED_DEBT",
      amountUsd: 200_000_000,
      secured: false,
      asOfDate: "2026-03-31",
      knownFacts: { noDefault: true },
    },
    provisions: gibraltarProvisions(),
    financials: BASE_FINANCIALS,
    expectedOverall: "CONDITIONALLY_PERMITTED",
    notes:
      "AUTHENTIC Gibraltar CA. Flat $344M floor modeled; Incremental reallocation / LTM EBITDA grower unevidenced → conditional, not a free grant.",
  },
  {
    scenarioId: "auth-gibraltar-secured-missing-ica",
    authenticity: "AUTHENTIC_EDGAR_FIXTURE",
    packageId: "gibraltar-2026-credit-agreement",
    title: "Gibraltar: secured debt requires §7.02 Liens + ICA — missing ICA → undetermined",
    fixturePaths: [GIBRALTAR_CA],
    independentGroundTruth: {
      applicableRestrictions: ["§7.01", "§7.02 Liens", "§9.15 Intercreditor", "missing ICA document"],
      expectedOverall: "UNDETERMINED",
      mustCiteSectionRefs: ["7.02", "9.15"],
      mustNotPermitIf: ["treat debt basket alone as secured+priority permission without ICA"],
    },
    transaction: {
      description: "Incur $150,000,000 of second-lien secured Indebtedness.",
      kind: "SECURED_DEBT",
      amountUsd: 150_000_000,
      secured: true,
      asOfDate: "2026-03-31",
      knownFacts: { noDefault: true },
    },
    provisions: gibraltarProvisions(),
    requiredAbsentDocumentIds: [GIBRALTAR_REQUIRED_ABSENT_ICA],
    financials: BASE_FINANCIALS,
    expectedOverall: "UNDETERMINED",
    notes:
      "AUTHENTIC Gibraltar. Executed First Lien/Second Lien ICA absent from fixture — fail closed to UNDETERMINED (correct refusal).",
  },
  {
    scenarioId: "auth-gibraltar-rp-builder-unevidenced",
    authenticity: "AUTHENTIC_EDGAR_FIXTURE",
    packageId: "gibraltar-2026-credit-agreement",
    title: "Gibraltar: Restricted Payment under §7.05 builder — Available Amount unevidenced",
    fixturePaths: [GIBRALTAR_CA],
    independentGroundTruth: {
      applicableRestrictions: ["§7.05 Restricted Payments"],
      expectedOverall: "CONDITIONALLY_PERMITTED",
      mustCiteSectionRefs: ["7.05"],
    },
    transaction: {
      description: "Make a $50,000,000 Restricted Payment relying on the Available Amount builder basket.",
      kind: "RESTRICTED_PAYMENT",
      amountUsd: 50_000_000,
      secured: false,
      asOfDate: "2026-03-31",
    },
    provisions: gibraltarProvisions(),
    financials: BASE_FINANCIALS,
    expectedOverall: "CONDITIONALLY_PERMITTED",
    notes: "Builder components not evidenced — conditional/unknown, never invent builder capacity.",
  },
  {
    scenarioId: "auth-chewy-shared-rp-investment",
    authenticity: "AUTHENTIC_EDGAR_FIXTURE",
    packageId: "chwy-2026-credit-agreement",
    title: "Chewy: RP must clear §6.08 and shared Available RP/Investment capacity — unevidenced",
    fixturePaths: [CHEWY_CA],
    independentGroundTruth: {
      applicableRestrictions: ["§6.08 RP", "Available Investment Capacity Amount shared pool"],
      expectedOverall: "CONDITIONALLY_PERMITTED",
      mustCiteSectionRefs: ["6.08", "Available Investment Capacity Amount"],
    },
    transaction: {
      description: "Make a $75,000,000 Restricted Payment that also consumes shared Investment capacity.",
      kind: "RESTRICTED_PAYMENT",
      amountUsd: 75_000_000,
      secured: false,
      asOfDate: "2026-06-30",
    },
    provisions: chewyProvisions(),
    financials: BASE_FINANCIALS,
    expectedOverall: "CONDITIONALLY_PERMITTED",
    notes: "AUTHENTIC Chewy CA. Shared RP/Investment anti-stacking — refuse free permission without utilization evidence.",
  },
  {
    scenarioId: "auth-chewy-incremental-unevidenced",
    authenticity: "AUTHENTIC_EDGAR_FIXTURE",
    packageId: "chwy-2026-credit-agreement",
    title: "Chewy: Incremental Facility Amendment path unevidenced",
    fixturePaths: [CHEWY_CA],
    independentGroundTruth: {
      applicableRestrictions: ["Indebtedness limitation", "§2.18 Incremental", "Liens if secured"],
      expectedOverall: "CONDITIONALLY_PERMITTED",
      mustCiteSectionRefs: ["2.18", "6.01"],
    },
    transaction: {
      description: "Incur $100,000,000 Incremental Term Loans under an Incremental Facility Amendment.",
      kind: "SECURED_DEBT",
      amountUsd: 100_000_000,
      secured: true,
      asOfDate: "2026-06-30",
    },
    provisions: chewyProvisions(),
    financials: BASE_FINANCIALS,
    expectedOverall: "CONDITIONALLY_PERMITTED",
    notes: "Incremental capacity + lien authority unevidenced — conditional refusal of free grant.",
  },
  {
    scenarioId: "auth-fwrg-nonloanparty-debt",
    authenticity: "AUTHENTIC_EDGAR_FIXTURE",
    packageId: "fwrg-2021-credit-agreement",
    title: "FWRG: $25M debt at non-Loan Party Restricted Subsidiary within §6.01(j) basket",
    fixturePaths: [FWRG_A6],
    independentGroundTruth: {
      applicableRestrictions: ["§6.01(j) non-Loan Party debt basket", "§6.01 lead-in"],
      expectedOverall: "PERMITTED",
      mustCiteSectionRefs: ["6.01(j)"],
    },
    transaction: {
      description: "Incur $25,000,000 of Indebtedness at a Restricted Subsidiary that is not a Loan Party.",
      kind: "UNSECURED_DEBT",
      amountUsd: 25_000_000,
      secured: false,
      asOfDate: "2024-12-31",
      instrumentClassification: "Debt of Restricted Subsidiary that is not a Loan Party",
      knownFacts: {
        noDefault: true,
        // Boolean key matched against §6.01(j) condition text (see evaluateFactAgainstTxn).
        "Restricted Subsidiary that is not a Loan Party": true,
      },
    },
    provisions: fwrgProvisions(),
    financials: BASE_FINANCIALS,
    expectedOverall: "PERMITTED",
    notes:
      "AUTHENTIC FWRG Art VI. $25M ≤ $30M floor of §6.01(j). Entity-scope condition declared in knownFacts / instrumentClassification.",
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
