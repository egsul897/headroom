/**
 * Evaluation Contract V3 — required adversarial test scenarios (Section 22).
 *
 * Each case is INVENTED drafting isolating one atomic-dimension distinction.
 * None is copied from, or tuned to, any real package.
 */
import type { GroundTruthOverlayEntry } from "@/lib/contract-model/evaluation-v2/types";
import { candidate, gt, SyntheticCandidateInput, SyntheticGtInput } from "./synthetic-fixtures";

export interface AtomicContractCase {
  caseId: string;
  description: string;
  gt: SyntheticGtInput;
  candidates: SyntheticCandidateInput[];
  overlayEntry?: Omit<GroundTruthOverlayEntry, "gtUnitId" | "authoredBy" | "authoredAt">;
  expect: {
    creditEligibility: "CREDIT" | "NO_CREDIT";
    surfacingStatus?: "SPECIFICALLY_SURFACED" | "NOT_SPECIFICALLY_SURFACED" | "NOT_APPLICABLE";
    representationCompleteness?: "NONE" | "PARTIAL" | "FULL";
    verificationStatus?: "NOT_EVALUATED" | "NOT_VERIFIED" | "VERIFICATION_INCOMPLETE" | "VERIFIED" | "CONTRADICTED";
    evidenceQuality?: "SUFFICIENT" | "AMBIGUOUS" | "INSUFFICIENT";
    dangerousSilentOmission?: boolean;
  };
}

export const ATOMIC_CONTRACT_CASES: AtomicContractCase[] = [
  {
    caseId: "AC01",
    description: "correct full same-claim representation",
    gt: { id: "ac01-gt", sectionRef: "6.01(a)", text: "No Loan Party will incur Indebtedness except Permitted Debt not to exceed $10,000,000 in the aggregate." },
    candidates: [
      { id: "ac01-c1", sectionRef: "6.01(a)", text: "No Loan Party will incur Indebtedness except Permitted Debt not to exceed $10,000,000 in the aggregate.", accountingRole: "SUBSTANTIVE_REPRESENTATION" },
    ],
    expect: { creditEligibility: "CREDIT", representationCompleteness: "FULL", surfacingStatus: "NOT_APPLICABLE" },
  },
  {
    caseId: "AC02",
    description: "incomplete same-claim representation",
    gt: {
      id: "ac02-gt",
      sectionRef: "6.02(b)",
      text: "No Loan Party will make Investments except Permitted Investments not to exceed $5,000,000, provided no Event of Default has occurred and is continuing.",
    },
    candidates: [
      { id: "ac02-c1", sectionRef: "6.02(b)", text: "No Loan Party will make Investments except Permitted Investments not to exceed $5,000,000.", accountingRole: "SUBSTANTIVE_REPRESENTATION" },
    ],
    expect: { creditEligibility: "NO_CREDIT", representationCompleteness: "PARTIAL" },
  },
  {
    caseId: "AC03",
    description: "unrelated sibling representation (different enumerated sub-item, same parent)",
    gt: { id: "ac03-gt", sectionRef: "6.03(d)", text: "No Loan Party will Dispose of the Fixed Asset Collateral except in the ordinary course of business." },
    candidates: [
      {
        id: "ac03-c1",
        sectionRef: "6.03(g)",
        text: "No Loan Party will Dispose of Intellectual Property Collateral except non-exclusive licenses granted in the ordinary course of business.",
        accountingRole: "SUBSTANTIVE_REPRESENTATION",
      },
    ],
    expect: { creditEligibility: "NO_CREDIT", representationCompleteness: "NONE" },
  },
  {
    caseId: "AC04",
    description: "sibling review warning does not surface this claim",
    gt: { id: "ac04-gt", sectionRef: "6.04(c)", text: "No Loan Party will make Restricted Payments except dividends permitted under the General RP Basket." },
    candidates: [
      {
        id: "ac04-c1",
        sectionRef: "6.04(e)",
        text: "No Loan Party will make Restricted Payments except stock buybacks permitted under the Employee Buyback Basket.",
        accountingRole: "SAFETY_FLAG",
        selfReport: { reviewStatus: "REVIEW_REQUIRED", coverageState: "REVIEW_REQUIRED" },
      },
    ],
    expect: { creditEligibility: "NO_CREDIT", surfacingStatus: "NOT_SPECIFICALLY_SURFACED", dangerousSilentOmission: true },
  },
  {
    caseId: "AC05",
    description: "claim-specific unresolved warning IS surfacing",
    gt: { id: "ac05-gt", sectionRef: "6.05(a)", text: "No Loan Party will incur Liens on the Collateral except Permitted Liens under the Intercreditor Agreement." },
    candidates: [
      {
        id: "ac05-c1",
        sectionRef: "6.05(a)",
        text: "No Loan Party will incur Liens on the Collateral except Permitted Liens under the Intercreditor Agreement.",
        accountingRole: "HONEST_UNRESOLVED",
        selfReport: { unresolvedReasons: ["Intercreditor Agreement definition of Permitted Liens could not be located in the evidence packet"] },
      },
    ],
    expect: { creditEligibility: "NO_CREDIT", surfacingStatus: "SPECIFICALLY_SURFACED", dangerousSilentOmission: false },
  },
  {
    caseId: "AC06",
    description: "generic section-level warning does not count as claim-specific surfacing",
    gt: { id: "ac06-gt", sectionRef: "6.06(b)", text: "No Loan Party will enter into Affiliate Transactions except on arm's-length terms disclosed to the Administrative Agent." },
    candidates: [
      {
        id: "ac06-c1",
        sectionRef: "6.06",
        text: "Article VI generally imposes negative covenants restricting Loan Party conduct; review of the full article is recommended.",
        accountingRole: "SAFETY_FLAG",
        selfReport: { reviewStatus: "GENERAL_REVIEW_RECOMMENDED" },
      },
    ],
    expect: { creditEligibility: "NO_CREDIT", dangerousSilentOmission: true },
  },
  {
    caseId: "AC07",
    description: "same-family unrelated candidate (shares covenant family/vocabulary, different claim entirely)",
    gt: { id: "ac07-gt", sectionRef: "6.07(a)", text: "No Loan Party will consummate a Fundamental Change without prior written consent of the Required Lenders." },
    candidates: [
      {
        id: "ac07-c1",
        sectionRef: "6.02(x)",
        text: "No Loan Party will make Investments in joint ventures except Permitted JV Investments not to exceed $2,000,000.",
        accountingRole: "SUBSTANTIVE_REPRESENTATION",
      },
    ],
    expect: { creditEligibility: "NO_CREDIT", representationCompleteness: "NONE" },
  },
  {
    caseId: "AC08",
    description: "same action, different object",
    gt: { id: "ac08-gt", sectionRef: "6.08(a)", text: "No Loan Party will Guarantee the Indebtedness of any Unrestricted Subsidiary." },
    candidates: [
      { id: "ac08-c1", sectionRef: "6.08(a)", text: "No Loan Party will Guarantee the lease obligations of any Restricted Subsidiary landlord counterparty.", accountingRole: "SUBSTANTIVE_REPRESENTATION" },
    ],
    expect: { creditEligibility: "NO_CREDIT" },
  },
  {
    caseId: "AC09",
    description: "same object, different condition (a different specific claim, not a partial version of this one)",
    gt: {
      id: "ac09-gt",
      sectionRef: "6.09(a)",
      text: "No Loan Party will make Restricted Payments in excess of $1,000,000 unless the Total Leverage Ratio is less than 3.00:1.00 on a Pro Forma Basis.",
    },
    candidates: [
      {
        id: "ac09-c1",
        sectionRef: "6.09(b)",
        text: "No Loan Party will make Restricted Payments in excess of $1,000,000 unless no Default or Event of Default has occurred and is continuing.",
        accountingRole: "SUBSTANTIVE_REPRESENTATION",
      },
    ],
    expect: { creditEligibility: "NO_CREDIT" },
  },
  {
    caseId: "AC10",
    description: "silent material omission (dangerous)",
    gt: { id: "ac10-gt", sectionRef: "6.10(a)", text: "No Loan Party will amend its Organizational Documents in a manner materially adverse to the Lenders.", materiality: "CRITICAL" },
    candidates: [],
    expect: { creditEligibility: "NO_CREDIT", surfacingStatus: "NOT_SPECIFICALLY_SURFACED", representationCompleteness: "NONE", dangerousSilentOmission: true },
  },
  {
    caseId: "AC11",
    description: "safely surfaced material failure (not dangerous)",
    gt: { id: "ac11-gt", sectionRef: "6.11(a)", text: "No Loan Party will change its fiscal year without prior written notice to the Administrative Agent.", materiality: "CRITICAL" },
    candidates: [
      {
        id: "ac11-c1",
        sectionRef: "6.11(a)",
        text: "No Loan Party will change its fiscal year without prior written notice to the Administrative Agent.",
        accountingRole: "HONEST_UNSUPPORTED",
        selfReport: { sufficiency: "UNSUPPORTED", unresolvedReasons: ["source excerpt truncated before the operative sentence completed"] },
      },
    ],
    expect: { creditEligibility: "NO_CREDIT", surfacingStatus: "SPECIFICALLY_SURFACED", dangerousSilentOmission: false },
  },
  {
    caseId: "AC12",
    description: "contradictory verification evidence (a substantive representation that materially conflicts with the claim)",
    gt: { id: "ac12-gt", sectionRef: "6.12(a)", text: "Restricted Payments are permitted only if the Total Leverage Ratio does not exceed 3.00:1.00 on a Pro Forma Basis." },
    candidates: [
      {
        id: "ac12-c1",
        sectionRef: "6.12(a)",
        text: "Restricted Payments are permitted only if the Total Leverage Ratio is not less than 3.00:1.00 on a Pro Forma Basis.",
        accountingRole: "SUBSTANTIVE_REPRESENTATION",
      },
    ],
    expect: { creditEligibility: "NO_CREDIT", verificationStatus: "CONTRADICTED" },
  },
  {
    caseId: "AC13",
    description: "representation with no verification evidence at all",
    gt: { id: "ac13-gt", sectionRef: "6.13(a)", text: "No Loan Party will change its jurisdiction of organization without 10 Business Days' prior written notice." },
    candidates: [
      { id: "ac13-c1", sectionRef: "6.13(a)", text: "No Loan Party will change its jurisdiction of organization without 10 Business Days' prior written notice.", accountingRole: "SUBSTANTIVE_REPRESENTATION" },
    ],
    expect: { creditEligibility: "CREDIT", verificationStatus: "NOT_EVALUATED" },
  },
  {
    caseId: "AC14",
    description: "ambiguous source evidence (ground-truth quality overlay) - correspondence succeeds independently of the evidence-quality flag",
    gt: { id: "ac14-gt", sectionRef: "6.14(a)", text: "No Loan Party will change its name without 10 Business Days' prior written notice to the Administrative Agent." },
    candidates: [{ id: "ac14-c1", sectionRef: "6.14(a)", text: "No Loan Party will change its name without 10 Business Days' prior written notice to the Administrative Agent.", accountingRole: "SUBSTANTIVE_REPRESENTATION" }],
    overlayEntry: { verdict: "GT_AMBIGUOUS", rationale: "two conflicting amendment excerpts of this section exist in the frozen package, neither superseding the other", excludeFromCleanAggregates: false },
    expect: { creditEligibility: "CREDIT", evidenceQuality: "AMBIGUOUS" },
  },
  {
    caseId: "AC15",
    description: "insufficient source evidence (ground-truth quality overlay)",
    gt: { id: "ac15-gt", sectionRef: "6.15(a)", text: "Provision referenced only by a cross-reference to a schedule that is not included in the frozen package." },
    candidates: [],
    overlayEntry: { verdict: "GT_INCOMPLETE", rationale: "the referenced schedule is not present in the frozen source package", excludeFromCleanAggregates: false },
    expect: { creditEligibility: "NO_CREDIT", evidenceQuality: "INSUFFICIENT" },
  },
  {
    caseId: "AC16",
    description: "composite same-claim representation (multiple candidates jointly represent one claim)",
    gt: {
      id: "ac16-gt",
      sectionRef: "6.16(a)",
      text: "No Loan Party will incur Indebtedness for borrowed money except Permitted Debt not to exceed $8,000,000, subject to pro forma compliance with the Total Leverage Ratio covenant.",
    },
    candidates: [
      {
        id: "ac16-c1",
        sectionRef: "6.16(a)",
        text: "No Loan Party will incur Indebtedness for borrowed money except Permitted Debt not to exceed $8,000,000, subject to pro forma compliance with the Total Leverage Ratio covenant.",
        accountingRole: "SUBSTANTIVE_REPRESENTATION",
      },
      {
        id: "ac16-c2",
        sectionRef: "6.16(a)",
        text: "Permitted Debt incurred under this clause (a) not to exceed $8,000,000 is further subject to pro forma compliance with the Total Leverage Ratio covenant referenced in this clause.",
        accountingRole: "SUBSTANTIVE_REPRESENTATION",
      },
    ],
    expect: { creditEligibility: "CREDIT", representationCompleteness: "FULL" },
  },
];
