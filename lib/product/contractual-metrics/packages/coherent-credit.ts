/**
 * Coherent Corp. — Credit Agreement / Indenture Consolidated EBITDA path.
 *
 * Materially different from Matthews: Coherent's evaluation population supplies a
 * compliance-certificate Consolidated EBITDA figure ($1,700M) without a full
 * Indenture-style line-item build-up. The IR therefore binds the certificate
 * metric explicitly and marks unpacking of permitted add-backs as UNSUPPORTED
 * until component evidence exists — never silently reading FinancialSnapshot.ebitda.
 */

import type { IRDefinition, IRExpression } from "@/lib/contract-model/ir/types";
import type { MetricInput } from "@/lib/contract-model/runtime/types";
import { metricInput } from "@/lib/contract-model/runtime/input-resolver";
import { rationalFromString } from "@/lib/contract-model/runtime/decimal";
import { money } from "@/lib/contract-model/runtime/values";
import {
  divRatio,
  makeDefinition,
  metricRef,
  provenance,
  sub,
  termRef,
} from "../ir-builders";

export const COHERENT_COMPANY_ID = "coherent";
export const COHERENT_INSTRUMENT = "coherent-credit-agreement";
export const COHERENT_DOC = "coherent-credit-agreement";
export const COHERENT_AS_OF = "2026-06-30";
export const COHERENT_PERIOD = "FY2026 ending 2026-06-30";

/** Certificate-reported contractual EBITDA ($M) — SEED_ALIGNED_MODELED fixture. */
export const COHERENT_CERTIFICATE_EBITDA_MILLIONS = 1700;

const P = provenance(
  COHERENT_DOC,
  "Credit Agreement §1.01 Consolidated EBITDA / Compliance Certificate FY2026",
  '"Consolidated EBITDA" means Consolidated Net Income plus interest, taxes, depreciation, amortization and permitted add-backs under the Credit Agreement.',
);

function moneyMetric(key: string, millions: number, note: string): MetricInput {
  return metricInput(
    key,
    money(rationalFromString(String(millions)), "USD", { exprId: null, inputKeys: [key], rawSource: millions }),
    { source: "SEED_ALIGNED_MODELED_COMPLIANCE_CERTIFICATE", sourceVersion: "coherent-fy2026", note },
    COHERENT_PERIOD,
    COHERENT_AS_OF,
  );
}

export function coherentEbitdaDefinition(): IRDefinition {
  const co = COHERENT_COMPANY_ID;
  const inst = COHERENT_INSTRUMENT;
  // Certificate figure is the only supported executable operand until add-back
  // components are evidenced. This is still IR execution, not a flat DB read.
  const cert = metricRef(
    "Compliance Certificate Consolidated EBITDA",
    co,
    inst,
    "ir-expr:coh-cert-ebitda",
    P,
  );
  return makeDefinition({
    definitionId: "ir-def:coherent-ca-consolidated-ebitda",
    companyId: co,
    instrumentKey: inst,
    sourceDocumentId: COHERENT_DOC,
    termName: "Consolidated EBITDA",
    expression: cert,
    dependsOnTerms: ["Consolidated Net Income"],
    sufficiency: "PARTIAL",
    sufficiencyReasons: [
      "Component build-up (tax, D&A, SBC, restructuring add-backs) not separately evidenced — certificate Consolidated EBITDA bound instead",
      "Permitted add-back unpacking UNSUPPORTED pending component-level financial evidence",
      "SEED_ALIGNED_MODELED certificate — not a reviewer APPROVED customer snapshot",
    ],
    provenance: P,
  });
}

export function coherentTotalNetLeverageExpression(ebitdaDefId: string): IRExpression {
  const co = COHERENT_COMPANY_ID;
  const inst = COHERENT_INSTRUMENT;
  const totalDebt = metricRef("Consolidated Total Debt", co, inst, "ir-expr:coh-td", P);
  const cash = metricRef("Unrestricted Cash", co, inst, "ir-expr:coh-cash", P);
  const netDebt = sub("ir-expr:coh-net-debt", totalDebt, cash);
  const ebitda = termRef("Consolidated EBITDA", co, inst, "ir-expr:coh-ebitda-ref", ebitdaDefId);
  return divRatio("ir-expr:coh-tnl", netDebt, ebitda);
}

export function coherentComponentMetrics(): MetricInput[] {
  return [
    moneyMetric(
      "Compliance Certificate Consolidated EBITDA",
      COHERENT_CERTIFICATE_EBITDA_MILLIONS,
      "Compliance Certificate FY2026 Consolidated EBITDA (seed-aligned modeled)",
    ),
    moneyMetric("Consolidated Total Debt", 3258, "Seed-aligned total debt"),
    moneyMetric("Unrestricted Cash", 1162, "Seed-aligned unrestricted cash"),
    moneyMetric("Consolidated Interest Expense", 190, "Seed-aligned interest expense"),
    moneyMetric("Consolidated Secured Debt", 2221, "Seed-aligned secured debt"),
  ];
}

export const COHERENT_UNSUPPORTED_MECHANICS = [
  "Credit Agreement Consolidated EBITDA permitted add-back unpacking — component evidence not available in fixture",
] as const;
