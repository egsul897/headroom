/**
 * Matthews International — Indenture §1.01 Consolidated EBITDA (TTM 2024-12-31).
 *
 * Formula fixed from the Indenture defined-term text (docs/matthews-international-onboarding.md §D):
 *   CNI + Interest − Income-tax benefit + D&A + Goodwill WD + Asset WD + SBC
 * Optional clauses (extraordinary / run-rate synergies) are UNSUPPORTED and not silently omitted.
 *
 * Component amounts are authentic PUBLIC_FILING_RECONSTRUCTION figures — not the pre-baked
 * covenantEbitda field used as the answer. The runtime must recompute 128.313 from components.
 */

import type { IRDefinition, IRExpression } from "@/lib/contract-model/ir/types";
import type { MetricInput } from "@/lib/contract-model/runtime/types";
import { metricInput } from "@/lib/contract-model/runtime/input-resolver";
import { rationalFromString } from "@/lib/contract-model/runtime/decimal";
import { money } from "@/lib/contract-model/runtime/values";
import {
  add,
  divRatio,
  makeDefinition,
  metricRef,
  provenance,
  sub,
  termRef,
  unsupported,
} from "../ir-builders";

export const MATTHEWS_COMPANY_ID = "matthews";
export const MATTHEWS_INDENTURE_INSTRUMENT = "matw-2027-second-lien-notes-indenture";
export const MATTHEWS_INDENTURE_DOC = "matw-2027-second-lien-notes-indenture";
export const MATTHEWS_AS_OF = "2024-12-31";
export const MATTHEWS_PERIOD = "TTM ending 2024-12-31";

/** Authentic component inputs ($M) — see populate-matthews-financial-provenance.ts header. */
export const MATTHEWS_EBITDA_COMPONENTS = {
  consolidatedNetIncome: -60.829,
  interestExpense: 54.64,
  incomeTaxBenefit: 11.629, // subtracted per clause (2)
  depreciationAndAmortization: 93.751,
  goodwillWriteDowns: 16.727,
  assetWriteDowns: 16.847,
  stockBasedCompensation: 18.806,
} as const;

/** Expected recomputed result ($M). */
export const MATTHEWS_EXPECTED_EBITDA_MILLIONS = 128.313;

const P = provenance(
  MATTHEWS_INDENTURE_DOC,
  "Indenture §1.01 Consolidated EBITDA",
  '"Consolidated EBITDA" means Consolidated Net Income … plus interest, taxes (net of benefits), D&A and non-cash charges …',
);

function moneyMetric(key: string, millions: number, note: string): MetricInput {
  return metricInput(
    key,
    money(rationalFromString(String(millions)), "USD", { exprId: null, inputKeys: [key], rawSource: millions }),
    {
      source: "PUBLIC_FILING_RECONSTRUCTION",
      sourceVersion: "0000063296-25-000006+0000063296-24-000094",
      note,
    },
    MATTHEWS_PERIOD,
    MATTHEWS_AS_OF,
  );
}

export function matthewsEbitdaDefinition(): IRDefinition {
  const co = MATTHEWS_COMPANY_ID;
  const inst = MATTHEWS_INDENTURE_INSTRUMENT;
  const cni = metricRef("Consolidated Net Income", co, inst, "ir-expr:matw-cni", P);
  const interest = metricRef("Consolidated Interest Expense", co, inst, "ir-expr:matw-int", P);
  const taxBenefit = metricRef("Income Tax Benefit (clause 2)", co, inst, "ir-expr:matw-tax", P);
  const da = metricRef("Depreciation and Amortization", co, inst, "ir-expr:matw-da", P);
  const gw = metricRef("Goodwill Write-Downs", co, inst, "ir-expr:matw-gw", P);
  const aw = metricRef("Asset Write-Downs", co, inst, "ir-expr:matw-aw", P);
  const sbc = metricRef("Stock-Based Compensation", co, inst, "ir-expr:matw-sbc", P);

  // Optional contractual addbacks deliberately not invoked — preserved as UNSUPPORTED.
  const extraordinary = unsupported(
    "ir-expr:matw-extra",
    "Clause (1)(f) extraordinary/non-recurring addback not invoked — no discrete GAAP line item characterized as extraordinary in the reconstruction",
    "Indenture §1.01 Consolidated EBITDA cl.(1)(f)",
    "discretionary extraordinary / non-recurring charges addback",
  );
  const runRate = unsupported(
    "ir-expr:matw-runrate",
    "Clause (1)(g) run-rate synergy addback not invoked — no disclosed run-rate synergy figure in source filings used for this reconstruction",
    "Indenture §1.01 Consolidated EBITDA cl.(1)(g)",
    "run-rate cost synergy addback",
  );

  // CNI + Interest − TaxBenefit + D&A + GW + AW + SBC
  // UNSUPPORTED nodes are siblings recorded for honesty but cannot type-check inside ADD —
  // they are attached via sufficiencyReasons / package metadata, not as ADD operands.
  void extraordinary;
  void runRate;

  const afterInterest = add("ir-expr:matw-sum1", cni, interest);
  const afterTax = sub("ir-expr:matw-sum2", afterInterest, taxBenefit);
  const expression: IRExpression = add("ir-expr:matw-ebitda", afterTax, da, gw, aw, sbc);

  return makeDefinition({
    definitionId: "ir-def:matw-indenture-consolidated-ebitda",
    companyId: co,
    instrumentKey: inst,
    sourceDocumentId: MATTHEWS_INDENTURE_DOC,
    termName: "Consolidated EBITDA",
    expression,
    dependsOnTerms: ["Consolidated Net Income", "Consolidated Interest Expense"],
    sufficiency: "PARTIAL",
    sufficiencyReasons: [
      "Clause (1)(f) extraordinary/non-recurring addback UNSUPPORTED (not invoked; no characterized line item)",
      "Clause (1)(g) run-rate synergy addback UNSUPPORTED (not invoked; no disclosed run-rate figure)",
      "Component inputs are PUBLIC_FILING_RECONSTRUCTION / UNVERIFIED — not compliance-certificate APPROVED",
    ],
    provenance: P,
  });
}

export function matthewsTotalNetLeverageExpression(ebitdaDefId: string): IRExpression {
  const co = MATTHEWS_COMPANY_ID;
  const inst = MATTHEWS_INDENTURE_INSTRUMENT;
  const totalDebt = metricRef("Consolidated Total Debt", co, inst, "ir-expr:matw-td", P);
  const cash = metricRef("Unrestricted Cash", co, inst, "ir-expr:matw-cash", P);
  const netDebt = sub("ir-expr:matw-net-debt", totalDebt, cash);
  const ebitda = termRef("Consolidated EBITDA", co, inst, "ir-expr:matw-ebitda-ref", ebitdaDefId);
  return divRatio("ir-expr:matw-tnl", netDebt, ebitda);
}

export function matthewsSecuredNetLeverageExpression(ebitdaDefId: string): IRExpression {
  const co = MATTHEWS_COMPANY_ID;
  const inst = MATTHEWS_INDENTURE_INSTRUMENT;
  const secured = metricRef("Consolidated Secured Debt", co, inst, "ir-expr:matw-sd", P);
  const cash = metricRef("Unrestricted Cash", co, inst, "ir-expr:matw-cash2", P);
  const netSecured = sub("ir-expr:matw-net-secured", secured, cash);
  const ebitda = termRef("Consolidated EBITDA", co, inst, "ir-expr:matw-ebitda-ref2", ebitdaDefId);
  return divRatio("ir-expr:matw-ssnl", netSecured, ebitda);
}

export function matthewsInterestCoverageExpression(ebitdaDefId: string): IRExpression {
  const co = MATTHEWS_COMPANY_ID;
  const inst = MATTHEWS_INDENTURE_INSTRUMENT;
  const ebitda = termRef("Consolidated EBITDA", co, inst, "ir-expr:matw-ebitda-ref3", ebitdaDefId);
  const interest = metricRef("Consolidated Interest Expense", co, inst, "ir-expr:matw-int2", P);
  return divRatio("ir-expr:matw-ic", ebitda, interest);
}

export function matthewsComponentMetrics(): MetricInput[] {
  const c = MATTHEWS_EBITDA_COMPONENTS;
  return [
    moneyMetric("Consolidated Net Income", c.consolidatedNetIncome, "TTM CNI from FY2024 10-K + Q1 FY2025 − Q1 FY2024"),
    moneyMetric("Consolidated Interest Expense", c.interestExpense, "TTM interest expense reconstruction"),
    moneyMetric("Income Tax Benefit (clause 2)", c.incomeTaxBenefit, "TTM tax benefit — subtracted per Indenture cl.(2)"),
    moneyMetric("Depreciation and Amortization", c.depreciationAndAmortization, "TTM D&A"),
    moneyMetric("Goodwill Write-Downs", c.goodwillWriteDowns, "FY2024 10-K cash-flow non-cash charge"),
    moneyMetric("Asset Write-Downs", c.assetWriteDowns, "FY2024 10-K cash-flow non-cash charge"),
    moneyMetric("Stock-Based Compensation", c.stockBasedCompensation, "TTM SBC"),
    moneyMetric("Consolidated Total Debt", 809.211, "10-Q Note 7 total debt (GAAP carrying value)"),
    moneyMetric("Consolidated Secured Debt", 778.882, "Revolver + 2027 Notes per 10-Q Note 7 (conservative)"),
    moneyMetric("Unrestricted Cash", 33.513, "10-Q Consolidated Balance Sheet"),
  ];
}

export const MATTHEWS_UNSUPPORTED_MECHANICS = [
  "Indenture §1.01 Consolidated EBITDA cl.(1)(f) extraordinary/non-recurring addback — not invoked; no characterized line item",
  "Indenture §1.01 Consolidated EBITDA cl.(1)(g) run-rate synergy addback — not invoked; no disclosed run-rate figure",
] as const;
