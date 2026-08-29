/**
 * Evaluation Methodology V2 — the ten permanent false-credit prohibitions.
 *
 * Phase 3F.1.5. Each case below reproduces one way the historical scorers
 * granted credit by STRUCTURAL PROXIMITY rather than semantic correspondence.
 * The evaluator must refuse every one of them. These tests are permanent
 * regressions: if a future change to the match policy re-opens any of these
 * doors, this file fails.
 *
 * Every synthetic candidate here is declared SUBSTANTIVE_REPRESENTATION, so a
 * refusal can only come from Layers 1-3, never from the accounting gate.
 */
import { describe, expect, it } from "vitest";

import { runEvaluationV2 } from "@/lib/contract-model/evaluation-v2/index";
import type { ConflictCode, MatchStatus, UnitEvaluationResult } from "@/lib/contract-model/evaluation-v2/types";
import { candidate, gt, SYNTHETIC_DATASET } from "./synthetic-fixtures";
import type { GroundTruthSemanticUnit, CandidateSemanticRepresentation } from "@/lib/contract-model/evaluation-v2/types";

const CREDITED: MatchStatus[] = ["EXACT_SINGLE", "EXACT_COMPOSITE"];

async function evaluateOne(unit: GroundTruthSemanticUnit, candidates: CandidateSemanticRepresentation[]): Promise<UnitEvaluationResult> {
  const result = await runEvaluationV2([unit], candidates, { datasetKey: SYNTHETIC_DATASET });
  const only = result.units[0];
  expect(only).toBeDefined();
  return only as UnitEvaluationResult;
}

function conflictCodes(unit: UnitEvaluationResult): ConflictCode[] {
  return unit.pairAssessments.flatMap((p) => p.conflicts.filter((c) => c.severity === "MATERIAL_CONFLICT").map((c) => c.code));
}

describe("Evaluation V2 — false-credit prohibitions", () => {
  it("1. refuses a chapeau matched to an unrelated descendant basket", async () => {
    const unit = gt({
      id: "P1-chapeau",
      sectionRef: "6.01",
      text: "No Loan Party will, nor will it permit any Restricted Subsidiary to, create, incur, assume or suffer to exist any Indebtedness, except as permitted by clauses (a) through (q) below.",
    });
    const descendant = candidate({
      id: "P1-descendant",
      sectionRef: "6.01(b)(i)",
      text: "(b)(i) Indebtedness of any Borrower owing to any Restricted Subsidiary, provided that the aggregate principal amount outstanding at any time shall not exceed $15,000,000.",
    });
    const result = await evaluateOne(unit, [descendant]);
    expect(CREDITED).not.toContain(result.matchStatus);
    expect(conflictCodes(result)).toContain("SCOPE_BREADTH_MISMATCH");
    expect(result.dangerousUnaccountedV2).toBe(true);
  });

  it("2. refuses a basket matched to a sibling basket carrying the same dollar amount", async () => {
    const unit = gt({
      id: "P2-basket",
      sectionRef: "6.01(j)",
      text: "(j) Indebtedness of Restricted Subsidiaries that are not Loan Parties in an aggregate principal amount not to exceed $30,000,000 at any time outstanding.",
      unitType: "BASKET",
    });
    const sibling = candidate({
      id: "P2-sibling",
      sectionRef: "6.01(m)",
      text: "(m) Capital Lease Obligations and purchase money Indebtedness in an aggregate principal amount not to exceed $30,000,000 at any time outstanding.",
      declaredRole: "BASKET",
    });
    const result = await evaluateOne(unit, [sibling]);
    expect(CREDITED).not.toContain(result.matchStatus);
  });

  it("3. refuses a qualitative covenant matched solely by section number", async () => {
    const unit = gt({
      id: "P3-qualitative",
      sectionRef: "5.08",
      text: "The Borrower shall maintain insurance with financially sound and reputable insurers in such amounts and against such risks as are customarily maintained by companies of established repute engaged in the same industry.",
      unitType: "COVENANT",
    });
    const sameSectionDifferentSubject = candidate({
      id: "P3-same-section",
      sectionRef: "5.08",
      text: "The Borrower shall pay and discharge all Taxes imposed upon it or upon its income or profits before the same shall become delinquent.",
    });
    const result = await evaluateOne(unit, [sameSectionDifferentSubject]);
    expect(CREDITED).not.toContain(result.matchStatus);
    expect(result.pairAssessments.every((p) => p.correspondence !== "CORRESPONDS_FULLY")).toBe(true);
  });

  it("4. refuses a clause matched to a higher-materiality descendant with a different subject", async () => {
    const unit = gt({
      id: "P4-clause",
      sectionRef: "6.04",
      text: "No Loan Party will, nor will it permit any Restricted Subsidiary to, purchase, hold or acquire any Investments, except as permitted by clauses (a) through (r).",
    });
    const highMaterialityDescendant = candidate({
      id: "P4-descendant",
      sectionRef: "6.04(q)",
      text: "(q) additional Investments in an aggregate amount not to exceed the greater of $75,000,000 and 25% of Consolidated EBITDA, so long as the Total Net Leverage Ratio does not exceed 3.00 to 1.00 on a pro forma basis.",
      declaredRole: "BASKET",
    });
    const result = await evaluateOne(unit, [highMaterialityDescendant]);
    expect(CREDITED).not.toContain(result.matchStatus);
    expect(conflictCodes(result)).toContain("SCOPE_BREADTH_MISMATCH");
  });

  it("5. refuses a ratio test matched to a nearby basket containing the same numeric value", async () => {
    const unit = gt({
      id: "P5-ratio",
      sectionRef: "6.12(a)",
      text: "The Borrower shall not permit the Total Net Leverage Ratio as at the last day of any period of four consecutive fiscal quarters to exceed 4.00 to 1.00.",
      unitType: "FINANCIAL_TEST",
    });
    const nearbyBasket = candidate({
      id: "P5-basket",
      sectionRef: "6.12(b)",
      text: "(b) the Borrower shall not permit the Fixed Charge Coverage Ratio as at the last day of any period of four consecutive fiscal quarters to be less than 4.00 to 1.00.",
      declaredRole: "FINANCIAL_TEST",
    });
    const result = await evaluateOne(unit, [nearbyBasket]);
    expect(CREDITED).not.toContain(result.matchStatus);
    const codes = conflictCodes(result);
    expect(codes.some((c) => c === "WRONG_RATIO" || c === "WRONG_METRIC" || c === "WRONG_COMPARISON_DIRECTION")).toBe(true);
  });

  it("6. refuses a permission matched to a restriction in the same section", async () => {
    const unit = gt({
      id: "P6-permission",
      sectionRef: "6.05(k)",
      text: "(k) the Company and the Restricted Subsidiaries may Dispose of assets not otherwise permitted by this Section, provided that the aggregate consideration for all such Dispositions does not exceed $40,000,000.",
      unitType: "BASKET",
    });
    const restriction = candidate({
      id: "P6-restriction",
      sectionRef: "6.05",
      text: "No Loan Party will, nor will it permit any Restricted Subsidiary to, Dispose of any asset, including any Equity Interests it owns, except as permitted by clauses (a) through (k).",
      declaredRole: "GENERAL_PROHIBITION",
    });
    const result = await evaluateOne(unit, [restriction]);
    expect(CREDITED).not.toContain(result.matchStatus);
    const codes = conflictCodes(result);
    expect(codes.some((c) => c === "SCOPE_BREADTH_MISMATCH" || c === "INVERTED_LEGAL_POSTURE")).toBe(true);
  });

  it("7. refuses a secured-debt permission matched to an unsecured-debt permission", async () => {
    const unit = gt({
      id: "P7-secured",
      sectionRef: "6.01(n)",
      text: "(n) secured Indebtedness of the Company and its Restricted Subsidiaries in an aggregate principal amount not to exceed $50,000,000 at any time outstanding.",
      unitType: "BASKET",
    });
    const unsecured = candidate({
      id: "P7-unsecured",
      sectionRef: "6.01(o)",
      text: "(o) unsecured Indebtedness of the Company and its Restricted Subsidiaries in an aggregate principal amount not to exceed $50,000,000 at any time outstanding.",
      declaredRole: "BASKET",
    });
    const result = await evaluateOne(unit, [unsecured]);
    expect(CREDITED).not.toContain(result.matchStatus);
    expect(conflictCodes(result)).toContain("WRONG_INSTRUMENT");
  });

  it("8. refuses a dividend permission matched to an investment permission", async () => {
    const unit = gt({
      id: "P8-dividend",
      sectionRef: "6.08(a)(iv)",
      text: "(iv) the Company may declare and make Restricted Payments in an aggregate amount not to exceed $20,000,000 in any fiscal year, so long as no Default has occurred and is continuing.",
      unitType: "BASKET",
    });
    const investment = candidate({
      id: "P8-investment",
      sectionRef: "6.04(h)",
      text: "(h) the Company and the Restricted Subsidiaries may make Investments in joint ventures in an aggregate amount not to exceed $20,000,000, so long as no Default has occurred and is continuing.",
      declaredRole: "BASKET",
    });
    const result = await evaluateOne(unit, [investment]);
    expect(CREDITED).not.toContain(result.matchStatus);
  });

  it("9. refuses a Canadian-entity-scope provision matched to a US-only-scope provision", async () => {
    const unit = gt({
      id: "P9-canadian",
      sectionRef: "10.01(b)",
      text: "Each Canadian Loan Guarantor jointly and severally guarantees the prompt payment of the Canadian Secured Obligations owing by the Canadian Borrowers.",
    });
    const usOnly = candidate({
      id: "P9-us",
      sectionRef: "10.01(a)",
      text: "Each U.S. Loan Guarantor jointly and severally guarantees the prompt payment of the U.S. Secured Obligations as primary obligor and not merely as surety.",
    });
    const result = await evaluateOne(unit, [usOnly]);
    expect(CREDITED).not.toContain(result.matchStatus);
    expect(conflictCodes(result)).toContain("WRONG_ENTITY_SCOPE");
  });

  it("10. refuses an amended provision matched to its historical pre-amendment text", async () => {
    const unit = gt({
      id: "P10-amended",
      sectionRef: "6.12(a)",
      text: "The Borrower shall not permit the Total Net Leverage Ratio as at the last day of any period of four consecutive fiscal quarters to exceed 3.50 to 1.00.",
      documentId: "synthetic-doc-restated",
      unitType: "FINANCIAL_TEST",
    });
    const preAmendment = candidate({
      id: "P10-historical",
      sectionRef: "6.12(a)",
      text: "The Borrower shall not permit the Total Net Leverage Ratio as at the last day of any period of four consecutive fiscal quarters to exceed 3.50 to 1.00.",
      documentId: "synthetic-doc-original",
      declaredRole: "FINANCIAL_TEST",
    });
    const result = await evaluateOne(unit, [preAmendment]);
    expect(CREDITED).not.toContain(result.matchStatus);
    expect(conflictCodes(result)).toContain("WRONG_OPERATIVE_VERSION");
  });
});
