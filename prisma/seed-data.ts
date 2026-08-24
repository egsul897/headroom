/**
 * Coherent Corp. (COHR) seed data, transcribed from the headroom-coherent.jsx
 * prototype's default state: FY2026 10-K financials, the 2029 Senior Notes
 * Indenture, and the Credit Agreement's maintenance covenants.
 *
 * Exported as plain objects shaped like `CompanyCovenantData` so both
 * `prisma/seed.ts` (writes them into Postgres) and the engine's correctness
 * test (feeds them straight into the pure engine) share one source of truth.
 */
import type { CompanyCovenantData } from "../lib/covenant-engine";

const COMPANY_ID = "coherent";
const CREDIT_AGREEMENT_ID = "coherent-credit-agreement-2022";
const INDENTURE_ID = "coherent-2029-notes-indenture";

export const COHERENT_COMPANY = {
  id: COMPANY_ID,
  name: "Coherent Corp.",
  ticker: "COHR",
  cik: "0000820318",
};

// Capital structure at 6/30/26 (tranches.reduce in the prototype).
const TRANCHES = [
  { name: "Term Loan A due 2030", amt: 1141, secured: true },
  { name: "Term Loan B-3 due 2029", amt: 1080, secured: true },
  { name: "5.000% Senior Notes due 2029", amt: 990, secured: false },
  { name: "Other subsidiary debt", amt: 47, secured: false },
];
const TOTAL_DEBT = TRANCHES.reduce((s, t) => s + t.amt, 0);
const SECURED_DEBT = TRANCHES.filter((t) => t.secured).reduce((s, t) => s + t.amt, 0);

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
      params: { pctEbitda: 0.25, cniSharePct: 0.5, includeEquityProceeds: true },
      notes: "Starter: greater of $330M / 25% EBITDA, plus 50% of cumulative CNI since issue, plus equity proceeds since issue.",
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

  ledger: [
    { basket: "EQUITY", amount: 1998, direction: "CREDIT" },
    { basket: "ASSET_SALE", amount: 400, direction: "CREDIT" },
    { basket: "ASSET_SALE", amount: 96, direction: "CREDIT" },
    { basket: "DEBT_REPAY", amount: 502, direction: "CREDIT" },
    { basket: "DEBT_INCUR", amount: 1250, direction: "DEBIT" },
  ],
};

export const COHERENT_CREDIT_AGREEMENT_ID = CREDIT_AGREEMENT_ID;
export const COHERENT_INDENTURE_ID = INDENTURE_ID;
