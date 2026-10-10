/**
 * Bridge engine capacity metrics into forms consumed by the legacy capacity
 * engine and Position dashboard.
 *
 * Contractual EBITDA is preferred. GAAP EBITDA is never substituted when
 * contractual is absent (returns NOT_COMPUTABLE / missing input).
 * Missing numbers are never invented.
 */

import type { FinancialSnapshotInput } from "@/lib/covenant-engine";
import { projectToLegacySnapshot } from "@/lib/financial-core/solver-adapter";
import { fact, type FinancialState } from "@/lib/financial-core/types";
import type { CapacityMetricName, EngineRunResult } from "./types";

export type CapacityProjection =
  | {
      status: "OK";
      snapshot: FinancialSnapshotInput;
      asOfDate: string;
      authority: "CONTRACTUAL_CERTIFICATE_METRICS";
      warnings: string[];
    }
  | {
      status: "NOT_COMPUTABLE";
      reason: string;
      missingInputs: string[];
      warnings: string[];
    };

function valueOf(run: EngineRunResult, name: CapacityMetricName): number | undefined {
  return run.capacityMetrics.find((m) => m.metricName === name)?.value;
}

const REQUIRED_FOR_CAPACITY: CapacityMetricName[] = [
  "covenant_ebitda",
  "cash",
  "total_debt",
  "secured_debt",
  "interest_expense",
  "cumulative_net_income",
  "equity_proceeds",
  "assumed_new_debt_rate_pct",
];

/**
 * Strict projection from an engine run to FinancialSnapshotInput.
 * Requires contractual EBITDA and the full 8-field capacity set — never
 * fills gaps from GAAP or invents zeros.
 */
export function projectEngineRunToCapacitySnapshotStrict(run: EngineRunResult): CapacityProjection {
  const warnings: string[] = [];
  const missing: string[] = [];

  if (run.reconciliation.disposition === "BLOCKED") {
    return {
      status: "NOT_COMPUTABLE",
      reason: run.reconciliation.dispositionReason,
      missingInputs: run.reconciliation.missingInputKeys,
      warnings,
    };
  }

  for (const key of REQUIRED_FOR_CAPACITY) {
    if (valueOf(run, key) === undefined) missing.push(key);
  }

  if (missing.includes("covenant_ebitda")) {
    warnings.push("GAAP/reported EBITDA is not used as a substitute for contractual EBITDA.");
  }
  if (run.contractualEbitdaDistinctFromGaap) {
    warnings.push("Contractual EBITDA differs from GAAP EBITDA; capacity uses contractual only.");
  }
  if (run.reconciliation.disposition === "REVIEW_REQUIRED") {
    warnings.push("Reconciliation disposition is REVIEW_REQUIRED — figures are not auto-approved.");
  }

  if (missing.length > 0) {
    return {
      status: "NOT_COMPUTABLE",
      reason: `Missing capacity inputs (not invented): ${missing.join(", ")}.`,
      missingInputs: missing,
      warnings,
    };
  }

  const asOfDate = run.reconciliation.asOfDate;
  if (!asOfDate) {
    return {
      status: "NOT_COMPUTABLE",
      reason: "No as-of date on reconciliation report.",
      missingInputs: ["fiscalDate"],
      warnings,
    };
  }

  const totalAssets =
    run.statement?.metrics.find((m) => m.family === "TOTAL_ASSETS")?.canonicalValue ??
    run.certificate?.metrics.find((m) => m.family === "TOTAL_ASSETS")?.canonicalValue;

  return {
    status: "OK",
    asOfDate,
    authority: "CONTRACTUAL_CERTIFICATE_METRICS",
    warnings,
    snapshot: {
      ebitda: valueOf(run, "covenant_ebitda")!,
      cash: valueOf(run, "cash")!,
      interestExpense: valueOf(run, "interest_expense")!,
      cumulativeNetIncome: valueOf(run, "cumulative_net_income")!,
      equityProceedsSinceIssue: valueOf(run, "equity_proceeds")!,
      assumedNewDebtRatePct: valueOf(run, "assumed_new_debt_rate_pct")!,
      totalDebt: valueOf(run, "total_debt")!,
      securedDebt: valueOf(run, "secured_debt")!,
      ...(totalAssets !== undefined ? { totalAssets } : {}),
    },
  };
}

/** Alias — only the strict, non-inventing path is exported. */
export const projectEngineRunToCapacitySnapshot = projectEngineRunToCapacitySnapshotStrict;

/** Build a FinancialState preferring contractual EBITDA; GAAP stored separately when present. */
export function buildFinancialStateFromEngineRun(
  run: EngineRunResult,
  ids: { stateId: string; companyId: string },
): { status: "OK"; state: FinancialState } | { status: "NOT_COMPUTABLE"; reason: string } {
  const projected = projectEngineRunToCapacitySnapshotStrict(run);
  if (projected.status !== "OK") {
    return { status: "NOT_COMPUTABLE", reason: projected.reason };
  }

  const asOf = new Date(projected.asOfDate);
  const gaap = run.statement?.metrics.find((m) => m.family === "GAAP_EBITDA");
  const snap = projected.snapshot;

  const totalAssetsMetric =
    run.statement?.metrics.find((m) => m.family === "TOTAL_ASSETS") ??
    run.certificate?.metrics.find((m) => m.family === "TOTAL_ASSETS");

  const state: FinancialState = {
    id: ids.stateId,
    companyId: ids.companyId,
    asOfDate: asOf,
    periodType: "ACTUAL",
    scope: { kind: "CONSOLIDATED" },
    effectiveFrom: null,
    effectiveTo: null,
    balanceSheetFacts: {
      cash: fact(snap.cash, "EXTERNAL_CERTIFICATE", asOf),
      totalDebtPrincipal: fact(snap.totalDebt, "EXTERNAL_CERTIFICATE", asOf),
      securedDebtPrincipal: fact(snap.securedDebt, "EXTERNAL_CERTIFICATE", asOf),
      ...(totalAssetsMetric
        ? { totalAssets: fact(totalAssetsMetric.canonicalValue, "EXTERNAL_CERTIFICATE", asOf) }
        : {}),
    },
    incomeStatementFacts: {
      ...(gaap
        ? { gaapEbitda: fact(gaap.canonicalValue, "REPORTED", asOf) }
        : {}),
      cumulativeNetIncomeSinceIssue: fact(snap.cumulativeNetIncome, "EXTERNAL_CERTIFICATE", asOf),
      equityProceedsSinceIssue: fact(snap.equityProceedsSinceIssue, "EXTERNAL_CERTIFICATE", asOf),
      interestExpense: fact(snap.interestExpense, "EXTERNAL_CERTIFICATE", asOf),
    },
    covenantMetricFacts: {
      assumedNewDebtRatePct: fact(snap.assumedNewDebtRatePct, "EXTERNAL_CERTIFICATE", asOf),
      covenantEbitda: {
        value: snap.ebitda,
        addbacks: (run.certificate?.adjustments ?? [])
          .filter((a) => a.kind === "ADDBACK" && a.amountMillions != null)
          .map((a) => ({
            label: a.label,
            amount: a.amountMillions!,
            provenance: fact(a.amountMillions!, "EXTERNAL_CERTIFICATE", asOf),
          })),
        provenance: fact(snap.ebitda, "EXTERNAL_CERTIFICATE", asOf),
      },
    },
    notes: "Built by financial-certificate-engine; contractual EBITDA bound for capacity.",
  };

  const boundary = projectToLegacySnapshot(state);
  if (boundary.status !== "OK") {
    return { status: "NOT_COMPUTABLE", reason: boundary.reason };
  }
  // Ensure solver boundary ebitda is the contractual figure.
  if (boundary.snapshot.ebitda !== snap.ebitda) {
    return {
      status: "NOT_COMPUTABLE",
      reason: "Solver boundary projected a different EBITDA than contractual certificate metrics.",
    };
  }

  return { status: "OK", state };
}

/** Leverage inputs for Position dashboard — contractual EBITDA only. */
export function positionLeverageInputsFromEngine(run: EngineRunResult): {
  status: "OK" | "NOT_COMPUTABLE";
  totalNetLeverage: number | null;
  contractualEbitda: number | null;
  totalDebt: number | null;
  cash: number | null;
  reason?: string;
} {
  const ebitda = valueOf(run, "covenant_ebitda");
  const totalDebt = valueOf(run, "total_debt");
  const cash = valueOf(run, "cash");
  if (ebitda === undefined || totalDebt === undefined || cash === undefined || ebitda === 0) {
    return {
      status: "NOT_COMPUTABLE",
      totalNetLeverage: null,
      contractualEbitda: ebitda ?? null,
      totalDebt: totalDebt ?? null,
      cash: cash ?? null,
      reason: "Missing contractual EBITDA, total debt, or cash — not invented.",
    };
  }
  return {
    status: "OK",
    totalNetLeverage: (totalDebt - cash) / ebitda,
    contractualEbitda: ebitda,
    totalDebt,
    cash,
  };
}
