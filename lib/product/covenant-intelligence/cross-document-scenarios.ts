/**
 * Authentic cross-document covenant scenarios for Agent 5.
 *
 * All operative language is drawn from existing product-acceptance fixtures:
 *   - pkg-b-multi-document (Northfield CA + Indenture + Supplemental)
 *   - pkg-i-secured-debt-lien (Granite Peak secured debt / lien / §9.15)
 *   - pkg-h-unseen-composition (Copperline ABL + Intercreditor)
 *   - pkg-c-amendment-supersession (Westmark amendment restating §7.01(b))
 *
 * Expectations were authored by reading the source text, not compiler output.
 */

import {
  evaluateCrossDocumentTransaction,
  verifyCrossDocumentVerdictIndependently,
  type ContemplatedTransaction,
  type CrossDocumentCovenantVerdict,
  type CrossDocumentOverallResult,
  type OperativeProvisionFact,
} from "./cross-document-covenant";

export interface CrossDocumentScenario {
  scenarioId: string;
  /** All eight baseline scenarios use synthetic product-acceptance fixtures — not EDGAR. */
  authenticity: "SYNTHETIC_PRODUCT_ACCEPTANCE";
  title: string;
  focus:
    | "PERMIT_VS_PROHIBIT"
    | "DIFFERENT_CONDITIONS"
    | "DEBT_AND_LIEN"
    | "CROSS_SECTION_DEFINITION"
    | "AMENDMENT_EFFECT"
    | "ABSENT_DOCUMENT"
    | "CLASSIFICATION_DIVERGENCE"
    | "MULTIPLE_PATHWAYS";
  fixtureSources: string[];
  transaction: ContemplatedTransaction;
  provisions: OperativeProvisionFact[];
  requiredAbsentDocumentIds?: Array<{ documentId: string; label: string; reason: string }>;
  expectedOverall: CrossDocumentOverallResult;
  expectedProhibitionSubstrings?: string[];
  expectedPermissionSubstrings?: string[];
  expectedUnknownSubstrings?: string[];
  notes: string;
}

/** Northfield CA + Indenture operative facts (pkg-b). */
function northfieldBaseProvisions(opts?: { supplementalEffective?: boolean }): OperativeProvisionFact[] {
  const facts: OperativeProvisionFact[] = [
    {
      documentId: "credit-agreement",
      documentLabel: "Northfield Credit Agreement",
      documentRole: "CREDIT_AGREEMENT",
      sectionRef: "1.01",
      family: "DEFINITION",
      posture: "DEFINITION",
      statement: '"Indebtedness" means, as to any Person, all obligations of such Person for borrowed money.',
      excerpt:
        '"Indebtedness" means, as to any Person, all obligations of such Person for borrowed money.',
      capacityUsd: null,
      conditions: [],
      definitionRefs: [],
      crossDocumentTargets: [],
    },
    {
      documentId: "credit-agreement",
      documentLabel: "Northfield Credit Agreement",
      documentRole: "CREDIT_AGREEMENT",
      sectionRef: "7.01(a)",
      family: "DEBT_INCURRENCE",
      posture: "PERMISSION",
      statement: "Indebtedness under the Loan Documents.",
      excerpt: "(a) Indebtedness under the Loan Documents;",
      capacityUsd: null,
      conditions: [],
      definitionRefs: [{ term: "Indebtedness", sectionRef: "1.01" }],
      crossDocumentTargets: [],
    },
    {
      documentId: "credit-agreement",
      documentLabel: "Northfield Credit Agreement",
      documentRole: "CREDIT_AGREEMENT",
      sectionRef: "7.01(b)",
      family: "DEBT_INCURRENCE",
      posture: "PERMISSION",
      statement: "other Indebtedness in an aggregate principal amount not to exceed $30,000,000 at any time outstanding.",
      excerpt:
        "(b) other Indebtedness in an aggregate principal amount not to exceed $30,000,000 at any time outstanding; and",
      capacityUsd: 30_000_000,
      conditions: [],
      definitionRefs: [{ term: "Indebtedness", sectionRef: "1.01" }],
      crossDocumentTargets: [],
      sharedCapacityPeers: [],
    },
    {
      documentId: "credit-agreement",
      documentLabel: "Northfield Credit Agreement",
      documentRole: "CREDIT_AGREEMENT",
      sectionRef: "7.01(c)",
      family: "DEBT_INCURRENCE",
      posture: "PERMISSION",
      statement:
        "Indebtedness under the Senior Notes Indenture in an aggregate principal amount not to exceed $200,000,000.",
      excerpt:
        "(c) Indebtedness under the Senior Notes Indenture in an aggregate principal amount not to exceed $200,000,000.",
      capacityUsd: 200_000_000,
      conditions: [],
      definitionRefs: [{ term: "Indebtedness", sectionRef: "1.01" }],
      crossDocumentTargets: ["Senior Notes"],
    },
    {
      documentId: "credit-agreement",
      documentLabel: "Northfield Credit Agreement",
      documentRole: "CREDIT_AGREEMENT",
      sectionRef: "7.02",
      family: "LIENS",
      posture: "PERMISSION",
      statement: "Liens securing Indebtedness permitted under Section 7.01(b).",
      excerpt: "The Borrower shall not create any Lien on any property, except Liens securing Indebtedness permitted under Section 7.01(b).",
      capacityUsd: 30_000_000,
      conditions: ["Lien must secure Indebtedness permitted under §7.01(b)"],
      definitionRefs: [],
      crossDocumentTargets: [],
    },
    {
      documentId: "indenture",
      documentLabel: "Northfield Senior Notes Indenture",
      documentRole: "INDENTURE",
      sectionRef: "1.01",
      family: "DEFINITION",
      posture: "DEFINITION",
      statement:
        '"Indebtedness" means borrowed money, bonds/notes/debentures and Capital Lease Obligations; "Fixed Charge Coverage Ratio" means Consolidated EBITDA to Interest Expense.',
      excerpt:
        '"Indebtedness" means, as to any Person, all obligations of such Person for borrowed money, all obligations evidenced by bonds, notes or debentures and all Capital Lease Obligations of such Person.',
      capacityUsd: null,
      conditions: [],
      definitionRefs: [],
      crossDocumentTargets: [],
    },
    {
      documentId: "indenture",
      documentLabel: "Northfield Senior Notes Indenture",
      documentRole: "INDENTURE",
      sectionRef: "4.09",
      family: "DEBT_INCURRENCE",
      posture: "PERMISSION",
      statement:
        "Issuer may incur Indebtedness if the Fixed Charge Coverage Ratio would have been at least 2.00 to 1.00 on a pro forma basis.",
      excerpt:
        "provided that the Issuer may incur Indebtedness if the Fixed Charge Coverage Ratio for the most recently ended four full fiscal quarters would have been at least 2.00 to 1.00 determined on a pro forma basis.",
      capacityUsd: null,
      conditions: ["Fixed Charge Coverage Ratio ≥ 2.00 to 1.00 on a pro forma basis"],
      definitionRefs: [
        { term: "Fixed Charge Coverage Ratio", sectionRef: "1.01" },
        { term: "Indebtedness", sectionRef: "1.01" },
      ],
      crossDocumentTargets: [],
    },
    {
      documentId: "indenture",
      documentLabel: "Northfield Senior Notes Indenture",
      documentRole: "INDENTURE",
      sectionRef: "4.09(a)",
      family: "DEBT_INCURRENCE",
      posture: "PERMISSION",
      statement:
        "Indebtedness under the Credit Agreement in an aggregate principal amount not to exceed $150,000,000 at any time outstanding.",
      excerpt:
        "(a) Indebtedness under the Credit Agreement in an aggregate principal amount not to exceed $150,000,000 at any time outstanding;",
      capacityUsd: 150_000_000,
      conditions: [],
      definitionRefs: [{ term: "Indebtedness", sectionRef: "1.01" }],
      crossDocumentTargets: ["Credit Agreement"],
    },
    {
      documentId: "indenture",
      documentLabel: "Northfield Senior Notes Indenture",
      documentRole: "INDENTURE",
      sectionRef: "4.09(c)",
      family: "DEBT_INCURRENCE",
      posture: "PERMISSION",
      statement: "Indebtedness in an aggregate principal amount not to exceed $50,000,000 at any time outstanding.",
      excerpt: "(c) Indebtedness in an aggregate principal amount not to exceed $50,000,000 at any time outstanding.",
      capacityUsd: 50_000_000,
      conditions: [],
      definitionRefs: [{ term: "Indebtedness", sectionRef: "1.01" }],
      crossDocumentTargets: [],
      supersededOnOrAfter: "2026-05-01",
    },
    {
      documentId: "indenture",
      documentLabel: "Northfield Senior Notes Indenture",
      documentRole: "INDENTURE",
      sectionRef: "4.09(c)",
      family: "DEBT_INCURRENCE",
      posture: "PERMISSION",
      statement: "Indebtedness in an aggregate principal amount not to exceed $75,000,000 at any time outstanding.",
      excerpt:
        "(c) Indebtedness in an aggregate principal amount not to exceed $75,000,000 at any time outstanding.",
      capacityUsd: 75_000_000,
      conditions: [],
      definitionRefs: [{ term: "Indebtedness", sectionRef: "1.01" }],
      crossDocumentTargets: [],
      effectiveOnOrAfter: "2026-05-01",
    },
    {
      documentId: "indenture",
      documentLabel: "Northfield Senior Notes Indenture",
      documentRole: "INDENTURE",
      sectionRef: "4.10",
      family: "RESTRICTED_PAYMENTS",
      posture: "PROHIBITION",
      statement: "The Issuer shall not declare or pay any dividend on its Capital Stock unless no Default has occurred and is continuing.",
      excerpt:
        "The Issuer shall not declare or pay any dividend on its Capital Stock unless no Default has occurred and is continuing.",
      capacityUsd: null,
      conditions: ["no Default has occurred and is continuing"],
      definitionRefs: [],
      crossDocumentTargets: [],
    },
    {
      documentId: "supplemental-indenture-1",
      documentLabel: "First Supplemental Indenture",
      documentRole: "SUPPLEMENTAL_INDENTURE",
      sectionRef: "1",
      family: "AMENDMENT_EFFECT",
      posture: "PERMISSION",
      statement:
        "Section 4.09(c) of the Indenture is hereby amended and restated to $75,000,000; effective May 1, 2026.",
      excerpt:
        "Section 4.09(c) of the Indenture is hereby amended and restated in its entirety to read as follows: (c) Indebtedness in an aggregate principal amount not to exceed $75,000,000 at any time outstanding.",
      capacityUsd: 75_000_000,
      conditions: [],
      definitionRefs: [],
      crossDocumentTargets: [],
      effectiveOnOrAfter: "2026-05-01",
    },
  ];
  if (opts?.supplementalEffective === false) {
    return facts.filter((f) => !(f.effectiveOnOrAfter === "2026-05-01" && f.sectionRef === "4.09(c)"));
  }
  return facts;
}

function granitePeakProvisions(): OperativeProvisionFact[] {
  return [
    {
      documentId: "gp-credit-agreement",
      documentLabel: "Granite Peak Credit Agreement",
      documentRole: "CREDIT_AGREEMENT",
      sectionRef: "7.01(b)",
      family: "DEBT_INCURRENCE",
      posture: "PERMISSION",
      statement:
        "other Indebtedness of the Borrower and the Guarantors in an aggregate principal amount not to exceed $50,000,000 at any time outstanding.",
      excerpt:
        "(b) other Indebtedness of the Borrower and the Guarantors in an aggregate principal amount not to exceed $50,000,000 at any time outstanding;",
      capacityUsd: 50_000_000,
      conditions: ["Obligor is Borrower or Guarantor"],
      definitionRefs: [],
      crossDocumentTargets: [],
    },
    {
      documentId: "gp-credit-agreement",
      documentLabel: "Granite Peak Credit Agreement",
      documentRole: "CREDIT_AGREEMENT",
      sectionRef: "7.02(b)",
      family: "LIENS",
      posture: "PERMISSION",
      statement:
        "Liens securing Indebtedness permitted under Section 7.01(b) in an aggregate principal amount not to exceed $20,000,000 at any time outstanding.",
      excerpt:
        "(b) Liens securing Indebtedness permitted under Section 7.01(b) in an aggregate principal amount not to exceed $20,000,000 at any time outstanding; and",
      capacityUsd: 20_000_000,
      conditions: ["Secures Indebtedness permitted under §7.01(b)"],
      definitionRefs: [],
      crossDocumentTargets: [],
      sharedCapacityPeers: ["9.15"],
    },
    {
      documentId: "gp-credit-agreement",
      documentLabel: "Granite Peak Credit Agreement",
      documentRole: "CREDIT_AGREEMENT",
      sectionRef: "7.04",
      family: "SUBSIDIARY_GUARANTOR",
      posture: "PROHIBITION",
      statement: "The Borrower shall not permit any Subsidiary that is not a Guarantor to guarantee any Indebtedness of the Borrower.",
      excerpt:
        "The Borrower shall not permit any Subsidiary that is not a Guarantor to guarantee any Indebtedness of the Borrower.",
      capacityUsd: null,
      conditions: [],
      definitionRefs: [],
      crossDocumentTargets: [],
    },
    {
      documentId: "gp-credit-agreement",
      documentLabel: "Granite Peak Credit Agreement",
      documentRole: "CREDIT_AGREEMENT",
      sectionRef: "9.15",
      family: "SHARED_CAPACITY",
      posture: "PROHIBITION",
      statement:
        "aggregate principal amount of Indebtedness of the Borrower and its Subsidiaries that is secured by a Lien shall not exceed $25,000,000.",
      excerpt:
        "the Borrower shall not permit the aggregate principal amount of Indebtedness of the Borrower and its Subsidiaries that is secured by a Lien to exceed $25,000,000 at any time outstanding.",
      capacityUsd: 25_000_000,
      conditions: [],
      definitionRefs: [],
      crossDocumentTargets: [],
      sharedCapacityPeers: ["7.02(b)"],
    },
  ];
}

function copperlineProvisions(includeIca: boolean): OperativeProvisionFact[] {
  const facts: OperativeProvisionFact[] = [
    {
      documentId: "abl-credit-agreement",
      documentLabel: "Copperline ABL Credit Agreement",
      documentRole: "CREDIT_AGREEMENT",
      sectionRef: "1.01",
      family: "DEFINITION",
      posture: "DEFINITION",
      statement: '"Available Amount" / "Payment Conditions" / "Investment" defined in §1.01.',
      excerpt:
        '"Available Amount" means, as of any date, an amount equal to $10,000,000 plus 50% of Consolidated Net Income...',
      capacityUsd: null,
      conditions: [],
      definitionRefs: [],
      crossDocumentTargets: [],
    },
    {
      documentId: "abl-credit-agreement",
      documentLabel: "Copperline ABL Credit Agreement",
      documentRole: "CREDIT_AGREEMENT",
      sectionRef: "7.03(b)",
      family: "INVESTMENTS",
      posture: "PERMISSION",
      statement: "Investments in an aggregate amount not to exceed the Available Amount, provided that the Payment Conditions are satisfied.",
      excerpt:
        "(b) Investments in an aggregate amount not to exceed the Available Amount, provided that the Payment Conditions are satisfied; and",
      capacityUsd: 10_000_000,
      conditions: [
        "Payment Conditions satisfied (no Default; Availability ≥ greater of $12,500,000 and 12.5% of Borrowing Base)",
        "Uses Available Amount capacity",
      ],
      definitionRefs: [
        { term: "Available Amount", sectionRef: "1.01" },
        { term: "Payment Conditions", sectionRef: "1.01" },
        { term: "Investment", sectionRef: "1.01" },
      ],
      crossDocumentTargets: [],
    },
    {
      documentId: "abl-credit-agreement",
      documentLabel: "Copperline ABL Credit Agreement",
      documentRole: "CREDIT_AGREEMENT",
      sectionRef: "7.03(c)",
      family: "INVESTMENTS",
      posture: "PERMISSION",
      statement: "other Investments in an aggregate amount not to exceed $3,000,000; no Default; in cash.",
      excerpt:
        "(c) other Investments in an aggregate amount not to exceed $3,000,000 at any time outstanding:",
      capacityUsd: 3_000_000,
      conditions: ["no Default has occurred and is continuing", "Investments are made in cash"],
      definitionRefs: [{ term: "Investment", sectionRef: "1.01" }],
      crossDocumentTargets: [],
    },
    {
      documentId: "abl-credit-agreement",
      documentLabel: "Copperline ABL Credit Agreement",
      documentRole: "CREDIT_AGREEMENT",
      sectionRef: "7.02(b)",
      family: "LIENS",
      posture: "PERMISSION",
      statement: "Liens securing Indebtedness under the Term Loan Agreement, subject to the Intercreditor Agreement.",
      excerpt:
        "(b) Liens securing Indebtedness under the Term Loan Agreement, subject to the Intercreditor Agreement;",
      capacityUsd: null,
      conditions: ["Subject to the Intercreditor Agreement"],
      definitionRefs: [],
      crossDocumentTargets: ["Term Loan Agreement", "Intercreditor Agreement"],
    },
  ];
  if (includeIca) {
    facts.push({
      documentId: "intercreditor-agreement",
      documentLabel: "Copperline Intercreditor Agreement",
      documentRole: "INTERCREDITOR",
      sectionRef: "4.01",
      family: "INTERCREDITOR",
      posture: "PRIORITY",
      statement:
        "Until ABL Obligations paid in full, Borrower shall not pay Term Loan principal if Availability would be less than $15,000,000.",
      excerpt:
        "Until the ABL Obligations have been paid in full, the Borrower shall not make any payment of principal of the Term Loan Obligations if, after giving effect thereto, Availability would be less than $15,000,000.",
      capacityUsd: null,
      conditions: [
        "ABL Obligations paid in full, OR Availability after payment ≥ $15,000,000",
      ],
      definitionRefs: [{ term: "Availability", sectionRef: "1.01" }],
      crossDocumentTargets: ["Term Loan Obligations", "ABL Obligations"],
    });
  }
  return facts;
}

/** @deprecated Name retained for PR #218 compatibility — these are SYNTHETIC, not EDGAR-authentic. Prefer SYNTHETIC_CROSS_DOCUMENT_SCENARIOS. */
export const AUTHENTIC_CROSS_DOCUMENT_SCENARIOS: CrossDocumentScenario[] = [
  {
    scenarioId: "xd-01-permit-vs-prohibit",
    authenticity: "SYNTHETIC_PRODUCT_ACCEPTANCE",
    title: "CA Loan Documents carve-out permits; Indenture Credit Agreement cap prohibits",
    focus: "PERMIT_VS_PROHIBIT",
    fixtureSources: [
      "tests/fixtures/product-acceptance/packages/pkg-b-multi-document/documents/credit-agreement.txt",
      "tests/fixtures/product-acceptance/packages/pkg-b-multi-document/documents/indenture.txt",
    ],
    transaction: {
      description: "Incur additional $40,000,000 of Credit Agreement loans (unsecured increase under Loan Documents).",
      kind: "UNSECURED_DEBT",
      amountUsd: 40_000_000,
      secured: false,
      asOfDate: "2026-06-30",
      outstandingByInstrument: { "Credit Agreement": 130_000_000 },
    },
    provisions: northfieldBaseProvisions(),
    expectedOverall: "PROHIBITED",
    expectedPermissionSubstrings: ["Loan Documents"],
    expectedProhibitionSubstrings: ["150,000,000"],
    notes:
      "CA §7.01(a) affirmatively permits Loan Document debt; Indenture §4.09(a) caps Credit Agreement debt at $150M. Pro forma $170M → indenture prohibits. Permission does not override.",
  },
  {
    scenarioId: "xd-02-different-conditions",
    authenticity: "SYNTHETIC_PRODUCT_ACCEPTANCE",
    title: "General basket debt permitted under both docs subject to different caps/conditions",
    focus: "DIFFERENT_CONDITIONS",
    fixtureSources: [
      "tests/fixtures/product-acceptance/packages/pkg-b-multi-document/documents/credit-agreement.txt",
      "tests/fixtures/product-acceptance/packages/pkg-b-multi-document/documents/indenture.txt",
    ],
    transaction: {
      description: "Incur $20,000,000 of third-party unsecured Indebtedness (not Loan Documents, not Notes).",
      kind: "UNSECURED_DEBT",
      amountUsd: 20_000_000,
      secured: false,
      asOfDate: "2026-06-30",
      knownFacts: { noDefault: true },
    },
    provisions: northfieldBaseProvisions(),
    expectedOverall: "PERMITTED",
    expectedPermissionSubstrings: ["30,000,000", "75,000,000"],
    notes:
      "CA §7.01(b) $30M general basket and post-amendment Indenture §4.09(c) $75M both permit $20M, under different basket identities — not stacked; each must independently clear.",
  },
  {
    scenarioId: "xd-03-debt-and-lien",
    authenticity: "SYNTHETIC_PRODUCT_ACCEPTANCE",
    title: "Secured debt needs both debt and lien authority; §9.15 shared secured cap binds",
    focus: "DEBT_AND_LIEN",
    fixtureSources: [
      "tests/fixtures/product-acceptance/packages/pkg-i-secured-debt-lien/documents/credit-agreement.txt",
    ],
    transaction: {
      description: "Incur $30,000,000 of Guarantor-level Indebtedness secured by Liens on Borrower property.",
      kind: "SECURED_DEBT",
      amountUsd: 30_000_000,
      secured: true,
      asOfDate: "2026-09-01",
      knownFacts: { noDefault: true },
    },
    provisions: granitePeakProvisions(),
    expectedOverall: "PROHIBITED",
    expectedPermissionSubstrings: ["50,000,000"],
    expectedProhibitionSubstrings: ["20,000,000", "25,000,000"],
    notes:
      "§7.01(b) debt basket ($50M) would cover $30M, but §7.02(b) lien basket is $20M and §9.15 secured Indebtedness ceiling is $25M. Debt permission alone is insufficient.",
  },
  {
    scenarioId: "xd-04-cross-section-definition",
    authenticity: "SYNTHETIC_PRODUCT_ACCEPTANCE",
    title: "Ratio-debt permission depends on Fixed Charge Coverage Ratio definition in §1.01",
    focus: "CROSS_SECTION_DEFINITION",
    fixtureSources: [
      "tests/fixtures/product-acceptance/packages/pkg-b-multi-document/documents/indenture.txt",
    ],
    transaction: {
      description: "Incur $100,000,000 of Indebtedness in reliance on Indenture ratio-debt gate (FCCR ≥ 2.00x).",
      kind: "UNSECURED_DEBT",
      amountUsd: 100_000_000,
      secured: false,
      asOfDate: "2026-06-30",
      // FCCR not evidenced — must remain conditional/unknown, not a free permit.
      knownFacts: {},
    },
    provisions: northfieldBaseProvisions().filter(
      (p) => p.documentId === "indenture" || p.documentId === "credit-agreement",
    ),
    expectedOverall: "PROHIBITED",
    expectedUnknownSubstrings: ["Fixed Charge Coverage Ratio", "condition not evidenced"],
    expectedProhibitionSubstrings: ["30,000,000", "75,000,000"],
    notes:
      "Indenture §4.09 lead-in references Fixed Charge Coverage Ratio defined in §1.01. Without evidenced FCCR, ratio path is not a grant. Indenture general basket §4.09(c) also fails at $100M (stance PROHIBITS on that path). CA general basket $30M prohibits — conjunction yields PROHIBITED.",
  },
  {
    scenarioId: "xd-05-amendment-effect",
    authenticity: "SYNTHETIC_PRODUCT_ACCEPTANCE",
    title: "Supplemental Indenture changes operative §4.09(c) from $50M to $75M",
    focus: "AMENDMENT_EFFECT",
    fixtureSources: [
      "tests/fixtures/product-acceptance/packages/pkg-b-multi-document/documents/indenture.txt",
      "tests/fixtures/product-acceptance/packages/pkg-b-multi-document/documents/supplemental-indenture-1.txt",
      "tests/fixtures/product-acceptance/packages/pkg-c-amendment-supersession/documents/amendment-1.txt",
    ],
    transaction: {
      description: "Incur $60,000,000 of third-party unsecured Indebtedness as of 2026-03-31 (pre-supplemental).",
      kind: "UNSECURED_DEBT",
      amountUsd: 60_000_000,
      secured: false,
      asOfDate: "2026-03-31",
    },
    provisions: northfieldBaseProvisions(),
    expectedOverall: "PROHIBITED",
    expectedProhibitionSubstrings: ["30,000,000", "50,000,000"],
    notes:
      "Pre-May 1, 2026, Indenture §4.09(c) is $50M (supplemental not yet effective) — that path PROHIBITS $60M; ratio path remains unevidenced. CA §7.01(b) $30M prohibits. Conjunction → PROHIBITED. Post-amendment indenture $75M still cannot clear the CA basket.",
  },
  {
    scenarioId: "xd-06-absent-document",
    authenticity: "SYNTHETIC_PRODUCT_ACCEPTANCE",
    title: "Term-loan lien permission subject to Intercreditor; ICA absent → undetermined",
    focus: "ABSENT_DOCUMENT",
    fixtureSources: [
      "tests/fixtures/product-acceptance/packages/pkg-h-unseen-composition/documents/abl-credit-agreement.txt",
    ],
    transaction: {
      description: "Grant Liens securing Term Loan Agreement Indebtedness on ABL Priority Collateral.",
      kind: "SECURED_DEBT",
      amountUsd: 5_000_000,
      secured: true,
      asOfDate: "2026-10-31",
    },
    provisions: copperlineProvisions(false),
    requiredAbsentDocumentIds: [
      {
        documentId: "intercreditor-agreement",
        label: "Intercreditor Agreement",
        reason:
          "ABL §7.02(b) expressly conditions Term Loan Liens on the Intercreditor Agreement; ICA text is not in the package.",
      },
    ],
    expectedOverall: "UNDETERMINED",
    expectedUnknownSubstrings: ["Intercreditor", "absent"],
    notes:
      "Missing restrictions are not inferred satisfied. Absent ICA blocks determination even though ABL text mentions the permission.",
  },
  {
    scenarioId: "xd-07-classification-divergence",
    authenticity: "SYNTHETIC_PRODUCT_ACCEPTANCE",
    title: "Capital lease classified as Indebtedness under Indenture but not under CA definition",
    focus: "CLASSIFICATION_DIVERGENCE",
    fixtureSources: [
      "tests/fixtures/product-acceptance/packages/pkg-b-multi-document/documents/credit-agreement.txt",
      "tests/fixtures/product-acceptance/packages/pkg-b-multi-document/documents/indenture.txt",
    ],
    transaction: {
      description:
        "Incur $10,000,000 Capital Lease Obligation (instrumentClassification=Capital Lease).",
      kind: "UNSECURED_DEBT",
      amountUsd: 10_000_000,
      secured: false,
      asOfDate: "2026-06-30",
      instrumentClassification: "Capital Lease Obligation",
    },
    provisions: [
      ...northfieldBaseProvisions(),
      // Explicit classification divergence markers as definition facts already present.
    ],
    expectedOverall: "PERMITTED",
    expectedPermissionSubstrings: ["75,000,000"],
    notes:
      "Under CA §1.01, Indebtedness is borrowed money only — capital leases may fall outside CA Indebtedness (CA path may be inapplicable to the instrument). Under Indenture §1.01, Capital Lease Obligations are Indebtedness and must clear §4.09(c). Evaluator still requires indenture clearance; does not invent CA permission for a non-Indebtedness instrument.",
  },
  {
    scenarioId: "xd-08-multiple-pathways",
    authenticity: "SYNTHETIC_PRODUCT_ACCEPTANCE",
    title: "Investment with multiple contractual pathways; Payment Conditions / Available Amount / ICA",
    focus: "MULTIPLE_PATHWAYS",
    fixtureSources: [
      "tests/fixtures/product-acceptance/packages/pkg-h-unseen-composition/documents/abl-credit-agreement.txt",
      "tests/fixtures/product-acceptance/packages/pkg-h-unseen-composition/documents/intercreditor-agreement.txt",
    ],
    transaction: {
      description: "Make a $4,000,000 cash Investment in a non-Loan-Party joint venture.",
      kind: "INVESTMENT",
      amountUsd: 4_000_000,
      secured: false,
      asOfDate: "2026-10-31",
      knownFacts: { noDefault: true },
    },
    provisions: copperlineProvisions(true),
    expectedOverall: "CONDITIONALLY_PERMITTED",
    expectedPermissionSubstrings: ["Available Amount"],
    expectedUnknownSubstrings: ["Payment Conditions", "condition not evidenced"],
    notes:
      "§7.03(c) $3M general investment path is too small for $4M. §7.03(b) Available Amount path remains as an alternative pathway but Payment Conditions / Availability are not evidenced — conditional, not a free grant. Pathways listed without stacking. ICA is not required to authorize an Investment.",
  },
];

export interface ScenarioRunResult {
  scenarioId: string;
  title: string;
  expectedOverall: CrossDocumentOverallResult;
  actualOverall: CrossDocumentOverallResult;
  matchesExpected: boolean;
  verdict: CrossDocumentCovenantVerdict;
  independentVerification: ReturnType<typeof verifyCrossDocumentVerdictIndependently>;
}

export function runCrossDocumentScenario(scenario: CrossDocumentScenario): ScenarioRunResult {
  const verdict = evaluateCrossDocumentTransaction({
    transaction: scenario.transaction,
    provisions: scenario.provisions,
    requiredAbsentDocumentIds: scenario.requiredAbsentDocumentIds,
    verifiedPackage: null, // truthful NOT_CERTIFIED_4E — scenarios do not invent Phase 4E cert
    verifiedRulebookHasTrustedUnits: false,
  });
  const independentVerification = verifyCrossDocumentVerdictIndependently(verdict);
  return {
    scenarioId: scenario.scenarioId,
    title: scenario.title,
    expectedOverall: scenario.expectedOverall,
    actualOverall: verdict.overallResult,
    matchesExpected: verdict.overallResult === scenario.expectedOverall,
    verdict,
    independentVerification,
  };
}

export function runAllCrossDocumentScenarios(): {
  results: ScenarioRunResult[];
  falsePermissionCount: number;
  matchedCount: number;
  total: number;
} {
  const results = AUTHENTIC_CROSS_DOCUMENT_SCENARIOS.map(runCrossDocumentScenario);
  const falsePermissionCount = results.reduce(
    (n, r) => n + r.independentVerification.falsePermissionCount,
    0,
  );
  return {
    results,
    falsePermissionCount,
    matchedCount: results.filter((r) => r.matchesExpected).length,
    total: results.length,
  };
}
export const SYNTHETIC_CROSS_DOCUMENT_SCENARIOS = AUTHENTIC_CROSS_DOCUMENT_SCENARIOS;
