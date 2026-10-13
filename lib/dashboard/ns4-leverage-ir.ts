/**
 * Contractual Total Net Leverage from APPROVED NS-4 facts via Phase 4A IR.
 *
 * Formula: (Total Debt − Unrestricted Cash) / Consolidated EBITDA
 * Matches legacy RATIO_GATE / LEVERAGE_RATIO_ROOM net-debt economics.
 *
 * Computes from MONEY components — does not treat a stored certificate ratio
 * as the authoritative computed result (stored ratio may be shown separately).
 *
 * Evaluation uses a period-neutral view of the bound snapshot so METRIC_REFERENCE
 * resolution (null period → NOT_PERIOD_SPECIFIC) can bind; Neon rows are not mutated.
 */

import {
  snapshotInputResolver,
  toCanonicalString,
  evaluateExpression,
  type FinancialSnapshot,
  type FinancialInput,
  type IRExpression,
} from "@/lib/contract-model/north-star-bridge";

const EBITDA_KEYS = ["Consolidated EBITDA", "EBITDA", "Covenant EBITDA", "Adjusted EBITDA"] as const;
const DEBT_KEYS = ["Consolidated Total Debt", "Total Debt", "Consolidated Total Net Debt"] as const;
const CASH_KEYS = ["Unrestricted Cash", "Cash", "Cash and Cash Equivalents"] as const;

export type Ns4LeverageIrStatus =
  | "EXECUTABLE"
  | "NEEDS_INPUT"
  | "UNSUPPORTED"
  | "ERROR"
  | "NOT_BOUND";

export interface Ns4LeverageIrTrace {
  status: Ns4LeverageIrStatus;
  /** Exact IR-computed ratio string when EXECUTABLE. */
  computedRatio: string | null;
  formula: string;
  components: {
    ebitdaKey: string | null;
    ebitdaDisplay: string | null;
    debtKey: string | null;
    debtDisplay: string | null;
    cashKey: string | null;
    cashDisplay: string | null;
  };
  /** Certificate-reported Total Net Leverage Ratio if present (not used as computation). */
  reportedRatioDisplay: string | null;
  missingInputs: string[];
  evidence: string[];
  /** Compact trace lines from Phase 4A evaluation (no UI arithmetic). */
  calculationSteps: string[];
  /** Gross contractual ratio room note — not verified remaining capacity. */
  capacitySeparationNote: string;
  runtimeStatus: string | null;
}

function moneyDisplay(inp: FinancialInput | undefined): string | null {
  if (!inp || inp.value.type !== "MONEY") return null;
  return `${toCanonicalString(inp.value.amount)} ${inp.value.currency}`;
}

function ratioDisplay(inp: FinancialInput | undefined): string | null {
  if (!inp || inp.value.type !== "RATIO") return null;
  return toCanonicalString(inp.value.value);
}

function findMoney(snap: FinancialSnapshot, keys: readonly string[]): FinancialInput | undefined {
  for (const key of keys) {
    const hit = snap.inputs.find((i) => i.identity.key === key && i.identity.valueType === "MONEY");
    if (hit) return hit;
  }
  return undefined;
}

/** Period-neutral clone for IR resolution only — does not write to Neon. */
function evaluationView(snap: FinancialSnapshot): FinancialSnapshot {
  return {
    ...snap,
    inputs: snap.inputs.map((inp) => ({
      ...inp,
      identity: {
        ...inp.identity,
        period: { kind: "NOT_PERIOD_SPECIFIC" as const },
      },
    })),
  };
}

/** Company-level NS-4 facts use ALL_INSTRUMENTS; any instrumentKey satisfies scope. */
const COMPANY_LEVEL_INSTRUMENT = "company-level";

function metricRef(
  companyId: string,
  metricName: string,
  exprId: string,
): IRExpression {
  return {
    kind: "METRIC_REFERENCE",
    type: "MONEY",
    metricName,
    companyId,
    instrumentKey: COMPANY_LEVEL_INSTRUMENT,
    resolvedDefinitionId: null,
    exprId,
  };
}

/**
 * Build and evaluate Total Net Leverage IR against one APPROVED bound snapshot.
 */
export function computeNs4ContractualNetLeverage(args: {
  companyId: string;
  boundSnapshot: FinancialSnapshot | null;
}): Ns4LeverageIrTrace {
  const capacitySeparationNote =
    "This figure is a gross contractual leverage ratio from APPROVED NS-4 money facts. It is not verified remaining basket/capacity (that requires certified rulebook + utilization completeness).";

  const formula =
    "DIVIDE(SUBTRACT(METRIC(Total Debt), METRIC(Unrestricted Cash)), METRIC(Consolidated EBITDA))";

  if (!args.boundSnapshot) {
    return {
      status: "NOT_BOUND",
      computedRatio: null,
      formula,
      components: {
        ebitdaKey: null,
        ebitdaDisplay: null,
        debtKey: null,
        debtDisplay: null,
        cashKey: null,
        cashDisplay: null,
      },
      reportedRatioDisplay: null,
      missingInputs: ["cutoff_bound_APPROVED_snapshot"],
      evidence: ["No cutoff-bound APPROVED snapshot — leverage IR not evaluated."],
      calculationSteps: [],
      capacitySeparationNote,
      runtimeStatus: null,
    };
  }

  const snap = args.boundSnapshot;
  const ebitda = findMoney(snap, EBITDA_KEYS);
  const debt = findMoney(snap, DEBT_KEYS);
  const cash = findMoney(snap, CASH_KEYS);
  const reported = snap.inputs.find((i) => i.identity.key === "Total Net Leverage Ratio");

  const missingInputs: string[] = [];
  if (!ebitda) missingInputs.push("Consolidated_EBITDA");
  if (!debt) missingInputs.push("Total_Debt");
  if (!cash) missingInputs.push("Unrestricted_Cash");

  const components = {
    ebitdaKey: ebitda?.identity.key ?? null,
    ebitdaDisplay: moneyDisplay(ebitda),
    debtKey: debt?.identity.key ?? null,
    debtDisplay: moneyDisplay(debt),
    cashKey: cash?.identity.key ?? null,
    cashDisplay: moneyDisplay(cash),
  };

  const evidence: string[] = [
    `Bound snapshot ${snap.snapshotId} asOf ${snap.asOf ?? "—"} period ${snap.reportingPeriod ?? "—"}.`,
    snap.review.approvalRef
      ? `Approval ref ${snap.review.approvalRef} by ${snap.review.reviewedBy ?? "—"}.`
      : "Approval ref absent on bound snapshot.",
  ];
  if (ebitda?.note) evidence.push(`EBITDA note: ${ebitda.note}`);
  if (debt?.note) evidence.push(`Debt note: ${debt.note}`);
  if (cash?.note) evidence.push(`Cash note: ${cash.note}`);

  if (missingInputs.length > 0) {
    return {
      status: "NEEDS_INPUT",
      computedRatio: null,
      formula,
      components,
      reportedRatioDisplay: ratioDisplay(reported),
      missingInputs,
      evidence: [
        ...evidence,
        `Missing MONEY components for IR: ${missingInputs.join(", ")}. Stored ratio (if any) is not substituted as computed leverage.`,
      ],
      calculationSteps: [],
      capacitySeparationNote,
      runtimeStatus: null,
    };
  }

  const companyId = args.companyId;
  const expression: IRExpression = {
    kind: "DIVIDE",
    type: "RATIO",
    numerator: {
      kind: "SUBTRACT",
      type: "MONEY",
      left: metricRef(companyId, debt!.identity.key, "ns4-tnl-debt"),
      right: metricRef(companyId, cash!.identity.key, "ns4-tnl-cash"),
      exprId: "ns4-tnl-net-debt",
    },
    denominator: metricRef(companyId, ebitda!.identity.key, "ns4-tnl-ebitda"),
    exprId: "ns4-tnl-ratio",
  };

  const view = evaluationView(snap);
  const inputs = snapshotInputResolver({
    snapshots: [view],
    companyId,
    instrumentKey: COMPANY_LEVEL_INSTRUMENT,
  });

  const result = evaluateExpression({
    expression,
    inputs,
    context: {
      companyId,
      instrumentKey: COMPANY_LEVEL_INSTRUMENT,
      asOf: snap.asOf ?? undefined,
      unitId: `ns4-tnl:${snap.snapshotId}`,
    },
  });

  const calculationSteps: string[] = [
    `netDebt = ${debt!.identity.key} − ${cash!.identity.key}`,
    `totalNetLeverage = netDebt ÷ ${ebitda!.identity.key}`,
    `runtimeStatus = ${result.status}`,
  ];
  if (result.value?.type === "RATIO") {
    calculationSteps.push(`computedRatio = ${result.value.value}`);
  }
  for (const d of result.diagnostics.slice(0, 6)) {
    calculationSteps.push(`diagnostic: ${d.code} — ${d.message}`);
  }

  if (result.status !== "EXECUTABLE" || result.value?.type !== "RATIO") {
    return {
      status: result.status === "NEEDS_INPUT" ? "NEEDS_INPUT" : result.status === "UNSUPPORTED" ? "UNSUPPORTED" : "ERROR",
      computedRatio: null,
      formula,
      components,
      reportedRatioDisplay: ratioDisplay(reported),
      missingInputs: [
        ...missingInputs,
        ...result.missingInputKeys,
      ],
      evidence: [
        ...evidence,
        `Phase 4A evaluateExpression status=${result.status}; leverage not published as EXECUTABLE.`,
      ],
      calculationSteps,
      capacitySeparationNote,
      runtimeStatus: result.status,
    };
  }

  return {
    status: "EXECUTABLE",
    computedRatio: result.value.value,
    formula,
    components,
    reportedRatioDisplay: ratioDisplay(reported),
    missingInputs: [],
    evidence: [
      ...evidence,
      `IR-computed Total Net Leverage = ${result.value.value} from APPROVED MONEY facts (not the stored certificate ratio row).`,
      ...(result.provenance.sourceCitations.length
        ? [`Source citations: ${result.provenance.sourceCitations.join("; ")}`]
        : []),
      `Inputs used: ${result.provenance.inputsUsed.join(", ") || "—"}`,
    ],
    calculationSteps,
    capacitySeparationNote,
    runtimeStatus: result.status,
  };
}
