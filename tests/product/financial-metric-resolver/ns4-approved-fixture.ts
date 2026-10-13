/**
 * TEST-ONLY NS-4 APPROVED snapshot builders.
 *
 * Not exported from lib/product/financial-metric-resolver. Synthetic approval
 * shapes for CI — never production authority activation.
 */

import type { FinancialInput, FinancialSnapshot } from "@/lib/contract-model/north-star-bridge";
import { rationalFromString } from "@/lib/contract-model/north-star-bridge";
import type { RegisteredFinancialPackage } from "@/lib/product/financial-metric-resolver";

function moneyInput(
  pkg: RegisteredFinancialPackage,
  key: string,
  millions: number,
): FinancialInput {
  const dollars = String(Math.round(millions * 1_000_000));
  return {
    identity: {
      companyId: pkg.companyId,
      scope: { kind: "INSTRUMENT_LEVEL", instrumentKey: pkg.instrumentKey },
      inputKind: "METRIC",
      key,
      identityStrength: "STABLE_KEY",
      period: { kind: "VERBATIM_CONTRACT_PERIOD_KEY", key: pkg.measurementPeriod },
      asOf: { kind: "EXACT_DATE", isoDate: pkg.asOf },
      valueType: "MONEY",
      currency: "USD",
    },
    value: {
      type: "MONEY",
      amount: rationalFromString(dollars),
      currency: "USD",
      lineage: { exprId: null, inputKeys: [key], rawSource: millions },
    },
    displayName: key,
    sourceVersion: "test-fixture",
    note: "TEST_ONLY NS-4 fixture — not customer APPROVED evidence",
  };
}

/** Well-formed APPROVED snapshot matching package identity (test-attributed reviewer). */
export function makeTestApprovedNs4SnapshotForPackage(
  pkg: RegisteredFinancialPackage,
  overrides: Partial<FinancialSnapshot> = {},
): FinancialSnapshot {
  return {
    snapshotId: `test-ns4-${pkg.packageKey.replace(/[^a-z0-9]+/gi, "-")}`,
    version: "test-v1",
    companyId: pkg.companyId,
    asOf: pkg.asOf,
    reportingPeriod: pkg.measurementPeriod,
    status: "APPROVED",
    supersedesSnapshotId: null,
    inputs: [
      moneyInput(pkg, "Consolidated EBITDA", pkg.ebitdaEvidence.bindingContractualEbitdaMillions),
      moneyInput(pkg, "Consolidated Total Debt", pkg.totalDebt),
      moneyInput(pkg, "Unrestricted Cash", pkg.cash),
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
