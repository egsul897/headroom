/**
 * Phase 3C Layer 1c synthetic tests - reconciliation.ts. Includes a
 * SYNTHETIC reproduction of the generalized LSB §6.13 omission SHAPE (a
 * multi-clause section where the compiler represents only the first few
 * clauses and silently drops the rest) using entirely generic numbers -
 * never the real $35M/$5M figures or "6.13" - proving the structural-
 * completeness signal is genuinely generalized, not fitted to that one case.
 */
import { describe, expect, it } from "vitest";
import { buildSourceInventory } from "../../lib/contract-model/compiler/semantic-verification/source-inventory";
import { buildIrInventory } from "../../lib/contract-model/compiler/semantic-verification/ir-inventory";
import { reconcileInventories } from "../../lib/contract-model/compiler/semantic-verification/reconciliation";
import type { IRRule } from "../../lib/contract-model/ir/types";

let ruleCounter = 0;
function rule(overrides: Partial<IRRule>): IRRule {
  ruleCounter++;
  return {
    ruleId: `ir-rule:test-${ruleCounter}`,
    irSchemaVersion: "test-v1",
    companyId: "test-co",
    instrumentKey: "test-instrument",
    sourceDocumentId: "test-doc",
    sourceSectionRef: "9.01",
    covenantFamily: "INVESTMENTS",
    ruleType: "QUANTITATIVE_PERMISSION",
    posture: "PERMISSION",
    action: "OTHER",
    entityScope: [],
    entityScopeExcluded: [],
    transactionScope: null,
    capacityExpression: null,
    conditions: [],
    exceptions: [],
    dependsOn: [],
    operativeLineage: null,
    sufficiency: "COMPLETE",
    sufficiencyReasons: [],
    provenance: null,
    compilerVersion: "test-v1",
    sourceContentVersion: null,
    ...overrides,
  } as IRRule;
}

describe("Phase 3C Layer 1c - deterministic reconciliation", () => {
  it("a matching dollar figure reconciles as ACCOUNTED_FOR", () => {
    const text = "The Company may make Investments not to exceed $10,000,000.";
    const r = rule({ capacityExpression: { exprId: "e1", kind: "MONEY", type: "MONEY", amount: 10_000_000, currency: "USD" } });
    const src = buildSourceInventory("case-1", text, "doc-1", "§9.01", null);
    const irInv = buildIrInventory("case-1", [r], []);
    const recon = reconcileInventories(src, irInv);
    const amountItem = recon.items.find((i) => i.sourceItem?.kind === "AMOUNT");
    expect(amountItem?.classification).toBe("ACCOUNTED_FOR");
  });

  it("a source dollar figure absent from the IR reconciles as NOT_ACCOUNTED_FOR (the core, generalized detection mechanism)", () => {
    const text = "The Company may make Investments not to exceed $10,000,000.";
    const r = rule({ capacityExpression: null, sufficiency: "MISSING_CONTEXT" });
    const src = buildSourceInventory("case-2", text, "doc-1", "§9.01", null);
    const irInv = buildIrInventory("case-2", [r], []);
    const recon = reconcileInventories(src, irInv);
    const amountItem = recon.items.find((i) => i.sourceItem?.kind === "AMOUNT");
    expect(amountItem?.classification).toBe("NOT_ACCOUNTED_FOR");
    expect(recon.materialUnresolvedCount).toBeGreaterThan(0);
  });

  it("an IR dollar figure with no corresponding source figure reconciles as IR_ONLY (candidate unsupported addition)", () => {
    const text = "The Company may make Investments in the ordinary course of business.";
    const r = rule({ capacityExpression: { exprId: "e1", kind: "MONEY", type: "MONEY", amount: 99_000_000, currency: "USD" } });
    const src = buildSourceInventory("case-3", text, "doc-1", "§9.01", null);
    const irInv = buildIrInventory("case-3", [r], []);
    const recon = reconcileInventories(src, irInv);
    expect(recon.items.some((i) => i.classification === "IR_ONLY" && i.irItems[0]?.numericValue === 99_000_000)).toBe(true);
  });

  it("SYNTHETIC reproduction of the generalized 'incomplete multi-clause enumeration' shape (never the real LSB §6.13 figures/section number): the compiler represents only the first few clauses of a many-clause section, and the structural-completeness signal flags it generically", () => {
    // A synthetic section with 6 real, substantive lettered sub-clauses - generic numbers, no
    // relation to any real package's actual thresholds.
    const syntheticSectionText = `Directly or indirectly, make or acquire any Investment; provided, however, that the foregoing shall not apply to: (a) Investments in Cash Equivalents; (b) Investments consisting of extensions of trade credit in the ordinary course of business; (c) Investments existing on the Closing Date and set forth on Schedule 1.01; (d) Investments in joint ventures in an aggregate amount not to exceed $12,345,678; (e) Investments made in compliance with the Payment Conditions; (f) other Investments in an aggregate amount not to exceed $1,234,567.`;

    // The compiler only produced rules for the prohibition and the first three (non-numeric)
    // sub-clauses - exactly the SHAPE of the real LSB §6.13 finding, with entirely different,
    // synthetic numbers and no section reference at all.
    const prohibition = rule({ posture: "PROHIBITION", capacityExpression: null });
    const clauseA = rule({ capacityExpression: { kind: "UNLIMITED_CAPACITY", type: "CAPACITY", gatedBy: null } });
    const clauseB = rule({ capacityExpression: { kind: "UNLIMITED_CAPACITY", type: "CAPACITY", gatedBy: null } });
    const clauseC = rule({ sufficiency: "MISSING_CONTEXT", capacityExpression: { exprId: "e1", kind: "UNSUPPORTED", type: null, sourceEvidence: "x", semanticDescription: "Schedule 1.01 reference", reason: "y", requiredReview: true } });
    // Clauses (d), (e), (f) - including both $12,345,678 and $1,234,567 - were never compiled at all.

    const src = buildSourceInventory("synthetic-multi-clause", syntheticSectionText, "doc-1", "§syn.01", null);
    const irInv = buildIrInventory("synthetic-multi-clause", [prohibition, clauseA, clauseB, clauseC], []);
    const recon = reconcileInventories(src, irInv);

    // Both genuinely-missing dollar figures are caught, purely by numeric reconciliation.
    const notAccounted = recon.items.filter((i) => i.classification === "NOT_ACCOUNTED_FOR" && i.sourceItem?.kind === "AMOUNT");
    expect(notAccounted.map((i) => i.sourceItem?.numericValue).sort()).toEqual([1_234_567, 12_345_678]);

    // The structural-completeness aggregate signal also independently flags the gap: 6 apparent
    // independent units (a)-(f) vs only 4 compiled rules.
    const structuralSignal = recon.items.find((i) => i.classification === "AMBIGUOUS" && i.reason.includes("possible missing rule/basket"));
    expect(structuralSignal).toBeDefined();
    expect(src.apparentIndependentUnitCount).toBe(6);
    expect(irInv.ruleCount).toBe(4);
  });

  it("a loose metric-mention miss is POSSIBLY_ACCOUNTED_FOR, never counted as material on its own (false-positive control)", () => {
    const text = "References to Some Unrelated Proper Noun appear here for no covenant reason.";
    const src = buildSourceInventory("case-5", text, "doc-1", "§9.01", null);
    const irInv = buildIrInventory("case-5", [], []);
    const recon = reconcileInventories(src, irInv);
    const metricMisses = recon.items.filter((i) => i.sourceItem?.kind === "METRIC_MENTION");
    expect(metricMisses.every((i) => i.classification === "POSSIBLY_ACCOUNTED_FOR")).toBe(true);
    // POSSIBLY_ACCOUNTED_FOR is not counted toward materialUnresolvedCount
    expect(recon.materialUnresolvedCount).toBe(0);
  });

  it("a clean, fully-accounted-for simple fixed basket produces zero material unresolved items (false-positive control)", () => {
    const text = "The Company may incur Indebtedness in an amount not to exceed $5,000,000.";
    const r = rule({ capacityExpression: { exprId: "e1", kind: "MONEY", type: "MONEY", amount: 5_000_000, currency: "USD" } });
    const src = buildSourceInventory("case-6", text, "doc-1", "§9.01", null);
    const irInv = buildIrInventory("case-6", [r], []);
    const recon = reconcileInventories(src, irInv);
    expect(recon.materialUnresolvedCount).toBe(0);
  });

  it("condition/exception aggregate signal fires when source has multiple proviso markers but IR records none", () => {
    const text = "The Company may pay dividends, provided that no Default exists, provided, further, that pro forma leverage does not exceed the threshold, except that ordinary course tax distributions are always permitted.";
    const r = rule({ capacityExpression: { exprId: "e1", kind: "MONEY", type: "MONEY", amount: 1, currency: "USD" }, conditions: [], exceptions: [] });
    const src = buildSourceInventory("case-7", text, "doc-1", "§9.01", null);
    const irInv = buildIrInventory("case-7", [r], []);
    const recon = reconcileInventories(src, irInv);
    expect(recon.items.some((i) => i.classification === "AMBIGUOUS" && i.reason.includes("missing condition/exception"))).toBe(true);
  });
});
