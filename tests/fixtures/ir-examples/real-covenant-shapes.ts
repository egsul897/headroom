/**
 * Phase 3A §43 - manually authored IR fixtures demonstrating representational
 * fitness against real covenant shapes ALREADY reviewed elsewhere in this
 * repository (tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/
 * human-ground-truth.ts and .../lsb-2023-abl-credit-agreement/
 * human-ground-truth.ts - both written by direct reading of the real source
 * text before any extractor ever saw it). No new model call was made to
 * produce these; every real dollar/percentage/ratio figure and section
 * reference below is copied verbatim from that pre-existing, independently-
 * authored ground truth, never invented for this file.
 *
 * companyId/instrumentKey below use fictional identifiers ("ir-fixture-co",
 * "ir-fixture-instrument") - this file demonstrates the IR's own
 * representational shape, not a real extraction against a real company, and
 * per the anti-benchmark-gaming contract, no matching/decision logic
 * anywhere in lib/contract-model/ir/** depends on these specific figures or
 * section references - only this fixture file's own DATA does.
 */
import type { IRRule, IRDefinition, IRSharedCapacity, IRExpression, IRCapacityExpression, SourceProvenance } from "../../../lib/contract-model/ir/types";
import { withExpressionId, computeRuleId, computeDefinitionId, computeSharedCapId } from "../../../lib/contract-model/ir/identity";

const COMPANY_ID = "ir-fixture-co";
const INSTRUMENT_KEY = "ir-fixture-instrument";
const DOC_ID = "ir-fixture-doc";

function provenance(citation: string, excerpt: string | null = null): SourceProvenance {
  return { documentId: DOC_ID, sourceNodeKey: null, sourceCitation: citation, excerpt };
}

function money(amount: number, citation: string): IRExpression {
  return withExpressionId({ kind: "MONEY", type: "MONEY", amount, currency: "USD", provenance: provenance(citation) });
}
function percent(value: number, citation: string): IRExpression {
  return withExpressionId({ kind: "PERCENT", type: "PERCENT", value, provenance: provenance(citation) });
}
function ratio(value: number, citation: string): IRExpression {
  return withExpressionId({ kind: "RATIO", type: "RATIO", value, provenance: provenance(citation) });
}
function metric(metricName: string, type: "MONEY" | "RATIO" | "NUMBER" = "MONEY"): IRExpression {
  return withExpressionId({ kind: "METRIC_REFERENCE", type, metricName, companyId: COMPANY_ID, instrumentKey: INSTRUMENT_KEY, resolvedDefinitionId: null });
}
function pctOfMetric(pct: number, metricName: string, citation: string): IRExpression {
  return withExpressionId({ kind: "MULTIPLY", type: "MONEY", operands: [percent(pct, citation), metric(metricName)] });
}
function greaterOfFlatOrPct(flatAmount: number, pct: number, metricName: string, citation: string): IRExpression {
  return withExpressionId({ kind: "MAX", type: "MONEY", operands: [money(flatAmount, citation), pctOfMetric(pct, metricName, citation)], provenance: provenance(citation) });
}

let discriminatorCounter = 0;
function ruleId(sectionRef: string): string {
  discriminatorCounter += 1;
  return computeRuleId(COMPANY_ID, INSTRUMENT_KEY, sectionRef, `fixture-${discriminatorCounter}`);
}

// ---------------------------------------------------------------------------
// 1. Fixed debt basket
// Real evidence: lsb-6.08-subordinated-debt-payments - "$500,000/year fixed
// basket" component of Section 6.08's own multi-basket prohibition.
// ---------------------------------------------------------------------------
export const FIXTURE_1_FIXED_DEBT_BASKET: IRRule = {
  ruleId: ruleId("6.08(a)(iv)"),
  irSchemaVersion: "headroom-covenant-ir.v1",
  companyId: COMPANY_ID,
  instrumentKey: INSTRUMENT_KEY,
  sourceDocumentId: DOC_ID,
  sourceSectionRef: "6.08(a)(iv)",
  covenantFamily: "INDEBTEDNESS",
  ruleType: "QUANTITATIVE_PERMISSION",
  posture: "PERMISSION",
  action: "PREPAY_DEBT",
  entityScope: [],
  entityScopeExcluded: [],
  transactionScope: null,
  capacityExpression: money(500_000, "§6.08(a)(iv): $500,000 per fiscal year"),
  conditions: [],
  exceptions: [],
  dependsOn: [],
  operativeLineage: null,
  sufficiency: "COMPLETE",
  sufficiencyReasons: [],
  provenance: provenance("§6.08(a)(iv)"),
  compilerVersion: null,
  sourceContentVersion: null,
};

// ---------------------------------------------------------------------------
// 2. Percentage-of-EBITDA basket (isolated primitive demonstration)
// Real evidence: the percentage COMPONENT of fwrg-6.01-g-i (5% of
// Consolidated Adjusted EBITDA), isolated here to demonstrate the
// PERCENT/METRIC_REFERENCE/MULTIPLY primitive alone, before fixture 3
// composes it into the real greater-of shape.
// ---------------------------------------------------------------------------
export const FIXTURE_2_PERCENTAGE_OF_EBITDA: IRRule = {
  ruleId: ruleId("6.01(g)(i)-pct-component"),
  irSchemaVersion: "headroom-covenant-ir.v1",
  companyId: COMPANY_ID,
  instrumentKey: INSTRUMENT_KEY,
  sourceDocumentId: DOC_ID,
  sourceSectionRef: "6.01(g)(i)",
  covenantFamily: "INDEBTEDNESS",
  ruleType: "QUANTITATIVE_PERMISSION",
  posture: "PERMISSION",
  action: "GUARANTEE_DEBT",
  entityScope: [],
  entityScopeExcluded: [],
  transactionScope: null,
  capacityExpression: pctOfMetric(0.05, "Consolidated Adjusted EBITDA", "§6.01(g)(i): 5% of Consolidated Adjusted EBITDA"),
  conditions: [],
  exceptions: [],
  dependsOn: [],
  operativeLineage: null,
  sufficiency: "COMPLETE",
  sufficiencyReasons: [],
  provenance: provenance("§6.01(g)(i)"),
  compilerVersion: null,
  sourceContentVersion: null,
};

// ---------------------------------------------------------------------------
// 3. Greater-of fixed + EBITDA percentage
// Real evidence: fwrg-6.01-g-i verbatim - "Guaranties of supplier/customer/
// franchisee/licensee obligations... capped at the greater of $2,500,000 and
// 5% of Consolidated Adjusted EBITDA."
// ---------------------------------------------------------------------------
export const FIXTURE_3_GREATER_OF_FIXED_OR_EBITDA_PCT: IRRule = {
  ruleId: ruleId("6.01(g)(i)"),
  irSchemaVersion: "headroom-covenant-ir.v1",
  companyId: COMPANY_ID,
  instrumentKey: INSTRUMENT_KEY,
  sourceDocumentId: DOC_ID,
  sourceSectionRef: "6.01(g)(i)",
  covenantFamily: "INDEBTEDNESS",
  ruleType: "QUANTITATIVE_PERMISSION",
  posture: "PERMISSION",
  action: "GUARANTEE_DEBT",
  entityScope: [],
  entityScopeExcluded: [],
  transactionScope: null,
  capacityExpression: greaterOfFlatOrPct(2_500_000, 0.05, "Consolidated Adjusted EBITDA", "§6.01(g)(i): greater of $2,500,000 and 5% of Consolidated Adjusted EBITDA"),
  conditions: [],
  exceptions: [],
  dependsOn: [],
  operativeLineage: null,
  sufficiency: "COMPLETE",
  sufficiencyReasons: [],
  provenance: provenance("§6.01(g)(i)"),
  compilerVersion: null,
  sourceContentVersion: null,
};

// ---------------------------------------------------------------------------
// 4. Greater-of fixed + arbitrary metric percentage (Total Assets, NOT
// EBITDA) - the anti-enumeration proof case.
// Real evidence: lsb-6.01-i-flat-or-pct-assets verbatim - "$70,000,000 and
// 5.5% of total consolidated assets." SAME expression shape as fixture 3
// (MAX(MONEY, MULTIPLY(PERCENT, METRIC_REFERENCE))) with only metricName
// changed - zero new IR node kinds, zero new application code, exactly
// what task §0's own central objective requires.
// ---------------------------------------------------------------------------
export const FIXTURE_4_GREATER_OF_FIXED_OR_TOTAL_ASSETS_PCT: IRRule = {
  ruleId: ruleId("6.01(i)"),
  irSchemaVersion: "headroom-covenant-ir.v1",
  companyId: COMPANY_ID,
  instrumentKey: INSTRUMENT_KEY,
  sourceDocumentId: DOC_ID,
  sourceSectionRef: "6.01(i)",
  covenantFamily: "INDEBTEDNESS",
  ruleType: "QUANTITATIVE_PERMISSION",
  posture: "PERMISSION",
  action: "INCUR_DEBT",
  entityScope: [],
  entityScopeExcluded: [],
  transactionScope: null,
  capacityExpression: greaterOfFlatOrPct(70_000_000, 0.055, "Consolidated Total Assets", "§6.01(i): greater of $70,000,000 and 5.5% of total consolidated assets"),
  conditions: [],
  exceptions: [],
  dependsOn: [],
  operativeLineage: null,
  sufficiency: "COMPLETE",
  sufficiencyReasons: [],
  provenance: provenance("§6.01(i)"),
  compilerVersion: null,
  sourceContentVersion: null,
};

// ---------------------------------------------------------------------------
// 5. Maintenance leverage ratio (base comparison, unstepped)
// Real evidence: the base comparison inside fwrg-6.10-a - Total Rent
// Adjusted Net Leverage Ratio tested against a maximum threshold. The real
// covenant's full stepped/step-up mechanics are fixtures 7/8 below; this
// isolates the plain COMPARE primitive that both build on.
// ---------------------------------------------------------------------------
export const FIXTURE_5_MAINTENANCE_LEVERAGE_RATIO: IRRule = {
  ruleId: ruleId("6.10(a)-base"),
  irSchemaVersion: "headroom-covenant-ir.v1",
  companyId: COMPANY_ID,
  instrumentKey: INSTRUMENT_KEY,
  sourceDocumentId: DOC_ID,
  sourceSectionRef: "6.10(a)",
  covenantFamily: "FINANCIAL_COVENANTS",
  ruleType: "RATIO_TEST",
  posture: "OBLIGATION",
  action: "SATISFY_RATIO",
  entityScope: [],
  entityScopeExcluded: [],
  transactionScope: null,
  capacityExpression: {
    kind: "UNLIMITED_CAPACITY",
    type: "CAPACITY",
    gatedBy: withExpressionId({ kind: "COMPARE", type: "BOOLEAN", left: metric("Total Rent Adjusted Net Leverage Ratio", "RATIO"), operator: "LTE", right: ratio(5.0, "§6.10(a): 5.00:1.00 (thereafter)"), provenance: provenance("§6.10(a)") }),
    provenance: provenance("§6.10(a)"),
  },
  conditions: [],
  exceptions: [],
  dependsOn: [],
  operativeLineage: null,
  sufficiency: "COMPLETE",
  sufficiencyReasons: [],
  provenance: provenance("§6.10(a)"),
  compilerVersion: null,
  sourceContentVersion: null,
};

// ---------------------------------------------------------------------------
// 6. Maintenance FCCR
// Real evidence: fwrg-6.10-b verbatim - "Fixed Charge Coverage Ratio must
// not be less than 1.25:1.00."
// ---------------------------------------------------------------------------
export const FIXTURE_6_MAINTENANCE_FCCR: IRRule = {
  ruleId: ruleId("6.10(b)"),
  irSchemaVersion: "headroom-covenant-ir.v1",
  companyId: COMPANY_ID,
  instrumentKey: INSTRUMENT_KEY,
  sourceDocumentId: DOC_ID,
  sourceSectionRef: "6.10(b)",
  covenantFamily: "FINANCIAL_COVENANTS",
  ruleType: "RATIO_TEST",
  posture: "OBLIGATION",
  action: "SATISFY_RATIO",
  entityScope: [],
  entityScopeExcluded: [],
  transactionScope: null,
  capacityExpression: {
    kind: "UNLIMITED_CAPACITY",
    type: "CAPACITY",
    gatedBy: withExpressionId({ kind: "COMPARE", type: "BOOLEAN", left: metric("Fixed Charge Coverage Ratio", "RATIO"), operator: "GTE", right: ratio(1.25, "§6.10(b): 1.25:1.00"), provenance: provenance("§6.10(b)") }),
    provenance: provenance("§6.10(b)"),
  },
  conditions: [],
  exceptions: [],
  dependsOn: [],
  operativeLineage: null,
  sufficiency: "COMPLETE",
  sufficiencyReasons: [],
  provenance: provenance("§6.10(b)"),
  compilerVersion: null,
  sourceContentVersion: null,
};

// ---------------------------------------------------------------------------
// 7. Stepped leverage schedule
// Real evidence: fwrg-6.10-a verbatim - "5.50:1.00 (through Q4 2022),
// 5.25:1.00 (through Q4 2023), 5.00:1.00 (thereafter)." One SCHEDULE node,
// never a STEPPED_LEVERAGE-shaped special covenant type (task §9).
// ---------------------------------------------------------------------------
const STEPPED_LEVERAGE_THRESHOLD: IRExpression = withExpressionId({
  kind: "SCHEDULE",
  type: "RATIO",
  cases: [
    { from: null, to: "2022-12-31", value: ratio(5.5, "§6.10(a): 5.50:1.00 through Q4 2022"), description: "Through the fiscal quarter ending on or about December 31, 2022" },
    { from: "2023-01-01", to: "2023-12-31", value: ratio(5.25, "§6.10(a): 5.25:1.00 through Q4 2023"), description: "Through the fiscal quarter ending on or about December 31, 2023" },
  ],
  defaultValue: ratio(5.0, "§6.10(a): 5.00:1.00 thereafter"),
  provenance: provenance("§6.10(a)"),
});

export const FIXTURE_7_STEPPED_LEVERAGE_SCHEDULE: IRRule = {
  ruleId: ruleId("6.10(a)-stepped"),
  irSchemaVersion: "headroom-covenant-ir.v1",
  companyId: COMPANY_ID,
  instrumentKey: INSTRUMENT_KEY,
  sourceDocumentId: DOC_ID,
  sourceSectionRef: "6.10(a)",
  covenantFamily: "FINANCIAL_COVENANTS",
  ruleType: "RATIO_TEST",
  posture: "OBLIGATION",
  action: "SATISFY_RATIO",
  entityScope: [],
  entityScopeExcluded: [],
  transactionScope: null,
  capacityExpression: {
    kind: "UNLIMITED_CAPACITY",
    type: "CAPACITY",
    gatedBy: withExpressionId({ kind: "COMPARE", type: "BOOLEAN", left: metric("Total Rent Adjusted Net Leverage Ratio", "RATIO"), operator: "LTE", right: STEPPED_LEVERAGE_THRESHOLD, provenance: provenance("§6.10(a)") }),
    provenance: provenance("§6.10(a)"),
  },
  conditions: [{ conditionId: "fixture-7-time-period", conditionType: "TIME_PERIOD", expression: null, referencesDefinitionId: null, description: "Threshold varies by Test Period per the SCHEDULE above", provenance: provenance("§6.10(a)") }],
  exceptions: [],
  dependsOn: [],
  operativeLineage: null,
  sufficiency: "COMPLETE",
  sufficiencyReasons: [],
  provenance: provenance("§6.10(a)"),
  compilerVersion: null,
  sourceContentVersion: null,
};

// ---------------------------------------------------------------------------
// 8. Acquisition step-up
// Real evidence: fwrg-6.10-a verbatim - "a temporary 0.50x step-UP for four
// fiscal quarters following a Material Acquisition." Generalized via
// EVENT_ACTIVE + IF, never a STEPPED_LEVERAGE_WITH_ACQUISITION_STEPUP type
// (task §9's own explicit prohibition).
// ---------------------------------------------------------------------------
const MATERIAL_ACQUISITION_EVENT: IRExpression = withExpressionId({
  kind: "EVENT_ACTIVE",
  type: "BOOLEAN",
  eventDescription: "Material Acquisition step-up period",
  triggerCondition: null,
  activeDuration: "four consecutive fiscal quarters following the Material Acquisition",
  provenance: provenance("§6.10(a)"),
});

export const FIXTURE_8_ACQUISITION_STEP_UP: IRRule = {
  ruleId: ruleId("6.10(a)-stepup"),
  irSchemaVersion: "headroom-covenant-ir.v1",
  companyId: COMPANY_ID,
  instrumentKey: INSTRUMENT_KEY,
  sourceDocumentId: DOC_ID,
  sourceSectionRef: "6.10(a)",
  covenantFamily: "FINANCIAL_COVENANTS",
  ruleType: "RATIO_TEST",
  posture: "OBLIGATION",
  action: "SATISFY_RATIO",
  entityScope: [],
  entityScopeExcluded: [],
  transactionScope: null,
  capacityExpression: {
    kind: "UNLIMITED_CAPACITY",
    type: "CAPACITY",
    gatedBy: withExpressionId({
      kind: "COMPARE",
      type: "BOOLEAN",
      left: metric("Total Rent Adjusted Net Leverage Ratio", "RATIO"),
      operator: "LTE",
      right: withExpressionId({
        kind: "IF",
        type: "RATIO",
        condition: MATERIAL_ACQUISITION_EVENT,
        then: withExpressionId({ kind: "ADD", type: "RATIO", operands: [STEPPED_LEVERAGE_THRESHOLD, ratio(0.5, "§6.10(a): +0.50:1.00 step-up")] }),
        else: STEPPED_LEVERAGE_THRESHOLD,
        provenance: provenance("§6.10(a)"),
      }),
      provenance: provenance("§6.10(a)"),
    }),
    provenance: provenance("§6.10(a)"),
  },
  conditions: [{ conditionId: "fixture-8-material-acquisition", conditionType: "MATERIAL_ACQUISITION", expression: MATERIAL_ACQUISITION_EVENT, referencesDefinitionId: null, description: "0.50x step-up applies for 4 consecutive fiscal quarters following a Material Acquisition; anti-stacking rule limits how close together step-up periods may occur (not separately formalized in this V1 fixture)", provenance: provenance("§6.10(a)") }],
  exceptions: [],
  dependsOn: [],
  operativeLineage: null,
  sufficiency: "PARTIAL",
  sufficiencyReasons: ["the real source also states an anti-stacking rule limiting how close together step-up periods may occur - not formalized as its own expression in this V1 fixture, honestly left out of capacityExpression rather than silently assumed"],
  provenance: provenance("§6.10(a)"),
  compilerVersion: null,
  sourceContentVersion: null,
};

// ---------------------------------------------------------------------------
// 9. Multi-basket section - three independently-gated rules from ONE source
// section, never flattened into one rule (the Phase C/C.1 multi-basket
// lesson, task §36).
// Real evidence: lsb-6.13-investments verbatim - "$35,000,000 joint-venture
// cap, Payment-Conditions-gated Investments (uncapped), and a $5,000,000
// general basket," all within Section 6.13.
// ---------------------------------------------------------------------------
export const FIXTURE_9A_MULTIBASKET_JV_CAP: IRRule = {
  ruleId: ruleId("6.13(jv-cap)"),
  irSchemaVersion: "headroom-covenant-ir.v1",
  companyId: COMPANY_ID,
  instrumentKey: INSTRUMENT_KEY,
  sourceDocumentId: DOC_ID,
  sourceSectionRef: "6.13",
  covenantFamily: "INVESTMENTS",
  ruleType: "QUANTITATIVE_PERMISSION",
  posture: "PERMISSION",
  action: "MAKE_INVESTMENT",
  entityScope: [],
  entityScopeExcluded: [],
  transactionScope: null,
  capacityExpression: money(35_000_000, "§6.13: joint-venture cap"),
  conditions: [],
  exceptions: [],
  dependsOn: [],
  operativeLineage: null,
  sufficiency: "COMPLETE",
  sufficiencyReasons: [],
  provenance: provenance("§6.13"),
  compilerVersion: null,
  sourceContentVersion: null,
};
export const FIXTURE_9B_MULTIBASKET_PAYMENT_CONDITIONS: IRRule = {
  ruleId: ruleId("6.13(payment-conditions)"),
  irSchemaVersion: "headroom-covenant-ir.v1",
  companyId: COMPANY_ID,
  instrumentKey: INSTRUMENT_KEY,
  sourceDocumentId: DOC_ID,
  sourceSectionRef: "6.13",
  covenantFamily: "INVESTMENTS",
  ruleType: "QUANTITATIVE_PERMISSION",
  posture: "PERMISSION",
  action: "MAKE_INVESTMENT",
  entityScope: [],
  entityScopeExcluded: [],
  transactionScope: null,
  capacityExpression: { kind: "UNLIMITED_CAPACITY", type: "CAPACITY", gatedBy: null, provenance: provenance("§6.13") },
  conditions: [{ conditionId: "fixture-9b-payment-conditions", conditionType: "OTHER_RULE_SATISFIED", expression: null, referencesDefinitionId: null, description: "Gated by the reused, named 'Payment Conditions' compound condition (see fixture 15's own sibling definition pattern) - referenced by name, not restated (the real lsb-def-payment-conditions lesson)", provenance: provenance("§6.13") }],
  exceptions: [],
  dependsOn: [],
  operativeLineage: null,
  sufficiency: "COMPLETE",
  sufficiencyReasons: [],
  provenance: provenance("§6.13"),
  compilerVersion: null,
  sourceContentVersion: null,
};
export const FIXTURE_9C_MULTIBASKET_GENERAL: IRRule = {
  ruleId: ruleId("6.13(general)"),
  irSchemaVersion: "headroom-covenant-ir.v1",
  companyId: COMPANY_ID,
  instrumentKey: INSTRUMENT_KEY,
  sourceDocumentId: DOC_ID,
  sourceSectionRef: "6.13",
  covenantFamily: "INVESTMENTS",
  ruleType: "QUANTITATIVE_PERMISSION",
  posture: "PERMISSION",
  action: "MAKE_INVESTMENT",
  entityScope: [],
  entityScopeExcluded: [],
  transactionScope: null,
  capacityExpression: money(5_000_000, "§6.13: general basket"),
  conditions: [],
  exceptions: [],
  dependsOn: [],
  operativeLineage: null,
  sufficiency: "COMPLETE",
  sufficiencyReasons: [],
  provenance: provenance("§6.13"),
  compilerVersion: null,
  sourceContentVersion: null,
};
export const FIXTURE_9_MULTIBASKET_SECTION: IRRule[] = [FIXTURE_9A_MULTIBASKET_JV_CAP, FIXTURE_9B_MULTIBASKET_PAYMENT_CONDITIONS, FIXTURE_9C_MULTIBASKET_GENERAL];

// ---------------------------------------------------------------------------
// 10. Shared cap - two independently-gated rules drawing on the SAME
// resource, never duplicated into each (task §18).
// Real evidence: fwrg-6.04-b verbatim - "an explicit cross-basket offset
// against the 6.04(a)(x) Restricted Payments basket... any amount utilized
// [under 6.04(b)] shall result in a reduction in the amount available under
// Section 6.04(a)(x)."
// ---------------------------------------------------------------------------
const SHARED_CAP_ID = computeSharedCapId(COMPANY_ID, INSTRUMENT_KEY, "6.04(a)(x)+6.04(b)");
// Pre-computed so each rule's dependsOn can point at the OTHER rule's real,
// already-known ruleId - not a throwaway id that would fail the
// compilation unit's dangling-reference check (task §49).
const FIXTURE_10_RULE_A_ID = ruleId("6.04(a)(x)");
const FIXTURE_10_RULE_B_ID = ruleId("6.04(b)");

export const FIXTURE_10_SHARED_CAP_RULE_A: IRRule = {
  ruleId: FIXTURE_10_RULE_A_ID,
  irSchemaVersion: "headroom-covenant-ir.v1",
  companyId: COMPANY_ID,
  instrumentKey: INSTRUMENT_KEY,
  sourceDocumentId: DOC_ID,
  sourceSectionRef: "6.04(a)(x)",
  covenantFamily: "RESTRICTED_PAYMENTS",
  ruleType: "QUANTITATIVE_PERMISSION",
  posture: "PERMISSION",
  action: "PAY_DIVIDEND",
  entityScope: [],
  entityScopeExcluded: [],
  transactionScope: null,
  capacityExpression: withExpressionId({ kind: "SUBTRACT", type: "MONEY", left: greaterOfFlatOrPct(21_000_000, 0.35, "Consolidated Adjusted EBITDA", "§6.04(a)(x): greater of $21,000,000 and 35% of Consolidated Adjusted EBITDA"), right: withExpressionId({ kind: "LEDGER_USAGE_REFERENCE", type: "MONEY", sharedCapId: SHARED_CAP_ID, ruleId: null }), provenance: provenance("§6.04(a)(x)") }),
  conditions: [{ conditionId: "fixture-10a-no-default", conditionType: "NO_DEFAULT", expression: null, referencesDefinitionId: null, description: "No continuing Event of Default", provenance: provenance("§6.04(a)(x)") }],
  exceptions: [],
  dependsOn: [{ relationshipType: "SHARES_CAPACITY_WITH", targetRuleId: FIXTURE_10_RULE_B_ID, description: "shares its own aggregate cap with §6.04(b) Restricted Debt Payments - see IRSharedCapacity" }],
  operativeLineage: null,
  sufficiency: "COMPLETE",
  sufficiencyReasons: [],
  provenance: provenance("§6.04(a)(x)"),
  compilerVersion: null,
  sourceContentVersion: null,
};
export const FIXTURE_10_SHARED_CAP_RULE_B: IRRule = {
  ruleId: FIXTURE_10_RULE_B_ID,
  irSchemaVersion: "headroom-covenant-ir.v1",
  companyId: COMPANY_ID,
  instrumentKey: INSTRUMENT_KEY,
  sourceDocumentId: DOC_ID,
  sourceSectionRef: "6.04(b)(iv)",
  covenantFamily: "RESTRICTED_PAYMENTS",
  ruleType: "QUANTITATIVE_PERMISSION",
  posture: "PERMISSION",
  action: "PAY_JUNIOR_DEBT",
  entityScope: [],
  entityScopeExcluded: [],
  transactionScope: null,
  capacityExpression: withExpressionId({ kind: "SUBTRACT", type: "MONEY", left: greaterOfFlatOrPct(21_000_000, 0.35, "Consolidated Adjusted EBITDA", "§6.04(b)(iv): greater of $21,000,000 and 35% of Consolidated Adjusted EBITDA"), right: withExpressionId({ kind: "LEDGER_USAGE_REFERENCE", type: "MONEY", sharedCapId: SHARED_CAP_ID, ruleId: null }), provenance: provenance("§6.04(b)(iv)") }),
  conditions: [{ conditionId: "fixture-10b-no-default", conditionType: "NO_DEFAULT", expression: null, referencesDefinitionId: null, description: "No continuing Event of Default", provenance: provenance("§6.04(b)(iv)") }],
  exceptions: [],
  dependsOn: [{ relationshipType: "SHARES_CAPACITY_WITH", targetRuleId: FIXTURE_10_RULE_A_ID, description: "shares its own aggregate cap with §6.04(a)(x) Restricted Payments - see IRSharedCapacity" }],
  operativeLineage: null,
  sufficiency: "COMPLETE",
  sufficiencyReasons: [],
  provenance: provenance("§6.04(b)(iv)"),
  compilerVersion: null,
  sourceContentVersion: null,
};
export const FIXTURE_10_SHARED_CAPACITY: IRSharedCapacity = {
  sharedCapId: SHARED_CAP_ID,
  companyId: COMPANY_ID,
  instrumentKey: INSTRUMENT_KEY,
  description: "Combined §6.04(a)(x)/§6.04(b)(iv) aggregate cap - usage under either basket reduces capacity available under the other",
  capExpression: greaterOfFlatOrPct(21_000_000, 0.35, "Consolidated Adjusted EBITDA", "§6.04(a)(x)/(b)(iv) shared aggregate cap"),
  memberRuleIds: [FIXTURE_10_SHARED_CAP_RULE_A.ruleId, FIXTURE_10_SHARED_CAP_RULE_B.ruleId],
  provenance: provenance("§6.04(a)(x), §6.04(b)(iv)"),
};

// ---------------------------------------------------------------------------
// 11. No-default condition
// Real evidence: fwrg-6.04-a-x verbatim - RP basket "conditioned on no
// continuing Event of Default."
// ---------------------------------------------------------------------------
export const FIXTURE_11_NO_DEFAULT_CONDITION: IRRule = {
  ruleId: ruleId("6.04(a)(x)-standalone"),
  irSchemaVersion: "headroom-covenant-ir.v1",
  companyId: COMPANY_ID,
  instrumentKey: INSTRUMENT_KEY,
  sourceDocumentId: DOC_ID,
  sourceSectionRef: "6.04(a)(x)",
  covenantFamily: "RESTRICTED_PAYMENTS",
  ruleType: "QUANTITATIVE_PERMISSION",
  posture: "PERMISSION",
  action: "PAY_DIVIDEND",
  entityScope: [],
  entityScopeExcluded: [],
  transactionScope: null,
  capacityExpression: greaterOfFlatOrPct(21_000_000, 0.35, "Consolidated Adjusted EBITDA", "§6.04(a)(x)"),
  conditions: [{ conditionId: "fixture-11-no-default", conditionType: "NO_DEFAULT", expression: null, referencesDefinitionId: null, description: "No continuing Event of Default", provenance: provenance("§6.04(a)(x)") }],
  exceptions: [],
  dependsOn: [],
  operativeLineage: null,
  sufficiency: "COMPLETE",
  sufficiencyReasons: [],
  provenance: provenance("§6.04(a)(x)"),
  compilerVersion: null,
  sourceContentVersion: null,
};

// ---------------------------------------------------------------------------
// 12. Pro forma ratio condition (unlimited capacity gated by a ratio test)
// Real evidence: fwrg-6.04-a-xi verbatim - "Unlimited Restricted Payments so
// long as the Total Rent Adjusted Net Leverage Ratio, calculated Pro Forma,
// would not exceed 3.50:1.00" - the ground truth's own "designed adversarial
// probe": an extractor that reports a dollar threshold here instead of
// 'uncapped subject to a ratio test' would be confidently wrong.
// ---------------------------------------------------------------------------
export const FIXTURE_12_PRO_FORMA_RATIO_CONDITION: IRRule = {
  ruleId: ruleId("6.04(a)(xi)"),
  irSchemaVersion: "headroom-covenant-ir.v1",
  companyId: COMPANY_ID,
  instrumentKey: INSTRUMENT_KEY,
  sourceDocumentId: DOC_ID,
  sourceSectionRef: "6.04(a)(xi)",
  covenantFamily: "RESTRICTED_PAYMENTS",
  ruleType: "QUANTITATIVE_PERMISSION",
  posture: "PERMISSION",
  action: "PAY_DIVIDEND",
  entityScope: [],
  entityScopeExcluded: [],
  transactionScope: null,
  capacityExpression: {
    kind: "UNLIMITED_CAPACITY",
    type: "CAPACITY",
    gatedBy: withExpressionId({
      kind: "COMPARE",
      type: "BOOLEAN",
      left: withExpressionId({ kind: "AS_OF", type: "RATIO", value: metric("Total Rent Adjusted Net Leverage Ratio", "RATIO"), asOfDate: "pro forma for the proposed Restricted Payment" }),
      operator: "LTE",
      right: ratio(3.5, "§6.04(a)(xi): 3.50:1.00 Pro Forma"),
      provenance: provenance("§6.04(a)(xi)"),
    }),
    provenance: provenance("§6.04(a)(xi)"),
  },
  conditions: [{ conditionId: "fixture-12-ratio-satisfied", conditionType: "RATIO_SATISFIED", expression: null, referencesDefinitionId: null, description: "Total Rent Adjusted Net Leverage Ratio, calculated Pro Forma, must not exceed 3.50:1.00 - no dollar cap otherwise", provenance: provenance("§6.04(a)(xi)") }],
  exceptions: [],
  dependsOn: [],
  operativeLineage: null,
  sufficiency: "COMPLETE",
  sufficiencyReasons: [],
  provenance: provenance("§6.04(a)(xi)"),
  compilerVersion: null,
  sourceContentVersion: null,
};

// ---------------------------------------------------------------------------
// 13. Simple restricted-payment prohibition + exception
// Real evidence: lsb-6.11-restricted-payments verbatim - a general
// prohibition on dividends/distributions/stock repurchases, with a
// $500,000/fiscal-year exception among others.
// ---------------------------------------------------------------------------
export const FIXTURE_13_RP_PERMISSION_UNDER_EXCEPTION: IRRule = {
  ruleId: ruleId("6.11-fixed-exception"),
  irSchemaVersion: "headroom-covenant-ir.v1",
  companyId: COMPANY_ID,
  instrumentKey: INSTRUMENT_KEY,
  sourceDocumentId: DOC_ID,
  sourceSectionRef: "6.11",
  covenantFamily: "RESTRICTED_PAYMENTS",
  ruleType: "QUANTITATIVE_PERMISSION",
  posture: "PERMISSION",
  action: "PAY_DIVIDEND",
  entityScope: [],
  entityScopeExcluded: [],
  transactionScope: null,
  capacityExpression: money(500_000, "§6.11: $500,000 per fiscal year"),
  conditions: [],
  exceptions: [],
  dependsOn: [],
  operativeLineage: null,
  sufficiency: "COMPLETE",
  sufficiencyReasons: [],
  provenance: provenance("§6.11"),
  compilerVersion: null,
  sourceContentVersion: null,
};
const FIXTURE_13_PROHIBITION_ID = ruleId("6.11-prohibition");
export const FIXTURE_13_RP_PROHIBITION: IRRule = {
  ruleId: FIXTURE_13_PROHIBITION_ID,
  irSchemaVersion: "headroom-covenant-ir.v1",
  companyId: COMPANY_ID,
  instrumentKey: INSTRUMENT_KEY,
  sourceDocumentId: DOC_ID,
  sourceSectionRef: "6.11",
  covenantFamily: "RESTRICTED_PAYMENTS",
  ruleType: "PROHIBITION",
  posture: "PROHIBITION",
  action: "PAY_DIVIDEND",
  entityScope: [],
  entityScopeExcluded: [],
  transactionScope: null,
  capacityExpression: null,
  conditions: [],
  exceptions: [
    { exceptionId: "fixture-13-fixed-exception", appliesToRuleId: FIXTURE_13_PROHIBITION_ID, description: "Restricted Payments up to $500,000 per fiscal year", permissionRuleId: FIXTURE_13_RP_PERMISSION_UNDER_EXCEPTION.ruleId, conditions: [], provenance: provenance("§6.11") },
    { exceptionId: "fixture-13-intercompany-exception", appliesToRuleId: FIXTURE_13_PROHIBITION_ID, description: "Intercompany Restricted Payments among Loan Parties", permissionRuleId: null, conditions: [], provenance: provenance("§6.11") },
  ],
  dependsOn: [],
  operativeLineage: null,
  sufficiency: "COMPLETE",
  sufficiencyReasons: [],
  provenance: provenance("§6.11"),
  compilerVersion: null,
  sourceContentVersion: null,
};

// ---------------------------------------------------------------------------
// 14. Builder-like capacity - real, generalizable evidence of BOTH
// compositional success AND honest partial representation in one rule.
// Real evidence: fwrg-def-available-amount verbatim - a cumulative,
// multi-clause builder-basket definition: (i) a reserved/unused component
// the ground truth itself could not fully decompose in V1 (represented
// honestly as an UnsupportedExpression, never silently dropped or
// invented), (ii) the CNI Growth Amount, gated by a ratio test AND an
// EOD carve-out.
// ---------------------------------------------------------------------------
const AVAILABLE_AMOUNT_RESERVED_COMPONENT: IRExpression = withExpressionId({
  kind: "UNSUPPORTED",
  type: null,
  sourceEvidence: "Article 1, Available Amount, clause (i)",
  semanticDescription: "A reserved/unused starter sub-clause whose own cross-references this V1 fixture does not attempt to fully decompose",
  reason: "the real ground truth (fwrg-def-available-amount) itself flags this as the hardest single provision in its own source package - representable only by decomposing one dense definitional paragraph into several linked atomic rows, which this single-rule V1 fixture does not attempt",
  requiredReview: true,
  provenance: provenance("Article 1 (Available Amount)(i)"),
});
const CNI_GROWTH_AMOUNT: IRExpression = withExpressionId({
  kind: "IF",
  type: "MONEY",
  condition: withExpressionId({ kind: "COMPARE", type: "BOOLEAN", left: metric("Total Rent Adjusted Net Leverage Ratio", "RATIO"), operator: "LTE", right: ratio(4.5, "Available Amount clause (ii): 4.50:1.00 Pro Forma gate"), provenance: provenance("Article 1 (Available Amount)(ii)") }),
  then: metric("CNI Growth Amount"),
  else: money(0, "Available Amount clause (ii): unavailable when the ratio gate is not satisfied"),
  provenance: provenance("Article 1 (Available Amount)(ii)"),
});

export const FIXTURE_14_BUILDER_AVAILABLE_AMOUNT: IRDefinition = {
  definitionId: computeDefinitionId(COMPANY_ID, INSTRUMENT_KEY, "Available Amount"),
  irSchemaVersion: "headroom-covenant-ir.v1",
  companyId: COMPANY_ID,
  instrumentKey: INSTRUMENT_KEY,
  sourceDocumentId: DOC_ID,
  termName: "Available Amount",
  covenantFamily: "DEFINITIONS_CALCULATION_RULES",
  calculationExpression: withExpressionId({ kind: "SUM", type: "MONEY", operands: [AVAILABLE_AMOUNT_RESERVED_COMPONENT, CNI_GROWTH_AMOUNT], provenance: provenance("Article 1 (Available Amount)") }),
  dependsOnTerms: ["CNI Growth Amount", "Total Rent Adjusted Net Leverage Ratio", "Available Excluded Contribution Amount", "Cure Amount"],
  sufficiency: "PARTIAL",
  sufficiencyReasons: ["clause (i) (the reserved/unused starter component) is represented as an UnsupportedExpression, not fabricated - the real, correctly-computed CNI Growth Amount component (clause (ii)) remains usable even though clause (i) is not (task §25's own 'preserve represented components, do not discard the whole rule')"],
  provenance: provenance("Article 1 (Available Amount)"),
  compilerVersion: null,
  sourceContentVersion: null,
};

// ---------------------------------------------------------------------------
// 15. Unsupported/novel mechanic - the honest, whole-item MISSING_CONTEXT
// case, never a guessed definition.
// Real evidence: lsb-def-abl-notes-priority-collateral verbatim - "ABL
// Priority Collateral"/"Notes Priority Collateral" are defined ONLY by
// cross-reference to the Intercreditor Agreement, a document this package
// does not contain. The ground truth's own words: "a confident EXECUTABLE
// extraction here... would be exactly the DANGEROUS_UNFLAGGED failure mode
// this whole exercise measures."
// ---------------------------------------------------------------------------
export const FIXTURE_15_UNSUPPORTED_CROSS_REFERENCE: IRDefinition = {
  definitionId: computeDefinitionId(COMPANY_ID, INSTRUMENT_KEY, "ABL Priority Collateral"),
  irSchemaVersion: "headroom-covenant-ir.v1",
  companyId: COMPANY_ID,
  instrumentKey: INSTRUMENT_KEY,
  sourceDocumentId: DOC_ID,
  termName: "ABL Priority Collateral",
  covenantFamily: "COLLATERAL_SECURITY",
  calculationExpression: null,
  dependsOnTerms: [],
  sufficiency: "MISSING_CONTEXT",
  sufficiencyReasons: ['"ABL Priority Collateral" is defined only by cross-reference to the Intercreditor Agreement, a document not present in this package - the correct extraction is an honest MISSING_CONTEXT definition, never a guessed/invented set of collateral categories (this is the real ground truth\'s own designed adversarial probe for exactly this failure mode)'],
  provenance: provenance('Article 1: "shall have the meaning set forth in the Intercreditor Agreement"'),
  compilerVersion: null,
  sourceContentVersion: null,
};

export const ALL_FIXTURE_RULES: IRRule[] = [
  FIXTURE_1_FIXED_DEBT_BASKET,
  FIXTURE_2_PERCENTAGE_OF_EBITDA,
  FIXTURE_3_GREATER_OF_FIXED_OR_EBITDA_PCT,
  FIXTURE_4_GREATER_OF_FIXED_OR_TOTAL_ASSETS_PCT,
  FIXTURE_5_MAINTENANCE_LEVERAGE_RATIO,
  FIXTURE_6_MAINTENANCE_FCCR,
  FIXTURE_7_STEPPED_LEVERAGE_SCHEDULE,
  FIXTURE_8_ACQUISITION_STEP_UP,
  ...FIXTURE_9_MULTIBASKET_SECTION,
  FIXTURE_10_SHARED_CAP_RULE_A,
  FIXTURE_10_SHARED_CAP_RULE_B,
  FIXTURE_11_NO_DEFAULT_CONDITION,
  FIXTURE_12_PRO_FORMA_RATIO_CONDITION,
  FIXTURE_13_RP_PERMISSION_UNDER_EXCEPTION,
  FIXTURE_13_RP_PROHIBITION,
];

export const ALL_FIXTURE_DEFINITIONS: IRDefinition[] = [FIXTURE_14_BUILDER_AVAILABLE_AMOUNT, FIXTURE_15_UNSUPPORTED_CROSS_REFERENCE];

export const ALL_FIXTURE_SHARED_CAPACITIES: IRSharedCapacity[] = [FIXTURE_10_SHARED_CAPACITY];
