/**
 * SYNTHETIC CONMED-form-inspired certified-vs-legacy demo exercises.
 *
 * Everything here is FIXTURE / engineering data — not authentic customer IR,
 * not Phase 3 certified customer work product, and not a claim that product
 * multipath capacity is Phase 4E certified.
 *
 * Labels: SYNTHETIC · FIXTURE_IR · NOT_CERTIFIED_4E · LEGACY_ENGINE_MULTIPATH
 */

import type { CovenantSummaryItem } from "@/lib/product/covenant-intelligence/summarize";
import type {
  CompiledPermissionInput,
  FinancialForPaths,
  MultiPathAnalysis,
} from "@/lib/product/customer-intelligence/multi-path-analysis";
import type { ReviewerApproval } from "@/lib/product/customer-intelligence/reviewer-approvals";

export const DEMO_LABEL = "SYNTHETIC" as const;
export const DEMO_IR_LABEL = "FIXTURE_IR" as const;
export const DEMO_LEGACY_AUTHORITY = "LEGACY_ENGINE_MULTIPATH" as const;
export const DEMO_NOT_CERTIFIED = "NOT_CERTIFIED_4E" as const;

/** Synthetic company / instrument aligned with CONMED-form-inspired cert fixtures. */
export const DEMO_COMPANY_ID = "synthetic-conmed-form-co";
export const DEMO_INSTRUMENT_KEY = "synthetic-term-loan-a";
export const DEMO_EVALUATION_DATE = "2026-08-01";
export const DEMO_CUTOFF_PERIOD = "FY2026-Q2";
export const DEMO_SNAPSHOT_AS_OF = "2026-06-30";

export type DemoExerciseId =
  | "secured-borrowing-100m"
  | "restricted-payment-75m"
  | "acquisition-financing-150m"
  | "ebitda-decline"
  | "amendment-basket-capacity"
  | "historical-basket-consumption"
  | "reclassification";

export interface DemoCapacityPlaceholder {
  /** Gross basket capacity in millions (SYNTHETIC placeholder for counsel narrative). */
  grossMillions: number | null;
  /** Remaining after synthetic historical usage (placeholder — not certified). */
  remainingMillions: number | null;
  note: string;
}

export interface DemoExercise {
  id: DemoExerciseId;
  title: string;
  label: typeof DEMO_LABEL;
  irLabel: typeof DEMO_IR_LABEL;
  /** Applicable contractual cutoff for the exercise (synthetic). */
  applicableCutoff: {
    evaluationDate: string;
    reportingPeriodKey: string;
    snapshotAsOf: string;
    selector: "MOST_RECENTLY_ENDED_FISCAL_QUARTER";
  };
  transaction: {
    amountMillions: number;
    kind: MultiPathAnalysis["transaction"]["kind"];
    secured: boolean;
    label: string;
  };
  /** Synthetic section refs inspired by CONMED-form layouts — not authentic excerpts. */
  governingProvisions: Array<{
    sectionRef: string;
    heading: string;
    role: string;
  }>;
  availablePaths: string[];
  conditions: string[];
  capacity: DemoCapacityPlaceholder;
  historicalUsage: Array<{
    sectionRef: string;
    amountMillions: number;
    effectiveAsOf: string;
    note: string;
  }>;
  proForma: {
    description: string;
    ebitdaMillions: number;
    totalDebtMillions: number;
    securedDebtMillions: number;
    totalAssetsMillions: number;
  };
  beforeAfter: {
    before: string;
    after: string;
  };
  citations: string[];
  limitations: string[];
  /** Inputs for legacy `analyzeMultiPathTransaction` (NOT_CERTIFIED_4E). */
  legacy: {
    items: CovenantSummaryItem[];
    approvals: ReviewerApproval[];
    permissions: CompiledPermissionInput[];
    financials: FinancialForPaths;
  };
  /**
   * FIXTURE_IR descriptors for the Phase-4 capacity path.
   * Absolute USD amounts — not millions. Not authentic customer IR.
   */
  fixtureIr: {
    rules: Array<{
      ruleId: string;
      sectionRef: string;
      family: "INDEBTEDNESS" | "LIENS" | "RESTRICTED_PAYMENTS" | "INVESTMENTS";
      action: "INCUR_DEBT" | "GRANT_LIEN" | "PAY_DIVIDEND" | "MAKE_INVESTMENT";
      /** Flat USD capacity when set; mutually exclusive with ebitdaPct for these demos. */
      flatUsd: number | null;
      /** When set, capacity = ebitdaPct × Consolidated EBITDA from APPROVED snapshot. */
      ebitdaPct: number | null;
    }>;
    ledgerUsages: Array<{
      usageId: string;
      ruleId: string;
      amountUsd: number;
      effectiveAsOf: string;
    }>;
    /**
     * When true, the harness must NOT invent a VerifiedUnitArtifact —
     * record NO_VERIFIED_EXECUTION_PACKAGE (e.g. reclassification needs
     * election semantics beyond a simple capacity package).
     */
    blockVerifiedPackage?: boolean;
    blockReason?: string;
  };
}

function synthItem(
  partial: Pick<CovenantSummaryItem, "sectionRef" | "heading" | "plainEnglish"> &
    Partial<CovenantSummaryItem>,
): CovenantSummaryItem {
  return {
    category: "DEBT_INCURRENCE",
    categoryLabel: "Debt Incurrence (SYNTHETIC)",
    posture: "PERMISSION",
    restriction: null,
    permissions: [],
    coveredEntities: ["Borrower"],
    exceptions: [],
    conditions: [],
    materialBasketsThresholds: [],
    draftingPatterns: [],
    operativeLanguageExcerpt: `[SYNTHETIC] ${partial.plainEnglish}`,
    sourceCitation: `§${partial.sectionRef} (SYNTHETIC CONMED-form-inspired)`,
    governingAgreement: "SYNTHETIC Credit Agreement (CONMED-form-inspired fixture)",
    families: [],
    relatedDefinedTerms: [],
    applicableDefinitions: [],
    entityScope: {
      borrower: true,
      guarantor: false,
      restrictedSubsidiary: true,
      unrestrictedSubsidiary: false,
      notes: ["SYNTHETIC entity scope"],
    },
    crossReferences: [],
    dependencies: [],
    epistemicStatus: "STRUCTURE_ONLY",
    interpretationNote: "SYNTHETIC demo item — not authentic customer interpretation",
    unresolvedQuestions: [],
    analysis: {
      plainEnglish: partial.plainEnglish,
      conditions: partial.conditions ?? [],
      exceptions: [],
      definedTerms: [],
      openQuestions: [],
    } as CovenantSummaryItem["analysis"],
    ...partial,
  } as CovenantSummaryItem;
}

function approval(sectionRef: string): ReviewerApproval {
  return {
    sourceId: "synthetic-demo",
    sectionRef,
    category: "NEGATIVE_COVENANTS",
    decision: "ACCEPTED",
    reviewedAt: "2026-07-15T12:00:00.000Z",
    reviewerLabel: "SYNTHETIC counsel fixture",
    version: 1,
  };
}

function perm(
  id: string,
  sectionRef: string,
  grantType: string,
  formulaType: string,
  thresholdValue: number,
  action: string,
  params: CompiledPermissionInput["params"] = null,
): CompiledPermissionInput {
  return {
    id,
    code: `synth:demo:${sectionRef}:${grantType}`,
    grantType,
    sectionRef,
    formulaType,
    thresholdValue,
    params,
    action,
    modelingStatus: "MODELED",
  };
}

const BASE_FIN: FinancialForPaths = {
  ebitda: 125,
  cash: 40,
  interestExpense: 35,
  cumulativeNetIncome: 180,
  equityProceedsSinceIssue: 40,
  assumedNewDebtRatePct: 6.5,
  totalDebt: 412.5,
  securedDebt: 300,
  totalAssets: 2800,
};

const COMMON_LIMITATIONS = [
  "SYNTHETIC exercise — invented company, sections, and numbers",
  "FIXTURE_IR is hand-built for demo comparison — not Phase 3 certified customer IR",
  "Legacy multipath authority is LEGACY_ENGINE_MULTIPATH / NOT_CERTIFIED_4E",
  "Do not present this harness as customer Phase 3 IR certification",
];

export const DEMO_EXERCISES: DemoExercise[] = [
  {
    id: "secured-borrowing-100m",
    title: "$100M secured borrowing",
    label: DEMO_LABEL,
    irLabel: DEMO_IR_LABEL,
    applicableCutoff: {
      evaluationDate: DEMO_EVALUATION_DATE,
      reportingPeriodKey: DEMO_CUTOFF_PERIOD,
      snapshotAsOf: DEMO_SNAPSHOT_AS_OF,
      selector: "MOST_RECENTLY_ENDED_FISCAL_QUARTER",
    },
    transaction: {
      amountMillions: 100,
      kind: "SECURED_DEBT",
      secured: true,
      label: "SYNTHETIC $100M secured borrowing",
    },
    governingProvisions: [
      { sectionRef: "7.01(b)", heading: "General Indebtedness basket", role: "debt path" },
      { sectionRef: "7.01(c)", heading: "Ratio / EBITDA grower debt", role: "debt path" },
      { sectionRef: "7.02(a)", heading: "General Liens basket", role: "lien path" },
    ],
    availablePaths: ["GENERAL_DEBT", "RATIO_DEBT", "GENERAL_LIEN"],
    conditions: [
      "No Event of Default (SYNTHETIC assumption)",
      "Secured incurrence requires debt ∩ lien permission",
    ],
    capacity: {
      grossMillions: 84,
      remainingMillions: 84,
      note: "SYNTHETIC placeholder: greater-of $50M / 3% CTA ≈ $84M on legacy; FIXTURE_IR may differ",
    },
    historicalUsage: [],
    proForma: {
      description: "SYNTHETIC base case at FY2026-Q2 cutoff",
      ebitdaMillions: 125,
      totalDebtMillions: 412.5,
      securedDebtMillions: 300,
      totalAssetsMillions: 2800,
    },
    beforeAfter: {
      before: "No incremental secured debt drawn on general basket (SYNTHETIC)",
      after: "Propose +$100M secured — compare legacy multipath vs FIXTURE_IR remaining",
    },
    citations: ["§7.01(b)", "§7.01(c)", "§7.02(a)"],
    limitations: [
      ...COMMON_LIMITATIONS,
      "Stacking of general + ratio debt baskets is NOT assumed",
    ],
    legacy: {
      items: [
        synthItem({
          sectionRef: "7.01(b)",
          heading: "Limitation on Indebtedness — general basket",
          plainEnglish:
            "General debt basket greater of $50M and 3% of Consolidated Total Assets",
          materialBasketsThresholds: [
            "Greater-of basket: $50,000,000 and 3.0% of Consolidated Total Assets",
          ],
          conditions: ["No Default or Event of Default"],
        }),
        synthItem({
          sectionRef: "7.01(c)",
          heading: "Ratio debt",
          plainEnglish:
            "Ratio indebtedness so long as Total Net Leverage does not exceed 5.0 to 1.00",
          materialBasketsThresholds: ["5.0 to 1.00 Total Net Leverage"],
        }),
        synthItem({
          category: "LIENS_SECURED_DEBT",
          categoryLabel: "Liens (SYNTHETIC)",
          sectionRef: "7.02(a)",
          heading: "Limitation on Liens — general",
          plainEnglish: "General lien basket greater of $50M and 3% of CTA",
          materialBasketsThresholds: [
            "Greater-of basket: $50,000,000 and 3.0% of Consolidated Total Assets",
          ],
        }),
      ],
      approvals: [approval("7.01(b)"), approval("7.02(a)")],
      permissions: [
        perm(
          "p-debt-701b",
          "7.01(b)",
          "DEBT_INCURRENCE",
          "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS",
          50,
          "General debt",
          { pctTotalAssets: 0.03 },
        ),
        perm(
          "p-lien-702a",
          "7.02(a)",
          "LIEN",
          "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS",
          50,
          "General lien",
          { pctTotalAssets: 0.03 },
        ),
      ],
      financials: { ...BASE_FIN },
    },
    fixtureIr: {
      rules: [
        {
          ruleId: "rule:synth-7.01(b)",
          sectionRef: "7.01(b)",
          family: "INDEBTEDNESS",
          action: "INCUR_DEBT",
          flatUsd: 50_000_000,
          ebitdaPct: null,
        },
        {
          ruleId: "rule:synth-7.01(c)",
          sectionRef: "7.01(c)",
          family: "INDEBTEDNESS",
          action: "INCUR_DEBT",
          flatUsd: null,
          ebitdaPct: 0.2,
        },
        {
          ruleId: "rule:synth-7.02(a)",
          sectionRef: "7.02(a)",
          family: "LIENS",
          action: "GRANT_LIEN",
          flatUsd: 50_000_000,
          ebitdaPct: null,
        },
      ],
      ledgerUsages: [],
    },
  },
  {
    id: "restricted-payment-75m",
    title: "$75M restricted payment",
    label: DEMO_LABEL,
    irLabel: DEMO_IR_LABEL,
    applicableCutoff: {
      evaluationDate: DEMO_EVALUATION_DATE,
      reportingPeriodKey: DEMO_CUTOFF_PERIOD,
      snapshotAsOf: DEMO_SNAPSHOT_AS_OF,
      selector: "MOST_RECENTLY_ENDED_FISCAL_QUARTER",
    },
    transaction: {
      amountMillions: 75,
      kind: "RESTRICTED_PAYMENT",
      secured: false,
      label: "SYNTHETIC $75M restricted payment",
    },
    governingProvisions: [
      { sectionRef: "7.06(a)", heading: "General RP basket", role: "fixed RP" },
      { sectionRef: "7.06(b)", heading: "Builder / Available Amount", role: "builder RP" },
    ],
    availablePaths: ["FIXED_RP", "BUILDER_RP"],
    conditions: ["RP builder Available Amount inputs supplied as SYNTHETIC financials"],
    capacity: {
      grossMillions: 25,
      remainingMillions: 25,
      note: "SYNTHETIC: fixed RP $25M; builder path conditional without full Available Amount model on FIXTURE_IR",
    },
    historicalUsage: [
      {
        sectionRef: "7.06(a)",
        amountMillions: 5,
        effectiveAsOf: "2026-03-01",
        note: "SYNTHETIC prior dividend",
      },
    ],
    proForma: {
      description: "SYNTHETIC RP case",
      ebitdaMillions: 125,
      totalDebtMillions: 412.5,
      securedDebtMillions: 300,
      totalAssetsMillions: 2800,
    },
    beforeAfter: {
      before: "$5M YTD RP on general basket (SYNTHETIC)",
      after: "Propose +$75M RP — fixed alone insufficient; builder may allocate if expressly shared",
    },
    citations: ["§7.06(a)", "§7.06(b)"],
    limitations: [
      ...COMMON_LIMITATIONS,
      "Builder Available Amount on FIXTURE_IR is a flat stand-in, not a full builder formula",
    ],
    legacy: {
      items: [
        synthItem({
          category: "RESTRICTED_PAYMENTS_INVESTMENTS",
          categoryLabel: "Restricted Payments (SYNTHETIC)",
          sectionRef: "7.06(a)",
          heading: "Restricted Payments — general",
          plainEnglish: "General RP basket $25M",
          materialBasketsThresholds: ["Amount/threshold: $25,000,000"],
        }),
        synthItem({
          category: "RESTRICTED_PAYMENTS_INVESTMENTS",
          categoryLabel: "Restricted Payments (SYNTHETIC)",
          sectionRef: "7.06(b)",
          heading: "Restricted Payments — Available Amount builder",
          plainEnglish: "Builder Available Amount / cumulative credit basket",
          materialBasketsThresholds: ["Available Amount builder basket"],
        }),
      ],
      approvals: [approval("7.06(a)")],
      permissions: [
        perm(
          "p-rp-706a",
          "7.06(a)",
          "RESTRICTED_PAYMENT",
          "FLAT_AMOUNT",
          25,
          "General RP",
        ),
      ],
      financials: { ...BASE_FIN },
    },
    fixtureIr: {
      rules: [
        {
          ruleId: "rule:synth-7.06(a)",
          sectionRef: "7.06(a)",
          family: "RESTRICTED_PAYMENTS",
          action: "PAY_DIVIDEND",
          flatUsd: 25_000_000,
          ebitdaPct: null,
        },
        {
          ruleId: "rule:synth-7.06(b)",
          sectionRef: "7.06(b)",
          family: "RESTRICTED_PAYMENTS",
          action: "PAY_DIVIDEND",
          flatUsd: 40_000_000,
          ebitdaPct: null,
        },
      ],
      ledgerUsages: [
        {
          usageId: "usage-synth-rp-1",
          ruleId: "rule:synth-7.06(a)",
          amountUsd: 5_000_000,
          effectiveAsOf: "2026-03-01",
        },
      ],
    },
  },
  {
    id: "acquisition-financing-150m",
    title: "$150M acquisition financing",
    label: DEMO_LABEL,
    irLabel: DEMO_IR_LABEL,
    applicableCutoff: {
      evaluationDate: DEMO_EVALUATION_DATE,
      reportingPeriodKey: DEMO_CUTOFF_PERIOD,
      snapshotAsOf: DEMO_SNAPSHOT_AS_OF,
      selector: "MOST_RECENTLY_ENDED_FISCAL_QUARTER",
    },
    transaction: {
      amountMillions: 150,
      kind: "ACQUISITION",
      secured: true,
      label: "SYNTHETIC $150M acquisition financing",
    },
    governingProvisions: [
      { sectionRef: "7.01(d)", heading: "Acquisition Indebtedness", role: "acquisition debt" },
      { sectionRef: "7.01(b)", heading: "General Indebtedness", role: "fallback debt" },
      { sectionRef: "7.08(a)", heading: "Investments", role: "investment path" },
      { sectionRef: "7.02(a)", heading: "Liens", role: "lien path" },
    ],
    availablePaths: ["ACQUISITION_DEBT", "GENERAL_DEBT", "FIXED_INVESTMENT", "GENERAL_LIEN"],
    conditions: [
      "Target becomes Restricted Subsidiary (SYNTHETIC assumption)",
      "Do not assume free stacking across debt + investment baskets",
    ],
    capacity: {
      grossMillions: 100,
      remainingMillions: 100,
      note: "SYNTHETIC acquisition debt basket $100M — alone insufficient for $150M",
    },
    historicalUsage: [],
    proForma: {
      description: "SYNTHETIC acquisition case",
      ebitdaMillions: 125,
      totalDebtMillions: 412.5,
      securedDebtMillions: 300,
      totalAssetsMillions: 2800,
    },
    beforeAfter: {
      before: "No acquisition debt outstanding under §7.01(d) (SYNTHETIC)",
      after: "Propose $150M — enumerate multipath; FIXTURE_IR shows standalone remainings",
    },
    citations: ["§7.01(d)", "§7.01(b)", "§7.08(a)", "§7.02(a)"],
    limitations: [...COMMON_LIMITATIONS],
    legacy: {
      items: [
        synthItem({
          sectionRef: "7.01(d)",
          heading: "Acquisition Indebtedness",
          plainEnglish: "Acquisition debt basket $100M",
          materialBasketsThresholds: ["Amount/threshold: $100,000,000", "Acquisition Indebtedness"],
        }),
        synthItem({
          sectionRef: "7.01(b)",
          heading: "General Indebtedness",
          plainEnglish: "General debt greater of $50M and 3% CTA",
          materialBasketsThresholds: [
            "Greater-of basket: $50,000,000 and 3.0% of Consolidated Total Assets",
          ],
        }),
        synthItem({
          category: "RESTRICTED_PAYMENTS_INVESTMENTS",
          categoryLabel: "Investments (SYNTHETIC)",
          sectionRef: "7.08(a)",
          heading: "Investments — general",
          plainEnglish: "General investment basket $50M",
          materialBasketsThresholds: ["Amount/threshold: $50,000,000"],
        }),
        synthItem({
          category: "LIENS_SECURED_DEBT",
          categoryLabel: "Liens (SYNTHETIC)",
          sectionRef: "7.02(a)",
          heading: "Liens — general",
          plainEnglish: "General lien basket $50M / 3% CTA",
          materialBasketsThresholds: [
            "Greater-of basket: $50,000,000 and 3.0% of Consolidated Total Assets",
          ],
        }),
      ],
      approvals: [approval("7.01(d)"), approval("7.08(a)")],
      permissions: [
        perm(
          "p-acq-701d",
          "7.01(d)",
          "DEBT_INCURRENCE",
          "FLAT_AMOUNT",
          100,
          "Acquisition debt",
        ),
        perm(
          "p-inv-708a",
          "7.08(a)",
          "INVESTMENT",
          "FLAT_AMOUNT",
          50,
          "General investment",
        ),
        perm(
          "p-lien-702a-acq",
          "7.02(a)",
          "LIEN",
          "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS",
          50,
          "General lien",
          { pctTotalAssets: 0.03 },
        ),
      ],
      financials: { ...BASE_FIN },
    },
    fixtureIr: {
      rules: [
        {
          ruleId: "rule:synth-7.01(d)",
          sectionRef: "7.01(d)",
          family: "INDEBTEDNESS",
          action: "INCUR_DEBT",
          flatUsd: 100_000_000,
          ebitdaPct: null,
        },
        {
          ruleId: "rule:synth-7.01(b)-acq",
          sectionRef: "7.01(b)",
          family: "INDEBTEDNESS",
          action: "INCUR_DEBT",
          flatUsd: 50_000_000,
          ebitdaPct: null,
        },
        {
          ruleId: "rule:synth-7.08(a)",
          sectionRef: "7.08(a)",
          family: "INVESTMENTS",
          action: "MAKE_INVESTMENT",
          flatUsd: 50_000_000,
          ebitdaPct: null,
        },
      ],
      ledgerUsages: [],
    },
  },
  {
    id: "ebitda-decline",
    title: "EBITDA decline",
    label: DEMO_LABEL,
    irLabel: DEMO_IR_LABEL,
    applicableCutoff: {
      evaluationDate: DEMO_EVALUATION_DATE,
      reportingPeriodKey: DEMO_CUTOFF_PERIOD,
      snapshotAsOf: DEMO_SNAPSHOT_AS_OF,
      selector: "MOST_RECENTLY_ENDED_FISCAL_QUARTER",
    },
    transaction: {
      amountMillions: 100,
      kind: "SECURED_DEBT",
      secured: true,
      label: "SYNTHETIC EBITDA −20% stress on $100M secured",
    },
    governingProvisions: [
      { sectionRef: "7.01(c)", heading: "EBITDA % grower debt", role: "stressed path" },
      { sectionRef: "7.01(b)", heading: "General debt", role: "flat path" },
    ],
    availablePaths: ["RATIO_DEBT", "GENERAL_DEBT", "GENERAL_LIEN"],
    conditions: [
      "Stress applies −20% to EBITDA in legacy financials only",
      "FIXTURE_IR still binds the APPROVED snapshot EBITDA unless a new APPROVED pack is proposed",
    ],
    capacity: {
      grossMillions: null,
      remainingMillions: null,
      note: "SYNTHETIC stress case — compare legacy stressed fin vs certified pack at cutoff",
    },
    historicalUsage: [],
    proForma: {
      description: "SYNTHETIC stress: EBITDA 125 → 100 (−20%)",
      ebitdaMillions: 100,
      totalDebtMillions: 412.5,
      securedDebtMillions: 300,
      totalAssetsMillions: 2800,
    },
    beforeAfter: {
      before: "Base EBITDA $125M (SYNTHETIC)",
      after: "Stressed EBITDA $100M on legacy path; FIXTURE_IR still sees APPROVED $125M unless re-certified",
    },
    citations: ["§7.01(b)", "§7.01(c)"],
    limitations: [
      ...COMMON_LIMITATIONS,
      "Legacy stress mutates FinancialForPaths; certified path does not invent a DRAFT override",
    ],
    legacy: {
      items: [
        synthItem({
          sectionRef: "7.01(b)",
          heading: "General debt",
          plainEnglish: "General debt greater of $50M and 3% CTA",
          materialBasketsThresholds: [
            "Greater-of basket: $50,000,000 and 3.0% of Consolidated Total Assets",
          ],
        }),
        synthItem({
          sectionRef: "7.01(c)",
          heading: "EBITDA grower debt",
          plainEnglish: "Debt not to exceed 20% of Consolidated EBITDA",
          materialBasketsThresholds: ["20% of Consolidated EBITDA"],
        }),
        synthItem({
          category: "LIENS_SECURED_DEBT",
          categoryLabel: "Liens (SYNTHETIC)",
          sectionRef: "7.02(a)",
          heading: "General liens",
          plainEnglish: "General lien basket",
          materialBasketsThresholds: [
            "Greater-of basket: $50,000,000 and 3.0% of Consolidated Total Assets",
          ],
        }),
      ],
      approvals: [approval("7.01(b)"), approval("7.01(c)")],
      permissions: [
        perm(
          "p-debt-701b-stress",
          "7.01(b)",
          "DEBT_INCURRENCE",
          "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS",
          50,
          "General debt",
          { pctTotalAssets: 0.03 },
        ),
        perm(
          "p-debt-701c-stress",
          "7.01(c)",
          "DEBT_INCURRENCE",
          "GREATER_OF_FLAT_OR_PCT_EBITDA",
          0,
          "EBITDA grower debt",
          { pctEbitda: 0.2 },
        ),
        perm(
          "p-lien-stress",
          "7.02(a)",
          "LIEN",
          "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS",
          50,
          "General lien",
          { pctTotalAssets: 0.03 },
        ),
      ],
      financials: { ...BASE_FIN, ebitda: 100 },
    },
    fixtureIr: {
      rules: [
        {
          ruleId: "rule:synth-stress-7.01(b)",
          sectionRef: "7.01(b)",
          family: "INDEBTEDNESS",
          action: "INCUR_DEBT",
          flatUsd: 50_000_000,
          ebitdaPct: null,
        },
        {
          ruleId: "rule:synth-stress-7.01(c)",
          sectionRef: "7.01(c)",
          family: "INDEBTEDNESS",
          action: "INCUR_DEBT",
          flatUsd: null,
          ebitdaPct: 0.2,
        },
      ],
      ledgerUsages: [],
    },
  },
  {
    id: "amendment-basket-capacity",
    title: "Amendment changing basket capacity",
    label: DEMO_LABEL,
    irLabel: DEMO_IR_LABEL,
    applicableCutoff: {
      evaluationDate: DEMO_EVALUATION_DATE,
      reportingPeriodKey: DEMO_CUTOFF_PERIOD,
      snapshotAsOf: DEMO_SNAPSHOT_AS_OF,
      selector: "MOST_RECENTLY_ENDED_FISCAL_QUARTER",
    },
    transaction: {
      amountMillions: 100,
      kind: "SECURED_DEBT",
      secured: true,
      label: "SYNTHETIC amendment: general basket $50M → $120M",
    },
    governingProvisions: [
      {
        sectionRef: "7.01(b)",
        heading: "General Indebtedness (as amended)",
        role: "post-amendment debt",
      },
      { sectionRef: "7.02(a)", heading: "Liens", role: "lien path" },
    ],
    availablePaths: ["GENERAL_DEBT", "GENERAL_LIEN"],
    conditions: [
      "Counsel recompiled Permission after amendment (SYNTHETIC)",
      "FIXTURE_IR reflects post-amendment flat $120M — identity versions must match verification",
    ],
    capacity: {
      grossMillions: 120,
      remainingMillions: 120,
      note: "SYNTHETIC post-amendment capacity",
    },
    historicalUsage: [],
    proForma: {
      description: "SYNTHETIC post-amendment",
      ebitdaMillions: 125,
      totalDebtMillions: 412.5,
      securedDebtMillions: 300,
      totalAssetsMillions: 2800,
    },
    beforeAfter: {
      before: "Pre-amendment general basket $50M / 3% CTA (SYNTHETIC)",
      after: "Post-amendment flat $120M Permission + FIXTURE_IR MONEY(120M)",
    },
    citations: ["§7.01(b) (as amended)", "§7.02(a)"],
    limitations: [...COMMON_LIMITATIONS, "Amendment text itself is not ingested — capacity is re-stated"],
    legacy: {
      items: [
        synthItem({
          sectionRef: "7.01(b)",
          heading: "General Indebtedness (amended)",
          plainEnglish: "As amended: general debt basket $120M flat",
          materialBasketsThresholds: ["Amount/threshold: $120,000,000"],
        }),
        synthItem({
          category: "LIENS_SECURED_DEBT",
          categoryLabel: "Liens (SYNTHETIC)",
          sectionRef: "7.02(a)",
          heading: "General liens",
          plainEnglish: "General lien basket $50M / 3% CTA",
          materialBasketsThresholds: [
            "Greater-of basket: $50,000,000 and 3.0% of Consolidated Total Assets",
          ],
        }),
      ],
      approvals: [approval("7.01(b)")],
      permissions: [
        perm(
          "p-debt-amended",
          "7.01(b)",
          "DEBT_INCURRENCE",
          "FLAT_AMOUNT",
          120,
          "General debt (amended)",
        ),
        perm(
          "p-lien-amended",
          "7.02(a)",
          "LIEN",
          "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS",
          50,
          "General lien",
          { pctTotalAssets: 0.03 },
        ),
      ],
      financials: { ...BASE_FIN },
    },
    fixtureIr: {
      rules: [
        {
          ruleId: "rule:synth-amended-7.01(b)",
          sectionRef: "7.01(b)",
          family: "INDEBTEDNESS",
          action: "INCUR_DEBT",
          flatUsd: 120_000_000,
          ebitdaPct: null,
        },
      ],
      ledgerUsages: [],
    },
  },
  {
    id: "historical-basket-consumption",
    title: "Historical basket consumption",
    label: DEMO_LABEL,
    irLabel: DEMO_IR_LABEL,
    applicableCutoff: {
      evaluationDate: DEMO_EVALUATION_DATE,
      reportingPeriodKey: DEMO_CUTOFF_PERIOD,
      snapshotAsOf: DEMO_SNAPSHOT_AS_OF,
      selector: "MOST_RECENTLY_ENDED_FISCAL_QUARTER",
    },
    transaction: {
      amountMillions: 40,
      kind: "SECURED_DEBT",
      secured: true,
      label: "SYNTHETIC $40M secured after historical consumption",
    },
    governingProvisions: [
      { sectionRef: "7.01(b)", heading: "General Indebtedness", role: "consumed basket" },
    ],
    availablePaths: ["GENERAL_DEBT", "GENERAL_LIEN"],
    conditions: [
      "Ledger usages attributed and APPROVED (SYNTHETIC)",
      "Legacy multipath Permissions do not subtract ledger — discrepancy expected",
    ],
    capacity: {
      grossMillions: 50,
      remainingMillions: 32,
      note: "SYNTHETIC: $50M gross − $18M ledger = $32M remaining on FIXTURE_IR",
    },
    historicalUsage: [
      {
        sectionRef: "7.01(b)",
        amountMillions: 12,
        effectiveAsOf: "2026-03-15",
        note: "SYNTHETIC usage-1",
      },
      {
        sectionRef: "7.01(b)",
        amountMillions: 6,
        effectiveAsOf: "2026-07-01",
        note: "SYNTHETIC usage-2",
      },
    ],
    proForma: {
      description: "SYNTHETIC after $18M historical consumption",
      ebitdaMillions: 125,
      totalDebtMillions: 412.5,
      securedDebtMillions: 300,
      totalAssetsMillions: 2800,
    },
    beforeAfter: {
      before: "Gross $50M; ledger $18M attributed (SYNTHETIC)",
      after: "Propose +$40M — FIXTURE_IR remaining $32M may be INSUFFICIENT; legacy may still show gross",
    },
    citations: ["§7.01(b)", "certificate basket schedule (SYNTHETIC)"],
    limitations: [
      ...COMMON_LIMITATIONS,
      "Legacy covenant-engine Permissions are not ledger-aware — expected discrepancy vs 4C",
    ],
    legacy: {
      items: [
        synthItem({
          sectionRef: "7.01(b)",
          heading: "General Indebtedness",
          plainEnglish: "General debt basket $50M flat",
          materialBasketsThresholds: ["Amount/threshold: $50,000,000"],
        }),
        synthItem({
          category: "LIENS_SECURED_DEBT",
          categoryLabel: "Liens (SYNTHETIC)",
          sectionRef: "7.02(a)",
          heading: "General liens",
          plainEnglish: "General lien $50M",
          materialBasketsThresholds: ["Amount/threshold: $50,000,000"],
        }),
      ],
      approvals: [approval("7.01(b)")],
      permissions: [
        perm(
          "p-hist-701b",
          "7.01(b)",
          "DEBT_INCURRENCE",
          "FLAT_AMOUNT",
          50,
          "General debt",
        ),
        perm("p-hist-lien", "7.02(a)", "LIEN", "FLAT_AMOUNT", 50, "General lien"),
      ],
      financials: { ...BASE_FIN },
    },
    fixtureIr: {
      rules: [
        {
          ruleId: "rule:synth-hist-7.01(b)",
          sectionRef: "7.01(b)",
          family: "INDEBTEDNESS",
          action: "INCUR_DEBT",
          flatUsd: 50_000_000,
          ebitdaPct: null,
        },
      ],
      ledgerUsages: [
        {
          usageId: "usage-synth-hist-1",
          ruleId: "rule:synth-hist-7.01(b)",
          amountUsd: 12_000_000,
          effectiveAsOf: "2026-03-15",
        },
        {
          usageId: "usage-synth-hist-2",
          ruleId: "rule:synth-hist-7.01(b)",
          amountUsd: 6_000_000,
          effectiveAsOf: "2026-07-01",
        },
      ],
    },
  },
  {
    id: "reclassification",
    title: "Reclassification",
    label: DEMO_LABEL,
    irLabel: DEMO_IR_LABEL,
    applicableCutoff: {
      evaluationDate: DEMO_EVALUATION_DATE,
      reportingPeriodKey: DEMO_CUTOFF_PERIOD,
      snapshotAsOf: DEMO_SNAPSHOT_AS_OF,
      selector: "MOST_RECENTLY_ENDED_FISCAL_QUARTER",
    },
    transaction: {
      amountMillions: 50,
      kind: "RESTRICTED_PAYMENT",
      secured: false,
      label: "SYNTHETIC reclassification of historical usage (express only)",
    },
    governingProvisions: [
      { sectionRef: "7.06(a)", heading: "General RP", role: "source basket" },
      { sectionRef: "7.06(b)", heading: "Builder RP", role: "destination basket" },
    ],
    availablePaths: ["FIXED_RP", "BUILDER_RP"],
    conditions: [
      "Reclassification only if expressly permitted — do not invent election authority",
      "Verified reclassification package is intentionally blocked in this demo",
    ],
    capacity: {
      grossMillions: 25,
      remainingMillions: null,
      note: "SYNTHETIC: reclassification election not certified in this harness",
    },
    historicalUsage: [
      {
        sectionRef: "7.06(a)",
        amountMillions: 10,
        effectiveAsOf: "2026-04-01",
        note: "SYNTHETIC usage candidate for reclassification — election not executed",
      },
    ],
    proForma: {
      description: "SYNTHETIC reclassification case",
      ebitdaMillions: 125,
      totalDebtMillions: 412.5,
      securedDebtMillions: 300,
      totalAssetsMillions: 2800,
    },
    beforeAfter: {
      before: "$10M recorded on §7.06(a) (SYNTHETIC)",
      after: "Reclassification to §7.06(b) withheld — NO_VERIFIED_EXECUTION_PACKAGE for election path",
    },
    citations: ["§7.06(a)", "§7.06(b)"],
    limitations: [
      ...COMMON_LIMITATIONS,
      "Reclassification requires express contractual election + Phase 4D APPLY_RECLASSIFICATION — not faked here",
    ],
    legacy: {
      items: [
        synthItem({
          category: "RESTRICTED_PAYMENTS_INVESTMENTS",
          categoryLabel: "Restricted Payments (SYNTHETIC)",
          sectionRef: "7.06(a)",
          heading: "General RP",
          plainEnglish: "General RP basket $25M",
          materialBasketsThresholds: ["Amount/threshold: $25,000,000"],
        }),
        synthItem({
          category: "RESTRICTED_PAYMENTS_INVESTMENTS",
          categoryLabel: "Restricted Payments (SYNTHETIC)",
          sectionRef: "7.06(b)",
          heading: "Builder RP",
          plainEnglish: "Available Amount builder basket",
          materialBasketsThresholds: ["Available Amount builder basket"],
        }),
      ],
      approvals: [approval("7.06(a)")],
      permissions: [
        perm("p-reclass-rp", "7.06(a)", "RESTRICTED_PAYMENT", "FLAT_AMOUNT", 25, "General RP"),
      ],
      financials: { ...BASE_FIN },
    },
    fixtureIr: {
      rules: [
        {
          ruleId: "rule:synth-reclass-7.06(a)",
          sectionRef: "7.06(a)",
          family: "RESTRICTED_PAYMENTS",
          action: "PAY_DIVIDEND",
          flatUsd: 25_000_000,
          ebitdaPct: null,
        },
      ],
      ledgerUsages: [],
      blockVerifiedPackage: true,
      blockReason:
        "NO_VERIFIED_EXECUTION_PACKAGE: reclassification election semantics are not honestly packaged as a simple verified capacity unit in this SYNTHETIC demo — incomplete verification rather than a faked PASS",
    },
  },
];

export function getDemoExercise(id: DemoExerciseId): DemoExercise {
  const ex = DEMO_EXERCISES.find((e) => e.id === id);
  if (!ex) throw new Error(`Unknown SYNTHETIC demo exercise: ${id}`);
  return ex;
}

/** Structured discrepancy between legacy multipath and certified/fixture capacity. */
export interface CapacityDiscrepancy {
  exerciseId: DemoExerciseId;
  pathOrRule: string;
  field: string;
  legacyValue: number | string | null;
  certifiedValue: number | string | null;
  note: string;
}

export interface ExerciseComparisonRow {
  exerciseId: DemoExerciseId;
  title: string;
  label: typeof DEMO_LABEL;
  applicableCutoff: DemoExercise["applicableCutoff"];
  legacyAuthority: typeof DEMO_LEGACY_AUTHORITY | "AI_PROPOSED_ONLY";
  legacyNotCertifiedLabel: typeof DEMO_NOT_CERTIFIED;
  legacy: {
    pathCount: number;
    sufficientSingle: Array<{ sectionRef: string; family: string; capacityMillions: number | null }>;
    partial: Array<{ sectionRef: string; family: string; capacityMillions: number | null }>;
    narrative: string;
    stackingAssumed: false;
  };
  certified: {
    ran: boolean;
    irLabel: typeof DEMO_IR_LABEL;
    blocker: string | null;
    outcome: string | null;
    capacities: Array<{
      ruleId: string;
      status: string;
      grossUsd: number | null;
      remainingUsd: number | null;
      usageUsd: number | null;
    }>;
    coverageComplete: boolean | null;
  };
  discrepancies: CapacityDiscrepancy[];
  limitations: string[];
}

export interface CertifiedVsLegacyDemoReport {
  schema: "product.certified-vs-legacy-demo.v1";
  label: typeof DEMO_LABEL;
  irLabel: typeof DEMO_IR_LABEL;
  generatedAt: string;
  companyId: string;
  instrumentKey: string;
  note: string;
  exercises: ExerciseComparisonRow[];
  discrepancies: CapacityDiscrepancy[];
  summary: {
    exerciseCount: number;
    discrepancyCount: number;
    verifiedExecutionRan: number;
    verifiedExecutionBlocked: number;
    legacyAlwaysNotCertified4E: true;
  };
}

export function buildDemoReportShell(rows: ExerciseComparisonRow[]): CertifiedVsLegacyDemoReport {
  const discrepancies = rows.flatMap((r) => r.discrepancies);
  return {
    schema: "product.certified-vs-legacy-demo.v1",
    label: DEMO_LABEL,
    irLabel: DEMO_IR_LABEL,
    generatedAt: new Date().toISOString(),
    companyId: DEMO_COMPANY_ID,
    instrumentKey: DEMO_INSTRUMENT_KEY,
    note:
      "SYNTHETIC CONMED-form-inspired comparison harness. FIXTURE_IR is hand-built. Legacy multipath remains LEGACY_ENGINE_MULTIPATH / NOT_CERTIFIED_4E. This report does NOT certify Phase 3 customer IR.",
    exercises: rows,
    discrepancies,
    summary: {
      exerciseCount: rows.length,
      discrepancyCount: discrepancies.length,
      verifiedExecutionRan: rows.filter((r) => r.certified.ran).length,
      verifiedExecutionBlocked: rows.filter((r) => !r.certified.ran).length,
      legacyAlwaysNotCertified4E: true,
    },
  };
}

export function renderDemoReportMarkdown(report: CertifiedVsLegacyDemoReport): string {
  const lines: string[] = [
    "# Certified vs Legacy Demo Report",
    "",
    `**Label:** ${report.label} · **IR:** ${report.irLabel}`,
    "",
    report.note,
    "",
    `- Generated: ${report.generatedAt}`,
    `- Company (synthetic): \`${report.companyId}\``,
    `- Instrument (synthetic): \`${report.instrumentKey}\``,
    `- Exercises: ${report.summary.exerciseCount}`,
    `- Discrepancies recorded: ${report.summary.discrepancyCount}`,
    `- Verified-execution ran: ${report.summary.verifiedExecutionRan}`,
    `- Verified-execution blocked: ${report.summary.verifiedExecutionBlocked}`,
    `- Legacy authority: always \`${DEMO_NOT_CERTIFIED}\` / \`${DEMO_LEGACY_AUTHORITY}\``,
    "",
    "## Exercises",
    "",
  ];
  for (const ex of report.exercises) {
    lines.push(`### ${ex.title} (\`${ex.exerciseId}\`)`);
    lines.push("");
    lines.push(
      `- Cutoff: ${ex.applicableCutoff.reportingPeriodKey} as-of ${ex.applicableCutoff.snapshotAsOf}; eval ${ex.applicableCutoff.evaluationDate}`,
    );
    lines.push(
      `- Legacy: ${ex.legacyAuthority} · ${ex.legacyNotCertifiedLabel} · ${ex.legacy.pathCount} path(s)`,
    );
    lines.push(
      `- Certified/FIXTURE: ${ex.certified.ran ? `ran (${ex.certified.outcome})` : `blocked — ${ex.certified.blocker}`}`,
    );
    if (ex.discrepancies.length) {
      lines.push(`- Discrepancies (${ex.discrepancies.length}):`);
      for (const d of ex.discrepancies) {
        lines.push(
          `  - ${d.pathOrRule} / ${d.field}: legacy=${JSON.stringify(d.legacyValue)} vs certified=${JSON.stringify(d.certifiedValue)} — ${d.note}`,
        );
      }
    } else {
      lines.push("- Discrepancies: none recorded for this exercise");
    }
    lines.push("");
  }
  lines.push("## Limitations");
  lines.push("");
  lines.push("- Not authentic customer data");
  lines.push("- Not a Phase 3 customer IR certification claim");
  lines.push("- FIXTURE_IR verification artifacts are test-constructed STRONG identities, not live verifier output");
  lines.push("");
  return lines.join("\n");
}
