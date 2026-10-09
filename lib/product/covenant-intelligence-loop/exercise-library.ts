/**
 * Versioned customer exercise library — declarative scenarios, no per-exercise app logic.
 */

import type { ExerciseDefinition } from "./types";

export const EXERCISE_LIBRARY_VERSION = "1.0.0";

function ex(
  partial: Omit<ExerciseDefinition, "version"> & { version?: string },
): ExerciseDefinition {
  return { version: partial.version ?? EXERCISE_LIBRARY_VERSION, ...partial };
}

/** Full initial library required by the continuous intelligence mandate. */
export const EXERCISE_LIBRARY: ExerciseDefinition[] = [
  // Debt incurrence
  ex({
    exerciseId: "debt.unsecured.50",
    family: "DEBT_INCURRENCE",
    title: "Incur $50 million of unsecured debt",
    question: "Can the borrower incur $50 million of additional unsecured indebtedness? Identify applicable baskets, conditions, and entity scope.",
    amountMillions: 50,
    tags: ["unsecured", "debt"],
    requiredCategories: ["DEBT_INCURRENCE"],
    requiredFinancialInputs: [],
  }),
  ex({
    exerciseId: "debt.unsecured.150",
    family: "DEBT_INCURRENCE",
    title: "Incur $150 million of unsecured debt",
    question:
      "Can the borrower incur $150 million of additional unsecured indebtedness? Identify fixed, grower, and ratio baskets, conditions, and entity scope.",
    amountMillions: 150,
    tags: ["unsecured", "debt", "mandate"],
    requiredCategories: ["DEBT_INCURRENCE"],
    requiredFinancialInputs: ["totalDebt", "ebitda"],
  }),
  ex({
    exerciseId: "debt.secured.100",
    family: "DEBT_INCURRENCE",
    title: "Incur $100 million of secured debt",
    question:
      "Can we incur $100 million of additional secured debt? Analyze both indebtedness and lien covenants, fixed and ratio baskets, conditions, and shared capacity.",
    amountMillions: 100,
    tags: ["secured", "debt", "lien", "vertical-slice"],
    requiredCategories: ["DEBT_INCURRENCE", "LIENS_SECURED_DEBT"],
    requiredFinancialInputs: ["totalDebt", "securedDebt", "ebitda"],
  }),
  ex({
    exerciseId: "debt.term.250",
    family: "DEBT_INCURRENCE",
    title: "Incur $250 million of additional term debt",
    question: "Can the borrower incur $250 million of additional term loan indebtedness? Identify incremental facilities and ratio debt permissions.",
    amountMillions: 250,
    tags: ["term", "incremental"],
    requiredCategories: ["DEBT_INCURRENCE"],
    requiredFinancialInputs: ["totalDebt", "ebitda"],
  }),
  ex({
    exerciseId: "debt.non_guarantor",
    family: "DEBT_INCURRENCE",
    title: "Incur debt at a non-guarantor subsidiary",
    question: "Can a non-guarantor restricted subsidiary incur indebtedness? Identify entity-scope limitations and non-guarantor baskets.",
    tags: ["non-guarantor", "entity-scope"],
    requiredCategories: ["DEBT_INCURRENCE", "GUARANTEES"],
    requiredFinancialInputs: [],
  }),
  ex({
    exerciseId: "debt.ratio_basket",
    family: "DEBT_INCURRENCE",
    title: "Incur debt under a ratio basket",
    question: "What ratio-based indebtedness permissions exist (e.g. pro forma leverage tests)? What financial inputs are required?",
    tags: ["ratio", "debt"],
    requiredCategories: ["DEBT_INCURRENCE", "FINANCIAL_MAINTENANCE"],
    requiredFinancialInputs: ["totalDebt", "ebitda", "cash"],
  }),
  ex({
    exerciseId: "debt.fixed_vs_grower",
    family: "DEBT_INCURRENCE",
    title: "Use a fixed basket versus a grower basket",
    question: "Compare fixed-dollar and greater-of / grower indebtedness baskets. When would each be preferable?",
    tags: ["fixed", "grower"],
    requiredCategories: ["DEBT_INCURRENCE", "BASKETS_EXCEPTIONS_CONDITIONS"],
    requiredFinancialInputs: ["ebitda"],
  }),
  ex({
    exerciseId: "debt.incremental_equivalent",
    family: "DEBT_INCURRENCE",
    title: "Incur incremental equivalent debt",
    question: "What incremental / accordion / equivalent debt permissions apply, and what leverage or lien conditions gate them?",
    tags: ["incremental", "accordion"],
    requiredCategories: ["DEBT_INCURRENCE"],
    requiredFinancialInputs: ["securedDebt", "ebitda"],
  }),

  // Liens
  ex({
    exerciseId: "lien.secure_new_debt",
    family: "LIENS",
    title: "Secure newly incurred debt",
    question: "What lien baskets permit securing newly incurred indebtedness? Identify shared debt-and-lien limitations.",
    tags: ["lien", "secured"],
    requiredCategories: ["LIENS_SECURED_DEBT", "DEBT_INCURRENCE"],
    requiredFinancialInputs: [],
  }),
  ex({
    exerciseId: "lien.refinance_secured",
    family: "LIENS",
    title: "Refinance secured debt",
    question: "What refinancing permissions apply to existing secured debt and related liens?",
    tags: ["refinance", "lien"],
    requiredCategories: ["LIENS_SECURED_DEBT", "DEBT_INCURRENCE"],
    requiredFinancialInputs: [],
  }),
  ex({
    exerciseId: "lien.general_basket",
    family: "LIENS",
    title: "Use a general lien basket",
    question: "Identify the general lien basket and its conditions, caps, and interactions with indebtedness covenants.",
    tags: ["lien", "general"],
    requiredCategories: ["LIENS_SECURED_DEBT"],
    requiredFinancialInputs: [],
  }),
  ex({
    exerciseId: "lien.subsidiary",
    family: "LIENS",
    title: "Analyze liens securing subsidiary debt",
    question: "May liens secure subsidiary indebtedness? Address guarantor vs non-guarantor scope.",
    tags: ["lien", "subsidiary"],
    requiredCategories: ["LIENS_SECURED_DEBT", "GUARANTEES"],
    requiredFinancialInputs: [],
  }),
  ex({
    exerciseId: "lien.shared_debt_lien",
    family: "LIENS",
    title: "Test shared debt-and-lien limitations",
    question: "Identify shared-capacity or aggregate caps that link indebtedness and lien permissions.",
    tags: ["shared", "lien", "debt"],
    requiredCategories: ["LIENS_SECURED_DEBT", "DEBT_INCURRENCE", "BASKETS_EXCEPTIONS_CONDITIONS"],
    requiredFinancialInputs: [],
  }),

  // Restricted payments
  ex({
    exerciseId: "rp.dividend.50",
    family: "RESTRICTED_PAYMENTS",
    title: "Pay a $50 million dividend",
    question: "Can the borrower pay a $50 million dividend? Identify RP baskets, builder/available amount, and no-default conditions.",
    amountMillions: 50,
    tags: ["dividend", "rp"],
    requiredCategories: ["RESTRICTED_PAYMENTS_INVESTMENTS"],
    requiredFinancialInputs: ["ebitda", "cumulativeNetIncome"],
  }),
  ex({
    exerciseId: "rp.share_repurchase",
    family: "RESTRICTED_PAYMENTS",
    title: "Repurchase shares",
    question: "What restricted payment capacity exists for share repurchases?",
    tags: ["rp", "buyback"],
    requiredCategories: ["RESTRICTED_PAYMENTS_INVESTMENTS"],
    requiredFinancialInputs: [],
  }),
  ex({
    exerciseId: "rp.parent_distribution",
    family: "RESTRICTED_PAYMENTS",
    title: "Make distributions to a parent",
    question: "Are distributions to a parent permitted, and under which RP exceptions?",
    tags: ["rp", "parent"],
    requiredCategories: ["RESTRICTED_PAYMENTS_INVESTMENTS"],
    requiredFinancialInputs: [],
  }),
  ex({
    exerciseId: "rp.available_amount",
    family: "RESTRICTED_PAYMENTS",
    title: "Use an available amount basket",
    question: "How does the Available Amount / builder basket for restricted payments work, and what inputs build it?",
    tags: ["builder", "available-amount"],
    requiredCategories: ["RESTRICTED_PAYMENTS_INVESTMENTS", "BASKETS_EXCEPTIONS_CONDITIONS"],
    requiredFinancialInputs: ["cumulativeNetIncome", "equityProceedsSinceIssue"],
  }),
  ex({
    exerciseId: "rp.builder",
    family: "RESTRICTED_PAYMENTS",
    title: "Test builder basket availability",
    question: "What builder-basket components and starter amounts apply to restricted payments?",
    tags: ["builder"],
    requiredCategories: ["RESTRICTED_PAYMENTS_INVESTMENTS"],
    requiredFinancialInputs: ["cumulativeNetIncome"],
  }),
  ex({
    exerciseId: "rp.no_default",
    family: "RESTRICTED_PAYMENTS",
    title: "Apply no-default conditions",
    question: "Which no-Default / no-Event-of-Default conditions gate restricted payments?",
    tags: ["condition", "rp"],
    requiredCategories: ["RESTRICTED_PAYMENTS_INVESTMENTS", "EVENTS_OF_DEFAULT"],
    requiredFinancialInputs: [],
  }),

  // Investments
  ex({
    exerciseId: "inv.75",
    family: "INVESTMENTS",
    title: "Make a $75 million investment",
    question:
      "Can the borrower make a $75 million investment? Identify investment baskets, RP overlap, conditions, and entity scope.",
    amountMillions: 75,
    tags: ["investment", "mandate"],
    requiredCategories: ["RESTRICTED_PAYMENTS_INVESTMENTS"],
    requiredFinancialInputs: [],
  }),
  ex({
    exerciseId: "inv.acquire_sub",
    family: "INVESTMENTS",
    title: "Acquire a subsidiary",
    question: "Can the borrower acquire a subsidiary? Identify investment baskets and acquisition financing interactions.",
    tags: ["acquisition", "investment"],
    requiredCategories: ["RESTRICTED_PAYMENTS_INVESTMENTS"],
    requiredFinancialInputs: [],
  }),
  ex({
    exerciseId: "inv.unrestricted_sub",
    family: "INVESTMENTS",
    title: "Invest in an unrestricted subsidiary",
    question: "What permissions govern investments in unrestricted subsidiaries?",
    tags: ["unrestricted", "investment"],
    requiredCategories: ["RESTRICTED_PAYMENTS_INVESTMENTS"],
    requiredFinancialInputs: [],
  }),
  ex({
    exerciseId: "inv.intercompany_loan",
    family: "INVESTMENTS",
    title: "Make an intercompany loan",
    question: "Are intercompany loans treated as Investments or Indebtedness, and which baskets apply?",
    tags: ["intercompany"],
    requiredCategories: ["RESTRICTED_PAYMENTS_INVESTMENTS", "DEBT_INCURRENCE"],
    requiredFinancialInputs: [],
  }),
  ex({
    exerciseId: "inv.acquisition_debt",
    family: "INVESTMENTS",
    title: "Finance an acquisition with debt",
    question: "Analyze combining investment capacity with debt and lien baskets for a financed acquisition.",
    tags: ["acquisition", "debt"],
    requiredCategories: ["RESTRICTED_PAYMENTS_INVESTMENTS", "DEBT_INCURRENCE", "LIENS_SECURED_DEBT"],
    requiredFinancialInputs: ["totalDebt", "ebitda"],
  }),
  ex({
    exerciseId: "inv.combine_baskets",
    family: "INVESTMENTS",
    title: "Combine investment and debt baskets",
    question: "How do investment and indebtedness baskets interact for the same transaction?",
    tags: ["investment", "debt", "cross"],
    requiredCategories: ["RESTRICTED_PAYMENTS_INVESTMENTS", "DEBT_INCURRENCE"],
    requiredFinancialInputs: [],
  }),

  // Financial ratios
  ex({
    exerciseId: "ratio.total_leverage",
    family: "FINANCIAL_RATIOS",
    title: "Calculate total leverage",
    question: "What is the contractual total leverage test, threshold, and required definitional inputs?",
    tags: ["leverage"],
    requiredCategories: ["FINANCIAL_MAINTENANCE"],
    requiredFinancialInputs: ["totalDebt", "ebitda"],
  }),
  ex({
    exerciseId: "ratio.net_leverage",
    family: "FINANCIAL_RATIOS",
    title: "Calculate net leverage",
    question: "What is the contractual net leverage test and cash-netting definition?",
    tags: ["leverage", "net"],
    requiredCategories: ["FINANCIAL_MAINTENANCE"],
    requiredFinancialInputs: ["totalDebt", "cash", "ebitda"],
  }),
  ex({
    exerciseId: "ratio.secured_leverage",
    family: "FINANCIAL_RATIOS",
    title: "Calculate secured leverage",
    question: "What secured / first-lien leverage tests apply?",
    tags: ["secured", "leverage"],
    requiredCategories: ["FINANCIAL_MAINTENANCE"],
    requiredFinancialInputs: ["securedDebt", "ebitda"],
  }),
  ex({
    exerciseId: "ratio.fccr",
    family: "FINANCIAL_RATIOS",
    title: "Calculate fixed-charge coverage",
    question: "Identify the fixed-charge coverage ratio definition, threshold, and required inputs.",
    tags: ["fccr", "coverage"],
    requiredCategories: ["FINANCIAL_MAINTENANCE"],
    requiredFinancialInputs: ["ebitda", "interestExpense"],
  }),
  ex({
    exerciseId: "ratio.interest_coverage",
    family: "FINANCIAL_RATIOS",
    title: "Calculate interest coverage",
    question: "Identify interest coverage tests and required inputs.",
    tags: ["coverage"],
    requiredCategories: ["FINANCIAL_MAINTENANCE"],
    requiredFinancialInputs: ["ebitda", "interestExpense"],
  }),
  ex({
    exerciseId: "ratio.covenant_cushion",
    family: "FINANCIAL_RATIOS",
    title: "Determine covenant cushion",
    question: "Given available financial inputs, what cushion exists to the nearest maintenance leverage/coverage threshold?",
    tags: ["cushion"],
    requiredCategories: ["FINANCIAL_MAINTENANCE"],
    requiredFinancialInputs: ["totalDebt", "ebitda"],
  }),
  ex({
    exerciseId: "ratio.ebitda_down_10",
    family: "FINANCIAL_RATIOS",
    title: "Model a 10% EBITDA decline",
    question: "How would a 10% decline in Consolidated EBITDA affect leverage and coverage covenant headroom?",
    tags: ["sensitivity", "ebitda"],
    requiredCategories: ["FINANCIAL_MAINTENANCE"],
    requiredFinancialInputs: ["totalDebt", "ebitda"],
  }),
  ex({
    exerciseId: "ratio.ebitda_down_20",
    family: "FINANCIAL_RATIOS",
    title: "Model a 20% EBITDA decline",
    question: "How would a 20% decline in Consolidated EBITDA affect leverage and coverage covenant headroom?",
    tags: ["sensitivity", "ebitda"],
    requiredCategories: ["FINANCIAL_MAINTENANCE"],
    requiredFinancialInputs: ["totalDebt", "ebitda"],
  }),
  ex({
    exerciseId: "ratio.ebitda_down_30",
    family: "FINANCIAL_RATIOS",
    title: "Model a 30% EBITDA decline",
    question: "How would a 30% decline in Consolidated EBITDA affect leverage and coverage covenant headroom?",
    tags: ["sensitivity", "ebitda"],
    requiredCategories: ["FINANCIAL_MAINTENANCE"],
    requiredFinancialInputs: ["totalDebt", "ebitda"],
  }),
  ex({
    exerciseId: "ratio.funded_debt_up",
    family: "FINANCIAL_RATIOS",
    title: "Model an increase in funded debt",
    question: "How would a material increase in funded debt affect leverage covenant compliance?",
    tags: ["sensitivity", "debt"],
    requiredCategories: ["FINANCIAL_MAINTENANCE", "DEBT_INCURRENCE"],
    requiredFinancialInputs: ["totalDebt", "ebitda"],
  }),

  // Asset sales
  ex({
    exerciseId: "sale.division",
    family: "ASSET_SALES",
    title: "Sell a business division",
    question: "What asset sale permissions apply to selling a business division, and how must proceeds be applied?",
    tags: ["asset-sale"],
    requiredCategories: ["ASSET_SALES"],
    requiredFinancialInputs: [],
  }),
  ex({
    exerciseId: "sale.ordinary_course",
    family: "ASSET_SALES",
    title: "Sell ordinary-course assets",
    question: "Are ordinary-course asset sales permitted, and under which exceptions?",
    tags: ["asset-sale", "ordinary-course"],
    requiredCategories: ["ASSET_SALES"],
    requiredFinancialInputs: [],
  }),
  ex({
    exerciseId: "sale.proceeds",
    family: "ASSET_SALES",
    title: "Determine proceeds application",
    question: "How must asset sale proceeds be applied (reinvestment, prepayment, RP builder)?",
    tags: ["proceeds"],
    requiredCategories: ["ASSET_SALES"],
    requiredFinancialInputs: [],
  }),
  ex({
    exerciseId: "sale.mandatory_prepay",
    family: "ASSET_SALES",
    title: "Evaluate mandatory prepayment",
    question: "When do asset sales trigger mandatory prepayment obligations?",
    tags: ["prepayment"],
    requiredCategories: ["ASSET_SALES", "DEBT_INCURRENCE"],
    requiredFinancialInputs: [],
  }),
  ex({
    exerciseId: "sale.reinvestment",
    family: "ASSET_SALES",
    title: "Analyze reinvestment permissions",
    question: "What reinvestment rights exist for asset sale proceeds, and what deadlines apply?",
    tags: ["reinvestment"],
    requiredCategories: ["ASSET_SALES"],
    requiredFinancialInputs: [],
  }),

  // Amendments / refinancing
  ex({
    exerciseId: "amd.apply",
    family: "AMENDMENTS_REFINANCING",
    title: "Apply an amendment to an existing agreement",
    question: "What amendment effects are identified in the package, and what operative precedence issues remain?",
    tags: ["amendment"],
    requiredCategories: ["OTHER", "DEBT_INCURRENCE"],
    requiredFinancialInputs: [],
  }),
  ex({
    exerciseId: "amd.threshold_change",
    family: "AMENDMENTS_REFINANCING",
    title: "Identify changed baskets and thresholds",
    question: "Which baskets or thresholds changed between the base agreement and amendments?",
    tags: ["amendment", "threshold"],
    requiredCategories: ["DEBT_INCURRENCE", "BASKETS_EXCEPTIONS_CONDITIONS"],
    requiredFinancialInputs: [],
  }),
  ex({
    exerciseId: "amd.refinance",
    family: "AMENDMENTS_REFINANCING",
    title: "Refinance outstanding debt",
    question: "What refinancing indebtedness and lien permissions apply to outstanding debt?",
    tags: ["refinance"],
    requiredCategories: ["DEBT_INCURRENCE", "LIENS_SECURED_DEBT"],
    requiredFinancialInputs: [],
  }),
  ex({
    exerciseId: "amd.maturity",
    family: "AMENDMENTS_REFINANCING",
    title: "Analyze maturity restrictions",
    question: "What maturity / weighted-average-life restrictions apply to refinancings or incremental debt?",
    tags: ["maturity"],
    requiredCategories: ["DEBT_INCURRENCE"],
    requiredFinancialInputs: [],
  }),
  ex({
    exerciseId: "amd.pre_post_capacity",
    family: "AMENDMENTS_REFINANCING",
    title: "Compare pre-amendment and post-amendment capacity",
    question: "Compare debt/lien/RP capacity language before and after amendments where both are analyzed.",
    tags: ["amendment", "compare"],
    requiredCategories: ["DEBT_INCURRENCE"],
    requiredFinancialInputs: [],
  }),

  // Multi-step
  ex({
    exerciseId: "multi.debt_and_distribute",
    family: "MULTI_STEP",
    title: "Incur debt and distribute proceeds",
    question: "Analyze a two-step transaction: incur debt and distribute proceeds as a restricted payment. Identify cross-covenant interactions.",
    tags: ["multi", "debt", "rp"],
    requiredCategories: ["DEBT_INCURRENCE", "RESTRICTED_PAYMENTS_INVESTMENTS"],
    requiredFinancialInputs: ["totalDebt", "ebitda"],
  }),
  ex({
    exerciseId: "multi.secured_acq",
    family: "MULTI_STEP",
    title: "Incur secured debt and make an acquisition",
    question: "Analyze incurring secured debt to finance an acquisition across debt, lien, and investment covenants.",
    tags: ["multi", "secured", "acquisition"],
    requiredCategories: ["DEBT_INCURRENCE", "LIENS_SECURED_DEBT", "RESTRICTED_PAYMENTS_INVESTMENTS"],
    requiredFinancialInputs: ["securedDebt", "ebitda"],
  }),
  ex({
    exerciseId: "multi.refinance_release",
    family: "MULTI_STEP",
    title: "Refinance debt and release liens",
    question: "Analyze refinancing secured debt with concurrent lien release / replacement lien analysis.",
    tags: ["multi", "refinance", "lien"],
    requiredCategories: ["DEBT_INCURRENCE", "LIENS_SECURED_DEBT"],
    requiredFinancialInputs: [],
  }),
  ex({
    exerciseId: "multi.transfer_rs",
    family: "MULTI_STEP",
    title: "Transfer assets between restricted subsidiaries",
    question: "What investment / asset sale / affiliate rules govern transfers between restricted subsidiaries?",
    tags: ["multi", "intercompany"],
    requiredCategories: ["RESTRICTED_PAYMENTS_INVESTMENTS", "ASSET_SALES", "AFFILIATE_TRANSACTIONS"],
    requiredFinancialInputs: [],
  }),
  ex({
    exerciseId: "multi.reclass",
    family: "MULTI_STEP",
    title: "Reclassify historical basket usage",
    question: "Does the agreement permit reclassification of historical basket usage among indebtedness/lien/RP baskets?",
    tags: ["reclassification"],
    requiredCategories: ["DEBT_INCURRENCE", "BASKETS_EXCEPTIONS_CONDITIONS"],
    requiredFinancialInputs: [],
  }),
  ex({
    exerciseId: "lme.debt_exchange",
    family: "MULTI_STEP",
    title: "Debt exchange / liability management",
    question:
      "Analyze an exchange offer or open-market repurchase of existing notes/loans. Identify refinancing, RP, investment, and lien interactions. Do not assume stacking.",
    tags: ["lme", "exchange", "refinance"],
    requiredCategories: ["DEBT_INCURRENCE", "LIENS_SECURED_DEBT", "RESTRICTED_PAYMENTS_INVESTMENTS"],
    requiredFinancialInputs: [],
  }),
  ex({
    exerciseId: "entity.designate_unrestricted",
    family: "MULTI_STEP",
    title: "Designate an Unrestricted Subsidiary",
    question:
      "What investment capacity and conditions apply to designating a Restricted Subsidiary as Unrestricted? Identify definitions and any ratio/RP gates.",
    tags: ["designation", "entity-scope", "investment"],
    requiredCategories: ["RESTRICTED_PAYMENTS_INVESTMENTS", "BASKETS_EXCEPTIONS_CONDITIONS"],
    requiredFinancialInputs: [],
  }),
  ex({
    exerciseId: "fc.equity_cure",
    family: "FINANCIAL_RATIOS",
    title: "Equity cure of a financial covenant",
    question:
      "If a financial maintenance covenant is breached, does an equity cure exist? What limits apply (amount, timing, number of cures)?",
    tags: ["cure", "financial-covenant"],
    requiredCategories: ["FINANCIAL_MAINTENANCE"],
    requiredFinancialInputs: ["ebitda", "totalDebt"],
  }),
];

export function listExercises(filter?: {
  family?: ExerciseDefinition["family"];
  tag?: string;
  ids?: string[];
}): ExerciseDefinition[] {
  let out = EXERCISE_LIBRARY;
  if (filter?.family) out = out.filter((e) => e.family === filter.family);
  if (filter?.tag) out = out.filter((e) => e.tags.includes(filter.tag!));
  if (filter?.ids?.length) {
    const set = new Set(filter.ids);
    out = out.filter((e) => set.has(e.exerciseId));
  }
  return out;
}

export function getExercise(exerciseId: string): ExerciseDefinition | undefined {
  return EXERCISE_LIBRARY.find((e) => e.exerciseId === exerciseId);
}
