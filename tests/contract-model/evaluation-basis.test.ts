/**
 * IPV-24 — pro forma evaluation basis must be accountable on a ratio gate.
 */
import { describe, expect, it } from "vitest";
import { evaluationBasisIssues, sourceRequiresProFormaBasis } from "../../lib/contract-model/compiler/semantic-verification/evaluation-basis";
import type { IRRule } from "../../lib/contract-model/ir/types";

function ratioPermission(over: Partial<IRRule> & { conditions?: IRRule["conditions"] }): IRRule {
  return {
    ruleId: "rule:test-7.01(c)",
    irSchemaVersion: "test",
    companyId: "co",
    instrumentKey: "inst",
    sourceDocumentId: "credit-agreement",
    sourceSectionRef: "7.01(c)",
    covenantFamily: "INDEBTEDNESS",
    ruleType: "QUANTITATIVE_PERMISSION",
    posture: "PERMISSION",
    action: "INCUR_DEBT",
    entityScope: ["BORROWER"],
    entityScopeExcluded: [],
    transactionScope: null,
    capacityExpression: {
      kind: "UNLIMITED_CAPACITY",
      type: "CAPACITY",
      gatedBy: {
        kind: "COMPARE",
        type: "BOOLEAN",
        operator: "LTE",
        left: { kind: "DEFINED_TERM_REFERENCE", type: "RATIO", termName: "Consolidated Total Leverage Ratio", companyId: "co", instrumentKey: "inst", resolvedDefinitionId: null, exprId: "e1" } as never,
        right: { kind: "RATIO", type: "RATIO", value: 3.5, exprId: "e2" } as never,
        exprId: "e0",
      } as never,
    },
    conditions: over.conditions ?? [],
    exceptions: [],
    dependsOn: [],
    operativeLineage: null,
    sufficiency: "COMPLETE",
    sufficiencyReasons: [],
    provenance: { documentId: "credit-agreement", sourceNodeKey: null, sourceCitation: "Section 7.01(c)", excerpt: "pro forma" },
    compilerVersion: null,
    sourceContentVersion: null,
    ...over,
  };
}

describe("evaluation-basis accountability (IPV-24)", () => {
  it("detects pro forma temporal vocabulary in source text", () => {
    expect(sourceRequiresProFormaBasis("after giving pro forma effect thereto")).toBe(true);
    expect(sourceRequiresProFormaBasis("determined on a pro forma basis")).toBe(true);
    expect(sourceRequiresProFormaBasis("giving effect to such Indebtedness")).toBe(true);
    expect(sourceRequiresProFormaBasis("Indebtedness not to exceed $30,000,000")).toBe(false);
  });

  it("flags a ratio permission whose conditions omit evaluationBasis.proForma", () => {
    const issues = evaluationBasisIssues(
      "Indebtedness of the Borrower, so long as on the date of incurrence, after giving pro forma effect thereto, the Consolidated Total Leverage Ratio does not exceed 3.50 to 1.00.",
      [ratioPermission({ conditions: [] })],
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.detail).toMatch(/pro forma/);
  });

  it("accepts a ratio permission that carries evaluationBasis.proForma on a condition", () => {
    const issues = evaluationBasisIssues(
      "after giving pro forma effect thereto, the Consolidated Total Leverage Ratio does not exceed 3.50 to 1.00.",
      [
        ratioPermission({
          conditions: [
            {
              conditionId: "c1",
              conditionType: "RATIO_SATISFIED",
              expression: null,
              referencesDefinitionId: null,
              description: "RATIO_TEST",
              provenance: null,
              evaluationBasis: {
                proForma: true,
                transactionEffect: null,
                asOfSelector: null,
                deemedEffectiveAt: null,
                testingPeriod: null,
                provenance: null,
              },
            },
          ],
        }),
      ],
    );
    expect(issues).toEqual([]);
  });

  it("does not flag when source has no pro forma vocabulary", () => {
    const issues = evaluationBasisIssues(
      "Indebtedness of the Borrower so long as the Consolidated Total Leverage Ratio does not exceed 3.50 to 1.00.",
      [ratioPermission({ conditions: [] })],
    );
    expect(issues).toEqual([]);
  });
});
