/**
 * Definition-sourced Default kill-switch on builder capacity (Available Amount pattern).
 */
import { describe, expect, it } from "vitest";
import {
  definitionHasZeroDuringDefault,
  definitionKillSwitchIssues,
} from "../../lib/contract-model/compiler/semantic-verification/definition-kill-switch";
import type { IRRule } from "../../lib/contract-model/ir/types";

function builderPermission(over: Partial<IRRule> = {}): IRRule {
  return {
    ruleId: "rule:test-7.09(b)",
    irSchemaVersion: "test",
    companyId: "co",
    instrumentKey: "inst",
    sourceDocumentId: "credit-agreement",
    sourceSectionRef: "7.09(b)",
    covenantFamily: "RESTRICTED_DEBT_PAYMENTS",
    ruleType: "QUANTITATIVE_PERMISSION",
    posture: "PERMISSION",
    action: "PAY_JUNIOR_DEBT",
    entityScope: ["BORROWER"],
    entityScopeExcluded: [],
    transactionScope: null,
    capacityExpression: {
      kind: "DEFINED_TERM_REFERENCE",
      type: "MONEY",
      termName: "Available Amount",
      companyId: "co",
      instrumentKey: "inst",
      resolvedDefinitionId: null,
      exprId: "e1",
    } as never,
    conditions: [],
    exceptions: [],
    dependsOn: [],
    operativeLineage: null,
    sufficiency: "COMPLETE",
    sufficiencyReasons: [],
    provenance: null,
    compilerVersion: null,
    sourceContentVersion: null,
    ...over,
  };
}

const AA_DEF =
  '"Available Amount" means $25,000,000 minus prior usage; provided that the Available Amount shall be zero at any time a Default has occurred and is continuing.';

describe("definition kill-switch accountability", () => {
  it("detects zero-during-Default vocabulary", () => {
    expect(definitionHasZeroDuringDefault(AA_DEF)).toBe(true);
    expect(definitionHasZeroDuringDefault("Available Amount means $25,000,000")).toBe(false);
  });

  it("flags a builder permission that drops the definition-sourced NO_DEFAULT condition", () => {
    const issues = definitionKillSwitchIssues(
      [builderPermission()],
      [{ termName: "Available Amount", text: AA_DEF }],
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.termName).toBe("Available Amount");
  });

  it("accepts a builder permission that carries NO_DEFAULT", () => {
    const issues = definitionKillSwitchIssues(
      [
        builderPermission({
          conditions: [
            {
              conditionId: "c1",
              conditionType: "NO_DEFAULT",
              expression: null,
              referencesDefinitionId: null,
              description: "NO_DEFAULT: Available Amount shall be zero while Default continues",
              provenance: null,
            },
          ],
        }),
      ],
      [{ termName: "Available Amount", text: AA_DEF }],
    );
    expect(issues).toEqual([]);
  });

  it("does not flag when the definition has no Default kill-switch", () => {
    const issues = definitionKillSwitchIssues(
      [builderPermission()],
      [{ termName: "Available Amount", text: "Available Amount means $25,000,000 minus prior usage." }],
    );
    expect(issues).toEqual([]);
  });
});
