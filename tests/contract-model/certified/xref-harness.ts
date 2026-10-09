/**
 * CROSS-REFERENCE GOLDEN FIXTURES (semantic fidelity closure §41-§42, §46-§48, §50, §53-§54).
 *
 * A synthetic agreement whose §7.02(a) is the generalized equivalent of the live failure: a child permission that
 *   A. permits debt "secured by Liens permitted under Section 7.03(b)"        (scope reference)
 *   B. is gated on pro forma compliance "with the financial covenants contained in Section 7.01" (compliance reference)
 *   D. where Section 7.01 holds TWO covenant rules                            (one-to-many)
 * §7.02(b) is gated on a defined named condition ("subject to the Payment Conditions")  (C)
 * §7.02(c) is "subject to Section 7.04", whose basket carries $123,000,000 / 17%        (E - referenced numeric basket)
 * §7.05 <-> §7.06 reference each other                                                    (reference cycle)
 * The parent §7.02 prohibition and the children are separate candidates of one sealed population, as in a real
 * discovered package. Every provider call is scripted: zero model calls.
 */
import type { DiscoveredCandidate } from "../../../lib/contract-model/compiler/discovery/types";
import { buildPackageFrom, CA, deps, fakeClient, idsForProposition, frozenIds, type GoldenDoc, type ScriptedInventory } from "./golden-harness";

export const XREF_AGREEMENT = [
  "CREDIT AGREEMENT dated as of March 1, 2026, among Example Industries Inc., as Borrower, the Lenders party hereto and Agent Bank, as Administrative Agent.",
  "",
  "ARTICLE I DEFINITIONS",
  "",
  "SECTION 1.01 Defined Terms . As used in this Agreement, the following terms have the meanings specified below:",
  "",
  "\"Consolidated EBITDA\" means, for any period, the consolidated net income of the Borrower and its Subsidiaries for such period plus consolidated interest expense for such period.",
  "",
  "\"Indebtedness\" means, as to any Person, all obligations of such Person for borrowed money.",
  "",
  "\"Interest Coverage Ratio\" means, for any period, the ratio of Consolidated EBITDA for such period to consolidated interest expense for such period.",
  "",
  "\"Leverage Ratio\" means, as of any date, the ratio of consolidated total debt as of such date to Consolidated EBITDA for the Test Period then ended.",
  "",
  "\"Lien\" means any mortgage, pledge, security interest or other charge on any property.",
  "",
  "\"Payment Conditions\" means, at any time of determination, that no Default has occurred and is continuing and that the Borrower has delivered the most recent compliance certificate required hereunder.",
  "",
  "\"Subsidiary\" means any corporation or other entity that is controlled by the Borrower.",
  "",
  "\"Total Assets\" means the total assets of the Borrower and its Subsidiaries determined on a consolidated basis.",
  "",
  "ARTICLE VII NEGATIVE COVENANTS",
  "",
  "SECTION 7.01 Financial Covenants . The Borrower shall not:",
  "",
  "(a) permit the Leverage Ratio as of the last day of any fiscal quarter to exceed 4.25 to 1.00; or",
  "",
  "(b) permit the Interest Coverage Ratio for any period of four consecutive fiscal quarters to be less than 2.50 to 1.00.",
  "",
  "SECTION 7.02 Indebtedness . The Borrower shall not create, incur or assume any Indebtedness, except:",
  "",
  "(a) Indebtedness secured by Liens permitted under Section 7.03(b); provided that the Borrower shall be in compliance, on a pro forma basis after giving effect to the incurrence of such Indebtedness, with the financial covenants contained in Section 7.01 recomputed as at the last day of the most recently ended fiscal quarter of the Borrower and its Subsidiaries for which financial statements are available as if such Indebtedness had been incurred on the first day of each relevant period for testing such compliance;",
  "",
  "(b) Indebtedness of any Subsidiary incurred subject to the Payment Conditions; and",
  "",
  "(c) other Indebtedness incurred subject to Section 7.04.",
  "",
  "SECTION 7.03 Liens . The Borrower shall not create any Lien on any property, except:",
  "",
  "(a) Liens securing Indebtedness under the Loan Documents; and",
  "",
  "(b) Liens on property acquired after the Closing Date securing Indebtedness in a principal amount not exceeding 65% of the fair market value of such property.",
  "",
  "SECTION 7.04 General Debt Basket . The Borrower may incur Indebtedness under this Section 7.04 in an aggregate principal amount not to exceed the greater of $123,000,000 and 17% of Total Assets.",
  "",
  "SECTION 7.05 Restricted Payments . The Borrower shall not make any Restricted Payment, except Restricted Payments made subject to Section 7.06.",
  "",
  "SECTION 7.06 Investments . The Borrower shall not make any Investment, except Investments made subject to Section 7.05.",
  "",
].join("\n");

export const XREF_DOCS: GoldenDoc[] = [{ documentId: CA, label: "Example Credit Agreement (2026-03-01)", text: XREF_AGREEMENT, role: "BASE" }];

export const XREF_DEFINITIONS: Record<string, string> = {
  "Consolidated EBITDA": "\"Consolidated EBITDA\" means, for any period, the consolidated net income of the Borrower and its Subsidiaries for such period plus consolidated interest expense for such period.",
  Indebtedness: "\"Indebtedness\" means, as to any Person, all obligations of such Person for borrowed money.",
  "Interest Coverage Ratio": "\"Interest Coverage Ratio\" means, for any period, the ratio of Consolidated EBITDA for such period to consolidated interest expense for such period.",
  "Leverage Ratio": "\"Leverage Ratio\" means, as of any date, the ratio of consolidated total debt as of such date to Consolidated EBITDA for the Test Period then ended.",
  Lien: "\"Lien\" means any mortgage, pledge, security interest or other charge on any property.",
  "Payment Conditions": "\"Payment Conditions\" means, at any time of determination, that no Default has occurred and is continuing and that the Borrower has delivered the most recent compliance certificate required hereunder.",
  Subsidiary: "\"Subsidiary\" means any corporation or other entity that is controlled by the Borrower.",
  "Total Assets": "\"Total Assets\" means the total assets of the Borrower and its Subsidiaries determined on a consolidated basis.",
};

// excerpts (verbatim substrings of the operative text) ------------------------------------------------------------------
export const X = {
  leadIn: "As used in this Agreement, the following terms have the meanings specified below:",
  fc_chapeau: "The Borrower shall not:",
  fc_a: "(a) permit the Leverage Ratio as of the last day of any fiscal quarter to exceed 4.25 to 1.00;",
  fc_b: "(b) permit the Interest Coverage Ratio for any period of four consecutive fiscal quarters to be less than 2.50 to 1.00.",
  debt_chapeau: "The Borrower shall not create, incur or assume any Indebtedness, except:",
  a_permission: "(a) Indebtedness secured by Liens permitted under Section 7.03(b);",
  a_proviso: "provided that the Borrower shall be in compliance, on a pro forma basis after giving effect to the incurrence of such Indebtedness, with the financial covenants contained in Section 7.01",
  a_testing: "recomputed as at the last day of the most recently ended fiscal quarter of the Borrower and its Subsidiaries for which financial statements are available",
  a_timing: "as if such Indebtedness had been incurred on the first day of each relevant period for testing such compliance;",
  b_permission: "(b) Indebtedness of any Subsidiary incurred subject to the Payment Conditions;",
  c_permission: "(c) other Indebtedness incurred subject to Section 7.04.",
  lien_chapeau: "The Borrower shall not create any Lien on any property, except:",
  lien_a: "(a) Liens securing Indebtedness under the Loan Documents;",
  lien_b: "(b) Liens on property acquired after the Closing Date securing Indebtedness in a principal amount not exceeding 65% of the fair market value of such property.",
  basket: "The Borrower may incur Indebtedness under this Section 7.04 in an aggregate principal amount not to exceed the greater of $123,000,000 and 17% of Total Assets.",
  rp: "The Borrower shall not make any Restricted Payment, except Restricted Payments made subject to Section 7.06.",
  inv: "The Borrower shall not make any Investment, except Investments made subject to Section 7.05.",
};

const item = (tag: string, excerpt: string, role: string, materiality: string, proposition: string) => ({ excerpt, role, materiality, proposition: `[${tag}] ${proposition}` });

export const XREF_INVENTORY: ScriptedInventory = {
  "1.01": [
    item("1.01", X.leadIn, "OTHER", "MATERIAL", "definitions lead-in"),
    ...Object.entries(XREF_DEFINITIONS).map(([term, excerpt]) => item("1.01", excerpt, "FORMULA_COMPONENT", "MATERIAL", `definition of ${term}`)),
  ],
  "7.01": [
    item("7.01", X.fc_chapeau, "PROHIBITION", "CRITICAL", "financial covenant chapeau"),
    item("7.01", X.fc_a, "THRESHOLD", "CRITICAL", "maximum leverage ratio 4.25 to 1.00"),
    item("7.01", X.fc_b, "THRESHOLD", "CRITICAL", "minimum interest coverage ratio 2.50 to 1.00"),
  ],
  "7.02": [item("7.02-chapeau", X.debt_chapeau, "PROHIBITION", "CRITICAL", "general prohibition on Indebtedness")],
  "7.02(a)": [
    item("7.02(a)", X.a_permission, "PERMISSION", "CRITICAL", "permits Indebtedness secured by Liens permitted under Section 7.03(b)"),
    item("7.02(a)", X.a_proviso, "CONDITION", "CRITICAL", "pro forma compliance with the Section 7.01 financial covenants"),
    item("7.02(a)", X.a_testing, "CONDITION", "MATERIAL", "testing date basis: last day of the most recent fiscal quarter with financial statements"),
    item("7.02(a)", X.a_timing, "CONDITION", "MATERIAL", "transaction timing assumption: incurred on the first day of each relevant period"),
  ],
  "7.02(b)": [item("7.02(b)", X.b_permission, "PERMISSION", "CRITICAL", "Subsidiary Indebtedness subject to the Payment Conditions")],
  "7.02(c)": [item("7.02(c)", X.c_permission, "PERMISSION", "CRITICAL", "other Indebtedness subject to Section 7.04")],
  "7.03": [
    item("7.03", X.lien_chapeau, "PROHIBITION", "CRITICAL", "general prohibition on Liens"),
    item("7.03", X.lien_a, "PERMISSION", "MATERIAL", "Liens securing Loan Document Indebtedness"),
    item("7.03", X.lien_b, "PERMISSION", "CRITICAL", "acquired-property Liens up to 65% of fair market value"),
  ],
  "7.04": [item("7.04", X.basket, "PERMISSION", "CRITICAL", "general debt basket: greater of $123,000,000 and 17% of Total Assets")],
  "7.05": [item("7.05", X.rp, "PROHIBITION", "CRITICAL", "restricted payments prohibited except subject to Section 7.06")],
  "7.06": [item("7.06", X.inv, "PROHIBITION", "CRITICAL", "investments prohibited except subject to Section 7.05")],
};

export type XrefSpec = [string, DiscoveredCandidate["families"], DiscoveredCandidate["role"], string];
export const XREF_CANDIDATES: XrefSpec[] = [
  ["1.01", ["DEFINITIONS_CALCULATION_RULES"], "DEFINITIONAL_DEPENDENCY_CANDIDATE", "defined terms"],
  ["7.01", ["FINANCIAL_COVENANTS"], "OTHER_RELEVANT_RULE", "financial covenants"],
  ["7.02", ["INDEBTEDNESS"], "GENERAL_PROHIBITION", "debt prohibition"],
  ["7.02(a)", ["INDEBTEDNESS", "LIENS", "FINANCIAL_COVENANTS"], "RATIO_BASED_PERMISSION", "secured debt gated on pro forma covenant compliance"],
  ["7.02(b)", ["INDEBTEDNESS"], "PERMISSION", "subsidiary debt subject to the Payment Conditions"],
  ["7.02(c)", ["INDEBTEDNESS"], "BASKET", "other debt subject to Section 7.04"],
  ["7.03", ["LIENS"], "GENERAL_PROHIBITION", "lien covenant"],
  ["7.04", ["INDEBTEDNESS"], "BASKET", "general debt basket"],
  ["7.05", ["RESTRICTED_PAYMENTS"], "GENERAL_PROHIBITION", "restricted payments"],
  ["7.06", ["INVESTMENTS"], "GENERAL_PROHIBITION", "investments"],
] as XrefSpec[];

// scripted Pass B ------------------------------------------------------------------------------------------------------
const ids = (user: string, tag: string, needle: string) => idsForProposition(user, `[${tag}] ${needle}`);
const allTagged = (user: string, tag: string) => idsForProposition(user, `[${tag}]`);
const unlimited = (citation: string, excerpt: string, inventoryItemIds: string[]) => ({ kind: "UNLIMITED_CAPACITY", citation, excerpt, inventoryItemIds });
const ratioTest = (ref: string, term: string, operator: "LTE" | "GTE", value: number, excerpt: string, inventoryItemIds: string[]) => ({
  localRef: `r-${ref}`, sourceSectionRef: ref, covenantFamily: "FINANCIAL_COVENANTS", ruleType: "RATIO_TEST", posture: "PROHIBITION", action: "SATISFY_RATIO", entityScope: ["BORROWER"], capacityExpression: null,
  conditions: [{ conditionType: "RATIO_SATISFIED", expression: { kind: "COMPARE", operator, left: { kind: "DEFINED_TERM_REFERENCE", termName: term, valueType: "RATIO", citation: ref, excerpt: term }, right: { kind: "RATIO", value, citation: ref, excerpt }, citation: ref, excerpt, inventoryItemIds }, referencesDefinitionId: null, description: `${term} ${operator === "LTE" ? "not greater than" : "not less than"} ${value} to 1.00`, citation: ref, excerpt, inventoryItemIds }],
  exceptions: [], dependsOn: [], sufficiency: "COMPLETE", citation: ref, excerpt, inventoryItemIds,
});

export function xrefSubmissionFor(user: string): unknown {
  const all = frozenIds(user);
  const empty = { sharedCapacities: [], irExtensionCandidates: [], overallNotes: [] };
  if (ids(user, "1.01", "definition of Consolidated EBITDA").length > 0) {
    const leadIn = ids(user, "1.01", "definitions lead-in");
    const defOf = (term: string, extra: Record<string, unknown> = {}) => ({ localRef: `d-${term.replace(/\s+/g, "-").toLowerCase()}`, termName: term, covenantFamily: "DEFINITIONS_CALCULATION_RULES", sufficiency: "COMPLETE", citation: "1.01", excerpt: XREF_DEFINITIONS[term], inventoryItemIds: [...ids(user, "1.01", `definition of ${term}`), ...leadIn], calculationExpression: null, dependsOnTerms: [], ...extra });
    return { rules: [], definitions: [
      defOf("Consolidated EBITDA"), defOf("Indebtedness"),
      defOf("Interest Coverage Ratio", { dependsOnTerms: ["Consolidated EBITDA"] }), defOf("Leverage Ratio", { dependsOnTerms: ["Consolidated EBITDA"] }),
      defOf("Lien"), defOf("Payment Conditions"), defOf("Subsidiary"), defOf("Total Assets"),
    ], ...empty };
  }
  if (allTagged(user, "7.01").length > 0) {
    const a = ids(user, "7.01", "maximum leverage"), b = ids(user, "7.01", "minimum interest coverage"), chapeau = ids(user, "7.01", "financial covenant chapeau");
    return { rules: [ratioTest("7.01(a)", "Leverage Ratio", "LTE", 4.25, X.fc_a, [...a, ...chapeau]), ratioTest("7.01(b)", "Interest Coverage Ratio", "GTE", 2.5, X.fc_b, [...b, ...chapeau])], definitions: [], ...empty };
  }
  if (allTagged(user, "7.02-chapeau").length > 0) {
    // the PARENT candidate owns the prohibition; the children own their permissions (exceptions here are relationships, not units).
    // IPV-03: do not lineage-launder child CONDITION inventory items onto the parent exception nodes —
    // cite only the permission proposition on each carve-out, and disposition any child CONDITION
    // items that leaked into this inventory (DESCENDANTS excerpt match) as owned by the child units.
    const chapeau = ids(user, "7.02-chapeau", "general prohibition");
    const childPermission = (tag: string, needle: string) => ids(user, tag, needle);
    const childConditions = [
      ...ids(user, "7.02(a)", "pro forma compliance"),
      ...ids(user, "7.02(a)", "testing date basis"),
      ...ids(user, "7.02(a)", "transaction timing"),
    ];
    const exc = (tag: string, description: string, excerpt: string, needle: string) => ({
      description,
      permissionRef: null,
      conditions: [],
      citation: tag,
      excerpt,
      inventoryItemIds: childPermission(tag, needle),
    });
    return {
      rules: [{
        localRef: "r0",
        sourceSectionRef: "7.02",
        covenantFamily: "INDEBTEDNESS",
        ruleType: "PROHIBITION",
        posture: "PROHIBITION",
        action: "INCUR_DEBT",
        entityScope: ["BORROWER"],
        capacityExpression: null,
        conditions: [],
        exceptions: [
          exc("7.02(a)", "clause (a): Indebtedness secured by permitted Liens, gated on pro forma covenant compliance", X.a_permission, "permits Indebtedness"),
          exc("7.02(b)", "clause (b): Subsidiary Indebtedness subject to the Payment Conditions", X.b_permission, "Subsidiary Indebtedness"),
          exc("7.02(c)", "clause (c): other Indebtedness subject to Section 7.04", X.c_permission, "other Indebtedness"),
        ],
        dependsOn: [],
        sufficiency: "COMPLETE",
        citation: "7.02",
        excerpt: X.debt_chapeau,
        inventoryItemIds: chapeau,
      }],
      definitions: [],
      inventoryDispositions: childConditions.map((inventoryItemId) => ({
        inventoryItemId,
        disposition: "INTENTIONALLY_NON_COMPUTATIONAL",
        reason: "Condition proposition is owned by the child candidate (7.02(a)); parent prohibition records only the carve-out relationship (IPV-03).",
      })),
      ...empty,
    };
  }
  if (allTagged(user, "7.02(a)").length > 0) {
    const perm = ids(user, "7.02(a)", "permits Indebtedness"), proviso = ids(user, "7.02(a)", "pro forma compliance"), testing = ids(user, "7.02(a)", "testing date basis"), timing = ids(user, "7.02(a)", "transaction timing");
    return { rules: [{ localRef: "r1", sourceSectionRef: "7.02(a)", covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: "INCUR_DEBT", entityScope: ["BORROWER"],
      // no independent dollar cap is stated locally: capacity is unlimited LOCALLY and gated entirely by the two requirements below
      capacityExpression: unlimited("7.02(a)", "Indebtedness secured by Liens permitted under Section 7.03(b)", perm),
      conditions: [
        { conditionType: "SECURITY_SCOPE", expression: null, referencesRuleTargets: [{ targetRef: "Section 7.03(b)" }], targetCombination: "ALL_SATISFIED", referencesDefinitionId: null, description: "the Indebtedness is secured by Liens permitted under Section 7.03(b)", citation: "7.02(a)", excerpt: "Indebtedness secured by Liens permitted under Section 7.03(b)", inventoryItemIds: perm },
        { conditionType: "OTHER_RULE_SATISFIED", expression: null, referencesRuleTargets: [{ targetRef: "Section 7.01" }], targetCombination: "ALL_SATISFIED",
          evaluationBasis: { proForma: true, transactionEffect: "after giving effect to the incurrence of such Indebtedness", asOfSelector: "the last day of the most recently ended fiscal quarter of the Borrower and its Subsidiaries for which financial statements are available", deemedEffectiveAt: "the first day of each relevant period for testing such compliance", testingPeriod: "each relevant period for testing such compliance" },
          referencesDefinitionId: null, description: "the Borrower is in compliance, on a pro forma basis, with the financial covenants contained in Section 7.01", citation: "7.02(a)", excerpt: X.a_proviso, inventoryItemIds: [...proviso, ...testing, ...timing] },
      ],
      exceptions: [],
      dependsOn: [{ relationshipType: "REQUIRES", targetRef: "Section 7.03(b)", description: "", inventoryItemIds: perm }, { relationshipType: "REQUIRES", targetRef: "Section 7.01", description: "", inventoryItemIds: proviso }],
      sufficiency: "COMPLETE", citation: "7.02(a)", excerpt: X.a_permission, inventoryItemIds: all }], definitions: [], ...empty };
  }
  if (allTagged(user, "7.02(b)").length > 0) {
    return { rules: [{ localRef: "r1", sourceSectionRef: "7.02(b)", covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: "INCUR_DEBT", entityScope: ["NON_GUARANTOR_RS"], capacityExpression: unlimited("7.02(b)", "Indebtedness of any Subsidiary incurred subject to the Payment Conditions", all),
      conditions: [{ conditionType: "OTHER_RULE_SATISFIED", expression: null, referencesRuleTargets: [{ targetRef: "the Payment Conditions" }], targetCombination: "ALL_SATISFIED", referencesDefinitionId: null, description: "the Payment Conditions are satisfied", citation: "7.02(b)", excerpt: "subject to the Payment Conditions", inventoryItemIds: all }],
      exceptions: [], dependsOn: [{ relationshipType: "REQUIRES", targetRef: "the Payment Conditions", description: "", inventoryItemIds: all }], sufficiency: "COMPLETE", citation: "7.02(b)", excerpt: X.b_permission, inventoryItemIds: all }], definitions: [], ...empty };
  }
  if (allTagged(user, "7.02(c)").length > 0) {
    return { rules: [{ localRef: "r1", sourceSectionRef: "7.02(c)", covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: "INCUR_DEBT", entityScope: ["BORROWER"], capacityExpression: unlimited("7.02(c)", "other Indebtedness incurred subject to Section 7.04", all),
      conditions: [{ conditionType: "AMOUNT_THRESHOLD", expression: null, referencesRuleTargets: [{ targetRef: "Section 7.04" }], targetCombination: "ALL_SATISFIED", referencesDefinitionId: null, description: "the Indebtedness is within the limit of Section 7.04", citation: "7.02(c)", excerpt: "subject to Section 7.04", inventoryItemIds: all }],
      exceptions: [], dependsOn: [{ relationshipType: "LIMITED_BY", targetRef: "Section 7.04", description: "", inventoryItemIds: all }], sufficiency: "COMPLETE", citation: "7.02(c)", excerpt: X.c_permission, inventoryItemIds: all }], definitions: [], ...empty };
  }
  if (allTagged(user, "7.03").length > 0) {
    const chapeau = ids(user, "7.03", "general prohibition on Liens"), a = ids(user, "7.03", "Liens securing Loan Document"), b = ids(user, "7.03", "acquired-property");
    return { rules: [
      { localRef: "r0", sourceSectionRef: "7.03", covenantFamily: "LIENS", ruleType: "PROHIBITION", posture: "PROHIBITION", action: "CREATE_LIEN", entityScope: ["BORROWER"], capacityExpression: null, conditions: [], exceptions: [{ description: "clause (a)", permissionRef: "r1", conditions: [], citation: "7.03(a)", excerpt: X.lien_a, inventoryItemIds: a }, { description: "clause (b)", permissionRef: "r2", conditions: [], citation: "7.03(b)", excerpt: X.lien_b, inventoryItemIds: b }], dependsOn: [], sufficiency: "COMPLETE", citation: "7.03", excerpt: X.lien_chapeau, inventoryItemIds: chapeau },
      { localRef: "r1", sourceSectionRef: "7.03(a)", covenantFamily: "LIENS", ruleType: "QUALITATIVE_OBLIGATION", posture: "PERMISSION", action: "CREATE_LIEN", entityScope: ["BORROWER"], capacityExpression: unlimited("7.03(a)", "Liens securing Indebtedness under the Loan Documents", a), conditions: [], exceptions: [], dependsOn: [], sufficiency: "COMPLETE", citation: "7.03(a)", excerpt: X.lien_a, inventoryItemIds: a },
      { localRef: "r2", sourceSectionRef: "7.03(b)", covenantFamily: "LIENS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: "CREATE_LIEN", entityScope: ["BORROWER"], capacityExpression: { kind: "MULTIPLY", citation: "7.03(b)", excerpt: "not exceeding 65% of the fair market value of such property", inventoryItemIds: b, operands: [{ kind: "PERCENT", value: 0.65, citation: "7.03(b)", excerpt: "65%", inventoryItemIds: b }, { kind: "METRIC_REFERENCE", metricName: "fair market value of the acquired property", valueType: "MONEY", citation: "7.03(b)", excerpt: "the fair market value of such property", inventoryItemIds: b }] }, conditions: [], exceptions: [], dependsOn: [], sufficiency: "COMPLETE", citation: "7.03(b)", excerpt: X.lien_b, inventoryItemIds: b },
    ], definitions: [], ...empty };
  }
  if (allTagged(user, "7.04").length > 0) {
    return { rules: [{ localRef: "r1", sourceSectionRef: "7.04", covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: "INCUR_DEBT", entityScope: ["BORROWER"],
      capacityExpression: { kind: "MAX", citation: "7.04", excerpt: "the greater of $123,000,000 and 17% of Total Assets", inventoryItemIds: all, operands: [{ kind: "MONEY", amount: 123_000_000, currency: "USD", citation: "7.04", excerpt: "$123,000,000", inventoryItemIds: all }, { kind: "MULTIPLY", citation: "7.04", excerpt: "17% of Total Assets", inventoryItemIds: all, operands: [{ kind: "PERCENT", value: 0.17, citation: "7.04", excerpt: "17%", inventoryItemIds: all }, { kind: "DEFINED_TERM_REFERENCE", termName: "Total Assets", valueType: "MONEY", citation: "1.01", excerpt: "Total Assets", inventoryItemIds: all }] }] },
      conditions: [], exceptions: [], dependsOn: [], sufficiency: "COMPLETE", citation: "7.04", excerpt: X.basket, inventoryItemIds: all }], definitions: [], ...empty };
  }
  const cyc = (ref: string, other: string, family: string, action: string, excerpt: string, what: string) => ({ rules: [{ localRef: "r0", sourceSectionRef: ref, covenantFamily: family, ruleType: "PROHIBITION", posture: "PROHIBITION", action, entityScope: ["BORROWER"], capacityExpression: null, conditions: [],
    exceptions: [{ description: `${what} made subject to Section ${other}`, permissionRef: null, conditions: [{ conditionType: "OTHER_RULE_SATISFIED", expression: null, referencesRuleTargets: [{ targetRef: `Section ${other}` }], targetCombination: "ALL_SATISFIED", referencesDefinitionId: null, description: `subject to Section ${other}`, citation: ref, excerpt: `subject to Section ${other}`, inventoryItemIds: all }], citation: ref, excerpt, inventoryItemIds: all }],
    dependsOn: [{ relationshipType: "REQUIRES", targetRef: `Section ${other}`, description: "", inventoryItemIds: all }], sufficiency: "COMPLETE", citation: ref, excerpt, inventoryItemIds: all }], definitions: [], ...empty });
  if (allTagged(user, "7.05").length > 0) return cyc("7.05", "7.06", "RESTRICTED_PAYMENTS", "PAY_DIVIDEND", X.rp, "Restricted Payments");
  if (allTagged(user, "7.06").length > 0) return cyc("7.06", "7.05", "INVESTMENTS", "MAKE_INVESTMENT", X.inv, "Investments");
  throw new Error(`xref harness: no scripted submission matches this prompt: ${user.slice(0, 300)}`);
}

export function xrefPackage(specs: XrefSpec[] = XREF_CANDIDATES, scope: "COMPLETE" | "PARTIAL_TARGET_SET" = "COMPLETE") {
  return buildPackageFrom({ docs: XREF_DOCS, effects: [], candidateSpecs: specs.map(([ref, families, role, description]) => [ref, families, role, description, CA]) as never, scope });
}
export function xrefDeps() { return deps(fakeClient(xrefSubmissionFor), XREF_INVENTORY); }
