/**
 * Coherent Corp. (COHR) seed data, transcribed from the headroom-coherent.jsx
 * prototype's default state: FY2026 10-K financials, the 2029 Senior Notes
 * Indenture, and the Credit Agreement's maintenance covenants.
 *
 * Exported as plain objects so `prisma/seed.ts` (writes them into Postgres),
 * the engine's correctness test, and the app's UI-only display data (debt
 * tranches, ledger descriptions/sources, document caveats) share one source
 * of truth.
 */
import type { CompanyCovenantData, LedgerBasket, LedgerDirection } from "../lib/covenant-engine";

const COMPANY_ID = "coherent";
const CREDIT_AGREEMENT_ID = "coherent-credit-agreement-2022";
const INDENTURE_ID = "coherent-2029-notes-indenture";

export const COHERENT_COMPANY = {
  id: COMPANY_ID,
  name: "Coherent Corp.",
  ticker: "COHR",
  cik: "0000820318",
};

// Capital structure at 6/30/26. The engine only ever consumes the totalDebt/
// securedDebt aggregates below; these per-tranche rows exist purely for the
// Position tab's capital-structure table (see DebtTranche in schema.prisma).
export const COHERENT_TRANCHES = [
  { name: "Term Loan A due 2030", amt: 1141, secured: true, documentName: "Credit Agreement" },
  { name: "Term Loan B-3 due 2029", amt: 1080, secured: true, documentName: "Credit Agreement" },
  { name: "5.000% Senior Notes due 2029", amt: 990, secured: false, documentName: "2029 Notes Indenture" },
  {
    name: "Other subsidiary debt",
    amt: 47,
    secured: false,
    documentName: "June 2026 Facility / local lines / German loan",
  },
];
const TOTAL_DEBT = COHERENT_TRANCHES.reduce((s, t) => s + t.amt, 0);
const SECURED_DEBT = COHERENT_TRANCHES.filter((t) => t.secured).reduce((s, t) => s + t.amt, 0);

// Public-record ledger (§3.4 basket usage + informational debt/equity/asset-sale
// events). Only DIVIDEND/INVESTMENT entries feed the engine's RP waterfall math;
// the rest are display-only, same as the prototype's ledger tab.
export const COHERENT_LEDGER_ENTRIES: {
  date: string;
  description: string;
  basket: LedgerBasket;
  amount: number;
  direction: LedgerDirection;
  source: string;
}[] = [
  {
    date: "2026-03-02",
    description: "NVIDIA private placement — 7,788,161 shares at $256.80",
    basket: "EQUITY",
    amount: 1998,
    direction: "CREDIT",
    source: "8-K Item 3.02",
  },
  {
    date: "2025-09-02",
    description: "Sale of aerospace & defense business",
    basket: "ASSET_SALE",
    amount: 400,
    direction: "CREDIT",
    source: "10-K Note 7",
  },
  {
    date: "2026-01-30",
    description: "Sale of Munich, Germany product division",
    basket: "ASSET_SALE",
    amount: -96,
    direction: "CREDIT",
    source: "10-K Note 7",
  },
  {
    date: "2026-06-30",
    description: "TLB voluntary prepayments during FY26 ($502M of $509M total)",
    basket: "DEBT_REPAY",
    amount: 502,
    direction: "CREDIT",
    source: "10-K Liquidity",
  },
  {
    date: "2026-09-26",
    description: "Incremental Term A Loans drawn (Amendment No. 4)",
    basket: "DEBT_INCUR",
    amount: 1250,
    direction: "DEBIT",
    source: "8-K Item 1.01",
  },
];

export const LEDGER_BASKET_LABELS: Record<LedgerBasket, string> = {
  EQUITY: "Equity proceeds — indenture §3.4(a)(C)(3)-(4) / CA Available Amount",
  DEBT_INCUR: "Debt incurrence — indenture §3.3(b) / CA §2.21 incremental",
  DEBT_REPAY: "Debt repayment — reduces net leverage across both documents",
  ASSET_SALE: "Asset sale proceeds — CNI / Consolidated Net Income effect",
  DIVIDEND: "Dividend / buyback — draws the §3.4 RP pool (builder + general basket)",
  INVESTMENT: "Investment — draws the SAME §3.4 RP pool as dividends (§3.4(a)(iv))",
};

const CA_CAVEAT =
  "Verified from the executed agreement's table of contents: Financial Covenants at §6.11 (thresholds per 10-K disclosure — TNL ≤ 4.25x, IC ≥ 2.50x), Indebtedness §6.01, Liens §6.02, Compliance Certificate delivery §5.04(c), mandatory prepayments §2.11(b). The Available Amount builder (greater of $330M/25% EBITDA + 50% CNI + declined prepayments + equity proceeds) is confirmed real and near-identical to the indenture's §3.4 — but Investments (§6.04) and Restricted Payments (§6.06) are TWO SEPARATE covenants here, unlike the indenture, which bundles both under §3.4(a)(iv). Incremental facilities live in §2.21; the Incremental Amount's exact sizing wasn't in the fetch window.";

const INDENTURE_CAVEAT =
  "Terms extracted from the executed indenture (Dec 10, 2021). Basket usage since issue assumed zero except scheduled debt. Capacity shown is capped at the ratio ceiling — general/flat baskets (credit facilities grower, general debt, general liens) are real and larger individually (see Position tab) but are not stacked on top of the ratio test, so this tool never shows an incurrence as allowed if a ratio would be breached.";

export const NOT_TESTED_CAVEATS = {
  restrictedPayments:
    "Not tested here: the Credit Agreement separately restricts Restricted Payments under its own §6.06 — a different covenant from the indenture's, with baskets that weren't extracted. A \"Permitted\" verdict below only means the indenture allows it, not that both documents do.",
  investments:
    "Not tested here: unlike the indenture, the Credit Agreement treats Investments (§6.04) as a covenant separate from Restricted Payments (§6.06) — a real structural difference between the two documents. Neither section's basket sizes were extracted, so this verdict reflects the indenture only.",
  assetSale:
    "Not tested here: the Credit Agreement's mandatory prepayment provision (§2.11(b), confirmed in the executed agreement) separately requires up to 100% of net asset-sale proceeds to prepay the Term Loans, stepping with leverage per the September 2025 8-K — but the exact step-down grid lives inside §2.11(b)'s text, which wasn't in the fetch window.",
};

export const COHERENT_DATA: CompanyCovenantData = {
  companyId: COMPANY_ID,

  financials: {
    ebitda: 1700,
    cash: 1162,
    interestExpense: 190,
    cumulativeNetIncome: 520,
    equityProceedsSinceIssue: 2150,
    assumedNewDebtRatePct: 6.5,
    totalDebt: TOTAL_DEBT,
    securedDebt: SECURED_DEBT,
  },

  documents: [
    {
      id: CREDIT_AGREEMENT_ID,
      name: "Credit Agreement (2022, as amended)",
      type: "CREDIT_AGREEMENT",
      governs: "Term Loan A · Term Loan B-3 · $700M Revolver (undrawn)",
      // Maintenance covenants apply identically regardless of secured/unsecured status.
      capacityFormulas: {
        secured: { op: "MIN", items: [{ op: "REF", code: "ca_leverage_cap" }, { op: "REF", code: "ca_coverage_cap" }] },
        unsecured: { op: "MIN", items: [{ op: "REF", code: "ca_leverage_cap" }, { op: "REF", code: "ca_coverage_cap" }] },
      },
    },
    {
      id: INDENTURE_ID,
      name: "2029 Senior Notes Indenture",
      type: "INDENTURE",
      governs: "$990M 5.000% Senior Notes due 2029 (unsecured)",
      capacityFormulas: {
        // indSec = min(facA+facB+milaSec+genDebt, lienRatio+lienGen, milaSec)
        secured: {
          op: "MIN",
          items: [
            {
              op: "SUM",
              items: [
                { op: "REF", code: "facility_flat" },
                { op: "REF", code: "facility_grower" },
                { op: "REF", code: "mila_secured" },
                { op: "REF", code: "general_debt" },
              ],
            },
            { op: "SUM", items: [{ op: "REF", code: "lien_ratio" }, { op: "REF", code: "lien_general" }] },
            { op: "REF", code: "mila_secured" },
          ],
        },
        // indUnsec = max(fccrCap, milaUnsec)
        unsecured: {
          op: "MAX",
          items: [{ op: "REF", code: "ratio_debt_fccr" }, { op: "REF", code: "mila_unsecured" }],
        },
      },
      rpWaterfall: {
        steps: [{ code: "rp_builder" }, { code: "rp_general" }],
        ratioGateCodeByKind: { dividend: "rp_ratio_gate", investment: "inv_ratio_gate" },
      },
      assetSale: { thresholdCode: "asset_sale_threshold", reinvestmentWindowDays: 455 },
    },
  ],

  provisions: [
    // ---- Credit Agreement §6.11 maintenance covenants ----
    {
      id: "prov-ca-leverage-cap",
      documentId: CREDIT_AGREEMENT_ID,
      code: "ca_leverage_cap",
      basketName: "Financial Covenants — Total Net Leverage",
      sectionRef: "§6.11 — TNL ≤ 4.25x",
      formulaType: "LEVERAGE_RATIO_ROOM",
      thresholdValue: 4.25,
      params: { debtBasis: "total" },
    },
    {
      id: "prov-ca-coverage-cap",
      documentId: CREDIT_AGREEMENT_ID,
      code: "ca_coverage_cap",
      basketName: "Financial Covenants — Interest Coverage",
      sectionRef: "§6.11 — IC ≥ 2.50x",
      formulaType: "COVERAGE_RATIO_ROOM",
      thresholdValue: 2.5,
    },

    // ---- 2029 Notes Indenture §3.3 debt capacity ----
    {
      id: "prov-ind-ratio-debt-fccr",
      documentId: INDENTURE_ID,
      code: "ratio_debt_fccr",
      basketName: "Ratio Debt",
      sectionRef: "§3.3(a) — FCCR ≥ 2.00x",
      formulaType: "COVERAGE_RATIO_ROOM",
      thresholdValue: 2.0,
    },
    {
      id: "prov-ind-mila-secured",
      documentId: INDENTURE_ID,
      code: "mila_secured",
      basketName: "MILA — secured prong",
      sectionRef: "§3.3(b)(i)(C) — SSNL ≤ 3.00x",
      formulaType: "LEVERAGE_RATIO_ROOM",
      thresholdValue: 3.0,
      params: { debtBasis: "secured" },
    },
    {
      id: "prov-ind-mila-unsecured",
      documentId: INDENTURE_ID,
      code: "mila_unsecured",
      basketName: "MILA — unsecured prong",
      sectionRef: "§3.3(b)(i)(C) — TNL ≤ 5.00x",
      formulaType: "LEVERAGE_RATIO_ROOM",
      thresholdValue: 5.0,
      params: { debtBasis: "total" },
    },
    {
      id: "prov-ind-facility-flat",
      documentId: INDENTURE_ID,
      code: "facility_flat",
      basketName: "Credit Facilities basket — flat",
      sectionRef: "§3.3(b)(i)(A) — $4,000M",
      formulaType: "FLAT_NET_OF_DEBT",
      thresholdValue: 4000,
      params: { netOfBasis: "secured" },
      notes: "Net of TLA/TLB outstanding.",
    },
    {
      id: "prov-ind-facility-grower",
      documentId: INDENTURE_ID,
      code: "facility_grower",
      basketName: "Credit Facilities basket — grower",
      sectionRef: "§3.3(b)(i)(B) — greater of $1,320M / 100% EBITDA",
      formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA",
      thresholdValue: 1320,
      params: { pctEbitda: 1.0 },
    },
    {
      id: "prov-ind-general-debt",
      documentId: INDENTURE_ID,
      code: "general_debt",
      basketName: "General debt basket",
      sectionRef: "§3.3(b)(xii) — greater of $530M / 40% EBITDA",
      formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA",
      thresholdValue: 530,
      params: { pctEbitda: 0.4 },
    },
    {
      id: "prov-ind-lien-ratio",
      documentId: INDENTURE_ID,
      code: "lien_ratio",
      basketName: "Lien capacity — ratio prong",
      sectionRef: "Permitted Liens cl. (24) — SSNL ≤ 3.00x",
      formulaType: "LEVERAGE_RATIO_ROOM",
      thresholdValue: 3.0,
      params: { debtBasis: "secured" },
    },
    {
      id: "prov-ind-lien-general",
      documentId: INDENTURE_ID,
      code: "lien_general",
      basketName: "Lien capacity — general prong",
      sectionRef: "Permitted Liens cl. (25) — greater of $530M / 40% EBITDA",
      formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA",
      thresholdValue: 530,
      params: { pctEbitda: 0.4 },
    },

    // ---- 2029 Notes Indenture §3.4 restricted payments ----
    {
      id: "prov-ind-rp-builder",
      documentId: INDENTURE_ID,
      code: "rp_builder",
      basketName: "Builder Basket (Available Amount)",
      sectionRef: "§3.4(a)(C)",
      formulaType: "BUILDER_BASKET",
      thresholdValue: 330,
      params: {
        pctEbitda: 0.25,
        cniSharePct: 0.5,
        includeEquityProceeds: true,
        starterSectionRef: "§3.4(a)(C)(1)",
        cniSectionRef: "§3.4(a)(C)(2)",
        equitySectionRef: "§3.4(a)(C)(3)-(4)",
      },
      notes:
        "Starter: greater of $330M / 25% EBITDA, plus 50% of cumulative CNI since issue, plus equity proceeds since issue.",
    },
    {
      id: "prov-ind-rp-general",
      documentId: INDENTURE_ID,
      code: "rp_general",
      basketName: "General RP Basket",
      sectionRef: "§3.4(b)(x) — greater of $600M / 45% EBITDA",
      formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA",
      thresholdValue: 600,
      params: { pctEbitda: 0.45 },
    },
    {
      id: "prov-ind-rp-ratio-gate",
      documentId: INDENTURE_ID,
      code: "rp_ratio_gate",
      basketName: "Ratio RP (unlimited)",
      sectionRef: "§3.4(b)(xvii)(i) — TNL ≤ 3.25x",
      formulaType: "RATIO_GATE",
      thresholdValue: 3.25,
      params: { debtBasis: "total" },
    },
    {
      id: "prov-ind-inv-ratio-gate",
      documentId: INDENTURE_ID,
      code: "inv_ratio_gate",
      basketName: "Ratio Investments (unlimited)",
      sectionRef: "§3.4(b)(xvii)(ii) — TNL ≤ 3.50x",
      formulaType: "RATIO_GATE",
      thresholdValue: 3.5,
      params: { debtBasis: "total" },
    },

    // ---- 2029 Notes Indenture §3.7 asset sales ----
    {
      id: "prov-ind-asset-sale-threshold",
      documentId: INDENTURE_ID,
      code: "asset_sale_threshold",
      basketName: "Excess Proceeds threshold",
      sectionRef: "§3.7(d) — greater of $35M / 2.5% EBITDA",
      formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA",
      thresholdValue: 35,
      params: { pctEbitda: 0.025 },
    },
  ],

  ledger: COHERENT_LEDGER_ENTRIES.map((e) => ({ basket: e.basket, amount: e.amount, direction: e.direction })),
};

export const COHERENT_DOCUMENT_CAVEATS: Record<string, string> = {
  [CREDIT_AGREEMENT_ID]: CA_CAVEAT,
  [INDENTURE_ID]: INDENTURE_CAVEAT,
};

export const COHERENT_CREDIT_AGREEMENT_ID = CREDIT_AGREEMENT_ID;
export const COHERENT_INDENTURE_ID = INDENTURE_ID;

// ---------------------------------------------------------------------------
// Feeds review queue
// ---------------------------------------------------------------------------

/** SNAPSHOT_UPDATE payload: fields present override the latest FinancialSnapshot; fields omitted carry forward unchanged. */
export interface FeedQueueSnapshotPayload {
  asOfDate: string;
  ebitda?: number;
  cash?: number;
  interestExpense?: number;
  cumulativeNetIncome?: number;
  equityProceedsSinceIssue?: number;
  assumedNewDebtRatePct?: number;
  totalDebt?: number;
  securedDebt?: number;
  notes?: string;
}

/** LEDGER_ENTRY payload: creates one new LedgerEntry verbatim. */
export interface FeedQueueLedgerPayload {
  date: string;
  description: string;
  basket: LedgerBasket;
  amount: number;
  direction: LedgerDirection;
  source: string;
}

export const COHERENT_FEED_QUEUE_ITEMS: {
  title: string;
  description: string;
  source: string;
  filedDate: string;
  kind: "SNAPSHOT_UPDATE" | "LEDGER_ENTRY";
  payload: FeedQueueSnapshotPayload | FeedQueueLedgerPayload;
}[] = [
  {
    title: "10-Q filed — quarter ended 9/30/26",
    description:
      "First fiscal quarter of FY27. EBITDA and cash both grew sequentially and interest expense ticked down on continued Term Loan B-3 amortization. No new debt issuance, repurchases, or asset sales disclosed this quarter, so total/secured debt and the capital structure are carried forward unchanged.",
    source: "10-Q filed 11/10/2026",
    filedDate: "2026-11-10",
    kind: "SNAPSHOT_UPDATE",
    payload: {
      asOfDate: "2026-09-30",
      ebitda: 1740,
      cash: 1240,
      interestExpense: 186,
      cumulativeNetIncome: 560,
      notes: "FY2027 Q1 10-Q (filed 11/10/2026), fiscal quarter ended 9/30/2026.",
    },
  },
];
