/**
 * Company-agnostic contractual metrics service.
 *
 * Registry of instrument packages (data) — evaluation is always Phase 4A.
 * Never returns FinancialSnapshot.ebitda as "contractual EBITDA."
 */

import type { PrismaClient } from "@prisma/client";
import type { IRDefinition, IRExpression } from "@/lib/contract-model/ir/types";
import type { MetricInput } from "@/lib/contract-model/runtime/types";
import { executeContractualExpression, numericFromEvaluation } from "./execute";
import { persistCalculationResult, persistContractualDefinition } from "./persist";
import type { ContractualMetricLineItem, ContractualMetricResult, ContractualMetricsBundle } from "./types";
import {
  MATTHEWS_AS_OF,
  MATTHEWS_COMPANY_ID,
  MATTHEWS_EBITDA_COMPONENTS,
  MATTHEWS_EXPECTED_EBITDA_MILLIONS,
  MATTHEWS_INDENTURE_DOC,
  MATTHEWS_INDENTURE_INSTRUMENT,
  MATTHEWS_PERIOD,
  MATTHEWS_UNSUPPORTED_MECHANICS,
  matthewsComponentMetrics,
  matthewsEbitdaDefinition,
  matthewsInterestCoverageExpression,
  matthewsSecuredNetLeverageExpression,
  matthewsTotalNetLeverageExpression,
} from "./packages/matthews-indenture";
import {
  COHERENT_AS_OF,
  COHERENT_COMPANY_ID,
  COHERENT_CERTIFICATE_EBITDA_MILLIONS,
  COHERENT_DOC,
  COHERENT_INSTRUMENT,
  COHERENT_PERIOD,
  COHERENT_UNSUPPORTED_MECHANICS,
  coherentComponentMetrics,
  coherentEbitdaDefinition,
  coherentTotalNetLeverageExpression,
} from "./packages/coherent-credit";

interface InstrumentPackage {
  companyId: string;
  instrumentKey: string;
  sourceDocumentId: string;
  asOf: string;
  period: string;
  ebitdaDefinition: () => IRDefinition;
  componentMetrics: () => MetricInput[];
  unsupportedMechanics: readonly string[];
  ebitdaLineItems: () => ContractualMetricLineItem[];
  ebitdaFormulaSummary: string;
  ratios: Array<{
    metricKey: string;
    displayName: string;
    unit: "RATIO";
    formulaSummary: string;
    expression: (ebitdaDefId: string) => IRExpression;
  }>;
  expectedEbitdaMillions?: number;
}

const PACKAGES: InstrumentPackage[] = [
  {
    companyId: MATTHEWS_COMPANY_ID,
    instrumentKey: MATTHEWS_INDENTURE_INSTRUMENT,
    sourceDocumentId: MATTHEWS_INDENTURE_DOC,
    asOf: MATTHEWS_AS_OF,
    period: MATTHEWS_PERIOD,
    ebitdaDefinition: matthewsEbitdaDefinition,
    componentMetrics: matthewsComponentMetrics,
    unsupportedMechanics: MATTHEWS_UNSUPPORTED_MECHANICS,
    expectedEbitdaMillions: MATTHEWS_EXPECTED_EBITDA_MILLIONS,
    ebitdaFormulaSummary:
      "CNI + Interest − Tax benefit + D&A + Goodwill WD + Asset WD + SBC (Indenture §1.01; optional cl.1(f)/1(g) unsupported)",
    ebitdaLineItems: () => {
      const c = MATTHEWS_EBITDA_COMPONENTS;
      return [
        { key: "cni", label: "Consolidated Net Income", amountMillions: c.consolidatedNetIncome, role: "BASE", readiness: "AVAILABLE_UNVERIFIED", sourceCitation: "TTM from FY2024 10-K + Q1 FY2025 − Q1 FY2024" },
        { key: "interest", label: "+ Consolidated Interest Expense", amountMillions: c.interestExpense, role: "ADDBACK", readiness: "AVAILABLE_UNVERIFIED", sourceCitation: "TTM interest reconstruction" },
        { key: "tax", label: "− Income tax benefit (cl.2)", amountMillions: -c.incomeTaxBenefit, role: "DEDUCTION", readiness: "AVAILABLE_UNVERIFIED", sourceCitation: "Indenture §1.01 cl.(2)" },
        { key: "da", label: "+ Depreciation & amortization", amountMillions: c.depreciationAndAmortization, role: "ADDBACK", readiness: "AVAILABLE_UNVERIFIED", sourceCitation: "TTM D&A" },
        { key: "gw", label: "+ Goodwill write-downs", amountMillions: c.goodwillWriteDowns, role: "ADDBACK", readiness: "AVAILABLE_UNVERIFIED", sourceCitation: "FY2024 10-K SCF" },
        { key: "aw", label: "+ Asset write-downs", amountMillions: c.assetWriteDowns, role: "ADDBACK", readiness: "AVAILABLE_UNVERIFIED", sourceCitation: "FY2024 10-K SCF" },
        { key: "sbc", label: "+ Stock-based compensation", amountMillions: c.stockBasedCompensation, role: "ADDBACK", readiness: "AVAILABLE_UNVERIFIED", sourceCitation: "TTM SBC" },
        { key: "extra", label: "Extraordinary / non-recurring (cl.1(f))", amountMillions: null, role: "UNSUPPORTED", readiness: "UNSUPPORTED", sourceCitation: "Indenture §1.01 cl.(1)(f)", notes: "Not invoked — no characterized line item" },
        { key: "runrate", label: "Run-rate synergies (cl.1(g))", amountMillions: null, role: "UNSUPPORTED", readiness: "UNSUPPORTED", sourceCitation: "Indenture §1.01 cl.(1)(g)", notes: "Not invoked — no disclosed run-rate figure" },
      ];
    },
    ratios: [
      {
        metricKey: "total_net_leverage",
        displayName: "Total Net Leverage Ratio (Indenture)",
        unit: "RATIO",
        formulaSummary: "(Consolidated Total Debt − Unrestricted Cash) / Consolidated EBITDA",
        expression: matthewsTotalNetLeverageExpression,
      },
      {
        metricKey: "secured_net_leverage",
        displayName: "Secured Net Leverage Ratio (Indenture)",
        unit: "RATIO",
        formulaSummary: "(Consolidated Secured Debt − Unrestricted Cash) / Consolidated EBITDA",
        expression: matthewsSecuredNetLeverageExpression,
      },
      {
        metricKey: "interest_coverage",
        displayName: "Interest Coverage Ratio (Indenture EBITDA / Interest)",
        unit: "RATIO",
        formulaSummary: "Consolidated EBITDA / Consolidated Interest Expense",
        expression: matthewsInterestCoverageExpression,
      },
    ],
  },
  {
    companyId: COHERENT_COMPANY_ID,
    instrumentKey: COHERENT_INSTRUMENT,
    sourceDocumentId: COHERENT_DOC,
    asOf: COHERENT_AS_OF,
    period: COHERENT_PERIOD,
    ebitdaDefinition: coherentEbitdaDefinition,
    componentMetrics: coherentComponentMetrics,
    unsupportedMechanics: COHERENT_UNSUPPORTED_MECHANICS,
    expectedEbitdaMillions: COHERENT_CERTIFICATE_EBITDA_MILLIONS,
    ebitdaFormulaSummary:
      "Compliance Certificate Consolidated EBITDA (IR-bound; add-back unpacking unsupported)",
    ebitdaLineItems: () => [
      {
        key: "cert",
        label: "Compliance Certificate Consolidated EBITDA",
        amountMillions: COHERENT_CERTIFICATE_EBITDA_MILLIONS,
        role: "BASE",
        readiness: "AVAILABLE_UNVERIFIED",
        sourceCitation: "Compliance Certificate FY2026",
        notes: "Component add-back unpacking unsupported — certificate figure bound via IR",
      },
      {
        key: "addbacks",
        label: "Permitted add-back unpacking",
        amountMillions: null,
        role: "UNSUPPORTED",
        readiness: "UNSUPPORTED",
        sourceCitation: "Credit Agreement §1.01",
        notes: "Tax / D&A / SBC / restructuring components not separately evidenced",
      },
    ],
    ratios: [
      {
        metricKey: "total_net_leverage",
        displayName: "Total Net Leverage Ratio (CA)",
        unit: "RATIO",
        formulaSummary: "(Consolidated Total Debt − Unrestricted Cash) / Consolidated EBITDA",
        expression: coherentTotalNetLeverageExpression,
      },
    ],
  },
];

function emptyResult(companyId: string, metricKey: string, displayName: string): ContractualMetricResult {
  return {
    metricKey,
    displayName,
    companyId,
    instrumentKey: "",
    sourceDocumentId: "",
    sectionRef: "",
    measurementPeriod: "",
    asOf: "",
    status: "NO_PACKAGE",
    valueMillions: null,
    unit: "USD_MILLIONS",
    formulaSummary: "",
    lineItems: [],
    unsupportedMechanics: [],
    missingInputs: ["No contractual-metric package registered for this company"],
    evaluation: null,
    definition: null,
    definitionExecuted: false,
    authorityLabel: "NOT_CALCULATED",
    persisted: false,
    persistNote: "n/a",
  };
}

function packageFor(companyId: string): InstrumentPackage | null {
  return PACKAGES.find((p) => p.companyId === companyId) ?? null;
}

export async function computeContractualMetricsForCompany(
  prisma: PrismaClient | null,
  companyId: string,
  opts: { persist?: boolean } = {},
): Promise<ContractualMetricsBundle> {
  const pkg = packageFor(companyId);
  if (!pkg) {
    return {
      companyId,
      asOf: "",
      instrumentKey: null,
      metrics: [emptyResult(companyId, "consolidated_ebitda", "Consolidated EBITDA")],
      consolidatedEbitda: emptyResult(companyId, "consolidated_ebitda", "Consolidated EBITDA"),
      totalNetLeverage: null,
      securedNetLeverage: null,
      interestCoverage: null,
    };
  }

  const definition = pkg.ebitdaDefinition();
  const metrics = pkg.componentMetrics();
  const persist = opts.persist === true && prisma != null;

  let defPersistNote = "not requested";
  let defPersisted = false;
  if (persist && prisma) {
    const r = await persistContractualDefinition(prisma, definition);
    defPersisted = r.persisted;
    defPersistNote = r.note;
  }

  const ebitdaEval = executeContractualExpression({
    expression: definition.calculationExpression!,
    definitions: [definition],
    metrics,
    companyId: pkg.companyId,
    instrumentKey: pkg.instrumentKey,
    definitionId: definition.definitionId,
    asOf: pkg.asOf,
  });

  const ebitdaValue = numericFromEvaluation(ebitdaEval);
  const ebitdaOk = ebitdaEval.status === "EXECUTABLE" && ebitdaValue != null;

  const ebitdaResult: ContractualMetricResult = {
    metricKey: "consolidated_ebitda",
    displayName: "Consolidated EBITDA (contractual)",
    companyId: pkg.companyId,
    instrumentKey: pkg.instrumentKey,
    sourceDocumentId: pkg.sourceDocumentId,
    sectionRef: "§1.01",
    measurementPeriod: pkg.period,
    asOf: pkg.asOf,
    status: ebitdaOk ? "CALCULATED" : ebitdaEval.status === "NEEDS_INPUT" ? "NEEDS_INPUT" : ebitdaEval.status === "UNSUPPORTED" ? "UNSUPPORTED" : "REVIEW_REQUIRED",
    valueMillions: ebitdaOk ? ebitdaValue : null,
    unit: "USD_MILLIONS",
    formulaSummary: pkg.ebitdaFormulaSummary,
    lineItems: [
      ...pkg.ebitdaLineItems(),
      ...(ebitdaOk
        ? [
            {
              key: "result",
              label: "= Consolidated EBITDA",
              amountMillions: ebitdaValue,
              role: "RESULT" as const,
              readiness: "AVAILABLE_UNVERIFIED" as const,
              sourceCitation: pkg.sourceDocumentId + " §1.01",
            },
          ]
        : []),
    ],
    unsupportedMechanics: [...pkg.unsupportedMechanics],
    missingInputs: ebitdaEval.missingInputKeys,
    evaluation: ebitdaEval,
    definition,
    definitionExecuted: true,
    authorityLabel: ebitdaOk ? "DEFINITION_EXECUTED_PROVISIONAL" : "NOT_CALCULATED",
    persisted: defPersisted,
    persistNote: defPersistNote,
  };

  if (persist && prisma && ebitdaOk) {
    const pr = await persistCalculationResult(prisma, ebitdaResult);
    ebitdaResult.persisted = ebitdaResult.persisted || pr.persisted;
    ebitdaResult.persistNote = `${ebitdaResult.persistNote}; ${pr.note}`;
  }

  const ratioResults: ContractualMetricResult[] = [];
  for (const ratio of pkg.ratios) {
    const ev = executeContractualExpression({
      expression: ratio.expression(definition.definitionId),
      definitions: [definition],
      metrics,
      companyId: pkg.companyId,
      instrumentKey: pkg.instrumentKey,
      definitionId: definition.definitionId,
      asOf: pkg.asOf,
    });
    const value = numericFromEvaluation(ev);
    const ok = ev.status === "EXECUTABLE" && value != null;
    const rr: ContractualMetricResult = {
      metricKey: ratio.metricKey,
      displayName: ratio.displayName,
      companyId: pkg.companyId,
      instrumentKey: pkg.instrumentKey,
      sourceDocumentId: pkg.sourceDocumentId,
      sectionRef: "§1.01 / financial covenants",
      measurementPeriod: pkg.period,
      asOf: pkg.asOf,
      status: ok ? "CALCULATED" : ev.status === "NEEDS_INPUT" ? "NEEDS_INPUT" : "REVIEW_REQUIRED",
      valueMillions: ok ? value : null,
      unit: "RATIO",
      formulaSummary: ratio.formulaSummary,
      lineItems: [],
      unsupportedMechanics: [],
      missingInputs: ev.missingInputKeys,
      evaluation: ev,
      definition,
      definitionExecuted: true,
      authorityLabel: ok ? "DEFINITION_EXECUTED_PROVISIONAL" : "NOT_CALCULATED",
      persisted: false,
      persistNote: "ratio recomputed from persisted definition + inputs",
    };
    if (persist && prisma && ok) {
      const pr = await persistCalculationResult(prisma, rr);
      rr.persisted = pr.persisted;
      rr.persistNote = pr.note;
    }
    ratioResults.push(rr);
  }

  const metricsOut = [ebitdaResult, ...ratioResults];
  return {
    companyId: pkg.companyId,
    asOf: pkg.asOf,
    instrumentKey: pkg.instrumentKey,
    metrics: metricsOut,
    consolidatedEbitda: ebitdaResult,
    totalNetLeverage: ratioResults.find((r) => r.metricKey === "total_net_leverage") ?? null,
    securedNetLeverage: ratioResults.find((r) => r.metricKey === "secured_net_leverage") ?? null,
    interestCoverage: ratioResults.find((r) => r.metricKey === "interest_coverage") ?? null,
  };
}

/** Pure (no DB) compute — used by tests and dashboard when persistence is optional. */
export function computeContractualMetricsPure(companyId: string): Promise<ContractualMetricsBundle> {
  return computeContractualMetricsForCompany(null, companyId, { persist: false });
}

export function supportedContractualMetricCompanies(): string[] {
  return PACKAGES.map((p) => p.companyId);
}
