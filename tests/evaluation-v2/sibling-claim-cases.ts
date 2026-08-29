/**
 * Evaluation Methodology V2 — Phase 3F.1.5.3, Workstream A adversarial suite.
 *
 * SAME_COVENANT_FAMILY_IS_NOT_SAME_SEMANTIC_CLAIM. Every case isolates one
 * distinction from the phase charter's Section 9 list. All drafting is
 * invented; none is copied from or tuned to any real package. Positive
 * controls (17-19) prove the new I_CLAIM_IDENTITY dimension does not break
 * genuine partial/paraphrase/composite representation of the SAME claim.
 */
import type { CandidateAccountingRole, MatchStatus } from "@/lib/contract-model/evaluation-v2/types";
import type { SyntheticCandidateInput, SyntheticGtInput } from "./synthetic-fixtures";

export interface SiblingClaimCase {
  caseId: string;
  description: string;
  gt: SyntheticGtInput;
  candidates: SyntheticCandidateInput[];
  expectation: {
    credited: boolean;
    allowedMatchStatuses?: MatchStatus[];
    explicitlySurfacedAsUnsafe?: boolean;
    dangerousUnaccounted?: boolean;
  };
}

const roleFlag = (role: CandidateAccountingRole): Partial<SyntheticCandidateInput> => ({ accountingRole: role });

export const SIBLING_CLAIM_CASES: SiblingClaimCase[] = [
  {
    caseId: "SC01-two-different-baskets-same-section",
    description: "Two different baskets enumerated under the same restricted-payments section; candidate is the WRONG basket.",
    gt: { id: "SC01-gt", sectionRef: "6.11(c)", text: "Restricted Payments to repurchase Equity Interests from departed employees not to exceed $2,000,000 in the aggregate per fiscal year." },
    candidates: [{ id: "SC01-c1", sectionRef: "6.11(f)", text: "Restricted Payments consisting of dividends on preferred Equity Interests issued in connection with a Permitted Acquisition, not to exceed $5,000,000 in the aggregate." }],
    expectation: { credited: false, dangerousUnaccounted: true },
  },
  {
    caseId: "SC02-two-permissions-same-family-different-section",
    description: "Two permissions in the same covenant family (Investments) but under completely different, non-sibling sections.",
    gt: { id: "SC02-gt", sectionRef: "6.13(d)", text: "Investments in joint ventures engaged in a similar line of business, not to exceed $10,000,000 outstanding at any time." },
    candidates: [{ id: "SC02-c1", sectionRef: "6.13(q)", text: "Investments consisting of Swap Agreements entered into in the ordinary course of business for hedging purposes, not for speculation." }],
    expectation: { credited: false, dangerousUnaccounted: true },
  },
  {
    caseId: "SC03-permission-vs-exception-same-section",
    description: "The general chapeau prohibition vs. one specific enumerated exception under it (ancestor/descendant, not sibling) - H_PROVISION_ROLE_BREADTH's job.",
    gt: { id: "SC03-gt", sectionRef: "6.02", text: "No Loan Party will create, incur, assume or permit to exist any Lien on any of its property, except Permitted Liens described in this Section 6.02.", unitType: "COVENANT" },
    candidates: [{ id: "SC03-c1", sectionRef: "6.02(f)", text: "Liens securing Indebtedness incurred to finance the acquisition of fixed assets, not to exceed the purchase price of such assets." }],
    expectation: { credited: false, dangerousUnaccounted: true },
  },
  {
    caseId: "SC04-condition-vs-underlying-permission",
    description: "A candidate stating only the gating CONDITION for a different sibling permission, not the GT claim's own permission or its condition.",
    gt: { id: "SC04-gt", sectionRef: "6.13(h)", text: "Investments in an aggregate amount not to exceed the Available Amount, subject to no Default having occurred and being continuing." },
    candidates: [{ id: "SC04-c1", sectionRef: "6.13(k)", text: "The Payment Conditions must be satisfied prior to making any Investment permitted by this clause (k), including pro forma compliance with the Total Net Leverage Ratio." }],
    expectation: { credited: false, dangerousUnaccounted: true },
  },
  {
    caseId: "SC05-chapeau-vs-enumerated-basket",
    description: "Universal chapeau restriction vs. one narrow enumerated basket beneath it - must not be satisfied by the narrow basket alone.",
    gt: { id: "SC05-gt", sectionRef: "6.01", text: "No Loan Party will create, incur, assume or otherwise become liable for any Indebtedness, except as permitted by clauses (a) through (r) of this Section 6.01." },
    candidates: [{ id: "SC05-c1", sectionRef: "6.01(m)", text: "Indebtedness in respect of Capital Lease Obligations not to exceed $3,000,000 in the aggregate at any time outstanding." }],
    expectation: { credited: false, dangerousUnaccounted: true },
  },
  {
    caseId: "SC06-sibling-baskets-shared-defined-term",
    description: "Two sibling baskets that both reference the SAME defined term ('Available Amount'), which is not sufficient to establish they are the same claim.",
    gt: { id: "SC06-gt", sectionRef: "6.11(j)", text: "Restricted Payments not to exceed the Available Amount, so long as no Event of Default has occurred and is continuing." },
    candidates: [{ id: "SC06-c1", sectionRef: "6.13(l)", text: "Investments not to exceed the Available Amount, so long as no Event of Default has occurred and is continuing.", definedTerms: ["Available Amount"] }],
    expectation: { credited: false, dangerousUnaccounted: true },
  },
  {
    caseId: "SC07-sibling-baskets-shared-metric",
    description: "Two sibling baskets both gated on the SAME financial metric (Total Net Leverage Ratio) at different thresholds - shared metric is not shared claim.",
    gt: { id: "SC07-gt", sectionRef: "6.11(m)", text: "Restricted Payments permitted if, after giving pro forma effect, the Total Net Leverage Ratio does not exceed 3.50 to 1.00." },
    candidates: [{ id: "SC07-c1", sectionRef: "6.04(k)", text: "Dispositions of assets permitted if, after giving pro forma effect, the Total Net Leverage Ratio does not exceed 3.00 to 1.00." }],
    expectation: { credited: false, dangerousUnaccounted: true },
  },
  {
    caseId: "SC08-sibling-baskets-shared-amount",
    description: "Two sibling baskets that happen to share an identical dollar figure - the shared amount is not evidence of correspondence.",
    gt: { id: "SC08-gt", sectionRef: "6.01(n)", text: "Indebtedness in respect of surety bonds and performance bonds not to exceed $15,000,000 in the aggregate at any time outstanding." },
    candidates: [{ id: "SC08-c1", sectionRef: "6.02(j)", text: "Liens on cash collateral securing letters of credit not to exceed $15,000,000 in the aggregate at any time outstanding." }],
    expectation: { credited: false, dangerousUnaccounted: true },
  },
  {
    caseId: "SC09-guaranty-creation-vs-reinstatement",
    description: "Initial guaranty-creation obligation vs. the reinstatement-upon-avoidance obligation in the same guaranty article - different sub-provisions, different substantive claims.",
    gt: { id: "SC09-gt", sectionRef: "10.06", text: "If any payment received by a Lender is later rescinded or must be restored due to the Borrower's bankruptcy, each Guarantor's obligations are reinstated as though such payment had never been made." },
    candidates: [{ id: "SC09-c1", sectionRef: "10.01", text: "Each Guarantor hereby jointly and severally, irrevocably and unconditionally guarantees the full and punctual payment of the Guaranteed Obligations when due." }],
    expectation: { credited: false, dangerousUnaccounted: true },
  },
  {
    caseId: "SC10-debt-incurrence-vs-lien-permission",
    description: "Debt-incurrence basket vs. a lien permission in a sibling section that happens to secure the same kind of debt.",
    gt: { id: "SC10-gt", sectionRef: "6.01(p)", text: "Indebtedness under Purchase Money obligations not to exceed $8,000,000 in the aggregate at any time outstanding." },
    candidates: [{ id: "SC10-c1", sectionRef: "6.02(f)", text: "Liens securing Purchase Money Indebtedness permitted under Section 6.01(p), not extending to any property other than the property financed." }],
    expectation: { credited: false, dangerousUnaccounted: true },
  },
  {
    caseId: "SC11-investment-vs-acquisition-permission",
    description: "An investment basket vs. an acquisition permission in a sibling clause of the same Investments section.",
    gt: { id: "SC11-gt", sectionRef: "6.13(e)", text: "Investments in the form of loans and advances to officers and employees not to exceed $1,000,000 in the aggregate outstanding at any time." },
    candidates: [{ id: "SC11-c1", sectionRef: "6.13(p)", text: "Permitted Acquisitions of a similar line of business so long as the Total Net Leverage Ratio does not exceed 3.75 to 1.00 on a pro forma basis." }],
    expectation: { credited: false, dangerousUnaccounted: true },
  },
  {
    caseId: "SC12-dividend-vs-other-restricted-payment",
    description: "A dividend-specific basket vs. a sibling stock-repurchase basket under the same Restricted Payments section.",
    gt: { id: "SC12-gt", sectionRef: "6.11(a)", text: "The Company may declare and pay dividends solely in the form of its own common Equity Interests." },
    candidates: [{ id: "SC12-c1", sectionRef: "6.11(g)", text: "The Company may repurchase its common Equity Interests from a deceased or disabled employee's estate, not to exceed $500,000 per fiscal year." }],
    expectation: { credited: false, dangerousUnaccounted: true },
  },
  {
    caseId: "SC13-same-action-different-entity-scope",
    description: "Same governed action and same sibling-adjacent basket family, but the candidate's entity scope (Non-Loan-Party Subsidiary) is different from the GT's (Loan Party).",
    gt: { id: "SC13-gt", sectionRef: "6.01(q)", text: "Indebtedness of any Loan Party owing to another Loan Party, subordinated to the Obligations on terms reasonably satisfactory to the Administrative Agent." },
    candidates: [{ id: "SC13-c1", sectionRef: "6.01(r)", text: "Indebtedness of any Non-Loan-Party Subsidiary owing to another Non-Loan-Party Subsidiary, incurred in the ordinary course of business." }],
    expectation: { credited: false, dangerousUnaccounted: true },
  },
  {
    caseId: "SC14-same-economics-different-condition",
    description: "Two sibling baskets sharing the identical dollar cap, but gated on different, non-overlapping conditions.",
    gt: { id: "SC14-gt", sectionRef: "6.04(g)", text: "Dispositions of assets in an aggregate amount not to exceed $20,000,000 per fiscal year, so long as at least 75% of the consideration is cash." },
    candidates: [{ id: "SC14-c1", sectionRef: "6.04(h)", text: "Dispositions of assets in an aggregate amount not to exceed $20,000,000 per fiscal year, so long as no Default has occurred and is continuing." }],
    expectation: { credited: false, dangerousUnaccounted: true },
  },
  {
    caseId: "SC15-same-condition-different-underlying-action",
    description: "Two sibling clauses that both require the SAME gating condition (Payment Conditions) for different underlying actions.",
    gt: { id: "SC15-gt", sectionRef: "6.13(m)", text: "Investments in an unlimited amount so long as the Payment Conditions are satisfied at the time of such Investment." },
    candidates: [{ id: "SC15-c1", sectionRef: "6.11(n)", text: "Restricted Payments in an unlimited amount so long as the Payment Conditions are satisfied at the time of such Restricted Payment." }],
    expectation: { credited: false, dangerousUnaccounted: true },
  },
  {
    caseId: "SC16-same-defined-term-dependency-different-claim",
    description: "Two sibling clauses that both depend on the same defined term ('Excluded Subsidiary') for entirely different substantive purposes.",
    gt: { id: "SC16-gt", sectionRef: "6.14(c)", text: "Transactions with an Excluded Subsidiary on terms no less favorable than would be obtained in an arm's-length transaction with a non-Affiliate.", definedTerms: ["Excluded Subsidiary"] },
    candidates: [{ id: "SC16-c1", sectionRef: "6.13(o)", text: "Investments in any Excluded Subsidiary not to exceed $5,000,000 in the aggregate outstanding at any time.", definedTerms: ["Excluded Subsidiary"] }],
    expectation: { credited: false, dangerousUnaccounted: true },
  },
  {
    caseId: "SC17-genuine-partial-representation-same-claim-POSITIVE",
    description: "POSITIVE CONTROL: a candidate anchored at the SAME sub-provision as the GT claim, genuinely representing it but silent on one dimension - must still receive PARTIAL credit (the new dimension must not break legitimate partial matches).",
    gt: { id: "SC17-gt", sectionRef: "6.07(b)", text: "No Loan Party will engage in any line of business substantially different from the business conducted on the Closing Date, except for new ventures not exceeding $10,000,000 in the aggregate." },
    candidates: [{ id: "SC17-c1", sectionRef: "6.07(b)", text: "No Loan Party will engage in any line of business substantially different from the business conducted on the Closing Date." }],
    expectation: { credited: false, allowedMatchStatuses: ["PARTIAL"] },
  },
  {
    caseId: "SC18-paraphrase-same-subprovision-POSITIVE",
    description: "POSITIVE CONTROL: a paraphrased candidate anchored at the SAME sub-provision as the GT claim - must still be credited.",
    gt: { id: "SC18-gt", sectionRef: "6.04(m)", text: "No Loan Party will Dispose of equipment that is obsolete or worn out and no longer used or useful in its business, except in the ordinary course of business." },
    candidates: [{ id: "SC18-c1", sectionRef: "6.04(m)", text: "No Loan Party will Dispose of obsolete or worn-out equipment that is no longer useful to its business, other than dispositions occurring in the ordinary course of business." }],
    expectation: { credited: true, allowedMatchStatuses: ["EXACT_SINGLE", "EXACT_COMPOSITE"] },
  },
  {
    caseId: "SC19-composite-representation-same-claim-POSITIVE",
    description: "POSITIVE CONTROL: two candidates, each anchored at the SAME sub-provision as the GT claim (a common real-world split between an operative rule and its cross-referenced definition), jointly representing it - composite credit must still work.",
    gt: { id: "SC19-gt", sectionRef: "6.11(k)", text: "No Loan Party will make Restricted Payments in excess of the Cumulative Retained Excess Cash Flow Amount, calculated as provided in the definition of that term." },
    candidates: [
      { id: "SC19-c1", sectionRef: "6.11(k)", text: "No Loan Party will make Restricted Payments in excess of the Cumulative Retained Excess Cash Flow Amount." },
      { id: "SC19-c2", sectionRef: "6.11(k)", text: "The Cumulative Retained Excess Cash Flow Amount referenced in this clause (k)'s Restricted Payments basket is calculated as provided in the definition of that term.", definedTerms: ["Cumulative Retained Excess Cash Flow Amount"] },
    ],
    expectation: { credited: true, allowedMatchStatuses: ["EXACT_SINGLE", "EXACT_COMPOSITE"] },
  },
  {
    caseId: "SC20-one-candidate-offered-to-several-sibling-claims",
    description: "The SAME candidate (anchored at one specific sibling sub-provision) is offered against TWO different sibling GT claims under the same parent section - it may correspond to at most one, never both.",
    gt: { id: "SC20-gt-a", sectionRef: "6.02(d)", text: "Liens existing on the Closing Date and set forth on Schedule 6.02, and any modification, replacement, renewal or extension thereof." },
    candidates: [{ id: "SC20-c1", sectionRef: "6.02(k)", text: "Liens on property acquired after the Closing Date securing Indebtedness permitted under Section 6.01(m), incurred within 180 days of such acquisition.", ...roleFlag("SUBSTANTIVE_REPRESENTATION") }],
    expectation: { credited: false, dangerousUnaccounted: true },
  },
  {
    caseId: "SC20b-companion-same-candidate-against-other-sibling",
    description: "Companion to SC20: the exact same candidate content, offered against the OTHER sibling claim it is not about either - confirms the candidate does not opportunistically satisfy whichever GT claim is being tested.",
    gt: { id: "SC20b-gt-b", sectionRef: "6.02(m)", text: "Liens in favor of a landlord under any lease of real property entered into in the ordinary course of business, securing obligations not yet due." },
    candidates: [{ id: "SC20b-c1", sectionRef: "6.02(k)", text: "Liens on property acquired after the Closing Date securing Indebtedness permitted under Section 6.01(m), incurred within 180 days of such acquisition." }],
    expectation: { credited: false, dangerousUnaccounted: true },
  },
];
