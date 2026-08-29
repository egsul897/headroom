/**
 * Evaluation Methodology V2 — Phase 3F.1.5.2 safe-surfacing + definitional-match
 * calibration suite (case definitions).
 *
 * Covers Section 10 (definitional-match adversarial tests) and Section 16
 * (safe-surfacing adversarial tests) of the Phase 3F.1.5.2 charter. Every
 * case isolates ONE distinction; all drafting is invented, none copied from
 * or tuned to any real package. Candidates default to SUBSTANTIVE_REPRESENTATION
 * unless the case is specifically testing a non-substantive accounting role
 * (discovery-only, safety-flag, honest-unresolved).
 */
import type { CandidateAccountingRole, ConflictCode, EvaluationMateriality, MatchStatus } from "@/lib/contract-model/evaluation-v2/types";
import type { SyntheticCandidateInput, SyntheticGtInput } from "./synthetic-fixtures";

export interface SafeSurfacingCase {
  caseId: string;
  category: string;
  description: string;
  gt: SyntheticGtInput;
  candidates: SyntheticCandidateInput[];
  expectation: {
    credited: boolean;
    allowedMatchStatuses?: MatchStatus[];
    explicitlySurfacedAsUnsafe?: boolean;
    dangerousUnaccounted?: boolean;
    requiredConflictCodes?: ConflictCode[];
  };
}

const roleFlag = (role: CandidateAccountingRole): Partial<SyntheticCandidateInput> => ({ accountingRole: role });

export const SAFE_SURFACING_CASES: SafeSurfacingCase[] = [
  // =========================================================================
  // SECTION 10 — definitional-match adversarial tests
  // =========================================================================
  {
    caseId: "SS01-definition-term-nearby-not-depended-on",
    category: "DEFINITIONAL_MATCH",
    description: "Same definition term appears nearby but the GT claim does not depend on it.",
    gt: { id: "SS01-gt", sectionRef: "1.01", unitType: "DEFINITION", text: "Facility Fee: an amount equal to 0.25% per annum on the average daily unused Commitments, payable quarterly in arrears.", definedTerms: ["Facility Fee"] },
    candidates: [{ id: "SS01-c1", sectionRef: "1.01", text: "Permitted Reorganization means any transaction pursuant to which a Subsidiary is merged with or into another Subsidiary for tax or administrative efficiency purposes.", definedTerms: ["Permitted Reorganization"] }],
    expectation: { credited: false, dangerousUnaccounted: true },
  },
  {
    caseId: "SS02-definition-gt-explicitly-depends-valid-match",
    category: "DEFINITIONAL_MATCH",
    description: "GT explicitly depends on the definition — a genuine, valid match.",
    gt: { id: "SS02-gt", sectionRef: "1.01", unitType: "DEFINITION", text: "Facility Fee: an amount equal to 0.25% per annum on the average daily unused Commitments, payable quarterly in arrears.", definedTerms: ["Facility Fee"] },
    candidates: [{ id: "SS02-c1", sectionRef: "1.01", text: "Facility Fee means an amount equal to 0.25% per annum on the average daily unused Commitments, payable quarterly in arrears on the last Business Day of each calendar quarter.", definedTerms: ["Facility Fee"] }],
    expectation: { credited: true, allowedMatchStatuses: ["EXACT_SINGLE", "EXACT_COMPOSITE"] },
  },
  {
    caseId: "SS03-definition-used-by-sibling-rule-not-gt-rule",
    category: "DEFINITIONAL_MATCH",
    description: "A definition is used by a sibling covenant rule, but not by the specific GT rule being tested.",
    gt: { id: "SS03-gt", sectionRef: "6.02", unitType: "COVENANT", text: "No Loan Party will create, incur, assume or permit to exist any Lien on any Real Property, except Liens securing Purchase Money Indebtedness on equipment acquired after the Closing Date." },
    candidates: [{ id: "SS03-c1", sectionRef: "6.01", text: "No Loan Party will incur any Indebtedness, except Purchase Money Indebtedness not to exceed $5,000,000 in the aggregate at any time outstanding." }],
    expectation: { credited: false, dangerousUnaccounted: true },
  },
  {
    caseId: "SS04-multiple-definitions-lexical-overlap",
    category: "DEFINITIONAL_MATCH",
    description: "Multiple candidate definitions share lexical overlap with the GT claim's vocabulary, but only one is the actual defined term at issue.",
    gt: { id: "SS04-gt", sectionRef: "1.01", unitType: "DEFINITION", text: "Applicable Rate: the percentage per annum set forth in the Pricing Grid, based on the Total Net Leverage Ratio as of the most recent Compliance Certificate.", definedTerms: ["Applicable Rate"] },
    candidates: [
      { id: "SS04-c1", sectionRef: "1.01", text: "Default Rate means, at any time, a rate per annum equal to 2.00% plus the rate otherwise applicable to the relevant Loan or Obligation.", definedTerms: ["Default Rate"] },
      { id: "SS04-c2", sectionRef: "1.01", text: "Applicable Rate means the percentage per annum set forth in the Pricing Grid opposite the applicable Total Net Leverage Ratio.", definedTerms: ["Applicable Rate"] },
    ],
    expectation: { credited: true, allowedMatchStatuses: ["EXACT_SINGLE", "EXACT_COMPOSITE"] },
  },
  {
    caseId: "SS05-same-definition-name-across-instruments",
    category: "DEFINITIONAL_MATCH",
    description: "The same defined-term NAME is used in two different instruments with materially different content; the wrong-instrument candidate must not be credited.",
    gt: { id: "SS05-gt", sectionRef: "1.01", documentId: "instrument-a", unitType: "DEFINITION", text: "Permitted Investments: (a) direct obligations of the United States government maturing within one year; (b) commercial paper rated A-1 or higher maturing within 270 days.", definedTerms: ["Permitted Investments"] },
    candidates: [{ id: "SS05-c1", sectionRef: "1.01", documentId: "instrument-b", text: "Permitted Investments: (a) investments in Subsidiaries; (b) loans to officers and employees not to exceed $500,000 in the aggregate; (c) Investments in joint ventures not to exceed $10,000,000.", definedTerms: ["Permitted Investments"] }],
    expectation: { credited: false, dangerousUnaccounted: true, requiredConflictCodes: undefined },
  },
  {
    caseId: "SS06-correct-definition-wrong-document",
    category: "DEFINITIONAL_MATCH",
    description: "A candidate is a substantively correct restatement of the claim's own definition, but is anchored in the wrong operative document (e.g. a superseded agreement).",
    gt: { id: "SS06-gt", sectionRef: "1.01", documentId: "amended-and-restated", unitType: "DEFINITION", text: "Consolidated EBITDA: net income plus interest expense, taxes, depreciation and amortization, each as determined on a consolidated basis in accordance with GAAP.", definedTerms: ["Consolidated EBITDA"] },
    candidates: [{ id: "SS06-c1", sectionRef: "1.01", documentId: "original-2019-agreement", text: "Consolidated EBITDA means net income plus interest expense, taxes, depreciation and amortization, determined on a consolidated basis in accordance with GAAP.", definedTerms: ["Consolidated EBITDA"] }],
    expectation: { credited: false },
  },
  {
    caseId: "SS07-definition-referenced-through-dependency-chain",
    category: "DEFINITIONAL_MATCH",
    description: "The GT claim's definition is only reachable through a genuine cross-reference chain (defined term B is defined by reference to term A); the candidate correctly represents the chain.",
    gt: { id: "SS07-gt", sectionRef: "1.01", unitType: "DEFINITION", text: "Excess Cash Flow Percentage: 50% if the Total Net Leverage Ratio exceeds 3.00 to 1.00 as of the last day of the applicable fiscal year, 25% if such ratio is 3.00 to 1.00 or less but greater than 2.00 to 1.00, and 0% otherwise.", definedTerms: ["Excess Cash Flow Percentage", "Total Net Leverage Ratio"] },
    candidates: [{ id: "SS07-c1", sectionRef: "1.01", text: "Excess Cash Flow Percentage means 50% if the Total Net Leverage Ratio (as defined in Section 1.01) exceeds 3.00 to 1.00, 25% if between 2.00 to 1.00 and 3.00 to 1.00, and 0% below 2.00 to 1.00, each measured as of the applicable fiscal year end.", definedTerms: ["Excess Cash Flow Percentage", "Total Net Leverage Ratio"] }],
    expectation: { credited: true, allowedMatchStatuses: ["EXACT_SINGLE", "EXACT_COMPOSITE", "PARTIAL"] },
  },
  {
    caseId: "SS08-definition-correct-word-unrelated-legal-function",
    category: "DEFINITIONAL_MATCH",
    description: "A candidate contains the exact defined-term word but performs an unrelated legal function (a covenant exception, not the definition itself).",
    gt: { id: "SS08-gt", sectionRef: "1.01", unitType: "DEFINITION", text: "Restricted Subsidiary: any Subsidiary of the Company other than an Unrestricted Subsidiary.", definedTerms: ["Restricted Subsidiary"] },
    candidates: [{ id: "SS08-c1", sectionRef: "6.04", text: "No Restricted Subsidiary will make any Investment in any Person other than a Loan Party, except Investments not to exceed $2,000,000 in the aggregate." }],
    expectation: { credited: false, dangerousUnaccounted: true },
  },
  {
    caseId: "SS09-one-definition-offered-to-multiple-claims-only-one-valid",
    category: "DEFINITIONAL_MATCH",
    description: "The same compiled definition candidate is offered against two different GT claims; only one is the genuine match. (Two separate units sharing one candidate pool.)",
    gt: { id: "SS09-gt-net-worth", sectionRef: "1.01", unitType: "DEFINITION", text: "Consolidated Net Worth: total stockholders' equity of the Company and its Subsidiaries determined on a consolidated basis in accordance with GAAP.", definedTerms: ["Consolidated Net Worth"] },
    candidates: [{ id: "SS09-c1", sectionRef: "1.01", text: "Consolidated Net Worth means total stockholders' equity of the Company and its Subsidiaries, determined on a consolidated basis in accordance with GAAP.", definedTerms: ["Consolidated Net Worth"] }],
    expectation: { credited: true, allowedMatchStatuses: ["EXACT_SINGLE", "EXACT_COMPOSITE"] },
  },
  {
    caseId: "SS09b-same-candidate-against-unrelated-claim",
    category: "DEFINITIONAL_MATCH",
    description: "Companion to SS09: the SAME candidate's content, offered against an unrelated second claim, must be refused.",
    gt: { id: "SS09b-gt-swingline", sectionRef: "1.01", unitType: "DEFINITION", text: "Swingline Sublimit: $10,000,000, the maximum aggregate principal amount of Swingline Loans outstanding at any time.", definedTerms: ["Swingline Sublimit"] },
    candidates: [{ id: "SS09b-c1", sectionRef: "1.01", text: "Consolidated Net Worth means total stockholders' equity of the Company and its Subsidiaries, determined on a consolidated basis in accordance with GAAP.", definedTerms: ["Consolidated Net Worth"] }],
    expectation: { credited: false, dangerousUnaccounted: true },
  },
  {
    caseId: "SS10-paraphrased-dependency-genuine-relationship",
    category: "DEFINITIONAL_MATCH",
    description: "A paraphrased candidate whose dependency relationship to the GT claim is genuinely real (not merely lexically similar) should still be credited.",
    gt: { id: "SS10-gt", sectionRef: "1.01", unitType: "DEFINITION", text: "Change of Control: any Person or group coming to beneficially own more than 35% of the outstanding voting Equity Interests of the Company.", definedTerms: ["Change of Control"] },
    candidates: [{ id: "SS10-c1", sectionRef: "1.01", text: "'Change of Control' occurs when any single Person, or a group acting together, comes to beneficially own in excess of thirty-five percent (35%) of the Company's voting equity.", declaredRole: "DEFINITION", definedTerms: ["Change of Control"] }],
    expectation: { credited: true, allowedMatchStatuses: ["EXACT_SINGLE", "EXACT_COMPOSITE"] },
  },

  // =========================================================================
  // SECTION 16 — safe-surfacing adversarial tests
  // =========================================================================
  {
    caseId: "SS11-same-section-unrelated-unresolved-flag",
    category: "SAFE_SURFACING",
    description: "Same section as the GT claim, but the flagged candidate is unrelated - must not count as safe surfacing.",
    gt: { id: "SS11-gt", sectionRef: "5.09", text: "The Company shall maintain in effect and enforce policies and procedures reasonably designed to promote compliance with applicable anti-corruption laws." },
    candidates: [{ id: "SS11-c1", sectionRef: "5.09", text: "The Company shall deliver to the Administrative Agent an annual budget within 90 days after the start of each fiscal year.", ...roleFlag("HONEST_UNRESOLVED"), selfReport: { unresolvedReasons: ["ambiguous drafting"] } }],
    expectation: { credited: false, explicitlySurfacedAsUnsafe: false, dangerousUnaccounted: true },
  },
  {
    caseId: "SS12-parent-unresolved-flag-unrelated-child-gt",
    category: "SAFE_SURFACING",
    description: "A parent-chapeau-level unresolved flag must not safely surface an unrelated child clause underneath it.",
    gt: { id: "SS12-gt", sectionRef: "6.05(c)", text: "Dispositions of obsolete or worn-out equipment no longer used or useful in the business, in the ordinary course of business." },
    candidates: [{ id: "SS12-c1", sectionRef: "6.05", text: "No Loan Party will Dispose of any asset, except as permitted by clauses (a) through (k) of this Section 6.05.", ...roleFlag("HONEST_UNRESOLVED"), selfReport: { unresolvedReasons: ["chapeau ambiguity"] } }],
    expectation: { credited: false, explicitlySurfacedAsUnsafe: false, dangerousUnaccounted: true },
  },
  {
    caseId: "SS13-child-unresolved-flag-unrelated-parent-gt",
    category: "SAFE_SURFACING",
    description: "An unresolved flag on a narrow child exception must not safely surface the general parent prohibition it sits under.",
    gt: { id: "SS13-gt", sectionRef: "6.01", text: "No Loan Party will create, incur, assume or otherwise become or remain liable with respect to any Indebtedness, except as permitted by clauses (a) through (p) of this Section 6.01." },
    candidates: [{ id: "SS13-c1", sectionRef: "6.01(p)", text: "Indebtedness in an aggregate outstanding principal amount not to exceed $15,000,000 at any time.", ...roleFlag("HONEST_UNRESOLVED"), selfReport: { unresolvedReasons: ["basket sizing ambiguity"] } }],
    expectation: { credited: false, explicitlySurfacedAsUnsafe: false, dangerousUnaccounted: true },
  },
  {
    caseId: "SS14-same-covenant-family-different-action",
    category: "SAFE_SURFACING",
    description: "Same covenant family (Liens) but a fundamentally different action (creating vs releasing) must not correspond.",
    gt: { id: "SS14-gt", sectionRef: "6.02", text: "No Loan Party will create, incur, or permit to exist any Lien on any Collateral, except Permitted Liens." },
    candidates: [{ id: "SS14-c1", sectionRef: "9.15", text: "The Administrative Agent is authorized to release any Lien on Collateral being disposed of in a transaction permitted under this Agreement." }],
    expectation: { credited: false, dangerousUnaccounted: true },
  },
  {
    caseId: "SS15-same-amount-different-semantic-claim",
    category: "SAFE_SURFACING",
    description: "Sharing an identical dollar figure is not evidence of correspondence when the underlying claims are different.",
    gt: { id: "SS15-gt", sectionRef: "2.01", text: "The aggregate Revolving Commitments as of the Closing Date shall be $25,000,000." },
    candidates: [{ id: "SS15-c1", sectionRef: "6.09", text: "Transactions with Affiliates in an aggregate amount not to exceed $25,000,000 per fiscal year are permitted if on arm's-length terms." }],
    expectation: { credited: false, dangerousUnaccounted: true },
  },
  {
    caseId: "SS16-same-defined-term-unrelated-dependency",
    category: "SAFE_SURFACING",
    description: "Sharing a defined term does not establish correspondence when the candidate's actual dependency on that term is for an unrelated purpose.",
    gt: { id: "SS16-gt", sectionRef: "6.11", text: "No Loan Party will amend, modify or waive any provision of its certificate of incorporation in a manner materially adverse to the Lenders." },
    candidates: [{ id: "SS16-c1", sectionRef: "5.02", text: "Each Loan Party's certificate of incorporation shall be delivered to the Administrative Agent as a condition precedent to the Closing Date." }],
    expectation: { credited: false, dangerousUnaccounted: true },
  },
  {
    caseId: "SS17-generic-review-required-multiple-independent-claims",
    category: "SAFE_SURFACING",
    description: "A generic REVIEW_REQUIRED flag in a section containing multiple independent claims must only safely surface the specific claim it actually corresponds to, not every claim in that section.",
    gt: { id: "SS17-gt-a", sectionRef: "6.09(a)", text: "Transactions with Affiliates on terms no less favorable than would be obtained in an arm's-length transaction with a non-Affiliate." },
    candidates: [{ id: "SS17-c1", sectionRef: "6.09(b)", text: "The foregoing shall not apply to reasonable compensation paid to officers and directors in the ordinary course of business.", ...roleFlag("SAFETY_FLAG"), selfReport: { reviewStatus: "REVIEW_REQUIRED" } }],
    expectation: { credited: false, explicitlySurfacedAsUnsafe: false, dangerousUnaccounted: true },
  },
  {
    caseId: "SS18-unresolved-cross-reference-genuinely-relevant",
    category: "SAFE_SURFACING",
    description: "An unresolved candidate whose cross-reference IS genuinely about the GT claim must count as safe surfacing.",
    gt: { id: "SS18-gt", sectionRef: "6.12", text: "The Total Net Leverage Ratio shall not exceed 4.00 to 1.00 as of the last day of any fiscal quarter." },
    candidates: [{ id: "SS18-c1", sectionRef: "6.12", text: "The Total Net Leverage Ratio shall not exceed the level set forth in the Pricing Grid as of the last day of any fiscal quarter, but the applicable Pricing Grid amendment referenced in this Section could not be located in the available source text.", ...roleFlag("HONEST_UNRESOLVED"), selfReport: { unresolvedReasons: ["pricing grid amendment not located"] } }],
    expectation: { credited: false, explicitlySurfacedAsUnsafe: true, dangerousUnaccounted: false },
  },
  {
    caseId: "SS19-unsupported-formula-genuinely-relevant",
    category: "SAFE_SURFACING",
    description: "A candidate that explicitly declares it cannot represent the GT claim's formula, where the formula IS the one at issue, must count as safe surfacing.",
    gt: { id: "SS19-gt", sectionRef: "1.01", unitType: "DEFINITION", text: "Consolidated Fixed Charge Coverage Ratio: the ratio of Consolidated EBITDA minus Capital Expenditures to Consolidated Fixed Charges, in each case for the most recently ended four fiscal quarters.", definedTerms: ["Consolidated Fixed Charge Coverage Ratio"] },
    candidates: [{ id: "SS19-c1", sectionRef: "1.01", text: "Consolidated Fixed Charge Coverage Ratio means the ratio of Consolidated EBITDA minus Capital Expenditures to Consolidated Fixed Charges, for the most recently ended four fiscal quarters; this formula could not be modeled because 'Consolidated Fixed Charges' is itself defined by reference to a schedule that was not located.", declaredRole: "DEFINITION", ...roleFlag("HONEST_UNSUPPORTED"), selfReport: { sufficiency: "MISSING_CONTEXT" }, definedTerms: ["Consolidated Fixed Charge Coverage Ratio"] }],
    expectation: { credited: false, explicitlySurfacedAsUnsafe: true, dangerousUnaccounted: false },
  },
  {
    caseId: "SS20-partial-representation-genuinely-relevant",
    category: "SAFE_SURFACING",
    description: "A genuinely on-point but incomplete representation should receive PARTIAL, not be lost to an unrelated-candidate false negative.",
    gt: { id: "SS20-gt", sectionRef: "6.07", text: "No Loan Party will engage in any line of business other than the business conducted on the Closing Date and businesses reasonably related, ancillary or complementary thereto." },
    candidates: [{ id: "SS20-c1", sectionRef: "6.07", text: "No Loan Party will engage in any line of business substantially different from the business conducted on the Closing Date." }],
    expectation: { credited: true, allowedMatchStatuses: ["PARTIAL", "EXACT_SINGLE", "EXACT_COMPOSITE"] },
  },
  {
    caseId: "SS21-discovery-only-genuinely-corresponding",
    category: "SAFE_SURFACING",
    description: "An uncompiled discovery-only candidate that genuinely, specifically corresponds to the GT claim must not receive representation credit, and - per the discovery-vs-representation distinction (mere discovery is never safe surfacing) - must still remain DANGEROUS_UNACCOUNTED, since nothing here is an honest safe-surfacing declaration the user would actually see.",
    gt: { id: "SS21-gt", sectionRef: "6.10", text: "No Loan Party will enter into any agreement that restricts the ability of any Restricted Subsidiary to pay dividends to the Company." },
    candidates: [{ id: "SS21-c1", sectionRef: "6.10", text: "No Loan Party will enter into any agreement restricting the ability of any Restricted Subsidiary to pay dividends to the Company.", ...roleFlag("INVENTORY_ONLY") }],
    expectation: { credited: false, dangerousUnaccounted: true },
  },
  {
    caseId: "SS22-discovery-only-merely-topically-related",
    category: "SAFE_SURFACING",
    description: "A discovery-only candidate that is merely topically related (same general subject, different specific claim) must not be treated as corresponding at all.",
    gt: { id: "SS22-gt", sectionRef: "6.10", text: "No Loan Party will enter into any agreement that restricts the ability of any Restricted Subsidiary to pay dividends to the Company." },
    candidates: [{ id: "SS22-c1", sectionRef: "6.10", text: "No Loan Party will enter into any agreement restricting the ability of any Restricted Subsidiary to create Liens on its property.", ...roleFlag("INVENTORY_ONLY") }],
    expectation: { credited: false, dangerousUnaccounted: true },
  },
  {
    caseId: "SS23-ambiguous-cluster-genuinely-corresponding",
    category: "SAFE_SURFACING",
    description: "Two irreconcilable candidates (differing only on a numeric detail the GT claim is silent about) both genuinely, closely correspond to the same GT claim - the evaluator must say AMBIGUOUS rather than pick a winner. AMBIGUOUS is not itself a self-declared safe-surfacing state, so it correctly remains DANGEROUS_UNACCOUNTED (nobody has told the user which reading governs).",
    gt: { id: "SS23-gt", sectionRef: "6.08", text: "The Company may repurchase its Equity Interests from employees upon termination of employment in the ordinary course of business." },
    candidates: [
      { id: "SS23-c1", sectionRef: "6.08", text: "The Company may repurchase its Equity Interests from employees upon termination of employment in the ordinary course of business, in an aggregate amount not to exceed $5,000,000 per fiscal year." },
      { id: "SS23-c2", sectionRef: "6.08", text: "The Company may repurchase its Equity Interests from employees upon termination of employment in the ordinary course of business, in an aggregate amount not to exceed $20,000,000 per fiscal year." },
    ],
    expectation: { credited: false, allowedMatchStatuses: ["AMBIGUOUS"], dangerousUnaccounted: true },
  },
  {
    caseId: "SS24-ambiguous-candidates-all-unrelated",
    category: "SAFE_SURFACING",
    description: "Two candidates that are merely both weakly plausible AND both unrelated to the GT claim must resolve as a silent omission, not AMBIGUOUS.",
    gt: { id: "SS24-gt", sectionRef: "10.06", text: "If any payment received by a Lender is later rescinded or must be restored due to the Borrower's bankruptcy, the guarantor's obligations are reinstated as though such payment had never been made." },
    candidates: [
      { id: "SS24-c1", sectionRef: "9.08", text: "Each Lender is authorized to set off and apply deposits held by it against Obligations owing to it upon the occurrence of an Event of Default." },
      { id: "SS24-c2", sectionRef: "10.04", text: "Each Loan Guarantor waives any defense arising from the unenforceability of the Guaranteed Obligations against the Borrower." },
    ],
    expectation: { credited: false, dangerousUnaccounted: true },
  },
  {
    caseId: "SS25-correct-flag-wrong-instrument",
    category: "SAFE_SURFACING",
    description: "A candidate that would otherwise correspond, but is anchored in a different (non-operative) instrument, must not safely surface the claim in the operative one.",
    gt: { id: "SS25-gt", sectionRef: "6.12", documentId: "second-amendment", text: "The Total Net Leverage Ratio shall not exceed 3.50 to 1.00 as of the last day of any fiscal quarter ending after the Second Amendment Effective Date." },
    candidates: [{ id: "SS25-c1", sectionRef: "6.12", documentId: "original-credit-agreement", text: "The Total Net Leverage Ratio covenant level could not be confirmed against the current operative amendment.", ...roleFlag("HONEST_UNRESOLVED"), selfReport: { unresolvedReasons: ["superseded operative version"] } }],
    expectation: { credited: false, dangerousUnaccounted: true },
  },
  {
    caseId: "SS26-correct-flag-wrong-operative-version",
    category: "SAFE_SURFACING",
    description: "A candidate flags uncertainty, but the flagged text is drawn from a pre-amendment (non-operative) version of the same section — the flag is not about the currently operative claim.",
    gt: { id: "SS26-gt", sectionRef: "6.05", text: "No Loan Party will Dispose of assets in excess of $10,000,000 in the aggregate during any fiscal year, as amended by the Third Amendment." },
    candidates: [{ id: "SS26-c1", sectionRef: "6.05", text: "No Loan Party will Dispose of assets in excess of $5,000,000 in the aggregate during any fiscal year.", ...roleFlag("HONEST_UNRESOLVED"), selfReport: { unresolvedReasons: ["pre-amendment text, operative status uncertain"] } }],
    expectation: { credited: false, dangerousUnaccounted: true },
  },
];
