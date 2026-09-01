/**
 * SEMANTIC ACCOUNTABILITY - the general synthetic corpus (mission §16,
 * I1-I45). Every scenario is WHOLLY SYNTHETIC: fictional metric names,
 * fictional amounts, fictional section numbering. No text, figure, term or
 * section label is copied from any real agreement or benchmark package.
 *
 * Each scenario carries three things:
 *  - `text`      the synthetic agreement (parsed by the real Phase 2A
 *                structural parser/indexer - never a hand-rolled index);
 *  - `items`     the SOURCE-DERIVED ground-truth inventory: every material
 *                semantic component with its verbatim excerpt, role,
 *                materiality and expected quantitative values. The Pass A
 *                harness feeds these excerpts through the real normalization
 *                (anti-hallucination locate, scanner completion, stable ids)
 *                as the scripted model output, so recall measures what the
 *                deterministic layer keeps/loses - and the scanner's value
 *                recall is measured against the declared values;
 *  - `compose`   a lineage-bearing composition (real wire schema -> real
 *                normalize.ts -> real IR) that FULLY accounts for the
 *                inventory. Injection tests then derive omissions from it.
 */
import type { SubmitCompilationInput, WireCondition, WireDefinition, WireException, WireExpression, WireRule, WireSharedCapacity } from "../../../lib/contract-model/compiler/semantic/wire-schema";
import type { InventoryMateriality, QuantitativeKind, SemanticRole, SourceContextState } from "../../../lib/contract-model/compiler/semantic-accountability/types";

export type Id = (ref: string) => string;

export interface GroundTruthValue {
  kind: QuantitativeKind;
  rawText: string;
  normalized: number | null;
}

export interface ScenarioItem {
  ref: string;
  role: SemanticRole;
  /** Verbatim substring of the operative unit (or of the named expansion region). */
  excerpt: string;
  materiality: InventoryMateriality;
  values?: GroundTruthValue[];
  referencedTerms?: string[];
  referencedSections?: string[];
  parentRef?: string;
  regionId?: string;
  operative?: "OPERATIVE" | "DEFINITIONAL";
}

export interface Scenario {
  id: string;
  title: string;
  text: string;
  /** The section (bare legal ref) that is the compilation unit. */
  anchorRef: string;
  /** Optional: derive the operative window from the anchor's full text (I39 truncation). */
  operativeWindow?: (fullUnitText: string) => string;
  items: ScenarioItem[];
  compose: (id: Id) => SubmitCompilationInput;
  expectedContextState: SourceContextState;
  expectSemanticallyComplete: boolean;
  /** Items expected to be carried as AMBIGUOUS (unresolved cross-unit dependency - review, never guessed). */
  expectedAmbiguousRefs?: string[];
  /** Items expected to be explicitly dispositioned INTENTIONALLY_NON_COMPUTATIONAL. */
  expectedNonComputationalRefs?: string[];
  /** Number of unresolved cross-unit dependencies the composition is expected to preserve. */
  expectedUnresolvedDependencies?: number;
  /** Unresolved source references (AMBIGUOUS/NOT_FOUND) the source-context layer must report. */
  expectedUnresolvedReferenceStatuses?: string[];
}

// ---------------------------------------------------------------------------
// Ground-truth value helpers
// ---------------------------------------------------------------------------
export const money = (raw: string, n: number): GroundTruthValue => ({ kind: "MONEY", rawText: raw, normalized: n });
export const pct = (raw: string, n: number): GroundTruthValue => ({ kind: "PERCENT", rawText: raw, normalized: n });
export const ratio = (raw: string, n: number): GroundTruthValue => ({ kind: "RATIO", rawText: raw, normalized: n });
export const days = (raw: string, n: number): GroundTruthValue => ({ kind: "DAYS", rawText: raw, normalized: n });
export const period = (raw: string, n: number): GroundTruthValue => ({ kind: "PERIOD", rawText: raw, normalized: n });
export const date = (raw: string): GroundTruthValue => ({ kind: "DATE", rawText: raw, normalized: null });
export const mult = (raw: string, n: number): GroundTruthValue => ({ kind: "MULTIPLIER", rawText: raw, normalized: n });

// ---------------------------------------------------------------------------
// Wire builders (composition side)
// ---------------------------------------------------------------------------
const lin = (ids?: string[]) => (ids && ids.length > 0 ? { inventoryItemIds: ids } : {});
export const M = (amount: number, ids?: string[]): WireExpression => ({ kind: "MONEY", amount, currency: "USD", ...lin(ids) });
export const P = (value: number, ids?: string[]): WireExpression => ({ kind: "PERCENT", value, ...lin(ids) });
export const R = (value: number, ids?: string[]): WireExpression => ({ kind: "RATIO", value, ...lin(ids) });
export const N = (value: number, ids?: string[]): WireExpression => ({ kind: "NUMBER", value, ...lin(ids) });
export const D = (isoDate: string, ids?: string[]): WireExpression => ({ kind: "DATE_LITERAL", isoDate, ...lin(ids) });
export const METRIC = (metricName: string, valueType: "MONEY" | "RATIO" | "NUMBER" = "MONEY", ids?: string[]): WireExpression => ({ kind: "METRIC_REFERENCE", metricName, valueType, ...lin(ids) });
export const TERM = (termName: string, valueType: "MONEY" | "RATIO" | "NUMBER" | "PERCENT" = "MONEY", ids?: string[]): WireExpression => ({ kind: "DEFINED_TERM_REFERENCE", termName, valueType, ...lin(ids) });
export const INPUT = (inputName: string, ids?: string[]): WireExpression => ({ kind: "TRANSACTION_INPUT_REFERENCE", inputName, valueType: "MONEY", ...lin(ids) });
export const LEDGER = (sharedCapRef: string, ids?: string[]): WireExpression => ({ kind: "LEDGER_USAGE_REFERENCE", sharedCapRef, ...lin(ids) });
export const MAX = (operands: WireExpression[], ids?: string[]): WireExpression => ({ kind: "MAX", operands, ...lin(ids) });
export const MIN = (operands: WireExpression[], ids?: string[]): WireExpression => ({ kind: "MIN", operands, ...lin(ids) });
export const SUM = (operands: WireExpression[], ids?: string[]): WireExpression => ({ kind: "SUM", operands, ...lin(ids) });
export const MUL = (operands: WireExpression[], ids?: string[]): WireExpression => ({ kind: "MULTIPLY", operands, ...lin(ids) });
export const SUB = (left: WireExpression, right: WireExpression, ids?: string[]): WireExpression => ({ kind: "SUBTRACT", left, right, ...lin(ids) });
export const DIV = (numerator: WireExpression, denominator: WireExpression, ids?: string[]): WireExpression => ({ kind: "DIVIDE", numerator, denominator, ...lin(ids) });
export const CMP = (operator: "GT" | "GTE" | "LT" | "LTE" | "EQ", left: WireExpression, right: WireExpression, ids?: string[]): WireExpression => ({ kind: "COMPARE", operator, left, right, ...lin(ids) });
export const IF = (condition: WireExpression, then: WireExpression, els: WireExpression, ids?: string[]): WireExpression => ({ kind: "IF", condition, then, else: els, ...lin(ids) });
export const AND = (operands: WireExpression[], ids?: string[]): WireExpression => ({ kind: "AND", operands, ...lin(ids) });
export const DURING = (periodDescription: string, operand: WireExpression, ids?: string[]): WireExpression => ({ kind: "DURING_PERIOD", periodDescription, operand, ...lin(ids) });
export const SCHEDULE = (cases: { from: string | null; to: string | null; value: WireExpression; description: string }[], ids?: string[]): WireExpression => ({ kind: "SCHEDULE", cases, ...lin(ids) });
export const UNLIMITED = (gatedBy: WireExpression | null, ids?: string[]): WireExpression => ({ kind: "UNLIMITED_CAPACITY", gatedBy, ...lin(ids) });
export const UNSUPPORTED = (semanticDescription: string, sourceEvidence: string, ids?: string[]): WireExpression => ({ kind: "UNSUPPORTED", semanticDescription, reason: semanticDescription, sourceEvidence, ...lin(ids) });

export function cond(conditionType: string, description: string, expression: WireExpression | null, ids?: string[]): WireCondition {
  return { conditionType, expression, referencesDefinitionId: null, description, citation: null, excerpt: null, ...lin(ids) };
}
export function exc(description: string, permissionRef: string | null, conditions: WireCondition[], ids?: string[]): WireException {
  return { description, permissionRef, conditions, citation: null, excerpt: null, ...lin(ids) };
}
export function dep(relationshipType: string, targetRef: string, description: string, ids?: string[]) {
  return { relationshipType, targetRef, description, ...lin(ids) };
}
export function rule(localRef: string, sourceSectionRef: string, r: Partial<WireRule>, ids?: string[]): WireRule {
  return {
    localRef,
    sourceSectionRef,
    covenantFamily: "INDEBTEDNESS",
    ruleType: "QUANTITATIVE_PERMISSION",
    posture: "PERMISSION",
    action: "INCUR_DEBT",
    entityScope: [],
    entityScopeExcluded: [],
    capacityExpression: null,
    conditions: [],
    exceptions: [],
    dependsOn: [],
    sufficiency: "COMPLETE",
    sufficiencyReasons: [],
    citation: null,
    excerpt: null,
    ...lin(ids),
    ...r,
  };
}
export function def(localRef: string, termName: string, calculationExpression: WireExpression | null, dependsOnTerms: string[], ids?: string[], d: Partial<WireDefinition> = {}): WireDefinition {
  return { localRef, termName, covenantFamily: "DEFINITIONS_CALCULATION_RULES", calculationExpression, dependsOnTerms, sufficiency: "COMPLETE", sufficiencyReasons: [], citation: null, excerpt: null, ...lin(ids), ...d };
}
export function shared(localRef: string, description: string, capExpression: WireExpression, memberRefs: string[], ids?: string[]): WireSharedCapacity {
  return { localRef, description, capExpression, memberRefs, citation: null, excerpt: null, ...lin(ids) };
}
export function submission(s: Partial<SubmitCompilationInput>): SubmitCompilationInput {
  return { rules: [], definitions: [], sharedCapacities: [], irExtensionCandidates: [], overallNotes: [], ...s };
}

// ---------------------------------------------------------------------------
// Synthetic agreement scaffolding
// ---------------------------------------------------------------------------
const DEFS_HEAD = `ARTICLE I\nDEFINITIONS\n\nSECTION 1.01 Defined Terms.\n\n`;
const COV_HEAD = `ARTICLE VII\nNEGATIVE COVENANTS\n\n`;
const agreement = (...parts: string[]) => parts.join("\n\n") + "\n";

function item(ref: string, role: SemanticRole, excerpt: string, materiality: InventoryMateriality, extra: Partial<ScenarioItem> = {}): ScenarioItem {
  return { ref, role, excerpt, materiality, ...extra };
}

// ---------------------------------------------------------------------------
// I1 - dense definition with 20 components
// ---------------------------------------------------------------------------
const I1_COMPONENTS = [
  "interest expense", "provision for income taxes", "depreciation expense", "amortization expense", "non-cash charges", "extraordinary losses", "restructuring charges not to exceed $5,000,000 in any period", "projected cost savings not to exceed 15% of Consolidated Zeta Amount", "losses on asset dispositions", "unrealized hedging losses", "fees in connection with Permitted Acquisitions", "stock-based compensation", "minority interest expense", "foreign currency translation losses", "integration costs", "litigation settlement charges", "start-up costs for new facilities", "charges related to discontinued operations", "non-recurring severance costs", "business optimization expenses",
];
const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii", "xiii", "xiv", "xv", "xvi", "xvii", "xviii", "xix", "xx"];
const I1_BASE = "Consolidated Net Income for such period";
const I1_TEXT = agreement(DEFS_HEAD + `"Consolidated Zeta Amount" means, for any period, ${I1_BASE} plus, without duplication and to the extent deducted in determining such Consolidated Net Income, the sum of ${I1_COMPONENTS.map((c, i) => `(${ROMAN[i]}) ${c}`).join("; ")}.`);
const I1: Scenario = {
  id: "I1",
  title: "dense definition, 20 components",
  text: I1_TEXT,
  anchorRef: "1.01",
  items: [
    item("base", "FORMULA_COMPONENT", I1_BASE, "CRITICAL", { operative: "DEFINITIONAL", referencedTerms: ["Consolidated Net Income"] }),
    ...I1_COMPONENTS.map((c, i) => item(`c${i + 1}`, "FORMULA_COMPONENT", c, "MATERIAL", { operative: "DEFINITIONAL", values: i === 6 ? [money("$5,000,000", 5_000_000)] : i === 7 ? [pct("15%", 0.15)] : [] })),
  ],
  compose: (id) =>
    submission({
      definitions: [
        def("d1", "Consolidated Zeta Amount", SUM([
          TERM("Consolidated Net Income", "MONEY", [id("base")]),
          ...I1_COMPONENTS.map((c, i) => (i === 6 ? MIN([METRIC(c, "MONEY"), M(5_000_000)], [id("c7")]) : i === 7 ? MIN([METRIC(c, "MONEY"), MUL([P(0.15), TERM("Consolidated Zeta Amount")])], [id("c8")]) : METRIC(c, "MONEY", [id(`c${i + 1}`)]))),
        ]), ["Consolidated Net Income"], [id("base")]),
      ],
    }),
  expectedContextState: "COMPLETE_LOCAL_SOURCE",
  expectSemanticallyComplete: true,
};

// ---------------------------------------------------------------------------
// I2 - ratio definition
// ---------------------------------------------------------------------------
const I2_NUM = "Consolidated Total Debt as of such date";
const I2_DEN = "Consolidated Zeta Amount for the period of four consecutive fiscal quarters most recently ended";
const I2: Scenario = {
  id: "I2",
  title: "ratio definition",
  text: agreement(DEFS_HEAD + `"Total Leverage Ratio" means, as of any date of determination, the ratio of (a) ${I2_NUM} to (b) ${I2_DEN}.`),
  anchorRef: "1.01",
  items: [
    item("num", "FORMULA_COMPONENT", I2_NUM, "CRITICAL", { operative: "DEFINITIONAL", referencedTerms: ["Consolidated Total Debt"] }),
    item("den", "FORMULA_COMPONENT", I2_DEN, "CRITICAL", { operative: "DEFINITIONAL", referencedTerms: ["Consolidated Zeta Amount"], values: [period("four consecutive fiscal quarters", 4)] }),
  ],
  compose: (id) => submission({ definitions: [def("d1", "Total Leverage Ratio", DIV(TERM("Consolidated Total Debt", "MONEY", [id("num")]), DURING("the period of four consecutive fiscal quarters most recently ended", TERM("Consolidated Zeta Amount"), [id("den")])), ["Consolidated Total Debt", "Consolidated Zeta Amount"], [], { sufficiency: "COMPLETE" })] }),
  expectedContextState: "COMPLETE_LOCAL_SOURCE",
  expectSemanticallyComplete: true,
};

// ---------------------------------------------------------------------------
// I3 - pricing grid
// ---------------------------------------------------------------------------
const I3_A = "2.50% per annum if the Total Leverage Ratio is greater than 3.00 to 1.00";
const I3_B = "2.00% per annum if the Total Leverage Ratio is greater than 2.00 to 1.00 but less than or equal to 3.00 to 1.00";
const I3_C = "1.50% per annum if the Total Leverage Ratio is less than or equal to 2.00 to 1.00";
const I3: Scenario = {
  id: "I3",
  title: "pricing grid",
  text: agreement(`ARTICLE II\nTHE CREDITS\n\nSECTION 2.08 Applicable Margin. The Applicable Margin for any day shall be (a) ${I3_A}, (b) ${I3_B} and (c) ${I3_C}.`),
  anchorRef: "2.08",
  items: [
    item("t1", "VALUE", I3_A, "CRITICAL", { values: [pct("2.50%", 0.025), ratio("3.00 to 1.00", 3)] }),
    item("t2", "VALUE", I3_B, "CRITICAL", { values: [pct("2.00%", 0.02), ratio("2.00 to 1.00", 2), ratio("3.00 to 1.00", 3)] }),
    item("t3", "VALUE", I3_C, "CRITICAL", { values: [pct("1.50%", 0.015), ratio("2.00 to 1.00", 2)] }),
  ],
  compose: (id) =>
    submission({
      rules: [rule("r1", "2.08", { covenantFamily: "DEFINITIONS_CALCULATION_RULES", ruleType: "CALCULATION_RULE", posture: "N_A", action: null, capacityExpression: IF(CMP("GT", TERM("Total Leverage Ratio", "RATIO"), R(3)), P(0.025), IF(CMP("GT", TERM("Total Leverage Ratio", "RATIO"), R(2)), P(0.02), P(0.015, [id("t3")]), [id("t2")]), [id("t1")]) })],
    }),
  expectedContextState: "COMPLETE_LOCAL_SOURCE",
  expectSemanticallyComplete: true,
};

// ---------------------------------------------------------------------------
// I4 - capped addback
// ---------------------------------------------------------------------------
const I4_BASE = "Consolidated Zeta Amount for such period";
const I4_ADD = "the amount of pro forma cost savings reasonably identifiable and factually supportable";
const I4_CAP = "the aggregate amount added back pursuant to clause (a) shall not exceed 20% of Adjusted Zeta Amount for such period";
const I4: Scenario = {
  id: "I4",
  title: "capped addback",
  text: agreement(DEFS_HEAD + `"Adjusted Zeta Amount" means, for any period, ${I4_BASE} plus (a) ${I4_ADD}; provided that ${I4_CAP}.`),
  anchorRef: "1.01",
  items: [
    item("base", "FORMULA_COMPONENT", I4_BASE, "CRITICAL", { operative: "DEFINITIONAL" }),
    item("add", "FORMULA_COMPONENT", I4_ADD, "MATERIAL", { operative: "DEFINITIONAL" }),
    item("cap", "THRESHOLD", I4_CAP, "CRITICAL", { operative: "DEFINITIONAL", values: [pct("20%", 0.2)] }),
  ],
  compose: (id) => submission({ definitions: [def("d1", "Adjusted Zeta Amount", SUM([TERM("Consolidated Zeta Amount", "MONEY", [id("base")]), MIN([METRIC("pro forma cost savings", "MONEY", [id("add")]), MUL([P(0.2), TERM("Adjusted Zeta Amount")], [id("cap")])])]), ["Consolidated Zeta Amount"])] }),
  expectedContextState: "COMPLETE_LOCAL_SOURCE",
  expectSemanticallyComplete: true,
};

// ---------------------------------------------------------------------------
// I5 - nested proviso
// ---------------------------------------------------------------------------
const I5_PERM = "Investments in Joint Ventures in an aggregate amount not to exceed $40,000,000";
const I5_C1 = "no Default has occurred and is continuing";
const I5_C2 = "if the Total Leverage Ratio exceeds 4.00 to 1.00, such amount shall not exceed $20,000,000";
const I5: Scenario = {
  id: "I5",
  title: "nested proviso",
  text: agreement(COV_HEAD + `SECTION 7.06 Investments. The Borrower may make ${I5_PERM}; provided that ${I5_C1}; provided further that, ${I5_C2}.`),
  anchorRef: "7.06",
  items: [
    item("perm", "PERMISSION", I5_PERM, "CRITICAL", { values: [money("$40,000,000", 40_000_000)] }),
    item("c1", "CONDITION", I5_C1, "MATERIAL"),
    item("c2", "ALTERNATIVE", I5_C2, "CRITICAL", { values: [ratio("4.00 to 1.00", 4), money("$20,000,000", 20_000_000)] }),
  ],
  compose: (id) =>
    submission({
      rules: [rule("r1", "7.06", { covenantFamily: "INVESTMENTS", action: "MAKE_INVESTMENT", capacityExpression: IF(CMP("GT", TERM("Total Leverage Ratio", "RATIO"), R(4)), M(20_000_000), M(40_000_000, [id("perm")]), [id("c2")]), conditions: [cond("NO_DEFAULT", I5_C1, null, [id("c1")])] })],
    }),
  expectedContextState: "COMPLETE_LOCAL_SOURCE",
  expectSemanticallyComplete: true,
};

// ---------------------------------------------------------------------------
// I6 - debt fixed baskets (parametrized: section number + clause order for I37/I38)
// ---------------------------------------------------------------------------
const I6_LEAD = "The Borrower will not, and will not permit any Restricted Subsidiary to, create, incur or assume any Indebtedness, except";
const I6_A = "Indebtedness in an aggregate principal amount not to exceed $25,000,000 at any time outstanding";
const I6_B = "Indebtedness in respect of Capital Lease Obligations not to exceed $10,000,000 at any time outstanding";
function fixedBasketScenario(id: string, title: string, sectionRef: string, reversed: boolean): Scenario {
  const clauses = reversed ? [I6_B, I6_A] : [I6_A, I6_B];
  return {
    id,
    title,
    text: agreement(COV_HEAD + `SECTION ${sectionRef} Indebtedness. ${I6_LEAD}:\n(a) ${clauses[0]}; and\n(b) ${clauses[1]}.`),
    anchorRef: sectionRef,
    items: [
      item("lead", "PROHIBITION", I6_LEAD, "MATERIAL"),
      item("a", "PERMISSION", I6_A, "CRITICAL", { values: [money("$25,000,000", 25_000_000)] }),
      item("b", "PERMISSION", I6_B, "CRITICAL", { values: [money("$10,000,000", 10_000_000)] }),
    ],
    compose: (idOf) =>
      submission({
        rules: [
          rule("ra", sectionRef, { capacityExpression: M(25_000_000, [idOf("a")]) }, [idOf("lead")]),
          rule("rb", sectionRef, { capacityExpression: M(10_000_000, [idOf("b")]) }, [idOf("lead")]),
        ],
      }),
    expectedContextState: "COMPLETE_LOCAL_SOURCE",
    expectSemanticallyComplete: true,
  };
}
const I6 = fixedBasketScenario("I6", "debt fixed basket", "7.01", false);

// ---------------------------------------------------------------------------
// I7 - debt grower basket (parametrized metric name for I36)
// ---------------------------------------------------------------------------
function growerScenario(id: string, title: string, metricName: string): Scenario {
  const A = `Indebtedness in an aggregate principal amount not to exceed the greater of $30,000,000 and 12% of ${metricName}`;
  return {
    id,
    title,
    text: agreement(COV_HEAD + `SECTION 7.01 Indebtedness. ${I6_LEAD}:\n(a) ${A}.`),
    anchorRef: "7.01",
    items: [item("lead", "PROHIBITION", I6_LEAD, "MATERIAL"), item("a", "PERMISSION", A, "CRITICAL", { values: [money("$30,000,000", 30_000_000), pct("12%", 0.12)], referencedTerms: [metricName] })],
    compose: (idOf) => submission({ rules: [rule("ra", "7.01", { capacityExpression: MAX([M(30_000_000), MUL([P(0.12), METRIC(metricName)])], [idOf("a")]) }, [idOf("lead")])] }),
    expectedContextState: "COMPLETE_LOCAL_SOURCE",
    expectSemanticallyComplete: true,
  };
}
const I7 = growerScenario("I7", "debt grower basket", "Consolidated Zeta Amount");

// ---------------------------------------------------------------------------
// I8 - debt ratio basket
// ---------------------------------------------------------------------------
const I8_A = "Indebtedness so long as, after giving pro forma effect to the incurrence thereof, the Total Leverage Ratio does not exceed 4.50 to 1.00";
const I8: Scenario = {
  id: "I8",
  title: "debt ratio basket",
  text: agreement(COV_HEAD + `SECTION 7.01 Indebtedness. ${I6_LEAD}:\n(a) ${I8_A}.`),
  anchorRef: "7.01",
  items: [item("lead", "PROHIBITION", I6_LEAD, "MATERIAL"), item("a", "PERMISSION", I8_A, "CRITICAL", { values: [ratio("4.50 to 1.00", 4.5)], referencedTerms: ["Total Leverage Ratio"] })],
  compose: (id) => submission({ rules: [rule("ra", "7.01", { capacityExpression: UNLIMITED(CMP("LTE", TERM("Total Leverage Ratio", "RATIO"), R(4.5)), [id("a")]), conditions: [cond("RATIO_SATISFIED", "pro forma Total Leverage Ratio not to exceed 4.50 to 1.00", CMP("LTE", TERM("Total Leverage Ratio", "RATIO"), R(4.5)))] }, [id("lead")])] }),
  expectedContextState: "COMPLETE_LOCAL_SOURCE",
  expectSemanticallyComplete: true,
};

// ---------------------------------------------------------------------------
// I9 - refinancing debt
// ---------------------------------------------------------------------------
const I9_B = "Indebtedness incurred to refinance Indebtedness permitted under clause (a) above";
const I9_C = "the principal amount thereof does not exceed the principal amount so refinanced plus accrued interest, premiums and fees not to exceed $2,000,000";
const I9: Scenario = {
  id: "I9",
  title: "refinancing debt",
  text: agreement(COV_HEAD + `SECTION 7.01 Indebtedness. ${I6_LEAD}:\n(a) ${I6_A}; and\n(b) ${I9_B}; provided that ${I9_C}.`),
  anchorRef: "7.01",
  items: [
    item("lead", "PROHIBITION", I6_LEAD, "MATERIAL"),
    item("a", "PERMISSION", I6_A, "CRITICAL", { values: [money("$25,000,000", 25_000_000)] }),
    item("b", "PERMISSION", I9_B, "CRITICAL"),
    item("bdep", "DEPENDENCY", "permitted under clause (a) above", "MATERIAL", { referencedSections: ["clause (a)"] }),
    item("bc", "CONDITION", I9_C, "CRITICAL", { values: [money("$2,000,000", 2_000_000)] }),
  ],
  compose: (id) =>
    submission({
      rules: [
        rule("ra", "7.01", { capacityExpression: M(25_000_000, [id("a")]) }, [id("lead")]),
        rule("rb", "7.01", { capacityExpression: SUM([INPUT("principal amount refinanced"), M(2_000_000)], [id("bc")]), dependsOn: [dep("REQUIRES", "ra", "refinances Indebtedness permitted under clause (a)", [id("bdep")])], conditions: [cond("REFINANCING_CONTEXT", "refinancing of Indebtedness permitted under clause (a)", null)] }, [id("b")]),
      ],
    }),
  expectedContextState: "COMPLETE_LOCAL_SOURCE",
  expectSemanticallyComplete: true,
};

// ---------------------------------------------------------------------------
// I10 - lien tied to a debt permission in ANOTHER section (cross-unit)
// ---------------------------------------------------------------------------
const I10_LEAD = "The Borrower will not create or permit to exist any Lien on any property, except";
const I10_A = "Liens securing Indebtedness permitted under Section 7.01(a)";
const I10_B = "Liens not otherwise permitted hereunder securing obligations not to exceed $3,000,000 at any time outstanding";
const I10_DOC = agreement(COV_HEAD + `SECTION 7.01 Indebtedness. ${I6_LEAD}:\n(a) ${I6_A}.`, `SECTION 7.02 Liens. ${I10_LEAD}:\n(a) ${I10_A}; and\n(b) ${I10_B}.`);
const I10: Scenario = {
  id: "I10",
  title: "lien tied to debt permission",
  text: I10_DOC,
  anchorRef: "7.02",
  items: [
    item("lead", "PROHIBITION", I10_LEAD, "MATERIAL"),
    item("a", "PERMISSION", I10_A, "CRITICAL"),
    item("adep", "DEPENDENCY", "permitted under Section 7.01(a)", "CRITICAL", { referencedSections: ["Section 7.01(a)"] }),
    item("b", "PERMISSION", I10_B, "CRITICAL", { values: [money("$3,000,000", 3_000_000)] }),
  ],
  compose: (id) =>
    submission({
      rules: [
        rule("ra", "7.02", { covenantFamily: "LIENS", action: "GRANT_LIEN", capacityExpression: null, sufficiency: "PARTIAL", sufficiencyReasons: ["capacity is the debt permission in Section 7.01(a), compiled in another unit"], dependsOn: [dep("LIMITED_BY", "Section 7.01(a)", "Liens limited to Indebtedness permitted under Section 7.01(a)", [id("adep")])] }, [id("lead"), id("a")]),
        rule("rb", "7.02", { covenantFamily: "LIENS", action: "GRANT_LIEN", capacityExpression: M(3_000_000, [id("b")]) }, [id("lead")]),
      ],
    }),
  expectedContextState: "DEPENDENCY_EXPANDED_SOURCE",
  expectSemanticallyComplete: true,
  expectedAmbiguousRefs: ["adep"],
  expectedUnresolvedDependencies: 1,
};

// ---------------------------------------------------------------------------
// I11 - ratio lien
// ---------------------------------------------------------------------------
const I11_A = "Liens securing Indebtedness so long as, after giving pro forma effect thereto, the Senior Secured Leverage Ratio does not exceed 2.75 to 1.00";
const I11: Scenario = {
  id: "I11",
  title: "ratio lien",
  text: agreement(COV_HEAD + `SECTION 7.02 Liens. ${I10_LEAD}:\n(a) ${I11_A}.`),
  anchorRef: "7.02",
  items: [item("lead", "PROHIBITION", I10_LEAD, "MATERIAL"), item("a", "PERMISSION", I11_A, "CRITICAL", { values: [ratio("2.75 to 1.00", 2.75)], referencedTerms: ["Senior Secured Leverage Ratio"] })],
  compose: (id) => submission({ rules: [rule("ra", "7.02", { covenantFamily: "LIENS", action: "GRANT_LIEN", capacityExpression: UNLIMITED(CMP("LTE", TERM("Senior Secured Leverage Ratio", "RATIO"), R(2.75)), [id("a")]) }, [id("lead")])] }),
  expectedContextState: "COMPLETE_LOCAL_SOURCE",
  expectSemanticallyComplete: true,
};

// ---------------------------------------------------------------------------
// I12 - RP builder basket
// ---------------------------------------------------------------------------
const I12_LEAD = "The Borrower will not declare or make any Restricted Payment, except";
const I12_A = "Restricted Payments in an aggregate amount not to exceed the sum of (i) $15,000,000 plus (ii) 50% of Consolidated Net Income accrued during the period from January 1, 2026 to the date of such Restricted Payment plus (iii) the net cash proceeds of Qualified Equity Issuances received after the Closing Date";
const I12_C1 = "no Default has occurred and is continuing";
const I12_C2 = "the Fixed Charge Coverage Ratio is not less than 2.00 to 1.00";
const I12: Scenario = {
  id: "I12",
  title: "RP builder",
  text: agreement(COV_HEAD + `SECTION 7.05 Restricted Payments. ${I12_LEAD}:\n(a) ${I12_A}; provided that ${I12_C1} and ${I12_C2}.`),
  anchorRef: "7.05",
  items: [
    item("lead", "PROHIBITION", I12_LEAD, "MATERIAL"),
    item("a", "PERMISSION", I12_A, "CRITICAL", { values: [money("$15,000,000", 15_000_000), pct("50%", 0.5), date("January 1, 2026")] }),
    item("c1", "CONDITION", I12_C1, "MATERIAL"),
    item("c2", "CONDITION", I12_C2, "CRITICAL", { values: [ratio("2.00 to 1.00", 2)] }),
  ],
  compose: (id) =>
    submission({
      rules: [rule("ra", "7.05", { covenantFamily: "RESTRICTED_PAYMENTS", action: "MAKE_RESTRICTED_PAYMENT", capacityExpression: SUM([M(15_000_000), MUL([P(0.5), DURING("the period from January 1, 2026 to the date of such Restricted Payment", TERM("Consolidated Net Income"))]), INPUT("net cash proceeds of Qualified Equity Issuances")], [id("a")]), conditions: [cond("NO_DEFAULT", I12_C1, null, [id("c1")]), cond("RATIO_SATISFIED", I12_C2, CMP("GTE", TERM("Fixed Charge Coverage Ratio", "RATIO"), R(2)), [id("c2")])] }, [id("lead")])],
    }),
  expectedContextState: "COMPLETE_LOCAL_SOURCE",
  expectSemanticallyComplete: true,
};

// ---------------------------------------------------------------------------
// I13 - RP fixed basket / I14 - RP ratio basket
// ---------------------------------------------------------------------------
const I13_A = "other Restricted Payments in an aggregate amount not to exceed $12,500,000";
const I13: Scenario = {
  id: "I13",
  title: "RP fixed basket",
  text: agreement(COV_HEAD + `SECTION 7.05 Restricted Payments. ${I12_LEAD}:\n(a) ${I13_A}.`),
  anchorRef: "7.05",
  items: [item("lead", "PROHIBITION", I12_LEAD, "MATERIAL"), item("a", "PERMISSION", I13_A, "CRITICAL", { values: [money("$12,500,000", 12_500_000)] })],
  compose: (id) => submission({ rules: [rule("ra", "7.05", { covenantFamily: "RESTRICTED_PAYMENTS", action: "MAKE_RESTRICTED_PAYMENT", capacityExpression: M(12_500_000, [id("a")]) }, [id("lead")])] }),
  expectedContextState: "COMPLETE_LOCAL_SOURCE",
  expectSemanticallyComplete: true,
};
const I14_A = "Restricted Payments so long as, after giving pro forma effect thereto, the Total Leverage Ratio does not exceed 3.25 to 1.00";
const I14: Scenario = {
  id: "I14",
  title: "RP ratio basket",
  text: agreement(COV_HEAD + `SECTION 7.05 Restricted Payments. ${I12_LEAD}:\n(a) ${I14_A}.`),
  anchorRef: "7.05",
  items: [item("lead", "PROHIBITION", I12_LEAD, "MATERIAL"), item("a", "PERMISSION", I14_A, "CRITICAL", { values: [ratio("3.25 to 1.00", 3.25)] })],
  compose: (id) => submission({ rules: [rule("ra", "7.05", { covenantFamily: "RESTRICTED_PAYMENTS", action: "MAKE_RESTRICTED_PAYMENT", capacityExpression: UNLIMITED(CMP("LTE", TERM("Total Leverage Ratio", "RATIO"), R(3.25)), [id("a")]) }, [id("lead")])] }),
  expectedContextState: "COMPLETE_LOCAL_SOURCE",
  expectSemanticallyComplete: true,
};

// ---------------------------------------------------------------------------
// I15 - investment basket with an exception
// ---------------------------------------------------------------------------
const I15_LEAD = "The Borrower will not make any Investment, except";
const I15_A = "Investments in an aggregate amount not to exceed the greater of $35,000,000 and 8% of Consolidated Total Assets";
const I15_X = "other than Investments in Unrestricted Subsidiaries";
const I15: Scenario = {
  id: "I15",
  title: "investment basket",
  text: agreement(COV_HEAD + `SECTION 7.06 Investments. ${I15_LEAD}:\n(a) ${I15_A} (${I15_X}).`),
  anchorRef: "7.06",
  items: [item("lead", "PROHIBITION", I15_LEAD, "MATERIAL"), item("a", "PERMISSION", I15_A, "CRITICAL", { values: [money("$35,000,000", 35_000_000), pct("8%", 0.08)] }), item("x", "EXCEPTION", I15_X, "MATERIAL")],
  compose: (id) => submission({ rules: [rule("ra", "7.06", { covenantFamily: "INVESTMENTS", action: "MAKE_INVESTMENT", capacityExpression: MAX([M(35_000_000), MUL([P(0.08), METRIC("Consolidated Total Assets")])], [id("a")]), exceptions: [exc(I15_X, null, [], [id("x")])] }, [id("lead")])] }),
  expectedContextState: "COMPLETE_LOCAL_SOURCE",
  expectSemanticallyComplete: true,
};

// ---------------------------------------------------------------------------
// I16 - permitted acquisition conditions
// ---------------------------------------------------------------------------
const I16_PERM = "The Borrower may consummate Permitted Acquisitions";
const I16_C1 = "no Default shall have occurred and be continuing or would result therefrom";
const I16_C2 = "after giving pro forma effect thereto the Total Leverage Ratio shall not exceed 4.00 to 1.00";
const I16_C3 = "the Borrower shall have delivered a certificate at least five (5) Business Days prior to the consummation thereof";
const I16_C4 = "the aggregate consideration for acquisitions of Persons that do not become Loan Parties shall not exceed $50,000,000";
const I16: Scenario = {
  id: "I16",
  title: "permitted acquisition conditions",
  text: agreement(COV_HEAD + `SECTION 7.07 Acquisitions. ${I16_PERM}; provided that (a) ${I16_C1}; (b) ${I16_C2}; (c) ${I16_C3}; and (d) ${I16_C4}.`),
  anchorRef: "7.07",
  items: [
    item("perm", "PERMISSION", I16_PERM, "CRITICAL"),
    item("c1", "CONDITION", I16_C1, "MATERIAL"),
    item("c2", "CONDITION", I16_C2, "CRITICAL", { values: [ratio("4.00 to 1.00", 4)] }),
    item("c3", "CONDITION", I16_C3, "MATERIAL", { values: [days("five (5) Business Days", 5)] }),
    item("c4", "CONDITION", I16_C4, "CRITICAL", { values: [money("$50,000,000", 50_000_000)] }),
  ],
  compose: (id) =>
    submission({
      rules: [rule("ra", "7.07", { covenantFamily: "ACQUISITIONS", action: "MAKE_ACQUISITION", capacityExpression: UNLIMITED(null), conditions: [cond("NO_DEFAULT", I16_C1, null, [id("c1")]), cond("RATIO_SATISFIED", I16_C2, CMP("LTE", TERM("Total Leverage Ratio", "RATIO"), R(4)), [id("c2")]), cond("TIME_PERIOD", I16_C3, null, [id("c3")]), cond("AMOUNT_THRESHOLD", I16_C4, CMP("LTE", INPUT("aggregate consideration for non-Loan Party acquisitions"), M(50_000_000)), [id("c4")])] }, [id("perm")])],
    }),
  expectedContextState: "COMPLETE_LOCAL_SOURCE",
  expectSemanticallyComplete: true,
};

// ---------------------------------------------------------------------------
// I17 - unrestricted subsidiary investment with a non-computational requirement
// ---------------------------------------------------------------------------
const I17_A = "Investments in Unrestricted Subsidiaries in an aggregate amount not to exceed $8,000,000 at any time outstanding";
const I17_REQ = "no Unrestricted Subsidiary shall own any Equity Interests of the Borrower";
const I17: Scenario = {
  id: "I17",
  title: "unrestricted subsidiary investment",
  text: agreement(COV_HEAD + `SECTION 7.06 Investments. ${I15_LEAD}:\n(a) ${I17_A}; provided that ${I17_REQ}.`),
  anchorRef: "7.06",
  items: [item("lead", "PROHIBITION", I15_LEAD, "MATERIAL"), item("a", "PERMISSION", I17_A, "CRITICAL", { values: [money("$8,000,000", 8_000_000)] }), item("req", "REQUIREMENT", I17_REQ, "MATERIAL")],
  compose: (id) => submission({ rules: [rule("ra", "7.06", { covenantFamily: "INVESTMENTS", action: "MAKE_INVESTMENT", capacityExpression: M(8_000_000, [id("a")]) }, [id("lead")])], inventoryDispositions: [{ inventoryItemId: id("req"), disposition: "INTENTIONALLY_NON_COMPUTATIONAL", note: "ownership prohibition on the investee - a qualitative requirement with no capacity mechanics" }] }),
  expectedContextState: "COMPLETE_LOCAL_SOURCE",
  expectSemanticallyComplete: true,
  expectedNonComputationalRefs: ["req"],
};

// ---------------------------------------------------------------------------
// I18 - asset-sale permission / I19 - reinvestment condition / I20 - mandatory prepayment
// ---------------------------------------------------------------------------
const I18_LEAD = "The Borrower will not make any Disposition, except";
const I18_A = "Dispositions for fair market value";
const I18_C1 = "at least 75% of the consideration therefor is paid in cash";
const I18_C2 = "the aggregate fair market value of all assets Disposed of in reliance on this clause shall not exceed $60,000,000 in any fiscal year";
const I18: Scenario = {
  id: "I18",
  title: "asset-sale permission",
  text: agreement(COV_HEAD + `SECTION 7.04 Dispositions. ${I18_LEAD}:\n(a) ${I18_A}; provided that (i) ${I18_C1} and (ii) ${I18_C2}.`),
  anchorRef: "7.04",
  items: [item("lead", "PROHIBITION", I18_LEAD, "MATERIAL"), item("a", "PERMISSION", I18_A, "CRITICAL"), item("c1", "CONDITION", I18_C1, "CRITICAL", { values: [pct("75%", 0.75)] }), item("c2", "THRESHOLD", I18_C2, "CRITICAL", { values: [money("$60,000,000", 60_000_000)] })],
  compose: (id) => submission({ rules: [rule("ra", "7.04", { covenantFamily: "ASSET_SALES", action: "DISPOSE_ASSETS", capacityExpression: DURING("any fiscal year", M(60_000_000), [id("c2")]), conditions: [cond("AMOUNT_THRESHOLD", I18_C1, CMP("GTE", INPUT("cash consideration"), MUL([P(0.75), INPUT("total consideration")])), [id("c1")])] }, [id("lead"), id("a")])] }),
  expectedContextState: "COMPLETE_LOCAL_SOURCE",
  expectSemanticallyComplete: true,
};

const I19_REQ = "the Borrower shall apply the Net Proceeds of such Disposition to prepay the Loans";
const I19_ALT = "unless the Borrower reinvests such Net Proceeds in assets useful in its business within 365 days after receipt thereof";
const I19_T = "if the Borrower has committed to reinvest within such period, within 180 days after the end of such period";
const I19: Scenario = {
  id: "I19",
  title: "reinvestment condition",
  text: agreement(`ARTICLE II\nTHE CREDITS\n\nSECTION 2.11 Mandatory Prepayments. Within three (3) Business Days after receipt of Net Proceeds of any Disposition in excess of $4,000,000, ${I19_REQ}, ${I19_ALT} (or, ${I19_T}).`),
  anchorRef: "2.11",
  items: [
    item("trig", "TRIGGER", "receipt of Net Proceeds of any Disposition in excess of $4,000,000", "CRITICAL", { values: [money("$4,000,000", 4_000_000)] }),
    item("time", "TIME_PERIOD", "Within three (3) Business Days after receipt", "MATERIAL", { values: [days("three (3) Business Days", 3)] }),
    item("req", "REQUIREMENT", I19_REQ, "CRITICAL"),
    item("alt", "ALTERNATIVE", I19_ALT, "CRITICAL", { values: [days("365 days", 365)] }),
    item("t2", "TIME_PERIOD", I19_T, "MATERIAL", { values: [days("180 days", 180)] }),
  ],
  compose: (id) =>
    submission({
      rules: [rule("ra", "2.11", { covenantFamily: "MANDATORY_PREPAYMENTS", ruleType: "MANDATORY_ACTION", posture: "OBLIGATION", action: "PREPAY_DEBT", capacityExpression: INPUT("Net Proceeds of such Disposition", [id("req")]), conditions: [cond("AMOUNT_THRESHOLD", "Net Proceeds of any Disposition in excess of $4,000,000", CMP("GT", INPUT("Net Proceeds"), M(4_000_000)), [id("trig")]), cond("TIME_PERIOD", "Within three (3) Business Days after receipt", null, [id("time")]), cond("REINVESTMENT_PERIOD", "reinvestment within 365 days after receipt thereof", null, [id("alt")]), cond("REINVESTMENT_PERIOD", "if committed within such period, within 180 days after the end of such period", null, [id("t2")])] })],
    }),
  expectedContextState: "COMPLETE_LOCAL_SOURCE",
  expectSemanticallyComplete: true,
};

const I20_REQ = "the Borrower shall prepay the Loans in an amount equal to 50% of Excess Cash Flow for such fiscal year";
const I20_STEP = "such percentage shall be reduced to 25% if the Total Leverage Ratio is less than or equal to 3.00 to 1.00 and to 0% if the Total Leverage Ratio is less than or equal to 2.50 to 1.00";
const I20_TIME = "within five (5) Business Days after the date on which annual financial statements are delivered";
const I20: Scenario = {
  id: "I20",
  title: "mandatory prepayment",
  text: agreement(`ARTICLE II\nTHE CREDITS\n\nSECTION 2.11 Mandatory Prepayments. Commencing with the fiscal year ending December 31, 2026, ${I20_TIME}, ${I20_REQ}; provided that ${I20_STEP}.`),
  anchorRef: "2.11",
  items: [
    item("start", "TIME_PERIOD", "Commencing with the fiscal year ending December 31, 2026", "MATERIAL", { values: [date("December 31, 2026")] }),
    item("time", "TIME_PERIOD", I20_TIME, "MATERIAL", { values: [days("five (5) Business Days", 5)] }),
    item("req", "REQUIREMENT", I20_REQ, "CRITICAL", { values: [pct("50%", 0.5)] }),
    item("step", "ALTERNATIVE", I20_STEP, "CRITICAL", { values: [pct("25%", 0.25), ratio("3.00 to 1.00", 3), pct("0%", 0), ratio("2.50 to 1.00", 2.5)] }),
  ],
  compose: (id) =>
    submission({
      rules: [rule("ra", "2.11", { covenantFamily: "MANDATORY_PREPAYMENTS", ruleType: "MANDATORY_ACTION", posture: "OBLIGATION", action: "PREPAY_DEBT", capacityExpression: MUL([IF(CMP("LTE", TERM("Total Leverage Ratio", "RATIO"), R(2.5)), P(0), IF(CMP("LTE", TERM("Total Leverage Ratio", "RATIO"), R(3)), P(0.25), P(0.5, [id("req")])), [id("step")]), METRIC("Excess Cash Flow")]), conditions: [cond("TIME_PERIOD", I20_TIME, null, [id("time")]), cond("TIME_PERIOD", "Commencing with the fiscal year ending December 31, 2026", null, [id("start")])] })],
    }),
  expectedContextState: "COMPLETE_LOCAL_SOURCE",
  expectSemanticallyComplete: true,
};

// ---------------------------------------------------------------------------
// I21 - junior-debt payment restriction
// ---------------------------------------------------------------------------
const I21_LEAD = "The Borrower will not make any payment of principal of Junior Debt prior to its scheduled maturity, except";
const I21_A = "payments in an aggregate amount not to exceed $5,500,000";
const I21_B = "payments made with the net cash proceeds of Qualified Equity Issuances";
const I21: Scenario = {
  id: "I21",
  title: "junior-debt payment restriction",
  text: agreement(COV_HEAD + `SECTION 7.08 Payments of Junior Debt. ${I21_LEAD}:\n(a) ${I21_A}; and\n(b) ${I21_B}.`),
  anchorRef: "7.08",
  items: [item("lead", "PROHIBITION", I21_LEAD, "CRITICAL"), item("a", "PERMISSION", I21_A, "CRITICAL", { values: [money("$5,500,000", 5_500_000)] }), item("b", "PERMISSION", I21_B, "CRITICAL")],
  compose: (id) =>
    submission({
      rules: [
        rule("ra", "7.08", { covenantFamily: "RESTRICTED_PAYMENTS", action: "PREPAY_JUNIOR_DEBT", capacityExpression: M(5_500_000, [id("a")]) }, [id("lead")]),
        rule("rb", "7.08", { covenantFamily: "RESTRICTED_PAYMENTS", action: "PREPAY_JUNIOR_DEBT", capacityExpression: INPUT("net cash proceeds of Qualified Equity Issuances", [id("b")]), conditions: [cond("PURPOSE", "funded with net cash proceeds of Qualified Equity Issuances", null)] }),
      ],
    }),
  expectedContextState: "COMPLETE_LOCAL_SOURCE",
  expectSemanticallyComplete: true,
};

// ---------------------------------------------------------------------------
// I22 leverage covenant / I23 springing / I24 stepped
// ---------------------------------------------------------------------------
const I22_REQ = "The Borrower will not permit the Total Leverage Ratio as of the last day of any fiscal quarter to exceed 4.25 to 1.00";
const I22: Scenario = {
  id: "I22",
  title: "leverage covenant",
  text: agreement(COV_HEAD + `SECTION 7.10 Financial Covenant. ${I22_REQ}.`),
  anchorRef: "7.10",
  items: [item("req", "REQUIREMENT", I22_REQ, "CRITICAL", { values: [ratio("4.25 to 1.00", 4.25)] }), item("time", "TIME_PERIOD", "as of the last day of any fiscal quarter", "MATERIAL")],
  compose: (id) => submission({ rules: [rule("ra", "7.10", { covenantFamily: "FINANCIAL_COVENANTS", ruleType: "RATIO_TEST", posture: "OBLIGATION", action: null, capacityExpression: CMP("LTE", TERM("Total Leverage Ratio", "RATIO"), R(4.25), [id("req")]), conditions: [cond("TIME_PERIOD", "tested as of the last day of any fiscal quarter", null, [id("time")])] })] }),
  expectedContextState: "COMPLETE_LOCAL_SOURCE",
  expectSemanticallyComplete: true,
};

const I23_TRIG = "if Revolving Exposure exceeds 35% of the aggregate Revolving Commitments as of the last day of any fiscal quarter";
const I23_REQ = "the Borrower will not permit the Total Leverage Ratio as of such day to exceed 5.00 to 1.00";
const I23: Scenario = {
  id: "I23",
  title: "springing covenant",
  text: agreement(COV_HEAD + `SECTION 7.10 Springing Financial Covenant. Solely ${I23_TRIG}, ${I23_REQ}.`),
  anchorRef: "7.10",
  items: [item("trig", "TRIGGER", I23_TRIG, "CRITICAL", { values: [pct("35%", 0.35)] }), item("req", "REQUIREMENT", I23_REQ, "CRITICAL", { values: [ratio("5.00 to 1.00", 5)] })],
  compose: (id) => submission({ rules: [rule("ra", "7.10", { covenantFamily: "SPRINGING_COVENANTS", ruleType: "CONDITIONAL_ACTIVATION", posture: "OBLIGATION", action: null, capacityExpression: CMP("LTE", TERM("Total Leverage Ratio", "RATIO"), R(5), [id("req")]), conditions: [cond("AMOUNT_THRESHOLD", I23_TRIG, CMP("GT", METRIC("Revolving Exposure"), MUL([P(0.35), METRIC("Revolving Commitments")])), [id("trig")])] })] }),
  expectedContextState: "COMPLETE_LOCAL_SOURCE",
  expectSemanticallyComplete: true,
};

const I24_A = "5.00 to 1.00 for any fiscal quarter ending on or before December 31, 2026";
const I24_B = "4.50 to 1.00 for any fiscal quarter ending after December 31, 2026 and on or before December 31, 2027";
const I24_C = "4.00 to 1.00 for any fiscal quarter ending thereafter";
const I24: Scenario = {
  id: "I24",
  title: "stepped covenant",
  text: agreement(COV_HEAD + `SECTION 7.10 Financial Covenant. The Borrower will not permit the Total Leverage Ratio as of the last day of any fiscal quarter to exceed (a) ${I24_A}, (b) ${I24_B} and (c) ${I24_C}.`),
  anchorRef: "7.10",
  items: [
    item("lead", "REQUIREMENT", "The Borrower will not permit the Total Leverage Ratio as of the last day of any fiscal quarter to exceed", "CRITICAL"),
    item("s1", "THRESHOLD", I24_A, "CRITICAL", { values: [ratio("5.00 to 1.00", 5), date("December 31, 2026")] }),
    item("s2", "THRESHOLD", I24_B, "CRITICAL", { values: [ratio("4.50 to 1.00", 4.5), date("December 31, 2026"), date("December 31, 2027")] }),
    item("s3", "THRESHOLD", I24_C, "CRITICAL", { values: [ratio("4.00 to 1.00", 4)] }),
  ],
  compose: (id) =>
    submission({
      rules: [rule("ra", "7.10", { covenantFamily: "FINANCIAL_COVENANTS", ruleType: "RATIO_TEST", posture: "OBLIGATION", action: null, capacityExpression: CMP("LTE", TERM("Total Leverage Ratio", "RATIO"), SCHEDULE([
        { from: null, to: "2026-12-31", value: R(5), description: I24_A },
        { from: "2026-12-31", to: "2027-12-31", value: R(4.5), description: I24_B },
        { from: "2027-12-31", to: null, value: R(4), description: I24_C },
      ]), [id("lead"), id("s1"), id("s2"), id("s3")]) })],
    }),
  expectedContextState: "COMPLETE_LOCAL_SOURCE",
  expectSemanticallyComplete: true,
};

// ---------------------------------------------------------------------------
// I25 reporting deadline / I26 event notice / I27 cure right
// ---------------------------------------------------------------------------
const I25_A = "within ninety (90) days after the end of each fiscal year, audited consolidated financial statements";
const I25_B = "within forty-five (45) days after the end of each of the first three fiscal quarters of each fiscal year, unaudited consolidated financial statements";
const I25: Scenario = {
  id: "I25",
  title: "reporting deadline",
  text: agreement(`ARTICLE VI\nAFFIRMATIVE COVENANTS\n\nSECTION 6.01 Financial Statements. The Borrower will furnish to the Administrative Agent:\n(a) ${I25_A}; and\n(b) ${I25_B}.`),
  anchorRef: "6.01",
  items: [item("a", "REQUIREMENT", I25_A, "CRITICAL", { values: [days("ninety (90) days", 90)] }), item("b", "REQUIREMENT", I25_B, "CRITICAL", { values: [days("forty-five (45) days", 45), period("three fiscal quarters", 3)] })],
  compose: (id) =>
    submission({
      rules: [
        rule("ra", "6.01", { covenantFamily: "REPORTING_INFORMATION", ruleType: "REPORTING_OBLIGATION", posture: "OBLIGATION", action: null, capacityExpression: null, conditions: [cond("TIME_PERIOD", I25_A, null, [id("a")])] }),
        rule("rb", "6.01", { covenantFamily: "REPORTING_INFORMATION", ruleType: "REPORTING_OBLIGATION", posture: "OBLIGATION", action: null, capacityExpression: null, conditions: [cond("TIME_PERIOD", I25_B, null, [id("b")])] }),
      ],
    }),
  expectedContextState: "COMPLETE_LOCAL_SOURCE",
  expectSemanticallyComplete: true,
};

const I26_TIME = "within three (3) Business Days after any Responsible Officer obtains knowledge thereof";
const I26_T1 = "the occurrence of any Default";
const I26_T2 = "any ERISA Event that could reasonably be expected to result in liability in excess of $1,250,000";
const I26: Scenario = {
  id: "I26",
  title: "event notice",
  text: agreement(`ARTICLE VI\nAFFIRMATIVE COVENANTS\n\nSECTION 6.02 Notices. The Borrower will furnish written notice to the Administrative Agent ${I26_TIME} of (a) ${I26_T1} and (b) ${I26_T2}.`),
  anchorRef: "6.02",
  items: [item("time", "TIME_PERIOD", I26_TIME, "CRITICAL", { values: [days("three (3) Business Days", 3)] }), item("t1", "TRIGGER", I26_T1, "MATERIAL"), item("t2", "TRIGGER", I26_T2, "CRITICAL", { values: [money("$1,250,000", 1_250_000)] })],
  compose: (id) => submission({ rules: [rule("ra", "6.02", { covenantFamily: "REPORTING_INFORMATION", ruleType: "NOTICE_OBLIGATION", posture: "OBLIGATION", action: null, capacityExpression: null, conditions: [cond("TIME_PERIOD", I26_TIME, null, [id("time")]), cond("OTHER_RULE_SATISFIED", I26_T1, null, [id("t1")]), cond("AMOUNT_THRESHOLD", I26_T2, CMP("GT", INPUT("ERISA Event liability"), M(1_250_000)), [id("t2")])] })] }),
  expectedContextState: "COMPLETE_LOCAL_SOURCE",
  expectSemanticallyComplete: true,
};

const I27_CURE = "the Borrower may receive cash equity contributions within ten (10) Business Days after the delivery of the relevant compliance certificate and apply the amount thereof to increase Consolidated Zeta Amount for the relevant period";
const I27_C1 = "no more than two (2) Equity Cures shall be made in any period of four consecutive fiscal quarters";
const I27_C2 = "no more than five (5) Equity Cures shall be made during the term of this Agreement";
const I27_C3 = "the amount of any Equity Cure shall not exceed the amount required to cause compliance";
const I27: Scenario = {
  id: "I27",
  title: "cure right",
  text: agreement(`ARTICLE VIII\nEVENTS OF DEFAULT\n\nSECTION 8.03 Equity Cure. Notwithstanding any failure to comply with Section 7.10, ${I27_CURE}; provided that (a) ${I27_C1}, (b) ${I27_C2} and (c) ${I27_C3}.`, COV_HEAD + `SECTION 7.10 Financial Covenant. ${I22_REQ}.`),
  anchorRef: "8.03",
  items: [item("cure", "CURE", I27_CURE, "CRITICAL", { values: [days("ten (10) Business Days", 10)] }), item("c1", "CONDITION", I27_C1, "CRITICAL", { values: [period("four consecutive fiscal quarters", 4)] }), item("c2", "CONDITION", I27_C2, "CRITICAL"), item("c3", "CONDITION", I27_C3, "MATERIAL"), item("dep", "DEPENDENCY", "any failure to comply with Section 7.10", "MATERIAL", { referencedSections: ["Section 7.10"] })],
  compose: (id) => submission({ rules: [rule("ra", "8.03", { covenantFamily: "FINANCIAL_COVENANTS", ruleType: "CONDITIONAL_ACTIVATION", posture: "PERMISSION", action: null, capacityExpression: null, conditions: [cond("TIME_PERIOD", I27_CURE, null, [id("cure")]), cond("OTHER_RULE_SATISFIED", I27_C1, null, [id("c1")]), cond("OTHER_RULE_SATISFIED", I27_C2, null, [id("c2")]), cond("AMOUNT_THRESHOLD", I27_C3, null, [id("c3")])], dependsOn: [dep("OVERRIDES", "Section 7.10", "cures a failure under Section 7.10", [id("dep")])] })] }),
  expectedContextState: "DEPENDENCY_EXPANDED_SOURCE",
  expectSemanticallyComplete: true,
  expectedAmbiguousRefs: ["dep"],
  expectedUnresolvedDependencies: 1,
};

// ---------------------------------------------------------------------------
// I28 shared cap between two rules / I29 shared cap across covenant families
// ---------------------------------------------------------------------------
const I28_D = "Indebtedness of Foreign Subsidiaries in an aggregate principal amount not to exceed $9,000,000";
const I28_E = "Indebtedness in respect of Capital Lease Obligations not to exceed $7,000,000";
const I28_CAP = "the aggregate principal amount of Indebtedness outstanding under clauses (d) and (e) shall not exceed $12,000,000 at any time";
const I28: Scenario = {
  id: "I28",
  title: "shared cap between two rules",
  text: agreement(COV_HEAD + `SECTION 7.01 Indebtedness. ${I6_LEAD}:\n(d) ${I28_D}; and\n(e) ${I28_E}; provided that ${I28_CAP}.`),
  anchorRef: "7.01",
  items: [item("lead", "PROHIBITION", I6_LEAD, "MATERIAL"), item("d", "PERMISSION", I28_D, "CRITICAL", { values: [money("$9,000,000", 9_000_000)] }), item("e", "PERMISSION", I28_E, "CRITICAL", { values: [money("$7,000,000", 7_000_000)] }), item("cap", "SHARED_CAP", I28_CAP, "CRITICAL", { values: [money("$12,000,000", 12_000_000)], referencedSections: ["clauses (d) and (e)"] })],
  compose: (id) =>
    submission({
      rules: [
        rule("rd", "7.01", { capacityExpression: MIN([M(9_000_000, [id("d")]), SUB(LEDGER("sc1"), INPUT("usage under clause (e)"))]), dependsOn: [dep("SHARES_CAPACITY_WITH", "re", "shares the $12,000,000 aggregate cap with clause (e)")] }, [id("lead")]),
        rule("re", "7.01", { capacityExpression: MIN([M(7_000_000, [id("e")]), SUB(LEDGER("sc1"), INPUT("usage under clause (d)"))]), dependsOn: [dep("SHARES_CAPACITY_WITH", "rd", "shares the $12,000,000 aggregate cap with clause (d)")] }, [id("lead")]),
      ],
      sharedCapacities: [shared("sc1", "aggregate cap on clauses (d) and (e)", M(12_000_000), ["rd", "re"], [id("cap")])],
    }),
  expectedContextState: "COMPLETE_LOCAL_SOURCE",
  expectSemanticallyComplete: true,
};

const I29_C = "Investments in Foreign Subsidiaries in an aggregate amount not to exceed $4,000,000";
const I29_CAP = "the aggregate amount of Indebtedness incurred under Section 7.01(f) and Investments made under this clause (c) shall not exceed $8,000,000 in the aggregate";
const I29: Scenario = {
  id: "I29",
  title: "shared cap across covenant families",
  text: agreement(COV_HEAD + `SECTION 7.01 Indebtedness. ${I6_LEAD}:\n(f) Indebtedness of Foreign Subsidiaries in an aggregate principal amount not to exceed $6,000,000.`, `SECTION 7.06 Investments. ${I15_LEAD}:\n(c) ${I29_C}; provided that ${I29_CAP}.`),
  anchorRef: "7.06",
  items: [item("lead", "PROHIBITION", I15_LEAD, "MATERIAL"), item("c", "PERMISSION", I29_C, "CRITICAL", { values: [money("$4,000,000", 4_000_000)] }), item("cap", "SHARED_CAP", I29_CAP, "CRITICAL", { values: [money("$8,000,000", 8_000_000)], referencedSections: ["Section 7.01(f)"] }), item("dep", "DEPENDENCY", "Indebtedness incurred under Section 7.01(f)", "CRITICAL", { referencedSections: ["Section 7.01(f)"] })],
  compose: (id) =>
    submission({
      rules: [rule("rc", "7.06", { covenantFamily: "INVESTMENTS", action: "MAKE_INVESTMENT", capacityExpression: MIN([M(4_000_000, [id("c")]), LEDGER("sc1")]), dependsOn: [dep("SHARES_CAPACITY_WITH", "Section 7.01(f)", "shares the $8,000,000 aggregate cap with the debt basket in Section 7.01(f)", [id("dep")])] }, [id("lead")])],
      sharedCapacities: [shared("sc1", "aggregate cap across Section 7.01(f) and Section 7.06(c)", M(8_000_000), ["rc"], [id("cap")])],
    }),
  expectedContextState: "DEPENDENCY_EXPANDED_SOURCE",
  expectSemanticallyComplete: true,
  expectedAmbiguousRefs: ["dep"],
  expectedUnresolvedDependencies: 1,
};

// ---------------------------------------------------------------------------
// I30 reclassification / I31 nested exception
// ---------------------------------------------------------------------------
const I30_H = "Indebtedness so long as the Total Leverage Ratio does not exceed 3.75 to 1.00";
const I30_RE = "the Borrower may, in its sole discretion, reclassify any Indebtedness incurred under clause (a) as incurred under clause (h) at any time so long as the Borrower would be permitted to incur such Indebtedness under clause (h) at such time";
const I30: Scenario = {
  id: "I30",
  title: "reclassification",
  text: agreement(COV_HEAD + `SECTION 7.01 Indebtedness. ${I6_LEAD}:\n(a) ${I6_A}; and\n(h) ${I30_H}; provided that ${I30_RE}.`),
  anchorRef: "7.01",
  items: [item("lead", "PROHIBITION", I6_LEAD, "MATERIAL"), item("a", "PERMISSION", I6_A, "CRITICAL", { values: [money("$25,000,000", 25_000_000)] }), item("h", "PERMISSION", I30_H, "CRITICAL", { values: [ratio("3.75 to 1.00", 3.75)] }), item("re", "RECLASSIFICATION", I30_RE, "CRITICAL", { referencedSections: ["clause (a)", "clause (h)"] })],
  compose: (id) =>
    submission({
      rules: [
        rule("ra", "7.01", { capacityExpression: M(25_000_000, [id("a")]), dependsOn: [dep("RECLASSIFIABLE_TO", "rh", "reclassifiable to clause (h) when the ratio test is met", [id("re")])] }, [id("lead")]),
        rule("rh", "7.01", { capacityExpression: UNLIMITED(CMP("LTE", TERM("Total Leverage Ratio", "RATIO"), R(3.75)), [id("h")]) }, [id("lead")]),
      ],
    }),
  expectedContextState: "COMPLETE_LOCAL_SOURCE",
  expectSemanticallyComplete: true,
};

const I31_LEAD = "The Borrower will not merge or consolidate with any other Person, except that";
const I31_X = "any Subsidiary may merge into the Borrower";
const I31_C = "the Borrower is the surviving entity";
const I31_XX = "in the case of a merger with a Loan Party, such Loan Party may be the surviving entity if it expressly assumes the Obligations";
const I31: Scenario = {
  id: "I31",
  title: "nested exception",
  text: agreement(COV_HEAD + `SECTION 7.03 Fundamental Changes. ${I31_LEAD} ${I31_X}; provided that ${I31_C}, except that, ${I31_XX}.`),
  anchorRef: "7.03",
  items: [item("lead", "PROHIBITION", I31_LEAD, "CRITICAL"), item("x", "EXCEPTION", I31_X, "CRITICAL"), item("c", "CONDITION", I31_C, "MATERIAL"), item("xx", "EXCEPTION", I31_XX, "MATERIAL")],
  compose: (id) =>
    submission({
      rules: [
        rule("rp", "7.03", { covenantFamily: "FUNDAMENTAL_CHANGES", ruleType: "PROHIBITION", posture: "PROHIBITION", action: "MERGE", capacityExpression: null, exceptions: [exc(I31_X, "rx", [cond("ENTITY_TYPE", I31_C, null, [id("c")])], [id("x")])] }, [id("lead")]),
        rule("rx", "7.03", { covenantFamily: "FUNDAMENTAL_CHANGES", ruleType: "EXCEPTION", posture: "PERMISSION", action: "MERGE", capacityExpression: UNLIMITED(null), exceptions: [exc(I31_XX, null, [], [id("xx")])] }),
      ],
    }),
  expectedContextState: "COMPLETE_LOCAL_SOURCE",
  expectSemanticallyComplete: true,
};

// ---------------------------------------------------------------------------
// I32 explicit section dependency / I33 dependency chain length 3 / I34 three sibling definitions
// ---------------------------------------------------------------------------
const I32_A = "Restricted Payments in an aggregate amount not to exceed $11,000,000";
const I32_C = "such Restricted Payment would be permitted as an Investment under Section 7.06(c)";
const I32: Scenario = {
  id: "I32",
  title: "explicit section dependency",
  text: agreement(COV_HEAD + `SECTION 7.05 Restricted Payments. ${I12_LEAD}:\n(a) ${I32_A}; provided that ${I32_C}.`, `SECTION 7.06 Investments. ${I15_LEAD}:\n(c) ${I29_C}.`),
  anchorRef: "7.05",
  items: [item("lead", "PROHIBITION", I12_LEAD, "MATERIAL"), item("a", "PERMISSION", I32_A, "CRITICAL", { values: [money("$11,000,000", 11_000_000)] }), item("dep", "DEPENDENCY", I32_C, "CRITICAL", { referencedSections: ["Section 7.06(c)"] })],
  compose: (id) => submission({ rules: [rule("ra", "7.05", { covenantFamily: "RESTRICTED_PAYMENTS", action: "MAKE_RESTRICTED_PAYMENT", capacityExpression: M(11_000_000, [id("a")]), dependsOn: [dep("REQUIRES", "Section 7.06(c)", "must also be permitted as an Investment under Section 7.06(c)", [id("dep")])] }, [id("lead")])] }),
  expectedContextState: "DEPENDENCY_EXPANDED_SOURCE",
  expectSemanticallyComplete: true,
  expectedAmbiguousRefs: ["dep"],
  expectedUnresolvedDependencies: 1,
};

const I33_A = "Investments in Permitted Joint Ventures not to exceed $14,000,000";
const I33_B = "Investments in Foreign Subsidiaries not to exceed $6,500,000, subject to clause (a) having been fully utilized";
const I33_C = "other Investments not to exceed $2,250,000, subject to clause (b) having been fully utilized";
const I33: Scenario = {
  id: "I33",
  title: "dependency chain length 3",
  text: agreement(COV_HEAD + `SECTION 7.09 Additional Investments. ${I15_LEAD}:\n(a) ${I33_A};\n(b) ${I33_B}; and\n(c) ${I33_C}.`),
  anchorRef: "7.09",
  items: [
    item("lead", "PROHIBITION", I15_LEAD, "MATERIAL"),
    item("a", "PERMISSION", I33_A, "CRITICAL", { values: [money("$14,000,000", 14_000_000)] }),
    item("b", "PERMISSION", I33_B, "CRITICAL", { values: [money("$6,500,000", 6_500_000)] }),
    item("bdep", "DEPENDENCY", "subject to clause (a) having been fully utilized", "CRITICAL", { referencedSections: ["clause (a)"] }),
    item("c", "PERMISSION", I33_C, "CRITICAL", { values: [money("$2,250,000", 2_250_000)] }),
    item("cdep", "DEPENDENCY", "subject to clause (b) having been fully utilized", "CRITICAL", { referencedSections: ["clause (b)"] }),
  ],
  compose: (id) =>
    submission({
      rules: [
        rule("ra", "7.09", { covenantFamily: "INVESTMENTS", action: "MAKE_INVESTMENT", capacityExpression: M(14_000_000, [id("a")]) }, [id("lead")]),
        rule("rb", "7.09", { covenantFamily: "INVESTMENTS", action: "MAKE_INVESTMENT", capacityExpression: M(6_500_000, [id("b")]), dependsOn: [dep("REQUIRES", "ra", "clause (a) fully utilized first", [id("bdep")])] }),
        rule("rc", "7.09", { covenantFamily: "INVESTMENTS", action: "MAKE_INVESTMENT", capacityExpression: M(2_250_000, [id("c")]), dependsOn: [dep("REQUIRES", "rb", "clause (b) fully utilized first", [id("cdep")])] }),
      ],
    }),
  expectedContextState: "COMPLETE_LOCAL_SOURCE",
  expectSemanticallyComplete: true,
};

const I34: Scenario = {
  id: "I34",
  title: "three sibling definitions",
  text: agreement(DEFS_HEAD + `"Term Alpha Amount" means $3,000,000.\n\n"Term Beta Amount" means 5% of Consolidated Zeta Amount for the most recently ended Test Period.\n\n"Term Gamma Amount" means the sum of Term Alpha Amount and Term Beta Amount.`),
  anchorRef: "1.01",
  items: [
    item("alpha", "VALUE", `"Term Alpha Amount" means $3,000,000`, "CRITICAL", { operative: "DEFINITIONAL", values: [money("$3,000,000", 3_000_000)] }),
    item("beta", "FORMULA_COMPONENT", `"Term Beta Amount" means 5% of Consolidated Zeta Amount for the most recently ended Test Period`, "CRITICAL", { operative: "DEFINITIONAL", values: [pct("5%", 0.05)], referencedTerms: ["Consolidated Zeta Amount"] }),
    item("gamma", "FORMULA_COMPONENT", `"Term Gamma Amount" means the sum of Term Alpha Amount and Term Beta Amount`, "CRITICAL", { operative: "DEFINITIONAL", referencedTerms: ["Term Alpha Amount", "Term Beta Amount"] }),
  ],
  compose: (id) =>
    submission({
      definitions: [
        def("da", "Term Alpha Amount", M(3_000_000), [], [id("alpha")]),
        def("db", "Term Beta Amount", MUL([P(0.05), TERM("Consolidated Zeta Amount")]), ["Consolidated Zeta Amount"], [id("beta")]),
        def("dg", "Term Gamma Amount", SUM([TERM("Term Alpha Amount"), TERM("Term Beta Amount")]), ["Term Alpha Amount", "Term Beta Amount"], [id("gamma")]),
      ],
    }),
  expectedContextState: "COMPLETE_LOCAL_SOURCE",
  expectSemanticallyComplete: true,
};

// ---------------------------------------------------------------------------
// I35 - 25 independently operative baskets
// ---------------------------------------------------------------------------
const LETTERS = "abcdefghijklmnopqrstuvwxy".split("");
const I35_PURPOSES = ["working capital", "equipment financing", "letters of credit", "foreign subsidiary borrowings", "acquisition financing", "receivables facilities", "hedging obligations", "insurance premium financing", "sale-leaseback obligations", "earn-out obligations", "employee relocation advances", "customer deposits", "surety bonds", "intercompany loans", "purchase money obligations", "guarantees of trade payables", "treasury management obligations", "deferred compensation", "vendor financing", "local lines of credit", "franchise obligations", "bridge financing", "contingent obligations", "restructured obligations", "general corporate purposes"];
const I35_AMOUNTS = I35_PURPOSES.map((_, i) => 1_100_000 + i * 350_000);
const I35_CLAUSES = I35_PURPOSES.map((p, i) => `Indebtedness incurred for ${p} in an aggregate principal amount not to exceed $${I35_AMOUNTS[i]!.toLocaleString("en-US")}`);
const I35: Scenario = {
  id: "I35",
  title: "25 independently operative baskets",
  text: agreement(COV_HEAD + `SECTION 7.01 Indebtedness. ${I6_LEAD}:\n${I35_CLAUSES.map((c, i) => `(${LETTERS[i]}) ${c}`).join(";\n")}.`),
  anchorRef: "7.01",
  items: [item("lead", "PROHIBITION", I6_LEAD, "MATERIAL"), ...I35_CLAUSES.map((c, i) => item(LETTERS[i]!, "PERMISSION", c, "CRITICAL", { values: [money(`$${I35_AMOUNTS[i]!.toLocaleString("en-US")}`, I35_AMOUNTS[i]!)] }))],
  compose: (id) => submission({ rules: I35_CLAUSES.map((_, i) => rule(`r${LETTERS[i]}`, "7.01", { capacityExpression: M(I35_AMOUNTS[i]!, [id(LETTERS[i]!)]) }, i === 0 ? [id("lead")] : [])) }),
  expectedContextState: "COMPLETE_LOCAL_SOURCE",
  expectSemanticallyComplete: true,
};

// ---------------------------------------------------------------------------
// I36 arbitrary metric names / I37 arbitrary section numbering / I38 reordered clauses
// ---------------------------------------------------------------------------
const I36 = growerScenario("I36", "arbitrary metric names", "Aggregate Blorp Capacity");
export const I36_VARIANTS = ["Consolidated Zeta Amount", "Aggregate Blorp Capacity", "Net Widget Yield Base"].map((m) => growerScenario(`I36:${m}`, "arbitrary metric names (variant)", m));
const I37 = fixedBasketScenario("I37", "arbitrary section numbering", "12.14", false);
export const I37_VARIANTS = ["7.01", "12.14", "3.02"].map((s) => fixedBasketScenario(`I37:${s}`, "arbitrary section numbering (variant)", s, false));
const I38 = fixedBasketScenario("I38", "reordered clauses", "7.01", true);

// ---------------------------------------------------------------------------
// I39 - source truncation
// ---------------------------------------------------------------------------
const I39: Scenario = {
  ...fixedBasketScenario("I39", "source truncation", "7.01", false),
  operativeWindow: (full) => full.slice(0, full.indexOf("(b)")),
  items: [item("lead", "PROHIBITION", I6_LEAD, "MATERIAL"), item("a", "PERMISSION", I6_A, "CRITICAL", { values: [money("$25,000,000", 25_000_000)] })],
  compose: (id) => submission({ rules: [rule("ra", "7.01", { capacityExpression: M(25_000_000, [id("a")]) }, [id("lead")])] }),
  expectedContextState: "TRUNCATED_SOURCE",
  expectSemanticallyComplete: false,
};

// ---------------------------------------------------------------------------
// I40 - ambiguous reference (two substantive occurrences share one label)
// ---------------------------------------------------------------------------
const I40_A = "Restricted Payments in an aggregate amount not to exceed $9,750,000, subject to compliance with Section 7.02";
const I40_DUP_1 = `SECTION 7.02 Liens. ${I10_LEAD}:\n(a) ${I11_A}; and\n(b) ${I10_B}.`;
const I40_DUP_2 = `SECTION 7.02 Sale and Leaseback Transactions. The Borrower will not enter into any Sale and Leaseback Transaction, except transactions in which the fair market value of the property so transferred does not exceed $4,400,000 in the aggregate and the proceeds are applied in accordance with the mandatory prepayment provisions of this Agreement.`;
const I40: Scenario = {
  id: "I40",
  title: "ambiguous reference",
  text: agreement(COV_HEAD + I40_DUP_1, I40_DUP_2, `SECTION 7.05 Restricted Payments. ${I12_LEAD}:\n(a) ${I40_A}.`),
  anchorRef: "7.05",
  items: [item("lead", "PROHIBITION", I12_LEAD, "MATERIAL"), item("a", "PERMISSION", I40_A, "CRITICAL", { values: [money("$9,750,000", 9_750_000)] }), item("dep", "DEPENDENCY", "subject to compliance with Section 7.02", "CRITICAL", { referencedSections: ["Section 7.02"] })],
  compose: (id) => submission({ rules: [rule("ra", "7.05", { covenantFamily: "RESTRICTED_PAYMENTS", action: "MAKE_RESTRICTED_PAYMENT", capacityExpression: M(9_750_000, [id("a")]), dependsOn: [dep("REQUIRES", "Section 7.02", "subject to compliance with Section 7.02 - ambiguous target, review required", [id("dep")])] }, [id("lead")])] }),
  expectedContextState: "COMPLETE_LOCAL_SOURCE",
  expectSemanticallyComplete: true,
  expectedAmbiguousRefs: ["dep"],
  expectedUnresolvedDependencies: 1,
  expectedUnresolvedReferenceStatuses: ["AMBIGUOUS"],
};

// ---------------------------------------------------------------------------
// I41-I44 - injected omissions are DERIVED from complete scenarios by the
// injection harness (see pass-bc-reconciliation.test.ts); these entries are
// the named base cases the mission calls out. Each is a complete scenario the
// harness mutates - never a hand-written "incomplete" composition that could
// accidentally still be caught by a different signal.
// ---------------------------------------------------------------------------
const I41: Scenario = { ...fixedBasketScenario("I41", "injected omission of one material inventory item (base)", "7.01", false) };
const I42: Scenario = { ...growerScenario("I42", "injected omission of one monetary value (base)", "Consolidated Zeta Amount") };
const I43: Scenario = { ...I15, id: "I43", title: "injected omission of one percentage (base)" };
const I44: Scenario = { ...I16, id: "I44", title: "injected omission of one condition (base)" };

// ---------------------------------------------------------------------------
// I45 - fully represented semantics but financial mapping unavailable
// ---------------------------------------------------------------------------
const I45_A = "Indebtedness in an aggregate principal amount not to exceed the greater of $20,000,000 and 2.5x Consolidated Quarterly Throughput Margin";
const I45: Scenario = {
  id: "I45",
  title: "fully represented semantics but financial mapping unavailable",
  text: agreement(COV_HEAD + `SECTION 7.01 Indebtedness. ${I6_LEAD}:\n(a) ${I45_A}.`),
  anchorRef: "7.01",
  items: [item("lead", "PROHIBITION", I6_LEAD, "MATERIAL"), item("a", "PERMISSION", I45_A, "CRITICAL", { values: [money("$20,000,000", 20_000_000), ratio("2.5x", 2.5)], referencedTerms: ["Consolidated Quarterly Throughput Margin"] })],
  compose: (id) => submission({ rules: [rule("ra", "7.01", { capacityExpression: MAX([M(20_000_000), MUL([P(2.5), METRIC("Consolidated Quarterly Throughput Margin")])], [id("a")]), sufficiency: "PARTIAL", sufficiencyReasons: ["financial mapping for Consolidated Quarterly Throughput Margin is unavailable - semantics fully represented, execution blocked on a metric mapping"] }, [id("lead")])] }),
  expectedContextState: "COMPLETE_LOCAL_SOURCE",
  expectSemanticallyComplete: true,
};

export const CORPUS: Scenario[] = [I1, I2, I3, I4, I5, I6, I7, I8, I9, I10, I11, I12, I13, I14, I15, I16, I17, I18, I19, I20, I21, I22, I23, I24, I25, I26, I27, I28, I29, I30, I31, I32, I33, I34, I35, I36, I37, I38, I39, I40, I41, I42, I43, I44, I45];
export const COMPLETE_SCENARIOS = CORPUS.filter((s) => s.expectSemanticallyComplete);
