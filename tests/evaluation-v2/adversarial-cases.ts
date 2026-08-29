/**
 * Evaluation Methodology V2 — adversarial synthetic suite (case definitions).
 *
 * Phase 3F.1.5. Shared by the vitest regression suite
 * (adversarial-suite.test.ts) and the artifact runner that writes
 * docs/evaluation-v2/03-adversarial-suite-results.json, so the published
 * results and the enforced tests can never drift apart.
 *
 * Design rules for this suite:
 *  - Every case isolates ONE semantic distinction.
 *  - Every negative control has a matching positive control wherever a
 *    "refuse this" rule could otherwise be satisfied by refusing everything.
 *  - All drafting is invented. No text is copied from, or tuned against, any
 *    real package.
 *  - Candidates default to SUBSTANTIVE_REPRESENTATION so a refusal can only
 *    come from the semantic layers, never from the accounting gate.
 */
import type { ConflictCode, MatchStatus } from "@/lib/contract-model/evaluation-v2/types";
import type { SyntheticCandidateInput, SyntheticGtInput } from "./synthetic-fixtures";

export interface AdversarialCase {
  caseId: string;
  category: string;
  control: "NEGATIVE" | "POSITIVE";
  description: string;
  gt: SyntheticGtInput;
  candidates: SyntheticCandidateInput[];
  expectation: {
    /** Must the ground-truth unit end up credited (EXACT_SINGLE / EXACT_COMPOSITE)? */
    credited: boolean;
    allowedMatchStatuses?: MatchStatus[];
    requiredConflictCodes?: ConflictCode[];
    dangerousUnaccounted?: boolean;
    explicitlySurfacedAsUnsafe?: boolean;
  };
}

export const ADVERSARIAL_CASES: AdversarialCase[] = [
  // -------------------------------------------------------------------------
  // Same section, different semantics
  // -------------------------------------------------------------------------
  {
    caseId: "A01-same-section-different-semantics",
    category: "SAME_SECTION_DIFFERENT_SEMANTICS",
    control: "NEGATIVE",
    description: "Two provisions share a section address but govern unrelated subjects. Address identity must not produce credit.",
    gt: {
      id: "A01-gt",
      sectionRef: "5.04",
      text: "The Borrower shall deliver to the Administrative Agent, within 45 days after the end of each fiscal quarter, its consolidated balance sheet and related statements of operations for such quarter.",
      unitType: "COVENANT",
    },
    candidates: [
      {
        id: "A01-c1",
        sectionRef: "5.04",
        text: "The Borrower shall maintain, with financially sound and reputable insurers, insurance in such amounts and against such risks as are customarily maintained by companies engaged in the same business.",
      },
    ],
    expectation: { credited: false, dangerousUnaccounted: true },
  },
  {
    caseId: "A02-same-section-same-semantics",
    category: "SAME_SECTION_DIFFERENT_SEMANTICS",
    control: "POSITIVE",
    description: "Positive control for A01: the same reporting obligation, correctly represented. Refusing everything is not the goal.",
    gt: {
      id: "A02-gt",
      sectionRef: "5.04",
      text: "The Borrower shall deliver to the Administrative Agent, within 45 days after the end of each fiscal quarter, its consolidated balance sheet and related statements of operations for such quarter.",
      unitType: "COVENANT",
    },
    candidates: [
      {
        id: "A02-c1",
        sectionRef: "5.04",
        text: "The Borrower shall furnish to the Administrative Agent its consolidated balance sheet and related statements of operations within 45 days after the end of each fiscal quarter.",
      },
    ],
    expectation: { credited: true, allowedMatchStatuses: ["EXACT_SINGLE", "EXACT_COMPOSITE"] },
  },

  // -------------------------------------------------------------------------
  // Numeric correspondence
  // -------------------------------------------------------------------------
  {
    caseId: "A03-same-number-different-metric",
    category: "SAME_NUMBER_DIFFERENT_METRIC",
    control: "NEGATIVE",
    description: "12.5% of Consolidated EBITDA is not 12.5% of Total Assets. A matching number on a different basis is a different economic claim.",
    gt: {
      id: "A03-gt",
      sectionRef: "6.01(p)",
      text: "(p) Indebtedness in an aggregate principal amount not to exceed 12.5% of Consolidated EBITDA at any time outstanding.",
      unitType: "BASKET",
    },
    candidates: [
      {
        id: "A03-c1",
        sectionRef: "6.01(p)",
        text: "(p) Indebtedness in an aggregate principal amount not to exceed 12.5% of Consolidated Total Assets at any time outstanding.",
        declaredRole: "BASKET",
      },
    ],
    expectation: { credited: false, requiredConflictCodes: ["WRONG_PERCENT_BASIS"] },
  },
  {
    caseId: "A04-same-metric-different-number",
    category: "SAME_METRIC_DIFFERENT_NUMBER",
    control: "NEGATIVE",
    description: "$35,000,000 is not $5,000,000, even on the same metric and in the same basket position.",
    gt: {
      id: "A04-gt",
      sectionRef: "6.02(h)",
      text: "(h) Liens securing Indebtedness in an aggregate principal amount not to exceed $35,000,000 at any time outstanding.",
      unitType: "BASKET",
    },
    candidates: [
      {
        id: "A04-c1",
        sectionRef: "6.02(h)",
        text: "(h) Liens securing Indebtedness in an aggregate principal amount not to exceed $5,000,000 at any time outstanding.",
        declaredRole: "BASKET",
      },
    ],
    expectation: { credited: false, requiredConflictCodes: ["WRONG_AMOUNT"] },
  },
  {
    caseId: "A05-ratio-value-same-test-different",
    category: "SAME_NUMBER_DIFFERENT_METRIC",
    control: "NEGATIVE",
    description: "4.00x leverage is not 4.00x fixed-charge coverage. Same number, different ratio test.",
    gt: {
      id: "A05-gt",
      sectionRef: "6.12(a)",
      text: "The Borrower shall not permit the Total Net Leverage Ratio as at the last day of any fiscal quarter to exceed 4.00 to 1.00.",
      unitType: "FINANCIAL_TEST",
    },
    candidates: [
      {
        id: "A05-c1",
        sectionRef: "6.12(a)",
        text: "The Borrower shall not permit the Fixed Charge Coverage Ratio as at the last day of any fiscal quarter to be less than 4.00 to 1.00.",
        declaredRole: "FINANCIAL_TEST",
      },
    ],
    expectation: { credited: false },
  },
  {
    caseId: "A06-greater-of-flattened-to-single-figure",
    category: "CAP_STRUCTURE",
    control: "NEGATIVE",
    description: '"Greater of $50,000,000 and 10% of Consolidated EBITDA" is not "$50,000,000" alone — the grower half of the cap is lost.',
    gt: {
      id: "A06-gt",
      sectionRef: "6.04(m)",
      text: "(m) Investments in an aggregate amount not to exceed the greater of $50,000,000 and 10% of Consolidated EBITDA.",
      unitType: "BASKET",
    },
    candidates: [
      {
        id: "A06-c1",
        sectionRef: "6.04(m)",
        text: "(m) Investments in an aggregate amount not to exceed $50,000,000.",
        declaredRole: "BASKET",
      },
    ],
    expectation: { credited: false, requiredConflictCodes: ["WRONG_CAP_STRUCTURE"] },
  },
  {
    caseId: "A07-greater-of-preserved",
    category: "CAP_STRUCTURE",
    control: "POSITIVE",
    description: "Positive control for A06: the same greater-of cap, correctly represented with both operands.",
    gt: {
      id: "A07-gt",
      sectionRef: "6.04(m)",
      text: "(m) Investments in an aggregate amount not to exceed the greater of $50,000,000 and 10% of Consolidated EBITDA.",
      unitType: "BASKET",
    },
    candidates: [
      {
        id: "A07-c1",
        sectionRef: "6.04(m)",
        text: "(m) Investments capped at the greater of $50,000,000 and 10% of Consolidated EBITDA.",
        declaredRole: "BASKET",
      },
    ],
    expectation: { credited: true },
  },

  // -------------------------------------------------------------------------
  // Action / scope
  // -------------------------------------------------------------------------
  {
    caseId: "A08-same-action-different-scope",
    category: "SAME_ACTION_DIFFERENT_SCOPE",
    control: "NEGATIVE",
    description: "The same permitted action, granted to a different entity class. Entity scope is part of the claim.",
    gt: {
      id: "A08-gt",
      sectionRef: "6.01(j)",
      text: "(j) Indebtedness of Restricted Subsidiaries that are not Loan Parties in an aggregate principal amount not to exceed $30,000,000.",
      unitType: "BASKET",
    },
    candidates: [
      {
        id: "A08-c1",
        sectionRef: "6.01(j)",
        text: "(j) Indebtedness of the Loan Parties in an aggregate principal amount not to exceed $30,000,000.",
        declaredRole: "BASKET",
      },
    ],
    expectation: { credited: false, requiredConflictCodes: ["WRONG_ENTITY_SCOPE"] },
  },
  {
    caseId: "A09-same-scope-different-action",
    category: "SAME_SCOPE_DIFFERENT_ACTION",
    control: "NEGATIVE",
    description: "The same entity class, but a different governed transaction: incurring debt is not creating liens.",
    gt: {
      id: "A09-gt",
      sectionRef: "6.01(f)",
      text: "(f) the Restricted Subsidiaries may create, incur or assume Indebtedness in an aggregate principal amount not to exceed $12,000,000.",
      unitType: "BASKET",
    },
    candidates: [
      {
        id: "A09-c1",
        sectionRef: "6.02(f)",
        text: "(f) the Restricted Subsidiaries may create or permit to exist Liens on their property securing obligations in an aggregate amount not to exceed $12,000,000.",
        declaredRole: "BASKET",
      },
    ],
    expectation: { credited: false },
  },
  {
    caseId: "A10-scope-subset-is-not-a-conflict",
    category: "SAME_ACTION_DIFFERENT_SCOPE",
    control: "POSITIVE",
    description: "Positive control for A08: a candidate naming the same entity class in slightly different words must still be credited.",
    gt: {
      id: "A10-gt",
      sectionRef: "6.01(j)",
      text: "(j) Indebtedness of Restricted Subsidiaries that are not Loan Parties in an aggregate principal amount not to exceed $30,000,000.",
      unitType: "BASKET",
    },
    candidates: [
      {
        id: "A10-c1",
        sectionRef: "6.01(j)",
        text: "(j) Indebtedness incurred by any Restricted Subsidiary that is not a Loan Party, capped at $30,000,000 in aggregate principal amount.",
        declaredRole: "BASKET",
      },
    ],
    expectation: { credited: true },
  },

  // -------------------------------------------------------------------------
  // Omitted condition / exception
  // -------------------------------------------------------------------------
  {
    caseId: "A11-omitted-no-default-condition",
    category: "OMITTED_CONDITION",
    control: "NEGATIVE",
    description: "A basket represented without its no-Default gate would present the capacity as more freely available than it is.",
    gt: {
      id: "A11-gt",
      sectionRef: "6.08(a)(iii)",
      text: "(iii) the Company may make Restricted Payments in an aggregate amount not to exceed $15,000,000 in any fiscal year, so long as no Default or Event of Default shall exist immediately before or after giving effect thereto.",
      unitType: "BASKET",
    },
    candidates: [
      {
        id: "A11-c1",
        sectionRef: "6.08(a)(iii)",
        text: "(iii) the Company may make Restricted Payments in an aggregate amount not to exceed $15,000,000 in any fiscal year.",
        declaredRole: "BASKET",
      },
    ],
    expectation: { credited: false, allowedMatchStatuses: ["PARTIAL"], requiredConflictCodes: ["MISSING_CONDITION"] },
  },
  {
    caseId: "A12-omitted-payment-conditions",
    category: "OMITTED_CONDITION",
    control: "NEGATIVE",
    description: 'A qualitative, non-numeric gate ("subject to the Payment Conditions") must be tested for, exactly like a numeric one.',
    gt: {
      id: "A12-gt",
      sectionRef: "6.05(g)",
      text: "(g) the Loan Parties may Dispose of assets so long as the Payment Conditions are satisfied with respect to such Disposition.",
      unitType: "BASKET",
    },
    candidates: [
      {
        id: "A12-c1",
        sectionRef: "6.05(g)",
        text: "(g) the Loan Parties may Dispose of assets.",
        declaredRole: "BASKET",
      },
    ],
    expectation: { credited: false, requiredConflictCodes: ["MISSING_CONDITION"] },
  },
  {
    caseId: "A13-omitted-ordinary-course-exception",
    category: "OMITTED_EXCEPTION",
    control: "NEGATIVE",
    description: "An ordinary-course carve-out changes the reach of the restriction; omitting it is a real gap.",
    gt: {
      id: "A13-gt",
      sectionRef: "6.05",
      text: "No Loan Party will Dispose of any asset, except for Dispositions of inventory and obsolete equipment in the ordinary course of business.",
      unitType: "COVENANT",
    },
    candidates: [
      {
        id: "A13-c1",
        sectionRef: "6.05",
        text: "No Loan Party will Dispose of any asset.",
        declaredRole: "GENERAL_PROHIBITION",
      },
    ],
    expectation: { credited: false, requiredConflictCodes: ["MISSING_EXCEPTION"] },
  },
  {
    caseId: "A14-condition-preserved",
    category: "OMITTED_CONDITION",
    control: "POSITIVE",
    description: "Positive control for A11/A12: the gate is present in the candidate, differently worded.",
    gt: {
      id: "A14-gt",
      sectionRef: "6.08(a)(iii)",
      text: "(iii) the Company may make Restricted Payments in an aggregate amount not to exceed $15,000,000 in any fiscal year, so long as no Default or Event of Default shall exist immediately before or after giving effect thereto.",
      unitType: "BASKET",
    },
    candidates: [
      {
        id: "A14-c1",
        sectionRef: "6.08(a)(iii)",
        text: "(iii) the Company is permitted to pay Restricted Payments of up to $15,000,000 per fiscal year provided that no Default or Event of Default exists at the time of, or would result from, such payment.",
        declaredRole: "BASKET",
      },
    ],
    expectation: { credited: true },
  },

  // -------------------------------------------------------------------------
  // Legal posture / breadth
  // -------------------------------------------------------------------------
  {
    caseId: "A15-inverted-legal-posture",
    category: "INVERTED_POSTURE",
    control: "NEGATIVE",
    description: "A permission is the opposite legal claim to a prohibition, even over the identical subject matter.",
    gt: {
      id: "A15-gt",
      sectionRef: "6.09",
      text: "No Loan Party will enter into any transaction with any Affiliate.",
      unitType: "COVENANT",
    },
    candidates: [
      {
        id: "A15-c1",
        sectionRef: "6.09",
        text: "Each Loan Party may enter into transactions with any Affiliate.",
        declaredRole: "PERMISSION",
      },
    ],
    expectation: { credited: false, requiredConflictCodes: ["INVERTED_LEGAL_POSTURE"] },
  },
  {
    caseId: "A16-chapeau-vs-descendant-basket",
    category: "BREADTH_SUBSTITUTION",
    control: "NEGATIVE",
    description: "The historical false-credit vector: a universal prohibition credited via one narrow enumerated carve-out beneath it.",
    gt: {
      id: "A16-gt",
      sectionRef: "6.01",
      text: "No Loan Party will, nor will it permit any Restricted Subsidiary to, create, incur, assume or suffer to exist any Indebtedness, except as permitted by clauses (a) through (q).",
      unitType: "COVENANT",
    },
    candidates: [
      {
        id: "A16-c1",
        sectionRef: "6.01(c)",
        text: "(c) Indebtedness incurred to finance the acquisition of fixed assets, in an aggregate principal amount not to exceed $8,000,000.",
        declaredRole: "BASKET",
      },
    ],
    expectation: { credited: false, requiredConflictCodes: ["SCOPE_BREADTH_MISMATCH"], dangerousUnaccounted: true },
  },
  {
    caseId: "A17-chapeau-correctly-represented",
    category: "BREADTH_SUBSTITUTION",
    control: "POSITIVE",
    description: "Positive control for A16: the universal prohibition itself, represented as a universal prohibition.",
    gt: {
      id: "A17-gt",
      sectionRef: "6.01",
      text: "No Loan Party will, nor will it permit any Restricted Subsidiary to, create, incur, assume or suffer to exist any Indebtedness, except as permitted by clauses (a) through (q).",
      unitType: "COVENANT",
    },
    candidates: [
      {
        id: "A17-c1",
        sectionRef: "6.01",
        text: "General prohibition: no Loan Party, and no Restricted Subsidiary, may create, incur, assume or suffer to exist any Indebtedness other than as expressly permitted by the enumerated exceptions in clauses (a) through (q).",
        declaredRole: "GENERAL_PROHIBITION",
      },
    ],
    expectation: { credited: true },
  },

  // -------------------------------------------------------------------------
  // Operative version / instrument
  // -------------------------------------------------------------------------
  {
    caseId: "A18-wrong-amendment-version",
    category: "WRONG_OPERATIVE_VERSION",
    control: "NEGATIVE",
    description: "Superseded language must never be presented as the operative provision, however well it matches on content.",
    gt: {
      id: "A18-gt",
      sectionRef: "6.12(b)",
      text: "The Borrower shall not permit the Interest Coverage Ratio as at the last day of any fiscal quarter to be less than 3.00 to 1.00.",
      documentId: "synthetic-doc-restated",
      unitType: "FINANCIAL_TEST",
    },
    candidates: [
      {
        id: "A18-c1",
        sectionRef: "6.12(b)",
        text: "The Borrower shall not permit the Interest Coverage Ratio as at the last day of any fiscal quarter to be less than 3.00 to 1.00.",
        documentId: "synthetic-doc-original",
        declaredRole: "FINANCIAL_TEST",
      },
    ],
    expectation: { credited: false, requiredConflictCodes: ["WRONG_OPERATIVE_VERSION"] },
  },
  {
    caseId: "A19-correct-operative-version",
    category: "WRONG_OPERATIVE_VERSION",
    control: "POSITIVE",
    description: "Positive control for A18: the same provision, represented from the operative document.",
    gt: {
      id: "A19-gt",
      sectionRef: "6.12(b)",
      text: "The Borrower shall not permit the Interest Coverage Ratio as at the last day of any fiscal quarter to be less than 3.00 to 1.00.",
      documentId: "synthetic-doc-restated",
      unitType: "FINANCIAL_TEST",
    },
    candidates: [
      {
        id: "A19-c1",
        sectionRef: "6.12(b)",
        text: "Financial maintenance covenant: the Borrower shall maintain an Interest Coverage Ratio of not less than 3.00 to 1.00, tested as at the last day of each fiscal quarter.",
        documentId: "synthetic-doc-restated",
        declaredRole: "FINANCIAL_TEST",
      },
    ],
    expectation: { credited: true },
  },
  {
    caseId: "A20-wrong-instrument",
    category: "WRONG_INSTRUMENT",
    control: "NEGATIVE",
    description: "First-lien and second-lien capacity are different instruments even at an identical cap.",
    gt: {
      id: "A20-gt",
      sectionRef: "6.01(r)",
      text: "(r) first lien Indebtedness in an aggregate principal amount not to exceed $60,000,000.",
      unitType: "BASKET",
    },
    candidates: [
      {
        id: "A20-c1",
        sectionRef: "6.01(r)",
        text: "(r) second lien Indebtedness in an aggregate principal amount not to exceed $60,000,000.",
        declaredRole: "BASKET",
      },
    ],
    expectation: { credited: false, requiredConflictCodes: ["WRONG_INSTRUMENT"] },
  },

  // -------------------------------------------------------------------------
  // Cardinality
  // -------------------------------------------------------------------------
  {
    caseId: "A21-composite-match",
    category: "COMPOSITE",
    control: "POSITIVE",
    description: "One claim represented by two mutually consistent representations. Each must correspond independently for the composite to count.",
    gt: {
      id: "A21-gt",
      sectionRef: "6.08(a)(v)",
      text: "(v) the Company may declare and make Restricted Payments in an aggregate amount not to exceed $25,000,000 in any fiscal year, so long as no Default has occurred and is continuing.",
      unitType: "BASKET",
    },
    candidates: [
      {
        id: "A21-c1",
        sectionRef: "6.08(a)(v)",
        text: "(v) the Company may declare and make Restricted Payments of up to $25,000,000 in any fiscal year, so long as no Default has occurred and is continuing.",
        declaredRole: "BASKET",
      },
      {
        id: "A21-c2",
        sectionRef: "6.08(a)(v)",
        text: "(v) Restricted Payments by the Company are permitted up to an aggregate of $25,000,000 per fiscal year provided no Default has occurred and is continuing.",
        declaredRole: "BASKET",
      },
    ],
    expectation: { credited: true, allowedMatchStatuses: ["EXACT_COMPOSITE"] },
  },
  {
    caseId: "A22-ambiguous-cluster",
    category: "AMBIGUITY",
    control: "NEGATIVE",
    description: "Two irreconcilable candidates correspond equally well to a claim that is silent on the distinguishing detail. The evaluator must say AMBIGUOUS rather than pick one.",
    gt: {
      id: "A22-gt",
      sectionRef: "6.05(d)",
      text: "(d) the Loan Parties may Dispose of assets in the ordinary course of business.",
      unitType: "BASKET",
    },
    candidates: [
      {
        id: "A22-c1",
        sectionRef: "6.05(d)",
        text: "(d) the Loan Parties may Dispose of assets in the ordinary course of business in an aggregate amount not to exceed $10,000,000.",
        declaredRole: "BASKET",
      },
      {
        id: "A22-c2",
        sectionRef: "6.05(d)",
        text: "(d) the Loan Parties may Dispose of assets in the ordinary course of business in an aggregate amount not to exceed $60,000,000.",
        declaredRole: "BASKET",
      },
    ],
    expectation: { credited: false, allowedMatchStatuses: ["AMBIGUOUS"] },
  },

  // -------------------------------------------------------------------------
  // Honest self-declaration
  // -------------------------------------------------------------------------
  {
    caseId: "A23-explicit-unsupported",
    category: "HONEST_SELF_DECLARATION",
    control: "POSITIVE",
    description: "A compiler that says UNSUPPORTED is exhibiting good safety behaviour. It must never score the same as a silent omission.",
    gt: {
      id: "A23-gt",
      sectionRef: "6.11",
      text: "No Loan Party will amend, modify or waive any provision of any Material Indebtedness document in a manner materially adverse to the Lenders.",
      unitType: "COVENANT",
    },
    candidates: [
      {
        id: "A23-c1",
        sectionRef: "6.11",
        text: "Prohibition on amending, modifying or waiving Material Indebtedness documents in a manner materially adverse to the Lenders. The materiality judgment cannot be reduced to an executable rule.",
        accountingRole: "HONEST_UNSUPPORTED",
        selfReport: { sufficiency: "UNSUPPORTED", unresolvedReasons: ["qualitative materiality judgment not representable"] },
      },
    ],
    expectation: { credited: false, allowedMatchStatuses: ["HONESTLY_UNSUPPORTED"], dangerousUnaccounted: false, explicitlySurfacedAsUnsafe: true },
  },
  {
    caseId: "A24-explicit-unresolved",
    category: "HONEST_SELF_DECLARATION",
    control: "POSITIVE",
    description: "An explicitly unresolved representation is honest, not dangerous.",
    gt: {
      id: "A24-gt",
      sectionRef: "6.06",
      text: "No Loan Party will enter into any Sale and Leaseback Transaction except as permitted by Section 6.01 and Section 6.02.",
      unitType: "COVENANT",
    },
    candidates: [
      {
        id: "A24-c1",
        sectionRef: "6.06",
        text: "Prohibition on Sale and Leaseback Transactions except as permitted elsewhere; the cross-referenced capacity could not be resolved from the available context.",
        accountingRole: "HONEST_UNRESOLVED",
        selfReport: { sufficiency: "MISSING_CONTEXT", unresolvedReasons: ["cross-referenced sections not retrieved"] },
      },
    ],
    expectation: { credited: false, allowedMatchStatuses: ["HONESTLY_UNRESOLVED"], dangerousUnaccounted: false, explicitlySurfacedAsUnsafe: true },
  },
  {
    caseId: "A25-partial-but-safely-flagged",
    category: "HONEST_SELF_DECLARATION",
    control: "POSITIVE",
    description: "A partial representation whose gap the system itself surfaces is not a dangerous unaccounted omission.",
    gt: {
      id: "A25-gt",
      sectionRef: "6.04(k)",
      text: "(k) Investments in joint ventures in an aggregate amount not to exceed $18,000,000, so long as the Payment Conditions are satisfied.",
      unitType: "BASKET",
    },
    candidates: [
      {
        id: "A25-c1",
        sectionRef: "6.04(k)",
        text: "(k) Investments in joint ventures in an aggregate amount not to exceed $18,000,000.",
        declaredRole: "BASKET",
      },
      {
        id: "A25-c2",
        sectionRef: "6.04(k)",
        text: "(k) Investments in joint ventures in an aggregate amount not to exceed $18,000,000, subject to conditions that were not fully resolved during compilation.",
        declaredRole: "BASKET",
        accountingRole: "SAFETY_FLAG",
        selfReport: { reviewStatus: "REVIEW_REQUIRED", unresolvedReasons: ["conditions attached to this basket were not resolved"] },
      },
    ],
    expectation: { credited: false, allowedMatchStatuses: ["PARTIAL"], dangerousUnaccounted: false, explicitlySurfacedAsUnsafe: true },
  },

  // -------------------------------------------------------------------------
  // Wording traps
  // -------------------------------------------------------------------------
  {
    caseId: "A26-matching-words-wrong-meaning",
    category: "LEXICAL_TRAP",
    control: "NEGATIVE",
    description: "Heavy vocabulary overlap with the opposite legal meaning: a restriction ON restrictive agreements versus a restrictive agreement being permitted.",
    gt: {
      id: "A26-gt",
      sectionRef: "6.10",
      text: "No Loan Party will enter into any agreement that prohibits or restricts the ability of any Restricted Subsidiary to pay dividends to the Borrower.",
      unitType: "COVENANT",
    },
    candidates: [
      {
        id: "A26-c1",
        sectionRef: "6.10(a)",
        text: "(a) any Restricted Subsidiary may enter into an agreement that restricts its ability to pay dividends, if such agreement is a customary restriction contained in an agreement governing Indebtedness permitted under Section 6.01.",
        declaredRole: "EXCEPTION",
      },
    ],
    expectation: { credited: false },
  },
  {
    caseId: "A27-equivalent-drafting-different-wording",
    category: "SEMANTIC_EQUIVALENCE",
    control: "POSITIVE",
    description: "The decisive positive control: the same claim drafted very differently must still be credited. An evaluator that refuses this is useless.",
    gt: {
      id: "A27-gt",
      sectionRef: "6.02(c)",
      text: "(c) Liens existing on the Effective Date and set forth on Schedule 6.02, securing Indebtedness in an aggregate principal amount not to exceed $22,000,000.",
      unitType: "BASKET",
    },
    candidates: [
      {
        id: "A27-c1",
        sectionRef: "6.02(c)",
        text: "(c) grandfathered Liens outstanding on the Effective Date and scheduled on Schedule 6.02, which secure Indebtedness of no more than $22,000,000 in aggregate principal amount.",
        declaredRole: "BASKET",
      },
    ],
    expectation: { credited: true },
  },
  {
    caseId: "A28-shared-cap-omitted",
    category: "SHARED_CAPACITY",
    control: "NEGATIVE",
    description: "A basket whose capacity is shared with another basket must not be represented as standalone capacity — that permits double counting.",
    gt: {
      id: "A28-gt",
      sectionRef: "6.01(k)",
      text: "(k) Indebtedness in an aggregate principal amount not to exceed $40,000,000, which amount shall be shared with, and reduce availability under, the general Lien basket in Section 6.02(k).",
      unitType: "BASKET",
    },
    candidates: [
      {
        id: "A28-c1",
        sectionRef: "6.01(k)",
        text: "(k) Indebtedness in an aggregate principal amount not to exceed $40,000,000.",
        declaredRole: "BASKET",
      },
    ],
    expectation: { credited: false, requiredConflictCodes: ["INCORRECT_SHARED_CAP_RELATIONSHIP"] },
  },
  {
    caseId: "A29-reclassification-semantics",
    category: "RECLASSIFICATION",
    control: "NEGATIVE",
    description: "A reclassification right changes how capacity is consumed; a representation that omits it understates flexibility.",
    gt: {
      id: "A29-gt",
      sectionRef: "6.01(s)",
      text: "(s) the Borrower may divide and classify, and may later reclassify, any item of Indebtedness among the clauses of this Section in its sole discretion.",
      unitType: "OTHER_OPERATIVE",
    },
    candidates: [
      {
        id: "A29-c1",
        sectionRef: "6.01(s)",
        text: "(s) each item of Indebtedness shall be classified under a single clause of this Section at the time of incurrence.",
        declaredRole: "PROVISO",
      },
    ],
    expectation: { credited: false },
  },
  {
    caseId: "A30-step-down-schedule-flattened",
    category: "STEP_SCHEDULE",
    control: "NEGATIVE",
    description: "A stepped covenant level is not a single flat level, even when one step matches.",
    gt: {
      id: "A30-gt",
      sectionRef: "6.12(a)",
      text: "The maximum Total Net Leverage Ratio shall be 4.50 to 1.00 for fiscal quarters ending in 2024, stepping down to 4.00 to 1.00 for fiscal quarters ending in 2025 and thereafter.",
      unitType: "FINANCIAL_TEST",
    },
    candidates: [
      {
        id: "A30-c1",
        sectionRef: "6.12(a)",
        text: "The Borrower shall not permit the Total Net Leverage Ratio to exceed 4.00 to 1.00 at any time.",
        declaredRole: "FINANCIAL_TEST",
      },
    ],
    expectation: { credited: false },
  },
  {
    caseId: "A31-unsupported-presented-as-complete",
    category: "HONEST_SELF_DECLARATION",
    control: "NEGATIVE",
    description: "A representation that carries unresolved reasons while being presented as complete is itself a conflict, not a match.",
    gt: {
      id: "A31-gt",
      sectionRef: "6.07",
      text: "No Loan Party will enter into any Swap Agreement other than in the ordinary course of business to hedge or mitigate risks to which it is exposed.",
      unitType: "COVENANT",
    },
    candidates: [
      {
        id: "A31-c1",
        sectionRef: "6.07",
        text: "No Loan Party will enter into any Swap Agreement other than in the ordinary course of business to hedge or mitigate risks to which it is exposed.",
        accountingRole: "SUBSTANTIVE_REPRESENTATION",
        selfReport: { sufficiency: "COMPLETE", unresolvedReasons: ["hedging-purpose test could not be formalized"] },
      },
    ],
    expectation: { credited: false, requiredConflictCodes: ["UNSUPPORTED_SEMANTICS_PRESENTED_AS_COMPLETE"] },
  },
  {
    caseId: "A32-no-candidate-at-all",
    category: "SILENT_OMISSION",
    control: "NEGATIVE",
    description: "A CRITICAL claim with nothing corresponding to it at all is the canonical dangerous unaccounted omission.",
    gt: {
      id: "A32-gt",
      sectionRef: "5.15",
      text: "The Company may designate any Restricted Subsidiary as an Unrestricted Subsidiary only if no Default exists and the Company is in pro forma compliance with Section 6.12.",
      unitType: "COVENANT",
    },
    candidates: [
      {
        id: "A32-c1",
        sectionRef: "9.01",
        text: "All notices and other communications shall be in writing and delivered by hand or overnight courier service to the address specified on Schedule 9.01.",
      },
    ],
    expectation: { credited: false, allowedMatchStatuses: ["UNREPRESENTED"], dangerousUnaccounted: true },
  },
  {
    caseId: "A33-low-materiality-omission-is-not-dangerous",
    category: "SILENT_OMISSION",
    control: "POSITIVE",
    description: "An INFORMATIONAL claim with no representation is not a dangerous unaccounted omission. The metric must not inflate itself with boilerplate.",
    gt: {
      id: "A33-gt",
      sectionRef: "9.10",
      text: "The headings of Articles and Sections used in this Agreement are for convenience of reference only and shall not affect the construction of this Agreement.",
      unitType: "BOILERPLATE_SUMMARY",
      materiality: "INFORMATIONAL",
    },
    candidates: [],
    expectation: { credited: false, allowedMatchStatuses: ["UNREPRESENTED"], dangerousUnaccounted: false },
  },
];
