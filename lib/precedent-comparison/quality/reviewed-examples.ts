/**
 * Independently adjudicated comparison examples for genuine comparison quality.
 *
 * These are claim-level review fixtures authored offline against source text.
 * They are NOT production legal certifications and do not advance Phase-3 pins.
 *
 * Scenarios covered:
 * 1. Similar wording, materially different legal consequences
 * 2. Different wording, comparable mechanics
 * 3. Remote condition changes interpretation
 * 4. Definition changes apparent basket amount
 * 5. Amendment supersedes original
 * 6. Entity scope changes available permission
 * 7. Shared basket constrains multiple permissions
 * 8. Numerical comparator is not an affirmative permission
 */
import { sha256Hex } from "../hash";
import type { ClaimReviewRecord, PrecedentProvision } from "../types";

function synth(
  overrides: Partial<PrecedentProvision> &
    Pick<PrecedentProvision, "provisionId" | "sourceText" | "covenantFamily">,
): PrecedentProvision {
  const sourceText = overrides.sourceText;
  return {
    sourceVersionHash: sha256Hex(sourceText),
    locator: {
      packageId: "quality-suite",
      documentId: "quality-suite-doc",
      sourcePath: "lib/precedent-comparison/quality/reviewed-examples.ts",
      sourceSectionRef: overrides.locator?.sourceSectionRef ?? "Q",
      charStart: 0,
      charEnd: sourceText.length,
    },
    documentRole: "ORIGINAL",
    agreementType: "CREDIT_AGREEMENT",
    issuerId: "quality-suite",
    amendsProvisionId: null,
    tags: [],
    reviewStatus: "SOURCE_ONLY",
    reviewedBy: null,
    reviewNote: null,
    financialDefinitionTerms: [],
    evalIsolation: "NONE",
    ...overrides,
    sourceText,
  };
}

export const QUALITY_REVIEWER = "pci-offline-adjudicator@headroom.local";

/** Scenario 1: similar wording, different consequence (Default vs Event of Default continuing). */
export const SCENARIO_SIMILAR_WORDING_DIFFERENT_EFFECT = {
  id: "Q1_SIMILAR_WORDING_DIFFERENT_EFFECT",
  left: synth({
    provisionId: "q1-left",
    covenantFamily: "INDEBTEDNESS",
    sourceText:
      "The Borrower shall not create, incur, assume or suffer to exist any Indebtedness, except Indebtedness under this Agreement; provided that no Default shall have occurred.",
  }),
  right: synth({
    provisionId: "q1-right",
    covenantFamily: "INDEBTEDNESS",
    sourceText:
      "The Borrower shall not create, incur, assume or suffer to exist any Indebtedness, except Indebtedness under this Agreement; provided that no Event of Default shall have occurred and be continuing.",
  }),
};

/** Scenario 2: different wording, comparable greater-of mechanics. */
export const SCENARIO_DIFFERENT_WORDING_COMPARABLE_MECHANICS = {
  id: "Q2_DIFFERENT_WORDING_COMPARABLE_MECHANICS",
  left: synth({
    provisionId: "q2-left",
    covenantFamily: "INVESTMENTS",
    sourceText: "Investments in an aggregate amount not to exceed the greater of $75,000,000 and 3.5% of Consolidated Total Assets.",
  }),
  right: synth({
    provisionId: "q2-right",
    covenantFamily: "INVESTMENTS",
    sourceText: "the Company may make Investments in an amount not exceeding the greater of (x) $75,000,000 and (y) 3.5% of Consolidated Total Assets.",
  }),
};

/** Scenario 3: remote condition changes interpretation. */
export const SCENARIO_REMOTE_CONDITION = {
  id: "Q3_REMOTE_CONDITION",
  left: synth({
    provisionId: "q3-left",
    covenantFamily: "RESTRICTED_PAYMENTS",
    sourceText: "The Borrower may make Restricted Payments in an unlimited amount so long as the Consolidated Senior Secured Leverage Ratio is less than or equal to 3.50 to 1.00.",
  }),
  right: synth({
    provisionId: "q3-right",
    covenantFamily: "RESTRICTED_PAYMENTS",
    sourceText:
      "The Borrower may make Restricted Payments in an unlimited amount so long as the Consolidated Senior Secured Leverage Ratio is less than or equal to 3.50 to 1.00; provided that no Default exists under Section 8.01(f) (cross-default) after giving effect thereto.",
  }),
};

/** Scenario 4: definition changes apparent basket amount (EBITDA addbacks). */
export const SCENARIO_DEFINITION_CHANGES_BASKET = {
  id: "Q4_DEFINITION_CHANGES_BASKET",
  left: synth({
    provisionId: "q4-left",
    covenantFamily: "DEFINITIONS_CALCULATION_RULES",
    financialDefinitionTerms: ["Consolidated EBITDA"],
    sourceText:
      '"Consolidated EBITDA" means Consolidated Net Income plus interest, taxes, depreciation and amortization, without addbacks for expected synergies.',
  }),
  right: synth({
    provisionId: "q4-right",
    covenantFamily: "DEFINITIONS_CALCULATION_RULES",
    financialDefinitionTerms: ["Consolidated EBITDA"],
    sourceText:
      '"Consolidated EBITDA" means Consolidated Net Income plus interest, taxes, depreciation and amortization, plus pro forma synergies expected from acquisitions in an amount not to exceed 25% of Consolidated EBITDA.',
  }),
};

/** Scenario 5: amendment supersedes original flat covenant with step schedule. */
export const SCENARIO_AMENDMENT_SUPERSEDES = {
  id: "Q5_AMENDMENT_SUPERSEDES",
  left: synth({
    provisionId: "q5-original",
    covenantFamily: "FINANCIAL_COVENANTS",
    sourceText: "Permit the Consolidated Total Leverage Ratio as of the last day of any fiscal quarter to exceed 5.50 to 1.00.",
  }),
  right: synth({
    provisionId: "q5-amendment",
    covenantFamily: "FINANCIAL_COVENANTS",
    documentRole: "AMENDMENT",
    agreementType: "AMENDMENT",
    amendsProvisionId: "q5-original",
    sourceText:
      "Section 7.1(b) is hereby amended and restated: the Consolidated Total Leverage Ratio shall not exceed 6.25 to 1.00 for the fiscal quarters ending June 30, 2022 through December 31, 2022, stepping down to 5.50 to 1.00 thereafter; provided that the Material Acquisition step-up of 0.50 to 1.00 remains available.",
  }),
};

/** Scenario 6: entity scope changes available permission. */
export const SCENARIO_ENTITY_SCOPE = {
  id: "Q6_ENTITY_SCOPE",
  left: synth({
    provisionId: "q6-left",
    covenantFamily: "INDEBTEDNESS",
    sourceText: "The Parent Borrower shall not incur Indebtedness except as set forth below.",
  }),
  right: synth({
    provisionId: "q6-right",
    covenantFamily: "INDEBTEDNESS",
    sourceText:
      "The Borrower shall not, nor shall it permit any of its Restricted Subsidiaries to, incur Indebtedness; Indebtedness of any Restricted Subsidiary that is not a Loan Party must be unsecured.",
  }),
};

/** Scenario 7: shared basket constrains multiple permissions. */
export const SCENARIO_SHARED_BASKET = {
  id: "Q7_SHARED_BASKET",
  left: synth({
    provisionId: "q7-left",
    covenantFamily: "INDEBTEDNESS",
    sourceText: "Indebtedness under clause (a) in an amount not to exceed $50,000,000.",
  }),
  right: synth({
    provisionId: "q7-right",
    covenantFamily: "INDEBTEDNESS",
    sourceText:
      "Indebtedness under clause (a) together with amounts incurred in reliance on clause (b), in an aggregate amount not to exceed $50,000,000; the Borrower may reclassify such Indebtedness among baskets.",
  }),
};

/** Scenario 8: numerical comparator is not an affirmative permission. */
export const SCENARIO_NUMERIC_NOT_PERMISSION = {
  id: "Q8_NUMERIC_NOT_PERMISSION",
  left: synth({
    provisionId: "q8-left",
    covenantFamily: "FINANCIAL_COVENANTS",
    sourceText: "The Borrower shall not permit the Total Net Leverage Ratio to exceed 4.00 to 1.00.",
  }),
  right: synth({
    provisionId: "q8-right",
    covenantFamily: "RESTRICTED_PAYMENTS",
    sourceText: "The Borrower may make Restricted Payments so long as the Total Net Leverage Ratio does not exceed 4.00 to 1.00.",
  }),
};

export const ALL_QUALITY_SCENARIOS = [
  SCENARIO_SIMILAR_WORDING_DIFFERENT_EFFECT,
  SCENARIO_DIFFERENT_WORDING_COMPARABLE_MECHANICS,
  SCENARIO_REMOTE_CONDITION,
  SCENARIO_DEFINITION_CHANGES_BASKET,
  SCENARIO_AMENDMENT_SUPERSEDES,
  SCENARIO_ENTITY_SCOPE,
  SCENARIO_SHARED_BASKET,
  SCENARIO_NUMERIC_NOT_PERMISSION,
] as const;

/** Build a claim-level review for a SOURCE_SUPPORTED claim after compare(). */
export function reviewForClaim(input: {
  claimId: string;
  comparisonId: string;
  left: PrecedentProvision;
  right: PrecedentProvision;
  note: string;
}): ClaimReviewRecord {
  return {
    claimReviewId: `crev_${input.claimId}`,
    claimId: input.claimId,
    comparisonId: input.comparisonId,
    leftProvisionId: input.left.provisionId,
    rightProvisionId: input.right.provisionId,
    leftSourceVersionHash: input.left.sourceVersionHash,
    rightSourceVersionHash: input.right.sourceVersionHash,
    reviewedBy: QUALITY_REVIEWER,
    reviewedAt: "2026-10-08T00:00:00.000Z",
    disposition: "AFFIRM",
    note: input.note,
    affirmedStanding: "REVIEWER_VERIFIED_CONCLUSION",
  };
}
