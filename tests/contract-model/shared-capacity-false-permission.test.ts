/**
 * P0 remediation: false affirmative shared-capacity from aggregate amounts.
 *
 * Independent LCQG Phase 3 adversarial failures:
 *   ADV-FP-01 — shared-capacity classification without affirmative permission
 *   ADV-FP-02 — aggregate monetary limit misinterpreted as a shared basket
 *
 * Also locks positive controls where genuine shared capacity exists, and
 * confirms comparator-as-capacity refusal (figure-role) is undisturbed.
 */
import { describe, expect, it } from "vitest";
import {
  classifyAggregateOrSharedCapacitySignal,
  isOrdinaryAggregateAmountLanguage,
  isSharedCapacityRelationshipLanguage,
} from "../../lib/contract-model/compiler/shared-capacity-signals";
import { runPassADeterministicSignals } from "../../lib/contract-model/compiler/discovery/pass-a-signals";
import { buildSourceCoverageInventory } from "../../lib/contract-model/compiler/coverage-audit/source-inventory";
import { buildSourceInventory } from "../../lib/contract-model/compiler/semantic-verification/source-inventory";
import { classifyFigures, figureRoleIssues } from "../../lib/contract-model/compiler/semantic-verification/figure-role";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import type { CompilerDocumentInput } from "../../lib/contract-model/compiler/types";
import type { IRExpression, IRRule } from "../../lib/contract-model/ir/types";

function indexFor(text: string) {
  const doc: CompilerDocumentInput = {
    documentId: "d1",
    label: "CA",
    text: `CREDIT AGREEMENT\n\nARTICLE VI NEGATIVE COVENANTS\n\nSECTION 6.01. Indebtedness. ${text}\n`,
  };
  const nodes = parseDocumentStructure(doc);
  return buildStructuralIndex(new Map([[doc.documentId, { text: doc.text, nodes }]]), [], []);
}

function money(amount: number): IRExpression {
  return { exprId: "m", kind: "MONEY", type: "MONEY", amount, currency: "USD" };
}
function rule(capacity: IRRule["capacityExpression"]): Pick<IRRule, "ruleId" | "capacityExpression" | "conditions" | "exceptions"> {
  return { ruleId: "rule-1", capacityExpression: capacity, conditions: [], exceptions: [] };
}

describe("shared-capacity false-permission remediation", () => {
  const aggregateOnly =
    "The Borrower may incur Indebtedness in an aggregate amount not to exceed $25,000,000.";
  const aggregateNoPermission =
    "Indebtedness in an aggregate amount not to exceed $25,000,000 incurred by the Borrower.";
  const genuineShared =
    "Restricted Payments in an aggregate amount, together with Investments made pursuant to Section 7.06, not to exceed $20,000,000.";
  const multiClauseShared =
    "The aggregate amount of Investments made in reliance on this clause (c) and clause (d) below shall not exceed $25,000,000.";
  const sharedCapacityPhrase =
    "Indebtedness under this Section 7.03(a) and Section 7.03(b), when combined with Investments under Section 7.06(c), shall not exceed a shared capacity of $25,000,000.";
  const comparatorNotCapacity =
    "so long as the Consolidated Leverage Ratio would not be greater than 4.50 to 1.00 after giving effect thereto";

  it("ADV-FP-01/02: ordinary aggregate amount is not shared_cap relationship language", () => {
    expect(isSharedCapacityRelationshipLanguage(aggregateOnly)).toBe(false);
    expect(isSharedCapacityRelationshipLanguage(aggregateNoPermission)).toBe(false);
    expect(isOrdinaryAggregateAmountLanguage(aggregateOnly)).toBe(true);
    expect(classifyAggregateOrSharedCapacitySignal(aggregateOnly)).toBe("aggregate_amount");
    expect(classifyAggregateOrSharedCapacitySignal(aggregateNoPermission)).toBe("aggregate_amount");
  });

  it("positive controls: genuine shared-capacity relationship language is detected", () => {
    expect(isSharedCapacityRelationshipLanguage(genuineShared)).toBe(true);
    expect(isSharedCapacityRelationshipLanguage(multiClauseShared)).toBe(true);
    expect(isSharedCapacityRelationshipLanguage(sharedCapacityPhrase)).toBe(true);
    expect(classifyAggregateOrSharedCapacitySignal(genuineShared)).toBe("shared_cap");
    expect(classifyAggregateOrSharedCapacitySignal(multiClauseShared)).toBe("shared_cap");
    expect(classifyAggregateOrSharedCapacitySignal(sharedCapacityPhrase)).toBe("shared_cap");
  });

  it("Pass A: aggregate principal amount alone is not a new candidate, and aggregate amount still is", () => {
    const build = (body: string) => {
      const doc: CompilerDocumentInput = { documentId: "d1", label: "CA", text: `CREDIT AGREEMENT\n\n${body}\n` };
      const nodes = parseDocumentStructure(doc);
      return buildStructuralIndex(new Map([[doc.documentId, { text: doc.text, nodes }]]), [], []);
    };
    const principalCandidates = runPassADeterministicSignals("d1", build("SECTION 2.07 Repayment. The aggregate principal amount of the Loans outstanding on such date."));
    expect(principalCandidates.filter((c) => c.signals.every((signal) => signal === "aggregate_amount"))).toEqual([]);
    expect(principalCandidates.every((c) => !c.signals.includes("shared_cap"))).toBe(true);
    const historicalCandidates = runPassADeterministicSignals("d1", build("SECTION 2.08 Economics. The aggregate amount of the basket."));
    expect(historicalCandidates.some((c) => c.signals.includes("aggregate_amount") && !c.signals.includes("shared_cap"))).toBe(true);
  });

  it("Pass A: aggregate-only nodes emit aggregate_amount, never shared_cap", () => {
    const index = indexFor(aggregateOnly);
    const candidates = runPassADeterministicSignals("d1", index);
    const withAgg = candidates.filter((c) => c.signals.includes("aggregate_amount"));
    expect(withAgg.length).toBeGreaterThan(0);
    expect(candidates.every((c) => !c.signals.includes("shared_cap"))).toBe(true);
  });

  it("Pass A: genuine shared language emits shared_cap", () => {
    const index = indexFor(genuineShared);
    const candidates = runPassADeterministicSignals("d1", index);
    expect(candidates.some((c) => c.signals.includes("shared_cap"))).toBe(true);
  });

  it("coverage-audit: ordinary aggregate is not SHARED_CAP_CANDIDATE", () => {
    const doc: CompilerDocumentInput = {
      documentId: "d1",
      label: "CA",
      text: `SECTION 6.01. Indebtedness. ${aggregateOnly}`,
    };
    const nodes = parseDocumentStructure(doc);
    const index = buildStructuralIndex(new Map([[doc.documentId, { text: doc.text, nodes }]]), [], []);
    const regions = buildSourceCoverageInventory("d1", index, {
      companyId: "c",
      packageKey: "p",
      instrumentKey: null,
    });
    const region = regions.find((r) => r.sectionRef === "6.01");
    expect(region?.detectedSignals).toContain("aggregate_amount");
    expect(region?.detectedSignals ?? []).not.toContain("shared_cap");
    expect(region?.probableRole).not.toBe("SHARED_CAP_CANDIDATE");
  });

  it("coverage-audit: multi-clause shared cap remains SHARED_CAP_CANDIDATE", () => {
    const doc: CompilerDocumentInput = {
      documentId: "d1",
      label: "CA",
      text: `SECTION 6.06. Investments. ${multiClauseShared}`,
    };
    const nodes = parseDocumentStructure(doc);
    const index = buildStructuralIndex(new Map([[doc.documentId, { text: doc.text, nodes }]]), [], []);
    const regions = buildSourceCoverageInventory("d1", index, {
      companyId: "c",
      packageKey: "p",
      instrumentKey: null,
    });
    const region = regions.find((r) => r.sectionRef === "6.06");
    expect(region?.detectedSignals).toContain("shared_cap");
    expect(region?.probableRole).toBe("SHARED_CAP_CANDIDATE");
  });

  it("semantic inventory: ordinary aggregate is not SHARED_CAP_MARKER; together-with cite is", () => {
    const ordinary = buildSourceInventory("c:agg", aggregateOnly, "d1", "§6.01", null);
    const shared = buildSourceInventory("c:shared", genuineShared, "d1", "§6.06", null);
    expect(ordinary.items.some((i) => i.kind === "SHARED_CAP_MARKER")).toBe(false);
    expect(shared.items.some((i) => i.kind === "SHARED_CAP_MARKER")).toBe(true);
  });

  it("never creates capacity from aggregate amount alone; comparator refusal undisturbed", () => {
    // Single-basket "not to exceed" with permission language may be AFFIRMATIVE_PERMISSION —
    // that is not a shared-capacity relationship.
    expect(classifyAggregateOrSharedCapacitySignal(aggregateOnly)).toBe("aggregate_amount");
    const permissionFigures = classifyFigures(aggregateOnly);
    expect(permissionFigures.some((f) => f.role === "AFFIRMATIVE_PERMISSION" && f.capacity)).toBe(true);

    // Comparator threshold must still refuse capacity (interaction with figure-role remediation).
    expect(isSharedCapacityRelationshipLanguage(comparatorNotCapacity)).toBe(false);
    expect(classifyAggregateOrSharedCapacitySignal(comparatorNotCapacity)).toBe(null);
    const threshold = "any other transaction involving aggregate consideration in excess of $5,000,000, so long as approved";
    expect(figureRoleIssues(threshold, [rule(money(5_000_000))]).map((i) => i.kind)).toEqual(["THRESHOLD_AS_CAPACITY"]);
    expect(classifyAggregateOrSharedCapacitySignal(threshold)).toBe("aggregate_amount");
  });
});
