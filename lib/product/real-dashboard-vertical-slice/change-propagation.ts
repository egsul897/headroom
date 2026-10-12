/**
 * Deterministic change propagation for the authentic vertical slice.
 *
 * Hypothetical financial overrides and hypothetical transactions never mutate
 * the authentic fixture ledger or any database.
 */

import type { FinancialSnapshotInput } from "@/lib/covenant-engine";
import {
  evaluateMatthewsVerticalSlice,
  type VerticalSliceEvaluation,
} from "./evaluate-covenants";

export interface CapacityDeltaRow {
  code: string;
  baselineModeledMm: number | null;
  changedModeledMm: number | null;
  deltaMm: number | null;
}

export interface ChangePropagationResult {
  baseline: VerticalSliceEvaluation;
  afterFinancialChange: VerticalSliceEvaluation;
  afterHypotheticalTransaction: VerticalSliceEvaluation;
  financialChange: {
    field: keyof FinancialSnapshotInput;
    from: number;
    to: number;
  };
  hypotheticalTransaction: {
    kind: "SECURED_DEBT_INCURRENCE";
    amountMm: number;
    mutatesLedger: false;
    note: string;
  };
  financialDeltas: CapacityDeltaRow[];
  transactionDeltas: CapacityDeltaRow[];
}

function deltas(a: VerticalSliceEvaluation, b: VerticalSliceEvaluation): CapacityDeltaRow[] {
  return a.covenants.map((c) => {
    const other = b.covenants.find((x) => x.code === c.code);
    const before = c.modeledCapacityMm;
    const after = other?.modeledCapacityMm ?? null;
    return {
      code: c.code,
      baselineModeledMm: before,
      changedModeledMm: after,
      deltaMm: before != null && after != null ? after - before : null,
    };
  });
}

/**
 * Change one supported financial input (EBITDA) and one hypothetical secured
 * debt incurrence. Both recompute through evaluateMatthewsVerticalSlice with
 * overrides — authentic fixture bytes are never written.
 */
export function demonstrateChangePropagation(args?: {
  ebitdaOverride?: number;
  hypotheticalSecuredDebtMm?: number;
}): ChangePropagationResult {
  const ebitdaTo = args?.ebitdaOverride ?? 140;
  const hypoDebt = args?.hypotheticalSecuredDebtMm ?? 50;

  const baseline = evaluateMatthewsVerticalSlice();
  const afterFinancialChange = evaluateMatthewsVerticalSlice({ ebitda: ebitdaTo });

  // Hypothetical secured debt: bump securedDebt + totalDebt + interest for coverage.
  // Does not touch utilization events / ledger.
  const afterHypotheticalTransaction = evaluateMatthewsVerticalSlice({
    securedDebt: baseline.financials.securedDebt + hypoDebt,
    totalDebt: baseline.financials.totalDebt + hypoDebt,
    interestExpense:
      baseline.financials.interestExpense +
      hypoDebt * (baseline.financials.assumedNewDebtRatePct / 100),
  });

  return {
    baseline,
    afterFinancialChange,
    afterHypotheticalTransaction,
    financialChange: {
      field: "ebitda",
      from: baseline.financials.ebitda,
      to: ebitdaTo,
    },
    hypotheticalTransaction: {
      kind: "SECURED_DEBT_INCURRENCE",
      amountMm: hypoDebt,
      mutatesLedger: false,
      note: "Pro forma override only — authentic utilization fixture and any DB ledger unchanged.",
    },
    financialDeltas: deltas(baseline, afterFinancialChange),
    transactionDeltas: deltas(baseline, afterHypotheticalTransaction),
  };
}
