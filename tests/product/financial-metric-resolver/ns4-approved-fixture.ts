/**
 * TEST-ONLY NS-4 APPROVED snapshot builders.
 *
 * Not exported from lib/product/financial-metric-resolver. Synthetic approval
 * shapes for CI — never production authority activation.
 */

import type { FinancialInput, FinancialSnapshot } from "@/lib/contract-model/north-star-bridge";
import { rationalFromString } from "@/lib/contract-model/north-star-bridge";
import type { RegisteredFinancialPackage } from "@/lib/product/financial-metric-resolver";

export function moneyInput(
  pkg: RegisteredFinancialPackage,
  key: string,
  millions: number,
  opts?: {
    sourceVersion?: string | null;
    currency?: string;
    valueType?: "MONEY" | "NUMBER";
    period?: string;
    asOf?: string;
  },
): FinancialInput {
  const dollars = String(Math.round(millions * 1_000_000));
  const currency = opts?.currency ?? "USD";
  const valueType = opts?.valueType ?? "MONEY";
  const period = opts?.period ?? pkg.measurementPeriod;
  const asOf = opts?.asOf ?? pkg.asOf;
  const sourceVersion = opts?.sourceVersion === undefined ? "test-fixture-v1" : opts.sourceVersion;

  return {
    identity: {
      companyId: pkg.companyId,
      scope: { kind: "INSTRUMENT_LEVEL", instrumentKey: pkg.instrumentKey },
      inputKind: "METRIC",
      key,
      identityStrength: "STABLE_KEY",
      period: { kind: "VERBATIM_CONTRACT_PERIOD_KEY", key: period },
      asOf: { kind: "EXACT_DATE", isoDate: asOf },
      valueType,
      currency,
    },
    value:
      valueType === "MONEY"
        ? {
            type: "MONEY",
            amount: rationalFromString(dollars),
            currency,
            lineage: { exprId: null, inputKeys: [key], rawSource: millions },
          }
        : {
            type: "NUMBER",
            value: rationalFromString(String(millions)),
            lineage: { exprId: null, inputKeys: [key], rawSource: millions },
          },
    displayName: key,
    sourceVersion,
    note: "TEST_ONLY NS-4 fixture — not customer APPROVED evidence",
  };
}

/** Full five-metric APPROVED snapshot matching package figures (happy path). */
export function makeTestApprovedNs4SnapshotForPackage(
  pkg: RegisteredFinancialPackage,
  overrides: Partial<FinancialSnapshot> = {},
  valueOverrides?: Partial<{
    ebitda: number;
    totalDebt: number;
    securedDebt: number;
    cash: number;
    interestExpense: number;
  }>,
): FinancialSnapshot {
  const ebitda = valueOverrides?.ebitda ?? pkg.ebitdaEvidence.bindingContractualEbitdaMillions;
  const totalDebt = valueOverrides?.totalDebt ?? pkg.totalDebt;
  const securedDebt = valueOverrides?.securedDebt ?? pkg.securedDebt;
  const cash = valueOverrides?.cash ?? pkg.cash;
  const interestExpense = valueOverrides?.interestExpense ?? pkg.interestExpense;

  return {
    snapshotId: `test-ns4-${pkg.packageKey.replace(/[^a-z0-9]+/gi, "-")}`,
    version: "test-v1",
    companyId: pkg.companyId,
    asOf: pkg.asOf,
    reportingPeriod: pkg.measurementPeriod,
    status: "APPROVED",
    supersedesSnapshotId: null,
    inputs: [
      moneyInput(pkg, "Consolidated EBITDA", ebitda),
      moneyInput(pkg, "Consolidated Total Debt", totalDebt),
      moneyInput(pkg, "Consolidated Secured Debt", securedDebt),
      moneyInput(pkg, "Unrestricted Cash", cash),
      moneyInput(pkg, "Consolidated Interest Expense", interestExpense),
    ],
    provenance: {
      source: "TEST_ONLY_ns4_approved_fixture",
      sourceVersion: "test-v1",
      note: "Synthetic approval for unit tests — not production reviewer evidence",
    },
    review: {
      reviewedBy: "test-reviewer@test.local",
      reviewedAt: `${pkg.asOf}T12:00:00.000Z`,
      approvalRef: "test-approval-ref-001",
    },
    ...overrides,
  };
}
